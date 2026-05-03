import type { AnyBinding, Binding, BindingDependencies, BindingLifetimeOf } from "./bind";
import type {
    ApplyContainerOverrideBindings,
    BindingIsOverridden,
    DuplicateOverridesError,
    MissingSingleOverrideTargetsError,
    MultiOverrideBindings,
    OverrideOperationTokens,
    OverrideTokensOutsideTokenListError,
    SingleOverrideBindings,
    TupleOverridesError,
    UnionOverrideTokenError,
} from "./container-override-types";
import type { ModuleContainer } from "./module-container-scope-types";
import type {
    CompositionPublicBindings,
    CompositionPublicTokenArray,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportWireFor,
} from "./module-interface-types";
import type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    ExportedBinding,
    ModuleBindingInput,
} from "./module-types";
import type { AnyBindingOverride } from "./override";
import type { AnySingleToken, AnyToken, AnyTokenArray } from "./token";
import type { HasExactToken } from "./token-type-utils";
import type { IfNever, ValidationErrorIf, ValidationErrorUnlessNever } from "./type-utils";
import type { ValidateGraphBindings } from "./validation";

type ModuleOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = readonly [
    ...SingleOverrideBindings<TOverrides>,
    ...MultiOverrideBindings<TOverrides>,
];

type ModuleOverrideInterfaceBindings<TOverrideBindings extends readonly AnyBinding[]> =
    number extends TOverrideBindings["length"]
        ? readonly AnyBinding[]
        : TOverrideBindings extends readonly [
                infer TCurrentBinding extends AnyBinding,
                ...infer TRemainingBindings extends readonly AnyBinding[],
            ]
          ? readonly [
                ModuleExportedInterfaceBinding<TCurrentBinding, BindingDependencies<TCurrentBinding>>,
                ...ModuleOverrideInterfaceBindings<TRemainingBindings>,
            ]
          : readonly [];

type ModulePublicOverrideInterfaceBindings<
    TOverrides extends readonly AnyBindingOverride[],
    TOverrideBindings extends readonly AnyBinding[] = ModuleOverrideBindings<TOverrides>,
> = ModuleOverrideInterfaceBindings<TOverrideBindings>;

type ApplyModulePublicOverrides<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = ApplyContainerOverrideBindings<
    CompositionPublicBindings<TComposition>,
    TOverrides,
    ModulePublicOverrideInterfaceBindings<TOverrides>
>;

type ModuleResolvedPublicInterfaceBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = ApplyModulePublicOverrides<TComposition, TOverrides>;

type ModuleRemainingLocalBindingInput<
    TInput extends ModuleBindingInput,
    TOverrides extends readonly AnyBindingOverride[],
> =
    TInput extends ExportedBinding<infer TBinding>
        ? BindingIsOverridden<TBinding, TOverrides> extends true
            ? never
            : TBinding
        : TInput extends AnyBinding
          ? TInput
          : never;

type ModuleRemainingLocalBindings<
    TInputs extends readonly ModuleBindingInput[],
    TOverrides extends readonly AnyBindingOverride[],
> = number extends TInputs["length"]
    ? readonly ModuleRemainingLocalBindingInput<TInputs[number], TOverrides>[]
    : TInputs extends readonly [
            infer TCurrentInput extends ModuleBindingInput,
            ...infer TRemainingInputs extends readonly ModuleBindingInput[],
        ]
      ? ModuleRemainingLocalBindingInput<TCurrentInput, TOverrides> extends infer TCurrentBinding
          ? IfNever<
                TCurrentBinding,
                ModuleRemainingLocalBindings<TRemainingInputs, TOverrides>,
                readonly [
                    Extract<TCurrentBinding, AnyBinding>,
                    ...ModuleRemainingLocalBindings<TRemainingInputs, TOverrides>,
                ]
            >
          : never
      : readonly [];

type ModuleExportedInputTokens<TInputs extends readonly ModuleBindingInput[]> = TInputs[number] extends infer TInput
    ? TInput extends ExportedBinding<infer TBinding>
        ? TBinding["token"]
        : never
    : never;

