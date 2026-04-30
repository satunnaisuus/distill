import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "./brands";
import type { DependencyMap, ResolvedDependencies } from "./dependencies";
import { getDisposeOption } from "./dispose-option";
import type { AnySingleToken, AnyToken, TokenValue } from "./token";
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

type DependencyFreeClass<TValue> = new () => TValue;
type DependencyClass<TDependencies extends DependencyMap, TValue> = new (
    dependencies: ResolvedDependencies<TDependencies>,
) => TValue;

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

type BindValueFunction<TLifetime extends BindingLifetime> = <TToken extends AnyToken>(
    currentToken: TToken,
    value: NoInfer<TokenValue<TToken>>,
    options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
) => Binding<TToken, undefined, TLifetime>;

type BindClassFunction<TLifetime extends BindingLifetime> = {
    <TToken extends AnyToken>(
        currentToken: TToken,
        serviceClass: DependencyFreeClass<NoInfer<TokenValue<TToken>>>,
        options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, undefined, TLifetime>;

    <TToken extends AnyToken, TDependencies extends DependencyMap>(
        currentToken: TToken,
        dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
        serviceClass: DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>,
        options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, TDependencies, TLifetime>;
};

type ExistingTokenValueConstraint<TToken extends AnyToken, TExistingToken extends AnySingleToken> =
    TokenValue<TExistingToken> extends NoInfer<TokenValue<TToken>>
        ? unknown
        : {
              readonly __existing_value_not_assignable__: TokenValue<TExistingToken>;
          };

type BindAliasFunction<TLifetime extends BindingLifetime> = <
    TToken extends AnyToken,
    TExistingToken extends AnySingleToken,
>(
    currentToken: TToken,
    existingToken: TExistingToken & ExistingTokenValueConstraint<TToken, TExistingToken>,
) => Binding<TToken, { readonly existing: TExistingToken }, TLifetime>;

type BindProviderFunctions<TLifetime extends BindingLifetime, TAliasLifetime extends BindingLifetime = TLifetime> = {
    readonly value: BindValueFunction<TLifetime>;
    readonly factory: BindFunction<TLifetime>;
    readonly class: BindClassFunction<TLifetime>;
    readonly alias: BindAliasFunction<TAliasLifetime>;
    readonly useExisting: BindAliasFunction<TAliasLifetime>;
};

type BindWithProviders<TLifetime extends BindingLifetime> = BindFunction<TLifetime> & BindProviderFunctions<TLifetime>;

type Bind = BindFunction<"singleton"> &
    BindProviderFunctions<"singleton", "transient"> & {
        readonly singleton: BindWithProviders<"singleton">;
        readonly scoped: BindWithProviders<"scoped">;
        readonly transient: BindWithProviders<"transient">;
    };

const createBindingWithoutDependencies = <TToken extends AnyToken, const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
    currentToken: TToken,
    factory: BindingFactory<TToken, undefined>,
    options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
): Binding<TToken, undefined, TLifetime> => {
    const dispose = getDisposeOption(options);

    return {
        [bindingBrand]: true,
        [bindingLifetimeBrand]: lifetime,
        token: currentToken,
        factory,
        ...(dispose ? { dispose } : {}),
    };
};

const createBindingWithDependencies = <
    TToken extends AnyToken,
    TDependencies extends DependencyMap,
    const TLifetime extends BindingLifetime,
>(
    lifetime: TLifetime,
    currentToken: TToken,
    dependencies: TDependencies,
    factory: BindingFactory<TToken, TDependencies>,
    options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
): Binding<TToken, TDependencies, TLifetime> => {
    const dispose = getDisposeOption(options);

    return {
        [bindingBrand]: true,
        [bindingLifetimeBrand]: lifetime,
        token: currentToken,
        [bindingDependenciesBrand]: dependencies,
        factory,
        ...(dispose ? { dispose } : {}),
    };
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

            return createBindingWithoutDependencies(
                lifetime,
                currentToken,
                dependenciesOrFactory as BindingFactory<TToken, undefined>,
                options,
            );
        }

        if (typeof maybeFactoryOrOptions !== "function") {
            throw new Error("Factory is required when dependencies are provided");
        }

        return createBindingWithDependencies(
            lifetime,
            currentToken,
            dependenciesOrFactory,
            maybeFactoryOrOptions as BindingFactory<TToken, TDependencies>,
            maybeOptions,
        );
    };

    return bindWithLifetime as BindFunction<TLifetime>;
};

