import { type AnyBinding, isBinding } from "../binding/index";
import { type AnyBindingOverride, collectRuntimeOverrideOperations } from "../override/index";
import type { TokenListContext } from "../token/index";
import { isMultiToken, tokenRuntimeId } from "../token/index";

export type { AnyBindingOverride };

const collectSingleBindingKeys = (tokenListContext: TokenListContext, bindings: readonly AnyBinding[]): Set<string> => {
    const bindingTokenIds = new Set<string>();

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Bindings must be created with bind");
        }

        tokenListContext.assertTokenIsInTokenList(binding.token);

        if (!isMultiToken(binding.token)) {
            bindingTokenIds.add(tokenRuntimeId(binding.token));
        }
    }

    return bindingTokenIds;
};

export const applyBindingOverrides = (
    tokenListContext: TokenListContext,
    bindings: readonly AnyBinding[],
    overrides: readonly AnyBindingOverride[],
): readonly AnyBinding[] => {
    const singleBindingKeys = collectSingleBindingKeys(tokenListContext, bindings);
    const overrideResult = collectRuntimeOverrideOperations(overrides, {
        useToken: tokenListContext.assertTokenIsInTokenList,
        hasSingleTarget: (tokenId) => singleBindingKeys.has(tokenId),
        missingSingleTargetMessage: (tokenKey) => `Service "${tokenKey}" is not registered in the container definition`,
    });

    const resolvedBindings: AnyBinding[] = [];

    for (const binding of bindings) {
        tokenListContext.assertTokenIsInTokenList(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);

        if (isMultiToken(binding.token)) {
            if (!overrideResult.multiOverrides.has(bindingTokenId)) {
                resolvedBindings.push(binding);
            }
            continue;
        }

        if (!overrideResult.singleOverrides.has(bindingTokenId) && !overrideResult.singleUnbinds.has(bindingTokenId)) {
            resolvedBindings.push(binding);
        }
    }

    resolvedBindings.push(...overrideResult.singleOverrides.values());

    for (const overrideBindings of overrideResult.multiOverrides.values()) {
        resolvedBindings.push(...overrideBindings);
    }

    return resolvedBindings;
};
