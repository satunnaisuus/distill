import type { AnyMultiToken } from "../token/index";
import { allDependencyBrand, hasDependencyBrand } from "./reference-brands";
import type { AllToken, AnyAllToken } from "./reference-types";
import { createDependencyResolver } from "./resolver";

export type { AllToken, AnyAllToken };

export const isAllDependency = (dependency: unknown): dependency is AnyAllToken => {
    return hasDependencyBrand(dependency, allDependencyBrand);
};

export function all<TToken extends AnyMultiToken>(dependency: TToken): AllToken<TToken>;
export function all<TToken extends AnyMultiToken>(dependencyFactory: () => TToken): AllToken<TToken>;
export function all<TToken extends AnyMultiToken>(dependencyOrFactory: TToken | (() => TToken)): AllToken<TToken> {
    return {
        [allDependencyBrand]: true,
        resolveToken: createDependencyResolver(dependencyOrFactory),
    };
}
