import { bind, createContainer, ref } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("resolve accepts unions of bound tokens and returns the union of service values", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.port;

    expect(container.resolve(selectedToken)).type.toBe<Config | number>();
});

test("resolve preserves bound service value types", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );

    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("resolve rejects every token for an empty container", () => {
    const container = createContainer(tokenList);

    expect(() => {
        container.resolve(tokens.port);
    }).type.toRaiseError();
});

test("resolve rejects listed tokens without bindings", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );

    expect(() => {
        container.resolve(tokens.logger);
    }).type.toRaiseError();
});

test("resolve rejects tokens outside the token list", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        container.resolve(externalToken);
    }).type.toRaiseError();
});

test("resolve rejects unions when any token variant has no binding", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        container.resolve(configOrLoggerToken);
    }).type.toRaiseError();
});

test("resolve rejects unions when any token variant is outside the token list", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        container.resolve(configOrExternalToken);
    }).type.toRaiseError();
});

test("allows lazy union ref dependency tokens when every variant is listed and bound", () => {
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const container = createContainer(
        tokenList,
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

test("rejects union dependency tokens when any variant is outside the token list", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: configOrExternalToken }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects union ref dependency tokens when any variant is outside the token list", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: ref(configOrExternalToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects lazy union ref dependency tokens when any variant is outside the token list", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: ref(() => configOrExternalToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects union dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: configOrLoggerToken }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects union ref dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: ref(configOrLoggerToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects lazy union ref dependency tokens when any variant has no binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { dependency: ref(() => configOrLoggerToken) }, () => 3000),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});
