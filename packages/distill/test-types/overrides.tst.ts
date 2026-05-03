import {
    all,
    bind,
    defineContainer,
    multiToken,
    optional,
    override,
    overrideAll,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Handler } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("defineContainer create resolves containers without overrides", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
    );
    const container = definition.create();

    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("create accepts single binding overrides", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
    );
    const container = definition.create(override(bind(tokens.config).factory(() => ({ port: 4000 }))));

    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("create accepts single binding unbinds", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.server).factory({ config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 0,
        })),
    );
    const container = definition.create(unbind(tokens.config));

    expect(() => {
        container.resolve(tokens.config);
    }).type.toRaiseError();
    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("single binding overrides must target existing definition bindings", () => {
    const definition = defineContainer(tokenList);

    expect(() => {
        definition.create(override(bind(tokens.config).factory(() => ({ port: 3000 }))));
    }).type.toRaiseError("__override_target_not_bound__");
});

test("single binding unbinds must target existing definition bindings", () => {
    const definition = defineContainer(tokenList);

    expect(() => {
        definition.create(unbind(tokens.config));
    }).type.toRaiseError("__override_target_not_bound__");
});

test("single binding overrides must target tokens from the token list", () => {
    const definition = defineContainer(tokenList);
    const external = token("external").of<number>();

    expect(() => {
        definition.create(override(bind(external).factory(() => 1)));
    }).type.toRaiseError("__override_token_not_in_tokens__");
});

test("single binding unbinds must target tokens from the token list", () => {
    const definition = defineContainer(tokenList);
    const external = token("external").of<number>();

    expect(() => {
        definition.create(unbind(external));
    }).type.toRaiseError("__override_token_not_in_tokens__");
});

test("single binding overrides reject multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(() => {
        override(bind(handlers).factory(() => () => 1));
    }).type.toRaiseError();
});

test("single binding unbinds reject multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(() => {
        unbind(handlers);
    }).type.toRaiseError();
});

test("single binding unbinds reject union tokens", () => {
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port).factory(() => 3000),
    );

    expect(() => {
        definition.create(unbind(configOrPortToken));
    }).type.toRaiseError("__union_override_token__");
});

test("create rejects duplicate overrides for one token", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    );

    expect(() => {
        definition.create(
            override(bind(tokens.config).factory(() => ({ port: 4000 }))),
            override(bind(tokens.config).factory(() => ({ port: 5000 }))),
        );
    }).type.toRaiseError("__duplicate_override__");
});

test("create rejects duplicate unbind and override operations for one token", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    );

    expect(() => {
        definition.create(unbind(tokens.config), override(bind(tokens.config).factory(() => ({ port: 4000 }))));
    }).type.toRaiseError("__duplicate_override__");
});

test("create rejects duplicate unbind operations for one token", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    );

    expect(() => {
        definition.create(unbind(tokens.config), unbind(tokens.config));
    }).type.toRaiseError("__duplicate_override__");
});

test("create validates the graph after single overrides are applied", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
    );
    const external = token("external").of<number>();

    expect(() => {
        definition.create(override(bind(tokens.config).factory({ external }, ({ external }) => ({ port: external }))));
    }).type.toRaiseError("__invalid_overrides__");
});

test("create validates the graph after unbinds are applied", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
        bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
    );

    expect(() => {
        definition.create(unbind(tokens.config));
    }).type.toRaiseError("__invalid_overrides__");
});

test("create rejects override arrays that are not tuples", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    );
    const overrides = [override(bind(tokens.config).factory(() => ({ port: 4000 })))];

    expect(() => {
        definition.create(...overrides);
    }).type.toRaiseError("__overrides_must_be_tuple__");
});

test("overrideAll replaces all multibind contributions", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<{ readonly handlers: Handler[] }>();
    const definition = defineContainer(
        [handlers, registry],
        bind(handlers).factory(() => () => 1),
        bind(handlers).factory(() => () => 2),
        bind(registry).factory({ handlers: all(handlers) }, ({ handlers }) => ({ handlers })),
    );
    const container = definition.create(overrideAll(handlers, [bind(handlers).factory(() => () => 3)]));

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
    expect(container.resolve(registry)).type.toBe<{ readonly handlers: Handler[] }>();
});

test("overrideAll accepts empty multibind replacements", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const definition = defineContainer(
        [handlers],
        bind(handlers).factory(() => () => 1),
        bind(handlers).factory(() => () => 2),
    );
    const container = definition.create(overrideAll(handlers, []));

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("overrideAll can add bindings to an empty multibind token", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const definition = defineContainer([handlers]);
    const container = definition.create(overrideAll(handlers, [bind(handlers).factory(() => () => 1)]));

    expect(container.resolveAll(handlers)).type.toBe<Handler[]>();
});

test("overrideAll rejects tokens outside the token list", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const externalHandlers = multiToken("externalHandlers").of<Handler>();
    const definition = defineContainer([handlers]);

    expect(() => {
        definition.create(overrideAll(externalHandlers, []));
    }).type.toRaiseError("__override_token_not_in_tokens__");
});

test("overrideAll rejects regular tokens", () => {
    expect(() => {
        overrideAll(tokens.config, []);
    }).type.toRaiseError();
});

test("overrideAll rejects bindings for different multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const otherHandlers = multiToken("otherHandlers").of<Handler>();

    expect(() => {
        overrideAll(handlers, [bind(otherHandlers).factory(() => () => 1)]);
    }).type.toRaiseError("__override_all_binding_token__");
});

test("overrideAll rejects same-key bindings with incompatible value types", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const numberHandlers = multiToken("handlers").of<number>();

    expect(() => {
        overrideAll(handlers, [bind(numberHandlers).factory(() => 1)]);
    }).type.toRaiseError("__override_all_binding_token__");
});

test("overrideAll rejects bindings passed through widened arrays", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const bindings = [bind(handlers).factory(() => () => 1)];

    expect(() => {
        overrideAll(handlers, bindings);
    }).type.toRaiseError("__bindings_must_be_tuple__");
});

test("create rejects duplicate overrideAll operations", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const definition = defineContainer(
        [handlers],
        bind(handlers).factory(() => () => 1),
    );

    expect(() => {
        definition.create(overrideAll(handlers, []), overrideAll(handlers, []));
    }).type.toRaiseError("__duplicate_override__");
});

test("create rejects raw bindings as overrides", () => {
    const definition = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    );

    expect(() => {
        definition.create(bind(tokens.config).factory(() => ({ port: 4000 })));
    }).type.toRaiseError();
});
