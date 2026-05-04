import type { AnyBinding } from "../binding/index";
import {
    type AnyRefToken,
    type DependencyMap,
    type DependencyReference,
    isAllDependency,
    isOptionalDependency,
    isRefDependency,
    type OptionalDependencyReference,
} from "../dependency/index";
import {
    findBinding,
    findBindings,
    type RuntimeDependencyTracker,
    type RuntimeFactory,
    type RuntimeScope,
    type RuntimeTokenListContext,
    type RuntimeTokenReference,
} from "../runtime/index";
import { assertMultiTokenKey, assertSingleTokenKey, getRuntimeTokenDetails } from "../token/index";
import { addRefDependencyFrame } from "./dependency-tracker";
import {
    getOrCreateRefInstance,
    resolveActualWithOwnership,
    resolveAllActualWithOwnership,
    resolveBindingWithOwnership,
} from "./resolution-runtime";

const resolveNestedOptionalDependency = (dependency: DependencyReference): OptionalDependencyReference => {
    if (isOptionalDependency(dependency)) {
        return resolveNestedOptionalDependency(dependency.resolveDependency() as DependencyReference);
    }

    return dependency;
};

export const getEagerDependencyReferences = (
    dependencies: DependencyMap | undefined,
    tokenListContext: RuntimeTokenListContext,
): readonly RuntimeTokenReference[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencies: RuntimeTokenReference[] = [];

    for (const dependencyReference of Object.values(dependencies)) {
        const dependency = resolveNestedOptionalDependency(dependencyReference);

        if (isRefDependency(dependency)) {
            continue;
        }

        if (isAllDependency(dependency)) {
            const dependencyToken = dependency.resolveToken();
            tokenListContext.registerToken(dependencyToken);
            const dependencyTokenDetails = getRuntimeTokenDetails(dependencyToken);

            if (!dependencyTokenDetails.isMulti) {
                throw new Error(`Token "${dependencyTokenDetails.key}" is not a multibind token`);
            }

            eagerDependencies.push({
                tokenKey: dependencyTokenDetails.key,
                tokenKeyId: dependencyTokenDetails.keyId,
                tokenId: dependencyTokenDetails.id,
            });
            continue;
        }

        tokenListContext.registerToken(dependency);
        const dependencyTokenDetails = getRuntimeTokenDetails(dependency);

        if (dependencyTokenDetails.isMulti) {
            throw new Error(`Multibind token "${dependencyTokenDetails.key}" must be resolved with resolveAll`);
        }

        eagerDependencies.push({
            tokenKey: dependencyTokenDetails.key,
            tokenKeyId: dependencyTokenDetails.keyId,
            tokenId: dependencyTokenDetails.id,
        });
    }

    return eagerDependencies;
};

const resolveRefDependency = (
    scope: RuntimeScope,
    dependency: AnyRefToken,
    tokenListContext: RuntimeTokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId: number,
): unknown => {
    const dependencyToken = dependency.resolveToken();
    tokenListContext.registerToken(dependencyToken);
    const dependencyTokenDetails = getRuntimeTokenDetails(dependencyToken);
    assertSingleTokenKey(dependencyTokenDetails.key, dependencyToken);
    if (dependencyTracker) {
        addRefDependencyFrame(
            dependencyTracker,
            scope,
            dependencyTokenDetails.key,
            dependencyTokenDetails.keyId,
            dependencyTokenDetails.id,
            moduleContextId,
        );
    }
    return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
};

const resolveDependencyValue = (
    scope: RuntimeScope,
    dependency: DependencyReference,
    tokenListContext: RuntimeTokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId: number,
): unknown => {
    if (isOptionalDependency(dependency)) {
        return resolveOptionalDependencyValue(
            scope,
            dependency.resolveDependency(),
            tokenListContext,
            dependencyTracker,
            moduleContextId,
        );
    }

    if (isRefDependency(dependency)) {
        return resolveRefDependency(scope, dependency, tokenListContext, dependencyTracker, moduleContextId);
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        tokenListContext.assertTokenIsInTokenList(dependencyToken);
        const dependencyTokenDetails = getRuntimeTokenDetails(dependencyToken);
        assertMultiTokenKey(dependencyTokenDetails.key, dependencyToken);
        return resolveAllActualWithOwnership(
            scope,
            dependencyToken,
            dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
            moduleContextId,
        ).map((dependencyResult) => dependencyResult.value);
    }

    const dependencyResult = resolveActualWithOwnership(
        scope,
        dependency,
        dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
        moduleContextId,
    );
    return dependencyResult.value;
};

const resolveOptionalDependencyValue = (
    scope: RuntimeScope,
    dependency: DependencyReference,
    tokenListContext: RuntimeTokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId: number,
): unknown => {
    if (isOptionalDependency(dependency)) {
        return resolveDependencyValue(scope, dependency, tokenListContext, dependencyTracker, moduleContextId);
    }

    if (isRefDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        tokenListContext.registerToken(dependencyToken);
        const dependencyTokenDetails = getRuntimeTokenDetails(dependencyToken);
        assertSingleTokenKey(dependencyTokenDetails.key, dependencyToken);

        if (!findBinding(scope, dependencyTokenDetails.keyId, moduleContextId, false, dependencyTokenDetails.id)) {
            return undefined;
        }

        if (dependencyTracker) {
            addRefDependencyFrame(
                dependencyTracker,
                scope,
                dependencyTokenDetails.key,
                dependencyTokenDetails.keyId,
                dependencyTokenDetails.id,
                moduleContextId,
            );
        }
        return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        tokenListContext.assertTokenIsInTokenList(dependencyToken);
        const dependencyTokenDetails = getRuntimeTokenDetails(dependencyToken);
        assertMultiTokenKey(dependencyTokenDetails.key, dependencyToken);

        const resolvedBindings = findBindings(
            scope,
            dependencyTokenDetails.keyId,
            moduleContextId,
            true,
            dependencyTokenDetails.id,
        );

        if (resolvedBindings.length === 0) {
            return undefined;
        }

        return resolvedBindings.map((resolvedBinding) => {
            return resolveBindingWithOwnership(
                scope,
                dependencyTokenDetails.key,
                resolvedBinding,
                dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
                moduleContextId,
            ).value;
        });
    }

    tokenListContext.assertTokenIsInTokenList(dependency);
    const dependencyTokenDetails = getRuntimeTokenDetails(dependency);
    assertSingleTokenKey(dependencyTokenDetails.key, dependency);

    if (!findBinding(scope, dependencyTokenDetails.keyId, moduleContextId, false, dependencyTokenDetails.id)) {
        return undefined;
    }

    return resolveDependencyValue(scope, dependency, tokenListContext, dependencyTracker, moduleContextId);
};

export const createDependencyFactory = (
    binding: AnyBinding,
    dependencies: DependencyMap,
    tokenListContext: RuntimeTokenListContext,
    moduleContextId: number,
): RuntimeFactory => {
    return (scope, dependencyTracker) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            const resolvedDependency = isOptionalDependency(dependency)
                ? resolveOptionalDependencyValue(
                      scope,
                      dependency,
                      tokenListContext,
                      dependencyTracker,
                      moduleContextId,
                  )
                : resolveDependencyValue(scope, dependency, tokenListContext, dependencyTracker, moduleContextId);

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
