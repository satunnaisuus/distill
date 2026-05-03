import type { DependencyMap, ResolvedDependencies } from "../dependency/index";
import type { IfNever, IsAny } from "../shared/index";
import type { AnySingleToken, AnyToken, TokenValue } from "../token/index";
import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "./brands";
import { assertDisposeOption } from "./dispose-option";
import {
    type AnyBinding,
    type Binding,
    type BindingDependencies,
    type BindingFactory,
    type BindingLifetime,
    type BindingLifetimeOf,
    type Disposer,
    getBindingDependencies,
    getBindingLifetime,
    isBinding,
} from "./types";

export type { AnyBinding, Binding, BindingDependencies, BindingLifetime, BindingLifetimeOf, Disposer };
export { assertDisposeOption, getBindingDependencies, getBindingLifetime, isBinding };

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

type DependencyFreeClass<TValue> = new () => TValue;
type DependencyClass<TDependencies extends DependencyMap, TValue> = new (
    dependencies: ResolvedDependencies<TDependencies>,
) => TValue;

type ResolveLifetime<
    TLifetime extends BindingLifetime | undefined,
    TDefaultLifetime extends BindingLifetime,
> = TLifetime extends BindingLifetime ? TLifetime : TDefaultLifetime;

type BindFactoryMethod<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined> = {
    <TReturn extends NoInfer<TokenValue<TToken>>>(
        factory: () => TReturn,
    ): FluentBinding<TToken, undefined, ResolveLifetime<TLifetime, "singleton">>;

    <TDependencies extends DependencyMap, TReturn extends NoInfer<TokenValue<TToken>>>(
        dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
        factory: (dependencies: ResolvedDependencies<TDependencies>) => TReturn,
    ): FluentBinding<TToken, TDependencies, ResolveLifetime<TLifetime, "singleton">>;
};

type BindValueMethod<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined> = (
    value: NoInfer<TokenValue<TToken>>,
) => FluentBinding<TToken, undefined, ResolveLifetime<TLifetime, "singleton">>;

type BindClassMethod<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined> = {
    (
        serviceClass: DependencyFreeClass<NoInfer<TokenValue<TToken>>>,
    ): FluentBinding<TToken, undefined, ResolveLifetime<TLifetime, "singleton">>;

    <TDependencies extends DependencyMap>(
        dependencies: TDependencies & DefinedDependencyMap<TDependencies>,
        serviceClass: DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>,
    ): FluentBinding<TToken, TDependencies, ResolveLifetime<TLifetime, "singleton">>;
};

type ExistingTokenValueConstraint<TToken extends AnyToken, TExistingToken extends AnySingleToken> =
    TokenValue<TExistingToken> extends NoInfer<TokenValue<TToken>>
        ? unknown
        : {
              readonly __existing_value_not_assignable__: TokenValue<TExistingToken>;
          };

type BindAliasMethod<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined> = <
    TExistingToken extends AnySingleToken,
>(
    existingToken: TExistingToken & ExistingTokenValueConstraint<TToken, TExistingToken>,
) => FluentBinding<TToken, { readonly existing: TExistingToken }, ResolveLifetime<TLifetime, "transient">>;

type DisposeReturn = void | Promise<void>;
type VoidValue<TValue = void> = TValue;
type IsExactlyVoid<TValue> =
    IsAny<TValue> extends true
        ? false
        : [VoidValue] extends [TValue]
          ? [TValue] extends [VoidValue]
              ? true
              : false
          : false;
type ExactDisposerParameters<TValue, TDisposer extends (...args: any[]) => DisposeReturn> =
    IsExactlyVoid<TValue> extends true
        ? unknown
        : Parameters<TDisposer> extends [any]
          ? unknown
          : {
                readonly __dispose_must_accept_exactly_one_value__: true;
            };

type FluentDisposalMethod<TToken extends AnyToken, TNext> = {
    readonly disposable: <TDisposer extends (value: NoInfer<TokenValue<TToken>>) => DisposeReturn>(
        dispose: TDisposer & ExactDisposerParameters<NoInfer<TokenValue<TToken>>, TDisposer>,
    ) => TNext;
};

interface FluentBindBuilder<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined = undefined>
    extends FluentDisposalMethod<TToken, FluentBindBuilder<TToken, TLifetime>> {
    readonly singleton: () => FluentBindBuilder<TToken, "singleton">;
    readonly scoped: () => FluentBindBuilder<TToken, "scoped">;
    readonly transient: () => FluentBindBuilder<TToken, "transient">;
    readonly value: BindValueMethod<TToken, TLifetime>;
    readonly factory: BindFactoryMethod<TToken, TLifetime>;
    readonly class: BindClassMethod<TToken, TLifetime>;
    readonly alias: BindAliasMethod<TToken, TLifetime>;
    readonly useExisting: BindAliasMethod<TToken, TLifetime>;
}

type FluentBinding<
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
    TLifetime extends BindingLifetime,
> = Binding<TToken, TDependencies, TLifetime> & FluentBindingMethods<TToken, TDependencies, TLifetime>;

interface FluentBindingMethods<
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
    TLifetime extends BindingLifetime,
