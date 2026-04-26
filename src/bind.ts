import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "./brands";
import type { DependencyMap, ResolvedDependencies } from "./dependencies";
import { getDisposeOption } from "./dispose-option";
import type { AnyToken, TokenValue } from "./token";
import type { IfNever, IsAny } from "./type-utils";

export type BindingLifetime = "singleton" | "scoped" | "transient";
export type Disposer<TValue> = (value: TValue) => void | Promise<void>;

export type BindingOptions<TValue> = {
    readonly dispose?: Disposer<TValue>;
};

type UndefinedDependencyKeys<TDependencies> = {
    [TKey in keyof TDependencies]-?: IsAny<TDependencies[TKey]> extends true
        ? never
        : undefined extends TDependencies[TKey]
          ? TKey
          : never;
}[keyof TDependencies];
type DefinedDependencyMap<TDependencies, TUndefinedKeys = UndefinedDependencyKeys<TDependencies>> = IfNever<
    TUndefinedKeys,
    unknown,
    {
        readonly __dependency_values_must_be_defined__: TUndefinedKeys;
    }
>;

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
    readonly dispose?: Disposer<TokenValue<TToken>>;
    readonly [bindingDependenciesBrand]?: TDependencies;
};

export type AnyBinding = {
    readonly [bindingBrand]: true;
    readonly [bindingLifetimeBrand]: BindingLifetime;
    readonly token: AnyToken;
    readonly factory: (...args: any[]) => unknown;
    readonly dispose?: unknown;
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
        options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, undefined, TLifetime>;

    <TToken extends AnyToken, TDependencies extends DependencyMap>(
        currentToken: TToken,
        dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
        factory: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
        options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
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
        maybeFactoryOrOptions?:
            | ((dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>)
            | BindingOptions<NoInfer<TokenValue<TToken>>>,
        maybeOptions?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, TDependencies | undefined, TLifetime> => {
        if (typeof dependenciesOrFactory === "function") {
            const options = maybeFactoryOrOptions as BindingOptions<NoInfer<TokenValue<TToken>>> | undefined;
            const dispose = getDisposeOption(options);

            return {
                [bindingBrand]: true,
                [bindingLifetimeBrand]: lifetime,
                token: currentToken,
                factory: dependenciesOrFactory as BindingFactory<TToken, undefined>,
                ...(dispose ? { dispose } : {}),
            };
        }

        if (typeof maybeFactoryOrOptions !== "function") {
            throw new Error("Factory is required when dependencies are provided");
        }

        const dispose = getDisposeOption(maybeOptions);

        return {
            [bindingBrand]: true,
            [bindingLifetimeBrand]: lifetime,
            token: currentToken,
            [bindingDependenciesBrand]: dependenciesOrFactory,
            factory: maybeFactoryOrOptions as BindingFactory<TToken, TDependencies>,
            ...(dispose ? { dispose } : {}),
        };
    };

    return bindWithLifetime as BindFunction<TLifetime>;
};

export const bind = Object.assign(createBind("singleton"), {
    singleton: createBind("singleton"),
    scoped: createBind("scoped"),
    transient: createBind("transient"),
}) as Bind;
