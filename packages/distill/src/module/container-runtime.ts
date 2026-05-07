import { bind } from "../binding/index";
import { type AnyBindingOverride, collectRuntimeOverrideOperations } from "../override/index";
import {
    publicModuleContextId,
    type RuntimeBinding,
    type RuntimeModuleGraph,
    type RuntimePublicAccess,
} from "../runtime/index";
import {
    type AnySingleToken,
    type AnyToken,
    isMultiToken,
    type TokenListContext,
    tokenDisplayKey,
    tokenRuntimeId,
} from "../token/index";
import type { AnyBinding, AnyComposedModuleDefinition, AnyModuleDefinition } from "./types";

export type { AnyComposedModuleDefinition };

export type RuntimeModuleEntry = {
    readonly moduleId: number;
    readonly binding: AnyBinding;
    readonly exported: boolean;
};

export type RuntimeRegisteredModuleEntry = RuntimeModuleEntry & {
    readonly runtimeBinding: RuntimeBinding;
};

export type RuntimeRegisteredOverrideEntry = {
    readonly binding: AnyBinding;
    readonly runtimeBinding: RuntimeBinding;
};

type RuntimeModuleWireAliasEntry = {
    readonly moduleId: number;
    readonly binding: AnyBinding;
};

type RuntimeModuleOverrideResult = {
    readonly entries: readonly RuntimeModuleEntry[];
    readonly overrideBindings: readonly AnyBinding[];
    readonly publicAccess: RuntimePublicAccess;
    readonly excludedTokenIds: ReadonlySet<string>;
    readonly overrideBindingTokenIds: ReadonlySet<string>;
    readonly overrideModuleContextIdsByTokenId: ReadonlyMap<string, ReadonlySet<number>>;
};

const hasExactToken = (tokens: readonly AnyToken[], currentToken: AnyToken): boolean => {
    const currentTokenId = tokenRuntimeId(currentToken);

    return tokens.some((candidate) => tokenRuntimeId(candidate) === currentTokenId);
};

export const createRuntimeModuleEntries = (modules: readonly AnyModuleDefinition[]): readonly RuntimeModuleEntry[] => {
    const entries: RuntimeModuleEntry[] = [];

    for (const currentModule of modules) {
        for (const moduleBinding of currentModule.bindings) {
            entries.push({
                moduleId: currentModule.id,
                binding: moduleBinding,
                exported: hasExactToken(currentModule.exports, moduleBinding.token),
            });
        }
    }

    return entries;
};

export const createRuntimeModuleWireAliasEntries = (
    composition: AnyComposedModuleDefinition,
    excludedTokenIds: ReadonlySet<string>,
    overrideBindingTokenIds: ReadonlySet<string>,
): readonly RuntimeModuleWireAliasEntry[] => {
    const entries: RuntimeModuleWireAliasEntry[] = [];

    for (const currentWire of composition.wire) {
        const importTokenId = tokenRuntimeId(currentWire.importToken);
        const providerTokenId = tokenRuntimeId(currentWire.providerToken);

        if (importTokenId === providerTokenId || excludedTokenIds.has(importTokenId)) {
            continue;
        }

        if (excludedTokenIds.has(providerTokenId) && !overrideBindingTokenIds.has(providerTokenId)) {
            throw new Error(
                `Service "${tokenDisplayKey(currentWire.providerToken)}" is wired to import "${tokenDisplayKey(currentWire.importToken)}", but no exported provider exists`,
            );
        }

        entries.push({
            moduleId: currentWire.module.id,
            binding: bind(currentWire.importToken).transient().alias(currentWire.providerToken) as AnyBinding,
        });
    }

    return entries;
};

export const createRuntimeModuleGraph = (
    composition: AnyComposedModuleDefinition,
    entries: readonly RuntimeRegisteredModuleEntry[],
    overrideEntries: readonly RuntimeRegisteredOverrideEntry[],
    excludedTokenIds: ReadonlySet<string>,
    overrideModuleContextIdsByTokenId: ReadonlyMap<string, ReadonlySet<number>>,
): RuntimeModuleGraph => {
    const visibleBindingIdsByModuleId = new Map<number, Set<number>>();
    const exportedEntries = entries.filter((entry) => entry.exported);
    const wireTargetId = (currentModule: AnyModuleDefinition, currentImport: AnyToken): string => {
        return `${currentModule.id}\u0000${tokenRuntimeId(currentImport)}`;
    };
    const wireProviderByTarget = new Map<string, AnySingleToken>();

    for (const currentWire of composition.wire) {
        wireProviderByTarget.set(wireTargetId(currentWire.module, currentWire.importToken), currentWire.providerToken);
    }

    const addVisibleProviders = (
        visibleBindingIds: Set<number>,
        currentToken: AnyToken,
        excludedModuleId: number | undefined,
    ): void => {
        const currentTokenId = tokenRuntimeId(currentToken);

        if (!excludedTokenIds.has(currentTokenId)) {
            for (const entry of exportedEntries) {
                if (entry.moduleId !== excludedModuleId && tokenRuntimeId(entry.binding.token) === currentTokenId) {
                    visibleBindingIds.add(entry.runtimeBinding.id);
                }
            }
        }

        for (const entry of overrideEntries) {
            if (tokenRuntimeId(entry.binding.token) === currentTokenId) {
                visibleBindingIds.add(entry.runtimeBinding.id);
            }
        }
    };

    for (const currentModule of composition.modules) {
        const visibleBindingIds = new Set<number>();

        for (const currentImport of currentModule.imports) {
            const targetId = wireTargetId(currentModule, currentImport);

            if (wireProviderByTarget.has(targetId)) {
                const wiredProvider = wireProviderByTarget.get(targetId) as AnySingleToken;
                addVisibleProviders(visibleBindingIds, wiredProvider, undefined);
                addVisibleProviders(visibleBindingIds, currentImport, currentModule.id);
                continue;
            }

            addVisibleProviders(visibleBindingIds, currentImport, currentModule.id);
        }

        for (const entry of overrideEntries) {
            const entryTokenId = tokenRuntimeId(entry.binding.token);

            if (overrideModuleContextIdsByTokenId.get(entryTokenId)?.has(currentModule.id)) {
                visibleBindingIds.add(entry.runtimeBinding.id);
            }
        }

        visibleBindingIdsByModuleId.set(currentModule.id, visibleBindingIds);
    }

    const publicBindingIds = new Set<number>();

    for (const currentExport of composition.exports) {
        addVisibleProviders(publicBindingIds, currentExport, undefined);
    }

    visibleBindingIdsByModuleId.set(publicModuleContextId, publicBindingIds);

    return {
        moduleIds: composition.modules.map((currentModule) => currentModule.id),
        visibleBindingIdsByModuleId,
    };
};

