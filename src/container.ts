import { isAllDependency } from "./all";
import type { AnyBinding, BindingDependencies } from "./bind";
import { getBindingDependencies, getBindingLifetime, isBinding } from "./bind";
import type { DependencyMap } from "./dependencies";
import {
    addDependencyInstance,
    addParentDependencyTracker,
    addRefDependencyFrame,
    createDependencyTracker,
} from "./dependency-tracker";
import { disposeScope } from "./disposal";
import { assertDisposeOption } from "./dispose-option";
import type { BindingScopes, BindingTokens, ResolveBindingContextInScopes, SameTokenKey } from "./graph";
import type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicTokenArray,
    ExportedBinding,
    ModuleBindingInput,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ScopeTokenCompatibilityError,
} from "./module";
import { isComposedModuleDefinition, isExportedBinding, unwrapModuleBinding } from "./module";
import { isOptionalDependency } from "./optional";
import type { AnyBindingOverride, BindingOverride, BindingOverrideAll, BindingUnbind } from "./override";
import { isBindingOverride, isBindingOverrideAll, isBindingUnbind } from "./override";
import type { AnyRefToken, DependencyReference, Ref } from "./ref";
import { isRefDependency } from "./ref";
import {
    type AssertTokenIsInTokenList,
    assertScopeIsActive,
    canUseCachedInstance,
    createResolutionFrame,
    createRuntimeBindingId,
    createRuntimeScope,
    defaultModuleContextId,
    findBinding,
    findBindings,
    findResolutionFrameIndex,
    findTrackedInstance,
    getCurrentResolutionContext,
    getInstanceCache,
    getRuntimeBindingCacheKey,
    getRuntimeRefCacheKey,
    isSameResolutionFrame,
    publicModuleContextId,
    type RefResolver,
    type RegisterToken,
    type ResolveOptions,
    type RuntimeBinding,
    type RuntimeDependencyTracker,
    type RuntimeFactory,
    type RuntimeModuleGraph,
    type RuntimeRefInstance,
    type RuntimeResolutionFrame,
    type RuntimeResolutionResult,
    type RuntimeScope,
    trackOwnedInstance,
    trackResolvedInstance,
} from "./runtime";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    IsMultiToken,
    TokenArrayTokens,
    TokenByKey,
    TokenKey,
    TokensNotIn,
    TokenValue,
} from "./token";
import { isRuntimeMultiToken, tokenKey } from "./token";
import type { HasTrue, IfNever, IsUnion } from "./type-utils";
import type {
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromToken,
    ValidateBindings,
    ValidateGraphBindings,
    ValidateScopeBindings,
    ValidateTokenList,
} from "./validation";

type RuntimeContainer = {
    resolve<TToken extends AnyToken>(token: TToken): TokenValue<TToken>;
    resolveAll<TToken extends AnyToken>(token: TToken): Array<TokenValue<TToken>>;
    createScope(...bindings: readonly AnyBinding[]): RuntimeContainer;
    runScoped<TResult>(
        bindings: readonly AnyBinding[],
        callback: (scope: RuntimeContainer) => TResult,
    ): Promise<Awaited<TResult>>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type VisibleTokensInScopes<TScopes extends BindingScopes> = Extract<BindingTokens<TScopes[number]>, AnySingleToken>;

type MultiTokensInTokenList<TTokenArray extends AnyTokenArray> = Extract<TTokenArray[number], AnyMultiToken>;

type ResolvableTokenInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TToken extends AnyToken
    ? IfNever<MissingDependencyKeysFromToken<TScopes, TToken>, TToken, never>
    : never;

type ResolvableTokensInScopes<TScopes extends BindingScopes> = ResolvableTokenInScopes<
    TScopes,
    VisibleTokensInScopes<TScopes>
>;

type ResolveFn<
    TScopes extends BindingScopes,
    TResolvableTokens extends AnyToken = ResolvableTokensInScopes<TScopes>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => TokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ResolvableMultiTokenInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyMultiToken,
> = TToken extends AnyMultiToken
    ? IfNever<MissingDependencyKeysFromAllTokenBindings<TScopes, TToken>, TToken, never>
    : never;

type ResolvableMultiTokensInScopes<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
> = ResolvableMultiTokenInScopes<TScopes, MultiTokensInTokenList<TTokenArray>>;

type ResolveAllFn<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
    TResolvableTokens extends AnyMultiToken = ResolvableMultiTokensInScopes<TScopes, TTokenArray>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never[],
    <TToken extends TResolvableTokens>(token: TToken) => Array<TokenValue<TokenByKey<TToken, TResolvableTokens>>>
>;

type AppendBindingToLastScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? readonly [...TRemainingScopes, readonly [...TCurrentScope, TBinding]]
    : readonly [readonly [TBinding]];

type AppendInferredBindingScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = IfNever<
    IsMultiToken<TBinding["token"]> extends true ? never : ResolveBindingContextInScopes<TScopes, TBinding["token"]>,
    AppendBindingToLastScope<TScopes, TBinding>,
    readonly [...TScopes, readonly [TBinding]]
>;

type InferBindingScopes<
    TBindings extends readonly AnyBinding[],
    TScopes extends BindingScopes = readonly [],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? InferBindingScopes<TRemainingBindings, AppendInferredBindingScope<TScopes, TCurrentBinding>>
    : TScopes extends readonly []
      ? readonly [readonly []]
      : TScopes;

type CreateScopeFn<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> = <const TScopeBindings extends readonly AnyBinding[]>(
    ...bindings: TScopeBindings & ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>
) => Container<readonly [...TBindings, ...TScopeBindings], TTokenArray, readonly [...TScopes, TScopeBindings]>;

type RunScopedFn<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> = <const TScopeBindings extends readonly AnyBinding[], TResult>(
    bindings: readonly [...TScopeBindings] & Readonly<ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>>,
    callback: (
        scope: Container<
            readonly [...TBindings, ...TScopeBindings],
            TTokenArray,
            readonly [...TScopes, TScopeBindings]
        >,
    ) => TResult,
) => Promise<Awaited<TResult>>;

type BindingTokenArray<TBindings extends readonly AnyBinding[]> = readonly BindingTokens<TBindings>[];

type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

type SingleOverrideTokens<TOverrides extends readonly AnyBindingOverride[]> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverride<infer TBinding>
        ? TBinding["token"]
        : TOverride extends BindingUnbind<infer TToken>
          ? TToken
          : never
    : never;

type MultiOverrideTokens<TOverrides extends readonly AnyBindingOverride[]> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverrideAll<infer TToken>
        ? TToken
        : never
    : never;

type BindingIsOverridden<TBinding extends AnyBinding, TOverrides extends readonly AnyBindingOverride[]> =
    IsMultiToken<TBinding["token"]> extends true
        ? HasTokenWithSameKey<MultiOverrideTokens<TOverrides>, TBinding["token"]>
        : HasTokenWithSameKey<SingleOverrideTokens<TOverrides>, TBinding["token"]>;

type RemoveOverriddenBindings<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends AnyBinding[],
]
    ? BindingIsOverridden<TCurrentBinding, TOverrides> extends true
        ? RemoveOverriddenBindings<TRemainingBindings, TOverrides>
        : readonly [TCurrentBinding, ...RemoveOverriddenBindings<TRemainingBindings, TOverrides>]
    : readonly [];

type SingleOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = TOverrides extends readonly [
    infer TCurrentOverride extends AnyBindingOverride,
    ...infer TRemainingOverrides extends AnyBindingOverride[],
]
    ? TCurrentOverride extends BindingOverride<infer TBinding>
        ? readonly [TBinding, ...SingleOverrideBindings<TRemainingOverrides>]
        : SingleOverrideBindings<TRemainingOverrides>
    : readonly [];

type MultiOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = TOverrides extends readonly [
    infer TCurrentOverride extends AnyBindingOverride,
    ...infer TRemainingOverrides extends AnyBindingOverride[],
]
    ? TCurrentOverride extends BindingOverrideAll<AnyMultiToken, infer TBindings>
        ? readonly [...TBindings, ...MultiOverrideBindings<TRemainingOverrides>]
        : MultiOverrideBindings<TRemainingOverrides>
    : readonly [];

type ApplyContainerOverrides<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
> = readonly [
    ...RemoveOverriddenBindings<TBindings, TOverrides>,
    ...SingleOverrideBindings<TOverrides>,
    ...MultiOverrideBindings<TOverrides>,
];

type ApplyContainerOverrideBindings<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
    TOverrideBindings extends readonly AnyBinding[],
> = readonly [...RemoveOverriddenBindings<TBindings, TOverrides>, ...TOverrideBindings];

type OverrideOperationToken<TOverride extends AnyBindingOverride> =
    TOverride extends BindingOverride<infer TBinding>
        ? TBinding["token"]
        : TOverride extends BindingOverrideAll<infer TToken>
          ? TToken
          : TOverride extends BindingUnbind<infer TToken>
            ? TToken
            : never;

type OverrideOperationTokens<TOverrides extends readonly AnyBindingOverride[]> =
    TOverrides[number] extends infer TOverride extends AnyBindingOverride ? OverrideOperationToken<TOverride> : never;

