const formatCircularDependencyPath = (path: readonly string[]): string => {
    return path.join(" -> ");
};

export const createCircularDependencyError = (action: "registering" | "resolving", path: readonly string[]): Error => {
    return new Error(`Circular dependency detected while ${action} services: ${formatCircularDependencyPath(path)}`);
};
