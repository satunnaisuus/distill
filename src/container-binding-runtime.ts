import type { AnyBinding } from "./bind";
import { getBindingDependencies, getBindingLifetime } from "./bind";
import { getEagerDependencyReferences } from "./container-dependency-metadata-runtime";
import { createDependencyFactory } from "./container-dependency-runtime";
import { isMultiToken } from "./container-scope-runtime";
import { assertDisposeOption } from "./dispose-option";
import { createRuntimeBindingId, defaultModuleContextId, type RuntimeBinding } from "./runtime";
import { tokenDisplayKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";
import type { TokenListContext } from "./token-list-context";

export const createRuntimeBinding = (
    binding: AnyBinding,
    tokenListContext: TokenListContext,
    moduleContextId = defaultModuleContextId,
    visibleInAllModuleContexts = true,
    visibleModuleContextIds?: readonly number[],
): RuntimeBinding => {
    const dependencies = getBindingDependencies(binding);
    const eagerDependencies = getEagerDependencyReferences(dependencies, tokenListContext);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, tokenListContext, moduleContextId)
        : () => (binding.factory as () => unknown)();
    const dispose = binding.dispose;

    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        id: createRuntimeBindingId(),
        tokenKey: tokenDisplayKey(binding.token),
        tokenKeyId: tokenKeyRuntimeId(binding.token),
        tokenId: tokenRuntimeId(binding.token),
        factory,
        lifetime: getBindingLifetime(binding),
        isMultiToken: isMultiToken(binding.token),
        dependencyModuleContextId: moduleContextId,
        visibleInAllModuleContexts,
        ...(visibleModuleContextIds ? { visibleModuleContextIds } : {}),
        eagerDependencies,
        ...(dispose ? { dispose } : {}),
    };
};