type DuplicateOverrideTokenKeys<
    TOverrides extends readonly AnyBindingOverride[],
    TSeenTokens extends AnyToken = never,
> = number extends TOverrides["length"]
    ? never
    : TOverrides extends readonly [
            infer TCurrentOverride extends AnyBindingOverride,
            ...infer TRemainingOverrides extends readonly AnyBindingOverride[],
        ]
      ? OverrideOperationToken<TCurrentOverride> extends infer TCurrentToken extends AnyToken
          ? HasTokenWithSameKey<TSeenTokens, TCurrentToken> extends true
              ? TokenKey<TCurrentToken> | DuplicateOverrideTokenKeys<TRemainingOverrides, TSeenTokens>
              : DuplicateOverrideTokenKeys<TRemainingOverrides, TSeenTokens | TCurrentToken>
          : never
      : never;

type UnionOverrideTokenKeys<TOverrides extends readonly AnyBindingOverride[]> = number extends TOverrides["length"]
    ? never
    : TOverrides extends readonly [
            infer TCurrentOverride extends AnyBindingOverride,
            ...infer TRemainingOverrides extends readonly AnyBindingOverride[],
        ]
      ? OverrideOperationToken<TCurrentOverride> extends infer TCurrentToken extends AnyToken
          ? IsUnion<TCurrentToken> extends true
              ? TokenKey<TCurrentToken> | UnionOverrideTokenKeys<TRemainingOverrides>
              : UnionOverrideTokenKeys<TRemainingOverrides>
          : never
      : never;

type MissingSingleOverrideTargetKeys<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverride<infer TBinding>
        ? HasTokenWithSameKey<BindingTokens<TBindings>, TBinding["token"]> extends true
            ? never
            : TokenKey<TBinding["token"]>
        : TOverride extends BindingUnbind<infer TToken>
          ? HasTokenWithSameKey<BindingTokens<TBindings>, TToken> extends true
              ? never
              : TokenKey<TToken>
          : never
    : never;

type TupleOverridesError<TOverrides extends readonly AnyBindingOverride[]> = number extends TOverrides["length"]
    ? {
          readonly __overrides_must_be_tuple__: true;
      }
    : {};

type ValidationErrorIf<TCondition extends boolean, TError> = [TCondition] extends [true] ? TError : {};

type ValidationErrorUnlessNever<TValue, TError> = IfNever<TValue, {}, TError>;

type DuplicateOverridesError<TOverrides extends readonly AnyBindingOverride[]> = ValidationErrorUnlessNever<
    DuplicateOverrideTokenKeys<TOverrides>,
    {
        readonly __duplicate_override__: DuplicateOverrideTokenKeys<TOverrides>;
    }
>;

type OverrideTokenKeysOutsideTokenList<
    TOverrides extends readonly AnyBindingOverride[],
    TTokenArray extends AnyTokenArray,
> = TokenKey<TokensNotIn<OverrideOperationTokens<TOverrides>, TokenArrayTokens<TTokenArray>>>;

type OverrideTokensOutsideTokenListError<
    TOverrides extends readonly AnyBindingOverride[],
    TTokenArray extends AnyTokenArray,
> = ValidationErrorUnlessNever<
    OverrideTokenKeysOutsideTokenList<TOverrides, TTokenArray>,
    {
        readonly __override_token_not_in_tokens__: OverrideTokenKeysOutsideTokenList<TOverrides, TTokenArray>;
    }
>;

type UnionOverrideTokenError<TOverrides extends readonly AnyBindingOverride[]> = ValidationErrorUnlessNever<
    UnionOverrideTokenKeys<TOverrides>,
    {
        readonly __union_override_token__: UnionOverrideTokenKeys<TOverrides>;
    }
>;

type MissingSingleOverrideTargetsError<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
> = ValidationErrorUnlessNever<
    MissingSingleOverrideTargetKeys<TOverrides, TBindings>,
    {
        readonly __override_target_not_bound__: MissingSingleOverrideTargetKeys<TOverrides, TBindings>;
    }
>;

type InvalidOverrideGraphError<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
> = IfNever<
    TOverrides[number],
    {},
    ValidationErrorIf<
        TBindings extends ValidateBindings<TBindings, TTokenArray> ? false : true,
        {
            readonly __invalid_overrides__: ValidateBindings<TBindings, TTokenArray>;
        }
    >
>;

type ValidateContainerOverrides<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TResolvedBindings extends readonly AnyBinding[] = ApplyContainerOverrides<TBindings, TOverrides>,
> = TupleOverridesError<TOverrides> &
    UnionOverrideTokenError<TOverrides> &
    DuplicateOverridesError<TOverrides> &
    OverrideTokensOutsideTokenListError<TOverrides, TTokenArray> &
    MissingSingleOverrideTargetsError<TOverrides, TBindings> &
    InvalidOverrideGraphError<TOverrides, TResolvedBindings, TTokenArray>;

type CreateDefinitionContainerFn<TBindings extends readonly AnyBinding[], TTokenArray extends AnyTokenArray> = <
    const TOverrides extends readonly AnyBindingOverride[],
>(
    ...overrides: TOverrides & ValidateContainerOverrides<TOverrides, TBindings, TTokenArray>
) => Container<
    ApplyContainerOverrides<TBindings, TOverrides>,
    TTokenArray,
    readonly [ApplyContainerOverrides<TBindings, TOverrides>]
>;

export type ContainerDefinition<
    TBindings extends readonly AnyBinding[] = [],
    TTokenArray extends AnyTokenArray = BindingTokenArray<TBindings>,
> = {
    create: CreateDefinitionContainerFn<TBindings, TTokenArray>;
};

export type Container<
    TBindings extends readonly AnyBinding[] = [],
    TTokenArray extends AnyTokenArray = BindingTokenArray<TBindings>,
    TScopes extends BindingScopes = InferBindingScopes<TBindings>,
