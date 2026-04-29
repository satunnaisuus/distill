import type { AnyBinding, BindingDependencies, BindingLifetime, BindingLifetimeOf } from "./bind";
import type { DependencyMap } from "./dependencies";
import type {
    AllDependencyToken,
    DependencyToken,
    EagerAllDependencyToken,
    EagerSingleDependencyToken,
    SingleDependencyToken,
} from "./ref";
import type { AnyToken, TokenKey } from "./token";
import type { HasTrue, IfNever, IsExact } from "./type-utils";

export type SameTokenKey<TLeftToken extends AnyToken, TRightToken extends AnyToken> = IsExact<
    TokenKey<TLeftToken>,
    TokenKey<TRightToken>
>;

export type BindingScopes = readonly (readonly AnyBinding[])[];

export type BindingTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

export type BindingByToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TBinding extends AnyBinding = TBindings[number],
> = TBinding extends AnyBinding ? (SameTokenKey<TBinding["token"], TToken> extends true ? TBinding : never) : never;

export type HasBindingToken<TBindings extends readonly AnyBinding[], TToken extends AnyToken> = IfNever<
    BindingByToken<TBindings, TToken>,
    false,
    true
>;

export type ResolutionNode<
    TToken extends AnyToken = AnyToken,
    TOwnerScopes extends BindingScopes = BindingScopes,
    TResolutionScopes extends BindingScopes = BindingScopes,
> = {
    readonly token: TToken;
    readonly ownerScopes: TOwnerScopes;
    readonly resolutionScopes: TResolutionScopes;
};

export type HasBindingLifetime<TBinding extends AnyBinding, TLifetime extends BindingLifetime> =
    TLifetime extends BindingLifetimeOf<TBinding> ? true : false;

export type BindingDependencyScopes<
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
    TResolutionScopes extends BindingScopes,
> =
    "singleton" extends BindingLifetimeOf<TBinding>
        ? BindingLifetimeOf<TBinding> extends "singleton"
            ? TOwnerScopes
            : TOwnerScopes | TResolutionScopes
        : TResolutionScopes;

export type BindingResolutionContext<
    TToken extends AnyToken = AnyToken,
    TBinding extends AnyBinding = AnyBinding,
    TOwnerScopes extends BindingScopes = BindingScopes,
    TResolutionScopes extends BindingScopes = BindingScopes,
    TDependencyScopes extends BindingScopes = BindingDependencyScopes<TBinding, TOwnerScopes, TResolutionScopes>,
> = {
    readonly binding: TBinding;
    readonly dependencyScopes: TDependencyScopes;
    readonly node: ResolutionNode<TToken, TOwnerScopes, TDependencyScopes>;
};

export type ResolveBindingContextInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes = TScopes,
> = TToken extends AnyToken ? ResolveTokenContextInScopes<TScopes, TToken, TResolutionScopes> : never;

export type ResolveAllBindingContextsInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes = TScopes,
> = TToken extends AnyToken ? ResolveAllTokenContextsInScopes<TScopes, TToken, TResolutionScopes> : never;

type ResolveTokenContextInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes,
> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? IfNever<
          BindingByToken<TCurrentScope, TToken>,
          ResolveTokenContextInScopes<TRemainingScopes, TToken, TResolutionScopes>,
          BindingResolutionContext<TToken, BindingByToken<TCurrentScope, TToken>, TScopes, TResolutionScopes>
      >
    : never;

type ResolveAllTokenContextsInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TResolutionScopes extends BindingScopes,
> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ?
          | ResolveAllTokenContextsInScopes<TRemainingScopes, TToken, TResolutionScopes>
          | (BindingByToken<TCurrentScope, TToken> extends infer TBinding extends AnyBinding
                ? TBinding extends AnyBinding
                    ? BindingResolutionContext<TToken, TBinding, TScopes, TResolutionScopes>
                    : never
                : never)
    : never;

export type BindingContextInScopes<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
> = TBinding extends AnyBinding
    ? ResolveBindingContextInScopes<TScopes, TBinding["token"]> extends BindingResolutionContext<
          AnyToken,
          AnyBinding,
          infer TOwnerScopes
      >
        ? BindingResolutionContext<TBinding["token"], TBinding, TOwnerScopes, TScopes>
        : never
    : never;

type ResolutionNodeIdentity<TNode extends ResolutionNode> = readonly [
    TokenKey<TNode["token"]>,
    TNode["ownerScopes"],
    TNode["resolutionScopes"],
];

type SameResolutionNode<TLeftNode extends ResolutionNode, TRightNode extends ResolutionNode> = IsExact<
    ResolutionNodeIdentity<TLeftNode>,
    ResolutionNodeIdentity<TRightNode>
>;

export type HasResolutionNode<TPath extends ResolutionNode, TNode extends ResolutionNode> = HasTrue<
    TPath extends ResolutionNode ? SameResolutionNode<TPath, TNode> : false
>;

type BindingDependencyValues<
    TBinding extends AnyBinding,
    TDependencies = BindingDependencies<TBinding>,
> = TDependencies extends DependencyMap ? TDependencies[keyof TDependencies] : never;

export type BindingSingleDependencyTokens<TBinding extends AnyBinding> = SingleDependencyToken<
    BindingDependencyValues<TBinding>
>;
export type BindingAllDependencyTokens<TBinding extends AnyBinding> = AllDependencyToken<
    BindingDependencyValues<TBinding>
>;
export type BindingEagerSingleDependencyTokens<TBinding extends AnyBinding> = EagerSingleDependencyToken<
    BindingDependencyValues<TBinding>
>;
export type BindingEagerAllDependencyTokens<TBinding extends AnyBinding> = EagerAllDependencyToken<
    BindingDependencyValues<TBinding>
>;
export type BindingEagerDependencyTokens<TBinding extends AnyBinding> =
    | BindingEagerSingleDependencyTokens<TBinding>
    | BindingEagerAllDependencyTokens<TBinding>;

export type BindingDependencyTokens<TBinding extends AnyBinding> = DependencyToken<BindingDependencyValues<TBinding>>;
