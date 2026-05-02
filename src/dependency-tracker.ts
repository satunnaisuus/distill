import {
    createResolutionFrame,
    findBinding,
    getResolutionFrameKey,
    type RuntimeDependencyTracker,
    type RuntimeOwnedInstance,
    type RuntimeResolutionFrame,
    type RuntimeScope,
} from "./runtime";

const createDependencyFrame = (
    scope: RuntimeScope,
    tokenKey: string,
    tokenKeyId: string,
    tokenId: string,
    moduleContextId: number,
): RuntimeResolutionFrame | undefined => {
    const resolvedBinding = findBinding(scope, tokenKeyId, moduleContextId, false, tokenId);

    return resolvedBinding ? createResolutionFrame(scope, tokenKey, resolvedBinding, moduleContextId) : undefined;
};

export const createDependencyTracker = (): RuntimeDependencyTracker => {
    return {
        dependencyFrames: [],
        dependencyFrameKeys: new Set(),
        dependencyInstances: [],
        dependencyTrackers: new Set(),
        parentTrackers: new Set(),
    };
};

const hasParentDependencyTracker = (
    dependencyTracker: RuntimeDependencyTracker,
    parentTracker: RuntimeDependencyTracker,
    visitedTrackers = new Set<RuntimeDependencyTracker>(),
): boolean => {
    if (dependencyTracker === parentTracker) {
        return true;
    }

    if (visitedTrackers.has(dependencyTracker)) {
        return false;
    }

    visitedTrackers.add(dependencyTracker);

    for (const currentParentTracker of dependencyTracker.parentTrackers) {
        if (hasParentDependencyTracker(currentParentTracker, parentTracker, visitedTrackers)) {
            return true;
        }
    }

    return false;
};

const addDependencyFrameToTracker = (
    dependencyTracker: RuntimeDependencyTracker,
    dependencyFrame: RuntimeResolutionFrame,
    visitedTrackers = new Set<RuntimeDependencyTracker>(),
): void => {
    if (visitedTrackers.has(dependencyTracker)) {
        return;
    }

    visitedTrackers.add(dependencyTracker);

    const dependencyFrameKey = getResolutionFrameKey(dependencyFrame);

    if (!dependencyTracker.dependencyFrameKeys.has(dependencyFrameKey)) {
        dependencyTracker.dependencyFrameKeys.add(dependencyFrameKey);
        dependencyTracker.dependencyFrames.push(dependencyFrame);
    }

    for (const parentTracker of dependencyTracker.parentTrackers) {
        addDependencyFrameToTracker(parentTracker, dependencyFrame, visitedTrackers);
    }
};

const addDependencyFrame = (
    dependencyTracker: RuntimeDependencyTracker,
    scope: RuntimeScope,
    tokenKey: string,
    tokenKeyId: string,
    tokenId: string,
    moduleContextId: number,
): void => {
    const dependencyFrame = createDependencyFrame(scope, tokenKey, tokenKeyId, tokenId, moduleContextId);

    if (dependencyFrame) {
        addDependencyFrameToTracker(dependencyTracker, dependencyFrame);
    }
};

export const addRefDependencyFrame = (
    dependencyTracker: RuntimeDependencyTracker,
    scope: RuntimeScope,
    tokenKey: string,
    tokenKeyId: string,
    tokenId: string,
    moduleContextId: number,
): void => {
    const resolvedBinding = findBinding(scope, tokenKeyId, moduleContextId, false, tokenId);

    if (resolvedBinding?.binding.lifetime === "transient") {
        return;
    }

    addDependencyFrame(dependencyTracker, scope, tokenKey, tokenKeyId, tokenId, moduleContextId);
};

export const addDependencyInstance = (
    dependencyTracker: RuntimeDependencyTracker,
    ownedInstance: RuntimeOwnedInstance | undefined,
    visitedTrackers = new Set<RuntimeDependencyTracker>(),
): void => {
    if (visitedTrackers.has(dependencyTracker)) {
        return;
    }

    visitedTrackers.add(dependencyTracker);

    if (ownedInstance && !dependencyTracker.dependencyInstances.includes(ownedInstance)) {
        dependencyTracker.dependencyInstances.push(ownedInstance);
    }

    for (const parentTracker of dependencyTracker.parentTrackers) {
        addDependencyInstance(parentTracker, ownedInstance, visitedTrackers);
    }
};

export const addParentDependencyTracker = (
    dependencyTracker: RuntimeDependencyTracker,
    parentTracker: RuntimeDependencyTracker,
): void => {
    if (dependencyTracker.parentTrackers.has(parentTracker)) {
        parentTracker.dependencyTrackers.add(dependencyTracker);
        return;
    }

    if (hasParentDependencyTracker(parentTracker, dependencyTracker)) {
        return;
    }

    dependencyTracker.parentTrackers.add(parentTracker);
    parentTracker.dependencyTrackers.add(dependencyTracker);

    for (const dependencyFrame of dependencyTracker.dependencyFrames) {
        addDependencyFrameToTracker(parentTracker, dependencyFrame);
    }

    for (const dependencyInstance of dependencyTracker.dependencyInstances) {
        addDependencyInstance(parentTracker, dependencyInstance);
    }
};

export const detachDependencyTracker = (dependencyTracker: RuntimeDependencyTracker): void => {
    for (const trackedDependency of dependencyTracker.dependencyTrackers) {
        trackedDependency.parentTrackers.delete(dependencyTracker);
    }

    for (const parentTracker of dependencyTracker.parentTrackers) {
        parentTracker.dependencyTrackers.delete(dependencyTracker);
    }

    dependencyTracker.dependencyTrackers.clear();
    dependencyTracker.parentTrackers.clear();
};
