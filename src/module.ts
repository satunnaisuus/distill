import type { AnyBinding } from "./bind";
import { isBinding } from "./bind";
import {
    composedModuleDefinitionBrand,
    exportedBindingBrand,
    moduleDefinitionBrand,
    moduleImportWireBrand,
} from "./brands";
import type { ComposeModules } from "./module-compose-validation-types";
import type { ValidateModuleBindingInputTuple, ValidateModuleImports } from "./module-definition-validation-types";
import type { ModuleImportWireBuilder, ModuleSingleImportTokens } from "./module-interface-types";
import { validateComposedModuleRuntime, validateModuleDefinitionRuntime } from "./module-runtime-validation";
import type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    ExportedBinding,
    ModuleBindingInput,
    ModuleDefinition,
    ModuleImportWire,
} from "./module-types";
import type { AnySingleToken, AnyToken } from "./token";

export type { ScopeTokenCompatibilityError } from "./module-definition-validation-types";
export type {
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicInterfaceBindings,
    CompositionPublicTokenArray,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportedExportedBindings,
} from "./module-interface-types";
export type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
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
} from "./module-types";

let nextModuleId = 1;

export const exported = <const TBinding extends AnyBinding>(binding: TBinding): ExportedBinding<TBinding> => {
    if (!isBinding(binding)) {
        throw new Error("exported(...) expects a binding created with bind");
    }

    return {
        [exportedBindingBrand]: true,
        binding,
    };
};

export const isExportedBinding = (value: unknown): value is ExportedBinding => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, exportedBindingBrand);
};

export const unwrapModuleBinding = (binding: ModuleBindingInput): AnyBinding => {
    return isExportedBinding(binding) ? binding.binding : binding;
};

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

const composeModulesImplementation = (options: {
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports: readonly AnyToken[];
    readonly wire?: readonly AnyModuleImportWire[];
}): AnyComposedModuleDefinition => {
    const wire = options.wire ?? [];

    validateComposedModuleRuntime(options.modules, options.exports, wire);

    return {
        [composedModuleDefinitionBrand]: true,
        modules: options.modules,
        exports: options.exports,
        wire,
    };
};

export const composeModules = composeModulesImplementation as unknown as ComposeModules;
