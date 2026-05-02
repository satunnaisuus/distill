import { isAllDependency } from "./all";
import type { AnyBinding, Binding, BindingDependencies, BindingLifetimeOf } from "./bind";
import { bind, getBindingDependencies, getBindingLifetime, isBinding } from "./bind";
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
    AnyModuleImportWire,
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
    type RuntimeTokenReference,
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
import { isRuntimeMultiToken, tokenDisplayKey, tokenKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";
import type { HasTrue, IfNever, IsExact, IsUnion } from "./type-utils";
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

type HasExactToken<TTokens extends AnyToken, TToken extends AnyToken> = IfNever<
    TokensNotIn<TToken, TTokens>,
    true,
    false
>;

type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

type HasMultipleExactModules<
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
    TSeen extends boolean = false,
> = number extends TModules["length"]
    ? false
    : TModules extends readonly [
            infer TCurrentModule extends AnyModuleDefinition,
            ...infer TRemainingModules extends readonly AnyModuleDefinition[],
        ]
      ? IsExact<TCurrentModule, TModule> extends true
          ? TSeen extends true
              ? true
              : HasMultipleExactModules<TRemainingModules, TModule, true>
          : HasMultipleExactModules<TRemainingModules, TModule, TSeen>
      : false;

type ModuleImportWireForEntry<
    TModules extends readonly AnyModuleDefinition[],
    TCurrentWire extends AnyModuleImportWire,
    TModule extends AnyModuleDefinition,
    TToken extends AnySingleToken,
> = TCurrentWire extends AnyModuleImportWire
    ? HasMultipleExactModules<TModules, TModule> extends true
        ? never
        : IsExact<TCurrentWire["module"], TModule> extends true
          ? HasExactToken<TCurrentWire["importToken"], TToken> extends true
              ? TCurrentWire
              : never
          : never
    : never;

type ModuleImportWireFor<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends AnyComposedModuleDefinition["wire"],
    TModule extends AnyModuleDefinition,
    TToken extends AnySingleToken,
> = ModuleImportWireForEntry<TModules, TWire[number], TModule, TToken>;

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
        ? HasExactToken<MultiOverrideTokens<TOverrides>, TBinding["token"]>
        : HasExactToken<SingleOverrideTokens<TOverrides>, TBinding["token"]>;

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
        ? HasExactToken<BindingTokens<TBindings>, TBinding["token"]> extends true
            ? never
            : TokenKey<TBinding["token"]>
        : TOverride extends BindingUnbind<infer TToken>
          ? HasExactToken<BindingTokens<TBindings>, TToken> extends true
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
    ? HasExactToken<TToken, TBinding["token"]> extends true
        ? ModuleExportedInterfaceBinding<TBinding, BindingDependencies<TBinding>>
        : never
    : never;

type ModuleWiredOverrideInterfaceBinding<
    TImportToken extends AnySingleToken,
    TProviderBinding extends AnyBinding,
> = Binding<TImportToken, BindingDependencies<TProviderBinding>, BindingLifetimeOf<TProviderBinding>> & {
    readonly __module_exported_interface_binding__: true;
};

type ModuleWiredOverrideAwareBindingForToken<
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnySingleToken,
    TWireEntry extends AnyModuleImportWire,
> =
    HasExactToken<OverrideOperationTokens<TOverrides>, TWireEntry["providerToken"]> extends true
        ? ModuleOverrideInterfaceBindingForToken<TOverrides, TWireEntry["providerToken"]> extends infer TProviderBinding
            ? TProviderBinding extends AnyBinding
                ? ModuleWiredOverrideInterfaceBinding<TToken, TProviderBinding>
                : never
            : never
        : never;

type ModuleImportedOverrideAwareBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnyToken,
    TExcludedModule extends AnyModuleDefinition,
    TWire extends AnyComposedModuleDefinition["wire"],
> =
    HasExactToken<OverrideOperationTokens<TOverrides>, TToken> extends true
        ? ModuleOverrideInterfaceBindingForToken<TOverrides, TToken>
        : TToken extends AnySingleToken
          ? IfNever<
                ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken>,
                ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>,
                ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken> extends infer TWireEntry extends
                    AnyModuleImportWire
                    ? HasExactToken<OverrideOperationTokens<TOverrides>, TWireEntry["providerToken"]> extends true
                        ? ModuleWiredOverrideAwareBindingForToken<TOverrides, TToken, TWireEntry>
                        : ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>
                    : never
            >
          : ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>;

type ModuleImportedOverrideAwareBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly ModuleImportedOverrideAwareBindingForToken<
    TModules,
    TOverrides,
    TModule["imports"][number],
    TModule,
    TWire
>[];

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
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly [
    TResolvedPublicBindings,
    ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides, TWire>,
    ModuleResolvedLocalScope<TModule, TOverrides>,
];

type ModuleResolvedVisibleBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly (
    | TResolvedPublicBindings[number]
    | ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides, TWire>[number]
    | ModuleResolvedLocalScope<TModule, TOverrides>[number]
)[];

type InvalidResolvedCompositionModuleBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> = TComposition["modules"][number] extends infer TCurrentModule
    ? TCurrentModule extends AnyModuleDefinition
        ? ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides> extends ValidateGraphBindings<
              ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
              ModuleResolvedGraphScopes<
                  TCurrentModule,
                  TComposition["modules"],
                  TOverrides,
                  TResolvedPublicBindings,
                  TComposition["wire"]
              >,
              ModuleResolvedVisibleBindings<
                  TCurrentModule,
                  TComposition["modules"],
                  TOverrides,
                  TResolvedPublicBindings,
                  TComposition["wire"]
              >
          >
            ? never
            : ValidateGraphBindings<
                  ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
                  ModuleResolvedGraphScopes<
                      TCurrentModule,
                      TComposition["modules"],
                      TOverrides,
                      TResolvedPublicBindings,
                      TComposition["wire"]
                  >,
                  ModuleResolvedVisibleBindings<
                      TCurrentModule,
                      TComposition["modules"],
                      TOverrides,
                      TResolvedPublicBindings,
                      TComposition["wire"]
                  >
              >
        : never
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
    const tokenListKeyIds = new Set<string>();
    const tokenListRuntimeTokenIds = new Set<string>();

    const registerInitialToken = <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
        const currentTokenDisplayKey = tokenDisplayKey(currentToken);
        const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
        const currentTokenId = tokenRuntimeId(currentToken);
        const currentTokenKey = tokenKey(currentToken);

        if (tokenListKeyIds.has(currentTokenKeyId)) {
            throw new Error(`Token "${currentTokenDisplayKey}" is already included in the token list`);
        }

        tokenListKeyIds.add(currentTokenKeyId);
        tokenListRuntimeTokenIds.add(currentTokenId);

        return currentTokenKey;
    };

    for (const currentToken of tokens) {
        registerInitialToken(currentToken);
    }

    return {
        assertTokenIsInTokenList: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentTokenDisplayKey = tokenDisplayKey(currentToken);
            const currentTokenId = tokenRuntimeId(currentToken);
            const currentTokenKey = tokenKey(currentToken);

            if (!tokenListRuntimeTokenIds.has(currentTokenId)) {
                throw new Error(`Token "${currentTokenDisplayKey}" is not included in the token list`);
            }

            return currentTokenKey;
        },
        registerToken: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentTokenDisplayKey = tokenDisplayKey(currentToken);
            const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
            const currentTokenId = tokenRuntimeId(currentToken);
            const currentTokenKey = tokenKey(currentToken);

            if (tokenListRuntimeTokenIds.has(currentTokenId)) {
                return currentTokenKey;
            }

            if (!options?.allowUnknownTokens) {
                throw new Error(`Token "${currentTokenDisplayKey}" is not included in the token list`);
            }

            tokenListKeyIds.add(currentTokenKeyId);
            tokenListRuntimeTokenIds.add(currentTokenId);

            return currentTokenKey;
        },
    };
};