> = {
    resolve: ResolveFn<TScopes>;
    resolveAll: ResolveAllFn<TScopes, TTokenArray>;
    createScope: CreateScopeFn<TBindings, TTokenArray, TScopes>;
    runScoped: RunScopedFn<TBindings, TTokenArray, TScopes>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type ModulePublicScopes<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = readonly [TPublicBindings, ...TScopeBindings];

type ModuleVisiblePublicBindings<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = BindingTokens<TPublicBindings | TScopeBindings[number]>;

type ModuleResolvableTokenInScopes<
    TModuleScopes extends BindingScopes,
    TToken extends AnyToken,
> = TToken extends AnyToken ? IfNever<MissingDependencyKeysFromToken<TModuleScopes, TToken>, TToken, never> : never;

type ModuleResolveFn<
    TModuleScopes extends BindingScopes,
    TPublicTokenArray extends AnyTokenArray,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
    TResolvableTokens extends AnyToken = ModuleResolvableTokenInScopes<
        TModuleScopes,
        Extract<
            TPublicTokenArray[number] | ModuleVisiblePublicBindings<TPublicBindings, TScopeBindings>,
            AnySingleToken
        >
    >,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => TokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ModulePublicMultiTokens<TPublicTokenArray extends AnyTokenArray, TScopeBindings extends BindingScopes> = Extract<
    TPublicTokenArray[number] | BindingTokens<TScopeBindings[number]>,
    AnyMultiToken
>;

type ModuleResolvableMultiTokenInScopes<
    TModuleScopes extends BindingScopes,
    TToken extends AnyMultiToken,
> = TToken extends AnyMultiToken
    ? IfNever<MissingDependencyKeysFromAllTokenBindings<TModuleScopes, TToken>, TToken, never>
    : never;

type ModuleResolveAllFn<
    TModuleScopes extends BindingScopes,
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TResolvableTokens extends AnyMultiToken = ModuleResolvableMultiTokenInScopes<
        TModuleScopes,
        ModulePublicMultiTokens<TPublicTokenArray, TScopeBindings>
    >,
> = IfNever<
    TResolvableTokens,
    (token: never) => never[],
    <TToken extends TResolvableTokens>(token: TToken) => Array<TokenValue<TokenByKey<TToken, TResolvableTokens>>>
>;

type ModuleScopeCompatibilityTokens<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = BindingTokens<
    ModulePublicScopes<TPublicBindings, TScopeBindings>[number] | CompositionLocalBindings<TComposition["modules"]>
>;

type CreateModuleScopeFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TOverrides extends readonly AnyBindingOverride[],
> = <const TNewScopeBindings extends readonly AnyBinding[]>(
    ...bindings: TNewScopeBindings &
        ValidateGraphBindings<
            TNewScopeBindings,
            readonly [
                ...ModulePublicScopes<TPublicBindings, readonly [...TScopeBindings, TNewScopeBindings]>,
                TNewScopeBindings,
            ]
        > &
        ScopeTokenCompatibilityError<
            TNewScopeBindings,
            ModuleScopeCompatibilityTokens<TComposition, TPublicBindings, TScopeBindings>
        >
) => ModuleContainer<
    TComposition,
    TPublicBindings,
    TPublicTokenArray,
    readonly [...TScopeBindings, TNewScopeBindings],
    TOverrides
>;

type RunModuleScopedFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TOverrides extends readonly AnyBindingOverride[],
> = <const TNewScopeBindings extends readonly AnyBinding[], TResult>(
    bindings: readonly [...TNewScopeBindings] &
        Readonly<
            ValidateGraphBindings<
                TNewScopeBindings,
                readonly [
                    ...ModulePublicScopes<TPublicBindings, readonly [...TScopeBindings, TNewScopeBindings]>,
                    TNewScopeBindings,
                ]
            >
        > &
        ScopeTokenCompatibilityError<
            TNewScopeBindings,
            ModuleScopeCompatibilityTokens<TComposition, TPublicBindings, TScopeBindings>
        >,
    callback: (
        scope: ModuleContainer<
            TComposition,
            TPublicBindings,
            TPublicTokenArray,
            readonly [...TScopeBindings, TNewScopeBindings],
            TOverrides
        >,
    ) => TResult,
) => Promise<Awaited<TResult>>;

export type ModuleContainer<
    TComposition extends AnyComposedModuleDefinition = AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
    TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    TScopeBindings extends BindingScopes = readonly [],
    TOverrides extends readonly AnyBindingOverride[] = readonly [],
    TPublicScopes extends BindingScopes = ModulePublicScopes<TPublicBindings, TScopeBindings>,
> = {
    resolve: ModuleResolveFn<TPublicScopes, TPublicTokenArray, TPublicBindings, TScopeBindings>;
    resolveAll: ModuleResolveAllFn<TPublicScopes, TPublicTokenArray, TScopeBindings>;
    createScope: CreateModuleScopeFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    runScoped: RunModuleScopedFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type ModuleOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = readonly [
    ...SingleOverrideBindings<TOverrides>,
    ...MultiOverrideBindings<TOverrides>,
];

type ModuleOverrideInterfaceBindings<TOverrideBindings extends readonly AnyBinding[]> =
    number extends TOverrideBindings["length"]
        ? readonly AnyBinding[]
        : TOverrideBindings extends readonly [
                infer TCurrentBinding extends AnyBinding,
                ...infer TRemainingBindings extends readonly AnyBinding[],
            ]
          ? readonly [
                ModuleExportedInterfaceBinding<TCurrentBinding, BindingDependencies<TCurrentBinding>>,
                ...ModuleOverrideInterfaceBindings<TRemainingBindings>,
            ]
          : readonly [];

type ModulePublicOverrideInterfaceBindings<
    TOverrides extends readonly AnyBindingOverride[],
    TOverrideBindings extends readonly AnyBinding[] = ModuleOverrideBindings<TOverrides>,
> = ModuleOverrideInterfaceBindings<TOverrideBindings>;

type ApplyModulePublicOverrides<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = ApplyContainerOverrideBindings<
    CompositionPublicBindings<TComposition>,
    TOverrides,
    ModulePublicOverrideInterfaceBindings<TOverrides>
>;

type ModuleResolvedPublicInterfaceBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = ApplyModulePublicOverrides<TComposition, TOverrides>;

type ModuleRemainingLocalBindingInput<
    TInput extends ModuleBindingInput,
    TOverrides extends readonly AnyBindingOverride[],
> =
    TInput extends ExportedBinding<infer TBinding>
        ? BindingIsOverridden<TBinding, TOverrides> extends true
            ? never
            : TBinding
        : TInput extends AnyBinding
          ? TInput
          : never;

type ModuleRemainingLocalBindings<
    TInputs extends readonly ModuleBindingInput[],
    TOverrides extends readonly AnyBindingOverride[],
> = number extends TInputs["length"]
    ? readonly ModuleRemainingLocalBindingInput<TInputs[number], TOverrides>[]
    : TInputs extends readonly [
            infer TCurrentInput extends ModuleBindingInput,
            ...infer TRemainingInputs extends readonly ModuleBindingInput[],
        ]
      ? ModuleRemainingLocalBindingInput<TCurrentInput, TOverrides> extends infer TCurrentBinding
          ? IfNever<
                TCurrentBinding,
                ModuleRemainingLocalBindings<TRemainingInputs, TOverrides>,
                readonly [
                    Extract<TCurrentBinding, AnyBinding>,
                    ...ModuleRemainingLocalBindings<TRemainingInputs, TOverrides>,
                ]
            >
          : never
      : readonly [];

type ModuleExportedInputTokens<TInputs extends readonly ModuleBindingInput[]> = TInputs[number] extends infer TInput
    ? TInput extends ExportedBinding<infer TBinding>
        ? TBinding["token"]
        : never
    : never;

type ModuleOverrideInterfaceBindingForToken<
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnyToken,
    TBinding extends AnyBinding = ModuleOverrideBindings<TOverrides>[number],
> = TBinding extends AnyBinding
    ? HasTokenWithSameKey<TToken, TBinding["token"]> extends true
        ? ModuleExportedInterfaceBinding<TBinding, BindingDependencies<TBinding>>
        : never
    : never;

type ModuleImportedOverrideAwareBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnyToken,
    TExcludedModule extends AnyModuleDefinition,
> =
    HasTokenWithSameKey<OverrideOperationTokens<TOverrides>, TToken> extends true
        ? ModuleOverrideInterfaceBindingForToken<TOverrides, TToken>
        : ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule>;

type ModuleImportedOverrideAwareBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
> = readonly ModuleImportedOverrideAwareBindingForToken<TModules, TOverrides, TModule["imports"][number], TModule>[];

type ModuleProviderOverrideInterfaceBindings<
    TModule extends AnyModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = readonly ModuleOverrideInterfaceBindingForToken<TOverrides, ModuleExportedInputTokens<TModule["bindings"]>>[];

type ModuleResolvedLocalScope<
    TModule extends AnyModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = readonly (
    | ModuleRemainingLocalBindings<TModule["bindings"], TOverrides>[number]
    | ModuleProviderOverrideInterfaceBindings<TModule, TOverrides>[number]
)[];

type ModuleResolvedGraphScopes<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> = readonly [
    TResolvedPublicBindings,
    ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides>,
    ModuleResolvedLocalScope<TModule, TOverrides>,
];

type ModuleResolvedVisibleBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> = readonly (
    | TResolvedPublicBindings[number]
    | ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides>[number]
    | ModuleResolvedLocalScope<TModule, TOverrides>[number]
)[];

type InvalidResolvedCompositionModuleBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> = TComposition["modules"][number] extends infer TCurrentModule extends AnyModuleDefinition
    ? ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides> extends ValidateGraphBindings<
          ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
          ModuleResolvedGraphScopes<TCurrentModule, TComposition["modules"], TOverrides, TResolvedPublicBindings>,
          ModuleResolvedVisibleBindings<TCurrentModule, TComposition["modules"], TOverrides, TResolvedPublicBindings>
      >
        ? never
        : ValidateGraphBindings<
              ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
              ModuleResolvedGraphScopes<TCurrentModule, TComposition["modules"], TOverrides, TResolvedPublicBindings>,
              ModuleResolvedVisibleBindings<
                  TCurrentModule,
                  TComposition["modules"],
                  TOverrides,
                  TResolvedPublicBindings
              >
          >
    : never;

type InvalidResolvedPublicModuleBindings<TResolvedPublicBindings extends readonly AnyBinding[]> =
    TResolvedPublicBindings extends ValidateGraphBindings<TResolvedPublicBindings, readonly [TResolvedPublicBindings]>
        ? never
        : ValidateGraphBindings<TResolvedPublicBindings, readonly [TResolvedPublicBindings]>;

type InvalidResolvedModuleBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> =
    | InvalidResolvedPublicModuleBindings<TResolvedPublicBindings>
    | InvalidResolvedCompositionModuleBindings<TComposition, TOverrides, TResolvedPublicBindings>;

type InvalidModuleOverrideBindingsError<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[] = ModuleResolvedPublicInterfaceBindings<
        TComposition,
        TOverrides
    >,
    TOverrideBindings extends readonly AnyBinding[] = ModuleOverrideBindings<TOverrides>,
> = IfNever<
    TOverrideBindings[number],
    {},
    ValidationErrorIf<
        TOverrideBindings extends ValidateGraphBindings<TOverrideBindings, readonly [TResolvedPublicBindings]>
            ? false
            : true,
        {
            readonly __invalid_overrides__: ValidateGraphBindings<
                TOverrideBindings,
                readonly [TResolvedPublicBindings]
            >;
        }
    >
>;

type InvalidModuleResolvedGraphError<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[] = ModuleResolvedPublicInterfaceBindings<
        TComposition,
        TOverrides
    >,
> = IfNever<
    TOverrides[number],
    {},
    ValidationErrorUnlessNever<
        InvalidResolvedModuleBindings<TComposition, TOverrides, TResolvedPublicBindings>,
        {
            readonly __invalid_overrides__: InvalidResolvedModuleBindings<
                TComposition,
                TOverrides,
                TResolvedPublicBindings
            >;
        }
    >
>;

type ValidateModuleContainerOverrides<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
> = TupleOverridesError<TOverrides> &
    UnionOverrideTokenError<TOverrides> &
    DuplicateOverridesError<TOverrides> &
    OverrideTokensOutsideTokenListError<TOverrides, TPublicTokenArray> &
    MissingSingleOverrideTargetsError<TOverrides, TPublicBindings> &
    InvalidModuleOverrideBindingsError<TComposition, TOverrides> &
    InvalidModuleResolvedGraphError<TComposition, TOverrides>;

type CreateModuleDefinitionContainerFn<TComposition extends AnyComposedModuleDefinition> = {
    (): ModuleContainer<
        TComposition,
        CompositionPublicBindings<TComposition>,
        CompositionPublicTokenArray<TComposition>,
        readonly [],
        readonly []
    >;
    <
        const TOverrides extends readonly AnyBindingOverride[],
        TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
        TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    >(
        ...overrides: TOverrides &
            ValidateModuleContainerOverrides<TComposition, TOverrides, TPublicBindings, TPublicTokenArray>
    ): ModuleContainer<
        TComposition,
        ApplyModulePublicOverrides<TComposition, TOverrides>,
        TPublicTokenArray,
        readonly [],
        TOverrides
    >;
};

export type ModuleContainerDefinition<TComposition extends AnyComposedModuleDefinition = AnyComposedModuleDefinition> =
    {
        create: CreateModuleDefinitionContainerFn<TComposition>;
    };

type TokenListContext = {
    readonly assertTokenIsInTokenList: AssertTokenIsInTokenList;
    readonly registerToken: RegisterToken;
};

type MutableTokenListContextOptions = {
    readonly allowUnknownTokens?: boolean;
};

const createTokenListContext = <TTokenArray extends AnyTokenArray>(
    tokens: TTokenArray,
    options?: MutableTokenListContextOptions,
): TokenListContext => {
    const tokenListKeys = new Set<string>();
    const tokenListRuntimeTokens = new Set<string>();

    const registerInitialToken = <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
        const currentRuntimeToken = currentToken as string;
        const currentTokenKey = tokenKey(currentToken);

        if (tokenListKeys.has(currentTokenKey)) {
            throw new Error(`Token "${currentTokenKey}" is already included in the token list`);
        }

        tokenListKeys.add(currentTokenKey);
        tokenListRuntimeTokens.add(currentRuntimeToken);

        return currentTokenKey;
    };

    for (const currentToken of tokens) {
        registerInitialToken(currentToken);
    }

    return {
        assertTokenIsInTokenList: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentRuntimeToken = currentToken as string;
            const currentTokenKey = tokenKey(currentToken);

            if (!tokenListRuntimeTokens.has(currentRuntimeToken)) {
                throw new Error(`Token "${currentTokenKey}" is not included in the token list`);
            }

            return currentTokenKey;
        },
        registerToken: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentRuntimeToken = currentToken as string;
            const currentTokenKey = tokenKey(currentToken);

            if (tokenListRuntimeTokens.has(currentRuntimeToken)) {
                return currentTokenKey;
            }

            if (!options?.allowUnknownTokens) {
                throw new Error(`Token "${currentTokenKey}" is not included in the token list`);
            }

            tokenListKeys.add(currentTokenKey);
            tokenListRuntimeTokens.add(currentRuntimeToken);

            return currentTokenKey;
        },
    };
};

