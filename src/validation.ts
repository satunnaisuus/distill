import type { AnyBinding } from "./bind";
import type {
    BindingContextInScopes,
    BindingDependencyTokens,
    BindingEagerDependencyTokens,
    BindingResolutionContext,
    BindingScopes,
    HasBindingLifetime,
    HasBindingToken,
    HasResolutionNode,
    ResolutionNode,
    ResolveBindingContextInScopes,
    SameTokenKey,
} from "./graph";
import type { AnyToken, AnyTokenArray, TokenArrayTokens, TokenKey, TokensNotIn } from "./token";
import type { HasTrue, IfNever, IsUnion } from "./type-utils";

type HasCircularDependencyFromTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = HasCircularDependencyFromResolution<ResolveBindingContextInScopes<TScopes, TTokens>, TPath>;

type HasCircularDependencyFromResolution<TResolution, TPath extends ResolutionNode> = HasTrue<
    TResolution extends BindingResolutionContext
        ? HasResolutionNode<TPath, TResolution["node"]> extends true
            ? true
            : HasCircularDependencyFromTokens<
                  TResolution["dependencyScopes"],
                  BindingEagerDependencyTokens<TResolution["binding"]>,
                  TPath | TResolution["node"]
              >
        : false
>;

type HasCircularDependencyFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = HasCircularDependencyFromResolution<BindingContextInScopes<TScopes, TBinding>, never>;

type HasScopedDependencyFromTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = HasScopedDependencyFromResolution<ResolveBindingContextInScopes<TScopes, TTokens>, TPath>;

type HasScopedDependencyFromResolution<TResolution, TPath extends ResolutionNode> = HasTrue<
    TResolution extends BindingResolutionContext
        ? HasBindingLifetime<TResolution["binding"], "scoped"> extends true
            ? true
            : HasResolutionNode<TPath, TResolution["node"]> extends true
              ? false
              : HasScopedDependencyFromTokens<
                    TResolution["dependencyScopes"],
                    BindingDependencyTokens<TResolution["binding"]>,
                    TPath | TResolution["node"]
                >
        : false
>;

type HasScopedDependencyFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = HasScopedDependencyFromTokens<TScopes, BindingDependencyTokens<TBinding>, never>;

type MissingDependencyKeysFromTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = TTokens extends AnyToken
    ? MissingDependencyKeysFromResolution<ResolveBindingContextInScopes<TScopes, TTokens>, TPath, TokenKey<TTokens>>
    : never;

type ValidationErrorIf<TCondition extends boolean, TError> = [TCondition] extends [true] ? TError : {};

type ValidationErrorUnlessNever<TValue, TError> = IfNever<TValue, {}, TError>;

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

type DuplicateTokenKeys<
    TTokenArray extends AnyTokenArray,
    TSeenTokens extends AnyToken = never,
> = number extends TTokenArray["length"]
    ? never
    : TTokenArray extends readonly [
            infer TCurrentToken extends AnyToken,
            ...infer TRemainingTokens extends AnyTokenArray,
        ]
      ? HasTokenWithSameKey<TSeenTokens, TCurrentToken> extends true
          ? TokenKey<TCurrentToken> | DuplicateTokenKeys<TRemainingTokens, TSeenTokens>
          : DuplicateTokenKeys<TRemainingTokens, TSeenTokens | TCurrentToken>
      : never;

type HasDuplicateBindingToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? SameTokenKey<TCurrentBinding["token"], TToken> extends true
        ? HasBindingToken<TRemainingBindings, TToken>
        : HasDuplicateBindingToken<TRemainingBindings, TToken>
    : false;

type MissingDependencyKeysFromResolvedBinding<
    TResolution extends BindingResolutionContext,
    TPath extends ResolutionNode,
> =
    HasResolutionNode<TPath, TResolution["node"]> extends true
        ? never
        : MissingDependencyKeysFromTokens<
              TResolution["dependencyScopes"],
              BindingDependencyTokens<TResolution["binding"]>,
              TPath | TResolution["node"]
          >;

type MissingDependencyKeysFromResolution<TResolution, TPath extends ResolutionNode, TWhenMissing = never> = IfNever<
    TResolution,
    TWhenMissing,
    TResolution extends BindingResolutionContext ? MissingDependencyKeysFromResolvedBinding<TResolution, TPath> : never
>;

export type MissingDependencyKeysFromToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode = never,
> = MissingDependencyKeysFromTokens<TScopes, TToken, TPath>;

type MissingDependencyKeysFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = MissingDependencyKeysFromResolution<BindingContextInScopes<TScopes, TBinding>, never>;

