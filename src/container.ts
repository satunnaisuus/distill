import { isAllDependency } from "./all";
import type { AnyBinding } from "./bind";
import { getBindingDependencies, getBindingLifetime, isBinding } from "./bind";
import type { DependencyMap } from "./dependencies";
import {
    addDependencyInstance,
    addParentDependencyTracker,
    addRefDependencyFrame,
    createDependencyTracker,
} from "./dependency-tracker";
import { disposeScope } from "./disposal";
import { assertDisposeOption } from "./dispose-option";
import type { BindingScopes, BindingTokens, ResolveBindingContextInScopes } from "./graph";
import type { DependencyReference, Ref } from "./ref";
import { isRefDependency } from "./ref";
import {
    type AssertTokenIsInTokenList,
    assertScopeIsActive,
    canUseCachedInstance,
    createResolutionFrame,
    createRuntimeBindingId,
    createRuntimeScope,
    findBinding,
    findBindings,
    findResolutionFrameIndex,
    findTrackedInstance,
    getCurrentResolutionContext,
    getInstanceCache,
    getRuntimeBindingCacheKey,
    isSameResolutionFrame,
    type RefResolver,
    type ResolveOptions,
    type RuntimeBinding,
    type RuntimeDependencyTracker,
    type RuntimeFactory,
    type RuntimeRefInstance,
    type RuntimeResolutionFrame,
    type RuntimeResolutionResult,
    type RuntimeScope,
    trackOwnedInstance,
    trackResolvedInstance,
} from "./runtime";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    IsMultiToken,
    TokenByKey,
    TokenKey,
    TokenValue,
} from "./token";
import { isRuntimeMultiToken, tokenKey } from "./token";
import type { IfNever } from "./type-utils";
import type {
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromToken,
    ValidateBindings,
    ValidateScopeBindings,
    ValidateTokenList,
} from "./validation";

type RuntimeContainer = {
    resolve<TToken extends AnyToken>(token: TToken): TokenValue<TToken>;
    resolveAll<TToken extends AnyToken>(token: TToken): Array<TokenValue<TToken>>;
    createScope(...bindings: readonly AnyBinding[]): RuntimeContainer;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type VisibleTokensInScopes<TScopes extends BindingScopes> = Extract<BindingTokens<TScopes[number]>, AnySingleToken>;

type MultiTokensInTokenList<TTokenArray extends AnyTokenArray> = Extract<TTokenArray[number], AnyMultiToken>;

type ResolvableTokenInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TToken extends AnyToken
    ? IfNever<MissingDependencyKeysFromToken<TScopes, TToken>, TToken, never>
    : never;

type ResolvableTokensInScopes<TScopes extends BindingScopes> = ResolvableTokenInScopes<
    TScopes,
    VisibleTokensInScopes<TScopes>
>;

type ResolveFn<
    TScopes extends BindingScopes,
    TResolvableTokens extends AnyToken = ResolvableTokensInScopes<TScopes>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => TokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ResolvableMultiTokenInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyMultiToken,
> = TToken extends AnyMultiToken
    ? IfNever<MissingDependencyKeysFromAllTokenBindings<TScopes, TToken>, TToken, never>
    : never;

type ResolvableMultiTokensInScopes<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
> = ResolvableMultiTokenInScopes<TScopes, MultiTokensInTokenList<TTokenArray>>;

type ResolveAllFn<
    TScopes extends BindingScopes,
    TTokenArray extends AnyTokenArray,
    TResolvableTokens extends AnyMultiToken = ResolvableMultiTokensInScopes<TScopes, TTokenArray>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never[],
    <TToken extends TResolvableTokens>(token: TToken) => Array<TokenValue<TokenByKey<TToken, TResolvableTokens>>>
>;

type AppendBindingToLastScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? readonly [...TRemainingScopes, readonly [...TCurrentScope, TBinding]]
    : readonly [readonly [TBinding]];

type AppendInferredBindingScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = IfNever<
    IsMultiToken<TBinding["token"]> extends true ? never : ResolveBindingContextInScopes<TScopes, TBinding["token"]>,
    AppendBindingToLastScope<TScopes, TBinding>,
    readonly [...TScopes, readonly [TBinding]]
>;

type InferBindingScopes<
    TBindings extends readonly AnyBinding[],
    TScopes extends BindingScopes = readonly [],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? InferBindingScopes<TRemainingBindings, AppendInferredBindingScope<TScopes, TCurrentBinding>>
    : TScopes extends readonly []
      ? readonly [readonly []]
      : TScopes;

type CreateScopeFn<
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TScopes extends BindingScopes,
> = <const TScopeBindings extends readonly AnyBinding[]>(
    ...bindings: TScopeBindings & ValidateScopeBindings<TScopeBindings, TTokenArray, TScopes>
) => Container<readonly [...TBindings, ...TScopeBindings], TTokenArray, readonly [...TScopes, TScopeBindings]>;

type BindingTokenArray<TBindings extends readonly AnyBinding[]> = readonly BindingTokens<TBindings>[];

export type Container<
    TBindings extends readonly AnyBinding[] = [],
    TTokenArray extends AnyTokenArray = BindingTokenArray<TBindings>,
    TScopes extends BindingScopes = InferBindingScopes<TBindings>,
> = {
    resolve: ResolveFn<TScopes>;
    resolveAll: ResolveAllFn<TScopes, TTokenArray>;
    createScope: CreateScopeFn<TBindings, TTokenArray, TScopes>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};

type TokenListContext = {
    readonly assertTokenIsInTokenList: AssertTokenIsInTokenList;
    readonly isMultiTokenKey: (tokenKey: string) => boolean;
};

const createTokenListContext = <TTokenArray extends AnyTokenArray>(tokens: TTokenArray): TokenListContext => {
    const tokenListKeys = new Set<string>();
    const tokenListRuntimeTokens = new Set<string>();
    const multiTokenKeys = new Set<string>();

    for (const currentToken of tokens) {
        const currentRuntimeToken = currentToken as string;
        const currentTokenKey = tokenKey(currentToken);

        if (tokenListKeys.has(currentTokenKey)) {
            throw new Error(`Token "${currentTokenKey}" is already included in the token list`);
        }

        tokenListKeys.add(currentTokenKey);
        tokenListRuntimeTokens.add(currentRuntimeToken);

        if (isRuntimeMultiToken(currentRuntimeToken)) {
            multiTokenKeys.add(currentTokenKey);
        }
    }

    return {
        assertTokenIsInTokenList: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentRuntimeToken = currentToken as string;
            const currentTokenKey = tokenKey(currentToken);

            if (!tokenListRuntimeTokens.has(currentRuntimeToken)) {
                throw new Error(`Token "${currentTokenKey}" is not included in the token list`);
            }

            return currentTokenKey;
        },
        isMultiTokenKey: (currentTokenKey: string): boolean => {
            return multiTokenKeys.has(currentTokenKey);
        },
    };
};

