import {
    getResolutionFrameKey,
    type RuntimeDependencyTracker,
    type RuntimeOwnedInstance,
    type RuntimeResolutionFrame,
    type RuntimeScope,
    type RuntimeTrackedInstance,
} from "../runtime/index";
import { detachDependencyTracker } from "./dependency-tracker";

type Deferred<TValue> = {
    readonly promise: Promise<TValue>;
    readonly resolve: (value: TValue | PromiseLike<TValue>) => void;
    readonly reject: (reason: unknown) => void;
};

const activeDisposerScopes: RuntimeScope[] = [];
const runningDisposerScopes: RuntimeScope[] = [];

const createDeferred = <TValue>(): Deferred<TValue> => {
    let resolveDeferred!: (value: TValue | PromiseLike<TValue>) => void;
    let rejectDeferred!: (reason: unknown) => void;
    const promise = new Promise<TValue>((resolve, reject) => {
        resolveDeferred = resolve;
        rejectDeferred = reject;
    });

    return {
        promise,
        resolve: resolveDeferred,
        reject: rejectDeferred,
    };
};

const isScopeOrAncestorOf = (scope: RuntimeScope, childScope: RuntimeScope): boolean => {
    let currentScope: RuntimeScope | undefined = childScope;

    while (currentScope) {
        if (currentScope === scope) {
            return true;
        }

        currentScope = currentScope.parent;
    }

    return false;
};

const isReentrantDisposeFromActiveDisposer = (scope: RuntimeScope): boolean => {
    if (runningDisposerScopes.length > 0) {
        return runningDisposerScopes.some((activeScope) => isScopeOrAncestorOf(scope, activeScope));
    }

    return activeDisposerScopes.some((activeScope) => isScopeOrAncestorOf(scope, activeScope));
};

const withRunningDisposerScope = <TValue>(scope: RuntimeScope, callback: () => TValue): TValue => {
    runningDisposerScopes.push(scope);

    try {
        return callback();
    } finally {
        runningDisposerScopes.pop();
    }
};

const withActiveDisposerScope = async <TValue>(
    scope: RuntimeScope,
    callback: () => TValue | Promise<TValue>,
): Promise<TValue> => {
    activeDisposerScopes.push(scope);

    try {
        return await callback();
    } finally {
        activeDisposerScopes.pop();
    }
};

const collectDisposeError = (errors: unknown[], error: unknown): void => {
    if (error instanceof AggregateError) {
        errors.push(...error.errors);
        return;
    }

    errors.push(error);
};

const addDependencyTrackerOwnedInstances = (
    dependencyInstances: Set<RuntimeOwnedInstance>,
    dependencyTracker: RuntimeDependencyTracker,
    ownedInstanceByFrame: ReadonlyMap<string, RuntimeOwnedInstance>,
    trackedInstanceByFrame: ReadonlyMap<string, RuntimeTrackedInstance>,
    visitedTrackers: Set<RuntimeDependencyTracker>,
): void => {
    if (visitedTrackers.has(dependencyTracker)) {
        return;
    }

    visitedTrackers.add(dependencyTracker);

    for (const dependencyInstance of dependencyTracker.dependencyInstances) {
        dependencyInstances.add(dependencyInstance);
    }

    for (const dependencyFrame of dependencyTracker.dependencyFrames) {
        addDependencyFrameOwnedInstances(
            dependencyInstances,
            dependencyFrame,
            ownedInstanceByFrame,
            trackedInstanceByFrame,
            visitedTrackers,
        );
    }
};

const addDependencyFrameOwnedInstances = (
    dependencyInstances: Set<RuntimeOwnedInstance>,
    dependencyFrame: RuntimeResolutionFrame,
    ownedInstanceByFrame: ReadonlyMap<string, RuntimeOwnedInstance>,
    trackedInstanceByFrame: ReadonlyMap<string, RuntimeTrackedInstance>,
    visitedTrackers: Set<RuntimeDependencyTracker>,
): void => {
    const dependencyFrameKey = getResolutionFrameKey(dependencyFrame);
    const ownedInstance = ownedInstanceByFrame.get(dependencyFrameKey);

    if (ownedInstance) {
        dependencyInstances.add(ownedInstance);
        return;
    }

    const trackedInstance = trackedInstanceByFrame.get(dependencyFrameKey);

    if (trackedInstance) {
        addDependencyTrackerOwnedInstances(
            dependencyInstances,
            trackedInstance.dependencyTracker,
            ownedInstanceByFrame,
            trackedInstanceByFrame,
            visitedTrackers,
        );
    }
};

const collectDependencyOwnedInstances = (
    ownedInstance: RuntimeOwnedInstance,
    ownedInstanceByFrame: ReadonlyMap<string, RuntimeOwnedInstance>,
    trackedInstanceByFrame: ReadonlyMap<string, RuntimeTrackedInstance>,
): Set<RuntimeOwnedInstance> => {
    const dependencyInstances = new Set(ownedInstance.dependencyInstances);
    const visitedTrackers = new Set<RuntimeDependencyTracker>();

    for (const dependencyFrame of ownedInstance.dependencyFrames) {
        addDependencyFrameOwnedInstances(
            dependencyInstances,
            dependencyFrame,
            ownedInstanceByFrame,
            trackedInstanceByFrame,
            visitedTrackers,
        );
    }

    return dependencyInstances;
};

