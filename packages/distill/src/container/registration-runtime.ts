import { type AnyBinding, isBinding } from "../binding/index";
import {
    assertScopeIsActive,
    defaultModuleContextId,
    findBindings,
    publicModuleContextId,
    type RuntimeBinding,
    type RuntimeScope,
} from "../runtime/index";
import { getRuntimeTokenDetails } from "../token/index";
import { createRuntimeBinding } from "./binding-runtime";
import { assertNoCircularDependencies } from "./circular-runtime";

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
        const bindingTokenDetails = getRuntimeTokenDetails(binding.token);
        const existingBindings = scope.bindings.get(bindingTokenDetails.keyId);

        assertNoVisibleTokenKindCollision(
            scope,
            bindingTokenDetails.key,
            bindingTokenDetails.keyId,
            bindingTokenDetails.isMulti,
            moduleContextId,
            visibleInAllModuleContexts,
            visibleModuleContextIds,
        );

        if (
            !bindingTokenDetails.isMulti &&
            existingBindings?.some((existingBinding) => existingBinding.tokenId === bindingTokenDetails.id) &&
            !options?.allowDuplicateSingleBindings
        ) {
            throw new Error(`Service "${bindingTokenDetails.key}" is already registered in the container`);
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
            scope.bindings.set(bindingTokenDetails.keyId, [runtimeBinding]);
        }
    }

    if (validateCircularDependencies) {
        assertNoCircularDependencies(scope);
    }

    return runtimeBindings;
};