const createBindValue = <const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
): BindValueFunction<TLifetime> => {
    const bindValue = <TToken extends AnyToken>(
        currentToken: TToken,
        value: NoInfer<TokenValue<TToken>>,
        options?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, undefined, TLifetime> => {
        return createBindingWithoutDependencies(lifetime, currentToken, () => value, options);
    };

    return bindValue as BindValueFunction<TLifetime>;
};

const createBindClass = <const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
): BindClassFunction<TLifetime> => {
    const bindClass = <TToken extends AnyToken, TDependencies extends DependencyMap>(
        currentToken: TToken,
        dependenciesOrClass:
            | TDependencies
            | DependencyFreeClass<NoInfer<TokenValue<TToken>>>
            | DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>,
        maybeClassOrOptions?:
            | DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>
            | BindingOptions<NoInfer<TokenValue<TToken>>>,
        maybeOptions?: BindingOptions<NoInfer<TokenValue<TToken>>>,
    ): Binding<TToken, TDependencies | undefined, TLifetime> => {
        if (typeof dependenciesOrClass === "function") {
            const serviceClass = dependenciesOrClass as DependencyFreeClass<NoInfer<TokenValue<TToken>>>;
            const options = maybeClassOrOptions as BindingOptions<NoInfer<TokenValue<TToken>>> | undefined;

            return createBindingWithoutDependencies(lifetime, currentToken, () => new serviceClass(), options);
        }

        if (typeof dependenciesOrClass !== "object" || dependenciesOrClass === null) {
            throw new Error("Class constructor must be a function");
        }

        if (typeof maybeClassOrOptions !== "function") {
            throw new Error("Class constructor is required when dependencies are provided");
        }

        const serviceClass = maybeClassOrOptions as DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>;
        const dependencies = dependenciesOrClass as TDependencies;
        const factory = ((dependencies: ResolvedDependencies<TDependencies>) => {
            return new serviceClass(dependencies);
        }) as BindingFactory<TToken, TDependencies>;

        return createBindingWithDependencies(lifetime, currentToken, dependencies, factory, maybeOptions);
    };

    return bindClass as BindClassFunction<TLifetime>;
};

const createBindAlias = <const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
): BindAliasFunction<TLifetime> => {
    const bindAlias = <TToken extends AnyToken, TExistingToken extends AnySingleToken>(
        currentToken: TToken,
        existingToken: TExistingToken & ExistingTokenValueConstraint<TToken, TExistingToken>,
    ): Binding<TToken, { readonly existing: TExistingToken }, TLifetime> => {
        const dependencies = { existing: existingToken as TExistingToken } as const;
        const factory = (({ existing }: ResolvedDependencies<typeof dependencies>) => {
            return existing as TokenValue<TToken>;
        }) as BindingFactory<TToken, typeof dependencies>;

        return createBindingWithDependencies(lifetime, currentToken, dependencies, factory, undefined);
    };

    return bindAlias as BindAliasFunction<TLifetime>;
};

const createBindWithProviders = <const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
): BindWithProviders<TLifetime> => {
    const bindWithLifetime = createBind(lifetime);
    const alias = createBindAlias(lifetime);

    return Object.assign(bindWithLifetime, {
        value: createBindValue(lifetime),
        factory: bindWithLifetime,
        class: createBindClass(lifetime),
        alias,
        useExisting: alias,
    }) as BindWithProviders<TLifetime>;
};

const topLevelAlias = createBindAlias("transient");

export const bind = Object.assign(createBindWithProviders("singleton"), {
    alias: topLevelAlias,
    useExisting: topLevelAlias,
    singleton: createBindWithProviders("singleton"),
    scoped: createBindWithProviders("scoped"),
    transient: createBindWithProviders("transient"),
}) as Bind;
