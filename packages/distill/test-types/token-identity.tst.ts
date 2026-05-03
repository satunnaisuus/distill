import { bind, defineContainer, type Ref, ref, type Token, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import {
    anyKeyAnyValuePortToken,
    anyKeyPortToken,
    anyValuePortToken,
    wideAnyValueToken,
} from "./fixtures/unsafe-tokens.js";

test("rejects dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: anyValuePortToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: anyKeyPortToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: wideAnyValueToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects ref dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(anyValuePortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(anyKeyPortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(wideAnyValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects lazy ref dependency tokens with any or too-wide branded parts", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(() => anyValuePortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(() => anyKeyPortToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(() => wideAnyValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects binding tokens with any or too-wide branded parts", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(anyValuePortToken, () => 3000),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(anyKeyPortToken, () => 3000),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(wideAnyValueToken, () => 3000),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("allows legitimate any service tokens from token", () => {
    const anyTokens = {
        consumer: token("consumer").of<{ readonly eager: any; readonly lazy: any }>(),
        service: token("service").of<any>(),
    };
    const serviceBinding = bind(anyTokens.service, () => ({ port: 3000 }));
    const consumerBinding = bind(
        anyTokens.consumer,
        { eager: anyTokens.service, lazy: ref(anyTokens.service) },
        ({ eager, lazy }) => ({
            eager,
            lazy: lazy.value,
        }),
    );
    const container = defineContainer(Object.values(anyTokens), consumerBinding, serviceBinding).create();

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
        defineContainer(
            tokenList,
            bind(anyToken, () => 3000),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: anyToken }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: ref(anyToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects same-key tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        defineContainer(
            tokenList,
            bind(stringPortToken, () => "3000"),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("defineContainer rejects same-key tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        defineContainer(
            tokenList,
            bind(narrowPortToken, () => 3000 as const),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("defineContainer rejects binding tokens with widened keys", () => {
    const widenedPortToken: Token<string, number> = tokens.port;

    expect(() => {
        defineContainer(
            tokenList,
            bind(widenedPortToken, () => 3000),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("defineContainer rejects same-key dependency tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: stringPortToken }, ({ port }) => ({
                port: port.length,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects same-key dependency tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { port: narrowPortToken }, ({ port }) => ({
                port,
            })),
            bind(tokens.port, () => 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects dependency tokens with widened keys", () => {
    const widenedConfigToken: Token<string, Config> = tokens.config;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { config: widenedConfigToken }, ({ config }) => ({
                port: config.port,
            })),
            bind(tokens.config, () => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { logger: ref(widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects lazy ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { logger: ref(() => widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects lazy ref dependency tokens with any-typed tokens", () => {
    const anyTypedToken = tokens.logger as any;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { logger: ref(() => anyTypedToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects lazy ref dependency tokens with same keys and incompatible value types", () => {
    const sameKeyWrongValueToken = "logger" as Token<"logger", string>;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server, { logger: ref(() => sameKeyWrongValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("defineContainer rejects duplicate binding tokens with equivalent key aliases", () => {
    const portAlias = "port" as typeof tokens.port;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.port, () => 3000),
            bind(portAlias, () => 4000),
        ).create();
    }).type.toRaiseError("__duplicate_binding__");
});

test("resolve uses bound value types for same-key tokens with narrower aliases", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;
    const container = defineContainer(
        tokenList,
        bind(tokens.port, () => Math.random()),
    ).create();

    expect(container.resolve(narrowPortToken)).type.toBe<number>();
});

test("resolve rejects forged tokens with incompatible or unsafe branded parts", () => {
    const stringPortToken = "port" as Token<"port", string>;
    const unknownPortToken = "port" as Token<"port", unknown>;
    const anyPortToken = "port" as Token<"port", any>;
    const container = defineContainer(
        tokenList,
        bind(tokens.port, () => 3000),
    ).create();

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
    const container = defineContainer(
        tokenList,
        bind(tokens.port, () => 3000),
    ).create();

    expect(() => {
        container.resolve(widenedPortToken);
    }).type.toRaiseError();
});
