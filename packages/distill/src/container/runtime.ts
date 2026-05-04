import type { AnyBinding } from "../binding/index";
import {
    type AnyComposedModuleDefinition,
    applyModuleBindingOverrides,
    createRuntimeModuleEntries,
    createRuntimeModuleGraph,
    createRuntimeModuleWireAliasEntries,
    type RuntimeRegisteredModuleEntry,
} from "../module/index";
import { createRuntimeScope, publicModuleContextId, type RuntimeScope } from "../runtime/index";
import { createTokenListContext, type TokenListContext } from "../token/index";
import { assertNoCircularDependencies } from "./circular-runtime";
import { type AnyBindingOverride, applyBindingOverrides } from "./overrides-runtime";
import { registerBindings } from "./registration-runtime";
import { resolveActual, resolveAllActual } from "./resolution-runtime";
import { createRuntimeContainerForScope, type RuntimeContainer } from "./scope-runtime";

const createRootScope = (tokenListContext: TokenListContext): RuntimeScope => {
    return createRuntimeScope({
        assertTokenIsInTokenList: (currentToken) => tokenListContext.assertTokenIsInTokenList(currentToken as never),
        registerToken: (currentToken) => tokenListContext.registerToken(currentToken as never),
        resolvingPath: [],
    });
};

const runtimeContainerScopeOptions = {
    registerBindings,
    resolveActual,
    resolveAllActual,
};

export const validateRuntimeContainerBindings = (
    tokenListContext: TokenListContext,
    bindings: readonly AnyBinding[],
): void => {
    registerBindings(createRootScope(tokenListContext), bindings);
};

export const createRuntimeContainer = (
    tokenListContext: TokenListContext,
    bindings: readonly AnyBinding[],
    overrides: readonly AnyBindingOverride[],
): RuntimeContainer => {
    const rootScope = createRootScope(tokenListContext);
    const resolvedBindings = applyBindingOverrides(tokenListContext, bindings, overrides);

    registerBindings(rootScope, resolvedBindings);

    return createRuntimeContainerForScope(rootScope, runtimeContainerScopeOptions);
};

export const createRuntimeModuleContainer = (
    composition: AnyComposedModuleDefinition,
    overrides: readonly AnyBindingOverride[],
): RuntimeContainer => {
    const tokenListContext = createTokenListContext([], { allowUnknownTokens: true });
    const modules = composition.modules;
    const entries = createRuntimeModuleEntries(modules);
    const rootScope = createRootScope(tokenListContext);
    const overrideResult = applyModuleBindingOverrides(tokenListContext, composition, entries, overrides);
    const wireAliasEntries = createRuntimeModuleWireAliasEntries(
        composition,
        overrideResult.excludedTokenIds,
        overrideResult.overrideBindingTokenIds,
    );
    const registeredEntries: RuntimeRegisteredModuleEntry[] = [];

    for (const entry of overrideResult.entries) {
        const [runtimeBinding] = registerBindings(rootScope, [entry.binding], {
            moduleContextId: entry.moduleId,
            visibleInAllModuleContexts: false,
            allowDuplicateSingleBindings: true,
            validateCircularDependencies: false,
        });

        registeredEntries.push({ ...entry, runtimeBinding });
    }

    for (const entry of wireAliasEntries) {
        registerBindings(rootScope, [entry.binding], {
            moduleContextId: entry.moduleId,
            visibleInAllModuleContexts: false,
            allowDuplicateSingleBindings: true,
            validateCircularDependencies: false,
        });
    }

    const overrideRuntimeBindings = registerBindings(rootScope, overrideResult.overrideBindings, {
        moduleContextId: publicModuleContextId,
        visibleInAllModuleContexts: false,
        allowDuplicateSingleBindings: true,
        validateCircularDependencies: false,
    });
    const registeredOverrideEntries = overrideResult.overrideBindings.map((binding, index) => ({
        binding,
        runtimeBinding: overrideRuntimeBindings[index],
    }));
    const moduleGraph = createRuntimeModuleGraph(
        composition,
        registeredEntries,
        registeredOverrideEntries,
        overrideResult.excludedTokenIds,
        overrideResult.overrideModuleContextIdsByTokenId,
    );

    rootScope.context.moduleGraph = moduleGraph;
    assertNoCircularDependencies(rootScope);

    return createRuntimeContainerForScope(rootScope, runtimeContainerScopeOptions, overrideResult.publicAccess);
};
