import type { BindingLifetime } from "./bind";
import type { UnknownDisposer } from "./dispose-option";
import type { Ref } from "./ref";
import type { AnyToken, TokenKey, TokenValue } from "./token";

export type RuntimeFactory = (scope: RuntimeScope, dependencyTracker: RuntimeDependencyTracker | undefined) => unknown;
export type RuntimeDisposer = UnknownDisposer;

export type RuntimeBinding = {
    readonly factory: RuntimeFactory;
    readonly lifetime: BindingLifetime;
    readonly eagerDependencies?: readonly string[];
    readonly dispose?: RuntimeDisposer;
};

export type AssertTokenIsInTokenList = <TToken extends AnyToken>(currentToken: TToken) => TokenKey<TToken>;
export type RefResolver = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    dependencyTracker?: RuntimeDependencyTracker,
) => Ref<TokenValue<TToken>>;

export type RuntimeContext = {
    readonly assertTokenIsInTokenList: AssertTokenIsInTokenList;
    readonly resolvingPath: RuntimeResolutionFrame[];
};

export type RuntimeScope = {
    readonly id: number;
    readonly context: RuntimeContext;
    readonly parent?: RuntimeScope;
    readonly children: Set<RuntimeScope>;
    readonly bindings: Map<string, RuntimeBinding>;
    readonly singletonInstances: Map<string, unknown>;
    readonly scopedInstances: Map<string, unknown>;
    readonly refInstances: Map<string, RuntimeRefInstance>;
    readonly dependencyTrackers: RuntimeDependencyTracker[];
    readonly trackedInstances: RuntimeTrackedInstance[];
    readonly trackedInstanceByFrame: Map<string, RuntimeTrackedInstance>;
    readonly ownedInstances: RuntimeOwnedInstance[];
    readonly ownedInstanceByFrame: Map<string, RuntimeOwnedInstance>;
    disposed: boolean;
    disposing: boolean;
    disposePromise?: Promise<void>;
};

export type RuntimeOwnedInstance = {
    readonly frame: RuntimeResolutionFrame;
    readonly dependencyFrames: readonly RuntimeResolutionFrame[];
    readonly dependencyInstances: readonly RuntimeOwnedInstance[];
    readonly value: unknown;
    readonly dispose: RuntimeDisposer;
};

export type RuntimeDependencyTracker = {
    readonly dependencyFrames: RuntimeResolutionFrame[];
    readonly dependencyFrameKeys: Set<string>;
    readonly dependencyInstances: RuntimeOwnedInstance[];
    readonly dependencyTrackers: Set<RuntimeDependencyTracker>;
    readonly parentTrackers: Set<RuntimeDependencyTracker>;
};

export type RuntimeTrackedInstance = {
    readonly frame: RuntimeResolutionFrame;
    readonly dependencyTracker: RuntimeDependencyTracker;
    readonly ownedInstance?: RuntimeOwnedInstance;
};

export type RuntimeRefInstance = {
    readonly ref: Ref<unknown>;
    readonly dependencyTrackers: Set<RuntimeDependencyTracker>;
};

export type ResolveOptions = {
    readonly allowCachedDuringDispose?: boolean;
    readonly dependentTrackers?: Iterable<RuntimeDependencyTracker>;
};

export type ResolvedRuntimeBinding = {
    readonly binding: RuntimeBinding;
    readonly ownerScope: RuntimeScope;
};

type TrackedRuntimeResolutionResult<TValue> = {
    readonly value: TValue;
    readonly dependencyTracker: RuntimeDependencyTracker;
    readonly ownedInstance?: RuntimeOwnedInstance;
};

type UntrackedRuntimeResolutionResult<TValue> = {
    readonly value: TValue;
    readonly dependencyTracker?: never;
    readonly ownedInstance?: never;
};

export type RuntimeResolutionResult<TValue> =
    | TrackedRuntimeResolutionResult<TValue>
    | UntrackedRuntimeResolutionResult<TValue>;

export type RuntimeResolutionFrame = {
    readonly tokenKey: string;
    readonly ownerScope: RuntimeScope;
    readonly resolutionScope: RuntimeScope;
};

let nextRuntimeScopeId = 1;

export const getResolutionFrameKey = (frame: RuntimeResolutionFrame): string => {
    return `${frame.tokenKey}\u0000${frame.ownerScope.id}\u0000${frame.resolutionScope.id}`;
};

