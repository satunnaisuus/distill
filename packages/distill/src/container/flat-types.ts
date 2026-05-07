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
    resolve: ResolveFn<TScopes, TTokenArray>;
    resolveOptional: ResolveOptionalFn<TScopes, TTokenArray>;
    createScope: CreateScopeFn<TBindings, TTokenArray, TScopes>;
    runScoped: RunScopedFn<TBindings, TTokenArray, TScopes>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};
