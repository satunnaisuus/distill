import { refDependencyBrand } from "./brands";
import type { AnyRefToken, DependencyReference, RefToken } from "./dependency-reference-types";
import { createDependencyResolver } from "./dependency-resolver";
import type { AnySingleToken } from "./token";

export type {
    AllDependencyToken,
    AnyRefToken,
    DependencyReference,
    DependencyToken,
    EagerAllDependencyToken,
    EagerDependencyToken,
    EagerSingleDependencyToken,
    Ref,
    RefToken,
    SingleDependencyToken,
} from "./dependency-reference-types";

export const isRefDependency = (dependency: DependencyReference): dependency is AnyRefToken => {
    return typeof dependency === "object" && dependency !== null && refDependencyBrand in dependency;
};

export function ref<TToken extends AnySingleToken>(dependency: TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyFactory: () => TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyOrFactory: TToken | (() => TToken)): RefToken<TToken> {
    return {
        [refDependencyBrand]: true,
        resolveToken: createDependencyResolver(dependencyOrFactory),
    };
}
