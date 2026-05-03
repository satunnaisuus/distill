import {
    type Binding,
    bind,
    type Disposer,
    defineContainer,
    multiToken,
    type Ref,
    ref,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Handler, Logger, Server } from "./fixtures/services.js";
import { InjectableService } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("provider bind methods preserve lifetimes", () => {
    const singletonFactory = bind(tokens.port).factory(() => 3000);
    const scopedFactory = bind(tokens.port)
        .scoped()
        .factory(() => 3000);
    const transientFactory = bind(tokens.port)
        .transient()
        .factory(() => 3000);
    const value = bind(tokens.port).value(3000);
    const scopedValue = bind(tokens.port).scoped().value(3000);

    const ExistingLogger = token("ExistingLogger").of<Logger>();
    const AliasLogger = token("AliasLogger").of<Logger>();
    const alias = bind(AliasLogger).alias(ExistingLogger);
    const useExisting = bind(AliasLogger).useExisting(ExistingLogger);
    const singletonAlias = bind(AliasLogger).singleton().alias(ExistingLogger);

    expect(singletonFactory).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scopedFactory).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(transientFactory).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "transient">>();
    expect(value).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scopedValue).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(alias).type.toBeAssignableTo<
        Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "transient">
    >();
    expect(useExisting).type.toBeAssignableTo<
        Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "transient">
    >();
    expect(singletonAlias).type.toBeAssignableTo<
        Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "singleton">
    >();
});

test("fluent bind methods preserve types in any order", () => {
    const beforeProvider = bind(tokens.port)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        })
        .scoped()
        .factory(() => 3000);
    const afterProvider = bind(tokens.port)
        .factory(() => 3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        })
        .transient();
    const dependencyBinding = bind(tokens.server)
        .transient()
        .disposable((server) => {
            expect(server).type.toBe<Server>();
        })
        .factory({ config: tokens.config }, ({ config }) => ({ port: config.port }));

    expect(beforeProvider).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(afterProvider).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "transient">>();
    expect(dependencyBinding).type.toBeAssignableTo<
        Binding<typeof tokens.server, { readonly config: typeof tokens.config }, "transient">
    >();
    expect<Parameters<typeof dependencyBinding.factory>[0]["config"]>().type.toBe<Config>();
});

test("value providers support direct function and constructor values", () => {
    const handler = (message: string) => message.length;
    const handlerBinding = bind(tokens.handler).value(handler);
    const constructorBinding = bind(tokens.serviceConstructor).value(InjectableService);
    const container = defineContainer(tokenList, handlerBinding, constructorBinding).create();
    const ServiceConstructor = container.resolve(tokens.serviceConstructor);

    expect<ReturnType<typeof handlerBinding.factory>>().type.toBe<Handler>();
    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
    expect<ReturnType<typeof constructorBinding.factory>>().type.toBe<typeof InjectableService>();
    expect(new ServiceConstructor().status).type.toBe<"ready">();

    expect(() => {
        bind(tokens.port).value("3000");
    }).type.toRaiseError();
    expect(() => {
        bind("port").value(3000);
    }).type.toRaiseError();
});