const createDependentInstanceMap = (scope: RuntimeScope): Map<RuntimeOwnedInstance, RuntimeOwnedInstance[]> => {
    const dependentInstanceMap = new Map<RuntimeOwnedInstance, RuntimeOwnedInstance[]>();

    for (const ownedInstance of scope.ownedInstances) {
        dependentInstanceMap.set(ownedInstance, []);
    }

    for (const dependentInstance of scope.ownedInstances) {
        const dependencyInstances = collectDependencyOwnedInstances(
            dependentInstance,
            scope.ownedInstanceByFrame,
            scope.trackedInstanceByFrame,
        );

        for (const dependencyInstance of dependencyInstances) {
            if (dependencyInstance !== dependentInstance) {
                dependentInstanceMap.get(dependencyInstance)?.push(dependentInstance);
            }
        }
    }

    return dependentInstanceMap;
};

const runOwnedInstanceDisposer = (scope: RuntimeScope, ownedInstance: RuntimeOwnedInstance): void | Promise<void> => {
    return withRunningDisposerScope(scope, () => ownedInstance.dispose(ownedInstance.value));
};

const disposeOwnedInstanceActual = async (scope: RuntimeScope, ownedInstance: RuntimeOwnedInstance): Promise<void> => {
    await withActiveDisposerScope(scope, () => runOwnedInstanceDisposer(scope, ownedInstance));
};

const disposeOwnedInstances = async (scope: RuntimeScope, errors: unknown[]): Promise<void> => {
    const dependentInstanceMap = createDependentInstanceMap(scope);
    const disposingInstances = new Set<RuntimeOwnedInstance>();
    const disposedInstances = new Set<RuntimeOwnedInstance>();

    const disposeOwnedInstance = async (ownedInstance: RuntimeOwnedInstance): Promise<void> => {
        if (disposedInstances.has(ownedInstance)) {
            return;
        }

        if (disposingInstances.has(ownedInstance)) {
            return;
        }

        disposingInstances.add(ownedInstance);

        const dependentInstances = dependentInstanceMap.get(ownedInstance) as RuntimeOwnedInstance[];

        for (let index = dependentInstances.length - 1; index >= 0; index -= 1) {
            await disposeOwnedInstance(dependentInstances[index]);
        }

        disposingInstances.delete(ownedInstance);
        disposedInstances.add(ownedInstance);

        try {
            await disposeOwnedInstanceActual(scope, ownedInstance);
        } catch (error) {
            collectDisposeError(errors, error);
        }
    };

    for (let index = scope.ownedInstances.length - 1; index >= 0; index -= 1) {
        await disposeOwnedInstance(scope.ownedInstances[index]);
    }
};

const clearScopeRuntimeState = (scope: RuntimeScope): void => {
    for (const dependencyTracker of scope.dependencyTrackers) {
        detachDependencyTracker(dependencyTracker);
    }

    scope.children.clear();
    scope.dependencyTrackers.length = 0;
    scope.trackedInstances.length = 0;
    scope.trackedInstanceByFrame.clear();
    scope.ownedInstances.length = 0;
    scope.ownedInstanceByFrame.clear();
    scope.singletonInstances.clear();
    scope.scopedInstances.clear();
    scope.refInstances.clear();
    scope.parent?.children.delete(scope);
};

const disposeScopeActual = async (scope: RuntimeScope): Promise<void> => {
    const errors: unknown[] = [];
    const childScopes = Array.from(scope.children).reverse();

    for (const childScope of childScopes) {
        try {
            await disposeScope(childScope);
        } catch (error) {
            collectDisposeError(errors, error);
        }
    }

    try {
        await disposeOwnedInstances(scope, errors);
    } finally {
        clearScopeRuntimeState(scope);
    }

    if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to dispose container");
    }
};

export const disposeScope = (scope: RuntimeScope): Promise<void> => {
    if (scope.disposePromise) {
        if (isReentrantDisposeFromActiveDisposer(scope)) {
            return Promise.resolve();
        }

        return scope.disposePromise;
    }

    if (scope.disposed) {
        return Promise.resolve();
    }

    scope.disposed = true;
    scope.disposing = true;

    const disposeDeferred = createDeferred<void>();

    scope.disposePromise = disposeDeferred.promise.finally(() => {
        scope.disposing = false;
        scope.disposePromise = undefined;
    });

    const runDispose = (): void => {
        void disposeScopeActual(scope).then(disposeDeferred.resolve, disposeDeferred.reject);
    };

    if (scope.context.resolvingPath.length > 0) {
        void Promise.resolve().then(runDispose);
    } else {
        runDispose();
    }

    return scope.disposePromise;
};
