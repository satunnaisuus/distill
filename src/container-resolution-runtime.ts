import { createCircularDependencyError, createCircularDependencyPath } from "./container-circular-runtime";
import { assertMultiTokenKey, assertSingleTokenKey } from "./container-scope-runtime";
import { addDependencyInstance, addParentDependencyTracker, createDependencyTracker } from "./dependency-tracker";
import type { Ref } from "./ref";
import {
    assertScopeIsActive,
    canUseCachedInstance,
    createResolutionFrame,
    defaultModuleContextId,
    findBinding,
    findBindings,
    findResolutionFrameIndex,
    findTrackedInstance,
    getCurrentResolutionContext,
    getInstanceCache,
    getRuntimeBindingCacheKey,
    getRuntimeRefCacheKey,
    type ResolveOptions,
    type RuntimeBinding,
    type RuntimeDependencyTracker,
    type RuntimeRefInstance,
    type RuntimeResolutionResult,
    type RuntimeScope,
    trackOwnedInstance,
    trackResolvedInstance,
} from "./runtime";
import type { AnyToken, TokenValue } from "./token";
import { tokenDisplayKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";

const hasCachedInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): boolean => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);

    if (!resolvedBinding) {
        return false;
    }

    const instanceCacheKey = getRuntimeBindingCacheKey(resolvedBinding.binding);

    return (
        canUseCachedInstance(scope, resolvedBinding.ownerScope, options) &&
        (getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope)?.has(instanceCacheKey) ?? false)
    );
};

const shouldTrackResolutionDependencies = (
    binding: RuntimeBinding,
    dependentTrackers: readonly RuntimeDependencyTracker[],
): boolean => {
    return Boolean(binding.dispose) || binding.lifetime !== "transient" || dependentTrackers.length > 0;
};

const addResolutionDependency = (
    dependencyTracker: RuntimeDependencyTracker,
    dependencyResult: RuntimeResolutionResult<unknown>,
): void => {
    if (dependencyResult.ownedInstance) {
        addDependencyInstance(dependencyTracker, dependencyResult.ownedInstance);
        return;
    }

    /* v8 ignore next -- defensive invariant: tracked dependents should only receive tracked dependency results */
    if (!dependencyResult.dependencyTracker) {
        throw new Error("Resolution dependency is missing dependency tracking");
    }

    addParentDependencyTracker(dependencyResult.dependencyTracker, dependencyTracker);
};

const addResolutionDependencies = (
    dependencyTrackers: readonly RuntimeDependencyTracker[],
    dependencyResult: RuntimeResolutionResult<unknown>,
): void => {
    for (const dependencyTracker of dependencyTrackers) {
        addResolutionDependency(dependencyTracker, dependencyResult);
    }
};

export const resolveBindingWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentTokenKey: string,
    resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    const dependentTrackers = options?.dependentTrackers ? Array.from(options.dependentTrackers) : [];
    const currentFrame = createResolutionFrame(scope, currentTokenKey, resolvedBinding, moduleContextId);
    const instanceCache = getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope);
    const instanceCacheKey = getRuntimeBindingCacheKey(resolvedBinding.binding);

    if (instanceCache?.has(instanceCacheKey) && canUseCachedInstance(scope, resolvedBinding.ownerScope, options)) {
        const trackedInstance = findTrackedInstance(currentFrame.resolutionScope, currentFrame);

        /* v8 ignore next -- defensive invariant: cached instances are registered with tracking metadata */
        if (!trackedInstance) {
            throw new Error("Cached instance is missing dependency tracking");
        }

        const dependencyResult: RuntimeResolutionResult<TokenValue<TToken>> = {
            value: instanceCache.get(instanceCacheKey) as TokenValue<TToken>,
            ...(trackedInstance.ownedInstance ? { ownedInstance: trackedInstance.ownedInstance } : {}),
            dependencyTracker: trackedInstance.dependencyTracker,
        };

        addResolutionDependencies(dependentTrackers, dependencyResult);
        return dependencyResult;
    }

    assertScopeIsActive(scope);
    assertScopeIsActive(resolvedBinding.ownerScope);

    const cycleStartIndex = findResolutionFrameIndex(scope.context.resolvingPath, currentFrame);

    if (cycleStartIndex !== -1) {
        throw createCircularDependencyError(
            "resolving",
            createCircularDependencyPath(scope.context.resolvingPath, currentFrame),
        );
    }

    scope.context.resolvingPath.push(currentFrame);

    try {
        const dependencyTracker = shouldTrackResolutionDependencies(resolvedBinding.binding, dependentTrackers)
            ? createDependencyTracker()
            : undefined;
        if (dependencyTracker) {
            currentFrame.resolutionScope.dependencyTrackers.push(dependencyTracker);
        }
        const instance = resolvedBinding.binding.factory(currentFrame.resolutionScope, dependencyTracker);
        instanceCache?.set(instanceCacheKey, instance);
        const ownedInstance = dependencyTracker
            ? trackOwnedInstance(
                  currentFrame.resolutionScope,
                  resolvedBinding.binding,
                  currentFrame,
                  dependencyTracker,
                  instance,
              )
            : undefined;

        if (dependencyTracker && instanceCache) {
            trackResolvedInstance(currentFrame.resolutionScope, currentFrame, dependencyTracker, ownedInstance);
        }

        const dependencyResult: RuntimeResolutionResult<TokenValue<TToken>> = dependencyTracker
            ? {
                  value: instance as TokenValue<TToken>,
                  ...(ownedInstance ? { ownedInstance } : {}),
                  dependencyTracker,
              }
            : {
                  value: instance as TokenValue<TToken>,
              };

        addResolutionDependencies(dependentTrackers, dependencyResult);
        return dependencyResult;
    } finally {
        scope.context.resolvingPath.pop();
    }
};