const assertSingleTokenKey = (scope: RuntimeScope, tokenKey: string): void => {
    if (scope.context.isMultiTokenKey(tokenKey)) {
        throw new Error(`Multibind token "${tokenKey}" must be resolved with resolveAll`);
    }
};

const assertMultiTokenKey = (scope: RuntimeScope, tokenKey: string): void => {
    if (!scope.context.isMultiTokenKey(tokenKey)) {
        throw new Error(`Token "${tokenKey}" is not a multibind token`);
    }
};

const formatCircularDependencyPath = (path: readonly string[]): string => {
    return path.join(" -> ");
};

const createCircularDependencyPath = (
    path: readonly RuntimeResolutionFrame[],
    currentFrame: RuntimeResolutionFrame,
): readonly string[] => {
    const cycleStartIndex = findResolutionFrameIndex(path, currentFrame);
    return [...path.slice(cycleStartIndex).map(({ tokenKey }) => tokenKey), currentFrame.tokenKey];
};

const createCircularDependencyError = (action: "registering" | "resolving", path: readonly string[]): Error => {
    return new Error(`Circular dependency detected while ${action} services: ${formatCircularDependencyPath(path)}`);
};

const collectVisibleTokenKeys = (scope: RuntimeScope): Set<string> => {
    const visibleTokenKeys = scope.parent ? collectVisibleTokenKeys(scope.parent) : new Set<string>();

    for (const tokenKey of scope.bindings.keys()) {
        visibleTokenKeys.add(tokenKey);
    }

    return visibleTokenKeys;
};

const assertNoCircularDependencies = (scope: RuntimeScope): void => {
    const visited: RuntimeResolutionFrame[] = [];
    const path: RuntimeResolutionFrame[] = [];

    const visitBinding = (
        resolutionScope: RuntimeScope,
        currentTokenKey: string,
        resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
    ): void => {
        const currentFrame = createResolutionFrame(resolutionScope, currentTokenKey, resolvedBinding);

        if (visited.some((visitedFrame) => isSameResolutionFrame(visitedFrame, currentFrame))) {
            return;
        }

        if (findResolutionFrameIndex(path, currentFrame) !== -1) {
            throw createCircularDependencyError("registering", createCircularDependencyPath(path, currentFrame));
        }

        path.push(currentFrame);

        try {
            for (const dependency of resolvedBinding.binding.eagerDependencies ?? []) {
                visit(currentFrame.resolutionScope, dependency);
            }
        } finally {
            path.pop();
            visited.push(currentFrame);
        }
    };

    const visit = (resolutionScope: RuntimeScope, currentTokenKey: string): void => {
        if (!resolutionScope.context.isMultiTokenKey(currentTokenKey)) {
            const resolvedBinding = findBinding(resolutionScope, currentTokenKey);

            if (resolvedBinding) {
                visitBinding(resolutionScope, currentTokenKey, resolvedBinding);
            }

            return;
        }

        for (const resolvedBinding of findBindings(resolutionScope, currentTokenKey)) {
            visitBinding(resolutionScope, currentTokenKey, resolvedBinding);
        }
    };

    for (const currentTokenKey of collectVisibleTokenKeys(scope)) {
        visit(scope, currentTokenKey);
    }
};

