import type { AllToken, AnyAllToken } from "./all";
import { refDependencyBrand } from "./brands";
import type { AnyOptionalToken, OptionalToken } from "./optional";
import type { AnyMultiToken, AnySingleToken } from "./token";
import { isRuntimeToken } from "./token";

export type Ref<TValue> = {
    readonly value: TValue;
};

export type RefToken<TToken extends AnySingleToken> = {
    readonly [refDependencyBrand]: true;
    readonly resolveToken: () => TToken;
};

export type AnyRefToken = RefToken<AnySingleToken>;
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

export const isRefDependency = (dependency: DependencyReference): dependency is AnyRefToken => {
    return typeof dependency === "object" && dependency !== null && refDependencyBrand in dependency;
};

export function ref<TToken extends AnySingleToken>(dependency: TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyFactory: () => TToken): RefToken<TToken>;
export function ref<TToken extends AnySingleToken>(dependencyOrFactory: TToken | (() => TToken)): RefToken<TToken> {
    const resolveToken =
        typeof dependencyOrFactory === "function" && !isRuntimeToken(dependencyOrFactory)
            ? (dependencyOrFactory as () => TToken)
            : () => dependencyOrFactory as TToken;

    return {
        [refDependencyBrand]: true,
        resolveToken,
    };
}