const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken as string);
};

const assertSingleTokenKey = (tokenKey: string, currentToken: AnyToken): void => {
    if (isMultiToken(currentToken)) {
        throw new Error(`Multibind token "${tokenKey}" must be resolved with resolveAll`);
    }
};

const assertMultiTokenKey = (tokenKey: string, currentToken: AnyToken): void => {
    if (!isMultiToken(currentToken)) {
        throw new Error(`Token "${tokenKey}" is not a multibind token`);
    }
};

const formatCircularDependencyPath = (path: readonly string[]): string => {
    return path.join(" -> ");
};

const createCircularDependencyPath = (
    path: readonly RuntimeResolutionFrame[],
    currentFrame: RuntimeResolutionFrame,
): readonly string[] => {
    const cycleStartIndex = findResolutionFrameIndex(path, currentFrame);
    return [...path.slice(cycleStartIndex).map(({ tokenKey }) => tokenKey), currentFrame.tokenKey];
};

const createCircularDependencyError = (action: "registering" | "resolving", path: readonly string[]): Error => {
    return new Error(`Circular dependency detected while ${action} services: ${formatCircularDependencyPath(path)}`);
};

const collectVisibleTokenKeys = (scope: RuntimeScope): Set<string> => {
    const visibleTokenKeys = scope.parent ? collectVisibleTokenKeys(scope.parent) : new Set<string>();

    for (const tokenKey of scope.bindings.keys()) {
        visibleTokenKeys.add(tokenKey);
    }

    return visibleTokenKeys;
};

const assertNoCircularDependencies = (scope: RuntimeScope): void => {
    const visited: RuntimeResolutionFrame[] = [];
    const path: RuntimeResolutionFrame[] = [];
    const moduleContextIds = scope.context.moduleGraph
        ? [publicModuleContextId, ...scope.context.moduleGraph.moduleIds]
        : [defaultModuleContextId];

    const visitBinding = (
        resolutionScope: RuntimeScope,
        currentTokenKey: string,
        resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
        moduleContextId: number,
    ): void => {
        const currentFrame = createResolutionFrame(resolutionScope, currentTokenKey, resolvedBinding, moduleContextId);

        if (visited.some((visitedFrame) => isSameResolutionFrame(visitedFrame, currentFrame))) {
            return;
        }

        if (findResolutionFrameIndex(path, currentFrame) !== -1) {
            throw createCircularDependencyError("registering", createCircularDependencyPath(path, currentFrame));
        }

        path.push(currentFrame);

        try {
            for (const dependency of resolvedBinding.binding.eagerDependencies ?? []) {
                visit(currentFrame.resolutionScope, dependency, resolvedBinding.binding.dependencyModuleContextId);
            }
        } finally {
            path.pop();
            visited.push(currentFrame);
        }
    };

    const visit = (resolutionScope: RuntimeScope, currentTokenKey: string, moduleContextId: number): void => {
        const multibindings = findBindings(resolutionScope, currentTokenKey, moduleContextId, true);

        if (multibindings.length > 0) {
            for (const resolvedBinding of multibindings) {
                visitBinding(resolutionScope, currentTokenKey, resolvedBinding, moduleContextId);
            }

            return;
        }

        const resolvedBinding = findBinding(resolutionScope, currentTokenKey, moduleContextId, false);

        if (resolvedBinding) {
            visitBinding(resolutionScope, currentTokenKey, resolvedBinding, moduleContextId);
        }
    };

    for (const moduleContextId of moduleContextIds) {
        for (const currentTokenKey of collectVisibleTokenKeys(scope)) {
            visit(scope, currentTokenKey, moduleContextId);
        }
    }
};

const getEagerDependencyKeys = (
    dependencies: DependencyMap | undefined,
    tokenListContext: TokenListContext,
): readonly string[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencyKeys: string[] = [];

    for (const dependencyReference of Object.values(dependencies)) {
        const dependency = isOptionalDependency(dependencyReference)
            ? dependencyReference.resolveDependency()
            : dependencyReference;

        if (isRefDependency(dependency)) {
            continue;
        }

        if (isAllDependency(dependency)) {
            const dependencyToken = dependency.resolveToken();
            const dependencyTokenKey = tokenListContext.registerToken(dependencyToken);

            if (!isMultiToken(dependencyToken)) {
                throw new Error(`Token "${dependencyTokenKey}" is not a multibind token`);
            }

            eagerDependencyKeys.push(dependencyTokenKey);
            continue;
        }

        const dependencyTokenKey = tokenListContext.registerToken(dependency);

        if (isMultiToken(dependency)) {
            throw new Error(`Multibind token "${dependencyTokenKey}" must be resolved with resolveAll`);
        }

        eagerDependencyKeys.push(dependencyTokenKey);
    }

    return eagerDependencyKeys;
};

const resolveRefDependency = (
    scope: RuntimeScope,
    dependency: AnyRefToken,
    tokenListContext: TokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    getOrCreateRefInstance: RefResolver,
    moduleContextId: number,
): unknown => {
    const dependencyToken = dependency.resolveToken();
    const dependencyTokenKey = tokenListContext.registerToken(dependencyToken);
    assertSingleTokenKey(dependencyTokenKey, dependencyToken);
    if (dependencyTracker) {
        addRefDependencyFrame(dependencyTracker, scope, dependencyTokenKey, moduleContextId);
    }
    return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
};

const resolveDependencyValue = (
    scope: RuntimeScope,
    dependency: DependencyReference,
    tokenListContext: TokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    getOrCreateRefInstance: RefResolver,
    moduleContextId: number,
): unknown => {
    if (isOptionalDependency(dependency)) {
        return resolveOptionalDependencyValue(
            scope,
            dependency.resolveDependency(),
            tokenListContext,
            dependencyTracker,
            getOrCreateRefInstance,
            moduleContextId,
        );
    }

    if (isRefDependency(dependency)) {
        return resolveRefDependency(
            scope,
            dependency,
            tokenListContext,
            dependencyTracker,
            getOrCreateRefInstance,
            moduleContextId,
        );
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependencyToken);
        assertMultiTokenKey(dependencyTokenKey, dependencyToken);
        return resolveAllActualWithOwnership(
            scope,
            dependencyToken,
            dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
            moduleContextId,
        ).map((dependencyResult) => dependencyResult.value);
    }

    const dependencyResult = resolveActualWithOwnership(
        scope,
        dependency,
        dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
        moduleContextId,
    );
    return dependencyResult.value;
};