> extends FluentDisposalMethod<TToken, FluentBinding<TToken, TDependencies, TLifetime>> {
    readonly singleton: () => FluentBinding<TToken, TDependencies, "singleton">;
    readonly scoped: () => FluentBinding<TToken, TDependencies, "scoped">;
    readonly transient: () => FluentBinding<TToken, TDependencies, "transient">;
}

type Bind = <TToken extends AnyToken>(currentToken: TToken) => FluentBindBuilder<TToken>;

const createBindingWithoutDependencies = <TToken extends AnyToken, const TLifetime extends BindingLifetime>(
    lifetime: TLifetime,
    currentToken: TToken,
    factory: BindingFactory<TToken, undefined>,
    dispose?: Disposer<NoInfer<TokenValue<TToken>>>,
): Binding<TToken, undefined, TLifetime> => {
    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

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
    dispose?: Disposer<NoInfer<TokenValue<TToken>>>,
): Binding<TToken, TDependencies, TLifetime> => {
    if (dispose !== undefined) {
        assertDisposeOption(dispose);
    }

    return {
        [bindingBrand]: true,
        [bindingLifetimeBrand]: lifetime,
        token: currentToken,
        [bindingDependenciesBrand]: dependencies,
        factory,
        ...(dispose ? { dispose } : {}),
    };
};

type BuilderState<TToken extends AnyToken, TLifetime extends BindingLifetime | undefined> = {
    readonly currentToken: TToken;
    readonly lifetime?: TLifetime;
    readonly dispose?: Disposer<TokenValue<TToken>>;
};

const resolveLifetime = <const TDefaultLifetime extends BindingLifetime>(
    lifetime: BindingLifetime | undefined,
    defaultLifetime: TDefaultLifetime,
): BindingLifetime => {
    return lifetime ?? defaultLifetime;
};

const assertNoExtraArguments = (actualLength: number, expectedLength: number, message: string): void => {
    if (actualLength > expectedLength) {
        throw new Error(message);
    }
};

const createFluentBinding = <
    TToken extends AnyToken,
    TDependencies extends DependencyMap | undefined,
    const TLifetime extends BindingLifetime,
>(
    binding: Binding<TToken, TDependencies, TLifetime>,
): FluentBinding<TToken, TDependencies, TLifetime> => {
    const withLifetime = <const TNextLifetime extends BindingLifetime>(
        lifetime: TNextLifetime,
    ): FluentBinding<TToken, TDependencies, TNextLifetime> => {
        const nextBinding = {
            ...binding,
            [bindingLifetimeBrand]: lifetime,
        } as Binding<TToken, TDependencies, TNextLifetime>;

        return createFluentBinding(nextBinding);
    };

    return Object.assign(binding, {
        singleton: () => withLifetime("singleton"),
        scoped: () => withLifetime("scoped"),
        transient: () => withLifetime("transient"),
        disposable: (dispose: Disposer<NoInfer<TokenValue<TToken>>>) => {
            assertDisposeOption(dispose);

            return createFluentBinding({
                ...binding,
                dispose,
            });
        },
    }) as FluentBinding<TToken, TDependencies, TLifetime>;
};

