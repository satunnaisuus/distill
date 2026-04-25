import { describe, expect, it, vi } from "vitest";

import { bind } from "../src/bind";
import { createContainer } from "../src/container";
import { ref } from "../src/ref";
import { defineTokens, type Token } from "../src/token";
import { type as defineType } from "../src/type-descriptor";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
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

    it("creates transient services for every resolution", () => {
        const tokens = defineTokens({
            counter: defineType<{ readonly id: number }>(),
        });
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(tokens, bind.transient(tokens.counter, factory));

        expect(container.resolve(tokens.counter)).toEqual({ id: 1 });
        expect(container.resolve(tokens.counter)).toEqual({ id: 2 });
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("caches scoped services separately for each scope", () => {
        const tokens = defineTokens({
            counter: defineType<{ readonly id: number }>(),
        });
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(tokens, bind.scoped(tokens.counter, factory));
        const firstScope = container.createScope();
        const secondScope = container.createScope();

        const rootCounter = container.resolve(tokens.counter);
        expect(container.resolve(tokens.counter)).toBe(rootCounter);

        const firstScopedCounter = firstScope.resolve(tokens.counter);
        expect(firstScope.resolve(tokens.counter)).toBe(firstScopedCounter);

        const secondScopedCounter = secondScope.resolve(tokens.counter);
        expect(secondScope.resolve(tokens.counter)).toBe(secondScopedCounter);

        expect(rootCounter).not.toBe(firstScopedCounter);
        expect(firstScopedCounter).not.toBe(secondScopedCounter);
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it("shares singleton services from their registration scope with child scopes", () => {
        const tokens = defineTokens({
            service: defineType<{ readonly id: number }>(),
        });
        const service = { id: 1 };
        const factory = vi.fn(() => service);
        const container = createContainer(tokens, bind.singleton(tokens.service, factory));
        const firstScope = container.createScope();
        const secondScope = container.createScope();

        expect(firstScope.resolve(tokens.service)).toBe(service);
        expect(secondScope.resolve(tokens.service)).toBe(service);
        expect(container.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("allows child scopes to override parent bindings", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<{ readonly name: string }>(),
        });
        const container = createContainer(
            tokens,
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: tokens.config }, ({ config }) => ({ name: config.name })),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service)).toEqual({ name: "root" });
        expect(childScope.resolve(tokens.service)).toEqual({ name: "child" });
    });

    it("resolves ref dependencies from the scope that created the ref", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<{ readonly getName: () => string }>(),
        });
        const container = createContainer(
            tokens,
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: ref(tokens.config) }, ({ config }) => ({
                getName: () => config.value.name,
            })),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service).getName()).toBe("root");
        expect(childScope.resolve(tokens.service).getName()).toBe("child");
    });

    it("initializes singleton dependencies from the singleton registration scope", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<{ readonly name: string }>(),
        });
        const container = createContainer(
            tokens,
            bind.singleton(tokens.config, () => ({ name: "root" })),
            bind.singleton(tokens.service, { config: tokens.config }, ({ config }) => ({ name: config.name })),
        );
        const childScope = container.createScope(bind.singleton(tokens.config, () => ({ name: "child" })));

        expect(childScope.resolve(tokens.service)).toEqual({ name: "root" });
        expect(container.resolve(tokens.service)).toEqual({ name: "root" });
        expect(childScope.resolve(tokens.config)).toEqual({ name: "child" });
    });

    it("allows child scoped overrides to depend on parent singletons that use parent bindings", () => {
        type ServiceA = {
            readonly name: string;
            readonly serviceB?: ServiceB;
        };
        type ServiceB = {
            readonly name: string;
            readonly serviceA: ServiceA;
        };
        const tokens = defineTokens({
            serviceA: defineType<ServiceA>(),
            serviceB: defineType<ServiceB>(),
        });
        const rootServiceA = { name: "root-a" };
        const container = createContainer(
            tokens,
            bind.singleton(tokens.serviceA, () => rootServiceA),
            bind.singleton(tokens.serviceB, { serviceA: tokens.serviceA }, ({ serviceA }) => ({
                name: "root-b",
                serviceA,
            })),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, ({ serviceB }) => ({
                name: "child-a",
                serviceB,
            })),
        );

        expect(childScope.resolve(tokens.serviceA)).toEqual({
            name: "child-a",
            serviceB: {
                name: "root-b",
                serviceA: rootServiceA,
            },
        });
        expect(childScope.resolve(tokens.serviceB).serviceA).toBe(rootServiceA);
        expect(container.resolve(tokens.serviceA)).toBe(rootServiceA);
    });

    it("lets nested scopes inherit child overrides while keeping grandchild overrides local", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<{ readonly name: string }>(),
        });
        const container = createContainer(
            tokens,
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: tokens.config }, ({ config }) => ({ name: config.name })),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));
        const inheritedGrandchildScope = childScope.createScope();
        const overriddenGrandchildScope = childScope.createScope(
            bind.scoped(tokens.config, () => ({ name: "grandchild" })),
        );

        expect(container.resolve(tokens.service)).toEqual({ name: "root" });
        expect(childScope.resolve(tokens.service)).toEqual({ name: "child" });
        expect(inheritedGrandchildScope.resolve(tokens.service)).toEqual({ name: "child" });
        expect(overriddenGrandchildScope.resolve(tokens.service)).toEqual({ name: "grandchild" });
        expect(childScope.resolve(tokens.service)).toEqual({ name: "child" });
        expect(container.resolve(tokens.service)).toEqual({ name: "root" });
    });

    it("caches scoped services independently across nested scopes", () => {
        const tokens = defineTokens({
            counter: defineType<{ readonly id: number }>(),
        });
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(tokens, bind.scoped(tokens.counter, factory));
        const childScope = container.createScope();
        const grandchildScope = childScope.createScope();

        const rootCounter = container.resolve(tokens.counter);
        const childCounter = childScope.resolve(tokens.counter);
        const grandchildCounter = grandchildScope.resolve(tokens.counter);

        expect(container.resolve(tokens.counter)).toBe(rootCounter);
        expect(childScope.resolve(tokens.counter)).toBe(childCounter);
        expect(grandchildScope.resolve(tokens.counter)).toBe(grandchildCounter);
        expect(rootCounter).not.toBe(childCounter);
        expect(childCounter).not.toBe(grandchildCounter);
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it("shares child-scope singletons with descendants without exposing them to parent or siblings", () => {
        const tokens = defineTokens({
            service: defineType<{ readonly id: number }>(),
        });
        const service = { id: 1 };
        const factory = vi.fn(() => service);
        const container = createRuntimeContainer(tokens);
        const siblingScope = container.createScope();
        const childScope = container.createScope(bind.singleton(tokens.service, factory));
        const grandchildScope = childScope.createScope();

        expect(childScope.resolve(tokens.service)).toBe(service);
        expect(grandchildScope.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(() => container.resolve(tokens.service)).toThrowError(
            'Service "service" is not registered in the container',
        );
        expect(() => siblingScope.resolve(tokens.service)).toThrowError(
            'Service "service" is not registered in the container',
        );
    });

    it("re-resolves eager dependencies for every transient service resolution", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly id: number }>(),
            service: defineType<{ readonly configId: number }>(),
        });
        let nextConfigId = 1;
        const configFactory = vi.fn(() => ({ id: nextConfigId++ }));
        const serviceFactory = vi.fn(({ config }: { readonly config: { readonly id: number } }) => ({
            configId: config.id,
        }));

        const container = createContainer(
            tokens,
            bind.transient(tokens.config, configFactory),
            bind.transient(tokens.service, { config: tokens.config }, serviceFactory),
        );

        expect(container.resolve(tokens.service)).toEqual({ configId: 1 });
        expect(container.resolve(tokens.service)).toEqual({ configId: 2 });
        expect(serviceFactory).toHaveBeenCalledTimes(2);
        expect(configFactory).toHaveBeenCalledTimes(2);
    });

    it("resolves transient services against child overrides on every resolution", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<{ readonly name: string; readonly id: number }>(),
        });
        let nextId = 1;
        const serviceFactory = vi.fn(({ config }: { readonly config: { readonly name: string } }) => ({
            id: nextId++,
            name: config.name,
        }));
        const container = createContainer(
            tokens,
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.transient(tokens.service, { config: tokens.config }, serviceFactory),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service)).toEqual({ id: 1, name: "root" });
        expect(childScope.resolve(tokens.service)).toEqual({ id: 2, name: "child" });
        expect(childScope.resolve(tokens.service)).toEqual({ id: 3, name: "child" });
        expect(serviceFactory).toHaveBeenCalledTimes(3);
    });

    it("creates independent ref instances for sibling scopes", () => {
        type Service = {
            readonly configRef: object;
            readonly getConfig: () => { readonly name: string };
        };
        const tokens = defineTokens({
            config: defineType<{ readonly name: string }>(),
            service: defineType<Service>(),
        });
        const container = createContainer(
            tokens,
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: ref(tokens.config) }, ({ config }) => ({
                configRef: config,
                getConfig: () => config.value,
            })),
        );
        const firstScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "first" })));
        const secondScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "second" })));

        const firstService = firstScope.resolve(tokens.service);
        const secondService = secondScope.resolve(tokens.service);

        expect(firstService.configRef).not.toBe(secondService.configRef);
        expect(firstService.getConfig()).toEqual({ name: "first" });
        expect(secondService.getConfig()).toEqual({ name: "second" });
    });

    it("selects lazy ref dependency tokens per scoped service initialization", () => {
        const tokens = defineTokens({
            firstLogger: defineType<{ readonly name: "first" }>(),
            secondLogger: defineType<{ readonly name: "second" }>(),
            service: defineType<{
                readonly getLogger: () => { readonly name: "first" } | { readonly name: "second" };
            }>(),
        });
        let selectedToken: typeof tokens.firstLogger | typeof tokens.secondLogger = tokens.firstLogger;
        const resolveToken = vi.fn(() => selectedToken);
        const container = createContainer(
            tokens,
            bind.scoped(tokens.firstLogger, () => ({ name: "first" })),
            bind.scoped(tokens.secondLogger, () => ({ name: "second" })),
            bind.scoped(tokens.service, { logger: ref(resolveToken) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
        );

        const firstScope = container.createScope();
        const firstService = firstScope.resolve(tokens.service);
        selectedToken = tokens.secondLogger;
        const secondScope = container.createScope();
        const secondService = secondScope.resolve(tokens.service);

        expect(firstService.getLogger()).toEqual({ name: "first" });
        expect(secondService.getLogger()).toEqual({ name: "second" });
        expect(firstService.getLogger()).toEqual({ name: "first" });
        expect(resolveToken).toHaveBeenCalledTimes(2);
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

    it("throws when the same service is registered twice in a child scope", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const container = createRuntimeContainer(tokens);

        expect(() =>
            container.createScope(
                bind(tokens.port, () => 3000),
                bind(tokens.port, () => 4000),
            ),
        ).toThrowError('Service "port" is already registered in the container');
    });

    it("throws when a child scope binding was not created with bind", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const container = createRuntimeContainer(tokens);

        expect(() =>
            container.createScope({
                token: tokens.port,
                factory: () => 3000,
            }),
        ).toThrowError("Bindings must be created with bind");
    });

    it("throws when a child scope binding token is not in the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(tokens);

        expect(() => container.createScope(bind(externalToken, () => 3000))).toThrowError(
            'Token "external" is not registered in the registry',
        );
    });

    it("throws when a child scope eager dependency token is not in the registry", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(tokens);

        expect(() =>
            container.createScope(bind(tokens.port, { external: externalToken }, ({ external }) => external)),
        ).toThrowError('Token "external" is not registered in the registry');
    });

    it("throws when a child scope service depends on a registered token without a visible binding", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            server: defineType<{ readonly port: number }>(),
        });
        const container = createRuntimeContainer(tokens);
        const childScope = container.createScope(
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
        );

        expect(() => childScope.resolve(tokens.server)).toThrowError(
            'Service "config" is not registered in the container',
        );
    });

    it("throws when child scope overrides create an eager circular dependency", () => {
        const tokens = defineTokens({
            serviceA: defineType<{ readonly name: "a" }>(),
            serviceB: defineType<{ readonly name: "b" }>(),
        });
        const container = createRuntimeContainer(
            tokens,
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );

        expect(() =>
            container.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when child scope overrides create a cycle through a transient parent binding", () => {
        const tokens = defineTokens({
            serviceA: defineType<{ readonly name: "a" }>(),
            serviceB: defineType<{ readonly name: "b" }>(),
        });
        const container = createRuntimeContainer(
            tokens,
            bind.transient(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );

        expect(() =>
            container.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when nested scope overrides create an eager circular dependency", () => {
        const tokens = defineTokens({
            serviceA: defineType<{ readonly name: "a" }>(),
            serviceB: defineType<{ readonly name: "b" }>(),
        });
        const container = createRuntimeContainer(
            tokens,
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );
        const childScope = container.createScope();

        expect(() =>
            childScope.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
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

    it("resolves transient ref dependencies lazily without caching their target instances", () => {
        const tokens = defineTokens({
            logger: defineType<{ readonly id: number }>(),
            service: defineType<{ readonly getLogger: () => { readonly id: number } }>(),
        });
        let nextLoggerId = 1;
        const loggerFactory = vi.fn(() => ({ id: nextLoggerId++ }));

        const container = createContainer(
            tokens,
            bind(tokens.service, { logger: ref(tokens.logger) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
            bind.transient(tokens.logger, loggerFactory),
        );

        const service = container.resolve(tokens.service);

        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toEqual({ id: 1 });
        expect(service.getLogger()).toEqual({ id: 2 });
        expect(loggerFactory).toHaveBeenCalledTimes(2);
    });

    it("reuses ref dependency instances for the same target token", () => {
        const tokens = defineTokens({
            logger: defineType<{ readonly log: (message: string) => void }>(),
            service: defineType<{
                readonly getLogger: () => { readonly log: (message: string) => void };
                readonly hasSharedLoggerRef: boolean;
            }>(),
        });
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            tokens,
            bind(
                tokens.service,
                { firstLogger: ref(tokens.logger), secondLogger: ref(tokens.logger) },
                ({ firstLogger, secondLogger }) => ({
                    getLogger: () => firstLogger.value,
                    hasSharedLoggerRef: firstLogger === secondLogger,
                }),
            ),
            bind(tokens.logger, loggerFactory),
        );

        const service = container.resolve(tokens.service);

        expect(service.hasSharedLoggerRef).toBe(true);
        expect(loggerFactory).not.toHaveBeenCalled();
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