const resolveOptionalDependencyValue = (
    scope: RuntimeScope,
    dependency: DependencyReference,
    tokenListContext: TokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    getOrCreateRefInstance: RefResolver,
    moduleContextId: number,
): unknown => {
    if (isOptionalDependency(dependency)) {
        return resolveOptionalDependencyValue(
            scope,
            dependency.resolveDependency(),
            tokenListContext,
            dependencyTracker,
            getOrCreateRefInstance,
            moduleContextId,
        );
    }

    if (isRefDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        const dependencyTokenKey = tokenListContext.registerToken(dependencyToken);
        assertSingleTokenKey(dependencyTokenKey, dependencyToken);

        if (!findBinding(scope, dependencyTokenKey, moduleContextId, false)) {
            return undefined;
        }

        if (dependencyTracker) {
            addRefDependencyFrame(dependencyTracker, scope, dependencyTokenKey, moduleContextId);
        }
        return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependencyToken);
        assertMultiTokenKey(dependencyTokenKey, dependencyToken);

        const resolvedBindings = findBindings(scope, dependencyTokenKey, moduleContextId, true);

        if (resolvedBindings.length === 0) {
            return undefined;
        }

        return resolvedBindings.map((resolvedBinding) => {
            return resolveBindingWithOwnership(
                scope,
                dependencyTokenKey,
                resolvedBinding,
                dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
                moduleContextId,
            ).value;
        });
    }

    const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependency);
    assertSingleTokenKey(dependencyTokenKey, dependency);

    if (!findBinding(scope, dependencyTokenKey, moduleContextId, false)) {
        return undefined;
    }

    return resolveDependencyValue(
        scope,
        dependency,
        tokenListContext,
        dependencyTracker,
        getOrCreateRefInstance,
        moduleContextId,
    );
};

const createDependencyFactory = (
    binding: AnyBinding,
    dependencies: DependencyMap,
    tokenListContext: TokenListContext,
    getOrCreateRefInstance: RefResolver,
    moduleContextId: number,
): RuntimeFactory => {
    return (scope, dependencyTracker) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            const resolvedDependency = isOptionalDependency(dependency)
                ? resolveOptionalDependencyValue(
                      scope,
                      dependency.resolveDependency(),
                      tokenListContext,
                      dependencyTracker,
                      getOrCreateRefInstance,
                      moduleContextId,
                  )
                : resolveDependencyValue(
                      scope,
                      dependency,
                      tokenListContext,
                      dependencyTracker,
                      getOrCreateRefInstance,
                      moduleContextId,
                  );

            Object.defineProperty(resolvedDependencies, key, {
                configurable: true,
                enumerable: true,
                value: resolvedDependency,
                writable: true,
            });
        }

        return (binding.factory as (dependencies: Record<string, unknown>) => unknown)(resolvedDependencies);
    };
};

const createRuntimeBinding = (
    binding: AnyBinding,
    tokenListContext: TokenListContext,
    getOrCreateRefInstance: RefResolver,
    moduleContextId = defaultModuleContextId,
    visibleInAllModuleContexts = true,
    visibleModuleContextIds?: readonly number[],
): RuntimeBinding => {
    const dependencies = getBindingDependencies(binding);
    const eagerDependencies = getEagerDependencyKeys(dependencies, tokenListContext);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, tokenListContext, getOrCreateRefInstance, moduleContextId)
        : () => (binding.factory as () => unknown)();
    const dispose = binding.dispose;

    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        id: createRuntimeBindingId(),
        factory,
        lifetime: getBindingLifetime(binding),
        isMultiToken: isMultiToken(binding.token),
        dependencyModuleContextId: moduleContextId,
        visibleInAllModuleContexts,
        ...(visibleModuleContextIds ? { visibleModuleContextIds } : {}),
        eagerDependencies,
        ...(dispose ? { dispose } : {}),
    };
};

const hasCachedInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): boolean => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKey, moduleContextId, false);

    if (!resolvedBinding) {
        return false;
    }

    const instanceCacheKey = getRuntimeBindingCacheKey(resolvedBinding.binding);

    return (
        canUseCachedInstance(scope, resolvedBinding.ownerScope, options) &&
        (getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope)?.has(instanceCacheKey) ?? false)
    );
};

const shouldTrackResolutionDependencies = (
    binding: RuntimeBinding,
    dependentTrackers: readonly RuntimeDependencyTracker[],
): boolean => {
    return Boolean(binding.dispose) || binding.lifetime !== "transient" || dependentTrackers.length > 0;
};

const addResolutionDependency = (
    dependencyTracker: RuntimeDependencyTracker,
    dependencyResult: RuntimeResolutionResult<unknown>,
): void => {
    if (dependencyResult.ownedInstance) {
        addDependencyInstance(dependencyTracker, dependencyResult.ownedInstance);
        return;
    }

    /* v8 ignore next -- defensive invariant: tracked dependents should only receive tracked dependency results */
    if (!dependencyResult.dependencyTracker) {
        throw new Error("Resolution dependency is missing dependency tracking");
    }

    addParentDependencyTracker(dependencyResult.dependencyTracker, dependencyTracker);
};

const addResolutionDependencies = (
    dependencyTrackers: readonly RuntimeDependencyTracker[],
    dependencyResult: RuntimeResolutionResult<unknown>,
): void => {
    for (const dependencyTracker of dependencyTrackers) {
        addResolutionDependency(dependencyTracker, dependencyResult);
    }
};

const resolveBindingWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentTokenKey: string,
    resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    const dependentTrackers = options?.dependentTrackers ? Array.from(options.dependentTrackers) : [];
    const currentFrame = createResolutionFrame(scope, currentTokenKey, resolvedBinding, moduleContextId);
    const instanceCache = getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope);
    const instanceCacheKey = getRuntimeBindingCacheKey(resolvedBinding.binding);

    if (instanceCache?.has(instanceCacheKey) && canUseCachedInstance(scope, resolvedBinding.ownerScope, options)) {
        const trackedInstance = findTrackedInstance(currentFrame.resolutionScope, currentFrame);

        /* v8 ignore next -- defensive invariant: cached instances are registered with tracking metadata */
        if (!trackedInstance) {
            throw new Error("Cached instance is missing dependency tracking");
        }

        const dependencyResult: RuntimeResolutionResult<TokenValue<TToken>> = {
            value: instanceCache.get(instanceCacheKey) as TokenValue<TToken>,
            ...(trackedInstance.ownedInstance ? { ownedInstance: trackedInstance.ownedInstance } : {}),
            dependencyTracker: trackedInstance.dependencyTracker,
        };

        addResolutionDependencies(dependentTrackers, dependencyResult);
        return dependencyResult;
    }

    assertScopeIsActive(scope);
    assertScopeIsActive(resolvedBinding.ownerScope);

    const cycleStartIndex = findResolutionFrameIndex(scope.context.resolvingPath, currentFrame);

    if (cycleStartIndex !== -1) {
        throw createCircularDependencyError(
            "resolving",
            createCircularDependencyPath(scope.context.resolvingPath, currentFrame),
        );
    }

    scope.context.resolvingPath.push(currentFrame);

    try {
        const dependencyTracker = shouldTrackResolutionDependencies(resolvedBinding.binding, dependentTrackers)
            ? createDependencyTracker()
            : undefined;
        if (dependencyTracker) {
            currentFrame.resolutionScope.dependencyTrackers.push(dependencyTracker);
        }
        const instance = resolvedBinding.binding.factory(currentFrame.resolutionScope, dependencyTracker);
        instanceCache?.set(instanceCacheKey, instance);
        const ownedInstance = dependencyTracker
            ? trackOwnedInstance(
                  currentFrame.resolutionScope,
                  resolvedBinding.binding,
                  currentFrame,
                  dependencyTracker,
                  instance,
              )
            : undefined;

        if (dependencyTracker && instanceCache) {
            trackResolvedInstance(currentFrame.resolutionScope, currentFrame, dependencyTracker, ownedInstance);
        }

        const dependencyResult: RuntimeResolutionResult<TokenValue<TToken>> = dependencyTracker
            ? {
                  value: instance as TokenValue<TToken>,
                  ...(ownedInstance ? { ownedInstance } : {}),
                  dependencyTracker,
              }
            : {
                  value: instance as TokenValue<TToken>,
              };

        addResolutionDependencies(dependentTrackers, dependencyResult);
        return dependencyResult;
    } finally {
        scope.context.resolvingPath.pop();
    }
};

const resolveActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKey, moduleContextId, false);

    if (!resolvedBinding) {
        throw new Error(`Service "${currentTokenKey}" is not registered in the container`);
    }

    return resolveBindingWithOwnership(scope, currentTokenKey, resolvedBinding, options, moduleContextId);
};

const resolveAllActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    moduleContextId = defaultModuleContextId,
): Array<TokenValue<TToken>> => {
    return resolveAllActualWithOwnership(scope, currentToken, undefined, moduleContextId).map(
        (dependencyResult) => dependencyResult.value,
    );
};

const resolveAllActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): Array<RuntimeResolutionResult<TokenValue<TToken>>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertMultiTokenKey(currentTokenKey, currentToken);
    assertScopeIsActive(scope);

    return findBindings(scope, currentTokenKey, moduleContextId, true).map((resolvedBinding) => {
        return resolveBindingWithOwnership<TToken>(scope, currentTokenKey, resolvedBinding, options, moduleContextId);
    });
};

const resolveActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): TokenValue<TToken> => {
    return resolveActualWithOwnership(scope, currentToken, options, moduleContextId).value;
};

const getOrCreateRefInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId = defaultModuleContextId,
): Ref<TokenValue<TToken>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const refCacheKey = getRuntimeRefCacheKey(moduleContextId, currentTokenKey);
    const existingInstance = scope.refInstances.get(refCacheKey);

    if (existingInstance) {
        if (dependencyTracker) {
            existingInstance.dependencyTrackers.add(dependencyTracker);
        }
        return existingInstance.ref as Ref<TokenValue<TToken>>;
    }

    const refInstance: Ref<TokenValue<TToken>> = {
        get value() {
            const resolvedBinding = findBinding(scope, currentTokenKey, moduleContextId, false);
            const isInitializing =
                resolvedBinding &&
                findResolutionFrameIndex(
                    scope.context.resolvingPath,
                    createResolutionFrame(scope, currentTokenKey, resolvedBinding, moduleContextId),
                ) !== -1;

            const resolveOptions = {
                allowCachedDuringDispose: true,
                dependentTrackers: runtimeRefInstance.dependencyTrackers,
            };

            if (!hasCachedInstance(scope, currentToken, resolveOptions, moduleContextId) && isInitializing) {
                const resolutionContext = getCurrentResolutionContext(scope);

                throw new Error(
                    `Ref dependency "${currentTokenKey}" was accessed before it finished initializing while resolving "${resolutionContext}"`,
                );
            }

            return resolveActualWithOwnership(scope, currentToken, resolveOptions, moduleContextId).value;
        },
    };
    const runtimeRefInstance: RuntimeRefInstance = {
        ref: refInstance,
        dependencyTrackers: dependencyTracker ? new Set([dependencyTracker]) : new Set(),
    };

    scope.refInstances.set(refCacheKey, runtimeRefInstance);
    return refInstance;
};

type RegisterBindingsOptions = {
    readonly moduleContextId?: number;
    readonly visibleInAllModuleContexts?: boolean;
    readonly visibleModuleContextIds?: readonly number[];
    readonly allowDuplicateSingleBindings?: boolean;
    readonly validateCircularDependencies?: boolean;
};

const assertNoVisibleTokenKindCollision = (
    scope: RuntimeScope,
    tokenKeyToRegister: string,
    bindingIsMultiToken: boolean,
    moduleContextId: number,
    visibleInAllModuleContexts: boolean,
    visibleModuleContextIds: readonly number[] | undefined,
): void => {
    const moduleGraph = scope.context.moduleGraph;

    if (!moduleGraph) {
        return;
    }

    const moduleContextIds = visibleInAllModuleContexts
        ? [publicModuleContextId, ...moduleGraph.moduleIds]
        : [moduleContextId, ...(visibleModuleContextIds ?? [])];

    for (const currentModuleContextId of new Set(moduleContextIds)) {
        const visibleBindings = findBindings(scope, tokenKeyToRegister, currentModuleContextId);

        if (visibleBindings.some(({ binding }) => binding.isMultiToken !== bindingIsMultiToken)) {
            throw new Error(`Token "${tokenKeyToRegister}" is already included in the token list`);
        }
    }
};

const registerBindings = (
    scope: RuntimeScope,
    bindings: readonly AnyBinding[],
    options?: RegisterBindingsOptions,
): RuntimeBinding[] => {
    assertScopeIsActive(scope);

    const runtimeBindings: RuntimeBinding[] = [];
    const moduleContextId = options?.moduleContextId ?? defaultModuleContextId;
    const visibleInAllModuleContexts = options?.visibleInAllModuleContexts ?? true;
    const visibleModuleContextIds = options?.visibleModuleContextIds;
    const validateCircularDependencies = options?.validateCircularDependencies ?? true;

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        const bindingTokenKey = scope.context.registerToken(binding.token);
        const bindingIsMultiToken = isMultiToken(binding.token);
        const existingBindings = scope.bindings.get(bindingTokenKey);

        assertNoVisibleTokenKindCollision(
            scope,
            bindingTokenKey,
            bindingIsMultiToken,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );

        if (!bindingIsMultiToken && existingBindings && !options?.allowDuplicateSingleBindings) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the container`);
        }

        const runtimeBinding = createRuntimeBinding(
            binding,
            scope.context,
            getOrCreateRefInstance,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );
        runtimeBindings.push(runtimeBinding);

        if (existingBindings) {
            existingBindings.push(runtimeBinding);
        } else {
            scope.bindings.set(bindingTokenKey, [runtimeBinding]);
        }
    }

    if (validateCircularDependencies) {
        assertNoCircularDependencies(scope);
    }

    return runtimeBindings;
};

type RuntimePublicAccess = {
    readonly moduleContextId: number;
    readonly singleTokenKeys: ReadonlySet<string>;
    readonly multiTokenKeys: ReadonlySet<string>;
};

const extendRuntimePublicAccess = (
    scope: RuntimeScope,
    publicAccess: RuntimePublicAccess | undefined,
    bindings: readonly AnyBinding[],
): RuntimePublicAccess | undefined => {
    if (!publicAccess) {
        return undefined;
    }

    const singleTokenKeys = new Set(publicAccess.singleTokenKeys);
    const multiTokenKeys = new Set(publicAccess.multiTokenKeys);

    for (const binding of bindings) {
        const bindingTokenKey = scope.context.assertTokenIsInTokenList(binding.token);

        if (isMultiToken(binding.token)) {
            multiTokenKeys.add(bindingTokenKey);
        } else {
            singleTokenKeys.add(bindingTokenKey);
        }
    }

    return {
        moduleContextId: publicAccess.moduleContextId,
        singleTokenKeys,
        multiTokenKeys,
    };
};

const assertPublicSingleTokenKey = (publicAccess: RuntimePublicAccess | undefined, tokenKey: string): void => {
    if (publicAccess && !publicAccess.singleTokenKeys.has(tokenKey)) {
        throw new Error(`Service "${tokenKey}" is not exported by the module`);
    }
};

const assertPublicMultiTokenKey = (publicAccess: RuntimePublicAccess | undefined, tokenKey: string): void => {
    if (publicAccess && !publicAccess.multiTokenKeys.has(tokenKey)) {
        throw new Error(`Multibind token "${tokenKey}" is not exported by the module`);
    }
};

const collectRunScopedError = (errors: unknown[], error: unknown): void => {
    if (error instanceof AggregateError) {
        errors.push(...error.errors);
        return;
    }

    errors.push(error);
};

const runScopedCallback = async <TResult>(
    scopedContainer: RuntimeContainer,
    callback: (scope: RuntimeContainer) => TResult,
): Promise<Awaited<TResult>> => {
    let callbackResult: Awaited<TResult> | undefined;
    let callbackError: unknown;
    let callbackFailed = false;

    try {
        callbackResult = (await callback(scopedContainer)) as Awaited<TResult>;
    } catch (error) {
        callbackFailed = true;
        callbackError = error;
    }

    try {
        await scopedContainer.dispose();
    } catch (disposeError) {
        if (callbackFailed) {
            const errors: unknown[] = [];

            collectRunScopedError(errors, callbackError);
            collectRunScopedError(errors, disposeError);

            throw new AggregateError(errors, "Scoped callback and dispose failed");
        }

        throw disposeError;
    }

    if (callbackFailed) {
        throw callbackError;
    }

    return callbackResult as Awaited<TResult>;
};

const createRuntimeContainerForScope = (scope: RuntimeScope, publicAccess?: RuntimePublicAccess): RuntimeContainer => {
    const moduleContextId = publicAccess?.moduleContextId ?? defaultModuleContextId;
    const createChildContainer = (bindings: readonly AnyBinding[]): RuntimeContainer => {
        assertScopeIsActive(scope);

        const childScope = createRuntimeScope(scope.context, scope);
        registerBindings(
            childScope,
            bindings,
            publicAccess ? { moduleContextId: publicAccess.moduleContextId } : undefined,
        );
        scope.children.add(childScope);

        return createRuntimeContainerForScope(
            childScope,
            extendRuntimePublicAccess(childScope, publicAccess, bindings),
        );
    };

    return {
        get disposed() {
            return scope.disposed;
        },
        resolve(currentToken) {
            const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
            assertSingleTokenKey(currentTokenKey, currentToken);
            assertPublicSingleTokenKey(publicAccess, currentTokenKey);
            return resolveActual(scope, currentToken, undefined, moduleContextId);
        },
        resolveAll(currentToken) {
            const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
            assertMultiTokenKey(currentTokenKey, currentToken);
            assertPublicMultiTokenKey(publicAccess, currentTokenKey);
            return resolveAllActual(scope, currentToken, moduleContextId);
        },
        createScope(...bindings) {
            return createChildContainer(bindings);
        },
        runScoped(bindings, callback) {
            return runScopedCallback(createChildContainer(bindings), callback);
        },
        dispose() {
            return disposeScope(scope);
        },
    };
};

const createRootScope = (tokenListContext: TokenListContext, moduleGraph?: RuntimeModuleGraph): RuntimeScope => {
    return createRuntimeScope({
        assertTokenIsInTokenList: tokenListContext.assertTokenIsInTokenList,
        registerToken: tokenListContext.registerToken,
        ...(moduleGraph ? { moduleGraph } : {}),
        resolvingPath: [],
    });
};

const collectSingleBindingKeys = (tokenListContext: TokenListContext, bindings: readonly AnyBinding[]): Set<string> => {
    const bindingKeys = new Set<string>();

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        const bindingTokenKey = tokenListContext.assertTokenIsInTokenList(binding.token);

        if (!isMultiToken(binding.token)) {
            bindingKeys.add(bindingTokenKey);
        }
    }

    return bindingKeys;
};

const applyBindingOverrides = (
    tokenListContext: TokenListContext,
    bindings: readonly AnyBinding[],
    overrides: readonly AnyBindingOverride[],
): readonly AnyBinding[] => {
    const singleBindingKeys = collectSingleBindingKeys(tokenListContext, bindings);
    const singleOverrides = new Map<string, AnyBinding>();
    const singleUnbinds = new Set<string>();
    const multiOverrides = new Map<string, readonly AnyBinding[]>();

    for (const currentOverride of overrides) {
        if (isBindingOverride(currentOverride)) {
            const binding = currentOverride.binding;

            if (!isBinding(binding)) {
                throw new Error("Override bindings must be created with bind");
            }

            const bindingTokenKey = tokenListContext.assertTokenIsInTokenList(binding.token);

            if (isMultiToken(binding.token)) {
                throw new Error(`Multibind token "${bindingTokenKey}" must be overridden with overrideAll`);
            }

            if (!singleBindingKeys.has(bindingTokenKey)) {
                throw new Error(`Service "${bindingTokenKey}" is not registered in the container definition`);
            }

            if (singleOverrides.has(bindingTokenKey) || singleUnbinds.has(bindingTokenKey)) {
                throw new Error(`Service "${bindingTokenKey}" is already overridden`);
            }

            singleOverrides.set(bindingTokenKey, binding);
            continue;
        }

        if (isBindingUnbind(currentOverride)) {
            const unbindTokenKey = tokenListContext.assertTokenIsInTokenList(currentOverride.token);

            if (isMultiToken(currentOverride.token)) {
                throw new Error(`Multibind token "${unbindTokenKey}" must be removed with overrideAll`);
            }

            if (!singleBindingKeys.has(unbindTokenKey)) {
                throw new Error(`Service "${unbindTokenKey}" is not registered in the container definition`);
            }

            if (singleOverrides.has(unbindTokenKey) || singleUnbinds.has(unbindTokenKey)) {
                throw new Error(`Service "${unbindTokenKey}" is already overridden`);
            }

            singleUnbinds.add(unbindTokenKey);
            continue;
        }

        if (isBindingOverrideAll(currentOverride)) {
            const overrideTokenKey = tokenListContext.assertTokenIsInTokenList(currentOverride.token);

            if (!isMultiToken(currentOverride.token)) {
                throw new Error(`Token "${overrideTokenKey}" is not a multibind token`);
            }

            if (multiOverrides.has(overrideTokenKey)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is already overridden`);
            }

            if (!Array.isArray(currentOverride.bindings)) {
                throw new Error("overrideAll bindings must be an array");
            }

            for (const binding of currentOverride.bindings) {
                if (!isBinding(binding)) {
                    throw new Error("overrideAll bindings must be created with bind");
                }

                const bindingTokenKey = tokenListContext.assertTokenIsInTokenList(binding.token);

                if (bindingTokenKey !== overrideTokenKey || !isMultiToken(binding.token)) {
                    throw new Error(
                        `overrideAll for "${overrideTokenKey}" only accepts bindings for the same multibind token`,
                    );
                }
            }

            multiOverrides.set(overrideTokenKey, currentOverride.bindings);
            continue;
        }

        throw new Error("Overrides must be created with override, overrideAll, or unbind");
    }

    const resolvedBindings: AnyBinding[] = [];

    for (const binding of bindings) {
        const bindingTokenKey = tokenListContext.assertTokenIsInTokenList(binding.token);

        if (isMultiToken(binding.token)) {
            if (!multiOverrides.has(bindingTokenKey)) {
                resolvedBindings.push(binding);
            }
            continue;
        }

        if (!singleOverrides.has(bindingTokenKey) && !singleUnbinds.has(bindingTokenKey)) {
            resolvedBindings.push(binding);
        }
    }

    resolvedBindings.push(...singleOverrides.values());

    for (const overrideBindings of multiOverrides.values()) {
        resolvedBindings.push(...overrideBindings);
    }

    return resolvedBindings;
};

