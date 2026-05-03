import type { AnyBinding } from "./bind";
import { isBinding } from "./bind";
import { createRuntimeBinding } from "./container-binding-runtime";
import { assertNoCircularDependencies } from "./container-circular-runtime";
import { isMultiToken } from "./container-scope-runtime";
import {
    assertScopeIsActive,
    defaultModuleContextId,
    findBindings,
    publicModuleContextId,
    type RuntimeBinding,
    type RuntimeScope,
} from "./runtime";
import { tokenDisplayKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";

export type RegisterBindingsOptions = {
    readonly moduleContextId?: number;
    readonly visibleInAllModuleContexts?: boolean;
    readonly visibleModuleContextIds?: readonly number[];
    readonly allowDuplicateSingleBindings?: boolean;
    readonly validateCircularDependencies?: boolean;
};

const assertNoVisibleTokenKindCollision = (
    scope: RuntimeScope,
    tokenKeyToRegister: string,
    tokenKeyIdToRegister: string,
    bindingIsMultiToken: boolean,
    moduleContextId: number,
    visibleInAllModuleContexts: boolean,
    visibleModuleContextIds: readonly number[] | undefined,
): void => {
    const moduleGraph = scope.context.moduleGraph;

    if (!moduleGraph) {
        return;
    }

    const moduleContextIds = visibleInAllModuleContexts
        ? [publicModuleContextId, ...moduleGraph.moduleIds]
        : [moduleContextId, ...(visibleModuleContextIds ?? [])];

    for (const currentModuleContextId of new Set(moduleContextIds)) {
        const visibleBindings = findBindings(scope, tokenKeyIdToRegister, currentModuleContextId);

        if (visibleBindings.some(({ binding }) => binding.isMultiToken !== bindingIsMultiToken)) {
            throw new Error(`Token "${tokenKeyToRegister}" is already included in the token list`);
        }
    }
};

export const registerBindings = (
    scope: RuntimeScope,
    bindings: readonly AnyBinding[],
    options?: RegisterBindingsOptions,
): RuntimeBinding[] => {
    assertScopeIsActive(scope);

    const runtimeBindings: RuntimeBinding[] = [];
    const moduleContextId = options?.moduleContextId ?? defaultModuleContextId;
    const visibleInAllModuleContexts = options?.visibleInAllModuleContexts ?? true;
    const visibleModuleContextIds = options?.visibleModuleContextIds;
    const validateCircularDependencies = options?.validateCircularDependencies ?? true;

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        scope.context.registerToken(binding.token);
        const bindingTokenKey = tokenDisplayKey(binding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);
        const bindingIsMultiToken = isMultiToken(binding.token);
        const existingBindings = scope.bindings.get(bindingTokenKeyId);

        assertNoVisibleTokenKindCollision(
            scope,
            bindingTokenKey,
            bindingTokenKeyId,
            bindingIsMultiToken,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );

        if (
            !bindingIsMultiToken &&
            existingBindings?.some((existingBinding) => existingBinding.tokenId === bindingTokenId) &&
            !options?.allowDuplicateSingleBindings
        ) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the container`);
        }

        const runtimeBinding = createRuntimeBinding(
            binding,
            scope.context,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );
        runtimeBindings.push(runtimeBinding);

        if (existingBindings) {
            existingBindings.push(runtimeBinding);
        } else {
            scope.bindings.set(bindingTokenKeyId, [runtimeBinding]);
        }
    }

    if (validateCircularDependencies) {
        assertNoCircularDependencies(scope);
    }

    return runtimeBindings;
};
