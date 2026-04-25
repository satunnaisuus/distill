import { bindingDependenciesBrand } from "./brands";
import type { DependencyMap, ResolvedDependencies } from "./dependencies";
import type { AnyToken, TokenValue } from "./token";

type BindingFactory<
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
> = TDependencies extends DependencyMap
    ? (dependencies: ResolvedDependencies<TDependencies>) => TokenValue<TToken>
    : () => TokenValue<TToken>;

export type Binding<TToken extends AnyToken = AnyToken, TDependencies extends DependencyMap | undefined = undefined> = {
    readonly token: TToken;
    readonly factory: BindingFactory<TToken, TDependencies>;
    readonly [bindingDependenciesBrand]?: TDependencies;
};

export type AnyBinding = {
    readonly token: AnyToken;
    readonly factory: (...args: any[]) => unknown;
    readonly [bindingDependenciesBrand]?: DependencyMap | undefined;
};

export type BindingDependencies<TBinding extends AnyBinding> = TBinding[typeof bindingDependenciesBrand];

export const getBindingDependencies = (binding: AnyBinding): DependencyMap | undefined => {
    return binding[bindingDependenciesBrand];
};

export function bind<TToken extends AnyToken>(currentToken: TToken, factory: () => TokenValue<TToken>): Binding<TToken>;

export function bind<TToken extends AnyToken, TDependencies extends DependencyMap>(
    currentToken: TToken,
    dependencies: TDependencies,
    factory: (dependencies: ResolvedDependencies<TDependencies>) => TokenValue<TToken>,
): Binding<TToken, TDependencies>;

export function bind<TToken extends AnyToken, TDependencies extends DependencyMap>(
    currentToken: TToken,
    dependenciesOrFactory: TDependencies | (() => TokenValue<TToken>),
    maybeFactory?: (dependencies: ResolvedDependencies<TDependencies>) => TokenValue<TToken>,
): Binding<TToken, TDependencies | undefined> {
    if (typeof dependenciesOrFactory === "function") {
        return {
            token: currentToken,
            factory: dependenciesOrFactory as BindingFactory<TToken, undefined>,
        };
    }

    if (!maybeFactory) {
        throw new Error("Factory is required when dependencies are provided");
    }

    return {
        token: currentToken,
        [bindingDependenciesBrand]: dependenciesOrFactory,
        factory: maybeFactory as BindingFactory<TToken, TDependencies>,
    };
}
