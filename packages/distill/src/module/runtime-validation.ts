import { type AnyBinding, getBindingDependencies, isBinding } from "../binding/index";
import { type DependencyReference, isAllDependency, isOptionalDependency } from "../dependency/index";
import {
    type AnySingleToken,
    type AnyToken,
    isMultiToken,
    isRuntimeToken,
    tokenDisplayKey,
    tokenKeyRuntimeId,
    tokenRuntimeId,
} from "../token/index";
import { moduleDefinitionBrand, moduleImportWireBrand } from "./brands";
import type { AnyModuleDefinition, AnyModuleImportWire, ModuleBindingInput } from "./types";

type RuntimeExportedEntry = {
    readonly module: AnyModuleDefinition;
    readonly binding: AnyBinding;
};

const isModuleDefinitionRuntime = (value: unknown): value is AnyModuleDefinition => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleDefinitionBrand);
};

const isModuleImportWireRuntime = (value: unknown): value is AnyModuleImportWire => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleImportWireBrand);
};

export function assertTokenInput(value: unknown, message: string): asserts value is AnyToken {
    if (!isRuntimeToken(value)) {
        throw new Error(message);
    }
}

export const assertNoDuplicateTokenKeys = (
    tokens: readonly AnyToken[],
    duplicateMessage: (key: string) => string,
): void => {
    const seen = new Set<string>();

    for (const currentToken of tokens) {
        const currentTokenKey = tokenDisplayKey(currentToken);
        const currentTokenKeyId = tokenKeyRuntimeId(currentToken);

        if (seen.has(currentTokenKeyId)) {
            throw new Error(duplicateMessage(currentTokenKey));
        }

        seen.add(currentTokenKeyId);
    }
};

const hasExactToken = (tokens: readonly AnyToken[], currentToken: AnyToken): boolean => {
    const currentTokenId = tokenRuntimeId(currentToken);

    return tokens.some((candidate) => tokenRuntimeId(candidate) === currentTokenId);
};

