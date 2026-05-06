import type { Ref } from "../dependency/index";
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
} from "../runtime/index";
import {
    type AnyToken,
    assertMultiTokenKey,
    assertSingleTokenKey,
    getRuntimeTokenDetails,
    type TokenValue,
} from "../token/index";
import { createCircularDependencyError } from "./circular-error-runtime";
import { addDependencyInstance, addParentDependencyTracker, createDependencyTracker } from "./dependency-tracker";

const hasCachedInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): boolean => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenDetails = getRuntimeTokenDetails(currentToken);
    assertSingleTokenKey(currentTokenDetails.key, currentToken);
    const resolvedBinding = findBinding(
        scope,
        currentTokenDetails.keyId,
        moduleContextId,
        false,
        currentTokenDetails.id,
    );

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

const createResolutionCircularDependencyPath = (
    path: readonly { readonly tokenKey: string }[],
    cycleStartIndex: number,
    currentTokenKey: string,
): readonly string[] => {
    return [...path.slice(cycleStartIndex).map(({ tokenKey }) => tokenKey), currentTokenKey];
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
            createResolutionCircularDependencyPath(scope.context.resolvingPath, cycleStartIndex, currentFrame.tokenKey),
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
    const currentTokenDetails = getRuntimeTokenDetails(currentToken);
    assertSingleTokenKey(currentTokenDetails.key, currentToken);
    const resolvedBinding = findBinding(
        scope,
        currentTokenDetails.keyId,
        moduleContextId,
        false,
        currentTokenDetails.id,
    );

    if (!resolvedBinding) {
        throw new Error(`Service "${currentTokenDetails.key}" is not registered in the container`);
    }

    return resolveBindingWithOwnership(scope, currentTokenDetails.key, resolvedBinding, options, moduleContextId);
};

export const resolveOptionalActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): RuntimeResolutionResult<TokenValue<TToken>> | undefined => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenDetails = getRuntimeTokenDetails(currentToken);
    assertSingleTokenKey(currentTokenDetails.key, currentToken);
    const resolvedBinding = findBinding(
        scope,
        currentTokenDetails.keyId,
        moduleContextId,
        false,
        currentTokenDetails.id,
    );

    if (!resolvedBinding) {
        return undefined;
    }

    return resolveBindingWithOwnership(scope, currentTokenDetails.key, resolvedBinding, options, moduleContextId);
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
    const currentTokenDetails = getRuntimeTokenDetails(currentToken);
    assertMultiTokenKey(currentTokenDetails.key, currentToken);
    assertScopeIsActive(scope);

    return findBindings(scope, currentTokenDetails.keyId, moduleContextId, true, currentTokenDetails.id).map(
        (resolvedBinding) => {
            return resolveBindingWithOwnership<TToken>(
                scope,
                currentTokenDetails.key,
                resolvedBinding,
                options,
                moduleContextId,
            );
        },
    );
};

export const resolveActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): TokenValue<TToken> => {
    return resolveActualWithOwnership(scope, currentToken, options, moduleContextId).value;
};

export const resolveOptionalActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
    moduleContextId = defaultModuleContextId,
): TokenValue<TToken> | undefined => {
    return resolveOptionalActualWithOwnership(scope, currentToken, options, moduleContextId)?.value;
};

export const getOrCreateRefInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId = defaultModuleContextId,
): Ref<TokenValue<TToken>> => {
    scope.context.assertTokenIsInTokenList(currentToken);
    const currentTokenDetails = getRuntimeTokenDetails(currentToken);
    assertSingleTokenKey(currentTokenDetails.key, currentToken);
    const refCacheKey = getRuntimeRefCacheKey(moduleContextId, currentTokenDetails.id);
    const existingInstance = scope.refInstances.get(refCacheKey);

    if (existingInstance) {
        if (dependencyTracker) {
            existingInstance.dependencyTrackers.add(dependencyTracker);
        }
        return existingInstance.ref as Ref<TokenValue<TToken>>;
    }

    const refInstance: Ref<TokenValue<TToken>> = {
        get value() {
            const resolvedBinding = findBinding(
                scope,
                currentTokenDetails.keyId,
                moduleContextId,
                false,
                currentTokenDetails.id,
            );
            const isInitializing =
                resolvedBinding &&
                findResolutionFrameIndex(
                    scope.context.resolvingPath,
                    createResolutionFrame(scope, currentTokenDetails.key, resolvedBinding, moduleContextId),
                ) !== -1;

            const resolveOptions = {
                allowCachedDuringDispose: true,
                dependentTrackers: runtimeRefInstance.dependencyTrackers,
            };

            if (!hasCachedInstance(scope, currentToken, resolveOptions, moduleContextId) && isInitializing) {
                const resolutionContext = getCurrentResolutionContext(scope);

                throw new Error(
                    `Ref dependency "${currentTokenDetails.key}" was accessed before it finished initializing while resolving "${resolutionContext}"`,
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
