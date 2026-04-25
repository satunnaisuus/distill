import type { DependencyReference, DependencyToken, Ref, RefToken } from "./ref";
import type { TokenValue } from "./token";

export type DependencyMap = Record<string, DependencyReference> & {
    readonly [key: symbol]: never;
};

export type ResolvedDependencies<TDependencies extends DependencyMap> = {
    [TKey in keyof TDependencies]: TDependencies[TKey] extends RefToken<infer TToken>
        ? Ref<TokenValue<TToken>>
        : TokenValue<DependencyToken<TDependencies[TKey]>>;
};
