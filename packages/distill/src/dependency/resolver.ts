import { isRuntimeToken } from "../token/index";

export const createDependencyResolver = <TDependency>(
    dependencyOrFactory: TDependency | (() => TDependency),
): (() => TDependency) => {
    return typeof dependencyOrFactory === "function" && !isRuntimeToken(dependencyOrFactory)
        ? (dependencyOrFactory as () => TDependency)
        : () => dependencyOrFactory as TDependency;
};