type ModuleOverrideInterfaceBindingForToken<
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnyToken,
    TBinding extends AnyBinding = ModuleOverrideBindings<TOverrides>[number],
> = TBinding extends AnyBinding
    ? HasExactToken<TToken, TBinding["token"]> extends true
        ? ModuleExportedInterfaceBinding<TBinding, BindingDependencies<TBinding>>
        : never
    : never;

type ModuleWiredOverrideInterfaceBinding<
    TImportToken extends AnySingleToken,
    TProviderBinding extends AnyBinding,
> = Binding<TImportToken, BindingDependencies<TProviderBinding>, BindingLifetimeOf<TProviderBinding>> & {
    readonly __module_exported_interface_binding__: true;
};

type ModuleWiredOverrideAwareBindingForToken<
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnySingleToken,
    TWireEntry extends AnyModuleImportWire,
> =
    HasExactToken<OverrideOperationTokens<TOverrides>, TWireEntry["providerToken"]> extends true
        ? ModuleOverrideInterfaceBindingForToken<TOverrides, TWireEntry["providerToken"]> extends infer TProviderBinding
            ? TProviderBinding extends AnyBinding
                ? ModuleWiredOverrideInterfaceBinding<TToken, TProviderBinding>
                : never
            : never
        : never;

type ModuleImportedOverrideAwareBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TToken extends AnyToken,
    TExcludedModule extends AnyModuleDefinition,
    TWire extends AnyComposedModuleDefinition["wire"],
> =
    HasExactToken<OverrideOperationTokens<TOverrides>, TToken> extends true
        ? ModuleOverrideInterfaceBindingForToken<TOverrides, TToken>
        : TToken extends AnySingleToken
          ? IfNever<
                ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken>,
                ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>,
                ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken> extends infer TWireEntry extends
                    AnyModuleImportWire
                    ? HasExactToken<OverrideOperationTokens<TOverrides>, TWireEntry["providerToken"]> extends true
                        ? ModuleWiredOverrideAwareBindingForToken<TOverrides, TToken, TWireEntry>
                        : ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>
                    : never
            >
          : ModuleImportedExportedBindingForToken<TModules, TToken, readonly [], TExcludedModule, TWire>;

type ModuleImportedOverrideAwareBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly ModuleImportedOverrideAwareBindingForToken<
    TModules,
    TOverrides,
    TModule["imports"][number],
    TModule,
    TWire
>[];

type ModuleProviderOverrideInterfaceBindings<
    TModule extends AnyModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = readonly ModuleOverrideInterfaceBindingForToken<TOverrides, ModuleExportedInputTokens<TModule["bindings"]>>[];

type ModuleResolvedLocalScope<
    TModule extends AnyModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = readonly (
    | ModuleRemainingLocalBindings<TModule["bindings"], TOverrides>[number]
    | ModuleProviderOverrideInterfaceBindings<TModule, TOverrides>[number]
)[];

type ModuleResolvedGraphScopes<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly [
    TResolvedPublicBindings,
    ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides, TWire>,
    ModuleResolvedLocalScope<TModule, TOverrides>,
];

type ModuleResolvedVisibleBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
    TWire extends AnyComposedModuleDefinition["wire"],
> = readonly (
    | TResolvedPublicBindings[number]
    | ModuleImportedOverrideAwareBindings<TModule, TModules, TOverrides, TWire>[number]
    | ModuleResolvedLocalScope<TModule, TOverrides>[number]
)[];

type InvalidResolvedCompositionModuleBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> = TComposition["modules"][number] extends infer TCurrentModule
    ? TCurrentModule extends AnyModuleDefinition
        ? ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides> extends ValidateGraphBindings<
              ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
              ModuleResolvedGraphScopes<
                  TCurrentModule,
                  TComposition["modules"],
                  TOverrides,
                  TResolvedPublicBindings,
                  TComposition["wire"]
              >,
              ModuleResolvedVisibleBindings<
                  TCurrentModule,
                  TComposition["modules"],
                  TOverrides,
                  TResolvedPublicBindings,
                  TComposition["wire"]
              >
          >
            ? never
            : ValidateGraphBindings<
                  ModuleRemainingLocalBindings<TCurrentModule["bindings"], TOverrides>,
                  ModuleResolvedGraphScopes<
                      TCurrentModule,
                      TComposition["modules"],
                      TOverrides,
                      TResolvedPublicBindings,
                      TComposition["wire"]
                  >,
                  ModuleResolvedVisibleBindings<
                      TCurrentModule,
                      TComposition["modules"],
                      TOverrides,
                      TResolvedPublicBindings,
                      TComposition["wire"]
                  >
              >
        : never
    : never;

type InvalidResolvedPublicModuleBindings<TResolvedPublicBindings extends readonly AnyBinding[]> =
    TResolvedPublicBindings extends ValidateGraphBindings<TResolvedPublicBindings, readonly [TResolvedPublicBindings]>
        ? never
        : ValidateGraphBindings<TResolvedPublicBindings, readonly [TResolvedPublicBindings]>;

type InvalidResolvedModuleBindings<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[],
> =
    | InvalidResolvedPublicModuleBindings<TResolvedPublicBindings>
    | InvalidResolvedCompositionModuleBindings<TComposition, TOverrides, TResolvedPublicBindings>;

type InvalidModuleOverrideBindingsError<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[] = ModuleResolvedPublicInterfaceBindings<
        TComposition,
        TOverrides
    >,
    TOverrideBindings extends readonly AnyBinding[] = ModuleOverrideBindings<TOverrides>,
> = IfNever<
    TOverrideBindings[number],
    {},
    ValidationErrorIf<
        TOverrideBindings extends ValidateGraphBindings<TOverrideBindings, readonly [TResolvedPublicBindings]>
            ? false
            : true,
        {
            readonly __invalid_overrides__: ValidateGraphBindings<
                TOverrideBindings,
                readonly [TResolvedPublicBindings]
            >;
        }
    >
>;

type InvalidModuleResolvedGraphError<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TResolvedPublicBindings extends readonly AnyBinding[] = ModuleResolvedPublicInterfaceBindings<
        TComposition,
        TOverrides
    >,
> = IfNever<
    TOverrides[number],
    {},
    ValidationErrorUnlessNever<
        InvalidResolvedModuleBindings<TComposition, TOverrides, TResolvedPublicBindings>,
        {
            readonly __invalid_overrides__: InvalidResolvedModuleBindings<
                TComposition,
                TOverrides,
                TResolvedPublicBindings
            >;
        }
    >
>;

type ValidateModuleContainerOverrides<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
> = TupleOverridesError<TOverrides> &
    UnionOverrideTokenError<TOverrides> &
    DuplicateOverridesError<TOverrides> &
    OverrideTokensOutsideTokenListError<TOverrides, TPublicTokenArray> &
    MissingSingleOverrideTargetsError<TOverrides, TPublicBindings> &
    InvalidModuleOverrideBindingsError<TComposition, TOverrides> &
    InvalidModuleResolvedGraphError<TComposition, TOverrides>;

type CreateModuleDefinitionContainerFn<TComposition extends AnyComposedModuleDefinition> = {
    (): ModuleContainer<
        TComposition,
        CompositionPublicBindings<TComposition>,
        CompositionPublicTokenArray<TComposition>,
        readonly [],
        readonly []
    >;
    <
        const TOverrides extends readonly AnyBindingOverride[],
        TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
        TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    >(
        ...overrides: TOverrides &
            ValidateModuleContainerOverrides<TComposition, TOverrides, TPublicBindings, TPublicTokenArray>
    ): ModuleContainer<
        TComposition,
        ApplyModulePublicOverrides<TComposition, TOverrides>,
        TPublicTokenArray,
        readonly [],
        TOverrides
    >;
};

export type ModuleContainerDefinition<TComposition extends AnyComposedModuleDefinition = AnyComposedModuleDefinition> =
    {
        create: CreateModuleDefinitionContainerFn<TComposition>;
    };
