import type { AnyBinding, BindingDependencies } from "./bind";
import type { DependencyMap } from "./dependencies";
import type {
    BindingDependencyScopes,
    BindingDependencyTokens,
    BindingEagerDependencyTokens,
    BindingResolution,
    BindingScopes,
    HasBindingLifetime,
    HasResolutionNode,
    HasTrue,
    ResolutionNode,
    ResolveBindingInScopes,
} from "./graph";
import type { DependencyToken } from "./ref";
import type { AnyToken, AnyTokenRegistry, RegistryTokens, TokenKey, TokensNotIn } from "./token";

type IsAny<TValue> = 0 extends 1 & TValue ? true : false;

type IsUnion<TValue, TUnion = TValue> =
    IsAny<TValue> extends true ? false : TValue extends unknown ? ([TUnion] extends [TValue] ? false : true) : false;

type HasCircularDependencyFromResolvedBinding<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
> =
    BindingDependencyScopes<TBinding, TOwnerScopes, TScopes> extends infer TDependencyScopes extends BindingScopes
        ? TDependencyScopes extends BindingScopes
            ? ResolutionNode<TToken, TOwnerScopes, TDependencyScopes> extends infer TCurrentNode extends ResolutionNode
                ? HasResolutionNode<TPath, TCurrentNode> extends true
                    ? true
                    : HasTrue<
                          BindingEagerDependencyTokens<TBinding> extends infer TDependencyToken
                              ? TDependencyToken extends AnyToken
                                  ? HasCircularDependencyFromToken<
                                        TDependencyScopes,
                                        TDependencyToken,
                                        TPath | TCurrentNode
                                    >
                                  : false
                              : false
                      >
                : false
            : false
        : false;

type HasScopedDependencyFromResolvedBinding<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
> =
    HasBindingLifetime<TBinding, "scoped"> extends true
        ? true
        : BindingDependencyScopes<TBinding, TOwnerScopes, TScopes> extends infer TDependencyScopes extends BindingScopes
          ? TDependencyScopes extends BindingScopes
              ? ResolutionNode<TToken, TOwnerScopes, TDependencyScopes> extends infer TCurrentNode extends
                    ResolutionNode
                  ? HasResolutionNode<TPath, TCurrentNode> extends true
                      ? false
                      : HasTrue<
                            BindingDependencyTokens<TBinding> extends infer TDependencyToken
                                ? TDependencyToken extends AnyToken
                                    ? HasScopedDependencyFromToken<
                                          TDependencyScopes,
                                          TDependencyToken,
                                          TPath | TCurrentNode
                                      >
                                    : false
                                : false
                        >
                  : false
              : false
          : false;

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type HasDuplicateBindingToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TSeen extends boolean = false,
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? [TokenKey<TCurrentBinding["token"]>] extends [TokenKey<TToken>]
        ? [TokenKey<TToken>] extends [TokenKey<TCurrentBinding["token"]>]
            ? TSeen extends true
                ? true
                : HasDuplicateBindingToken<TRemainingBindings, TToken, true>
            : HasDuplicateBindingToken<TRemainingBindings, TToken, TSeen>
        : HasDuplicateBindingToken<TRemainingBindings, TToken, TSeen>
    : false;

type DependencyTokenKeysNotIn<TBinding extends AnyBinding, TAllowedTokens extends AnyToken> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? {
                  [TKey in keyof TDependencies]: TokenKey<
                      TokensNotIn<DependencyToken<TDependencies[TKey]>, TAllowedTokens>
                  >;
              }[keyof TDependencies]
            : never
        : never;

type MissingDependencyKeysFromResolvedBinding<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
> =
    BindingDependencyScopes<TBinding, TOwnerScopes, TScopes> extends infer TDependencyScopes extends BindingScopes
        ? TDependencyScopes extends BindingScopes
            ? ResolutionNode<TToken, TOwnerScopes, TDependencyScopes> extends infer TCurrentNode extends ResolutionNode
                ? HasResolutionNode<TPath, TCurrentNode> extends true
                    ? never
                    : BindingDependencyTokens<TBinding> extends infer TDependencyToken
                      ? TDependencyToken extends AnyToken
                          ? MissingDependencyKeysFromToken<TDependencyScopes, TDependencyToken, TPath | TCurrentNode>
                          : never
                      : never
                : never
            : never
        : never;

type MissingDependencyKeysFromToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
> =
    ResolveBindingInScopes<TScopes, TToken> extends infer TResolution
        ? [TResolution] extends [never]
            ? TokenKey<TToken>
            : TResolution extends BindingResolution<infer TBinding, infer TOwnerScopes>
              ? TBinding extends AnyBinding
                  ? MissingDependencyKeysFromResolvedBinding<TScopes, TToken, TPath, TBinding, TOwnerScopes>
                  : never
              : never
        : never;

type MissingDependencyKeysFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = TBinding extends AnyBinding
    ? ResolveBindingInScopes<TScopes, TBinding["token"]> extends infer TResolution
        ? [TResolution] extends [never]
            ? never
            : TResolution extends BindingResolution<AnyBinding, infer TOwnerScopes>
              ? MissingDependencyKeysFromResolvedBinding<TScopes, TBinding["token"], never, TBinding, TOwnerScopes>
              : never
        : never
    : never;

type DependencyKeysOutsideRegistry<
    TBinding extends AnyBinding,
    TRegistryTokens extends AnyToken,
