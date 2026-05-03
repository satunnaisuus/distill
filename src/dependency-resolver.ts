import { isRuntimeToken } from "./token";

export const createDependencyResolver = <TDependency>(
    dependencyOrFactory: TDependency | (() => TDependency),
): (() => TDependency) => {
    return typeof dependencyOrFactory === "function" && !isRuntimeToken(dependencyOrFactory)
        ? (dependencyOrFactory as () => TDependency)
        : () => dependencyOrFactory as TDependency;
};
