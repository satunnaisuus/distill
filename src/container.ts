import type { AnyBinding } from "./bind";
import {
    createRuntimeContainer,
    createRuntimeModuleContainer,
    validateRuntimeContainerBindings,
} from "./container-runtime";
import type { ContainerDefinition, DefineContainer, ModuleContainerDefinition } from "./container-types";

export type { Container, ContainerDefinition, ModuleContainer, ModuleContainerDefinition } from "./container-types";

import { isComposedModuleDefinition } from "./module";
import type { AnyComposedModuleDefinition } from "./module-types";
import type { AnyBindingOverride } from "./override";
import type { AnyTokenArray } from "./token";
import { createTokenListContext } from "./token-list-context";
import type { ValidateBindings, ValidateTokenList } from "./validation";

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
