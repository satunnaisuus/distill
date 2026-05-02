import { allDependencyBrand } from "./brands";
import type { AnyMultiToken } from "./token";
import { isRuntimeToken } from "./token";

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
    const resolveToken =
        typeof dependencyOrFactory === "function" && !isRuntimeToken(dependencyOrFactory)
            ? (dependencyOrFactory as () => TToken)
            : () => dependencyOrFactory as TToken;

    return {
        [allDependencyBrand]: true,
        resolveToken,
    };
}
