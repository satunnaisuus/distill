import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "./brands";
import type { DependencyMap, ResolvedDependencies } from "./dependencies";
import type { AnyToken, TokenValue } from "./token";

export type BindingLifetime = "singleton" | "scoped" | "transient";

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

export type Binding<
    TToken extends AnyToken = AnyToken,
    TDependencies extends DependencyMap | undefined = undefined,
    TLifetime extends BindingLifetime = "singleton",
> = {
    readonly [bindingBrand]: true;
    readonly [bindingLifetimeBrand]: TLifetime;
    readonly token: TToken;
    readonly factory: BindingFactory<TToken, TDependencies>;
    readonly [bindingDependenciesBrand]?: TDependencies;
};

export type AnyBinding = {
    readonly [bindingBrand]: true;
    readonly [bindingLifetimeBrand]: BindingLifetime;
    readonly token: AnyToken;
    readonly factory: (...args: any[]) => unknown;
    readonly [bindingDependenciesBrand]?: DependencyMap | undefined;
};

export type BindingDependencies<TBinding extends AnyBinding> = TBinding[typeof bindingDependenciesBrand];
export type BindingLifetimeOf<TBinding extends AnyBinding> = TBinding[typeof bindingLifetimeBrand];

export const getBindingDependencies = (binding: AnyBinding): DependencyMap | undefined => {
    return Object.hasOwn(binding, bindingDependenciesBrand) ? binding[bindingDependenciesBrand] : undefined;
};

export const getBindingLifetime = (binding: AnyBinding): BindingLifetime => {
    return binding[bindingLifetimeBrand];
};

export const isBinding = (value: unknown): value is AnyBinding => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, bindingBrand);
};

type BindFunction<TLifetime extends BindingLifetime> = {
    <TToken extends AnyToken>(
        currentToken: TToken,
        factory: () => NoInfer<TokenValue<TToken>>,
    ): Binding<TToken, undefined, TLifetime>;

    <TToken extends AnyToken, TDependencies extends DependencyMap>(
        currentToken: TToken,
        dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
        factory: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
    ): Binding<TToken, TDependencies, TLifetime>;
};

type Bind = BindFunction<"singleton"> & {
    readonly singleton: BindFunction<"singleton">;
    readonly scoped: BindFunction<"scoped">;
    readonly transient: BindFunction<"transient">;
};

const createBind = <const TLifetime extends BindingLifetime>(lifetime: TLifetime): BindFunction<TLifetime> => {
    const bindWithLifetime = <TToken extends AnyToken, TDependencies extends DependencyMap>(
        currentToken: TToken,
        dependenciesOrFactory: TDependencies | (() => NoInfer<TokenValue<TToken>>),
        maybeFactory?: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
    ): Binding<TToken, TDependencies | undefined, TLifetime> => {
        if (typeof dependenciesOrFactory === "function") {
            return {
                [bindingBrand]: true,
                [bindingLifetimeBrand]: lifetime,
                token: currentToken,
                factory: dependenciesOrFactory as BindingFactory<TToken, undefined>,
            };
        }

        if (!maybeFactory) {
            throw new Error("Factory is required when dependencies are provided");
        }

        return {
            [bindingBrand]: true,
            [bindingLifetimeBrand]: lifetime,
            token: currentToken,
            [bindingDependenciesBrand]: dependenciesOrFactory,
            factory: maybeFactory as BindingFactory<TToken, TDependencies>,
        };
    };

    return bindWithLifetime as BindFunction<TLifetime>;
};

export const bind = Object.assign(createBind("singleton"), {
    singleton: createBind("singleton"),
    scoped: createBind("scoped"),
    transient: createBind("transient"),
}) as Bind;
