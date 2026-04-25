import type { AnyBinding } from "./bind";
import { getBindingDependencies, isBinding } from "./bind";
import type { DependencyMap } from "./dependencies";
import type { DependencyReference, Ref } from "./ref";
import { isRefDependency } from "./ref";
import type { AnyToken, AnyTokenRegistry, TokenByKey, TokenKey, TokenValue } from "./token";
import { tokenKey } from "./token";
import type { ValidateBindings } from "./validation";

type RuntimeContainer = {
    resolve<TToken extends AnyToken>(token: TToken): TokenValue<TToken>;
};

type ResolveFn<TBindings extends readonly AnyBinding[]> = [TBindings[number]] extends [never]
    ? (token: never) => never
    : <TToken extends TBindings[number]["token"]>(
          token: TToken,
      ) => TokenValue<TokenByKey<TToken, TBindings[number]["token"]>>;

export type Container<TBindings extends readonly AnyBinding[] = []> = {
    resolve: ResolveFn<TBindings>;
};

type RuntimeFactory = (container: RuntimeContainer) => unknown;

type RuntimeBinding = {
    readonly factory: RuntimeFactory;
    readonly eagerDependencies?: readonly string[];
};

type AssertTokenIsInRegistry = <TToken extends AnyToken>(currentToken: TToken) => TokenKey<TToken>;
type RefResolver = <TToken extends AnyToken>(currentToken: TToken) => Ref<TokenValue<TToken>>;

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

const createCircularDependencyPath = (path: readonly string[], currentTokenKey: string): readonly string[] => {
    const cycleStartIndex = path.indexOf(currentTokenKey);
    return [...path.slice(cycleStartIndex), currentTokenKey];
};

const createCircularDependencyError = (action: "registering" | "resolving", path: readonly string[]): Error => {
    return new Error(`Circular dependency detected while ${action} services: ${formatCircularDependencyPath(path)}`);
};

const assertNoCircularDependencies = (bindings: ReadonlyMap<string, RuntimeBinding>): void => {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const path: string[] = [];

    const visit = (currentTokenKey: string): void => {
        if (visited.has(currentTokenKey)) {
            return;
        }

        if (visiting.has(currentTokenKey)) {
            throw createCircularDependencyError("registering", createCircularDependencyPath(path, currentTokenKey));
        }

        const binding = bindings.get(currentTokenKey);

        if (!binding) {
            return;
        }

        visiting.add(currentTokenKey);
        path.push(currentTokenKey);

        try {
            for (const dependency of binding.eagerDependencies ?? []) {
                visit(dependency);
            }
        } finally {
            path.pop();
            visiting.delete(currentTokenKey);
            visited.add(currentTokenKey);
        }
    };

    for (const currentTokenKey of bindings.keys()) {
        visit(currentTokenKey);
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
    return (container) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            if (isRefDependency(dependency)) {
                const dependencyToken = dependency.resolveToken();
                assertTokenIsInRegistry(dependencyToken);
                resolvedDependencies[key] = getOrCreateRefInstance(dependencyToken);

                continue;
            }

            resolvedDependencies[key] = container.resolve(dependency);
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
        eagerDependencies,
    };
};

export const createContainer = <
    const TRegistry extends AnyTokenRegistry,
    const TBindings extends readonly AnyBinding[],
>(
    tokens: TRegistry,
    ...bindings: TBindings & ValidateBindings<TBindings, TRegistry>
): Container<TBindings> => {
    const assertTokenIsInRegistry = createTokenRegistryAssert(tokens);
    const runtimeBindings = new Map<string, RuntimeBinding>();
    const actualInstances = new Map<string, unknown>();
    const refInstances = new Map<string, Ref<unknown>>();
    const resolvingPath: string[] = [];

    const getCurrentResolutionContext = (): string | undefined => {
        return resolvingPath.at(-1);
    };

    const resolveActual = <TToken extends AnyToken>(currentToken: TToken): TokenValue<TToken> => {
        const currentTokenKey = assertTokenIsInRegistry(currentToken);

        if (actualInstances.has(currentTokenKey)) {
            return actualInstances.get(currentTokenKey) as TokenValue<TToken>;
        }

        const binding = runtimeBindings.get(currentTokenKey);

        if (!binding) {
            throw new Error(`Service "${currentTokenKey}" is not registered in the container`);
        }

        const cycleStartIndex = resolvingPath.indexOf(currentTokenKey);

        if (cycleStartIndex !== -1) {
            throw createCircularDependencyError(
                "resolving",
                createCircularDependencyPath(resolvingPath, currentTokenKey),
            );
        }

        resolvingPath.push(currentTokenKey);

        try {
            const instance = binding.factory(runtimeContainer);
            actualInstances.set(currentTokenKey, instance);
            return instance as TokenValue<TToken>;
        } finally {
            resolvingPath.pop();
        }
    };

    const getOrCreateRefInstance = <TToken extends AnyToken>(currentToken: TToken): Ref<TokenValue<TToken>> => {
        const currentTokenKey = assertTokenIsInRegistry(currentToken);
        const existingInstance = refInstances.get(currentTokenKey);

        if (existingInstance) {
            return existingInstance as Ref<TokenValue<TToken>>;
        }

        const refInstance: Ref<TokenValue<TToken>> = {
            get value() {
                if (!actualInstances.has(currentTokenKey) && resolvingPath.includes(currentTokenKey)) {
                    const resolutionContext = getCurrentResolutionContext();

                    throw new Error(
                        resolutionContext
                            ? `Ref dependency "${currentTokenKey}" was accessed before it finished initializing while resolving "${resolutionContext}"`
                            : `Ref dependency "${currentTokenKey}" was accessed before it finished initializing`,
                    );
                }

                return resolveActual(currentToken);
            },
        };

        refInstances.set(currentTokenKey, refInstance);
        return refInstance;
    };

    let runtimeContainer: RuntimeContainer;

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        const bindingTokenKey = assertTokenIsInRegistry(binding.token);

        if (runtimeBindings.has(bindingTokenKey)) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the container`);
        }

        runtimeBindings.set(
            bindingTokenKey,
            createRuntimeBinding(binding, assertTokenIsInRegistry, getOrCreateRefInstance),
        );
    }

    assertNoCircularDependencies(runtimeBindings);

    runtimeContainer = {
        resolve(currentToken) {
            return resolveActual(currentToken);
        },
    };

    return runtimeContainer as unknown as Container<TBindings>;
};
