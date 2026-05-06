import {
    type Binding,
    bind,
    type Container,
    composeModules,
    defineContainer,
    defineModule,
    exported,
    multiToken,
    optional,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("resolveOptional returns registered service values unioned with undefined", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    ).create();

    expect(container.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
});

test("resolveOptional accepts listed single tokens without bindings", () => {
    const container = defineContainer(tokenList).create();

    expect(container.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
    expect(container.resolveOptional(tokens.port)).type.toBe<number | undefined>();
    expect(() => {
        container.resolve(tokens.config);
    }).type.toRaiseError();
});

test("resolveOptional rejects tokens outside the token list and multibind tokens", () => {
    const handlers = multiToken("handlers").of<(message: string) => number>();
    const container = defineContainer([handlers]).create();

    expect(() => {
        container.resolveOptional(handlers);
    }).type.toRaiseError();
    expect(() => {
        container.resolveOptional(externalToken);
    }).type.toRaiseError();
});

test("resolveOptional rejects registered tokens with missing transitive dependencies", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.port)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => config.port),
    ).create();

    expect(() => {
        container.resolveOptional(tokens.port);
    }).type.toRaiseError();
    expect(container.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
});

test("resolveOptional accepts child scope bindings", () => {
    const app = defineContainer(tokenList).create();
    const request = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(app.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
    expect(request.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
});

test("resolveOptional supports unions when every variant is optional-resolvable", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    ).create();
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(container.resolveOptional(selectedToken)).type.toBe<Config | Logger | undefined>();
});

test("resolveOptional rejects unions with outside or invalid variants", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;
    const container = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port)
            .scoped()
            .factory({ logger: tokens.logger }, () => 3000),
    ).create();

    expect(() => {
        container.resolveOptional(configOrExternalToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolveOptional(configOrPortToken);
    }).type.toRaiseError();
});

test("resolveOptional accepts tokens removed with unbind", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.server).factory({ config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 0,
        })),
    );
    const container = definition.create(unbind(tokens.config));

    expect(container.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
    expect(container.resolveOptional(tokens.server)).type.toBe<{ readonly port: number } | undefined>();
    expect(() => {
        container.resolve(tokens.config);
    }).type.toRaiseError();
});

test("public Container helper type exposes resolveOptional for token-list singles", () => {
    const typedContainer = {} as Container<readonly [Binding<typeof tokens.port>], typeof tokenList>;

    expect(typedContainer.resolveOptional(tokens.config)).type.toBe<Config | undefined>();
    expect(typedContainer.resolveOptional(tokens.port)).type.toBe<number | undefined>();
});

test("module containers expose resolveOptional only for public single tokens", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal).factory(() => ({ value: "internal" })),
            exported(bind(Public).factory({ internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Public],
    });
    const app = App.createContainer();

    expect(app.resolveOptional(Public)).type.toBe<{ readonly value: string } | undefined>();
    expect(() => {
        app.resolveOptional(Internal);
    }).type.toRaiseError();
});

test("module scoped containers expose resolveOptional for local scope bindings", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly ok: true }>();
    const AppModule = defineModule({
        bindings: [
            bind(Request)
                .scoped()
                .factory(() => ({ id: "root" })),
            exported(bind(Service).factory(() => ({ ok: true as const }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Service],
    });
    const app = App.createContainer();
    const request = app.createScope(
        bind(Request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );

    expect(() => {
        app.resolveOptional(Request);
    }).type.toRaiseError();
    expect(request.resolveOptional(Request)).type.toBe<{ readonly id: string } | undefined>();
});
