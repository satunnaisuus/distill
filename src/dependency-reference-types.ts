import type { AllToken, AnyAllToken } from "./all";
import type { optionalDependencyBrand, refDependencyBrand } from "./brands";
import type { AnyMultiToken, AnySingleToken } from "./token";

export type Ref<TValue> = {
    readonly value: TValue;
};

export type RefToken<TToken extends AnySingleToken> = {
    readonly [key in typeof refDependencyBrand]: true;
} & {
    readonly resolveToken: () => TToken;
};

export type AnyRefToken = RefToken<AnySingleToken>;
export type OptionalDependencyReference = AnySingleToken | AnyRefToken | AnyAllToken;

export type OptionalToken<TDependency extends OptionalDependencyReference> = {
    readonly [key in typeof optionalDependencyBrand]: true;
} & {
    readonly resolveDependency: () => TDependency;
};

export type AnyOptionalToken = OptionalToken<OptionalDependencyReference>;
export type DependencyReference = AnySingleToken | AnyRefToken | AnyAllToken | AnyOptionalToken;
export type DependencyToken<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? DependencyToken<TOptionalDependency>
        : TDependency extends RefToken<infer TToken>
          ? TToken
          : TDependency extends AllToken<infer TToken>
            ? TToken
            : TDependency;
export type SingleDependencyToken<TDependency extends DependencyReference> = Extract<
    DependencyToken<TDependency>,
    AnySingleToken
>;
export type AllDependencyToken<TDependency extends DependencyReference> =
    TDependency extends OptionalToken<infer TOptionalDependency>
        ? AllDependencyToken<TOptionalDependency>
        : TDependency extends AllToken<infer TToken>
          ? TToken
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
