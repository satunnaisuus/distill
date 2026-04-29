import {
    type Binding,
    type BindingLifetime,
    type BindingOptions,
    bind,
    type Container,
    createContainer,
    type DependencyMap,
    type Disposer,
    type Ref,
    type RefToken,
    type ResolvedDependencies,
    type Token,
    type TokenBuilder,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("public helper types preserve their documented type relationships", () => {
    type Dependencies = {
        readonly config: typeof tokens.config;
        readonly logger: RefToken<typeof tokens.logger>;
    };

    expect(token("config")).type.toBe<TokenBuilder<"config">>();
    expect(token("config").of<Config>()).type.toBe<Token<"config", Config>>();
    expect(token("unknown").of()).type.toBe<Token<"unknown", unknown>>();
    expect<Dependencies>().type.toBeAssignableTo<DependencyMap>();
    expect<BindingLifetime>().type.toBe<"singleton" | "scoped" | "transient">();
    expect<Disposer<number>>().type.toBe<(value: number) => void | Promise<void>>();
    expect<BindingOptions<number>>().type.toBe<{ readonly dispose?: Disposer<number> }>();
    expect<ResolvedDependencies<Dependencies>>().type.toBe<{
        readonly config: Config;
        readonly logger: Ref<Logger>;
    }>();
    expect<Binding<typeof tokens.port>["factory"]>().type.toBe<() => number>();
    expect<Binding<typeof tokens.port, { readonly config: typeof tokens.config }>["factory"]>().type.toBe<
        (dependencies: { readonly config: Config }) => number
    >();
    expect<Parameters<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>[0]>().type.toBe<
        typeof tokens.port
    >();
    expect<ReturnType<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>>().type.toBe<number>();
    expect<ReturnType<Container["dispose"]>>().type.toBe<Promise<void>>();
    expect<Container["disposed"]>().type.toBe<boolean>();
});

test("token arrays and createContainer preserve empty token arrays", () => {
    const emptyTokenList = [] as const;
    const container = createContainer(emptyTokenList);

    expect(container.resolve).type.toBe<(token: never) => never>();
    expect<Parameters<typeof container.resolve>[0]>().type.toBe<never>();
});

test("public Container helper type exposes createScope relationships", () => {
    const typedContainer: Container<readonly [Binding<typeof tokens.config>], typeof tokenList> = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const typedScope = typedContainer.createScope(bind(tokens.port, () => 3000));

    expect(typedScope.resolve(tokens.config)).type.toBe<Config>();
    expect(typedScope.resolve(tokens.port)).type.toBe<number>();
    expect(() => {
        typedContainer.createScope(
            bind(tokens.server, { logger: tokens.logger }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("public Container helper type preserves nested createScope relationships", () => {
    const typedContainer: Container<readonly [Binding<typeof tokens.config>], typeof tokenList> = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const typedScope = typedContainer.createScope(bind(tokens.port, () => 3000));
    const typedNestedScope = typedScope.createScope(
        bind(tokens.logger, () => ({
            log: () => {},
        })),
    );

    expect(typedNestedScope.resolve(tokens.config)).type.toBe<Config>();
    expect(typedNestedScope.resolve(tokens.port)).type.toBe<number>();
    expect(typedNestedScope.resolve(tokens.logger)).type.toBe<Logger>();
    expect(() => {
        typedScope.resolve(tokens.logger);
    }).type.toRaiseError();
    expect(() => {
        typedScope.createScope(
            bind(tokens.server, { logger: tokens.logger }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("public Container helper type exposes descendant-supplied dependencies through createScope", () => {
    type Request = {
        readonly id: string;
    };
    type Service = {
        readonly request: Request;
    };
    const scopedTokens = {
        request: token("request").of<Request>(),
        service: token("service").of<Service>(),
    };
    const scopedTokenList = [scopedTokens.request, scopedTokens.service] as const;
    const serviceBinding = bind.scoped(scopedTokens.service, { request: scopedTokens.request }, ({ request }) => ({
        request,
    }));
    const requestBinding = bind.scoped(scopedTokens.request, () => ({ id: "request-1" }));
    const typedContainer: Container<readonly [typeof serviceBinding], typeof scopedTokenList> = createContainer(
        scopedTokenList,
        serviceBinding,
    );
    const typedScope = typedContainer.createScope(requestBinding);

    expect(() => {
        typedContainer.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(typedScope.resolve(scopedTokens.service)).type.toBe<Service>();
});

test("public Container helper type infers scope boundaries from flattened overrides", () => {
    type ServiceA = {
        readonly serviceB: ServiceB;
    };
    type ServiceB = {
        readonly name: string;
    };
    type ServiceC = {
        readonly serviceA: ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB, scopedTokens.serviceC] as const;
    const serviceABinding = bind.singleton(
        scopedTokens.serviceA,
        { serviceB: scopedTokens.serviceB },
        ({ serviceB }) => ({
            serviceB,
        }),
    );
    const rootServiceBBinding = bind.singleton(scopedTokens.serviceB, () => ({ name: "root" }));
    const childServiceBBinding = bind.scoped(scopedTokens.serviceB, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, serviceABinding, rootServiceBBinding).createScope(
        childServiceBBinding,
    );
    const typedChild: Container<
        readonly [typeof serviceABinding, typeof rootServiceBBinding, typeof childServiceBBinding],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>
    > = child;

    const grandchild = typedChild.createScope(
        bind.singleton(scopedTokens.serviceC, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
            serviceA,
        })),
    );

    expect(grandchild.resolve(scopedTokens.serviceC)).type.toBe<ServiceC>();
});

test("public Container helper type requires explicit scope boundaries for child bindings before overrides", () => {
    type Config = {
        readonly name: string;
    };
    type Service = {
        readonly name: string;
    };
    type Consumer = {
        readonly service: Service;
    };
    const scopedTokens = {
        config: token("config").of<Config>(),
        service: token("service").of<Service>(),
        consumer: token("consumer").of<Consumer>(),
    };
    const scopedTokenList = [scopedTokens.config, scopedTokens.service, scopedTokens.consumer] as const;
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const childServiceBinding = bind.singleton(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        name: config.name,
    }));
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, rootConfigBinding).createScope(
        childServiceBinding,
        childConfigBinding,
    );

    expect(() => {
        const _flattenedChild: Container<
            readonly [typeof rootConfigBinding, typeof childServiceBinding, typeof childConfigBinding],
            ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>
        > = child;
        _flattenedChild;
    }).type.toRaiseError();

    const typedChild: Container<
        readonly [typeof rootConfigBinding, typeof childServiceBinding, typeof childConfigBinding],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>,
        readonly [readonly [typeof rootConfigBinding], readonly [typeof childServiceBinding, typeof childConfigBinding]]
    > = child;

    const grandchild = typedChild.createScope(
        bind.singleton(scopedTokens.consumer, { service: scopedTokens.service }, ({ service }) => ({
            service,
        })),
    );

    expect(grandchild.resolve(scopedTokens.consumer)).type.toBe<Consumer>();
});

test("public Container helper type accepts explicit transitive child scope boundaries before overrides", () => {
    type Config = {
        readonly name: string;
    };
    type Port = {
        readonly value: number;
    };
    type Service = {
        readonly port: Port;
    };
    type Consumer = {
        readonly service: Service;
    };
    const scopedTokens = {
        config: token("config").of<Config>(),
        port: token("port").of<Port>(),
        service: token("service").of<Service>(),
        consumer: token("consumer").of<Consumer>(),
    };
    const scopedTokenList = [
        scopedTokens.config,
        scopedTokens.port,
        scopedTokens.service,
        scopedTokens.consumer,
    ] as const;
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const childPortBinding = bind.transient(scopedTokens.port, { config: scopedTokens.config }, () => ({
        value: 3000,
    }));
    const childServiceBinding = bind.singleton(scopedTokens.service, { port: scopedTokens.port }, ({ port }) => ({
        port,
    }));
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, rootConfigBinding).createScope(
        childPortBinding,
        childServiceBinding,
        childConfigBinding,
    );
    const typedChild: Container<
        readonly [
            typeof rootConfigBinding,
            typeof childPortBinding,
            typeof childServiceBinding,
            typeof childConfigBinding,
        ],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>,
        readonly [
            readonly [typeof rootConfigBinding],
            readonly [typeof childPortBinding, typeof childServiceBinding, typeof childConfigBinding],
        ]
    > = child;

    const grandchild = typedChild.createScope(
        bind.singleton(scopedTokens.consumer, { service: scopedTokens.service }, ({ service }) => ({
            service,
        })),
    );

    expect(grandchild.resolve(scopedTokens.consumer)).type.toBe<Consumer>();
});

test("public Container helper type preserves parent singleton owners before child overrides", () => {
    type Config = {
        readonly name: string;
    };
    type Service = {
        readonly name: string;
    };
    type Consumer = {
        readonly service: Service;
    };
    const scopedTokens = {
        config: token("config").of<Config>(),
        service: token("service").of<Service>(),
        consumer: token("consumer").of<Consumer>(),
    };
    const scopedTokenList = [scopedTokens.config, scopedTokens.service, scopedTokens.consumer] as const;
    const rootConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "root" }));
    const rootServiceBinding = bind.singleton(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        name: config.name,
    }));
    const childConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, rootConfigBinding, rootServiceBinding).createScope(
        childConfigBinding,
    );
    const typedChild: Container<
        readonly [typeof rootConfigBinding, typeof rootServiceBinding, typeof childConfigBinding],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>
    > = child;

    const grandchild = typedChild.createScope(
        bind.singleton(scopedTokens.consumer, { service: scopedTokens.service }, ({ service }) => ({
            service,
        })),
    );

    expect(grandchild.resolve(scopedTokens.consumer)).type.toBe<Consumer>();
});

test("public Container helper type accepts explicit child scope boundaries with union dependencies before overrides", () => {
    type Config = {
        readonly name: string;
    };
    type Logger = {
        readonly log: () => void;
    };
    type Service = {
        readonly dependency: Config | Logger;
    };
    type Consumer = {
        readonly service: Service;
    };
    const scopedTokens = {
        config: token("config").of<Config>(),
        logger: token("logger").of<Logger>(),
        service: token("service").of<Service>(),
        consumer: token("consumer").of<Consumer>(),
    };
    const scopedTokenList = [
        scopedTokens.config,
        scopedTokens.logger,
        scopedTokens.service,
        scopedTokens.consumer,
    ] as const;
    const configOrLogger = scopedTokens.config as typeof scopedTokens.config | typeof scopedTokens.logger;
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const rootLoggerBinding = bind.singleton(scopedTokens.logger, () => ({ log: () => {} }));
    const childServiceBinding = bind.singleton(
        scopedTokens.service,
        { dependency: configOrLogger },
        ({ dependency }) => ({
            dependency,
        }),
    );
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, rootConfigBinding, rootLoggerBinding).createScope(
        childServiceBinding,
        childConfigBinding,
    );
    const typedChild: Container<
        readonly [
            typeof rootConfigBinding,
            typeof rootLoggerBinding,
            typeof childServiceBinding,
            typeof childConfigBinding,
        ],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>,
        readonly [
            readonly [typeof rootConfigBinding, typeof rootLoggerBinding],
            readonly [typeof childServiceBinding, typeof childConfigBinding],
        ]
    > = child;

    const grandchild = typedChild.createScope(
        bind.singleton(scopedTokens.consumer, { service: scopedTokens.service }, ({ service }) => ({
            service,
        })),
    );

    expect(grandchild.resolve(scopedTokens.consumer)).type.toBe<Consumer>();
});

test("public Container helper type accepts explicit child scope boundaries without overrides", () => {
    const scopedTokens = {
        config: token("config").of<Config>(),
        port: token("port").of<number>(),
    };
    const scopedTokenList = [scopedTokens.config, scopedTokens.port] as const;
    const configBinding = bind.scoped(scopedTokens.config, () => ({ port: 3000 }));
    const portBinding = bind.scoped(scopedTokens.port, () => 3000);
    const child = createContainer(scopedTokenList, configBinding).createScope(portBinding);
    const typedChild: Container<
        readonly [typeof configBinding, typeof portBinding],
        ReadonlyArray<(typeof scopedTokens)[keyof typeof scopedTokens]>,
        readonly [readonly [typeof configBinding], readonly [typeof portBinding]]
    > = child;

    expect(typedChild.resolve(scopedTokens.config)).type.toBe<Config>();
    expect(typedChild.resolve(scopedTokens.port)).type.toBe<number>();
});
