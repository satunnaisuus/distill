import {
    type Binding,
    bind,
    type Container,
    defineContainer,
    type MultiToken,
    multiToken,
    ref,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Handler } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("multiToken preserves literal keys and value types", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(handlers).type.toBe<MultiToken<"handlers", Handler>>();
});

test("resolve returns all values for a multibind token", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = defineContainer(
        [handlers],
        bind(handlers).factory(() => () => 1),
        bind(handlers).factory(() => () => 2),
    ).create();

    expect(container.resolve(handlers)).type.toBe<Handler[]>();
});

test("public Container helper type exposes bound multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect<Parameters<Container<readonly [Binding<typeof handlers>]>["resolve"]>[0]>().type.toBe<typeof handlers>();
    expect<ReturnType<Container<readonly [Binding<typeof handlers>]>["resolve"]>>().type.toBe<Handler[]>();
});

test("public Container helper type rejects unrelated multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const otherHandlers = multiToken("otherHandlers").of<Handler>();
    const typedContainer = {} as Container<readonly [Binding<typeof handlers>]>;

    expect(() => {
        typedContainer.resolve(otherHandlers);
    }).type.toRaiseError();
});

test("resolve accepts multibind tokens without bindings", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = defineContainer([handlers]).create();

    expect(container.resolve(handlers)).type.toBe<Handler[]>();
});

test("resolve accepts both multibind and regular tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const config = token("config").of<Config>();
    const container = defineContainer(
        [handlers, config],
        bind(handlers).factory(() => () => 1),
        bind(config).factory(() => ({ port: 3000 })),
    ).create();

    expect(container.resolve(handlers)).type.toBe<Handler[]>();
    expect(container.resolve(config)).type.toBe<Config>();
});

test("createScope preserves parent multibind values and adds scope values", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const app = defineContainer(
        [handlers],
        bind(handlers).factory(() => () => 1),
    ).create();
    const scope = app.createScope(bind(handlers).factory(() => () => 2));

    expect(app.resolve(handlers)).type.toBe<Handler[]>();
    expect(scope.resolve(handlers)).type.toBe<Handler[]>();
});

test("multibind bindings validate dependency maps", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = defineContainer(
        [handlers, tokens.config],
        bind(handlers).factory(
            { config: tokens.config },
            ({ config }) =>
                (message: string) =>
                    config.port + message.length,
        ),
        bind(tokens.config).factory(() => ({ port: 3000 })),
    ).create();

    expect(container.resolve(handlers)).type.toBe<Handler[]>();
});

test("multibind dependencies inject multibind values into dependency factories", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();
    const binding = bind(registry).factory({ handlers }, ({ handlers }) => ({ handlers }));
    const container = defineContainer(
        [handlers, registry],
        bind(handlers).factory(() => () => 1),
        bind(handlers).factory(() => () => 2),
        binding,
    ).create();

    expect<Parameters<typeof binding.factory>[0]["handlers"]>().type.toBe<Handler[]>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Registry>();
    expect(container.resolve(registry)).type.toBe<Registry>();
});

test("multibind dependencies accept multibind tokens with no bindings", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();
    const container = defineContainer(
        [handlers, registry],
        bind(registry).factory({ handlers }, ({ handlers }) => ({ handlers })),
    ).create();

    expect(container.resolve(registry)).type.toBe<Registry>();
});

test("multibind dependencies validate token lists", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();

    expect(() => {
        defineContainer(
            [registry],
            bind(registry).factory({ handlers }, ({ handlers }) => ({ handlers })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("multibind dependencies validate multibind contribution dependencies", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();

    expect(() => {
        defineContainer(
            [handlers, registry, tokens.config],
            bind(registry).factory({ handlers }, ({ handlers }) => ({ handlers })),
            bind(handlers).factory(
                { config: tokens.config },
                ({ config }) =>
                    (message: string) =>
                        config.port + message.length,
            ),
        ).create();
    }).type.toRaiseError("__missing_dependencies__");
});

test("scoped multibind dependencies can be satisfied by child scopes", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();
    const app = defineContainer(
        [handlers, registry, tokens.config],
        bind(registry)
            .scoped()
            .factory({ handlers }, ({ handlers }) => ({ handlers })),
        bind(handlers)
            .scoped()
            .factory(
                { config: tokens.config },
                ({ config }) =>
                    (message: string) =>
                        config.port + message.length,
            ),
    ).create();
    const scope = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        app.resolve(registry);
    }).type.toRaiseError();
    expect(scope.resolve(registry)).type.toBe<Registry>();
});

test("multibind dependencies reject scoped multibind contributions in singletons", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();

    expect(() => {
        defineContainer(
            [handlers, registry],
            bind(registry)
                .singleton()
                .factory({ handlers }, ({ handlers }) => ({ handlers })),
            bind(handlers)
                .scoped()
                .factory(() => () => 1),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("multibind dependencies reject eager circular dependencies", () => {
    type Registry = {
        readonly handlers: Handler[];
    };
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<Registry>();

    expect(() => {
        defineContainer(
            [handlers, registry],
            bind(registry).factory({ handlers }, ({ handlers }) => ({ handlers })),
            bind(handlers).factory({ registry }, () => () => 1),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("multibind singleton bindings reject missing dependencies", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(() => {
        defineContainer(
            [handlers, ...tokenList],
            bind(handlers).factory({ config: tokens.config }, () => () => 1),
        ).create();
    }).type.toRaiseError("__missing_dependencies__");
});

test("scoped multibind bindings can be completed by child scopes", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const app = defineContainer(
        [handlers, ...tokenList],
        bind(handlers)
            .scoped()
            .factory(
                { config: tokens.config },
                ({ config }) =>
                    (message: string) =>
                        config.port + message.length,
            ),
    ).create();
    const scope = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        app.resolve(handlers);
    }).type.toRaiseError();
    expect(scope.resolve(handlers)).type.toBe<Handler[]>();
});

test("multibind tokens allow duplicate binding keys", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = defineContainer(
        [handlers],
        bind(handlers).factory(() => () => 1),
        bind(handlers).factory(() => () => 2),
    ).create();

    expect(container.resolve(handlers)).type.toBe<Handler[]>();
});

test("regular and multibind tokens with the same key are different token identities", () => {
    const handler = token("handler").of<Handler>();
    const handlers = multiToken("handler").of<Handler>();

    expect(() => {
        defineContainer([handler, handlers]).create();
    }).type.toRaiseError("__duplicate_token_key__");
    expect(() => {
        defineContainer(
            [handlers],
            bind(handler).factory(() => () => 1),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("multibind tokens can be used as direct dependencies but not ref dependencies", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const binding = bind(tokens.port).factory({ handlers }, () => 3000);

    expect<Parameters<typeof binding.factory>[0]["handlers"]>().type.toBe<Handler[]>();
    expect(() => {
        ref(handlers);
    }).type.toRaiseError();
});