const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken);
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

const collectVisibleTokenReferences = (scope: RuntimeScope): ReadonlyMap<string, RuntimeTokenReference> => {
    const visibleTokenReferences = new Map(scope.parent ? collectVisibleTokenReferences(scope.parent) : undefined);

    for (const [tokenKeyId, bindings] of scope.bindings) {
        for (const binding of bindings) {
            const tokenReference = { tokenKey: binding.tokenKey, tokenKeyId, tokenId: binding.tokenId };

            visibleTokenReferences.set(`${tokenKeyId}\u0000${binding.tokenId}`, tokenReference);
        }
    }

    return visibleTokenReferences;
};

const assertNoCircularDependencies = (scope: RuntimeScope): void => {
    const visited: RuntimeResolutionFrame[] = [];
    const path: RuntimeResolutionFrame[] = [];
    const moduleContextIds = scope.context.moduleGraph
        ? [publicModuleContextId, ...scope.context.moduleGraph.moduleIds]
        : [defaultModuleContextId];

    const visitBinding = (
        resolutionScope: RuntimeScope,
        currentToken: RuntimeTokenReference,
        resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
        moduleContextId: number,
    ): void => {
        const currentFrame = createResolutionFrame(
            resolutionScope,
            currentToken.tokenKey,
            resolvedBinding,
            moduleContextId,
        );

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

    const visit = (
        resolutionScope: RuntimeScope,
        currentToken: RuntimeTokenReference,
        moduleContextId: number,
    ): void => {
        const multibindings = findBindings(
            resolutionScope,
            currentToken.tokenKeyId,
            moduleContextId,
            true,
            currentToken.tokenId,
        );

        if (multibindings.length > 0) {
            for (const resolvedBinding of multibindings) {
                visitBinding(resolutionScope, currentToken, resolvedBinding, moduleContextId);
            }

            return;
        }

        const resolvedBinding = findBinding(
            resolutionScope,
            currentToken.tokenKeyId,
            moduleContextId,
            false,
            currentToken.tokenId,
        );

        if (resolvedBinding) {
            visitBinding(resolutionScope, currentToken, resolvedBinding, moduleContextId);
        }
    };

    for (const moduleContextId of moduleContextIds) {
        for (const currentToken of collectVisibleTokenReferences(scope).values()) {
            visit(scope, currentToken, moduleContextId);
        }
    }
};

const getEagerDependencyReferences = (
    dependencies: DependencyMap | undefined,
    tokenListContext: TokenListContext,
): readonly RuntimeTokenReference[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencies: RuntimeTokenReference[] = [];

    for (const dependencyReference of Object.values(dependencies)) {
        const dependency = isOptionalDependency(dependencyReference)
            ? dependencyReference.resolveDependency()
            : dependencyReference;

        if (isRefDependency(dependency)) {
            continue;
        }

        if (isAllDependency(dependency)) {
            const dependencyToken = dependency.resolveToken();
            tokenListContext.registerToken(dependencyToken);
            const dependencyTokenKey = tokenDisplayKey(dependencyToken);

            if (!isMultiToken(dependencyToken)) {
                throw new Error(`Token "${dependencyTokenKey}" is not a multibind token`);
            }

            eagerDependencies.push({
                tokenKey: dependencyTokenKey,
                tokenKeyId: tokenKeyRuntimeId(dependencyToken),
                tokenId: tokenRuntimeId(dependencyToken),
            });
            continue;
        }

        tokenListContext.registerToken(dependency);
        const dependencyTokenKey = tokenDisplayKey(dependency);

        if (isMultiToken(dependency)) {
            throw new Error(`Multibind token "${dependencyTokenKey}" must be resolved with resolveAll`);
        }

        eagerDependencies.push({
            tokenKey: dependencyTokenKey,
            tokenKeyId: tokenKeyRuntimeId(dependency),
            tokenId: tokenRuntimeId(dependency),
        });
    }

    return eagerDependencies;
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
    tokenListContext.registerToken(dependencyToken);
    const dependencyTokenKey = tokenDisplayKey(dependencyToken);
    const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
    const dependencyTokenId = tokenRuntimeId(dependencyToken);
    assertSingleTokenKey(dependencyTokenKey, dependencyToken);
    if (dependencyTracker) {
        addRefDependencyFrame(
            dependencyTracker,
            scope,
            dependencyTokenKey,
            dependencyTokenKeyId,
            dependencyTokenId,
            moduleContextId,
        );
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
        tokenListContext.assertTokenIsInTokenList(dependencyToken);
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
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
        tokenListContext.registerToken(dependencyToken);
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
        const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
        const dependencyTokenId = tokenRuntimeId(dependencyToken);
        assertSingleTokenKey(dependencyTokenKey, dependencyToken);

        if (!findBinding(scope, dependencyTokenKeyId, moduleContextId, false, dependencyTokenId)) {
            return undefined;
        }

        if (dependencyTracker) {
            addRefDependencyFrame(
                dependencyTracker,
                scope,
                dependencyTokenKey,
                dependencyTokenKeyId,
                dependencyTokenId,
                moduleContextId,
            );
        }
        return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        tokenListContext.assertTokenIsInTokenList(dependencyToken);
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
        const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
        const dependencyTokenId = tokenRuntimeId(dependencyToken);
        assertMultiTokenKey(dependencyTokenKey, dependencyToken);

        const resolvedBindings = findBindings(scope, dependencyTokenKeyId, moduleContextId, true, dependencyTokenId);

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

    tokenListContext.assertTokenIsInTokenList(dependency);
    const dependencyTokenKey = tokenDisplayKey(dependency);
    const dependencyTokenKeyId = tokenKeyRuntimeId(dependency);
    const dependencyTokenId = tokenRuntimeId(dependency);
    assertSingleTokenKey(dependencyTokenKey, dependency);

    if (!findBinding(scope, dependencyTokenKeyId, moduleContextId, false, dependencyTokenId)) {
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
    const eagerDependencies = getEagerDependencyReferences(dependencies, tokenListContext);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, tokenListContext, getOrCreateRefInstance, moduleContextId)
        : () => (binding.factory as () => unknown)();
    const dispose = binding.dispose;

    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        id: createRuntimeBindingId(),
        tokenKey: tokenDisplayKey(binding.token),
        tokenKeyId: tokenKeyRuntimeId(binding.token),
        tokenId: tokenRuntimeId(binding.token),
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
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);

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
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);

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
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertMultiTokenKey(currentTokenKey, currentToken);
    assertScopeIsActive(scope);

    return findBindings(scope, currentTokenKeyId, moduleContextId, true, currentTokenId).map((resolvedBinding) => {
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
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const refCacheKey = getRuntimeRefCacheKey(moduleContextId, currentTokenId);
    const existingInstance = scope.refInstances.get(refCacheKey);

    if (existingInstance) {
        if (dependencyTracker) {
            existingInstance.dependencyTrackers.add(dependencyTracker);
        }
        return existingInstance.ref as Ref<TokenValue<TToken>>;
    }

    const refInstance: Ref<TokenValue<TToken>> = {
        get value() {
            const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);
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
    tokenKeyIdToRegister: string,
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
        const visibleBindings = findBindings(scope, tokenKeyIdToRegister, currentModuleContextId);

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

        scope.context.registerToken(binding.token);
        const bindingTokenKey = tokenDisplayKey(binding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);
        const bindingIsMultiToken = isMultiToken(binding.token);
        const existingBindings = scope.bindings.get(bindingTokenKeyId);

        assertNoVisibleTokenKindCollision(
            scope,
            bindingTokenKey,
            bindingTokenKeyId,
            bindingIsMultiToken,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );

        if (
            !bindingIsMultiToken &&
            existingBindings?.some((existingBinding) => existingBinding.tokenId === bindingTokenId) &&
            !options?.allowDuplicateSingleBindings
        ) {
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
            scope.bindings.set(bindingTokenKeyId, [runtimeBinding]);
        }
    }

    if (validateCircularDependencies) {
        assertNoCircularDependencies(scope);
    }

    return runtimeBindings;
};

type RuntimePublicAccess = {
    readonly moduleContextId: number;
    readonly singleTokenIds: ReadonlySet<string>;
    readonly multiTokenIds: ReadonlySet<string>;
};

const extendRuntimePublicAccess = (
    scope: RuntimeScope,
    publicAccess: RuntimePublicAccess | undefined,
    bindings: readonly AnyBinding[],
): RuntimePublicAccess | undefined => {
    if (!publicAccess) {
        return undefined;
    }

    const singleTokenIds = new Set(publicAccess.singleTokenIds);
    const multiTokenIds = new Set(publicAccess.multiTokenIds);

    for (const binding of bindings) {
        scope.context.assertTokenIsInTokenList(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);

        if (isMultiToken(binding.token)) {
            multiTokenIds.add(bindingTokenId);
        } else {
            singleTokenIds.add(bindingTokenId);
        }
    }

    return {
        moduleContextId: publicAccess.moduleContextId,
        singleTokenIds,
        multiTokenIds,
    };
};

const assertPublicSingleTokenId = (
    publicAccess: RuntimePublicAccess | undefined,
    tokenId: string,
    tokenKey: string,
): void => {
    if (publicAccess && !publicAccess.singleTokenIds.has(tokenId)) {
        throw new Error(`Service "${tokenKey}" is not exported by the module`);
    }
};

const assertPublicMultiTokenId = (
    publicAccess: RuntimePublicAccess | undefined,
    tokenId: string,
    tokenKey: string,
): void => {
    if (publicAccess && !publicAccess.multiTokenIds.has(tokenId)) {
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
            scope.context.assertTokenIsInTokenList(currentToken);
            const currentTokenKey = tokenDisplayKey(currentToken);
            assertSingleTokenKey(currentTokenKey, currentToken);
            assertPublicSingleTokenId(publicAccess, tokenRuntimeId(currentToken), currentTokenKey);
            return resolveActual(scope, currentToken, undefined, moduleContextId);
        },
        resolveAll(currentToken) {
            scope.context.assertTokenIsInTokenList(currentToken);
            const currentTokenKey = tokenDisplayKey(currentToken);
            assertMultiTokenKey(currentTokenKey, currentToken);
            assertPublicMultiTokenId(publicAccess, tokenRuntimeId(currentToken), currentTokenKey);
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
    const bindingTokenIds = new Set<string>();

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        tokenListContext.assertTokenIsInTokenList(binding.token);

        if (!isMultiToken(binding.token)) {
            bindingTokenIds.add(tokenRuntimeId(binding.token));
        }
    }

    return bindingTokenIds;
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

            tokenListContext.assertTokenIsInTokenList(binding.token);
            const bindingTokenKey = tokenDisplayKey(binding.token);
            const bindingTokenId = tokenRuntimeId(binding.token);

            if (isMultiToken(binding.token)) {
                throw new Error(`Multibind token "${bindingTokenKey}" must be overridden with overrideAll`);
            }

            if (!singleBindingKeys.has(bindingTokenId)) {
                throw new Error(`Service "${bindingTokenKey}" is not registered in the container definition`);
            }

            if (singleOverrides.has(bindingTokenId) || singleUnbinds.has(bindingTokenId)) {
                throw new Error(`Service "${bindingTokenKey}" is already overridden`);
            }

            singleOverrides.set(bindingTokenId, binding);
            continue;
        }

        if (isBindingUnbind(currentOverride)) {
            tokenListContext.assertTokenIsInTokenList(currentOverride.token);
            const unbindTokenKey = tokenDisplayKey(currentOverride.token);
            const unbindTokenId = tokenRuntimeId(currentOverride.token);

            if (isMultiToken(currentOverride.token)) {
                throw new Error(`Multibind token "${unbindTokenKey}" must be removed with overrideAll`);
            }

            if (!singleBindingKeys.has(unbindTokenId)) {
                throw new Error(`Service "${unbindTokenKey}" is not registered in the container definition`);
            }

            if (singleOverrides.has(unbindTokenId) || singleUnbinds.has(unbindTokenId)) {
                throw new Error(`Service "${unbindTokenKey}" is already overridden`);
            }

            singleUnbinds.add(unbindTokenId);
            continue;
        }

        if (isBindingOverrideAll(currentOverride)) {
            tokenListContext.assertTokenIsInTokenList(currentOverride.token);
            const overrideTokenKey = tokenDisplayKey(currentOverride.token);
            const overrideTokenId = tokenRuntimeId(currentOverride.token);

            if (!isMultiToken(currentOverride.token)) {
                throw new Error(`Token "${overrideTokenKey}" is not a multibind token`);
            }

            if (multiOverrides.has(overrideTokenId)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is already overridden`);
            }

            if (!Array.isArray(currentOverride.bindings)) {
                throw new Error("overrideAll bindings must be an array");
            }

            for (const binding of currentOverride.bindings) {
                if (!isBinding(binding)) {
                    throw new Error("overrideAll bindings must be created with bind");
                }

                tokenListContext.assertTokenIsInTokenList(binding.token);
                const bindingTokenId = tokenRuntimeId(binding.token);

                if (bindingTokenId !== overrideTokenId || !isMultiToken(binding.token)) {
                    throw new Error(
                        `overrideAll for "${overrideTokenKey}" only accepts bindings for the same multibind token`,
                    );
                }
            }

            multiOverrides.set(overrideTokenId, currentOverride.bindings);
            continue;
        }

        throw new Error("Overrides must be created with override, overrideAll, or unbind");
    }

    const resolvedBindings: AnyBinding[] = [];

    for (const binding of bindings) {
        tokenListContext.assertTokenIsInTokenList(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);

        if (isMultiToken(binding.token)) {
            if (!multiOverrides.has(bindingTokenId)) {
                resolvedBindings.push(binding);
            }
            continue;
        }

        if (!singleOverrides.has(bindingTokenId) && !singleUnbinds.has(bindingTokenId)) {
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

type RuntimeModuleWireAliasEntry = {
    readonly moduleId: number;
    readonly binding: AnyBinding;
};

type RuntimeModuleOverrideResult = {
    readonly entries: readonly RuntimeModuleEntry[];
    readonly overrideBindings: readonly AnyBinding[];
    readonly publicAccess: RuntimePublicAccess;
    readonly excludedTokenIds: ReadonlySet<string>;
    readonly overrideBindingTokenIds: ReadonlySet<string>;
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

const createRuntimeModuleWireAliasEntries = (
    composition: AnyComposedModuleDefinition,
    excludedTokenIds: ReadonlySet<string>,
    overrideBindingTokenIds: ReadonlySet<string>,
): readonly RuntimeModuleWireAliasEntry[] => {
    const entries: RuntimeModuleWireAliasEntry[] = [];

    for (const currentWire of composition.wire) {
        const importTokenId = tokenRuntimeId(currentWire.importToken);
        const providerTokenId = tokenRuntimeId(currentWire.providerToken);

        if (importTokenId === providerTokenId || excludedTokenIds.has(importTokenId)) {
            continue;
        }

        if (excludedTokenIds.has(providerTokenId) && !overrideBindingTokenIds.has(providerTokenId)) {
            throw new Error(
                `Service "${tokenDisplayKey(currentWire.providerToken)}" is wired to import "${tokenDisplayKey(currentWire.importToken)}", but no exported provider exists`,
            );
        }

        entries.push({
            moduleId: currentWire.module.id,
            binding: bind.transient.alias(currentWire.importToken, currentWire.providerToken) as AnyBinding,
        });
    }

    return entries;
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
    const wireTargetId = (currentModule: AnyModuleDefinition, currentImport: AnyToken): string => {
        return `${currentModule.id}\u0000${tokenRuntimeId(currentImport)}`;
    };
    const wireProviderByTarget = new Map<string, AnySingleToken>();

    for (const currentWire of composition.wire) {
        wireProviderByTarget.set(wireTargetId(currentWire.module, currentWire.importToken), currentWire.providerToken);
    }

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
            const wiredProvider = wireProviderByTarget.get(wireTargetId(currentModule, currentImport));

            if (wiredProvider) {
                addVisibleProviders(visibleBindingIds, wiredProvider, undefined);
                addVisibleProviders(visibleBindingIds, currentImport, currentModule.id);
                continue;
            }

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
    singleOverrideTokenIds: ReadonlySet<string>,
    multiOverrideTokenIds: ReadonlySet<string>,
    singleUnbindTokenIds: ReadonlySet<string>,
): RuntimePublicAccess => {
    const singleTokenIds = new Set(singleOverrideTokenIds);
    const multiTokenIds = new Set(multiOverrideTokenIds);

    for (const currentExport of composition.exports) {
        tokenListContext.registerToken(currentExport);
        const exportTokenId = tokenRuntimeId(currentExport);

        if (singleUnbindTokenIds.has(exportTokenId)) {
            continue;
        }

        if (isMultiToken(currentExport)) {
            multiTokenIds.add(exportTokenId);
        } else {
            singleTokenIds.add(exportTokenId);
        }
    }

    return {
        moduleContextId: publicModuleContextId,
        singleTokenIds,
        multiTokenIds,
    };
};

const applyModuleBindingOverrides = (
    tokenListContext: TokenListContext,
    composition: AnyComposedModuleDefinition,
    entries: readonly RuntimeModuleEntry[],
    overrides: readonly AnyBindingOverride[],
): RuntimeModuleOverrideResult => {
    const publicSingleBindingTokenIds = new Set<string>();
    const publicMultiBindingTokenIds = new Set<string>();

    for (const currentExport of composition.exports) {
        tokenListContext.registerToken(currentExport);
        const entryTokenId = tokenRuntimeId(currentExport);

        if (isMultiToken(currentExport)) {
            publicMultiBindingTokenIds.add(entryTokenId);
        } else {
            publicSingleBindingTokenIds.add(entryTokenId);
        }
    }

    const overrideBindings: AnyBinding[] = [];
    const excludedTokenIds = new Set<string>();
    const singleOperationTokenIds = new Set<string>();
    const singleOverrideTokenIds = new Set<string>();
    const singleUnbindTokenIds = new Set<string>();
    const multiOverrideTokenIds = new Set<string>();
    const overrideBindingTokenIds = new Set<string>();
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

            tokenListContext.registerToken(binding.token);
            const bindingTokenKey = tokenDisplayKey(binding.token);
            const bindingTokenId = tokenRuntimeId(binding.token);

            if (isMultiToken(binding.token)) {
                throw new Error(`Multibind token "${bindingTokenKey}" must be overridden with overrideAll`);
            }

            if (!publicSingleBindingTokenIds.has(bindingTokenId)) {
                throw new Error(`Service "${bindingTokenKey}" is not exported by the module`);
            }

            if (singleOperationTokenIds.has(bindingTokenId)) {
                throw new Error(`Service "${bindingTokenKey}" is already overridden`);
            }

            collectOverriddenProviderModuleIds(binding.token);
            excludedTokenIds.add(bindingTokenId);
            overrideBindingTokenIds.add(bindingTokenId);
            singleOperationTokenIds.add(bindingTokenId);
            singleOverrideTokenIds.add(bindingTokenId);
            overrideBindings.push(binding);
            continue;
        }

        if (isBindingUnbind(currentOverride)) {
            tokenListContext.registerToken(currentOverride.token);
            const unbindTokenKey = tokenDisplayKey(currentOverride.token);
            const unbindTokenId = tokenRuntimeId(currentOverride.token);

            if (isMultiToken(currentOverride.token)) {
                throw new Error(`Multibind token "${unbindTokenKey}" must be removed with overrideAll`);
            }

            if (!publicSingleBindingTokenIds.has(unbindTokenId)) {
                throw new Error(`Service "${unbindTokenKey}" is not exported by the module`);
            }

            if (singleOperationTokenIds.has(unbindTokenId)) {
                throw new Error(`Service "${unbindTokenKey}" is already overridden`);
            }

            collectOverriddenProviderModuleIds(currentOverride.token);
            excludedTokenIds.add(unbindTokenId);
            singleOperationTokenIds.add(unbindTokenId);
            singleUnbindTokenIds.add(unbindTokenId);
            continue;
        }

        if (isBindingOverrideAll(currentOverride)) {
            tokenListContext.registerToken(currentOverride.token);
            const overrideTokenKey = tokenDisplayKey(currentOverride.token);
            const overrideTokenId = tokenRuntimeId(currentOverride.token);

            if (!isMultiToken(currentOverride.token)) {
                throw new Error(`Token "${overrideTokenKey}" is not a multibind token`);
            }

            if (!publicMultiBindingTokenIds.has(overrideTokenId)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is not exported by the module`);
            }

            if (multiOverrideTokenIds.has(overrideTokenId)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is already overridden`);
            }

            if (!Array.isArray(currentOverride.bindings)) {
                throw new Error("overrideAll bindings must be an array");
            }

            for (const binding of currentOverride.bindings) {
                if (!isBinding(binding)) {
                    throw new Error("overrideAll bindings must be created with bind");
                }

                tokenListContext.registerToken(binding.token);
                const bindingTokenId = tokenRuntimeId(binding.token);

                if (bindingTokenId !== overrideTokenId || !isMultiToken(binding.token)) {
                    throw new Error(
                        `overrideAll for "${overrideTokenKey}" only accepts bindings for the same multibind token`,
                    );
                }
            }

            collectOverriddenProviderModuleIds(currentOverride.token);
            excludedTokenIds.add(tokenRuntimeId(currentOverride.token));
            for (const binding of currentOverride.bindings) {
                overrideBindingTokenIds.add(tokenRuntimeId(binding.token));
            }
            multiOverrideTokenIds.add(overrideTokenId);
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
        overrideBindingTokenIds,
        overrideModuleContextIdsByTokenId,
        publicAccess: collectPublicModuleAccess(
            tokenListContext,
            composition,
            singleOverrideTokenIds,
            multiOverrideTokenIds,
            singleUnbindTokenIds,
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
    const wireAliasEntries = createRuntimeModuleWireAliasEntries(
        composition,
        overrideResult.excludedTokenIds,
        overrideResult.overrideBindingTokenIds,
    );
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

    for (const entry of wireAliasEntries) {
        registerBindings(rootScope, [entry.binding], {
            moduleContextId: entry.moduleId,
            visibleInAllModuleContexts: false,
            allowDuplicateSingleBindings: true,
            validateCircularDependencies: false,
        });
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