type DependencyKeysOutsideTokenList<TBinding extends AnyBinding, TTokenArrayTokens extends AnyToken> = TokenKey<
    TokensNotIn<BindingDependencyTokens<TBinding>, TTokenArrayTokens>
>;

type BindingOutsideTokenListError<
    TBinding extends AnyBinding,
    TTokenArrayTokens extends AnyToken,
> = ValidationErrorUnlessNever<
    TokensNotIn<TBinding["token"], TTokenArrayTokens>,
    {
        readonly __token_not_in_tokens__: TokenKey<TBinding["token"]>;
    }
>;

type DependenciesOutsideTokenListError<
    TBinding extends AnyBinding,
    TTokenArrayTokens extends AnyToken,
> = ValidationErrorUnlessNever<
    DependencyKeysOutsideTokenList<TBinding, TTokenArrayTokens>,
    {
        readonly __dependencies_not_in_tokens__: DependencyKeysOutsideTokenList<TBinding, TTokenArrayTokens>;
    }
>;

type SingletonMissingDependencyKeys<
    TBinding extends AnyBinding,
    TGraphScopes extends BindingScopes,
> = TBinding extends AnyBinding
    ? HasBindingLifetime<TBinding, "singleton"> extends true
        ? MissingDependencyKeysFromBinding<TGraphScopes, TBinding>
        : never
    : never;

type MissingDependenciesError<
    TBinding extends AnyBinding,
    TGraphScopes extends BindingScopes,
> = ValidationErrorUnlessNever<
    SingletonMissingDependencyKeys<TBinding, TGraphScopes>,
    {
        readonly __missing_dependencies__: SingletonMissingDependencyKeys<TBinding, TGraphScopes>;
    }
>;

type DuplicateBindingError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> = ValidationErrorIf<
    HasDuplicateBindingToken<TBindings, TBinding["token"]>,
    {
        readonly __duplicate_binding__: TokenKey<TBinding["token"]>;
    }
>;

type CircularDependencyError<TBinding extends AnyBinding, TScopes extends BindingScopes> = ValidationErrorIf<
    HasCircularDependencyFromBinding<TScopes, TBinding>,
    {
        readonly __circular_dependency__: true;
    }
>;

type HasScopedDependencyInSingleton<TBinding extends AnyBinding, TScopes extends BindingScopes> = HasTrue<
    TBinding extends AnyBinding
        ? HasBindingLifetime<TBinding, "singleton"> extends true
            ? HasScopedDependencyFromBinding<TScopes, TBinding>
            : false
        : false
>;

type ScopedDependencyInSingletonError<TBinding extends AnyBinding, TScopes extends BindingScopes> = ValidationErrorIf<
    HasScopedDependencyInSingleton<TBinding, TScopes>,
    {
        readonly __scoped_dependency_in_singleton__: true;
    }
>;

type UnionBindingTokenError<TBinding extends AnyBinding> = ValidationErrorIf<
    IsUnion<TBinding["token"]>,
    {
        readonly __union_binding_token__: TokenKey<TBinding["token"]>;
    }
>;

type ValidateBinding<
    TBinding extends AnyBinding,
    TDuplicateBindings extends readonly AnyBinding[],
    TGraphScopes extends BindingScopes,
    TTokenArrayTokens extends AnyToken,
> = TBinding &
    BindingOutsideTokenListError<TBinding, TTokenArrayTokens> &
    DependenciesOutsideTokenListError<TBinding, TTokenArrayTokens> &
    MissingDependenciesError<TBinding, TGraphScopes> &
    DuplicateBindingError<TBinding, TDuplicateBindings> &
    CircularDependencyError<TBinding, TGraphScopes> &
    ScopedDependencyInSingletonError<TBinding, TGraphScopes> &
    UnionBindingTokenError<TBinding>;

type ValidateBindingTuple<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TGraphScopes extends BindingScopes,
> = number extends TBindings["length"]
    ? TupleBindingsError<TBindings>
    : {
          [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
              ? ValidateBinding<TBindings[TIndex], TBindings, TGraphScopes, TokenArrayTokens<TTokenArray>>
              : TBindings[TIndex];
      };

export type ValidateBindings<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
> = ValidateBindingTuple<TBindings, TTokenArray, readonly [TBindings]>;

export type ValidateTokenList<TTokenArray extends AnyTokenArray> = ValidationErrorUnlessNever<
    DuplicateTokenKeys<TTokenArray>,
    {
        readonly __duplicate_token_key__: DuplicateTokenKeys<TTokenArray>;
    }
>;

export type ValidateScopeBindings<
    TScopeBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TParentScopes extends BindingScopes,
> = ValidateBindingTuple<TScopeBindings, TTokenArray, readonly [...TParentScopes, TScopeBindings]>;
