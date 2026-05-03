import {
    type AnyComposedModuleDefinition,
    isComposedModuleDefinition,
    type ModuleContainerDefinition,
} from "../module/index";
import { createTokenListContext } from "../token/index";
import type {
    AnyBinding,
    AnyBindingOverride,
    AnyTokenArray,
    Container,
    ContainerDefinition,
    ValidateBindings,
    ValidateTokenList,
} from "./flat-types";
import { createRuntimeContainer, createRuntimeModuleContainer, validateRuntimeContainerBindings } from "./runtime";

export type { Container, ContainerDefinition, ModuleContainerDefinition };

export type DefineContainer = {
    <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
        tokens: TTokenArray & ValidateTokenList<TTokenArray>,
        ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
    ): ContainerDefinition<TBindings, TTokenArray>;
    readonly module: <const TComposition extends AnyComposedModuleDefinition>(
        composition: TComposition,
    ) => ModuleContainerDefinition<TComposition>;
};

const defineContainerFlat = <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
    tokens: TTokenArray & ValidateTokenList<TTokenArray>,
    ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
): ContainerDefinition<TBindings, TTokenArray> => {
    const tokenListContext = createTokenListContext(tokens);
    validateRuntimeContainerBindings(tokenListContext, bindings);

    return {
        create(...overrides: AnyBindingOverride[]) {
            return createRuntimeContainer(tokenListContext, bindings, overrides);
        },
    } as unknown as ContainerDefinition<TBindings, TTokenArray>;
};

const defineModuleContainer = <const TComposition extends AnyComposedModuleDefinition>(
    composition: TComposition,
): ModuleContainerDefinition<TComposition> => {
    if (!isComposedModuleDefinition(composition)) {
        throw new Error("Module container root must be created with composeModules");
    }

    createRuntimeModuleContainer(composition, []);

    return {
        create(...overrides: AnyBindingOverride[]) {
            return createRuntimeModuleContainer(composition, overrides);
        },
    } as unknown as ModuleContainerDefinition<TComposition>;
};

export const defineContainer = Object.assign(defineContainerFlat, {
    module: defineModuleContainer,
}) as DefineContainer;
