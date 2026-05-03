import { optionalDependencyBrand } from "./brands";
import type { AnyOptionalToken, OptionalDependencyReference, OptionalToken } from "./dependency-reference-types";
import { createDependencyResolver } from "./dependency-resolver";

export type { AnyOptionalToken, OptionalDependencyReference, OptionalToken } from "./dependency-reference-types";

export const isOptionalDependency = (dependency: unknown): dependency is AnyOptionalToken => {
    return typeof dependency === "object" && dependency !== null && optionalDependencyBrand in dependency;
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