const collectPublicModuleAccess = (
    tokenListContext: TokenListContext,
    composition: AnyComposedModuleDefinition,
    singleOverrideTokenIds: ReadonlySet<string>,
    multiOverrideTokenIds: ReadonlySet<string>,
    singleUnbindTokenIds: ReadonlySet<string>,
): RuntimePublicAccess => {
    const singleTokenIds = new Set(singleOverrideTokenIds);
    const multiTokenIds = new Set(multiOverrideTokenIds);

    for (const currentExport of composition.exports) {
        tokenListContext.registerToken(currentExport);
        const exportTokenId = tokenRuntimeId(currentExport);

        if (singleUnbindTokenIds.has(exportTokenId)) {
            continue;
        }

        if (isMultiToken(currentExport)) {
            multiTokenIds.add(exportTokenId);
        } else {
            singleTokenIds.add(exportTokenId);
        }
    }

    return {
        moduleContextId: publicModuleContextId,
        singleTokenIds,
        multiTokenIds,
    };
};

export const applyModuleBindingOverrides = (
    tokenListContext: TokenListContext,
    composition: AnyComposedModuleDefinition,
    entries: readonly RuntimeModuleEntry[],
    overrides: readonly AnyBindingOverride[],
): RuntimeModuleOverrideResult => {
    const publicSingleBindingTokenIds = new Set<string>();
    const publicMultiBindingTokenIds = new Set<string>();

    for (const currentExport of composition.exports) {
        tokenListContext.registerToken(currentExport);
        const entryTokenId = tokenRuntimeId(currentExport);

        if (isMultiToken(currentExport)) {
            publicMultiBindingTokenIds.add(entryTokenId);
        } else {
            publicSingleBindingTokenIds.add(entryTokenId);
        }
    }

    const overrideModuleContextIdsByTokenId = new Map<string, Set<number>>();

    const collectOverriddenProviderModuleIds = (currentToken: AnyToken): void => {
        const currentTokenId = tokenRuntimeId(currentToken);
        const moduleContextIds = overrideModuleContextIdsByTokenId.get(currentTokenId) ?? new Set<number>();

        for (const entry of entries) {
            if (entry.exported && tokenRuntimeId(entry.binding.token) === currentTokenId) {
                moduleContextIds.add(entry.moduleId);
            }
        }

        overrideModuleContextIdsByTokenId.set(currentTokenId, moduleContextIds);
    };

    const overrideResult = collectRuntimeOverrideOperations(overrides, {
        useToken: tokenListContext.registerToken,
        hasSingleTarget: (tokenId) => publicSingleBindingTokenIds.has(tokenId),
        missingSingleTargetMessage: (tokenKey) => `Service "${tokenKey}" is not exported by the module`,
        hasMultiTarget: (tokenId) => publicMultiBindingTokenIds.has(tokenId),
        missingMultiTargetMessage: (tokenKey) => `Multibind token "${tokenKey}" is not exported by the module`,
        markOverriddenToken: collectOverriddenProviderModuleIds,
        excludeOverriddenTokens: true,
    });

    return {
        entries: entries.filter(
            (entry) => !entry.exported || !overrideResult.excludedTokenIds.has(tokenRuntimeId(entry.binding.token)),
        ),
        overrideBindings: overrideResult.overrideBindings,
        excludedTokenIds: overrideResult.excludedTokenIds,
        overrideBindingTokenIds: overrideResult.overrideBindingTokenIds,
        overrideModuleContextIdsByTokenId,
        publicAccess: collectPublicModuleAccess(
            tokenListContext,
            composition,
            overrideResult.singleOverrideTokenIds,
            overrideResult.multiOverrideTokenIds,
            overrideResult.singleUnbindTokenIds,
        ),
    };
};
