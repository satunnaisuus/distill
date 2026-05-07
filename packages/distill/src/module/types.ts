import type { AnyBinding, Binding, BindingDependencies, BindingLifetimeOf } from "../binding/index";
import type { IfNever } from "../shared/index";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    DuplicateTokenKeys,
    HasClassTokenKey,
    HasExactToken,
    HasSameKeyIncompatibleToken,
    HasTokenWithSameKey,
    IsMultiToken,
    SameTokenKey,
    TokenByKey,
    TokenIdentity,
    TokenKey,
    TokensNotIn,
    TokenValue,
} from "../token/index";
import type { composedModuleDefinitionBrand, moduleDefinitionBrand, moduleImportWireBrand } from "./brands";
import type { CreateModuleContainerFn } from "./container-definition-types";

export type {
    HasTrue,
    IfNever,
    IsExact,
    TupleError,
    ValidationErrorIf,
    ValidationErrorUnlessNever,
} from "../shared/index";
export type {
    AnyBinding,
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    Binding,
    BindingDependencies,
    BindingLifetimeOf,
    DuplicateTokenKeys,
    HasClassTokenKey,
    HasExactToken,
    HasSameKeyIncompatibleToken,
    HasTokenWithSameKey,
    IsMultiToken,
    SameTokenKey,
    TokenByKey,
    TokenIdentity,
    TokenKey,
    TokensNotIn,
    TokenValue,
};

export type ModuleBindingInput = AnyBinding;

export type AnyModuleDefinition = {
    readonly [TBrand in typeof moduleDefinitionBrand]: true;
} & {
    readonly id: number;
    readonly imports: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
    readonly exports: readonly AnyToken[];
};

export type ModuleDefinition<
    TImports extends readonly AnyToken[] = readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[] = readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[] = readonly AnyToken[],
> = {
    readonly [TBrand in typeof moduleDefinitionBrand]: true;
} & {
    readonly id: number;
    readonly imports: TImports;
    readonly bindings: TBindings;
    readonly exports: TExports;
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

type ComposedModuleDefinitionShape<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[],
> = {
    readonly [TBrand in typeof composedModuleDefinitionBrand]: true;
} & {
    readonly modules: TModules;
    readonly exports: TExports;
    readonly wire: TWire;
};

export type ComposedModuleDefinition<
    TModules extends readonly AnyModuleDefinition[] = readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[] = readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = ComposedModuleDefinitionShape<TModules, TExports, TWire> & {
    readonly createContainer: CreateModuleContainerFn<ComposedModuleDefinitionShape<TModules, TExports, TWire>>;
};

export type ModuleLocalBindings<TModule extends AnyModuleDefinition> = TModule["bindings"];

type ModuleExportedBindingFromInput<TBinding extends ModuleBindingInput, TExports extends readonly AnyToken[]> =
    HasExactToken<TExports[number], TBinding["token"]> extends true ? TBinding : never;

export type ModuleExportedBindingsFromInputs<
    TBindings extends readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[],
> = number extends TBindings["length"]
    ? readonly ModuleExportedBindingFromInput<TBindings[number], TExports>[]
    : TBindings extends readonly [
            infer TCurrentBinding extends ModuleBindingInput,
            ...infer TRemainingBindings extends readonly ModuleBindingInput[],
        ]
      ? ModuleExportedBindingFromInput<TCurrentBinding, TExports> extends infer TCurrentExportedBinding
          ? IfNever<
                TCurrentExportedBinding,
                ModuleExportedBindingsFromInputs<TRemainingBindings, TExports>,
                readonly [
                    Extract<TCurrentExportedBinding, AnyBinding>,
                    ...ModuleExportedBindingsFromInputs<TRemainingBindings, TExports>,
                ]
            >
          : never
      : readonly [];

export type ModuleExportedBindings<TModule extends AnyModuleDefinition> = ModuleExportedBindingsFromInputs<
    TModule["bindings"],
    TModule["exports"]
>;
