import { bind, createContainer, defineTokens, type as defineType, ref, type Token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

const tokens = defineTokens({
    config: defineType<{ readonly port: number }>(),
    logger: defineType<{ readonly log: (message: string) => void }>(),
    port: defineType<number>(),
    server: defineType<{ readonly port: number }>(),
});

const externalToken = "external" as Token<"external", number>;

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
