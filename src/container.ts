import type { AnyBinding } from "./bind";
import { type BindingLifetime, getBindingDependencies, getBindingLifetime, isBinding } from "./bind";
import type { DependencyMap } from "./dependencies";
import type {
    BindingDependencyScopes,
    BindingDependencyTokens,
    BindingResolution,
    BindingScopes,
    HasBindingLifetime,
    HasFalse,
    HasResolutionNode,
    HasTrue,
    ResolutionNode,
    ResolveBindingInScopes,
    SameTokenKey,
} from "./graph";
import type { DependencyReference, Ref } from "./ref";
import { isRefDependency } from "./ref";
import type { AnyToken, AnyTokenRegistry, TokenByKey, TokenKey, TokenValue } from "./token";
import { tokenKey } from "./token";
import type { ValidateBindings, ValidateScopeBindings } from "./validation";

type RuntimeContainer = {
    resolve<TToken extends AnyToken>(token: TToken): TokenValue<TToken>;
    createScope(...bindings: readonly AnyBinding[]): RuntimeContainer;
};

type CanResolveTokensInScopes<TScopes extends BindingScopes, TTokens extends AnyToken, TPath extends ResolutionNode> = [
    TTokens,
] extends [never]
    ? true
    : HasFalse<TTokens extends AnyToken ? CanResolveTokenInScopes<TScopes, TTokens, TPath> : false> extends true
      ? false
      : true;

type CanResolveFromResolvedBinding<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
    TBinding extends AnyBinding,
    TOwnerScopes extends BindingScopes,
> =
    BindingDependencyScopes<TBinding, TOwnerScopes, TScopes> extends infer TDependencyScopes extends BindingScopes
        ? TDependencyScopes extends BindingScopes
            ? ResolutionNode<TToken, TOwnerScopes, TDependencyScopes> extends infer TCurrentNode extends ResolutionNode
                ? HasResolutionNode<TPath, TCurrentNode> extends true
                    ? true
                    : CanResolveTokensInScopes<
                          TDependencyScopes,
                          BindingDependencyTokens<TBinding>,
                          TPath | TCurrentNode
                      >
                : false
            : false
        : false;

type CanResolveSingleTokenInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode,
> =
    ResolveBindingInScopes<TScopes, TToken> extends infer TResolution
        ? [TResolution] extends [never]
            ? false
            : HasFalse<
                    TResolution extends BindingResolution<infer TBinding, infer TOwnerScopes>
                        ? TBinding extends AnyBinding
                            ? CanResolveFromResolvedBinding<TScopes, TToken, TPath, TBinding, TOwnerScopes>
                            : false
                        : false
                > extends true
              ? false
              : true
        : false;

type CanResolveTokenInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends ResolutionNode = never,
> = TToken extends AnyToken ? CanResolveSingleTokenInScopes<TScopes, TToken, TPath> : false;

type VisibleTokensInScopes<TScopes extends BindingScopes> = TScopes[number][number]["token"];

type ResolvableTokensInScopes<TScopes extends BindingScopes> =
    VisibleTokensInScopes<TScopes> extends infer TToken extends AnyToken
        ? TToken extends AnyToken
            ? CanResolveTokenInScopes<TScopes, TToken> extends true
                ? TToken
                : never
            : never
        : never;

type ResolveFn<TScopes extends BindingScopes> = [ResolvableTokensInScopes<TScopes>] extends [never]
    ? (token: never) => never
    : <TToken extends ResolvableTokensInScopes<TScopes>>(
          token: TToken,
      ) => TokenValue<TokenByKey<TToken, ResolvableTokensInScopes<TScopes>>>;

type HasBindingToken<TBindings extends readonly AnyBinding[], TToken extends AnyToken> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? SameTokenKey<TCurrentBinding["token"], TToken> extends true
        ? true
        : HasBindingToken<TRemainingBindings, TToken>
    : false;

type HasBindingTokenInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TScopes extends readonly [
    infer TCurrentScope extends readonly AnyBinding[],
    ...infer TRemainingScopes extends BindingScopes,
]
    ? HasBindingToken<TCurrentScope, TToken> extends true
        ? true
        : HasBindingTokenInScopes<TRemainingScopes, TToken>
    : false;

type SplitScopeAfterBindingToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TBefore extends readonly AnyBinding[] = readonly [],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? SameTokenKey<TCurrentBinding["token"], TToken> extends true
        ? readonly [readonly [...TBefore, TCurrentBinding], TRemainingBindings]
        : SplitScopeAfterBindingToken<TRemainingBindings, TToken, readonly [...TBefore, TCurrentBinding]>
    : readonly [TBindings, readonly []];

type AppendBindingToLastScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? readonly [...TRemainingScopes, readonly [...TCurrentScope, TBinding]]
    : readonly [readonly [TBinding]];

type AppendBindingToNewScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = readonly [
    ...TScopes,
    readonly [TBinding],
];

type LastBinding<TBindings extends readonly AnyBinding[]> = TBindings extends readonly [
    ...infer _TRemainingBindings extends readonly AnyBinding[],
    infer TLastBinding extends AnyBinding,
]
    ? TLastBinding
    : never;

type HasSingletonDependencyOnToken<TBinding extends AnyBinding, TToken extends AnyToken> =
    HasBindingLifetime<TBinding, "singleton"> extends true
        ? HasTrue<
              BindingDependencyTokens<TBinding> extends infer TDependencyToken
                  ? TDependencyToken extends AnyToken
                      ? SameTokenKey<TDependencyToken, TToken>
                      : false
                  : false
          >
        : false;

type SplitBeforeSingletonDependencyOnToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TBefore extends readonly AnyBinding[] = readonly [],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? HasSingletonDependencyOnToken<TCurrentBinding, TToken> extends true
        ? readonly [TBefore, TBindings]
        : SplitBeforeSingletonDependencyOnToken<TRemainingBindings, TToken, readonly [...TBefore, TCurrentBinding]>
    : readonly [TBefore, readonly []];

type AppendOverrideBinding<TScopes extends BindingScopes, TBinding extends AnyBinding> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? SplitScopeAfterBindingToken<TCurrentScope, TBinding["token"]> extends readonly [
          infer TKeptScope extends readonly AnyBinding[],
          infer TBindingsAfterOverride extends readonly AnyBinding[],
      ]
        ? HasBindingLifetime<LastBinding<TKeptScope>, "scoped"> extends true
            ? SplitBeforeSingletonDependencyOnToken<TBindingsAfterOverride, TBinding["token"]> extends readonly [
                  infer TUnmovedBindings extends readonly AnyBinding[],
                  infer TMovedBindings extends readonly AnyBinding[],
              ]
                ? TMovedBindings extends readonly []
                    ? AppendBindingToNewScope<TScopes, TBinding>
                    : readonly [
                          ...TRemainingScopes,
                          readonly [...TKeptScope, ...TUnmovedBindings],
                          readonly [...TMovedBindings, TBinding],
                      ]
                : never
            : AppendBindingToNewScope<TScopes, TBinding>
        : never
    : readonly [readonly [TBinding]];

type AppendInferredBindingScope<TScopes extends BindingScopes, TBinding extends AnyBinding> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? HasBindingToken<TCurrentScope, TBinding["token"]> extends true
        ? AppendOverrideBinding<TScopes, TBinding>
        : HasBindingTokenInScopes<TRemainingScopes, TBinding["token"]> extends true
          ? AppendBindingToNewScope<TScopes, TBinding>
          : AppendBindingToLastScope<TScopes, TBinding>
    : readonly [readonly [TBinding]];

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
    TRegistry extends AnyTokenRegistry,
    TScopes extends BindingScopes,
> = <const TScopeBindings extends readonly AnyBinding[]>(
    ...bindings: TScopeBindings & ValidateScopeBindings<TScopeBindings, TRegistry, TScopes>
) => Container<readonly [...TBindings, ...TScopeBindings], TRegistry, readonly [...TScopes, TScopeBindings]>;

export type Container<
    TBindings extends readonly AnyBinding[] = [],
    TRegistry extends AnyTokenRegistry = AnyTokenRegistry,
    TScopes extends BindingScopes = InferBindingScopes<TBindings>,
> = {
    resolve: ResolveFn<TScopes>;
    createScope: CreateScopeFn<TBindings, TRegistry, TScopes>;
};

type RuntimeFactory = (scope: RuntimeScope) => unknown;

type RuntimeBinding = {
    readonly factory: RuntimeFactory;
    readonly lifetime: BindingLifetime;
    readonly eagerDependencies?: readonly string[];
};

type AssertTokenIsInRegistry = <TToken extends AnyToken>(currentToken: TToken) => TokenKey<TToken>;
type RefResolver = <TToken extends AnyToken>(scope: RuntimeScope, currentToken: TToken) => Ref<TokenValue<TToken>>;

type RuntimeContext = {
    readonly assertTokenIsInRegistry: AssertTokenIsInRegistry;
    readonly resolvingPath: RuntimeResolutionFrame[];
};

