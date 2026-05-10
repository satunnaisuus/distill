import { createRuntimeModuleContainer } from "../container/index";
import type { AnyBindingOverride } from "../override/index";
import { composedModuleDefinitionBrand, moduleDefinitionBrand, moduleImportWireBrand } from "./brands";
import type {
    ValidateComposeExports,
    ValidateComposeModules,
    ValidateComposeOptions,
    ValidateComposeWire,
} from "./compose-validation-types";
import type {
    ValidateModuleAllDependencies,
    ValidateModuleBindingInputTuple,
    ValidateModuleExportDeclarations,
    ValidateModuleImports,
} from "./definition-validation-types";
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
    ModuleBindingInput,
    ModuleDefinition,
    ModuleExportedBindings,
    ModuleExportedBindingsFromInputs,
    ModuleImportWire,
    ModuleLocalBindings,
} from "./types";

export type { CreateModuleContainerFn } from "./container-definition-types";
export type { RuntimeRegisteredModuleEntry } from "./container-runtime";
export {
    applyModuleBindingOverrides,
    createRuntimeModuleEntries,
    createRuntimeModuleGraph,
    createRuntimeModuleWireAliasEntries,
} from "./container-runtime";
export type { ModuleContainer } from "./container-scope-types";
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
    ModuleBindingInput,
    ModuleDefinition,
    ModuleExportedBindings,
    ModuleExportedBindingsFromInputs,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportedExportedBindings,
    ModuleImportWire,
    ModuleLocalBindings,
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

export function defineModule<const TBindings extends readonly ModuleBindingInput[]>(
    options: {
        readonly bindings: TBindings & ValidateModuleBindingInputTuple<readonly [], TBindings>;
    } & ValidateModuleAllDependencies<readonly [], NoInfer<TBindings>, readonly []>,
): ModuleDefinition<readonly [], TBindings, readonly []>;
export function defineModule<
    const TBindings extends readonly ModuleBindingInput[],
    const TExports extends readonly AnyToken[],
>(
    options: {
        readonly imports?: never;
        readonly bindings: TBindings;
        readonly exports: TExports;
    } & {
        readonly imports?: never;
        readonly bindings: ValidateModuleBindingInputTuple<readonly [], NoInfer<TBindings>>;
    } & ValidateModuleExportDeclarations<readonly [], NoInfer<TBindings>, NoInfer<TExports>> &
        ValidateModuleAllDependencies<readonly [], NoInfer<TBindings>, NoInfer<TExports>>,
): ModuleDefinition<readonly [], TBindings, TExports>;
export function defineModule<
    const TImports extends readonly AnyToken[],
    const TBindings extends readonly ModuleBindingInput[],
    const TExports extends readonly AnyToken[] = readonly [],
>(
    options: {
        readonly imports: TImports & ValidateModuleImports<TImports>;
        readonly bindings: TBindings & ValidateModuleBindingInputTuple<TImports, TBindings>;
        readonly exports?: TExports;
    } & ValidateModuleExportDeclarations<NoInfer<TImports>, NoInfer<TBindings>, NoInfer<TExports>> &
        ValidateModuleAllDependencies<NoInfer<TImports>, NoInfer<TBindings>, NoInfer<TExports>>,
): ModuleDefinition<TImports, TBindings, TExports>;
export function defineModule(options: {
    readonly imports?: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
    readonly exports?: readonly AnyToken[];
}): AnyModuleDefinition {
    const imports = options.imports ?? [];
    const exports = options.exports ?? [];

    validateModuleDefinitionRuntime(imports, options.bindings, exports);

    return {
        [moduleDefinitionBrand]: true,
        id: nextModuleId++,
        imports,
        bindings: options.bindings,
        exports,
    };
}

export function composeModules<
    const TModules extends readonly AnyModuleDefinition[],
    const TWire extends readonly AnyModuleImportWire[] = readonly [],
>(
    options: {
        readonly modules: TModules & ValidateComposeModules<TModules>;
        readonly wire?: TWire & ValidateComposeWire<TWire>;
    } & ValidateComposeOptions<TModules, readonly [], TWire>,
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
