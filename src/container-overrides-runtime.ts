import type { AnyBinding } from "./bind";
import { isBinding } from "./bind";
import type { AnyBindingOverride } from "./override";
import { collectRuntimeOverrideOperations } from "./override-runtime";
import type { AnyToken } from "./token";
import { isRuntimeMultiToken, tokenRuntimeId } from "./token";
import type { TokenListContext } from "./token-list-context";

const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken);
};

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
