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
import { createRuntimeContainer, validateRuntimeContainerBindings } from "./runtime";

export type { Container, ContainerDefinition };

export type DefineContainer = <const TTokenArray extends AnyTokenArray, const TBindings extends readonly AnyBinding[]>(
    tokens: TTokenArray & ValidateTokenList<TTokenArray>,
    ...bindings: TBindings & ValidateBindings<TBindings, TTokenArray>
) => ContainerDefinition<TBindings, TTokenArray>;

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

export const defineContainer = defineContainerFlat as DefineContainer;
