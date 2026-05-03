import type { AnyBindingOverride } from "../override/index";
import type { ApplyModulePublicOverrides, ValidateModuleContainerOverrides } from "./container-override-types";
import type { ModuleContainer } from "./container-scope-types";
import type { CompositionPublicBindings, CompositionPublicTokenArray } from "./interface-types";
import type { AnyBinding, AnyComposedModuleDefinition, AnyTokenArray } from "./types";

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
