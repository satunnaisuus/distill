import { type AnyBinding, assertDisposeOption, getBindingDependencies, getBindingLifetime } from "../binding/index";
import {
    createRuntimeBindingId,
    defaultModuleContextId,
    type RuntimeBinding,
    type RuntimeTokenListContext,
} from "../runtime/index";
import { getRuntimeTokenDetails } from "../token/index";
import { createDependencyFactory, getEagerDependencyReferences } from "./dependency-runtime";

type RuntimeBindingDependencies = NonNullable<Parameters<typeof getEagerDependencyReferences>[0]>;

export const createRuntimeBinding = (
    binding: AnyBinding,
    tokenListContext: RuntimeTokenListContext,
    moduleContextId = defaultModuleContextId,
    visibleInAllModuleContexts = true,
    visibleModuleContextIds?: readonly number[],
): RuntimeBinding => {
    const dependencies = getBindingDependencies(binding) as RuntimeBindingDependencies | undefined;
    const eagerDependencies = getEagerDependencyReferences(dependencies, tokenListContext);
    const bindingTokenDetails = getRuntimeTokenDetails(binding.token);
    const factory = dependencies
        ? createDependencyFactory(binding, dependencies, tokenListContext, moduleContextId)
        : () => (binding.factory as () => unknown)();
    const dispose = binding.dispose;

    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        id: createRuntimeBindingId(),
        tokenKey: bindingTokenDetails.key,
        tokenKeyId: bindingTokenDetails.keyId,
        tokenId: bindingTokenDetails.id,
        factory,
        lifetime: getBindingLifetime(binding),
        isMultiToken: bindingTokenDetails.isMulti,
        dependencyModuleContextId: moduleContextId,
        visibleInAllModuleContexts,
        ...(visibleModuleContextIds ? { visibleModuleContextIds } : {}),
        eagerDependencies,
        ...(dispose ? { dispose } : {}),
    };
};
