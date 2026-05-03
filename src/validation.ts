import type { AnyBinding } from "./bind";
import type {
    BindingAllDependencyTokens,
    BindingContextInScopes,
    BindingDependencyTokens,
    BindingEagerAllDependencyTokens,
    BindingEagerSingleDependencyTokens,
    BindingOptionalSingleDependencyTokens,
    BindingRequiredSingleDependencyTokens,
    BindingResolutionContext,
    BindingScopes,
    BindingSingleDependencyTokens,
    BindingTokens,
    HasBindingLifetime,
    HasBindingToken,
    HasResolutionNode,
    ResolutionNode,
    ResolveAllBindingContextsInScopes,
    ResolveBindingContextInScopes,
    SameTokenKey,
} from "./graph";
import type { AnyToken, AnyTokenArray, IsMultiToken, TokenArrayTokens, TokenKey, TokensNotIn } from "./token";
import type { DuplicateTokenKeys } from "./token-type-utils";
import type {
    HasTrue,
    IfNever,
    IsUnion,
    TupleError,
    ValidationErrorIf,
    ValidationErrorUnlessNever,
} from "./type-utils";

type HasCircularDependencyFromTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = HasCircularDependencyFromResolution<ResolveBindingContextInScopes<TScopes, TTokens>, TPath>;

type HasCircularDependencyFromAllTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = HasCircularDependencyFromResolution<ResolveAllBindingContextsInScopes<TScopes, TTokens>, TPath>;

type HasCircularDependencyFromBindingDependencies<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
    TPath extends ResolutionNode,
> = HasTrue<
    | HasCircularDependencyFromTokens<TScopes, BindingEagerSingleDependencyTokens<TBinding>, TPath>
    | HasCircularDependencyFromAllTokens<TScopes, BindingEagerAllDependencyTokens<TBinding>, TPath>
>;

type HasCircularDependencyFromResolution<TResolution, TPath extends ResolutionNode> = HasTrue<
    TResolution extends BindingResolutionContext
        ? HasResolutionNode<TPath, TResolution["node"]> extends true
            ? true
            : HasCircularDependencyFromBindingDependencies<
                  TResolution["dependencyScopes"],
                  TResolution["binding"],
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

type HasScopedDependencyFromAllTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = HasScopedDependencyFromResolution<ResolveAllBindingContextsInScopes<TScopes, TTokens>, TPath>;

type HasScopedDependencyFromBindingDependencies<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
    TPath extends ResolutionNode,
> = HasTrue<
    | HasScopedDependencyFromTokens<TScopes, BindingSingleDependencyTokens<TBinding>, TPath>
    | HasScopedDependencyFromAllTokens<TScopes, BindingAllDependencyTokens<TBinding>, TPath>
>;

type HasScopedDependencyFromResolution<TResolution, TPath extends ResolutionNode> = HasTrue<
    TResolution extends BindingResolutionContext
        ? HasBindingLifetime<TResolution["binding"], "scoped"> extends true
            ? true
            : HasResolutionNode<TPath, TResolution["node"]> extends true
              ? false
              : HasScopedDependencyFromBindingDependencies<
                    TResolution["dependencyScopes"],
                    TResolution["binding"],
                    TPath | TResolution["node"]
                >
        : false
>;

type HasScopedDependencyFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = HasScopedDependencyFromBindingDependencies<TScopes, TBinding, never>;

type MissingDependencyKeysFromTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
    TWhenMissing = TokenKey<TTokens>,
> = TTokens extends AnyToken
    ? MissingDependencyKeysFromResolution<ResolveBindingContextInScopes<TScopes, TTokens>, TPath, TWhenMissing>
    : never;

type MissingDependencyKeysFromAllTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = TTokens extends AnyToken
    ? MissingDependencyKeysFromResolution<ResolveAllBindingContextsInScopes<TScopes, TTokens>, TPath>
    : never;

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = TupleError<
    TBindings,
    {
        readonly __bindings_must_be_tuple__: true;
    }
>;

type TokensWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = TTokens extends AnyToken
    ? SameTokenKey<TTokens, TToken> extends true
        ? TTokens
        : never
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

type IsModuleExportedInterfaceBinding<TBinding extends AnyBinding> = TBinding extends {
    readonly __module_exported_interface_binding__: true;
}
    ? true
    : false;

type BindingByExactToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TBinding extends AnyBinding = TBindings[number],
> = TBinding extends AnyBinding ? IfNever<TokensNotIn<TToken, TBinding["token"]>, TBinding, never> : never;

type ResolveExactBindingContextInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes = TScopes,
> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? IfNever<
          BindingByExactToken<TCurrentScope, TToken>,
          ResolveExactBindingContextInScopes<TRemainingScopes, TToken, TResolutionScopes>,
          BindingResolutionContext<TToken, BindingByExactToken<TCurrentScope, TToken>, TScopes, TResolutionScopes>
      >
    : never;

type ResolveAllExactBindingContextsInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes = TScopes,
> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ?
          | ResolveAllExactBindingContextsInScopes<TRemainingScopes, TToken, TResolutionScopes>
          | (BindingByExactToken<TCurrentScope, TToken> extends infer TBinding extends AnyBinding
                ? TBinding extends AnyBinding
                    ? BindingResolutionContext<TToken, TBinding, TScopes, TResolutionScopes>
                    : never
                : never)
    : never;

type MissingDependencyKeysFromExactTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
    TWhenMissing = TokenKey<TTokens>,
