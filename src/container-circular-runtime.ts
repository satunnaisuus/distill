import {
    createResolutionFrame,
    defaultModuleContextId,
    findBinding,
    findBindings,
    findResolutionFrameIndex,
    isSameResolutionFrame,
    publicModuleContextId,
    type RuntimeBinding,
    type RuntimeResolutionFrame,
    type RuntimeScope,
    type RuntimeTokenReference,
} from "./runtime";

const formatCircularDependencyPath = (path: readonly string[]): string => {
    return path.join(" -> ");
};

export const createCircularDependencyPath = (
    path: readonly RuntimeResolutionFrame[],
    currentFrame: RuntimeResolutionFrame,
): readonly string[] => {
    const cycleStartIndex = findResolutionFrameIndex(path, currentFrame);
    return [...path.slice(cycleStartIndex).map(({ tokenKey }) => tokenKey), currentFrame.tokenKey];
};

export const createCircularDependencyError = (action: "registering" | "resolving", path: readonly string[]): Error => {
    return new Error(`Circular dependency detected while ${action} services: ${formatCircularDependencyPath(path)}`);
};

const collectVisibleTokenReferences = (scope: RuntimeScope): ReadonlyMap<string, RuntimeTokenReference> => {
    const visibleTokenReferences = new Map(scope.parent ? collectVisibleTokenReferences(scope.parent) : undefined);

    for (const [tokenKeyId, bindings] of scope.bindings) {
        for (const binding of bindings) {
            const tokenReference = { tokenKey: binding.tokenKey, tokenKeyId, tokenId: binding.tokenId };

            visibleTokenReferences.set(`${tokenKeyId}\u0000${binding.tokenId}`, tokenReference);
        }
    }

    return visibleTokenReferences;
};

export const assertNoCircularDependencies = (scope: RuntimeScope): void => {
    const visited: RuntimeResolutionFrame[] = [];
    const path: RuntimeResolutionFrame[] = [];
    const moduleContextIds = scope.context.moduleGraph
        ? [publicModuleContextId, ...scope.context.moduleGraph.moduleIds]
        : [defaultModuleContextId];

    const visitBinding = (
        resolutionScope: RuntimeScope,
        currentToken: RuntimeTokenReference,
        resolvedBinding: { readonly binding: RuntimeBinding; readonly ownerScope: RuntimeScope },
        moduleContextId: number,
    ): void => {
        const currentFrame = createResolutionFrame(
            resolutionScope,
            currentToken.tokenKey,
            resolvedBinding,
            moduleContextId,
        );

        if (visited.some((visitedFrame) => isSameResolutionFrame(visitedFrame, currentFrame))) {
            return;
        }

        if (findResolutionFrameIndex(path, currentFrame) !== -1) {
            throw createCircularDependencyError("registering", createCircularDependencyPath(path, currentFrame));
        }

        path.push(currentFrame);

        try {
            for (const dependency of resolvedBinding.binding.eagerDependencies ?? []) {
                visit(currentFrame.resolutionScope, dependency, resolvedBinding.binding.dependencyModuleContextId);
            }
        } finally {
            path.pop();
            visited.push(currentFrame);
        }
    };

    const visit = (
        resolutionScope: RuntimeScope,
        currentToken: RuntimeTokenReference,
        moduleContextId: number,
    ): void => {
        const multibindings = findBindings(
            resolutionScope,
            currentToken.tokenKeyId,
            moduleContextId,
            true,
            currentToken.tokenId,
        );

        if (multibindings.length > 0) {
            for (const resolvedBinding of multibindings) {
                visitBinding(resolutionScope, currentToken, resolvedBinding, moduleContextId);
            }

            return;
        }

        const resolvedBinding = findBinding(
            resolutionScope,
            currentToken.tokenKeyId,
            moduleContextId,
            false,
            currentToken.tokenId,
        );

        if (resolvedBinding) {
            visitBinding(resolutionScope, currentToken, resolvedBinding, moduleContextId);
        }
    };

    for (const moduleContextId of moduleContextIds) {
        for (const currentToken of collectVisibleTokenReferences(scope).values()) {
            visit(scope, currentToken, moduleContextId);
        }
    }
};
