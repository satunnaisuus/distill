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
import type { AnyToken, AnyTokenRegistry, RegistryTokens, TokenKey, TokensNotIn } from "./token";
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

type DependencyKeysOutsideRegistry<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = TokenKey<
    TokensNotIn<BindingDependencyTokens<TBinding>, TRegistryTokens>
>;

type BindingOutsideRegistryError<
    TBinding extends AnyBinding,
    TRegistryTokens extends AnyToken,
> = ValidationErrorUnlessNever<
    TokensNotIn<TBinding["token"], TRegistryTokens>,
    {
        readonly __token_not_in_registry__: TokenKey<TBinding["token"]>;
    }
>;

type DependenciesOutsideRegistryError<
    TBinding extends AnyBinding,
    TRegistryTokens extends AnyToken,
> = ValidationErrorUnlessNever<
    DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>,
    {
        readonly __dependencies_not_in_registry__: DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>;
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
    TRegistryTokens extends AnyToken,
> = TBinding &
    BindingOutsideRegistryError<TBinding, TRegistryTokens> &
    DependenciesOutsideRegistryError<TBinding, TRegistryTokens> &
    MissingDependenciesError<TBinding, TGraphScopes> &
    DuplicateBindingError<TBinding, TDuplicateBindings> &
    CircularDependencyError<TBinding, TGraphScopes> &
    ScopedDependencyInSingletonError<TBinding, TGraphScopes> &
    UnionBindingTokenError<TBinding>;

type ValidateBindingTuple<
    TBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
    TGraphScopes extends BindingScopes,
> = number extends TBindings["length"]
    ? TupleBindingsError<TBindings>
    : {
          [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
              ? ValidateBinding<TBindings[TIndex], TBindings, TGraphScopes, RegistryTokens<TRegistry>>
              : TBindings[TIndex];
      };

export type ValidateBindings<
    TBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
> = ValidateBindingTuple<TBindings, TRegistry, readonly [TBindings]>;

export type ValidateScopeBindings<
    TScopeBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
    TParentScopes extends BindingScopes,
> = ValidateBindingTuple<TScopeBindings, TRegistry, readonly [...TParentScopes, TScopeBindings]>;
