import { hasDependencyBrand, optionalDependencyBrand } from "./reference-brands";
import type { AnyOptionalToken, OptionalDependencyReference, OptionalToken } from "./reference-types";
import { createDependencyResolver } from "./resolver";

export type { AnyOptionalToken, OptionalDependencyReference, OptionalToken };

export const isOptionalDependency = (dependency: unknown): dependency is AnyOptionalToken => {
    return hasDependencyBrand(dependency, optionalDependencyBrand);
};

export function optional<TDependency extends OptionalDependencyReference>(
    dependency: TDependency,
): OptionalToken<TDependency>;
export function optional<TDependency extends OptionalDependencyReference>(
    dependencyFactory: () => TDependency,
): OptionalToken<TDependency>;
export function optional<TDependency extends OptionalDependencyReference>(
    dependencyOrFactory: TDependency | (() => TDependency),
): OptionalToken<TDependency> {
    return {
        [optionalDependencyBrand]: true,
        resolveDependency: createDependencyResolver(dependencyOrFactory),
    };
}
