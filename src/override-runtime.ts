import type { AnyBinding } from "./bind";
import { isBinding } from "./bind";
import type { AnyBindingOverride } from "./override";
import { isBindingOverride, isBindingOverrideAll, isBindingUnbind } from "./override";
import type { AnyToken } from "./token";
import { isRuntimeMultiToken, tokenDisplayKey, tokenRuntimeId } from "./token";

type RuntimeOverrideCollectorBaseOptions = {
    readonly useToken: (currentToken: AnyToken) => unknown;
    readonly hasSingleTarget: (tokenId: string) => boolean;
    readonly missingSingleTargetMessage: (tokenKey: string) => string;
    readonly markOverriddenToken?: (currentToken: AnyToken) => void;
    readonly excludeOverriddenTokens?: boolean;
};

type RuntimeOverrideCollectorMultiTargetOptions =
    | {
          readonly hasMultiTarget?: never;
          readonly missingMultiTargetMessage?: never;
      }
    | {
          readonly hasMultiTarget: (tokenId: string) => boolean;
          readonly missingMultiTargetMessage: (tokenKey: string) => string;
      };

type RuntimeOverrideCollectorOptions = RuntimeOverrideCollectorBaseOptions & RuntimeOverrideCollectorMultiTargetOptions;

export type RuntimeOverrideCollection = {
    readonly singleOverrides: ReadonlyMap<string, AnyBinding>;
    readonly singleUnbinds: ReadonlySet<string>;
    readonly multiOverrides: ReadonlyMap<string, readonly AnyBinding[]>;
    readonly overrideBindings: readonly AnyBinding[];
    readonly excludedTokenIds: ReadonlySet<string>;
    readonly singleOverrideTokenIds: ReadonlySet<string>;
    readonly singleUnbindTokenIds: ReadonlySet<string>;
    readonly multiOverrideTokenIds: ReadonlySet<string>;
    readonly overrideBindingTokenIds: ReadonlySet<string>;
};

const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken);
};

export const collectRuntimeOverrideOperations = (
    overrides: readonly AnyBindingOverride[],
    options: RuntimeOverrideCollectorOptions,
): RuntimeOverrideCollection => {
    const singleOverrides = new Map<string, AnyBinding>();
    const singleUnbinds = new Set<string>();
    const multiOverrides = new Map<string, readonly AnyBinding[]>();
    const overrideBindings: AnyBinding[] = [];
    const excludedTokenIds = new Set<string>();
    const singleOperationTokenIds = new Set<string>();
    const singleOverrideTokenIds = new Set<string>();
    const singleUnbindTokenIds = new Set<string>();
    const multiOverrideTokenIds = new Set<string>();
    const overrideBindingTokenIds = new Set<string>();

    for (const currentOverride of overrides) {
        if (isBindingOverride(currentOverride)) {
            const binding = currentOverride.binding;

            if (!isBinding(binding)) {
                throw new Error("Override bindings must be created with bind");
            }

            options.useToken(binding.token);
            const bindingTokenKey = tokenDisplayKey(binding.token);
            const bindingTokenId = tokenRuntimeId(binding.token);

            if (isMultiToken(binding.token)) {
                throw new Error(`Multibind token "${bindingTokenKey}" must be overridden with overrideAll`);
            }

            if (!options.hasSingleTarget(bindingTokenId)) {
                throw new Error(options.missingSingleTargetMessage(bindingTokenKey));
            }

            if (singleOperationTokenIds.has(bindingTokenId)) {
                throw new Error(`Service "${bindingTokenKey}" is already overridden`);
            }

            options.markOverriddenToken?.(binding.token);
            if (options.excludeOverriddenTokens) {
                excludedTokenIds.add(bindingTokenId);
            }
            overrideBindingTokenIds.add(bindingTokenId);
            singleOperationTokenIds.add(bindingTokenId);
            singleOverrideTokenIds.add(bindingTokenId);
            singleOverrides.set(bindingTokenId, binding);
            overrideBindings.push(binding);
            continue;
        }

        if (isBindingUnbind(currentOverride)) {
            options.useToken(currentOverride.token);
            const unbindTokenKey = tokenDisplayKey(currentOverride.token);
            const unbindTokenId = tokenRuntimeId(currentOverride.token);

            if (isMultiToken(currentOverride.token)) {
                throw new Error(`Multibind token "${unbindTokenKey}" must be removed with overrideAll`);
            }

            if (!options.hasSingleTarget(unbindTokenId)) {
                throw new Error(options.missingSingleTargetMessage(unbindTokenKey));
            }

            if (singleOperationTokenIds.has(unbindTokenId)) {
                throw new Error(`Service "${unbindTokenKey}" is already overridden`);
            }

            options.markOverriddenToken?.(currentOverride.token);
            if (options.excludeOverriddenTokens) {
                excludedTokenIds.add(unbindTokenId);
            }
            singleOperationTokenIds.add(unbindTokenId);
            singleUnbindTokenIds.add(unbindTokenId);
            singleUnbinds.add(unbindTokenId);
            continue;
        }

        if (isBindingOverrideAll(currentOverride)) {
            options.useToken(currentOverride.token);
            const overrideTokenKey = tokenDisplayKey(currentOverride.token);
            const overrideTokenId = tokenRuntimeId(currentOverride.token);

            if (!isMultiToken(currentOverride.token)) {
                throw new Error(`Token "${overrideTokenKey}" is not a multibind token`);
            }

            if (options.hasMultiTarget && !options.hasMultiTarget(overrideTokenId)) {
                throw new Error(options.missingMultiTargetMessage(overrideTokenKey));
            }

            if (multiOverrideTokenIds.has(overrideTokenId)) {
                throw new Error(`Multibind token "${overrideTokenKey}" is already overridden`);
            }

            if (!Array.isArray(currentOverride.bindings)) {
                throw new Error("overrideAll bindings must be an array");
            }

            for (const binding of currentOverride.bindings) {
                if (!isBinding(binding)) {
                    throw new Error("overrideAll bindings must be created with bind");
                }

                options.useToken(binding.token);
                const bindingTokenId = tokenRuntimeId(binding.token);

                if (bindingTokenId !== overrideTokenId || !isMultiToken(binding.token)) {
                    throw new Error(
                        `overrideAll for "${overrideTokenKey}" only accepts bindings for the same multibind token`,
                    );
                }
            }

            options.markOverriddenToken?.(currentOverride.token);
            if (options.excludeOverriddenTokens) {
                excludedTokenIds.add(overrideTokenId);
            }
            for (const binding of currentOverride.bindings) {
                overrideBindingTokenIds.add(tokenRuntimeId(binding.token));
            }
            multiOverrideTokenIds.add(overrideTokenId);
            multiOverrides.set(overrideTokenId, currentOverride.bindings);
            overrideBindings.push(...currentOverride.bindings);
            continue;
        }

        throw new Error("Overrides must be created with override, overrideAll, or unbind");
    }

    return {
        singleOverrides,
        singleUnbinds,
        multiOverrides,
        overrideBindings,
        excludedTokenIds,
        singleOverrideTokenIds,
        singleUnbindTokenIds,
        multiOverrideTokenIds,
        overrideBindingTokenIds,
    };
};
