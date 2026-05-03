import { type AnyBinding, isBinding } from "../binding/index";
import {
    type AnySingleToken,
    type AnyToken,
    isMultiToken,
    isRuntimeToken,
    tokenDisplayKey,
    tokenKeyRuntimeId,
    tokenRuntimeId,
} from "../token/index";
import { isExportedBinding, unwrapModuleBinding } from "./binding-runtime";
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
        const unwrappedBinding = unwrapModuleBinding(binding);
        const bindingTokenKey = tokenDisplayKey(unwrappedBinding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(unwrappedBinding.token);
        const bindingIsMulti = isMultiToken(unwrappedBinding.token);
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
        const unwrappedBinding = unwrapModuleBinding(binding);
        const bindingTokenKey = tokenDisplayKey(unwrappedBinding.token);
        const bindingTokenKeyId = tokenKeyRuntimeId(unwrappedBinding.token);
        const bindingTokenId = tokenRuntimeId(unwrappedBinding.token);
        const bindingIsMulti = isMultiToken(unwrappedBinding.token);
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

export const validateModuleDefinitionRuntime = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
): void => {
    for (const currentImport of imports) {
        if (isModuleDefinitionRuntime(currentImport)) {
            throw new Error("Module imports must be tokens; compose modules with composeModules(...)");
        }

        assertTokenInput(currentImport, "Module imports must be tokens");
    }

    assertNoDuplicateTokenKeys(imports, (currentTokenKey) => `Token "${currentTokenKey}" is already imported`);

    for (const binding of bindings) {
        const unwrappedBinding = unwrapModuleBinding(binding);

        if (!isBinding(unwrappedBinding)) {
            throw new Error("Module bindings must be created with bind or exported(bind(...))");
        }
    }

    assertNoImportedLocalSingleBindings(imports, bindings);
    assertNoDuplicateLocalSingleBindings(bindings);
};

const collectExportedEntries = (modules: readonly AnyModuleDefinition[]): readonly RuntimeExportedEntry[] => {
    const entries: RuntimeExportedEntry[] = [];

    for (const currentModule of modules) {
        for (const moduleBinding of currentModule.bindings) {
            if (isExportedBinding(moduleBinding)) {
                entries.push({ module: currentModule, binding: moduleBinding.binding });
            }
        }
    }

    return entries;
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
    const exportedProviderKinds = new Map<string, boolean>();
    const exportedSingleProviders = new Map<string, string>();

    for (const entry of exportedEntries) {
        const entryToken = entry.binding.token;
        const entryTokenKey = tokenDisplayKey(entryToken);
        const entryTokenKeyId = tokenKeyRuntimeId(entryToken);
        const entryIsMultiToken = isMultiToken(entryToken);
        const previousKind = exportedProviderKinds.get(entryTokenKeyId);

        if (previousKind !== undefined && previousKind !== entryIsMultiToken) {
            throw new Error(`Token "${entryTokenKey}" has incompatible exported providers`);
        }

        exportedProviderKinds.set(entryTokenKeyId, entryIsMultiToken);

        if (entryIsMultiToken) {
            continue;
        }

        const entryTokenId = tokenRuntimeId(entryToken);

        if (exportedSingleProviders.has(entryTokenId)) {
            throw new Error(`Service "${entryTokenKey}" has multiple exported providers`);
        }

        exportedSingleProviders.set(entryTokenId, entryTokenKey);
    }

    const assertProviders = (currentToken: AnyToken, providers: readonly RuntimeExportedEntry[], action: string) => {
        const currentTokenKey = tokenDisplayKey(currentToken);

        if (isMultiToken(currentToken)) {
            if (providers.length === 0) {
                throw new Error(`Multibind token "${currentTokenKey}" ${action}, but no exported contributions exist`);
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
            const wiredProvider = wireProviderByTarget.get(wireTargetId(currentModule, currentImport));

            if (wiredProvider) {
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
            );
        }
    }

    for (const currentExport of exports) {
        assertProviders(currentExport, findExportedProviders(exportedEntries, currentExport), "is exported");
    }
};
