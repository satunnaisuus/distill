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

const tokens = defineTokens({
    config: defineType<{ readonly port: number }>(),
    logger: defineType<{ readonly log: (message: string) => void }>(),
    port: defineType<number>(),
    server: defineType<{ readonly port: number }>(),
});

const externalToken = "external" as Token<"external", number>;
const anyValuePortToken = "port" as Token<"port", any>;
const anyKeyPortToken = "port" as Token<any, number>;
const anyKeyAnyValuePortToken = "port" as Token<any, any>;
const wideAnyValueToken = "port" as Token<string, any>;

test("rejects binding tokens outside the registry", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(externalToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("rejects dependency tokens outside the registry", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { external: externalToken }, ({ external }) => external),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects direct ref dependency tokens outside the registry", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { external: ref(externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects lazy ref dependency tokens outside the registry", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { external: ref(() => externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

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

test("rejects eager dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects ref dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(tokens.logger) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects lazy ref dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => tokens.logger) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("missing dependency errors report every missing token key", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config, logger: ref(tokens.logger) }, () => ({
            port: 3000,
        })),
    ] as const;

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError(/__missing_dependencies__:\s*(?:"config" \| "logger"|"logger" \| "config")/);
});

test("missing dependency errors report token keys instead of dependency property names", () => {
    const bindings = [
        bind(tokens.server, { settings: tokens.config }, () => ({
            port: 3000,
        })),
    ] as const;

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError(/__missing_dependencies__:\s*"config"/);
});

test("rejects duplicate binding tokens", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, () => 3000),
            bind(tokens.port, () => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("rejects union binding tokens", () => {
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;

    expect(() => {
        createContainer(
            tokens,
            bind(configOrPortToken, () => 3000),
        );
    }).type.toRaiseError("__union_binding_token__");
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

test("allows dependencies registered after dependent bindings", () => {
    const container = createContainer(
        tokens,
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
});

test("resolve preserves bound service value types", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );

    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
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

test("bind and resolve preserve falsy literal service value types", () => {
    const literalTokens = defineTokens({
        disabled: defineType<false>(),
        empty: defineType<undefined>(),
        none: defineType<null>(),
        zero: defineType<0>(),
    });
    const disabledBinding = bind(literalTokens.disabled, () => false as const);
    const emptyBinding = bind(literalTokens.empty, () => undefined);
    const noneBinding = bind(literalTokens.none, () => null);
    const zeroBinding = bind(literalTokens.zero, () => 0 as const);
    const container = createContainer(literalTokens, disabledBinding, emptyBinding, noneBinding, zeroBinding);

    expect<ReturnType<typeof disabledBinding.factory>>().type.toBe<false>();
    expect<ReturnType<typeof emptyBinding.factory>>().type.toBe<undefined>();
    expect<ReturnType<typeof noneBinding.factory>>().type.toBe<null>();
    expect<ReturnType<typeof zeroBinding.factory>>().type.toBe<0>();
    expect(container.resolve(literalTokens.disabled)).type.toBe<false>();
    expect(container.resolve(literalTokens.empty)).type.toBe<undefined>();
    expect(container.resolve(literalTokens.none)).type.toBe<null>();
    expect(container.resolve(literalTokens.zero)).type.toBe<0>();
});

test("bind and resolve distinguish undefined service values from void", () => {
    const voidTokens = defineTokens({
        empty: defineType<undefined>(),
        sideEffect: defineType<void>(),
    });
    const emptyBinding = bind(voidTokens.empty, () => undefined);
    const sideEffectBinding = bind(voidTokens.sideEffect, () => {});
    const container = createContainer(voidTokens, emptyBinding, sideEffectBinding);

    expect<ReturnType<typeof emptyBinding.factory>>().type.toBe<undefined>();
    expect<ReturnType<typeof sideEffectBinding.factory>>().type.toBe<void>();
    expect(container.resolve(voidTokens.empty)).type.toBe<undefined>();
    expect(container.resolve(voidTokens.sideEffect)).type.toBe<void>();
    expect(() => {
        bind(voidTokens.empty, () => {});
    }).type.toRaiseError();
});

test("bind and resolve preserve never service value types", () => {
    const neverTokens = defineTokens({
        impossible: defineType<never>(),
    });
    const impossibleBinding = bind(neverTokens.impossible, () => {
        throw new Error("impossible");
    });
    const container = createContainer(neverTokens, impossibleBinding);

    expect<ReturnType<typeof impossibleBinding.factory>>().type.toBe<never>();
    expect(container.resolve(neverTokens.impossible)).type.toBe<never>();

    expect(() => {
        bind(neverTokens.impossible, () => undefined);
    }).type.toRaiseError();
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

test("resolve rejects every token for an empty container", () => {
    const container = createContainer(tokens);

    expect(() => {
        container.resolve(tokens.port);
    }).type.toRaiseError();
});

test("resolve rejects registered tokens without bindings", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );

    expect(() => {
        container.resolve(tokens.logger);
    }).type.toRaiseError();
});

test("resolve rejects tokens outside the registry", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        container.resolve(externalToken);
    }).type.toRaiseError();
});

test("resolve rejects unions when any token variant has no binding", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        container.resolve(configOrLoggerToken);
    }).type.toRaiseError();
});

test("resolve rejects unions when any token variant is outside the registry", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        container.resolve(configOrExternalToken);
    }).type.toRaiseError();
});

test("allows lazy union ref dependency tokens when every variant is registered and bound", () => {
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const container = createContainer(
        tokens,
        bind(tokens.server, { dependency: ref(() => selectedToken) }, () => ({
            port: 3000,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.logger, () => ({
            log: () => {},
        })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(selectedToken)).type.toBe<
        { readonly port: number } | { readonly log: (message: string) => void }
    >();
});

test("rejects union dependency tokens when any variant is outside the registry", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: configOrExternalToken }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects union ref dependency tokens when any variant is outside the registry", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: ref(configOrExternalToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects lazy union ref dependency tokens when any variant is outside the registry", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: ref(() => configOrExternalToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("rejects union dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: configOrLoggerToken }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects union ref dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: ref(configOrLoggerToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects lazy union ref dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, { dependency: ref(() => configOrLoggerToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});
