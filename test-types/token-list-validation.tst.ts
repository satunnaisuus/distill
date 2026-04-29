import { bind, createContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("rejects token lists with duplicate keys", () => {
    const stringPortToken = token("port").of<string>();

    expect(() => {
        createContainer([tokens.port, stringPortToken] as const);
    }).type.toRaiseError("__duplicate_token_key__");
});

test("rejects binding tokens outside the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(externalToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("rejects dependency tokens outside the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { external: externalToken }, ({ external }) => external),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects direct ref dependency tokens outside the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { external: ref(externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects lazy ref dependency tokens outside the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { external: ref(() => externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("rejects eager dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects ref dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { logger: ref(tokens.logger) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects lazy ref dependency tokens without bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { logger: ref(() => tokens.logger) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects singleton bindings with transitive missing dependencies", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { port: tokens.port }, ({ port }) => ({
                port,
            })),
            bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("rejects singleton bindings with transitive ref missing dependencies", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { port: ref(tokens.port) }, () => ({
                port: 3000,
            })),
            bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
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
        createContainer(tokenList, ...bindings);
    }).type.toRaiseError(/__missing_dependencies__:\s*(?:"config" \| "logger"|"logger" \| "config")/);
});

test("missing dependency errors report token keys instead of dependency property names", () => {
    const bindings = [
        bind(tokens.server, { settings: tokens.config }, () => ({
            port: 3000,
        })),
    ] as const;

    expect(() => {
        createContainer(tokenList, ...bindings);
    }).type.toRaiseError(/__missing_dependencies__:\s*"config"/);
});

test("rejects duplicate binding tokens", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, () => 3000),
            bind(tokens.port, () => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("rejects union binding tokens", () => {
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;

    expect(() => {
        createContainer(
            tokenList,
            bind(configOrPortToken, () => 3000),
        );
    }).type.toRaiseError("__union_binding_token__");
});

test("allows dependencies declared after dependent bindings", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<{ readonly port: number }>();
});
