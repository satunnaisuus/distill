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
    const singletonFactory = bind.factory(tokens.port, () => 3000);
    const scopedFactory = bind.scoped.factory(tokens.port, () => 3000);
    const transientFactory = bind.transient.factory(tokens.port, () => 3000);
    const value = bind.value(tokens.port, 3000);
    const scopedValue = bind.scoped.value(tokens.port, 3000);

    const ExistingLogger = token("ExistingLogger").of<Logger>();
    const AliasLogger = token("AliasLogger").of<Logger>();
    const alias = bind.alias(AliasLogger, ExistingLogger);
    const useExisting = bind.useExisting(AliasLogger, ExistingLogger);
    const singletonAlias = bind.singleton.alias(AliasLogger, ExistingLogger);

    expect(singletonFactory).type.toBe<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scopedFactory).type.toBe<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(transientFactory).type.toBe<Binding<typeof tokens.port, undefined, "transient">>();
    expect(value).type.toBe<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scopedValue).type.toBe<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(alias).type.toBe<Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "transient">>();
    expect(useExisting).type.toBe<
        Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "transient">
    >();
    expect(singletonAlias).type.toBe<
        Binding<typeof AliasLogger, { readonly existing: typeof ExistingLogger }, "singleton">
    >();
});

test("value providers support direct function and constructor values", () => {
    const handler = (message: string) => message.length;
    const handlerBinding = bind.value(tokens.handler, handler);
    const constructorBinding = bind.value(tokens.serviceConstructor, InjectableService);
    const container = defineContainer(tokenList, handlerBinding, constructorBinding).create();
    const ServiceConstructor = container.resolve(tokens.serviceConstructor);

    expect<ReturnType<typeof handlerBinding.factory>>().type.toBe<Handler>();
    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
    expect<ReturnType<typeof constructorBinding.factory>>().type.toBe<typeof InjectableService>();
    expect(new ServiceConstructor().status).type.toBe<"ready">();

    expect(() => {
        bind.value(tokens.port, "3000");
    }).type.toRaiseError();
    expect(() => {
        bind.value("port", 3000);
    }).type.toRaiseError();
});

test("factory providers preserve dependency inference and validation", () => {
    const binding = bind.factory(
        tokens.server,
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
        bind.factory(tokens.port, { invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.factory(tokens.port, { config: undefined as typeof tokens.config | undefined }, () => 3000);
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

    const serviceBinding = bind.class(ReadyService, InjectableService);
    const serverBinding = bind.class(tokens.server, { config: tokens.config }, ServerImpl);
    const container = defineContainer(
        [ReadyService, ...tokenList],
        serviceBinding,
        bind.value(tokens.config, { port: 3000 }),
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
        bind.class(tokens.port, InjectableService);
    }).type.toRaiseError();
    expect(() => {
        bind.class(tokens.server, { config: tokens.config }, NeedsLogger);
    }).type.toRaiseError();
    expect(() => {
        bind.class(
            tokens.server,
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

    const valueBinding = bind.value(tokens.port, 3000, {
        dispose: (port) => {
            expect(port).type.toBe<number>();
        },
    });
    const classBinding = bind.class(DisposableService, DisposableServiceImpl, {
        dispose: (service) => {
            expect(service).type.toBeAssignableTo<{ readonly close: () => void }>();
        },
    });
    const ExistingLogger = token("ExistingLoggerWithDispose").of<Logger>();
    const AliasLogger = token("AliasLoggerWithDispose").of<Logger>();

    expect(valueBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(classBinding.dispose).type.toBe<Disposer<{ readonly close: () => void }> | undefined>();

    expect(() => {
        bind.value(tokens.port, 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.class(DisposableService, DisposableServiceImpl, { dispose: (_port: number) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.alias(AliasLogger, ExistingLogger, {});
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
        bind.value(ExistingLogger, logger),
        bind.alias(AliasLogger, ExistingLogger),
    ).create();

    expect(container.resolve(AliasLogger)).type.toBe<Logger>();

    expect(() => {
        bind.alias(tokens.port, tokens.config);
    }).type.toRaiseError();
});

test("alias providers can contribute existing single tokens to multibind tokens", () => {
    const ExistingHandler = token("ExistingHandler").of<Handler>();
    const Handlers = multiToken("ProviderHandlers").of<Handler>();
    const container = defineContainer(
        [ExistingHandler, Handlers],
        bind.value(ExistingHandler, (message) => message.length),
        bind.alias(Handlers, ExistingHandler),
    ).create();

    expect(container.resolveAll(Handlers)).type.toBe<Handler[]>();

    expect(() => {
        bind.alias(tokens.handler, Handlers);
    }).type.toRaiseError();
});

test("alias providers participate in graph validation", () => {
    type Service = { readonly id: string };
    const First = token("ProviderFirst").of<Service>();
    const Second = token("ProviderSecond").of<Service>();
    const External = token("ProviderExternal").of<Service>();
    const providerTokenList = [First, Second] as const;

    const missingDependencyContainer = defineContainer(providerTokenList, bind.alias(First, Second)).create();
    expect(() => {
        missingDependencyContainer.resolve(First);
    }).type.toRaiseError();

    expect(() => {
        defineContainer(providerTokenList, bind.alias(First, External)).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");

    expect(() => {
        defineContainer(providerTokenList, bind.alias(First, Second), bind.alias(Second, First)).create();
    }).type.toRaiseError("__circular_dependency__");

    expect(() => {
        defineContainer(
            providerTokenList,
            bind.singleton.alias(First, Second),
            bind.scoped(Second, () => ({ id: "second" })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    const scopedAliasContainer = defineContainer(
        providerTokenList,
        bind.alias(First, Second),
        bind.scoped(Second, () => ({ id: "second" })),
    ).create();

    expect(scopedAliasContainer.resolve(First)).type.toBe<Service>();
});