type RuntimeModuleEntry = {
    readonly moduleId: number;
    readonly binding: AnyBinding;
    readonly exported: boolean;
};

type RuntimeRegisteredModuleEntry = RuntimeModuleEntry & {
    readonly runtimeBinding: RuntimeBinding;
};

type RuntimeRegisteredOverrideEntry = {
    readonly binding: AnyBinding;
    readonly runtimeBinding: RuntimeBinding;
};

type RuntimeModuleOverrideResult = {
    readonly entries: readonly RuntimeModuleEntry[];
    readonly overrideBindings: readonly AnyBinding[];
    readonly publicAccess: RuntimePublicAccess;
    readonly excludedTokenIds: ReadonlySet<string>;
    readonly overrideModuleContextIdsByTokenId: ReadonlyMap<string, ReadonlySet<number>>;
};

const createRuntimeModuleEntries = (modules: readonly AnyModuleDefinition[]): readonly RuntimeModuleEntry[] => {
    const entries: RuntimeModuleEntry[] = [];

    for (const currentModule of modules) {
        for (const moduleBinding of currentModule.bindings) {
            entries.push({
                moduleId: currentModule.id,
                binding: unwrapModuleBinding(moduleBinding),
                exported: isExportedBinding(moduleBinding),
            });
        }
    }

    return entries;
};

const tokenRuntimeId = (currentToken: AnyToken): string => {
    return currentToken as string;
};

const createRuntimeModuleGraph = (
    composition: AnyComposedModuleDefinition,
    entries: readonly RuntimeRegisteredModuleEntry[],
    overrideEntries: readonly RuntimeRegisteredOverrideEntry[],
    excludedTokenIds: ReadonlySet<string>,
    overrideModuleContextIdsByTokenId: ReadonlyMap<string, ReadonlySet<number>>,
): RuntimeModuleGraph => {
    const visibleBindingIdsByModuleId = new Map<number, Set<number>>();
    const exportedEntries = entries.filter((entry) => entry.exported);

    const addVisibleProviders = (
        visibleBindingIds: Set<number>,
        currentToken: AnyToken,
        excludedModuleId: number | undefined,
    ): void => {
        const currentTokenId = tokenRuntimeId(currentToken);

        if (!excludedTokenIds.has(currentTokenId)) {
            for (const entry of exportedEntries) {
                if (entry.moduleId !== excludedModuleId && tokenRuntimeId(entry.binding.token) === currentTokenId) {
                    visibleBindingIds.add(entry.runtimeBinding.id);
                }
            }
        }

        for (const entry of overrideEntries) {
            if (tokenRuntimeId(entry.binding.token) === currentTokenId) {
                visibleBindingIds.add(entry.runtimeBinding.id);
            }
        }
    };

    for (const currentModule of composition.modules) {
        const visibleBindingIds = new Set<number>();

        for (const currentImport of currentModule.imports) {
            addVisibleProviders(visibleBindingIds, currentImport, currentModule.id);
        }

        for (const entry of overrideEntries) {
            const entryTokenId = tokenRuntimeId(entry.binding.token);

            if (overrideModuleContextIdsByTokenId.get(entryTokenId)?.has(currentModule.id)) {
                visibleBindingIds.add(entry.runtimeBinding.id);
            }
        }

        visibleBindingIdsByModuleId.set(currentModule.id, visibleBindingIds);
    }

    const publicBindingIds = new Set<number>();

    for (const currentExport of composition.exports) {
        addVisibleProviders(publicBindingIds, currentExport, undefined);
    }

    visibleBindingIdsByModuleId.set(publicModuleContextId, publicBindingIds);

    return {
        moduleIds: composition.modules.map((currentModule) => currentModule.id),
        visibleBindingIdsByModuleId,
    };
};

const collectPublicModuleAccess = (
    tokenListContext: TokenListContext,
    composition: AnyComposedModuleDefinition,
    singleOverrideKeys: ReadonlySet<string>,
    multiOverrideKeys: ReadonlySet<string>,
    singleUnbindKeys: ReadonlySet<string>,
): RuntimePublicAccess => {
    const singleTokenKeys = new Set(singleOverrideKeys);
    const multiTokenKeys = new Set(multiOverrideKeys);

    for (const currentExport of composition.exports) {
        const exportTokenKey = tokenListContext.registerToken(currentExport);

        if (singleUnbindKeys.has(exportTokenKey)) {
            continue;
        }

        if (isMultiToken(currentExport)) {
            multiTokenKeys.add(exportTokenKey);
        } else {
            singleTokenKeys.add(exportTokenKey);
        }
    }

    return {
        moduleContextId: publicModuleContextId,
        singleTokenKeys,
        multiTokenKeys,
    };
};

