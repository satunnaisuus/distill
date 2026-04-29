import {
    type Binding,
    bind,
    type Container,
    createContainer,
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

test("resolveAll returns all values for a multibind token", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = createContainer(
        [handlers],
        bind(handlers, () => () => 1),
        bind(handlers, () => () => 2),
    );

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("public Container helper type exposes bound multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect<Parameters<Container<readonly [Binding<typeof handlers>]>["resolveAll"]>[0]>().type.toBe<typeof handlers>();
    expect<ReturnType<Container<readonly [Binding<typeof handlers>]>["resolveAll"]>>().type.toBe<Handler[]>();
});

test("public Container helper type rejects unrelated multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const otherHandlers = multiToken("otherHandlers").of<Handler>();
    const typedContainer = {} as Container<readonly [Binding<typeof handlers>]>;

    expect(() => {
        typedContainer.resolveAll(otherHandlers);
    }).type.toRaiseError();
});

test("resolveAll accepts multibind tokens without bindings", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = createContainer([handlers]);

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("resolve rejects multibind tokens and resolveAll rejects regular tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const config = token("config").of<Config>();
    const container = createContainer(
        [handlers, config],
        bind(handlers, () => () => 1),
        bind(config, () => ({ port: 3000 })),
    );

    expect(() => {
        container.resolve(handlers);
    }).type.toRaiseError();
    expect(() => {
        container.resolveAll(config);
    }).type.toRaiseError();
});

test("createScope preserves parent multibind values and adds scope values", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const app = createContainer(
        [handlers],
        bind(handlers, () => () => 1),
    );
    const scope = app.createScope(bind(handlers, () => () => 2));

    expect(app.resolveAll(handlers)).type.toBe<Handler[]>();
    expect(scope.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("multibind bindings validate dependency maps", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = createContainer(
        [handlers, tokens.config],
        bind(
            handlers,
            { config: tokens.config },
            ({ config }) =>
                (message: string) =>
                    config.port + message.length,
        ),
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("multibind singleton bindings reject missing dependencies", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(() => {
        createContainer(
            [handlers, ...tokenList],
            bind(handlers, { config: tokens.config }, () => () => 1),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("scoped multibind bindings can be completed by child scopes", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const app = createContainer(
        [handlers, ...tokenList],
        bind.scoped(
            handlers,
            { config: tokens.config },
            ({ config }) =>
                (message: string) =>
                    config.port + message.length,
        ),
    );
    const scope = app.createScope(bind.scoped(tokens.config, () => ({ port: 3000 })));

    expect(() => {
        app.resolveAll(handlers);
    }).type.toRaiseError();
    expect(scope.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("multibind tokens allow duplicate binding keys", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const container = createContainer(
        [handlers],
        bind(handlers, () => () => 1),
        bind(handlers, () => () => 2),
    );

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("regular and multibind tokens with the same key are different token identities", () => {
    const handler = token("handler").of<Handler>();
    const handlers = multiToken("handler").of<Handler>();

    expect(() => {
        createContainer([handler, handlers]);
    }).type.toRaiseError("__duplicate_token_key__");
    expect(() => {
        createContainer(
            [handlers],
            bind(handler, () => () => 1),
        );
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("multibind tokens cannot be used as direct or ref dependencies", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(() => {
        bind(tokens.port, { handlers }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        ref(handlers);
    }).type.toRaiseError();
});
