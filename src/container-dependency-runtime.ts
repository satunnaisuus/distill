import { isAllDependency } from "./all";
import type { AnyBinding } from "./bind";
import {
    getOrCreateRefInstance,
    resolveActualWithOwnership,
    resolveAllActualWithOwnership,
    resolveBindingWithOwnership,
} from "./container-resolution-runtime";
import { assertMultiTokenKey, assertSingleTokenKey } from "./container-scope-runtime";
import type { DependencyMap } from "./dependencies";
import { addRefDependencyFrame } from "./dependency-tracker";
import { isOptionalDependency } from "./optional";
import type { AnyRefToken, DependencyReference } from "./ref";
import { isRefDependency } from "./ref";
import {
    findBinding,
    findBindings,
    type RuntimeDependencyTracker,
    type RuntimeFactory,
    type RuntimeScope,
} from "./runtime";
import { tokenDisplayKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";
import type { TokenListContext } from "./token-list-context";

const resolveRefDependency = (
    scope: RuntimeScope,
    dependency: AnyRefToken,
    tokenListContext: TokenListContext,
    dependencyTracker: RuntimeDependencyTracker | undefined,
    moduleContextId: number,
): unknown => {
    const dependencyToken = dependency.resolveToken();
    tokenListContext.registerToken(dependencyToken);
    const dependencyTokenKey = tokenDisplayKey(dependencyToken);
    const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
    const dependencyTokenId = tokenRuntimeId(dependencyToken);
    assertSingleTokenKey(dependencyTokenKey, dependencyToken);
    if (dependencyTracker) {
        addRefDependencyFrame(
            dependencyTracker,
            scope,
            dependencyTokenKey,
            dependencyTokenKeyId,
            dependencyTokenId,
            moduleContextId,
        );
    }
    return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
};

const resolveDependencyValue = (
    scope: RuntimeScope,
    dependency: DependencyReference,
    tokenListContext: TokenListContext,
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
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
        assertMultiTokenKey(dependencyTokenKey, dependencyToken);
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
    tokenListContext: TokenListContext,
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
        const dependencyToken = dependency.resolveToken();
        tokenListContext.registerToken(dependencyToken);
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
        const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
        const dependencyTokenId = tokenRuntimeId(dependencyToken);
        assertSingleTokenKey(dependencyTokenKey, dependencyToken);

        if (!findBinding(scope, dependencyTokenKeyId, moduleContextId, false, dependencyTokenId)) {
            return undefined;
        }

        if (dependencyTracker) {
            addRefDependencyFrame(
                dependencyTracker,
                scope,
                dependencyTokenKey,
                dependencyTokenKeyId,
                dependencyTokenId,
                moduleContextId,
            );
        }
        return getOrCreateRefInstance(scope, dependencyToken, dependencyTracker, moduleContextId);
    }

    if (isAllDependency(dependency)) {
        const dependencyToken = dependency.resolveToken();
        tokenListContext.assertTokenIsInTokenList(dependencyToken);
        const dependencyTokenKey = tokenDisplayKey(dependencyToken);
        const dependencyTokenKeyId = tokenKeyRuntimeId(dependencyToken);
        const dependencyTokenId = tokenRuntimeId(dependencyToken);
        assertMultiTokenKey(dependencyTokenKey, dependencyToken);

        const resolvedBindings = findBindings(scope, dependencyTokenKeyId, moduleContextId, true, dependencyTokenId);

        if (resolvedBindings.length === 0) {
            return undefined;
        }

        return resolvedBindings.map((resolvedBinding) => {
            return resolveBindingWithOwnership(
                scope,
                dependencyTokenKey,
                resolvedBinding,
                dependencyTracker ? { dependentTrackers: [dependencyTracker] } : undefined,
                moduleContextId,
            ).value;
        });
    }

    tokenListContext.assertTokenIsInTokenList(dependency);
    const dependencyTokenKey = tokenDisplayKey(dependency);
    const dependencyTokenKeyId = tokenKeyRuntimeId(dependency);
    const dependencyTokenId = tokenRuntimeId(dependency);
    assertSingleTokenKey(dependencyTokenKey, dependency);

    if (!findBinding(scope, dependencyTokenKeyId, moduleContextId, false, dependencyTokenId)) {
        return undefined;
    }

    return resolveDependencyValue(scope, dependency, tokenListContext, dependencyTracker, moduleContextId);
};

export const createDependencyFactory = (
    binding: AnyBinding,
    dependencies: DependencyMap,
    tokenListContext: TokenListContext,
    moduleContextId: number,
): RuntimeFactory => {
    return (scope, dependencyTracker) => {
        const resolvedDependencies: Record<string, unknown> = {};

        for (const [key, dependency] of Object.entries(dependencies) as Array<[string, DependencyReference]>) {
            const resolvedDependency = isOptionalDependency(dependency)
                ? resolveOptionalDependencyValue(
                      scope,
                      dependency.resolveDependency(),
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
