import { allDependencyBrand } from "./brands";
import { createDependencyResolver } from "./dependency-resolver";
import type { AnyMultiToken } from "./token";

export type AllToken<TToken extends AnyMultiToken> = {
    readonly [allDependencyBrand]: true;
    readonly resolveToken: () => TToken;
};

export type AnyAllToken = AllToken<AnyMultiToken>;

export const isAllDependency = (dependency: unknown): dependency is AnyAllToken => {
    return typeof dependency === "object" && dependency !== null && allDependencyBrand in dependency;
};

export function all<TToken extends AnyMultiToken>(dependency: TToken): AllToken<TToken>;
export function all<TToken extends AnyMultiToken>(dependencyFactory: () => TToken): AllToken<TToken>;
export function all<TToken extends AnyMultiToken>(dependencyOrFactory: TToken | (() => TToken)): AllToken<TToken> {
    return {
        [allDependencyBrand]: true,
        resolveToken: createDependencyResolver(dependencyOrFactory),
    };
}