export const isSameResolutionFrame = (left: RuntimeResolutionFrame, right: RuntimeResolutionFrame): boolean => {
    return getResolutionFrameKey(left) === getResolutionFrameKey(right);
};

export const findResolutionFrameIndex = (
    path: readonly RuntimeResolutionFrame[],
    frame: RuntimeResolutionFrame,
): number => {
    const frameKey = getResolutionFrameKey(frame);

    return path.findIndex((currentFrame) => getResolutionFrameKey(currentFrame) === frameKey);
};

export const createResolutionFrame = (
    resolutionScope: RuntimeScope,
    tokenKey: string,
    resolvedBinding: ResolvedRuntimeBinding,
): RuntimeResolutionFrame => {
    return {
        tokenKey,
        ownerScope: resolvedBinding.ownerScope,
        resolutionScope:
            resolvedBinding.binding.lifetime === "singleton" ? resolvedBinding.ownerScope : resolutionScope,
    };
};

export const findBinding = (scope: RuntimeScope, tokenKey: string): ResolvedRuntimeBinding | undefined => {
    const binding = scope.bindings.get(tokenKey);

    if (binding) {
        return {
            binding,
            ownerScope: scope,
        };
    }

    return scope.parent ? findBinding(scope.parent, tokenKey) : undefined;
};

export const createRuntimeScope = (context: RuntimeContext, parent?: RuntimeScope): RuntimeScope => {
    return {
        id: nextRuntimeScopeId++,
        context,
        parent,
        children: new Set(),
        bindings: new Map(),
        singletonInstances: new Map(),
        scopedInstances: new Map(),
        refInstances: new Map(),
        dependencyTrackers: [],
        trackedInstances: [],
        trackedInstanceByFrame: new Map(),
        ownedInstances: [],
        ownedInstanceByFrame: new Map(),
        disposed: false,
        disposing: false,
    };
};

export const assertScopeIsActive = (scope: RuntimeScope): void => {
    if (scope.disposed) {
        throw new Error("Container has been disposed");
    }
};

export const getCurrentResolutionContext = (scope: RuntimeScope): string => {
    return scope.context.resolvingPath[scope.context.resolvingPath.length - 1].tokenKey;
};

export const getInstanceCache = (
    binding: RuntimeBinding,
    ownerScope: RuntimeScope,
    resolutionScope: RuntimeScope,
): Map<string, unknown> | undefined => {
    if (binding.lifetime === "transient") {
        return undefined;
    }

    return binding.lifetime === "singleton" ? ownerScope.singletonInstances : resolutionScope.scopedInstances;
};

export const canUseCachedInstance = (
    scope: RuntimeScope,
    ownerScope: RuntimeScope,
    options: ResolveOptions | undefined,
): boolean => {
    if (!scope.disposed && !ownerScope.disposed) {
        return true;
    }

    return (
        options?.allowCachedDuringDispose === true &&
        (!scope.disposed || scope.disposing) &&
        (!ownerScope.disposed || ownerScope.disposing)
    );
};

export const trackOwnedInstance = (
    scope: RuntimeScope,
    binding: RuntimeBinding,
    frame: RuntimeResolutionFrame,
    dependencyTracker: RuntimeDependencyTracker,
    value: unknown,
): RuntimeOwnedInstance | undefined => {
    if (!binding.dispose) {
        return undefined;
    }

    const ownedInstance = {
        frame,
        dependencyFrames: dependencyTracker.dependencyFrames,
        dependencyInstances: dependencyTracker.dependencyInstances,
        value,
        dispose: binding.dispose,
    };

    scope.ownedInstances.push(ownedInstance);
    scope.ownedInstanceByFrame.set(getResolutionFrameKey(frame), ownedInstance);
    return ownedInstance;
};

export const trackResolvedInstance = (
    scope: RuntimeScope,
    frame: RuntimeResolutionFrame,
    dependencyTracker: RuntimeDependencyTracker,
    ownedInstance: RuntimeOwnedInstance | undefined,
): RuntimeTrackedInstance => {
    const trackedInstance = {
        frame,
        dependencyTracker,
        ...(ownedInstance ? { ownedInstance } : {}),
    };

    scope.trackedInstances.push(trackedInstance);
    scope.trackedInstanceByFrame.set(getResolutionFrameKey(frame), trackedInstance);
    return trackedInstance;
};

export const findTrackedInstance = (
    scope: RuntimeScope,
    frame: RuntimeResolutionFrame,
): RuntimeTrackedInstance | undefined => {
    return scope.trackedInstanceByFrame.get(getResolutionFrameKey(frame));
};
