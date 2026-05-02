import type { AnyAllToken } from "./all";
import { optionalDependencyBrand } from "./brands";
import type { AnyRefToken } from "./ref";
import type { AnySingleToken } from "./token";
import { isRuntimeToken } from "./token";

export type OptionalDependencyReference = AnySingleToken | AnyRefToken | AnyAllToken;

export type OptionalToken<TDependency extends OptionalDependencyReference> = {
    readonly [optionalDependencyBrand]: true;
    readonly resolveDependency: () => TDependency;
};

export type AnyOptionalToken = OptionalToken<OptionalDependencyReference>;

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
    const resolveDependency =
        typeof dependencyOrFactory === "function" && !isRuntimeToken(dependencyOrFactory)
            ? (dependencyOrFactory as () => TDependency)
            : () => dependencyOrFactory as TDependency;

    return {
        [optionalDependencyBrand]: true,
        resolveDependency,
    };
}
