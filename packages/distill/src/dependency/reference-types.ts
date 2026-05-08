import type { AnyMultiToken, AnySingleToken, AnyToken, TokenValue } from "../token/index";
import type { Ref } from "./ref-types";
import type { optionalDependencyBrand, refDependencyBrand } from "./reference-brands";

export type { Ref };

export type RefToken<TToken extends AnySingleToken> = {
    readonly [key in typeof refDependencyBrand]: true;
} & {
    readonly resolveToken: () => TToken;
};

export type AnyRefToken = RefToken<AnySingleToken>;
export type OptionalDependencyReference = AnySingleToken | AnyMultiToken | AnyRefToken;

export type OptionalToken<TDependency extends OptionalDependencyReference> = {
    readonly [key in typeof optionalDependencyBrand]: true;
} & {
    readonly resolveDependency: () => TDependency;
};

export type AnyOptionalToken = OptionalToken<OptionalDependencyReference>;
export type DependencyReference = AnySingleToken | AnyMultiToken | AnyRefToken | AnyOptionalToken;
export type DependencyToken<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? DependencyToken<TOptionalDependency>
        : TDependency extends RefToken<infer TToken>
          ? TToken
          : TDependency;
export type SingleDependencyToken<TDependency extends DependencyReference> = Extract<
    DependencyToken<TDependency>,
    AnySingleToken
>;
export type AllDependencyToken<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? AllDependencyToken<TOptionalDependency>
        : TDependency extends AnyMultiToken
          ? TDependency
          : never;
export type EagerDependencyToken<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? EagerDependencyToken<TOptionalDependency>
        : TDependency extends RefToken<AnySingleToken>
          ? never
          : DependencyToken<TDependency>;
export type EagerSingleDependencyToken<TDependency extends DependencyReference> = Extract<
    EagerDependencyToken<TDependency>,
    AnySingleToken
>;
export type EagerAllDependencyToken<TDependency extends DependencyReference> = Extract<
    EagerDependencyToken<TDependency>,
    AnyMultiToken
>;

export type DependencyMap = Record<string, DependencyReference> & {
    readonly [key: number]: never;
    readonly [key: symbol]: never;
};

type ResolvedDependency<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? ResolvedDependency<TOptionalDependency> | undefined
        : TDependency extends RefToken<infer TToken>
          ? Ref<TokenValue<TToken>>
          : TDependency extends AnyMultiToken
            ? Array<TokenValue<TDependency>>
            : TDependency extends AnyToken
              ? TokenValue<TDependency>
              : never;

export type ResolvedDependencies<TDependencies extends DependencyMap> = {
    [TKey in keyof TDependencies]: ResolvedDependency<TDependencies[TKey]>;
};
