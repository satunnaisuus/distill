import type { DependencyMap, ResolvedDependencies } from "../dependency/index";
import type { AnyToken, TokenValue } from "../token/index";
import {
    type AnyBinding,
    type BindingDependencies,
    type BindingLifetime,
    type BindingLifetimeOf,
    type BindingOptions,
    type CoreBinding,
    type Disposer,
    getBindingLifetime,
    getBindingDependencies as getCoreBindingDependencies,
    isBinding,
} from "./core-types";

export type { AnyBinding, BindingDependencies, BindingLifetime, BindingLifetimeOf, BindingOptions, Disposer };
export { getBindingLifetime, isBinding };

export type BindingFactory<
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
> = TDependencies extends DependencyMap
    ? (dependencies: ResolvedDependencies<TDependencies>) => TokenValue<TToken>
    : () => TokenValue<TToken>;

export type Binding<
    TToken extends AnyToken = AnyToken,
    TDependencies extends DependencyMap | undefined = undefined,
    TLifetime extends BindingLifetime = "singleton",
> = CoreBinding<TToken, TDependencies, TLifetime, BindingFactory<TToken, TDependencies>, Disposer<TokenValue<TToken>>>;

export const getBindingDependencies = (binding: AnyBinding): DependencyMap | undefined => {
    return getCoreBindingDependencies<DependencyMap>(binding);
};