> = TTokens extends AnyToken
    ? MissingDependencyKeysFromResolution<ResolveExactBindingContextInScopes<TScopes, TTokens>, TPath, TWhenMissing>
    : never;

type MissingDependencyKeysFromExactAllTokens<
    TScopes extends BindingScopes,
    TTokens extends AnyToken,
    TPath extends ResolutionNode,
> = TTokens extends AnyToken
    ? MissingDependencyKeysFromResolution<ResolveAllExactBindingContextsInScopes<TScopes, TTokens>, TPath>
    : never;

type MissingDependencyKeysFromResolvedBinding<
    TResolution extends BindingResolutionContext,
    TPath extends ResolutionNode,
> =
    IsModuleExportedInterfaceBinding<TResolution["binding"]> extends true
        ? HasResolutionNode<TPath, TResolution["node"]> extends true
            ? never
            :
                  | MissingDependencyKeysFromExactTokens<
                        TResolution["dependencyScopes"],
                        BindingRequiredSingleDependencyTokens<TResolution["binding"]>,
                        TPath | TResolution["node"]
                    >
                  | MissingDependencyKeysFromExactTokens<
                        TResolution["dependencyScopes"],
                        BindingOptionalSingleDependencyTokens<TResolution["binding"]>,
                        TPath | TResolution["node"],
                        never
                    >
                  | MissingDependencyKeysFromExactAllTokens<
                        TResolution["dependencyScopes"],
                        BindingAllDependencyTokens<TResolution["binding"]>,
                        TPath | TResolution["node"]
                    >
        : HasResolutionNode<TPath, TResolution["node"]> extends true
          ? never
          :
                | MissingDependencyKeysFromTokens<
                      TResolution["dependencyScopes"],
                      BindingRequiredSingleDependencyTokens<TResolution["binding"]>,
                      TPath | TResolution["node"]
                  >
                | MissingDependencyKeysFromTokens<
                      TResolution["dependencyScopes"],
                      BindingOptionalSingleDependencyTokens<TResolution["binding"]>,
                      TPath | TResolution["node"],
                      never
                  >
                | MissingDependencyKeysFromAllTokens<
                      TResolution["dependencyScopes"],
                      BindingAllDependencyTokens<TResolution["binding"]>,
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

export type MissingDependencyKeysFromAllTokenBindings<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode = never,
> =
    ResolveAllBindingContextsInScopes<TScopes, TToken> extends infer TResolution
        ? TResolution extends BindingResolutionContext
            ? MissingDependencyKeysFromResolvedBinding<TResolution, TPath>
            : never
        : never;

type MissingDependencyKeysFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = MissingDependencyKeysFromResolution<BindingContextInScopes<TScopes, TBinding>, never>;

export type MissingDependencyKeysFromBindingInScopes<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = MissingDependencyKeysFromBinding<TScopes, TBinding>;

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

type ResolvedDependencyTokensOutsideGraph<
    TDependencyTokens extends AnyToken,
    TGraphTokens extends AnyToken,
> = TDependencyTokens extends AnyToken
    ? IfNever<TokensWithSameKey<TGraphTokens, TDependencyTokens>, never, TokensNotIn<TDependencyTokens, TGraphTokens>>
    : never;

type ResolvedDependencyKeysOutsideGraph<TBinding extends AnyBinding, TGraphScopes extends BindingScopes> = TokenKey<
    ResolvedDependencyTokensOutsideGraph<BindingDependencyTokens<TBinding>, BindingTokens<TGraphScopes[number]>>
>;

type ResolvedDependenciesOutsideGraphError<
    TBinding extends AnyBinding,
    TGraphScopes extends BindingScopes,
> = ValidationErrorUnlessNever<
    ResolvedDependencyKeysOutsideGraph<TBinding, TGraphScopes>,
    {
        readonly __dependencies_not_in_tokens__: ResolvedDependencyKeysOutsideGraph<TBinding, TGraphScopes>;
    }
>;

type DuplicateBindingError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> = ValidationErrorIf<
    IsMultiToken<TBinding["token"]> extends true ? false : HasDuplicateBindingToken<TBindings, TBinding["token"]>,
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

type ValidateGraphBinding<
    TBinding extends AnyBinding,
    TDuplicateBindings extends readonly AnyBinding[],
    TGraphScopes extends BindingScopes,
> = TBinding &
    MissingDependenciesError<TBinding, TGraphScopes> &
    ResolvedDependenciesOutsideGraphError<TBinding, TGraphScopes> &
    DuplicateBindingError<TBinding, TDuplicateBindings> &
    CircularDependencyError<TBinding, TGraphScopes> &
    ScopedDependencyInSingletonError<TBinding, TGraphScopes> &
    UnionBindingTokenError<TBinding>;

type ValidateTokenListBinding<
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
              ? ValidateTokenListBinding<TBindings[TIndex], TBindings, TGraphScopes, TokenArrayTokens<TTokenArray>>
              : TBindings[TIndex];
      };

export type ValidateGraphBindings<
    TBindings extends readonly AnyBinding[],
    TGraphScopes extends BindingScopes,
    TDuplicateBindings extends readonly AnyBinding[] = TBindings,
> = number extends TBindings["length"]
    ? TupleBindingsError<TBindings>
    : {
          [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
              ? ValidateGraphBinding<TBindings[TIndex], TDuplicateBindings, TGraphScopes>
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
