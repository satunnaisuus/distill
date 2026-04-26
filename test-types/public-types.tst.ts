import {
    type Binding,
    type BindingLifetime,
    bind,
    type Container,
    createContainer,
    type DependencyMap,
    defineTokens,
    type as defineType,
    type Ref,
    type RefToken,
    type ResolvedDependencies,
    type Token,
    type TokenDefinitions,
    type Tokens,
    type TypeDescriptor,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokens } from "./fixtures/tokens.js";

test("public helper types preserve their documented type relationships", () => {
    type Definitions = {
        readonly config: TypeDescriptor<Config>;
        readonly logger: TypeDescriptor<Logger>;
        readonly port: TypeDescriptor<number>;
    };
    type Dependencies = {
        readonly config: typeof tokens.config;
        readonly logger: RefToken<typeof tokens.logger>;
    };

    expect(defineType<Config>()).type.toBe<TypeDescriptor<Config>>();
    expect(defineType()).type.toBe<TypeDescriptor<unknown>>();
    expect<Definitions>().type.toBeAssignableTo<TokenDefinitions>();
    expect<Tokens<Definitions>>().type.toBe<{
        readonly config: Token<"config", Config>;
        readonly logger: Token<"logger", Logger>;
        readonly port: Token<"port", number>;
    }>();
    expect<Dependencies>().type.toBeAssignableTo<DependencyMap>();
    expect<BindingLifetime>().type.toBe<"singleton" | "scoped" | "transient">();
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
});

test("defineTokens and createContainer preserve empty token registries", () => {
    const emptyTokens = defineTokens({});
    const container = createContainer(emptyTokens);

    expect(emptyTokens).type.toBe<{}>();
    expect(container.resolve).type.toBe<(token: never) => never>();
    expect<Parameters<typeof container.resolve>[0]>().type.toBe<never>();
});

test("public Container helper type exposes createScope relationships", () => {
    const typedContainer: Container<readonly [Binding<typeof tokens.config>], typeof tokens> = createContainer(
        tokens,
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
    const typedContainer: Container<readonly [Binding<typeof tokens.config>], typeof tokens> = createContainer(
        tokens,
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
    const scopedTokens = defineTokens({
        request: defineType<Request>(),
        service: defineType<Service>(),
    });
    const serviceBinding = bind.scoped(scopedTokens.service, { request: scopedTokens.request }, ({ request }) => ({
        request,
    }));
    const requestBinding = bind.scoped(scopedTokens.request, () => ({ id: "request-1" }));
    const typedContainer: Container<readonly [typeof serviceBinding], typeof scopedTokens> = createContainer(
        scopedTokens,
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
    const scopedTokens = defineTokens({
        serviceA: defineType<ServiceA>(),
        serviceB: defineType<ServiceB>(),
        serviceC: defineType<ServiceC>(),
    });
    const serviceABinding = bind.singleton(
        scopedTokens.serviceA,
        { serviceB: scopedTokens.serviceB },
        ({ serviceB }) => ({
            serviceB,
        }),
    );
    const rootServiceBBinding = bind.singleton(scopedTokens.serviceB, () => ({ name: "root" }));
    const childServiceBBinding = bind.scoped(scopedTokens.serviceB, () => ({ name: "child" }));
    const child = createContainer(scopedTokens, serviceABinding, rootServiceBBinding).createScope(childServiceBBinding);
    const typedChild: Container<
        readonly [typeof serviceABinding, typeof rootServiceBBinding, typeof childServiceBBinding],
        typeof scopedTokens
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
    const scopedTokens = defineTokens({
        config: defineType<Config>(),
        service: defineType<Service>(),
        consumer: defineType<Consumer>(),
    });
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const childServiceBinding = bind.singleton(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        name: config.name,
    }));
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokens, rootConfigBinding).createScope(childServiceBinding, childConfigBinding);

    expect(() => {
        const _flattenedChild: Container<
            readonly [typeof rootConfigBinding, typeof childServiceBinding, typeof childConfigBinding],
            typeof scopedTokens
        > = child;
        _flattenedChild;
    }).type.toRaiseError();

    const typedChild: Container<
        readonly [typeof rootConfigBinding, typeof childServiceBinding, typeof childConfigBinding],
        typeof scopedTokens,
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
    const scopedTokens = defineTokens({
        config: defineType<Config>(),
        port: defineType<Port>(),
        service: defineType<Service>(),
        consumer: defineType<Consumer>(),
    });
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const childPortBinding = bind.transient(scopedTokens.port, { config: scopedTokens.config }, () => ({
        value: 3000,
    }));
    const childServiceBinding = bind.singleton(scopedTokens.service, { port: scopedTokens.port }, ({ port }) => ({
        port,
    }));
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokens, rootConfigBinding).createScope(
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
        typeof scopedTokens,
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
    const scopedTokens = defineTokens({
        config: defineType<Config>(),
        service: defineType<Service>(),
        consumer: defineType<Consumer>(),
    });
    const rootConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "root" }));
    const rootServiceBinding = bind.singleton(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        name: config.name,
    }));
    const childConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokens, rootConfigBinding, rootServiceBinding).createScope(childConfigBinding);
    const typedChild: Container<
        readonly [typeof rootConfigBinding, typeof rootServiceBinding, typeof childConfigBinding],
        typeof scopedTokens
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
    const scopedTokens = defineTokens({
        config: defineType<Config>(),
        logger: defineType<Logger>(),
        service: defineType<Service>(),
        consumer: defineType<Consumer>(),
    });
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
    const child = createContainer(scopedTokens, rootConfigBinding, rootLoggerBinding).createScope(
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
        typeof scopedTokens,
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
    const scopedTokens = defineTokens({
        config: defineType<Config>(),
        port: defineType<number>(),
    });
    const configBinding = bind.scoped(scopedTokens.config, () => ({ port: 3000 }));
    const portBinding = bind.scoped(scopedTokens.port, () => 3000);
    const child = createContainer(scopedTokens, configBinding).createScope(portBinding);
    const typedChild: Container<
        readonly [typeof configBinding, typeof portBinding],
        typeof scopedTokens,
        readonly [readonly [typeof configBinding], readonly [typeof portBinding]]
    > = child;

    expect(typedChild.resolve(scopedTokens.config)).type.toBe<Config>();
    expect(typedChild.resolve(scopedTokens.port)).type.toBe<number>();
});
