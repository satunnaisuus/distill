import type { AnyBindingOverride, OverridesPreserveRootResolution } from "../override/index";
import type { ApplyModulePublicOverrides, ValidateModuleContainerOverrides } from "./container-override-types";
import type { ModuleContainer } from "./container-scope-types";
import type { CompositionPublicBindings, CompositionPublicTokenArray } from "./interface-types";
import type { AnyBinding, AnyComposedModuleDefinition, AnyTokenArray } from "./types";

type RootPreservingModuleContainerOverrides<
    TComposition extends AnyComposedModuleDefinition,
    TOverrides extends readonly AnyBindingOverride[],
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
> = TOverrides &
    ValidateModuleContainerOverrides<TComposition, TOverrides, TPublicBindings, TPublicTokenArray> &
    (OverridesPreserveRootResolution<TOverrides> extends true ? unknown : never);

export type CreateModuleContainerFn<TComposition extends AnyComposedModuleDefinition> = {
    (): ModuleContainer<
        TComposition,
        CompositionPublicBindings<TComposition>,
        CompositionPublicTokenArray<TComposition>,
        readonly []
    >;
    <
        const TOverrides extends readonly AnyBindingOverride[],
        TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
        TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    >(
        ...overrides: RootPreservingModuleContainerOverrides<
            TComposition,
            TOverrides,
            TPublicBindings,
            TPublicTokenArray
        >
    ): ModuleContainer<TComposition, TPublicBindings, TPublicTokenArray, readonly []>;
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
        readonly []
    >;
};