test("factory providers preserve dependency inference and validation", () => {
    const binding = bind(tokens.server).factory(
        { config: tokens.config, logger: ref(tokens.logger), port: tokens.port },
        ({ config }) => ({
            port: config.port,
        }),
    );

    expect<Parameters<typeof binding.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof binding.factory>[0]["logger"]>().type.toBe<Ref<Logger>>();
    expect<Parameters<typeof binding.factory>[0]["port"]>().type.toBe<number>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Server>();

    expect(() => {
        bind(tokens.port).factory({ invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port).factory({ config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
});

test("class providers support object dependency injection", () => {
    const ReadyService = token("ReadyService").of<{ readonly status: "ready" }>();

    class ServerImpl {
        readonly port: number;

        constructor(dependencies: { readonly config: Config }) {
            this.port = dependencies.config.port;
        }
    }

    const serviceBinding = bind(ReadyService).class(InjectableService);
    const serverBinding = bind(tokens.server).class({ config: tokens.config }, ServerImpl);
    const container = defineContainer(
        [ReadyService, ...tokenList],
        serviceBinding,
        bind(tokens.config).value({ port: 3000 }),
        serverBinding,
    ).create();

    expect<ReturnType<typeof serviceBinding.factory>>().type.toBe<{ readonly status: "ready" }>();
    expect<Parameters<typeof serverBinding.factory>[0]["config"]>().type.toBe<Config>();
    expect<ReturnType<typeof serverBinding.factory>>().type.toBe<Server>();
    expect(container.resolve(ReadyService)).type.toBe<{ readonly status: "ready" }>();
    expect(container.resolve(tokens.server)).type.toBe<Server>();
});

test("class providers reject incompatible constructors and dependency maps", () => {
    class NeedsLogger {
        readonly logger: Logger;
        readonly port = 3000;

        constructor(dependencies: { readonly config: Config; readonly logger: Logger }) {
            this.logger = dependencies.logger;
        }
    }

    expect(() => {
        bind(tokens.port).class(InjectableService);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.server).class({ config: tokens.config }, NeedsLogger);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.server).class(
            { invalid: "config" },
            class {
                readonly port = 3000;
            },
        );
    }).type.toRaiseError();
});

test("provider helpers validate dispose options and extra arguments", () => {
    const DisposableService = token("DisposableProviderService").of<{ readonly close: () => void }>();

    class DisposableServiceImpl {
        close() {}
    }

    const valueBinding = bind(tokens.port)
        .value(3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        });
    const classBinding = bind(DisposableService)
        .class(DisposableServiceImpl)
        .disposable((service) => {
            expect(service).type.toBeAssignableTo<{ readonly close: () => void }>();
        });
    const ExistingLogger = token("ExistingLoggerWithDispose").of<Logger>();
    const AliasLogger = token("AliasLoggerWithDispose").of<Logger>();

    expect(valueBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(classBinding.dispose).type.toBe<Disposer<{ readonly close: () => void }> | undefined>();

    expect(() => {
        bind(tokens.port)
            .value(3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(DisposableService)
            .class(DisposableServiceImpl)
            .disposable((_port: number) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(AliasLogger).alias(ExistingLogger, {});
    }).type.toRaiseError();
});

test("alias providers resolve existing tokens and preserve target values", () => {
    const ExistingLogger = token("ExistingLogger2").of<Logger & { readonly name: "console" }>();
    const AliasLogger = token("AliasLogger2").of<Logger>();
    const logger = {
        name: "console" as const,
        log: (_message: string) => {},
    };
    const container = defineContainer(
        [ExistingLogger, AliasLogger],
        bind(ExistingLogger).value(logger),
        bind(AliasLogger).alias(ExistingLogger),
    ).create();

    expect(container.resolve(AliasLogger)).type.toBe<Logger>();

    expect(() => {
        bind(tokens.port).alias(tokens.config);
    }).type.toRaiseError();
});

test("alias providers can contribute existing single tokens to multibind tokens", () => {
    const ExistingHandler = token("ExistingHandler").of<Handler>();
    const Handlers = multiToken("ProviderHandlers").of<Handler>();
    const container = defineContainer(
        [ExistingHandler, Handlers],
        bind(ExistingHandler).value((message) => message.length),
        bind(Handlers).alias(ExistingHandler),
    ).create();

    expect(container.resolveAll(Handlers)).type.toBe<Handler[]>();

    expect(() => {
        bind(tokens.handler).alias(Handlers);
    }).type.toRaiseError();
});

test("alias providers participate in graph validation", () => {
    type Service = { readonly id: string };
    const First = token("ProviderFirst").of<Service>();
    const Second = token("ProviderSecond").of<Service>();
    const External = token("ProviderExternal").of<Service>();
    const providerTokenList = [First, Second] as const;

    const missingDependencyContainer = defineContainer(providerTokenList, bind(First).alias(Second)).create();
    expect(() => {
        missingDependencyContainer.resolve(First);
    }).type.toRaiseError();

    expect(() => {
        defineContainer(providerTokenList, bind(First).alias(External)).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");

    expect(() => {
        defineContainer(providerTokenList, bind(First).alias(Second), bind(Second).alias(First)).create();
    }).type.toRaiseError("__circular_dependency__");

    expect(() => {
        defineContainer(
            providerTokenList,
            bind(First).singleton().alias(Second),
            bind(Second)
                .scoped()
                .factory(() => ({ id: "second" })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    const scopedAliasContainer = defineContainer(
        providerTokenList,
        bind(First).alias(Second),
        bind(Second)
            .scoped()
            .factory(() => ({ id: "second" })),
    ).create();

    expect(scopedAliasContainer.resolve(First)).type.toBe<Service>();
});
