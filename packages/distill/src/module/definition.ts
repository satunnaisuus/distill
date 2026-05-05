import { createRuntimeModuleContainer } from "../container/index";
import type { AnyBindingOverride } from "../override/index";
import { composedModuleDefinitionBrand, moduleDefinitionBrand, moduleImportWireBrand } from "./brands";
import type {
    ValidateComposeExports,
    ValidateComposeModules,
    ValidateComposeOptions,
    ValidateComposeWire,
} from "./compose-validation-types";
import type { ValidateModuleBindingInputTuple, ValidateModuleImports } from "./definition-validation-types";
import type {
    CompositionExportedTokenArray,
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicInterfaceBindings,
    CompositionPublicTokenArray,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportedExportedBindings,
    ModuleImportWireBuilder,
    ModuleSingleImportTokens,
} from "./interface-types";
import {
    collectModuleExportTokens,
    validateComposedModuleRuntime,
    validateModuleDefinitionRuntime,
} from "./runtime-validation";
import type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    AnySingleToken,
    AnyToken,
    ComposedModuleDefinition,
    ExportedBinding,
    ModuleBindingInput,
    ModuleDefinition,
    ModuleExportedBindings,
    ModuleExportedBindingsFromInputs,
    ModuleImportWire,
    ModuleLocalBindings,
    UnwrapModuleBinding,
    UnwrapModuleBindings,
} from "./types";

export { exported, isExportedBinding, unwrapModuleBinding } from "./binding-runtime";
export type { CreateModuleContainerFn } from "./container-definition-types";
export type { RuntimeRegisteredModuleEntry } from "./container-runtime";
export {
    applyModuleBindingOverrides,
    createRuntimeModuleEntries,
    createRuntimeModuleGraph,
    createRuntimeModuleWireAliasEntries,
} from "./container-runtime";
export type { ScopeTokenCompatibilityError } from "./scope-token-compatibility-types";
export type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    ComposedModuleDefinition,
    CompositionExportedTokenArray,
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicInterfaceBindings,
    CompositionPublicTokenArray,
    ExportedBinding,
    ModuleBindingInput,
    ModuleDefinition,
    ModuleExportedBindings,
    ModuleExportedBindingsFromInputs,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportedExportedBindings,
    ModuleImportWire,
    ModuleLocalBindings,
    UnwrapModuleBinding,
    UnwrapModuleBindings,
};

let nextModuleId = 1;

export const isModuleDefinition = (value: unknown): value is AnyModuleDefinition => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleDefinitionBrand);
};

export const isComposedModuleDefinition = (value: unknown): value is AnyComposedModuleDefinition => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, composedModuleDefinitionBrand);
};

export const isModuleImportWire = (value: unknown): value is AnyModuleImportWire => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleImportWireBrand);
};

export const provideImport = <
    const TModule extends AnyModuleDefinition,
    const TImportToken extends ModuleSingleImportTokens<TModule>,
>(
    module: TModule,
    importToken: TImportToken,
): ModuleImportWireBuilder<TModule, TImportToken> => {
    const builder = {
        with(providerToken: AnySingleToken): ModuleImportWire<TModule, TImportToken> {
            return {
                [moduleImportWireBrand]: true,
                module,
                importToken,
                providerToken,
            };
        },
    };

    return builder as ModuleImportWireBuilder<TModule, TImportToken>;
};

export function defineModule<const TBindings extends readonly ModuleBindingInput[]>(options: {
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<readonly [], TBindings>;
}): ModuleDefinition<readonly [], TBindings>;
export function defineModule<
    const TImports extends readonly AnyToken[],
    const TBindings extends readonly ModuleBindingInput[],
>(options: {
    readonly imports: TImports & ValidateModuleImports<TImports>;
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<TImports, TBindings>;
}): ModuleDefinition<TImports, TBindings>;
export function defineModule(options: {
    readonly imports?: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
}): AnyModuleDefinition {
    const imports = options.imports ?? [];

    validateModuleDefinitionRuntime(imports, options.bindings);

    return {
        [moduleDefinitionBrand]: true,
        id: nextModuleId++,
        imports,
        bindings: options.bindings,
    };
}

export function composeModules<
    const TModules extends readonly AnyModuleDefinition[],
    const TWire extends readonly AnyModuleImportWire[] = readonly [],
>(
    options: {
        readonly modules: TModules & ValidateComposeModules<TModules>;
        readonly wire?: TWire & ValidateComposeWire<TWire>;
    } & ValidateComposeOptions<TModules, CompositionExportedTokenArray<TModules>, TWire>,
): ComposedModuleDefinition<TModules, CompositionExportedTokenArray<TModules>, TWire>;
export function composeModules<
    const TModules extends readonly AnyModuleDefinition[],
    const TExports extends readonly AnyToken[],
    const TWire extends readonly AnyModuleImportWire[] = readonly [],
>(
    options: {
        readonly modules: TModules & ValidateComposeModules<TModules>;
        readonly exports: TExports & ValidateComposeExports<TExports>;
        readonly wire?: TWire & ValidateComposeWire<TWire>;
    } & ValidateComposeOptions<TModules, TExports, TWire>,
): ComposedModuleDefinition<TModules, TExports, TWire>;
export function composeModules(options: {
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports?: readonly AnyToken[];
    readonly wire?: readonly AnyModuleImportWire[];
}) {
    const compositionExports =
        options.exports === undefined ? collectModuleExportTokens(options.modules) : options.exports;
    const wire = options.wire ?? [];

    validateComposedModuleRuntime(options.modules, compositionExports, wire);

    const composition = {
        [composedModuleDefinitionBrand]: true as const,
        modules: options.modules,
        exports: compositionExports,
        wire,
    };

    return {
        ...composition,
        createContainer(...overrides: AnyBindingOverride[]) {
            return createRuntimeModuleContainer(composition, overrides);
        },
    };
}