const getEagerDependencyKeys = (
    dependencies: DependencyMap | undefined,
    tokenListContext: TokenListContext,
): readonly string[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencyKeys: string[] = [];

    for (const dependency of Object.values(dependencies)) {
        if (isRefDependency(dependency)) {
            continue;
        }

        if (isAllDependency(dependency)) {
            const dependencyToken = dependency.resolveToken();
            const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependencyToken);

            if (!tokenListContext.isMultiTokenKey(dependencyTokenKey)) {
                throw new Error(`Token "${dependencyTokenKey}" is not a multibind token`);
            }

            eagerDependencyKeys.push(dependencyTokenKey);
            continue;
        }

        const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependency);

        if (tokenListContext.isMultiTokenKey(dependencyTokenKey)) {
            throw new Error(`Multibind token "${dependencyTokenKey}" must be resolved with resolveAll`);
        }

        eagerDependencyKeys.push(dependencyTokenKey);
    }

    return eagerDependencyKeys;
};

const createDependencyFactory = (
    binding: AnyBinding,
    dependencies: DependencyMap,
    tokenListContext: TokenListContext,
    getOrCreateRefInstance: RefResolver,
): RuntimeFactory => {
    return (scope, dependencyTracker) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            let resolvedDependency: unknown;

            if (isRefDependency(dependency)) {
                const dependencyToken = dependency.resolveToken();
                const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependencyToken);
                assertSingleTokenKey(scope, dependencyTokenKey);
                if (dependencyTracker) {
                    addRefDependencyFrame(dependencyTracker, scope, dependencyTokenKey);
                }
                resolvedDependency = getOrCreateRefInstance(scope, dependencyToken, dependencyTracker);
            } else if (isAllDependency(dependency)) {
                const dependencyToken = dependency.resolveToken();
                const dependencyTokenKey = tokenListContext.assertTokenIsInTokenList(dependencyToken);
                assertMultiTokenKey(scope, dependencyTokenKey);
                resolvedDependency = resolveAllActualWithOwnership(
                    scope,
                    dependencyToken,
                    dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
                ).map((dependencyResult) => dependencyResult.value);
            } else {
                const dependencyResult = resolveActualWithOwnership(
                    scope,
                    dependency,
                    dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
                );
                resolvedDependency = dependencyResult.value;
            }

            Object.defineProperty(resolvedDependencies, key, {
                configurable: true,
                enumerable: true,
                value: resolvedDependency,
                writable: true,
            });
        }

        return (binding.factory as (dependencies: Record<string, unknown>) => unknown)(resolvedDependencies);
    };
};

const createRuntimeBinding = (
    binding: AnyBinding,
    tokenListContext: TokenListContext,
    getOrCreateRefInstance: RefResolver,
): RuntimeBinding => {
    const dependencies = getBindingDependencies(binding);
    const eagerDependencies = getEagerDependencyKeys(dependencies, tokenListContext);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, tokenListContext, getOrCreateRefInstance)
        : () => (binding.factory as () => unknown)();
    const dispose = binding.dispose;

    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        id: createRuntimeBindingId(),
        factory,
        lifetime: getBindingLifetime(binding),
        eagerDependencies,
        ...(dispose ? { dispose } : {}),
    };
};

const hasCachedInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
): boolean => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(scope, currentTokenKey);
    const resolvedBinding = findBinding(scope, currentTokenKey);

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

const resolveBindingWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentTokenKey: string,
    resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
    options?: ResolveOptions,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    const dependentTrackers = options?.dependentTrackers ? Array.from(options.dependentTrackers) : [];
    const currentFrame = createResolutionFrame(scope, currentTokenKey, resolvedBinding);
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

const resolveActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
): RuntimeResolutionResult<TokenValue<TToken>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(scope, currentTokenKey);
    const resolvedBinding = findBinding(scope, currentTokenKey);

    if (!resolvedBinding) {
        throw new Error(`Service "${currentTokenKey}" is not registered in the container`);
    }

    return resolveBindingWithOwnership(scope, currentTokenKey, resolvedBinding, options);
};

const resolveAllActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
): Array<TokenValue<TToken>> => {
    return resolveAllActualWithOwnership(scope, currentToken).map((dependencyResult) => dependencyResult.value);
};

const resolveAllActualWithOwnership = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
): Array<RuntimeResolutionResult<TokenValue<TToken>>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertMultiTokenKey(scope, currentTokenKey);
    assertScopeIsActive(scope);

    return findBindings(scope, currentTokenKey).map((resolvedBinding) => {
        return resolveBindingWithOwnership<TToken>(scope, currentTokenKey, resolvedBinding, options);
    });
};

const resolveActual = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    options?: ResolveOptions,
): TokenValue<TToken> => {
    return resolveActualWithOwnership(scope, currentToken, options).value;
};

const getOrCreateRefInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
    dependencyTracker: RuntimeDependencyTracker | undefined,
): Ref<TokenValue<TToken>> => {
    const currentTokenKey = scope.context.assertTokenIsInTokenList(currentToken);
    assertSingleTokenKey(scope, currentTokenKey);
    const existingInstance = scope.refInstances.get(currentTokenKey);

    if (existingInstance) {
        if (dependencyTracker) {
            existingInstance.dependencyTrackers.add(dependencyTracker);
        }
        return existingInstance.ref as Ref<TokenValue<TToken>>;
    }

    const refInstance: Ref<TokenValue<TToken>> = {
        get value() {
            const resolvedBinding = findBinding(scope, currentTokenKey);
            const isInitializing =
                resolvedBinding &&
                findResolutionFrameIndex(
                    scope.context.resolvingPath,
                    createResolutionFrame(scope, currentTokenKey, resolvedBinding),
                ) !== -1;

            const resolveOptions = {
                allowCachedDuringDispose: true,
                dependentTrackers: runtimeRefInstance.dependencyTrackers,
            };

            if (!hasCachedInstance(scope, currentToken, resolveOptions) && isInitializing) {
                const resolutionContext = getCurrentResolutionContext(scope);

                throw new Error(
                    `Ref dependency "${currentTokenKey}" was accessed before it finished initializing while resolving "${resolutionContext}"`,
                );
            }

            return resolveActualWithOwnership(scope, currentToken, resolveOptions).value;
        },
    };
    const runtimeRefInstance: RuntimeRefInstance = {
        ref: refInstance,
        dependencyTrackers: dependencyTracker ? new Set([dependencyTracker]) : new Set(),
    };

    scope.refInstances.set(currentTokenKey, runtimeRefInstance);
    return refInstance;
};

const registerBindings = (scope: RuntimeScope, bindings: readonly AnyBinding[]): void => {
    assertScopeIsActive(scope);

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        const bindingTokenKey = scope.context.assertTokenIsInTokenList(binding.token);
        const existingBindings = scope.bindings.get(bindingTokenKey);

        if (!scope.context.isMultiTokenKey(bindingTokenKey) && existingBindings) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the container`);
        }

        const runtimeBinding = createRuntimeBinding(binding, scope.context, getOrCreateRefInstance);

        if (existingBindings) {
            existingBindings.push(runtimeBinding);
        } else {
            scope.bindings.set(bindingTokenKey, [runtimeBinding]);
        }
    }

    assertNoCircularDependencies(scope);
};

const createContainerForScope = (scope: RuntimeScope): RuntimeContainer => {
    return {
        get disposed() {
            return scope.disposed;
        },
        resolve(currentToken) {
            return resolveActual(scope, currentToken);
        },
        resolveAll(currentToken) {
            return resolveAllActual(scope, currentToken);
        },
        createScope(...bindings) {
            assertScopeIsActive(scope);

            const childScope = createRuntimeScope(scope.context, scope);
            registerBindings(childScope, bindings);
            scope.children.add(childScope);

            return createContainerForScope(childScope);
        },
        dispose() {
            return disposeScope(scope);
        },
    };
};

export const createContainer = <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
    tokens: TTokenArray & ValidateTokenList<TTokenArray>,
    ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
): Container<TBindings, TTokenArray, readonly [TBindings]> => {
    const tokenListContext = createTokenListContext(tokens);
    const rootScope = createRuntimeScope({
        assertTokenIsInTokenList: tokenListContext.assertTokenIsInTokenList,
        isMultiTokenKey: tokenListContext.isMultiTokenKey,
        resolvingPath: [],
    });

    registerBindings(rootScope, bindings);

    return createContainerForScope(rootScope) as unknown as Container<TBindings, TTokenArray, readonly [TBindings]>;
};