type RuntimeScope = {
    readonly context: RuntimeContext;
    readonly parent?: RuntimeScope;
    readonly bindings: Map<string, RuntimeBinding>;
    readonly singletonInstances: Map<string, unknown>;
    readonly scopedInstances: Map<string, unknown>;
    readonly refInstances: Map<string, Ref<unknown>>;
};

type ResolvedRuntimeBinding = {
    readonly binding: RuntimeBinding;
    readonly ownerScope: RuntimeScope;
};

type RuntimeResolutionFrame = {
    readonly tokenKey: string;
    readonly ownerScope: RuntimeScope;
    readonly resolutionScope: RuntimeScope;
};

const isSameResolutionFrame = (left: RuntimeResolutionFrame, right: RuntimeResolutionFrame): boolean => {
    return (
        left.tokenKey === right.tokenKey &&
        left.ownerScope === right.ownerScope &&
        left.resolutionScope === right.resolutionScope
    );
};

const findResolutionFrameIndex = (path: readonly RuntimeResolutionFrame[], frame: RuntimeResolutionFrame): number => {
    return path.findIndex((currentFrame) => isSameResolutionFrame(currentFrame, frame));
};

const createResolutionFrame = (
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

const createTokenRegistryAssert = <TRegistry extends AnyTokenRegistry>(tokens: TRegistry): AssertTokenIsInRegistry => {
    const registeredTokenKeys = new Set<string>(Object.values(tokens) as string[]);

    return <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
        const currentTokenKey = tokenKey(currentToken);

        if (!registeredTokenKeys.has(currentTokenKey)) {
            throw new Error(`Token "${currentTokenKey}" is not registered in the registry`);
        }

        return currentTokenKey;
    };
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

const findBinding = (scope: RuntimeScope, tokenKey: string): ResolvedRuntimeBinding | undefined => {
    const binding = scope.bindings.get(tokenKey);

    if (binding) {
        return {
            binding,
            ownerScope: scope,
        };
    }

    return scope.parent ? findBinding(scope.parent, tokenKey) : undefined;
};

const assertNoCircularDependencies = (scope: RuntimeScope): void => {
    const visited: RuntimeResolutionFrame[] = [];
    const path: RuntimeResolutionFrame[] = [];

    const visit = (resolutionScope: RuntimeScope, currentTokenKey: string): void => {
        const resolvedBinding = findBinding(resolutionScope, currentTokenKey);

        if (!resolvedBinding) {
            return;
        }

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

    for (const currentTokenKey of collectVisibleTokenKeys(scope)) {
        visit(scope, currentTokenKey);
    }
};

const getEagerDependencyKeys = (
    dependencies: DependencyMap | undefined,
    assertTokenIsInRegistry: AssertTokenIsInRegistry,
): readonly string[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencyKeys: string[] = [];

    for (const dependency of Object.values(dependencies)) {
        if (!isRefDependency(dependency)) {
            eagerDependencyKeys.push(assertTokenIsInRegistry(dependency));
        }
    }

    return eagerDependencyKeys;
};

const createDependencyFactory = (
    binding: AnyBinding,
    dependencies: DependencyMap,
    assertTokenIsInRegistry: AssertTokenIsInRegistry,
    getOrCreateRefInstance: RefResolver,
): RuntimeFactory => {
    return (scope) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            let resolvedDependency: unknown;

            if (isRefDependency(dependency)) {
                const dependencyToken = dependency.resolveToken();
                assertTokenIsInRegistry(dependencyToken);
                resolvedDependency = getOrCreateRefInstance(scope, dependencyToken);
            } else {
                resolvedDependency = resolveActual(scope, dependency);
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
    assertTokenIsInRegistry: AssertTokenIsInRegistry,
    getOrCreateRefInstance: RefResolver,
): RuntimeBinding => {
    const dependencies = getBindingDependencies(binding);
    const eagerDependencies = getEagerDependencyKeys(dependencies, assertTokenIsInRegistry);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, assertTokenIsInRegistry, getOrCreateRefInstance)
        : () => (binding.factory as () => unknown)();

    return {
        factory,
        lifetime: getBindingLifetime(binding),
        eagerDependencies,
    };
};

const createRuntimeScope = (context: RuntimeContext, parent?: RuntimeScope): RuntimeScope => {
    return {
        context,
        parent,
        bindings: new Map(),
        singletonInstances: new Map(),
        scopedInstances: new Map(),
        refInstances: new Map(),
    };
};

const getCurrentResolutionContext = (scope: RuntimeScope): string => {
    return scope.context.resolvingPath[scope.context.resolvingPath.length - 1].tokenKey;
};

const getInstanceCache = (
    binding: RuntimeBinding,
    ownerScope: RuntimeScope,
    resolutionScope: RuntimeScope,
): Map<string, unknown> | undefined => {
    if (binding.lifetime === "transient") {
        return undefined;
    }

    return binding.lifetime === "singleton" ? ownerScope.singletonInstances : resolutionScope.scopedInstances;
};

const hasCachedInstance = <TToken extends AnyToken>(scope: RuntimeScope, currentToken: TToken): boolean => {
    const currentTokenKey = scope.context.assertTokenIsInRegistry(currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKey);

    if (!resolvedBinding) {
        return false;
    }

    return getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope)?.has(currentTokenKey) ?? false;
};

const resolveActual = <TToken extends AnyToken>(scope: RuntimeScope, currentToken: TToken): TokenValue<TToken> => {
    const currentTokenKey = scope.context.assertTokenIsInRegistry(currentToken);
    const resolvedBinding = findBinding(scope, currentTokenKey);

    if (!resolvedBinding) {
        throw new Error(`Service "${currentTokenKey}" is not registered in the container`);
    }

    const instanceCache = getInstanceCache(resolvedBinding.binding, resolvedBinding.ownerScope, scope);

    if (instanceCache?.has(currentTokenKey)) {
        return instanceCache.get(currentTokenKey) as TokenValue<TToken>;
    }

    const currentFrame = createResolutionFrame(scope, currentTokenKey, resolvedBinding);
    const cycleStartIndex = findResolutionFrameIndex(scope.context.resolvingPath, currentFrame);

    if (cycleStartIndex !== -1) {
        throw createCircularDependencyError(
            "resolving",
            createCircularDependencyPath(scope.context.resolvingPath, currentFrame),
        );
    }

    scope.context.resolvingPath.push(currentFrame);

    try {
        const instance = resolvedBinding.binding.factory(currentFrame.resolutionScope);
        instanceCache?.set(currentTokenKey, instance);
        return instance as TokenValue<TToken>;
    } finally {
        scope.context.resolvingPath.pop();
    }
};

const getOrCreateRefInstance = <TToken extends AnyToken>(
    scope: RuntimeScope,
    currentToken: TToken,
): Ref<TokenValue<TToken>> => {
    const currentTokenKey = scope.context.assertTokenIsInRegistry(currentToken);
    const existingInstance = scope.refInstances.get(currentTokenKey);

    if (existingInstance) {
        return existingInstance as Ref<TokenValue<TToken>>;
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

            if (!hasCachedInstance(scope, currentToken) && isInitializing) {
                const resolutionContext = getCurrentResolutionContext(scope);

                throw new Error(
                    `Ref dependency "${currentTokenKey}" was accessed before it finished initializing while resolving "${resolutionContext}"`,
                );
            }

            return resolveActual(scope, currentToken);
        },
    };

    scope.refInstances.set(currentTokenKey, refInstance);
    return refInstance;
};

