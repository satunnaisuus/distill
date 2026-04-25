import type { AnyBinding, BindingDependencies, BindingLifetime, BindingLifetimeOf } from "./bind";
import type { DependencyMap } from "./dependencies";
import type { DependencyToken } from "./ref";
import type { AnyToken, AnyTokenRegistry, RegistryTokens, TokenKey, TokensNotIn } from "./token";

type SameTokenKey<TLeftToken extends AnyToken, TRightToken extends AnyToken> = [TokenKey<TLeftToken>] extends [
    TokenKey<TRightToken>,
]
    ? [TokenKey<TRightToken>] extends [TokenKey<TLeftToken>]
        ? true
        : false
    : false;

type BindingScopes = readonly (readonly AnyBinding[])[];

type BindingByToken<TBindings extends readonly AnyBinding[], TToken extends AnyToken> = TBindings extends readonly [
    ...infer TRemainingBindings extends readonly AnyBinding[],
    infer TCurrentBinding extends AnyBinding,
]
    ? SameTokenKey<TCurrentBinding["token"], TToken> extends true
        ? TCurrentBinding
        : BindingByToken<TRemainingBindings, TToken>
    : never;

type BindingResolution<TBinding extends AnyBinding = AnyBinding, TOwnerScopes extends BindingScopes = BindingScopes> = {
    readonly binding: TBinding;
    readonly ownerScopes: TOwnerScopes;
};

type ResolveBindingInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? BindingByToken<TCurrentScope, TToken> extends infer TBinding
        ? [TBinding] extends [never]
            ? ResolveBindingInScopes<TRemainingScopes, TToken>
            : TBinding extends AnyBinding
              ? BindingResolution<TBinding, TScopes>
              : never
        : never
    : never;

type ResolutionNode<
    TToken extends AnyToken = AnyToken,
    TOwnerScopes extends BindingScopes = BindingScopes,
    TResolutionScopes extends BindingScopes = BindingScopes,
> = {
    readonly token: TToken;
    readonly ownerScopes: TOwnerScopes;
    readonly resolutionScopes: TResolutionScopes;
};

type BindingEagerDependencyTokens<TBinding extends AnyBinding> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? Extract<TDependencies[keyof TDependencies], AnyToken>
            : never
        : never;

type BindingDependencyTokens<TBinding extends AnyBinding> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? DependencyToken<TDependencies[keyof TDependencies]>
            : never
        : never;

type IsAny<TValue> = 0 extends 1 & TValue ? true : false;

type IsUnion<TValue, TUnion = TValue> =
    IsAny<TValue> extends true ? false : TValue extends unknown ? ([TUnion] extends [TValue] ? false : true) : false;

type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;

type HasBindingLifetime<TBinding extends AnyBinding, TLifetime extends BindingLifetime> = [
    Extract<BindingLifetimeOf<TBinding>, TLifetime>,
] extends [never]
    ? false
    : true;

type BindingDependencyScopes<
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
    TResolutionScopes extends BindingScopes,
> =
    HasBindingLifetime<TBinding, "singleton"> extends true
        ? Exclude<BindingLifetimeOf<TBinding>, "singleton"> extends never
            ? TOwnerScopes
            : TOwnerScopes | TResolutionScopes
        : TResolutionScopes;

type SameScopes<TLeftScopes extends BindingScopes, TRightScopes extends BindingScopes> = [TLeftScopes] extends [
    TRightScopes,
]
    ? [TRightScopes] extends [TLeftScopes]
        ? true
        : false
    : false;

type SameResolutionNode<TLeftNode extends ResolutionNode, TRightNode extends ResolutionNode> =
    SameTokenKey<TLeftNode["token"], TRightNode["token"]> extends true
        ? SameScopes<TLeftNode["ownerScopes"], TRightNode["ownerScopes"]> extends true
            ? SameScopes<TLeftNode["resolutionScopes"], TRightNode["resolutionScopes"]> extends true
                ? true
                : false
            : false
        : false;

type HasResolutionNode<TPath extends ResolutionNode, TNode extends ResolutionNode> = HasTrue<
    TPath extends ResolutionNode ? SameResolutionNode<TPath, TNode> : false
>;

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

type RegisteredTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

type CombinedBindings<
    TParentBindings extends readonly AnyBinding[],
    TScopeBindings extends readonly AnyBinding[],
> = readonly [...TParentBindings, ...TScopeBindings];

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

type MissingDependencyKeys<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> = DependencyTokenKeysNotIn<
    TBinding,
    TRegisteredTokens
>;

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

type MissingDependenciesError<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> = [
    MissingDependencyKeys<TBinding, TRegisteredTokens>,
] extends [never]
    ? {}
    : {
          readonly __missing_dependencies__: MissingDependencyKeys<TBinding, TRegisteredTokens>;
      };

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
    TRegisteredTokens extends AnyToken,
    TRegistryTokens extends AnyToken,
> = TBinding &
    BindingOutsideRegistryError<TBinding, TRegistryTokens> &
    DependenciesOutsideRegistryError<TBinding, TRegistryTokens> &
    MissingDependenciesError<TBinding, TRegisteredTokens> &
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
              ? ValidateBinding<
                    TBindings[TIndex],
                    TBindings,
                    readonly [TBindings],
                    RegisteredTokens<TBindings>,
                    RegistryTokens<TRegistry>
                >
              : TBindings[TIndex];
      };

export type ValidateScopeBindings<
    TScopeBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
    TParentBindings extends readonly AnyBinding[],
    TParentScopes extends BindingScopes,
> = number extends TScopeBindings["length"]
    ? TupleBindingsError<TScopeBindings>
    : {
          [TIndex in keyof TScopeBindings]: TScopeBindings[TIndex] extends AnyBinding
              ? ValidateBinding<
                    TScopeBindings[TIndex],
                    TScopeBindings,
                    readonly [...TParentScopes, TScopeBindings],
                    RegisteredTokens<CombinedBindings<TParentBindings, TScopeBindings>>,
                    RegistryTokens<TRegistry>
                >
              : TScopeBindings[TIndex];
      };