const createFluentBuilder = <TToken extends AnyToken, TLifetime extends BindingLifetime | undefined = undefined>(
    state: BuilderState<TToken, TLifetime>,
): FluentBindBuilder<TToken, TLifetime> => {
    const withLifetime = <const TNextLifetime extends BindingLifetime>(
        lifetime: TNextLifetime,
    ): FluentBindBuilder<TToken, TNextLifetime> => {
        return createFluentBuilder({ ...state, lifetime });
    };

    const createFactoryBinding = <
        TDependencies extends DependencyMap | undefined,
        const TDefaultLifetime extends BindingLifetime,
    >(
        defaultLifetime: TDefaultLifetime,
        dependencies: TDependencies,
        factory: BindingFactory<TToken, TDependencies>,
    ): FluentBinding<TToken, TDependencies, ResolveLifetime<TLifetime, TDefaultLifetime>> => {
        const lifetime = resolveLifetime(state.lifetime, defaultLifetime) as ResolveLifetime<
            TLifetime,
            TDefaultLifetime
        >;

        if (dependencies === undefined) {
            return createFluentBinding(
                createBindingWithoutDependencies(
                    lifetime,
                    state.currentToken,
                    factory as BindingFactory<TToken, undefined>,
                    state.dispose,
                ),
            ) as FluentBinding<TToken, TDependencies, ResolveLifetime<TLifetime, TDefaultLifetime>>;
        }

        return createFluentBinding(
            createBindingWithDependencies(
                lifetime,
                state.currentToken,
                dependencies as Exclude<TDependencies, undefined>,
                factory as BindingFactory<TToken, Exclude<TDependencies, undefined>>,
                state.dispose,
            ),
        ) as FluentBinding<TToken, TDependencies, ResolveLifetime<TLifetime, TDefaultLifetime>>;
    };

    const bindFactory = <TDependencies extends DependencyMap>(
        ...args:
            | [factory: () => NoInfer<TokenValue<TToken>>]
            | [
                  dependencies: TDependencies,
                  factory: (dependencies: ResolvedDependencies<TDependencies>) => NoInfer<TokenValue<TToken>>,
              ]
    ): FluentBinding<TToken, TDependencies | undefined, ResolveLifetime<TLifetime, "singleton">> => {
        const [dependenciesOrFactory, maybeFactory] = args;

        if (typeof dependenciesOrFactory === "function") {
            assertNoExtraArguments(args.length, 1, "Factory bindings use .disposable(...) instead of options");

            return createFactoryBinding(
                "singleton",
                undefined,
                dependenciesOrFactory as BindingFactory<TToken, undefined>,
            ) as FluentBinding<TToken, TDependencies | undefined, ResolveLifetime<TLifetime, "singleton">>;
        }

        if (typeof maybeFactory !== "function") {
            throw new Error("Factory is required when dependencies are provided");
        }

        assertNoExtraArguments(args.length, 2, "Factory bindings use .disposable(...) instead of options");

        return createFactoryBinding(
            "singleton",
            dependenciesOrFactory,
            maybeFactory as BindingFactory<TToken, TDependencies>,
        ) as FluentBinding<TToken, TDependencies | undefined, ResolveLifetime<TLifetime, "singleton">>;
    };

    const bindValue = (
        ...args: [value: NoInfer<TokenValue<TToken>>]
    ): FluentBinding<TToken, undefined, ResolveLifetime<TLifetime, "singleton">> => {
        const [value] = args;

        assertNoExtraArguments(args.length, 1, "Value bindings use .disposable(...) instead of options");

        return createFactoryBinding("singleton", undefined, () => value);
    };

    const bindClass = <TDependencies extends DependencyMap>(
        ...args:
            | [serviceClass: DependencyFreeClass<NoInfer<TokenValue<TToken>>>]
            | [dependencies: TDependencies, serviceClass: DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>]
    ): FluentBinding<TToken, TDependencies | undefined, ResolveLifetime<TLifetime, "singleton">> => {
        const [dependenciesOrClass, maybeClass] = args;

        if (typeof dependenciesOrClass === "function") {
            assertNoExtraArguments(args.length, 1, "Class bindings use .disposable(...) instead of options");

            const serviceClass = dependenciesOrClass as DependencyFreeClass<NoInfer<TokenValue<TToken>>>;

            return createFactoryBinding("singleton", undefined, () => new serviceClass()) as FluentBinding<
                TToken,
                TDependencies | undefined,
                ResolveLifetime<TLifetime, "singleton">
            >;
        }

        if (typeof dependenciesOrClass !== "object" || dependenciesOrClass === null) {
            throw new Error("Class constructor must be a function");
        }

        if (typeof maybeClass !== "function") {
            throw new Error("Class constructor is required when dependencies are provided");
        }

        assertNoExtraArguments(args.length, 2, "Class bindings use .disposable(...) instead of options");

        const dependencies = dependenciesOrClass as TDependencies;
        const serviceClass = maybeClass as DependencyClass<TDependencies, NoInfer<TokenValue<TToken>>>;
        const factory = ((dependencies: ResolvedDependencies<TDependencies>) => {
            return new serviceClass(dependencies);
        }) as BindingFactory<TToken, TDependencies>;

        return createFactoryBinding("singleton", dependencies, factory) as FluentBinding<
            TToken,
            TDependencies | undefined,
            ResolveLifetime<TLifetime, "singleton">
        >;
    };

    const bindAlias = <TExistingToken extends AnySingleToken>(
        ...args: [existingToken: TExistingToken & ExistingTokenValueConstraint<TToken, TExistingToken>]
    ): FluentBinding<TToken, { readonly existing: TExistingToken }, ResolveLifetime<TLifetime, "transient">> => {
        const [existingToken] = args;

        assertNoExtraArguments(args.length, 1, "Alias bindings use .disposable(...) instead of options");

        const dependencies = { existing: existingToken as TExistingToken } as const;
        const factory = (({ existing }: ResolvedDependencies<typeof dependencies>) => {
            return existing as TokenValue<TToken>;
        }) as BindingFactory<TToken, typeof dependencies>;

        return createFactoryBinding("transient", dependencies, factory);
    };

    return {
        singleton: () => withLifetime("singleton"),
        scoped: () => withLifetime("scoped"),
        transient: () => withLifetime("transient"),
        disposable: (dispose: Disposer<NoInfer<TokenValue<TToken>>>) => {
            assertDisposeOption(dispose);

            return createFluentBuilder({ ...state, dispose });
        },
        value: bindValue,
        factory: bindFactory,
        class: bindClass,
        alias: bindAlias,
        useExisting: bindAlias,
    } as FluentBindBuilder<TToken, TLifetime>;
};

export const bind = (<TToken extends AnyToken>(...args: [currentToken: TToken]): FluentBindBuilder<TToken> => {
    const [currentToken] = args;

    assertNoExtraArguments(args.length, 1, "bind(...) now returns a fluent builder; use bind(token).factory(...)");

    return createFluentBuilder({ currentToken });
}) as Bind;
