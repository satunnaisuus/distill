import { refDependencyBrand } from "./brands";
import type { AnyToken } from "./token";

export type Ref<TValue> = {
    readonly value: TValue;
};

export type RefToken<TToken extends AnyToken> = {
    readonly [refDependencyBrand]: true;
    readonly resolveToken: () => TToken;
};

export type AnyRefToken = RefToken<AnyToken>;
export type DependencyReference = AnyToken | AnyRefToken;
export type DependencyToken<TDependency extends DependencyReference> =
    TDependency extends RefToken<infer TToken> ? TToken : TDependency;

export const isRefDependency = (dependency: DependencyReference): dependency is AnyRefToken => {
    return typeof dependency === "object" && dependency !== null && refDependencyBrand in dependency;
};

export function ref<TToken extends AnyToken>(dependency: TToken): RefToken<TToken>;
export function ref<TToken extends AnyToken>(dependencyFactory: () => TToken): RefToken<TToken>;
export function ref<TToken extends AnyToken>(dependencyOrFactory: TToken | (() => TToken)): RefToken<TToken> {
    const resolveToken =
        typeof dependencyOrFactory === "function" ? (dependencyOrFactory as () => TToken) : () => dependencyOrFactory;

    return {
        [refDependencyBrand]: true,
        resolveToken,
    };
}