const registerBindings = (scope: RuntimeScope, bindings: readonly AnyBinding[]): void => {
    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        const bindingTokenKey = scope.context.assertTokenIsInRegistry(binding.token);

        if (scope.bindings.has(bindingTokenKey)) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the container`);
        }

        scope.bindings.set(
            bindingTokenKey,
            createRuntimeBinding(binding, scope.context.assertTokenIsInRegistry, getOrCreateRefInstance),
        );
    }

    assertNoCircularDependencies(scope);
};

const createContainerForScope = (scope: RuntimeScope): RuntimeContainer => {
    return {
        resolve(currentToken) {
            return resolveActual(scope, currentToken);
        },
        createScope(...bindings) {
            const childScope = createRuntimeScope(scope.context, scope);
            registerBindings(childScope, bindings);

            return createContainerForScope(childScope);
        },
    };
};

export const createContainer = <
    const TRegistry extends AnyTokenRegistry,
    const TBindings extends readonly AnyBinding[],
>(
    tokens: TRegistry,
    ...bindings: TBindings & ValidateBindings<TBindings, TRegistry>
): Container<TBindings, TRegistry, readonly [TBindings]> => {
    const assertTokenIsInRegistry = createTokenRegistryAssert(tokens);
    const rootScope = createRuntimeScope({
        assertTokenIsInRegistry,
        resolvingPath: [],
    });

    registerBindings(rootScope, bindings);

    return createContainerForScope(rootScope) as unknown as Container<TBindings, TRegistry, readonly [TBindings]>;
};