> = DependencyTokenKeysNotIn<TBinding, TRegistryTokens>;

type HasCircularDependencyFromSingleToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
> =
    ResolveBindingInScopes<TScopes, TToken> extends infer TResolution
        ? [TResolution] extends [never]
            ? false
            : HasTrue<
                  TResolution extends BindingResolution<infer TBinding, infer TOwnerScopes>
                      ? TBinding extends AnyBinding
                          ? HasCircularDependencyFromResolvedBinding<TScopes, TToken, TPath, TBinding, TOwnerScopes>
                          : false
                      : false
              >
        : false;

type HasCircularDependencyFromBinding<TScopes extends BindingScopes, TBinding extends AnyBinding> = HasTrue<
    TBinding extends AnyBinding
        ? ResolveBindingInScopes<TScopes, TBinding["token"]> extends infer TResolution
            ? [TResolution] extends [never]
                ? false
                : TResolution extends BindingResolution<AnyBinding, infer TOwnerScopes>
                  ? HasCircularDependencyFromResolvedBinding<TScopes, TBinding["token"], never, TBinding, TOwnerScopes>
                  : false
            : false
        : false
>;

type HasScopedDependencyFromToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode = never,
> = TToken extends AnyToken ? HasScopedDependencyFromSingleToken<TScopes, TToken, TPath> : false;

type HasCircularDependencyFromToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode = never,
> = TToken extends AnyToken ? HasCircularDependencyFromSingleToken<TScopes, TToken, TPath> : false;

type HasScopedDependencyFromSingleToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
> =
    ResolveBindingInScopes<TScopes, TToken> extends infer TResolution
        ? [TResolution] extends [never]
            ? false
            : HasTrue<
                  TResolution extends BindingResolution<infer TBinding, infer TOwnerScopes>
                      ? TBinding extends AnyBinding
                          ? HasScopedDependencyFromResolvedBinding<TScopes, TToken, TPath, TBinding, TOwnerScopes>
                          : false
                      : false
              >
        : false;

type HasScopedDependencyFromBinding<TScopes extends BindingScopes, TBinding extends AnyBinding> = HasTrue<
    TBinding extends AnyBinding
        ? BindingDependencyTokens<TBinding> extends infer TDependencyToken
            ? TDependencyToken extends AnyToken
                ? HasScopedDependencyFromToken<TScopes, TDependencyToken>
                : false
            : false
        : false
>;

type BindingOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = [
    TokensNotIn<TBinding["token"], TRegistryTokens>,
] extends [never]
    ? {}
    : {
          readonly __token_not_in_registry__: TokenKey<TBinding["token"]>;
      };

type DependenciesOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = [
    DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>,
] extends [never]
    ? {}
    : {
          readonly __dependencies_not_in_registry__: DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>;
      };

type MissingDependenciesError<TBinding extends AnyBinding, TGraphScopes extends BindingScopes> = [
    HasBindingLifetime<TBinding, "singleton">,
] extends [true]
    ? [MissingDependencyKeysFromBinding<TGraphScopes, TBinding>] extends [never]
        ? {}
        : {
              readonly __missing_dependencies__: MissingDependencyKeysFromBinding<TGraphScopes, TBinding>;
          }
    : {};

type DuplicateBindingError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> =
    HasDuplicateBindingToken<TBindings, TBinding["token"]> extends true
        ? {
              readonly __duplicate_binding__: TokenKey<TBinding["token"]>;
          }
        : {};

type CircularDependencyError<TBinding extends AnyBinding, TScopes extends BindingScopes> =
    HasCircularDependencyFromBinding<TScopes, TBinding> extends true
        ? {
              readonly __circular_dependency__: true;
          }
        : {};

type HasScopedDependencyInSingleton<TBinding extends AnyBinding, TScopes extends BindingScopes> = HasTrue<
    TBinding extends AnyBinding
        ? HasBindingLifetime<TBinding, "singleton"> extends true
            ? HasScopedDependencyFromBinding<TScopes, TBinding>
            : false
        : false
>;

type ScopedDependencyInSingletonError<TBinding extends AnyBinding, TScopes extends BindingScopes> =
    HasScopedDependencyInSingleton<TBinding, TScopes> extends true
        ? {
              readonly __scoped_dependency_in_singleton__: true;
          }
        : {};

type UnionBindingTokenError<TBinding extends AnyBinding> =
    IsUnion<TBinding["token"]> extends true
        ? {
              readonly __union_binding_token__: TokenKey<TBinding["token"]>;
          }
        : {};

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

export type ValidateBindings<
    TBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
> = number extends TBindings["length"]
    ? TupleBindingsError<TBindings>
    : {
          [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
              ? ValidateBinding<TBindings[TIndex], TBindings, readonly [TBindings], RegistryTokens<TRegistry>>
              : TBindings[TIndex];
      };

export type ValidateScopeBindings<
    TScopeBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
    TParentScopes extends BindingScopes,
> = number extends TScopeBindings["length"]
    ? TupleBindingsError<TScopeBindings>
    : {
          [TIndex in keyof TScopeBindings]: TScopeBindings[TIndex] extends AnyBinding
              ? ValidateBinding<
                    TScopeBindings[TIndex],
                    TScopeBindings,
                    readonly [...TParentScopes, TScopeBindings],
                    RegistryTokens<TRegistry>
                >
              : TScopeBindings[TIndex];
      };
