import { type Binding, bind, createContainer } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config } from "./fixtures/services.js";
import { type ConfigBinding, type PortBinding, type ServerBinding, tokens } from "./fixtures/tokens.js";

test("createContainer validates and preserves bindings passed as readonly tuples", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ] as const;

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed as typed tuples", () => {
    const bindings: readonly [ServerBinding, ConfigBinding] = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed as mutable tuples", () => {
    const bindings: [ServerBinding, ConfigBinding] = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed with satisfies readonly tuple", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    ] satisfies readonly [ServerBinding, ConfigBinding, PortBinding];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("createContainer rejects invalid bindings passed as readonly tuples", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    ] as const;

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__missing_dependencies__");
});

test("createContainer rejects valid bindings passed through mutable arrays", () => {
    const bindings = [bind(tokens.config, () => ({ port: 3000 })), bind(tokens.port, () => 3000)];

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__bindings_must_be_tuple__");
});

test("createContainer rejects valid bindings passed through readonly arrays", () => {
    const bindings: readonly Binding[] = [bind(tokens.config, () => ({ port: 3000 })), bind(tokens.port, () => 3000)];

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__bindings_must_be_tuple__");
});
