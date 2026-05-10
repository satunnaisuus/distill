import type { AnyBinding } from "../binding/index";
import type {
    BindingScopes,
    BindingTokens,
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromOptionalToken,
    MissingDependencyKeysFromToken,
    ResolveBindingContextInScopes,
    ValidateBindings,
    ValidateScopeBindings,
    ValidateTokenList,
} from "../runtime/index";
import type { ScopeTemplate } from "../shared/index";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    IsMultiToken,
    TokenByKey,
    TokenValue,
} from "../token/index";
import type {
    AnyBindingOverride,
    ApplyContainerOverrides,
    DuplicateOverridesError,
    IfNever,
    MissingSingleOverrideTargetsError,
    OverridesPreserveRootResolution,
    OverrideTokensOutsideTokenListError,
    TupleOverridesError,
    UnionOverrideTokenError,
    ValidationErrorIf,
} from "./override-types";

export type { AnyBinding, AnyBindingOverride, AnyTokenArray, ValidateBindings, ValidateTokenList };

type VisibleTokensInScopes<TScopes extends BindingScopes> = Extract<BindingTokens<TScopes[number]>, AnySingleToken>;

type SingleTokensInTokenList<TTokenArray extends AnyTokenArray> = Extract<TTokenArray[number], AnySingleToken>;

type MultiTokensInTokenList<TTokenArray extends AnyTokenArray> = Extract<TTokenArray[number], AnyMultiToken>;

type ResolvedTokenValue<TToken extends AnyToken> = TToken extends AnyMultiToken
    ? Array<TokenValue<TToken>>
    : TokenValue<TToken>;

type ResolvableSingleTokenInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TToken extends AnyToken
    ? IfNever<MissingDependencyKeysFromToken<TScopes, TToken>, TToken, never>
    : never;

type ResolvableSingleTokensInScopes<TScopes extends BindingScopes> = ResolvableSingleTokenInScopes<
    TScopes,
    VisibleTokensInScopes<TScopes>
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

type ResolveFn<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
    TResolvableTokens extends AnyToken =
        | ResolvableSingleTokensInScopes<TScopes>
        | ResolvableMultiTokensInScopes<TScopes, TTokenArray>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => ResolvedTokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ResolveOptionalTokenValidation<TScopes extends BindingScopes, TToken extends AnySingleToken> = IfNever<
    MissingDependencyKeysFromOptionalToken<TScopes, TToken>,
    unknown,
    never
>;

type ResolveOptionalFn<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
    TTokens extends AnySingleToken = SingleTokensInTokenList<TTokenArray>,
> = IfNever<
    TTokens,
    (token: never) => undefined,
    <TToken extends TTokens>(
        token: TToken & ResolveOptionalTokenValidation<TScopes, TToken>,
    ) => TokenValue<TokenByKey<TToken, TTokens>> | undefined
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
) => ScopedContainer<TBindings, TTokenArray, TScopes, TScopeBindings>;

type RunScopedFn<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> = <
    const TScopeBindings extends readonly AnyBinding[],
    TCallback extends (scope: Container<TBindings, TTokenArray, readonly [...TScopes, TScopeBindings]>) => unknown,
>(
    bindings: readonly [...TScopeBindings] & Readonly<ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>>,
    callback: TCallback,
) => Promise<Awaited<ReturnType<TCallback>>>;

type ScopeTemplateFactoryValidationArgs<
    TScopeBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> =
    readonly [...TScopeBindings] extends Readonly<ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>>
        ? []
        : [validationError: Readonly<ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>>];

type CreateScopeTemplateFn<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> = {
    <const TArgs extends unknown[], const TScopeBindings extends readonly AnyBinding[]>(
        createBindings: (...args: TArgs) => readonly [...TScopeBindings],
        ...validation: ScopeTemplateFactoryValidationArgs<TScopeBindings, TTokenArray, TScopes>
    ): ScopeTemplate<TArgs, ScopedContainer<TBindings, TTokenArray, TScopes, TScopeBindings>>;
    <const TScopeBindings extends readonly AnyBinding[]>(
        ...bindings: TScopeBindings & ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>
    ): ScopeTemplate<[], ScopedContainer<TBindings, TTokenArray, TScopes, TScopeBindings>>;
};

type BindingTokenArray<TBindings extends readonly AnyBinding[]> = readonly BindingTokens<TBindings>[];

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

type RootPreservingContainerOverrides<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
> = TOverrides &
    ValidateContainerOverrides<TOverrides, TBindings, TTokenArray> &
    (OverridesPreserveRootResolution<TOverrides> extends true ? unknown : never);

type CreateDefinitionContainerFn<TBindings extends readonly AnyBinding[], TTokenArray extends AnyTokenArray> = {
    <const TOverrides extends readonly AnyBindingOverride[]>(
        ...overrides: RootPreservingContainerOverrides<TOverrides, TBindings, TTokenArray>
    ): Container<TBindings, TTokenArray, readonly [TBindings]>;
    <const TOverrides extends readonly AnyBindingOverride[]>(
        ...overrides: TOverrides & ValidateContainerOverrides<TOverrides, TBindings, TTokenArray>
    ): Container<
        ApplyContainerOverrides<TBindings, TOverrides>,
        TTokenArray,
        readonly [ApplyContainerOverrides<TBindings, TOverrides>]
    >;
};

type ScopedContainer<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TParentScopes extends BindingScopes,
    TScopeBindings extends readonly AnyBinding[],
    TChildScopes extends BindingScopes = readonly [...TParentScopes, TScopeBindings],
> = Container<TBindings, TTokenArray, TChildScopes> &
    IfNever<
        Extract<BindingTokens<TScopeBindings>, BindingTokens<TParentScopes[number]>>,
        Container<TBindings, TTokenArray, TParentScopes>,
        unknown
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
    resolve: ResolveFn<TScopes, TTokenArray>;
    resolveOptional: ResolveOptionalFn<TScopes, TTokenArray>;
    createScope: CreateScopeFn<TBindings, TTokenArray, TScopes>;
    createScopeTemplate: CreateScopeTemplateFn<TBindings, TTokenArray, TScopes>;
    runScoped: RunScopedFn<TBindings, TTokenArray, TScopes>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};