const applyModuleBindingOverrides = (
    tokenListContext: TokenListContext,
    composition: AnyComposedModuleDefinition,
    entries: readonly RuntimeModuleEntry[],
    overrides: readonly AnyBindingOverride[],
): RuntimeModuleOverrideResult => {
    const publicSingleBindingKeys = new Set<string>();
    const publicMultiBindingKeys = new Set<string>();

    for (const currentExport of composition.exports) {
        const entryTokenKey = tokenListContext.registerToken(currentExport);

        if (isMultiToken(currentExport)) {
            publicMultiBindingKeys.add(entryTokenKey);
        } else {
            publicSingleBindingKeys.add(entryTokenKey);
        }
    }

    const overrideBindings: AnyBinding[] = [];
    const excludedTokenIds = new Set<string>();
    const singleOperationKeys = new Set<string>();
    const singleOverrideKeys = new Set<string>();
    const singleUnbindKeys = new Set<string>();
    const multiOverrideKeys = new Set<string>();
    const overrideModuleContextIdsByTokenId = new Map<string, Set<number>>();

    const collectOverriddenProviderModuleIds = (currentToken: AnyToken): void => {
        const currentTokenId = tokenRuntimeId(currentToken);
        const moduleContextIds = overrideModuleContextIdsByTokenId.get(currentTokenId) ?? new Set<number>();

        for (const entry of entries) {
            if (entry.exported && tokenRuntimeId(entry.binding.token) === currentTokenId) {
                moduleContextIds.add(entry.moduleId);
            }
        }

        overrideModuleContextIdsByTokenId.set(currentTokenId, moduleContextIds);
    };

    for (const currentOverride of overrides) {
        if (isBindingOverride(currentOverride)) {
            const binding = currentOverride.binding;

            if (!isBinding(binding)) {
                throw new Error("Override bindings must be created with bind");
            }

            const bindingTokenKey = tokenListContext.registerToken(binding.token);

            if (isMultiToken(binding.token)) {
                throw new Error(`Multibind token "${bindingTokenKey}" must be overridden with overrideAll`);
            }

            if (!publicSingleBindingKeys.has(bindingTokenKey)) {
                throw new Error(`Service "${bindingTokenKey}" is not exported by the module`);
            }

            if (singleOperationKeys.has(bindingTokenKey)) {
                throw new Error(`Service "${bindingTokenKey}" is already overridden`);
            }

            collectOverriddenProviderModuleIds(binding.token);
            excludedTokenIds.add(tokenRuntimeId(binding.token));
            singleOperationKeys.add(bindingTokenKey);
            singleOverrideKeys.add(bindingTokenKey);
            overrideBindings.push(binding);
            continue;
        }

        if (isBindingUnbind(currentOverride)) {
            const unbindTokenKey = tokenListContext.registerToken(currentOverride.token);

            if (isMultiToken(currentOverride.token)) {
                throw new Error(`Multibind token "${unbindTokenKey}" must be removed with overrideAll`);
            }

            if (!publicSingleBindingKeys.has(unbindTokenKey)) {
                throw new Error(`Service "${unbindTokenKey}" is not exported by the module`);
            }

            if (singleOperationKeys.has(unbindTokenKey)) {
                throw new Error(`Service "${unbindTokenKey}" is already overridden`);
            }

            collectOverriddenProviderModuleIds(currentOverride.token);
            excludedTokenIds.add(tokenRuntimeId(currentOverride.token));
            singleOperationKeys.add(unbindTokenKey);
            singleUnbindKeys.add(unbindTokenKey);
            continue;
        }

        if (isBindingOverrideAll(currentOverride)) {
            const overrideTokenKey = tokenListContext.registerToken(currentOverride.token);

            if (!isMultiToken(currentOverride.token)) {
                throw new Error(`Token "${overrideTokenKey}" is not a multibind token`);
            }

            if (!publicMultiBindingKeys.has(overrideTokenKey)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is not exported by the module`);
            }

            if (multiOverrideKeys.has(overrideTokenKey)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is already overridden`);
            }

            if (!Array.isArray(currentOverride.bindings)) {
                throw new Error("overrideAll bindings must be an array");
            }

            for (const binding of currentOverride.bindings) {
                if (!isBinding(binding)) {
                    throw new Error("overrideAll bindings must be created with bind");
                }

                const bindingTokenKey = tokenListContext.registerToken(binding.token);

                if (bindingTokenKey !== overrideTokenKey || !isMultiToken(binding.token)) {
                    throw new Error(
                        `overrideAll for "${overrideTokenKey}" only accepts bindings for the same multibind token`,
                    );
                }
            }

            collectOverriddenProviderModuleIds(currentOverride.token);
            excludedTokenIds.add(tokenRuntimeId(currentOverride.token));
            multiOverrideKeys.add(overrideTokenKey);
            overrideBindings.push(...currentOverride.bindings);
            continue;
        }

        throw new Error("Overrides must be created with override, overrideAll, or unbind");
    }

    return {
        entries: entries.filter(
            (entry) => !entry.exported || !excludedTokenIds.has(tokenRuntimeId(entry.binding.token)),
        ),
        overrideBindings,
        excludedTokenIds,
        overrideModuleContextIdsByTokenId,
        publicAccess: collectPublicModuleAccess(
            tokenListContext,
            composition,
            singleOverrideKeys,
            multiOverrideKeys,
            singleUnbindKeys,
        ),
    };
};

const createRuntimeContainer = (
    tokenListContext: TokenListContext,
    bindings: readonly AnyBinding[],
    overrides: readonly AnyBindingOverride[],
): RuntimeContainer => {
    const rootScope = createRootScope(tokenListContext);
    const resolvedBindings = applyBindingOverrides(tokenListContext, bindings, overrides);

    registerBindings(rootScope, resolvedBindings);

    return createRuntimeContainerForScope(rootScope);
};

const createRuntimeModuleContainer = (
    composition: AnyComposedModuleDefinition,
    overrides: readonly AnyBindingOverride[],
): RuntimeContainer => {
    const tokenListContext = createTokenListContext([], { allowUnknownTokens: true });
    const modules = composition.modules;
    const entries = createRuntimeModuleEntries(modules);
    const rootScope = createRootScope(tokenListContext);
    const overrideResult = applyModuleBindingOverrides(tokenListContext, composition, entries, overrides);
    const registeredEntries: RuntimeRegisteredModuleEntry[] = [];

    for (const entry of overrideResult.entries) {
        const [runtimeBinding] = registerBindings(rootScope, [entry.binding], {
            moduleContextId: entry.moduleId,
            visibleInAllModuleContexts: false,
            allowDuplicateSingleBindings: true,
            validateCircularDependencies: false,
        });

        registeredEntries.push({ ...entry, runtimeBinding });
    }

    const overrideRuntimeBindings = registerBindings(rootScope, overrideResult.overrideBindings, {
        moduleContextId: publicModuleContextId,
        visibleInAllModuleContexts: false,
        allowDuplicateSingleBindings: true,
        validateCircularDependencies: false,
    });
    const registeredOverrideEntries = overrideResult.overrideBindings.map((binding, index) => ({
        binding,
        runtimeBinding: overrideRuntimeBindings[index],
    }));
    const moduleGraph = createRuntimeModuleGraph(
        composition,
        registeredEntries,
        registeredOverrideEntries,
        overrideResult.excludedTokenIds,
        overrideResult.overrideModuleContextIdsByTokenId,
    );

    rootScope.context.moduleGraph = moduleGraph;
    assertNoCircularDependencies(rootScope);

    return createRuntimeContainerForScope(rootScope, overrideResult.publicAccess);
};

type DefineContainer = {
    <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
        tokens: TTokenArray & ValidateTokenList<TTokenArray>,
        ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
    ): ContainerDefinition<TBindings, TTokenArray>;
    readonly module: <const TComposition extends AnyComposedModuleDefinition>(
        composition: TComposition,
    ) => ModuleContainerDefinition<TComposition>;
};

const defineContainerFlat = <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
    tokens: TTokenArray & ValidateTokenList<TTokenArray>,
    ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
): ContainerDefinition<TBindings, TTokenArray> => {
    const tokenListContext = createTokenListContext(tokens);
    registerBindings(createRootScope(tokenListContext), bindings);

    return {
        create(...overrides: AnyBindingOverride[]) {
            return createRuntimeContainer(tokenListContext, bindings, overrides);
        },
    } as unknown as ContainerDefinition<TBindings, TTokenArray>;
};

const defineModuleContainer = <const TComposition extends AnyComposedModuleDefinition>(
    composition: TComposition,
): ModuleContainerDefinition<TComposition> => {
    if (!isComposedModuleDefinition(composition)) {
        throw new Error("Module container root must be created with composeModules");
    }

    createRuntimeModuleContainer(composition, []);

    return {
        create(...overrides: AnyBindingOverride[]) {
            return createRuntimeModuleContainer(composition, overrides);
        },
    } as unknown as ModuleContainerDefinition<TComposition>;
};

export const defineContainer = Object.assign(defineContainerFlat, {
    module: defineModuleContainer,
}) as DefineContainer;
