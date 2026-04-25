import {
    bind,
    createContainer,
    defineTokens,
    type as defineType,
    type Ref,
    ref,
    type Token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokens } from "./fixtures/tokens.js";
import {
    anyKeyAnyValuePortToken,
    anyKeyPortToken,
    anyValuePortToken,
    wideAnyValueToken,
} from "./fixtures/unsafe-tokens.js";

test("rejects dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: anyValuePortToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: anyKeyPortToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: wideAnyValueToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects ref dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(anyValuePortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(anyKeyPortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(wideAnyValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects lazy ref dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(() => anyValuePortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(() => anyKeyPortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(() => wideAnyValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects binding tokens with any or too-wide branded parts", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(anyValuePortToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(anyKeyPortToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(wideAnyValueToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("allows legitimate any service tokens from defineType", () => {
    const anyTokens = defineTokens({
        consumer: defineType<{ readonly eager: any; readonly lazy: any }>(),
        service: defineType<any>(),
    });
    const serviceBinding = bind(anyTokens.service, () => ({ port: 3000 }));
    const consumerBinding = bind(
        anyTokens.consumer,
        { eager: anyTokens.service, lazy: ref(anyTokens.service) },
        ({ eager, lazy }) => ({
            eager,
            lazy: lazy.value,
        }),
    );
    const container = createContainer(anyTokens, consumerBinding, serviceBinding);

    expect(anyTokens.service).type.toBe<Token<"service", any>>();
    expect<ReturnType<typeof serviceBinding.factory>>().type.toBe<any>();
    expect<Parameters<typeof consumerBinding.factory>[0]["eager"]>().type.toBe<any>();
    expect<Parameters<typeof consumerBinding.factory>[0]["lazy"]>().type.toBe<Ref<any>>();
    expect(container.resolve(anyTokens.service)).type.toBe<any>();
    expect(container.resolve(anyTokens.consumer)).type.toBe<{ readonly eager: any; readonly lazy: any }>();
});

test("rejects raw any tokens used as bindings, dependencies, and refs", () => {
    const anyToken = tokens.port as any;

    expect(() => {
        createContainer(
            tokens,
            bind(anyToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: anyToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: ref(anyToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects same-key tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(stringPortToken, () => "3000"),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects same-key tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        createContainer(
            tokens,
            bind(narrowPortToken, () => 3000 as const),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects binding tokens with widened keys", () => {
    const widenedPortToken: Token<string, number> = tokens.port;

    expect(() => {
        createContainer(
            tokens,
            bind(widenedPortToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects same-key dependency tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: stringPortToken }, ({ port }) => ({
                port: port.length,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects same-key dependency tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: narrowPortToken }, ({ port }) => ({
                port,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects dependency tokens with widened keys", () => {
    const widenedConfigToken: Token<string, Config> = tokens.config;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { config: widenedConfigToken }, ({ config }) => ({
                port: config.port,
            })),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with any-typed tokens", () => {
    const anyTypedToken = tokens.logger as any;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => anyTypedToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with same keys and incompatible value types", () => {
    const sameKeyWrongValueToken = "logger" as Token<"logger", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => sameKeyWrongValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects duplicate binding tokens with equivalent key aliases", () => {
    const portAlias = "port" as typeof tokens.port;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, () => 3000),
            bind(portAlias, () => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("resolve uses bound value types for same-key tokens with narrower aliases", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;
    const container = createContainer(
        tokens,
        bind(tokens.port, () => Math.random()),
    );

    expect(container.resolve(narrowPortToken)).type.toBe<number>();
});

test("resolve rejects forged tokens with incompatible or unsafe branded parts", () => {
    const stringPortToken = "port" as Token<"port", string>;
    const unknownPortToken = "port" as Token<"port", unknown>;
    const anyPortToken = "port" as Token<"port", any>;
    const container = createContainer(
        tokens,
        bind(tokens.port, () => 3000),
    );

    expect(() => {
        container.resolve(stringPortToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolve(unknownPortToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolve(anyPortToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolve(anyKeyPortToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolve(anyKeyAnyValuePortToken);
    }).type.toRaiseError();
    expect(() => {
        container.resolve(wideAnyValueToken);
    }).type.toRaiseError();
});

test("resolve rejects tokens with widened keys", () => {
    const widenedPortToken: Token<string, number> = tokens.port;
    const container = createContainer(
        tokens,
        bind(tokens.port, () => 3000),
    );

    expect(() => {
        container.resolve(widenedPortToken);
    }).type.toRaiseError();
});
