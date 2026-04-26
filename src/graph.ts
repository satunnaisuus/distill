import type { AnyBinding, BindingDependencies, BindingLifetime, BindingLifetimeOf } from "./bind";
import type { DependencyMap } from "./dependencies";
import type { DependencyToken } from "./ref";
import type { AnyToken, TokenKey } from "./token";

export type SameTokenKey<TLeftToken extends AnyToken, TRightToken extends AnyToken> = [TokenKey<TLeftToken>] extends [
    TokenKey<TRightToken>,
]
    ? [TokenKey<TRightToken>] extends [TokenKey<TLeftToken>]
        ? true
        : false
    : false;

export type BindingScopes = readonly (readonly AnyBinding[])[];

export type BindingByToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
> = TBindings extends readonly [
    ...infer TRemainingBindings extends readonly AnyBinding[],
    infer TCurrentBinding extends AnyBinding,
]
    ? SameTokenKey<TCurrentBinding["token"], TToken> extends true
        ? TCurrentBinding
        : BindingByToken<TRemainingBindings, TToken>
    : never;

export type BindingResolution<
    TBinding extends AnyBinding = AnyBinding,
    TOwnerScopes extends BindingScopes = BindingScopes,
> = {
    readonly binding: TBinding;
    readonly ownerScopes: TOwnerScopes;
};

export type ResolveBindingInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TScopes extends readonly [
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

export type ResolutionNode<
    TToken extends AnyToken = AnyToken,
    TOwnerScopes extends BindingScopes = BindingScopes,
    TResolutionScopes extends BindingScopes = BindingScopes,
> = {
    readonly token: TToken;
    readonly ownerScopes: TOwnerScopes;
    readonly resolutionScopes: TResolutionScopes;
};

export type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;
export type HasFalse<TValue> = Extract<TValue, false> extends never ? false : true;

export type HasBindingLifetime<TBinding extends AnyBinding, TLifetime extends BindingLifetime> = [
    Extract<BindingLifetimeOf<TBinding>, TLifetime>,
] extends [never]
    ? false
    : true;

export type BindingDependencyScopes<
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

export type HasResolutionNode<TPath extends ResolutionNode, TNode extends ResolutionNode> = HasTrue<
    TPath extends ResolutionNode ? SameResolutionNode<TPath, TNode> : false
>;

export type BindingEagerDependencyTokens<TBinding extends AnyBinding> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? Extract<TDependencies[keyof TDependencies], AnyToken>
            : never
        : never;

export type BindingDependencyTokens<TBinding extends AnyBinding> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? DependencyToken<TDependencies[keyof TDependencies]>
            : never
        : never;
