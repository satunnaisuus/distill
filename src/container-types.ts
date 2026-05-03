import type { AnyBinding } from "./bind";
import type { ContainerDefinition } from "./container-flat-types";
import type { ModuleContainerDefinition } from "./module-container-override-types";

export type { Container, ContainerDefinition } from "./container-flat-types";
export type { ModuleContainerDefinition } from "./module-container-override-types";
export type { ModuleContainer } from "./module-container-scope-types";

import type { AnyComposedModuleDefinition } from "./module-types";
import type { AnyTokenArray } from "./token";
import type { ValidateBindings, ValidateTokenList } from "./validation";

export type DefineContainer = {
    <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
        tokens: TTokenArray & ValidateTokenList<TTokenArray>,
        ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
    ): ContainerDefinition<TBindings, TTokenArray>;
    readonly module: <const TComposition extends AnyComposedModuleDefinition>(
        composition: TComposition,
    ) => ModuleContainerDefinition<TComposition>;
};
