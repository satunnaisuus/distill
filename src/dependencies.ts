import type { AllToken } from "./all";
import type { DependencyReference, DependencyToken, Ref, RefToken } from "./ref";
import type { TokenValue } from "./token";

export type DependencyMap = Record<string, DependencyReference> & {
    readonly [key: number]: never;
    readonly [key: symbol]: never;
};

type ResolvedDependency<TDependency extends DependencyReference> =
    TDependency extends RefToken<infer TToken>
        ? Ref<TokenValue<TToken>>
        : TDependency extends AllToken<infer TToken>
          ? Array<TokenValue<TToken>>
          : TokenValue<DependencyToken<TDependency>>;

export type ResolvedDependencies<TDependencies extends DependencyMap> = {
    [TKey in keyof TDependencies]: ResolvedDependency<TDependencies[TKey]>;
};
