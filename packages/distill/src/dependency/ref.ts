import type { AnySingleToken } from "../token/index";
import { hasDependencyBrand, refDependencyBrand } from "./reference-brands";
import type {
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
} from "./reference-types";
import { createDependencyResolver } from "./resolver";

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
};

export const isRefDependency = (dependency: DependencyReference): dependency is AnyRefToken => {
    return hasDependencyBrand(dependency, refDependencyBrand);
};

export function ref<TToken extends AnySingleToken>(dependency: TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyFactory: () => TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyOrFactory: TToken | (() => TToken)): RefToken<TToken> {
    return {
        [refDependencyBrand]: true,
        resolveToken: createDependencyResolver(dependencyOrFactory),
    };
}