export const resolveActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);

    if (!resolvedBinding) {
        throw new Error(`Service "${currentTokenKey}" is not registered in the container`);
    }

    return resolveBindingWithOwnership(scope, currentTokenKey, resolvedBinding, options, moduleContextId);
};

export const resolveAllActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    moduleContextId = defaultModuleContextId,
): Array<TokenValue<TToken>> => {
    return resolveAllActualWithOwnership(scope, currentToken, undefined, moduleContextId).map(
        (dependencyResult) => dependencyResult.value,
    );
};

export const resolveAllActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): Array<RuntimeResolutionResult<TokenValue<TToken>>> => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertMultiTokenKey(currentTokenKey, currentToken);
    assertScopeIsActive(scope);

    return findBindings(scope, currentTokenKeyId, moduleContextId, true, currentTokenId).map((resolvedBinding) => {
        return resolveBindingWithOwnership<TToken>(scope, currentTokenKey, resolvedBinding, options, moduleContextId);
    });
};

export const resolveActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): TokenValue<TToken> => {
    return resolveActualWithOwnership(scope, currentToken, options, moduleContextId).value;
};

export const getOrCreateRefInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId = defaultModuleContextId,
): Ref<TokenValue<TToken>> => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenKey = tokenDisplayKey(currentToken);
    const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
    const currentTokenId = tokenRuntimeId(currentToken);
    assertSingleTokenKey(currentTokenKey, currentToken);
    const refCacheKey = getRuntimeRefCacheKey(moduleContextId, currentTokenId);
    const existingInstance = scope.refInstances.get(refCacheKey);

    if (existingInstance) {
        if (dependencyTracker) {
            existingInstance.dependencyTrackers.add(dependencyTracker);
        }
        return existingInstance.ref as Ref<TokenValue<TToken>>;
    }

    const refInstance: Ref<TokenValue<TToken>> = {
        get value() {
            const resolvedBinding = findBinding(scope, currentTokenKeyId, moduleContextId, false, currentTokenId);
            const isInitializing =
                resolvedBinding &&
                findResolutionFrameIndex(
                    scope.context.resolvingPath,
                    createResolutionFrame(scope, currentTokenKey, resolvedBinding, moduleContextId),
                ) !== -1;

            const resolveOptions = {
                allowCachedDuringDispose: true,
                dependentTrackers: runtimeRefInstance.dependencyTrackers,
            };

            if (!hasCachedInstance(scope, currentToken, resolveOptions, moduleContextId) && isInitializing) {
                const resolutionContext = getCurrentResolutionContext(scope);

                throw new Error(
                    `Ref dependency "${currentTokenKey}" was accessed before it finished initializing while resolving "${resolutionContext}"`,
                );
            }

            return resolveActualWithOwnership(scope, currentToken, resolveOptions, moduleContextId).value;
        },
    };
    const runtimeRefInstance: RuntimeRefInstance = {
        ref: refInstance,
        dependencyTrackers: dependencyTracker ? new Set([dependencyTracker]) : new Set(),
    };

    scope.refInstances.set(refCacheKey, runtimeRefInstance);
    return refInstance;
};