export const assertNoImportedLocalSingleBindings = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
): void => {
    const importedSingleTokenKeyIds = new Set<string>();
    const importedTokenKinds = new Map<string, boolean>();

    for (const currentImport of imports) {
        const currentImportKey = tokenDisplayKey(currentImport);
        const currentImportKeyId = tokenKeyRuntimeId(currentImport);
        const currentImportIsMulti = isMultiToken(currentImport);
        const previousKind = importedTokenKinds.get(currentImportKeyId);

        if (previousKind !== undefined && previousKind !== currentImportIsMulti) {
            throw new Error(`Token "${currentImportKey}" is already included in module imports`);
        }

        importedTokenKinds.set(currentImportKeyId, currentImportIsMulti);

        if (!currentImportIsMulti) {
            importedSingleTokenKeyIds.add(currentImportKeyId);
        }
    }

    for (const binding of bindings) {
        const bindingTokenKey = tokenDisplayKey(binding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(binding.token);
        const bindingIsMulti = isMultiToken(binding.token);
        const importedKind = importedTokenKinds.get(bindingTokenKeyId);

        if (importedKind !== undefined && importedKind !== bindingIsMulti) {
            throw new Error(`Token "${bindingTokenKey}" is already included in module imports`);
        }

        if (!bindingIsMulti && importedSingleTokenKeyIds.has(bindingTokenKeyId)) {
            throw new Error(
                `Service "${bindingTokenKey}" cannot be both imported and locally bound in the same module`,
            );
        }
    }
};

export const assertNoDuplicateLocalSingleBindings = (bindings: readonly ModuleBindingInput[]): void => {
    const seenSingleTokenIds = new Set<string>();
    const seenTokenKinds = new Map<string, boolean>();

    for (const binding of bindings) {
        const bindingTokenKey = tokenDisplayKey(binding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(binding.token);
        const bindingTokenId = tokenRuntimeId(binding.token);
        const bindingIsMulti = isMultiToken(binding.token);
        const previousKind = seenTokenKinds.get(bindingTokenKeyId);

        if (previousKind !== undefined && previousKind !== bindingIsMulti) {
            throw new Error(`Token "${bindingTokenKey}" is already included in module bindings`);
        }

        seenTokenKinds.set(bindingTokenKeyId, bindingIsMulti);

        if (bindingIsMulti) {
            continue;
        }

        if (seenSingleTokenIds.has(bindingTokenId)) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the module context`);
        }

        seenSingleTokenIds.add(bindingTokenId);
    }
};

const assertExportsAreCompatibleWithVisibleTokens = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
    exports: readonly AnyToken[],
): void => {
    const visibleTokens = [...imports, ...bindings.map((binding) => binding.token)];

    for (const currentExport of exports) {
        const exportTokenKey = tokenDisplayKey(currentExport);
        const exportTokenKeyId = tokenKeyRuntimeId(currentExport);
        const exportTokenId = tokenRuntimeId(currentExport);
        const exportIsMulti = isMultiToken(currentExport);

        for (const visibleToken of visibleTokens) {
            if (tokenKeyRuntimeId(visibleToken) !== exportTokenKeyId) {
                continue;
            }

            if (tokenRuntimeId(visibleToken) !== exportTokenId || isMultiToken(visibleToken) !== exportIsMulti) {
                throw new Error(`Token "${exportTokenKey}" has an incompatible module export`);
            }
        }
    }
};

const assertSingleExportsHaveLocalBindings = (
    bindings: readonly ModuleBindingInput[],
    exports: readonly AnyToken[],
): void => {
    for (const currentExport of exports) {
        if (isMultiToken(currentExport)) {
            continue;
        }

        if (
            hasExactToken(
                bindings.map((binding) => binding.token),
                currentExport,
            )
        ) {
            continue;
        }

        throw new Error(
            `Service "${tokenDisplayKey(currentExport)}" is exported by the module, but no local provider exists`,
        );
    }
};

const resolveAllDependencyToken = (dependency: DependencyReference): AnyToken | undefined => {
    if (isOptionalDependency(dependency)) {
        return resolveAllDependencyToken(dependency.resolveDependency());
    }

    if (isAllDependency(dependency)) {
        return dependency.resolveToken();
    }

    return undefined;
};

const assertAllDependenciesHaveVisibleTokens = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
    exports: readonly AnyToken[],
): void => {
    const visibleTokens = [...imports, ...exports, ...bindings.map((binding) => binding.token)];

    for (const binding of bindings) {
        const dependencies = getBindingDependencies(binding);

        if (!dependencies) {
            continue;
        }

        for (const dependency of Object.values(dependencies) as DependencyReference[]) {
            const dependencyToken = resolveAllDependencyToken(dependency);

            if (!dependencyToken) {
                continue;
            }

            assertTokenInput(dependencyToken, "Module dependencies must be tokens");
            const dependencyTokenKey = tokenDisplayKey(dependencyToken);

            if (!isMultiToken(dependencyToken)) {
                throw new Error(`Token "${dependencyTokenKey}" is not a multibind token`);
            }

            if (!hasExactToken(visibleTokens, dependencyToken)) {
                throw new Error(
                    `Multibind token "${dependencyTokenKey}" is not imported, exported, or locally bound by the module`,
                );
            }
        }
    }
};

export const validateModuleDefinitionRuntime = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
    exports: readonly AnyToken[],
): void => {
    if (!Array.isArray(imports)) {
        throw new Error("Module imports must be an array");
    }

    if (!Array.isArray(bindings)) {
        throw new Error("Module bindings must be an array");
    }

    if (!Array.isArray(exports)) {
        throw new Error("Module exports must be an array");
    }

    for (const currentImport of imports) {
        if (isModuleDefinitionRuntime(currentImport)) {
            throw new Error("Module imports must be tokens; compose modules with composeModules(...)");
        }

        assertTokenInput(currentImport, "Module imports must be tokens");
    }

    assertNoDuplicateTokenKeys(imports, (currentTokenKey) => `Token "${currentTokenKey}" is already imported`);

    for (const binding of bindings) {
        if (!isBinding(binding)) {
            throw new Error("Module bindings must be created with bind");
        }
    }

    for (const currentExport of exports) {
        assertTokenInput(currentExport, "Module exports must be tokens");
    }

    assertNoDuplicateTokenKeys(exports, (currentTokenKey) => `Token "${currentTokenKey}" is already exported`);

    assertNoImportedLocalSingleBindings(imports, bindings);
    assertNoDuplicateLocalSingleBindings(bindings);
    assertExportsAreCompatibleWithVisibleTokens(imports, bindings, exports);
    assertSingleExportsHaveLocalBindings(bindings, exports);
    assertAllDependenciesHaveVisibleTokens(imports, bindings, exports);
};

const isModuleExportedBinding = (module: AnyModuleDefinition, binding: AnyBinding): boolean => {
    return hasExactToken(module.exports, binding.token);
};

const collectExportedEntries = (modules: readonly AnyModuleDefinition[]): readonly RuntimeExportedEntry[] => {
    const entries: RuntimeExportedEntry[] = [];

    for (const currentModule of modules) {
        for (const moduleBinding of currentModule.bindings) {
            if (isModuleExportedBinding(currentModule, moduleBinding)) {
                entries.push({ module: currentModule, binding: moduleBinding });
            }
        }
    }

    return entries;
};

export const collectModuleExportTokens = (modules: readonly AnyModuleDefinition[]): readonly AnyToken[] => {
    const exportTokens: AnyToken[] = [];
    const seenTokenKeyIds = new Set<string>();

    for (const currentModule of modules) {
        for (const currentToken of currentModule.exports) {
            const currentTokenKeyId = tokenKeyRuntimeId(currentToken);

            if (seenTokenKeyIds.has(currentTokenKeyId)) {
                continue;
            }

            seenTokenKeyIds.add(currentTokenKeyId);
            exportTokens.push(currentToken);
        }
    }

    return exportTokens;
};

const findExportedProviders = (
    entries: readonly RuntimeExportedEntry[],
    currentToken: AnyToken,
    excludedModule?: AnyModuleDefinition,
): readonly RuntimeExportedEntry[] => {
    const currentTokenId = tokenRuntimeId(currentToken);

    return entries.filter(
        (entry) => entry.module !== excludedModule && tokenRuntimeId(entry.binding.token) === currentTokenId,
    );
};

const hasExportDeclaration = (
    modules: readonly AnyModuleDefinition[],
    currentToken: AnyToken,
    excludedModule?: AnyModuleDefinition,
): boolean => {
    return modules.some(
        (currentModule) => currentModule !== excludedModule && hasExactToken(currentModule.exports, currentToken),
    );
};

export const validateComposedModuleRuntime = (
    modules: readonly AnyModuleDefinition[],
    exports: readonly AnyToken[],
    wire: readonly AnyModuleImportWire[],
): void => {
    if (!Array.isArray(modules)) {
        throw new Error("composeModules modules must be an array");
    }

    if (!Array.isArray(exports)) {
        throw new Error("composeModules exports must be an array");
    }

    if (!Array.isArray(wire)) {
        throw new Error("composeModules wire must be an array");
    }

    const moduleIds = new Set<number>();
    const moduleSet = new Set<AnyModuleDefinition>();

    for (const currentModule of modules) {
        if (!isModuleDefinitionRuntime(currentModule)) {
            throw new Error("composeModules modules must be created with defineModule");
        }

        if (moduleIds.has(currentModule.id)) {
            throw new Error("Module is already included in the composition");
        }

        moduleIds.add(currentModule.id);
        moduleSet.add(currentModule);
    }

    for (const currentExport of exports) {
        assertTokenInput(currentExport, "composeModules exports must be tokens");
    }

    assertNoDuplicateTokenKeys(exports, (currentTokenKey) => `Token "${currentTokenKey}" is already exported`);

    const wireTargetId = (currentModule: AnyModuleDefinition, currentImport: AnyToken): string => {
        return `${currentModule.id}\u0000${tokenRuntimeId(currentImport)}`;
    };
    const wireProviderByTarget = new Map<string, AnySingleToken>();

    for (const currentWire of wire) {
        if (!isModuleImportWireRuntime(currentWire)) {
            throw new Error("composeModules wire entries must be created with provideImport");
        }

        if (!isModuleDefinitionRuntime(currentWire.module) || !moduleSet.has(currentWire.module)) {
            throw new Error("Wire module must be included in composeModules modules");
        }

        assertTokenInput(currentWire.importToken, "Wire import token must be a token");
        assertTokenInput(currentWire.providerToken, "Wire provider token must be a token");

        const importTokenKey = tokenDisplayKey(currentWire.importToken);

        if (isMultiToken(currentWire.importToken)) {
            throw new Error(`Multibind token "${importTokenKey}" cannot be wired with provideImport`);
        }

        const providerTokenKey = tokenDisplayKey(currentWire.providerToken);

        if (isMultiToken(currentWire.providerToken)) {
            throw new Error(`Multibind token "${providerTokenKey}" cannot be used as a wired provider`);
        }

        if (
            !currentWire.module.imports.some(
                (currentImport) => tokenRuntimeId(currentImport) === tokenRuntimeId(currentWire.importToken),
            )
        ) {
            throw new Error(`Service "${importTokenKey}" is not imported by the wired module`);
        }

        const targetId = wireTargetId(currentWire.module, currentWire.importToken);

        if (wireProviderByTarget.has(targetId)) {
            throw new Error(`Service "${importTokenKey}" is already wired for the module`);
        }

        wireProviderByTarget.set(targetId, currentWire.providerToken);
    }

    const exportedEntries = collectExportedEntries(modules);
    const exportedTokenKinds = new Map<string, boolean>();
    const exportedSingleProviders = new Map<string, string>();

    for (const currentModule of modules) {
        for (const currentExport of currentModule.exports) {
            const exportTokenKey = tokenDisplayKey(currentExport);
            const exportTokenKeyId = tokenKeyRuntimeId(currentExport);
            const exportIsMultiToken = isMultiToken(currentExport);
            const previousKind = exportedTokenKinds.get(exportTokenKeyId);

            if (previousKind !== undefined && previousKind !== exportIsMultiToken) {
                throw new Error(`Token "${exportTokenKey}" has incompatible exported providers`);
            }

            exportedTokenKinds.set(exportTokenKeyId, exportIsMultiToken);
        }
    }

    for (const entry of exportedEntries) {
        const entryToken = entry.binding.token;
        const entryTokenKey = tokenDisplayKey(entryToken);
        const entryIsMultiToken = isMultiToken(entryToken);

        if (entryIsMultiToken) {
            continue;
        }

        const entryTokenId = tokenRuntimeId(entryToken);

        if (exportedSingleProviders.has(entryTokenId)) {
            throw new Error(`Service "${entryTokenKey}" has multiple exported providers`);
        }

        exportedSingleProviders.set(entryTokenId, entryTokenKey);
    }

    const assertProviders = (
        currentToken: AnyToken,
        providers: readonly RuntimeExportedEntry[],
        action: string,
        excludedModule?: AnyModuleDefinition,
    ) => {
        const currentTokenKey = tokenDisplayKey(currentToken);

        if (isMultiToken(currentToken)) {
            if (!hasExportDeclaration(modules, currentToken, excludedModule)) {
                throw new Error(`Multibind token "${currentTokenKey}" ${action}, but no module exports it`);
            }

            return;
        }

        if (providers.length === 0) {
            throw new Error(`Service "${currentTokenKey}" ${action}, but no exported provider exists`);
        }

        if (providers.length > 1) {
            throw new Error(`Service "${currentTokenKey}" has multiple exported providers`);
        }
    };

    for (const currentModule of modules) {
        for (const currentImport of currentModule.imports) {
            const targetId = wireTargetId(currentModule, currentImport);

            if (wireProviderByTarget.has(targetId)) {
                const wiredProvider = wireProviderByTarget.get(targetId) as AnySingleToken;
                assertProviders(
                    wiredProvider,
                    findExportedProviders(exportedEntries, wiredProvider),
                    `is wired to import "${tokenDisplayKey(currentImport)}"`,
                );
                continue;
            }

            const excludedProviderModule = isMultiToken(currentImport) ? undefined : currentModule;

            assertProviders(
                currentImport,
                findExportedProviders(exportedEntries, currentImport, excludedProviderModule),
                "is imported by a module",
                excludedProviderModule,
            );
        }
    }

    for (const currentExport of exports) {
        assertProviders(currentExport, findExportedProviders(exportedEntries, currentExport), "is exported");
    }
};
