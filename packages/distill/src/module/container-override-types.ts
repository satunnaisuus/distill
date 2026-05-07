import type {
    AnyBindingOverride,
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
} from "../override/index";
import type { ValidateGraphBindings } from "../runtime/index";
import type {
    CompositionPublicBindings,
    ModuleExportedInterfaceBinding,
    ModuleImportedExportedBindingForToken,
    ModuleImportWireFor,
} from "./interface-types";
import type {
    AnyBinding,
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    Binding,
    BindingDependencies,
    BindingLifetimeOf,
    HasExactToken,
    IfNever,
    ModuleBindingInput,
    ValidationErrorIf,
    ValidationErrorUnlessNever,
} from "./types";

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

export type ApplyModulePublicOverrides<
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
    TExports extends readonly AnyToken[],
    TOverrides extends readonly AnyBindingOverride[],
> =
    HasExactToken<TExports[number], TInput["token"]> extends true
        ? BindingIsOverridden<TInput, TOverrides> extends true
            ? never
            : TInput
        : TInput;

type ModuleRemainingLocalBindings<
    TInputs extends readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[],
    TOverrides extends readonly AnyBindingOverride[],
> = number extends TInputs["length"]
    ? readonly ModuleRemainingLocalBindingInput<TInputs[number], TExports, TOverrides>[]
    : TInputs extends readonly [
            infer TCurrentInput extends ModuleBindingInput,
            ...infer TRemainingInputs extends readonly ModuleBindingInput[],
        ]
      ? ModuleRemainingLocalBindingInput<TCurrentInput, TExports, TOverrides> extends infer TCurrentBinding
          ? IfNever<
                TCurrentBinding,
                ModuleRemainingLocalBindings<TRemainingInputs, TExports, TOverrides>,
                readonly [
                    Extract<TCurrentBinding, AnyBinding>,
                    ...ModuleRemainingLocalBindings<TRemainingInputs, TExports, TOverrides>,
                ]
            >
          : never
      : readonly [];

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
> = readonly ModuleOverrideInterfaceBindingForToken<TOverrides, TModule["exports"][number]>[];

type ModuleResolvedLocalScope<
    TModule extends AnyModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
> = readonly (
    | ModuleRemainingLocalBindings<TModule["bindings"], TModule["exports"], TOverrides>[number]
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
        ? ModuleRemainingLocalBindings<
              TCurrentModule["bindings"],
              TCurrentModule["exports"],
              TOverrides
          > extends ValidateGraphBindings<
              ModuleRemainingLocalBindings<TCurrentModule["bindings"], TCurrentModule["exports"], TOverrides>,
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
                  ModuleRemainingLocalBindings<TCurrentModule["bindings"], TCurrentModule["exports"], TOverrides>,
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

export type ValidateModuleContainerOverrides<
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
