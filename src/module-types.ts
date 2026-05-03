import type { AnyBinding } from "./bind";
import type {
    composedModuleDefinitionBrand,
    exportedBindingBrand,
    moduleDefinitionBrand,
    moduleImportWireBrand,
} from "./brands";
import type { AnySingleToken, AnyToken } from "./token";

export type ExportedBinding<TBinding extends AnyBinding = AnyBinding> = {
    readonly [TBrand in typeof exportedBindingBrand]: true;
} & {
    readonly binding: TBinding;
};

export type ModuleBindingInput = AnyBinding | ExportedBinding<AnyBinding>;

export type AnyModuleDefinition = {
    readonly [TBrand in typeof moduleDefinitionBrand]: true;
} & {
    readonly id: number;
    readonly imports: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
};

export type ModuleDefinition<
    TImports extends readonly AnyToken[] = readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[] = readonly ModuleBindingInput[],
> = {
    readonly [TBrand in typeof moduleDefinitionBrand]: true;
} & {
    readonly id: number;
    readonly imports: TImports;
    readonly bindings: TBindings;
};

export type ModuleImportWire<
    TModule extends AnyModuleDefinition = AnyModuleDefinition,
    TImportToken extends AnySingleToken = AnySingleToken,
    TProviderToken extends AnySingleToken = AnySingleToken,
> = {
    readonly [TBrand in typeof moduleImportWireBrand]: true;
} & {
    readonly module: TModule;
    readonly importToken: TImportToken;
    readonly providerToken: TProviderToken;
};

export type AnyModuleImportWire = ModuleImportWire<AnyModuleDefinition, AnySingleToken, AnySingleToken>;

export type AnyComposedModuleDefinition = {
    readonly [TBrand in typeof composedModuleDefinitionBrand]: true;
} & {
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports: readonly AnyToken[];
    readonly wire: readonly AnyModuleImportWire[];
};

export type ComposedModuleDefinition<
    TModules extends readonly AnyModuleDefinition[] = readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[] = readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = {
    readonly [TBrand in typeof composedModuleDefinitionBrand]: true;
} & {
    readonly modules: TModules;
    readonly exports: TExports;
    readonly wire: TWire;
};

export type UnwrapModuleBinding<TBinding extends ModuleBindingInput> =
    TBinding extends ExportedBinding<infer TExportedBinding>
        ? TExportedBinding
        : TBinding extends AnyBinding
          ? TBinding
          : never;

export type UnwrapModuleBindings<TBindings extends readonly ModuleBindingInput[]> = number extends TBindings["length"]
    ? readonly UnwrapModuleBinding<TBindings[number]>[]
    : TBindings extends readonly [
            infer TCurrentBinding extends ModuleBindingInput,
            ...infer TRemainingBindings extends readonly ModuleBindingInput[],
        ]
      ? readonly [UnwrapModuleBinding<TCurrentBinding>, ...UnwrapModuleBindings<TRemainingBindings>]
      : readonly [];

export type ModuleLocalBindings<TModule extends AnyModuleDefinition> = UnwrapModuleBindings<TModule["bindings"]>;

export type ModuleExportedBindingsFromInputs<TBindings extends readonly ModuleBindingInput[]> =
    number extends TBindings["length"]
        ? readonly AnyBinding[]
        : TBindings extends readonly [
                infer TCurrentBinding extends ModuleBindingInput,
                ...infer TRemainingBindings extends readonly ModuleBindingInput[],
            ]
          ? TCurrentBinding extends ExportedBinding<infer TExportedBinding>
              ? readonly [TExportedBinding, ...ModuleExportedBindingsFromInputs<TRemainingBindings>]
              : ModuleExportedBindingsFromInputs<TRemainingBindings>
          : readonly [];

export type ModuleExportedBindings<TModule extends AnyModuleDefinition> = ModuleExportedBindingsFromInputs<
    TModule["bindings"]
>;
