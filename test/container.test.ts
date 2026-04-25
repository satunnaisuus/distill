import { describe, expect, it, vi } from "vitest";

import { bind } from "../src/bind";
import { createContainer } from "../src/container";
import { ref } from "../src/ref";
import { defineTokens, type Token } from "../src/token";
import { type as defineType } from "../src/type-descriptor";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
};

const createRuntimeContainer = createContainer as unknown as (
    tokens: Record<string, unknown>,
    ...bindings: readonly unknown[]
) => RuntimeContainerForTest;

describe("createContainer", () => {
    it("resolves a service without dependencies", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });

        const container = createContainer(
            tokens,
            bind(tokens.port, () => 3000),
        );

        expect(container.resolve(tokens.port)).toBe(3000);
    });

    it("creates services lazily and caches resolved instances", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
        });
        const config = { port: 3000 };
        const factory = vi.fn(() => config);

        const container = createContainer(tokens, bind(tokens.config, factory));

        expect(factory).not.toHaveBeenCalled();
        expect(container.resolve(tokens.config)).toBe(config);
        expect(container.resolve(tokens.config)).toBe(config);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("resolves eager dependencies before calling a dependent factory", () => {
        const calls: string[] = [];
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            server: defineType<{ readonly port: number }>(),
        });

        const container = createContainer(
            tokens,
            bind(tokens.config, () => {
                calls.push("config");
                return { port: 3000 };
            }),
            bind(tokens.server, { config: tokens.config }, ({ config }) => {
                calls.push("server");
                return { port: config.port };
            }),
        );

        expect(container.resolve(tokens.server)).toEqual({ port: 3000 });
        expect(calls).toEqual(["config", "server"]);
    });

    it("resolves eager dependencies registered after their dependent service", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            server: defineType<{ readonly port: number }>(),
        });

        const container = createContainer(
            tokens,
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
            bind(tokens.config, () => ({ port: 3000 })),
        );

        expect(container.resolve(tokens.server)).toEqual({ port: 3000 });
    });

    it("passes mixed eager and ref dependencies to the service factory", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            logger: defineType<{ readonly log: (message: string) => void }>(),
            service: defineType<{
                readonly port: number;
                readonly getLogger: () => { readonly log: (message: string) => void };
            }>(),
        });
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            tokens,
            bind(tokens.config, () => ({ port: 3000 })),
            bind(tokens.service, { config: tokens.config, logger: ref(tokens.logger) }, ({ config, logger }) => ({
                port: config.port,
                getLogger: () => logger.value,
            })),
            bind(tokens.logger, loggerFactory),
        );

        const service = container.resolve(tokens.service);

        expect(service.port).toBe(3000);
        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(logger);
        expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    it("reuses a resolved dependency instance across dependents", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            firstServer: defineType<{ readonly config: { readonly port: number } }>(),
            secondServer: defineType<{ readonly config: { readonly port: number } }>(),
        });
        const config = { port: 3000 };
        const configFactory = vi.fn(() => config);

        const container = createContainer(
            tokens,
            bind(tokens.config, configFactory),
            bind(tokens.firstServer, { config: tokens.config }, ({ config }) => ({ config })),
            bind(tokens.secondServer, { config: tokens.config }, ({ config }) => ({ config })),
        );

        expect(container.resolve(tokens.firstServer).config).toBe(config);
        expect(container.resolve(tokens.secondServer).config).toBe(config);
        expect(configFactory).toHaveBeenCalledTimes(1);
    });

    it("caches resolved falsy service values", () => {
        const tokens = defineTokens({
            disabled: defineType<false>(),
            empty: defineType<undefined>(),
            none: defineType<null>(),
            zero: defineType<0>(),
        });
        const disabledFactory = vi.fn(() => false as const);
        const emptyFactory = vi.fn(() => undefined);
        const noneFactory = vi.fn(() => null);
        const zeroFactory = vi.fn(() => 0 as const);

        const container = createContainer(
            tokens,
            bind(tokens.disabled, disabledFactory),
            bind(tokens.empty, emptyFactory),
            bind(tokens.none, noneFactory),
            bind(tokens.zero, zeroFactory),
        );

        expect(container.resolve(tokens.disabled)).toBe(false);
        expect(container.resolve(tokens.disabled)).toBe(false);
        expect(container.resolve(tokens.empty)).toBeUndefined();
        expect(container.resolve(tokens.empty)).toBeUndefined();
        expect(container.resolve(tokens.none)).toBeNull();
        expect(container.resolve(tokens.none)).toBeNull();
        expect(container.resolve(tokens.zero)).toBe(0);
        expect(container.resolve(tokens.zero)).toBe(0);
        expect(disabledFactory).toHaveBeenCalledTimes(1);
        expect(emptyFactory).toHaveBeenCalledTimes(1);
        expect(noneFactory).toHaveBeenCalledTimes(1);
        expect(zeroFactory).toHaveBeenCalledTimes(1);
    });

    it("retries service creation after a factory throws", () => {
        const tokens = defineTokens({
            service: defineType<{ readonly status: "ready" }>(),
        });
        const service = { status: "ready" as const };
        let attempts = 0;
        const factory = vi.fn(() => {
            attempts += 1;

            if (attempts === 1) {
                throw new Error("transient failure");
            }

            return service;
        });

        const container = createContainer(tokens, bind(tokens.service, factory));

        expect(() => container.resolve(tokens.service)).toThrowError("transient failure");
        expect(container.resolve(tokens.service)).toBe(service);
        expect(container.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("throws when a binding token is not in the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;

        expect(() =>
            createRuntimeContainer(
                tokens,
                bind(externalToken, () => 3000),
            ),
        ).toThrowError('Token "external" is not registered in the registry');
    });

    it("throws when an eager dependency token is not in the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;

        expect(() =>
            createRuntimeContainer(
                tokens,
                bind(tokens.port, { external: externalToken }, ({ external }) => external),
            ),
        ).toThrowError('Token "external" is not registered in the registry');
    });

    it("throws when an eager dependency token is registered but has no binding", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            server: defineType<{ readonly port: number }>(),
        });
        const container = createRuntimeContainer(
            tokens,
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
        );

        expect(() => container.resolve(tokens.server)).toThrowError(
            'Service "config" is not registered in the container',
        );
    });

    it("throws when a ref dependency resolves to a token outside the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(
            tokens,
            bind(tokens.port, { external: ref(() => externalToken) }, ({ external }) => external.value),
        );

        expect(() => container.resolve(tokens.port)).toThrowError('Token "external" is not registered in the registry');
    });

    it("throws when a ref dependency target is registered but has no binding", () => {
        const tokens = defineTokens({
            logger: defineType<{ readonly log: (message: string) => void }>(),
            service: defineType<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        });
        const container = createRuntimeContainer(
            tokens,
            bind(tokens.service, { logger: ref(tokens.logger) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
        );

        const service = container.resolve(tokens.service) as {
            readonly getLogger: () => { readonly log: (message: string) => void };
        };

        expect(() => service.getLogger()).toThrowError('Service "logger" is not registered in the container');
    });

    it("throws when a registered token has no binding", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            logger: defineType<{ readonly log: (message: string) => void }>(),
        });
        const container = createContainer(
            tokens,
            bind(tokens.config, () => ({ port: 3000 })),
        );

        expect(() => (container as RuntimeContainerForTest).resolve(tokens.logger)).toThrowError(
            'Service "logger" is not registered in the container',
        );
    });

    it("throws when resolving a token outside the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;
        const container = createContainer(
            tokens,
            bind(tokens.port, () => 3000),
        );

        expect(() => (container as RuntimeContainerForTest).resolve(externalToken)).toThrowError(
            'Token "external" is not registered in the registry',
        );
    });

    it("throws when the same service is registered twice", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });

        expect(() =>
            createContainer(
                tokens,
                bind(tokens.port, () => 3000),
                bind(tokens.port, () => 4000),
            ),
        ).toThrowError('Service "port" is already registered in the container');
    });

    it("throws when an eager dependency depends on itself during registration", () => {
        const tokens = defineTokens({
            service: defineType<{ readonly name: "service" }>(),
        });

        expect(() =>
            createRuntimeContainer(
                tokens,
                bind(tokens.service, { service: tokens.service }, () => ({ name: "service" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: service -> service");
    });

    it("throws when eager dependencies are circular during registration", () => {
        const tokens = defineTokens({
            serviceA: defineType<{ readonly name: "a" }>(),
            serviceB: defineType<{ readonly name: "b" }>(),
        });

        expect(() =>
            createRuntimeContainer(
                tokens,
                bind(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
                bind(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when eager dependencies form a long cycle during registration", () => {
        const tokens = defineTokens({
            serviceA: defineType<{ readonly name: "a" }>(),
            serviceB: defineType<{ readonly name: "b" }>(),
            serviceC: defineType<{ readonly name: "c" }>(),
        });

        expect(() =>
            createRuntimeContainer(
                tokens,
                bind(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
                bind(tokens.serviceB, { serviceC: tokens.serviceC }, () => ({ name: "b" })),
                bind(tokens.serviceC, { serviceA: tokens.serviceA }, () => ({ name: "c" })),
            ),
        ).toThrowError(
            "Circular dependency detected while registering services: serviceA -> serviceB -> serviceC -> serviceA",
        );
    });

    it("throws when a binding was not created with bind", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });

        expect(() =>
            createRuntimeContainer(tokens, {
                token: tokens.port,
                factory: () => 3000,
            }),
        ).toThrowError("Bindings must be created with bind");
    });

    it("throws when a service resolves itself recursively", () => {
        const tokens = defineTokens({
            service: defineType<unknown>(),
        });
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            tokens,
            bind(tokens.service, () => container.resolve(tokens.service)),
        );

        expect(() => container.resolve(tokens.service)).toThrowError(
            "Circular dependency detected while resolving services: service -> service",
        );
    });

    it("throws when services resolve each other recursively", () => {
        const tokens = defineTokens({
            serviceA: defineType<unknown>(),
            serviceB: defineType<unknown>(),
        });
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            tokens,
            bind(tokens.serviceA, () => container.resolve(tokens.serviceB)),
            bind(tokens.serviceB, () => container.resolve(tokens.serviceA)),
        );

        expect(() => container.resolve(tokens.serviceA)).toThrowError(
            "Circular dependency detected while resolving services: serviceA -> serviceB -> serviceA",
        );
    });

    it("throws when services form a long recursive resolution cycle", () => {
        const tokens = defineTokens({
            serviceA: defineType<unknown>(),
            serviceB: defineType<unknown>(),
            serviceC: defineType<unknown>(),
        });
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            tokens,
            bind(tokens.serviceA, () => container.resolve(tokens.serviceB)),
            bind(tokens.serviceB, () => container.resolve(tokens.serviceC)),
            bind(tokens.serviceC, () => container.resolve(tokens.serviceA)),
        );

        expect(() => container.resolve(tokens.serviceA)).toThrowError(
            "Circular dependency detected while resolving services: serviceA -> serviceB -> serviceC -> serviceA",
        );
    });

    it("resolves ref token factories lazily and uses the token selected at service initialization time", () => {
        const tokens = defineTokens({
            firstLogger: defineType<{ readonly name: "first" }>(),
            secondLogger: defineType<{ readonly name: "second" }>(),
            service: defineType<{
                readonly getLogger: () => { readonly name: "first" } | { readonly name: "second" };
            }>(),
        });
        const firstLogger = { name: "first" as const };
        const secondLogger = { name: "second" as const };
        const firstLoggerFactory = vi.fn(() => firstLogger);
        const secondLoggerFactory = vi.fn(() => secondLogger);
        let selectedToken: typeof tokens.firstLogger | typeof tokens.secondLogger = tokens.firstLogger;
        const resolveToken = vi.fn(() => selectedToken);

        const container = createContainer(
            tokens,
            bind(tokens.service, { logger: ref(resolveToken) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
            bind(tokens.firstLogger, firstLoggerFactory),
            bind(tokens.secondLogger, secondLoggerFactory),
        );

        expect(resolveToken).not.toHaveBeenCalled();
        expect(firstLoggerFactory).not.toHaveBeenCalled();
        expect(secondLoggerFactory).not.toHaveBeenCalled();

        selectedToken = tokens.secondLogger;

        const service = container.resolve(tokens.service);

        expect(resolveToken).toHaveBeenCalledTimes(1);
        expect(firstLoggerFactory).not.toHaveBeenCalled();
        expect(secondLoggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(secondLogger);
        expect(service.getLogger()).toBe(secondLogger);
        expect(firstLoggerFactory).not.toHaveBeenCalled();
        expect(secondLoggerFactory).toHaveBeenCalledTimes(1);
    });

    it("resolves ref dependencies lazily and caches their target instances", () => {
        const tokens = defineTokens({
            logger: defineType<{ readonly log: (message: string) => void }>(),
            service: defineType<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        });
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            tokens,
            bind(tokens.service, { logger: ref(tokens.logger) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
            bind(tokens.logger, loggerFactory),
        );

        const service = container.resolve(tokens.service);

        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(logger);
        expect(service.getLogger()).toBe(logger);
        expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    it("allows circular dependencies through refs after initialization", () => {
        type ServiceA = {
            readonly getB: () => ServiceB;
        };
        type ServiceB = {
            readonly getA: () => ServiceA;
        };
        const tokens = defineTokens({
            serviceA: defineType<ServiceA>(),
            serviceB: defineType<ServiceB>(),
        });

        const container = createContainer(
            tokens,
            bind(tokens.serviceA, { serviceB: ref(tokens.serviceB) }, ({ serviceB }) => ({
                getB: () => serviceB.value,
            })),
            bind(tokens.serviceB, { serviceA: ref(tokens.serviceA) }, ({ serviceA }) => ({
                getA: () => serviceA.value,
            })),
        );

        const serviceA = container.resolve(tokens.serviceA);
        const serviceB = serviceA.getB();

        expect(serviceB.getA()).toBe(serviceA);
        expect(container.resolve(tokens.serviceB)).toBe(serviceB);
    });

    it("throws when a ref dependency is accessed before its target finishes initializing", () => {
        type ServiceA = {
            readonly getB: () => ServiceB;
        };
        type ServiceB = {
            readonly getA: () => ServiceA;
        };
        const tokens = defineTokens({
            serviceA: defineType<ServiceA>(),
            serviceB: defineType<ServiceB>(),
        });
        const container = createContainer(
            tokens,
            bind(tokens.serviceA, { serviceB: ref(tokens.serviceB) }, ({ serviceB }) => {
                const resolvedServiceB = serviceB.value;

                return {
                    getB: () => resolvedServiceB,
                };
            }),
            bind(tokens.serviceB, { serviceA: ref(tokens.serviceA) }, ({ serviceA }) => {
                const resolvedServiceA = serviceA.value;

                return {
                    getA: () => resolvedServiceA,
                };
            }),
        );

        expect(() => container.resolve(tokens.serviceA)).toThrowError(
            'Ref dependency "serviceA" was accessed before it finished initializing while resolving "serviceB"',
        );
    });
});
