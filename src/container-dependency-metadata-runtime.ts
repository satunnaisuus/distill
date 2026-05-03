import { isAllDependency } from "./all";
import { isMultiToken } from "./container-scope-runtime";
import type { DependencyMap } from "./dependencies";
import { isOptionalDependency } from "./optional";
import { isRefDependency } from "./ref";
import type { RuntimeTokenReference } from "./runtime";
import { tokenDisplayKey, tokenKeyRuntimeId, tokenRuntimeId } from "./token";
import type { TokenListContext } from "./token-list-context";

export const getEagerDependencyReferences = (
    dependencies: DependencyMap | undefined,
    tokenListContext: TokenListContext,
): readonly RuntimeTokenReference[] | undefined => {
    if (!dependencies) {
        return undefined;
    }

    const eagerDependencies: RuntimeTokenReference[] = [];

    for (const dependencyReference of Object.values(dependencies)) {
        const dependency = isOptionalDependency(dependencyReference)
            ? dependencyReference.resolveDependency()
            : dependencyReference;

        if (isRefDependency(dependency)) {
            continue;
        }

        if (isAllDependency(dependency)) {
            const dependencyToken = dependency.resolveToken();
            tokenListContext.registerToken(dependencyToken);
            const dependencyTokenKey = tokenDisplayKey(dependencyToken);

            if (!isMultiToken(dependencyToken)) {
                throw new Error(`Token "${dependencyTokenKey}" is not a multibind token`);
            }

            eagerDependencies.push({
                tokenKey: dependencyTokenKey,
                tokenKeyId: tokenKeyRuntimeId(dependencyToken),
                tokenId: tokenRuntimeId(dependencyToken),
            });
            continue;
        }

        tokenListContext.registerToken(dependency);
        const dependencyTokenKey = tokenDisplayKey(dependency);

        if (isMultiToken(dependency)) {
            throw new Error(`Multibind token "${dependencyTokenKey}" must be resolved with resolveAll`);
        }

        eagerDependencies.push({
            tokenKey: dependencyTokenKey,
            tokenKeyId: tokenKeyRuntimeId(dependency),
            tokenId: tokenRuntimeId(dependency),
        });
    }

    return eagerDependencies;
};
