import { bindingBrand, bindingDependenciesBrand } from "./brands";
import type { DependencyMap, ResolvedDependencies } from "./dependencies";
import type { AnyToken, TokenValue } from "./token";

type IsAny<TValue> = 0 extends 1 & TValue ? true : false;
type UndefinedDependencyKeys<TDependencies> = {
    [TKey in keyof TDependencies]-?: IsAny<TDependencies[TKey]> extends true
        ? never
        : undefined extends TDependencies[TKey]
          ? TKey
          : never;
}[keyof TDependencies];
type DefinedDependencyMap<TDependencies> = [UndefinedDependencyKeys<TDependencies>] extends [never]
    ? unknown
    : {
          readonly __dependency_values_must_be_defined__: UndefinedDependencyKeys<TDependencies>;
      };

type BindingFactory<
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
> = TDependencies extends DependencyMap
    ? (dependencies: ResolvedDependencies<TDependencies>) => TokenValue<TToken>
    : () => TokenValue<TToken>;

export type Binding<TToken extends AnyToken = AnyToken, TDependencies extends DependencyMap | undefined = undefined> = {
    readonly [bindingBrand]: true;
    readonly token: TToken;
    readonly factory: BindingFactory<TToken, TDependencies>;
    readonly [bindingDependenciesBrand]?: TDependencies;
};

export type AnyBinding = {
    readonly [bindingBrand]: true;
    readonly token: AnyToken;
    readonly factory: (...args: any[]) => unknown;
    readonly [bindingDependenciesBrand]?: DependencyMap | undefined;
};

export type BindingDependencies<TBinding extends AnyBinding> = TBinding[typeof bindingDependenciesBrand];

export const getBindingDependencies = (binding: AnyBinding): DependencyMap | undefined => {
    return Object.hasOwn(binding, bindingDependenciesBrand) ? binding[bindingDependenciesBrand] : undefined;
};

export const isBinding = (value: unknown): value is AnyBinding => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, bindingBrand);
};

export function bind<TToken extends AnyToken>(
    currentToken: TToken,
    factory: () => NoInfer<TokenValue<TToken>>,
): Binding<TToken>;

export function bind<TToken extends AnyToken, TDependencies extends DependencyMap>(
    currentToken: TToken,
    dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
    factory: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
): Binding<TToken, TDependencies>;

export function bind<TToken extends AnyToken, TDependencies extends DependencyMap>(
    currentToken: TToken,
    dependenciesOrFactory: TDependencies | (() => NoInfer<TokenValue<TToken>>),
    maybeFactory?: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
): Binding<TToken, TDependencies | undefined> {
    if (typeof dependenciesOrFactory === "function") {
        return {
            [bindingBrand]: true,
            token: currentToken,
            factory: dependenciesOrFactory as BindingFactory<TToken, undefined>,
        };
    }

    if (!maybeFactory) {
        throw new Error("Factory is required when dependencies are provided");
    }

    return {
        [bindingBrand]: true,
        token: currentToken,
        [bindingDependenciesBrand]: dependenciesOrFactory,
        factory: maybeFactory as BindingFactory<TToken, TDependencies>,
    };
}
