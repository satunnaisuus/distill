import { describe, expect, it, vi } from "vitest";
import { bind } from "../src/bind";
import { createContainer } from "../src/container";
import { ref } from "../src/ref";
import { type Token, token } from "../src/token";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly resolveAll: (token: unknown) => unknown[];
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};

type Deferred = {
    readonly promise: Promise<void>;
    readonly resolve: () => void;
};

const createRuntimeContainer = createContainer as unknown as (
    tokens: readonly unknown[],
    ...bindings: readonly unknown[]
) => RuntimeContainerForTest;

const createDeferred = (): Deferred => {
    let resolveDeferred!: () => void;
    const promise = new Promise<void>((resolve) => {
        resolveDeferred = resolve;
    });

    return {
        promise,
        resolve: resolveDeferred,
    };
};

describe("createContainer", () => {
    it("accepts an explicit array of tokens", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Logger = token("Logger").of<{ readonly log: (message: string) => void }>();
        const logger = { log: vi.fn() };

        const container = createContainer(
            [Config, Logger],
            bind(Config, () => ({ port: 3000 })),
            bind(Logger, () => logger),
        );

        expect(container.resolve(Config)).toEqual({ port: 3000 });
        expect(container.resolve(Logger)).toBe(logger);
    });

    it("throws when the token list contains duplicate keys", () => {
        const NumberPort = token("port").of<number>();
        const StringPort = token("port").of<string>();

        expect(() => createRuntimeContainer([NumberPort, StringPort])).toThrowError(
            'Token "port" is already included in the token list',
        );
    });

    it("resolves a service without dependencies", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        const container = createContainer(
            Object.values(tokens),
            bind(tokens.port, () => 3000),
        );

        expect(container.resolve(tokens.port)).toBe(3000);
    });

    it("creates services lazily and caches resolved instances", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
        };
        const config = { port: 3000 };
        const factory = vi.fn(() => config);

        const container = createContainer(Object.values(tokens), bind(tokens.config, factory));

        expect(factory).not.toHaveBeenCalled();
        expect(container.resolve(tokens.config)).toBe(config);
        expect(container.resolve(tokens.config)).toBe(config);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("resolves eager dependencies before calling a dependent factory", () => {
        const calls: string[] = [];
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            server: token("server").of<{ readonly port: number }>(),
        };

        const container = createContainer(
            Object.values(tokens),
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

    it("resolves eager dependencies declared after their dependent service", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            server: token("server").of<{ readonly port: number }>(),
        };

        const container = createContainer(
            Object.values(tokens),
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
            bind(tokens.config, () => ({ port: 3000 })),
        );

        expect(container.resolve(tokens.server)).toEqual({ port: 3000 });
    });

    it("passes mixed eager and ref dependencies to the service factory", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{
                readonly port: number;
                readonly getLogger: () => { readonly log: (message: string) => void };
            }>(),
        };
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            Object.values(tokens),
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

    it("creates ref dependencies for non-disposable transient services without disposal tracking", () => {
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        };
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            Object.values(tokens),
            bind.transient(tokens.service, { logger: ref(tokens.logger) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
            bind(tokens.logger, loggerFactory),
        );

        const service = container.resolve(tokens.service);

        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(logger);
        expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    it("reuses a resolved dependency instance across dependents", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            firstServer: token("firstServer").of<{ readonly config: { readonly port: number } }>(),
            secondServer: token("secondServer").of<{ readonly config: { readonly port: number } }>(),
        };
        const config = { port: 3000 };
        const configFactory = vi.fn(() => config);

        const container = createContainer(
            Object.values(tokens),
            bind(tokens.config, configFactory),
            bind(tokens.firstServer, { config: tokens.config }, ({ config }) => ({ config })),
            bind(tokens.secondServer, { config: tokens.config }, ({ config }) => ({ config })),
        );

        expect(container.resolve(tokens.firstServer).config).toBe(config);
        expect(container.resolve(tokens.secondServer).config).toBe(config);
        expect(configFactory).toHaveBeenCalledTimes(1);
    });

    it("caches resolved falsy service values", () => {
        const tokens = {
            disabled: token("disabled").of<false>(),
            empty: token("empty").of<undefined>(),
            none: token("none").of<null>(),
            zero: token("zero").of<0>(),
        };
        const disabledFactory = vi.fn(() => false as const);
        const emptyFactory = vi.fn(() => undefined);
        const noneFactory = vi.fn(() => null);
        const zeroFactory = vi.fn(() => 0 as const);

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            service: token("service").of<{ readonly status: "ready" }>(),
        };
        const service = { status: "ready" as const };
        let attempts = 0;
        const factory = vi.fn(() => {
            attempts += 1;

            if (attempts === 1) {
                throw new Error("transient failure");
            }

            return service;
        });

        const container = createContainer(Object.values(tokens), bind(tokens.service, factory));

        expect(() => container.resolve(tokens.service)).toThrowError("transient failure");
        expect(container.resolve(tokens.service)).toBe(service);
        expect(container.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("creates transient services for every resolution", () => {
        const tokens = {
            counter: token("counter").of<{ readonly id: number }>(),
        };
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(Object.values(tokens), bind.transient(tokens.counter, factory));

        expect(container.resolve(tokens.counter)).toEqual({ id: 1 });
        expect(container.resolve(tokens.counter)).toEqual({ id: 2 });
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("caches scoped services separately for each scope", () => {
        const tokens = {
            counter: token("counter").of<{ readonly id: number }>(),
        };
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(Object.values(tokens), bind.scoped(tokens.counter, factory));
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
        const tokens = {
            service: token("service").of<{ readonly id: number }>(),
        };
        const service = { id: 1 };
        const factory = vi.fn(() => service);
        const container = createContainer(Object.values(tokens), bind.singleton(tokens.service, factory));
        const firstScope = container.createScope();
        const secondScope = container.createScope();

        expect(firstScope.resolve(tokens.service)).toBe(service);
        expect(secondScope.resolve(tokens.service)).toBe(service);
        expect(container.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("allows child scopes to override parent bindings", () => {
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: tokens.config }, ({ config }) => ({ name: config.name })),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service)).toEqual({ name: "root" });
        expect(childScope.resolve(tokens.service)).toEqual({ name: "child" });
    });

    it("resolves ref dependencies from the scope that created the ref", () => {
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<{ readonly getName: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.scoped(tokens.service, { config: ref(tokens.config) }, ({ config }) => ({
                getName: () => config.value.name,
            })),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service).getName()).toBe("root");
        expect(childScope.resolve(tokens.service).getName()).toBe("child");
    });

    it("resolves parent scoped dependencies supplied only by child scopes", () => {
        const tokens = {
            request: token("request").of<{ readonly id: string }>(),
            requestHolder: token("requestHolder").of<{ readonly requestId: string }>(),
            service: token("service").of<{ readonly requestId: string }>(),
            serviceWithRef: token("serviceWithRef").of<{ readonly requestId: string }>(),
            serviceWithTransitiveRef: token("serviceWithTransitiveRef").of<{ readonly requestId: string }>(),
            transientService: token("transientService").of<{ readonly requestId: string }>(),
            transientServiceWithRef: token("transientServiceWithRef").of<{ readonly requestId: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.service, { request: tokens.request }, ({ request }) => ({ requestId: request.id })),
            bind.scoped(tokens.serviceWithRef, { request: ref(tokens.request) }, ({ request }) => ({
                requestId: request.value.id,
            })),
            bind.scoped(tokens.serviceWithTransitiveRef, { holder: ref(tokens.requestHolder) }, ({ holder }) => ({
                requestId: holder.value.requestId,
            })),
            bind.transient(tokens.requestHolder, { request: tokens.request }, ({ request }) => ({
                requestId: request.id,
            })),
            bind.transient(tokens.transientService, { request: tokens.request }, ({ request }) => ({
                requestId: request.id,
            })),
            bind.transient(tokens.transientServiceWithRef, { request: ref(tokens.request) }, ({ request }) => ({
                requestId: request.value.id,
            })),
        );
        const childScope = container.createScope(bind.scoped(tokens.request, () => ({ id: "request-1" })));

        expect(() => (container as RuntimeContainerForTest).resolve(tokens.service)).toThrowError(
            'Service "request" is not registered in the container',
        );
        expect(childScope.resolve(tokens.service)).toEqual({ requestId: "request-1" });
        expect(childScope.resolve(tokens.serviceWithRef)).toEqual({ requestId: "request-1" });
        expect(childScope.resolve(tokens.serviceWithTransitiveRef)).toEqual({ requestId: "request-1" });
        expect(childScope.resolve(tokens.transientService)).toEqual({ requestId: "request-1" });
        expect(childScope.resolve(tokens.transientServiceWithRef)).toEqual({ requestId: "request-1" });
    });

    it("resolves parent scoped dependencies supplied only by grandchild scopes", () => {
        const tokens = {
            request: token("request").of<{ readonly id: string }>(),
            service: token("service").of<{ readonly requestId: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.service, { request: tokens.request }, ({ request }) => ({ requestId: request.id })),
        );
        const childScope = container.createScope();
        const grandchildScope = childScope.createScope(bind.scoped(tokens.request, () => ({ id: "request-1" })));

        expect(() => (container as RuntimeContainerForTest).resolve(tokens.service)).toThrowError(
            'Service "request" is not registered in the container',
        );
        expect(() => (childScope as RuntimeContainerForTest).resolve(tokens.service)).toThrowError(
            'Service "request" is not registered in the container',
        );
        expect(grandchildScope.resolve(tokens.service)).toEqual({ requestId: "request-1" });
    });

    it("resolves parent services through descendant-completed override chains", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
            service: token("service").of<{ readonly port: number }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.port, () => 3000),
            bind.scoped(tokens.service, { port: tokens.port }, ({ port }) => ({ port })),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.port, { config: tokens.config }, ({ config }) => config.port),
        );
        const grandchildScope = childScope.createScope(bind.scoped(tokens.config, () => ({ port: 4000 })));

        expect(container.resolve(tokens.service)).toEqual({ port: 3000 });
        expect(() => (childScope as RuntimeContainerForTest).resolve(tokens.service)).toThrowError(
            'Service "config" is not registered in the container',
        );
        expect(grandchildScope.resolve(tokens.service)).toEqual({ port: 4000 });
    });

    it("initializes singleton dependencies from the singleton registration scope", () => {
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            serviceA: token("serviceA").of<ServiceA>(),
            serviceB: token("serviceB").of<ServiceB>(),
        };
        const rootServiceA = { name: "root-a" };
        const container = createContainer(
            Object.values(tokens),
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

    it("ignores shadowed regular parent bindings during child scope cycle checks", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: string }>(),
            serviceB: token("serviceB").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "root-a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "root-b" })),
        );

        const childScope = container.createScope(
            bind.scoped(tokens.serviceA, () => ({ name: "child-a" })),
            bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "child-b" })),
        );

        expect(childScope.resolve(tokens.serviceB)).toEqual({ name: "child-b" });
    });

    it("lets nested scopes inherit child overrides while keeping grandchild overrides local", () => {
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            counter: token("counter").of<{ readonly id: number }>(),
        };
        let nextId = 1;
        const factory = vi.fn(() => ({ id: nextId++ }));

        const container = createContainer(Object.values(tokens), bind.scoped(tokens.counter, factory));
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
        const tokens = {
            service: token("service").of<{ readonly id: number }>(),
        };
        const service = { id: 1 };
        const factory = vi.fn(() => service);
        const container = createRuntimeContainer(Object.values(tokens));
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
        const tokens = {
            config: token("config").of<{ readonly id: number }>(),
            service: token("service").of<{ readonly configId: number }>(),
        };
        let nextConfigId = 1;
        const configFactory = vi.fn(() => ({ id: nextConfigId++ }));
        const serviceFactory = vi.fn(({ config }: { readonly config: { readonly id: number } }) => ({
            configId: config.id,
        }));

        const container = createContainer(
            Object.values(tokens),
            bind.transient(tokens.config, configFactory),
            bind.transient(tokens.service, { config: tokens.config }, serviceFactory),
        );

        expect(container.resolve(tokens.service)).toEqual({ configId: 1 });
        expect(container.resolve(tokens.service)).toEqual({ configId: 2 });
        expect(serviceFactory).toHaveBeenCalledTimes(2);
        expect(configFactory).toHaveBeenCalledTimes(2);
    });

    it("resolves transient services against child overrides on every resolution", () => {
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<{ readonly name: string; readonly id: number }>(),
        };
        let nextId = 1;
        const serviceFactory = vi.fn(({ config }: { readonly config: { readonly name: string } }) => ({
            id: nextId++,
            name: config.name,
        }));
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.config, () => ({ name: "root" })),
            bind.transient(tokens.service, { config: tokens.config }, serviceFactory),
        );
        const childScope = container.createScope(bind.scoped(tokens.config, () => ({ name: "child" })));

        expect(container.resolve(tokens.service)).toEqual({ id: 1, name: "root" });
        expect(childScope.resolve(tokens.service)).toEqual({ id: 2, name: "child" });
        expect(childScope.resolve(tokens.service)).toEqual({ id: 3, name: "child" });
        expect(serviceFactory).toHaveBeenCalledTimes(3);
    });

    it("does not create disposable bindings during dispose without prior resolve", async () => {
        const tokens = {
            service: token("service").of<{ readonly id: "service" }>(),
        };
        const factory = vi.fn(() => ({ id: "service" as const }));
        const disposer = vi.fn();
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, factory, {
                dispose: disposer,
            }),
        );

        expect(container.disposed).toBe(false);

        await container.dispose();

        expect(factory).not.toHaveBeenCalled();
        expect(disposer).not.toHaveBeenCalled();
        expect(container.disposed).toBe(true);
    });

    it("finishes tracking an in-flight resolution before a factory-requested dispose runs", async () => {
        const events: string[] = [];
        let factoryDisposePromise: Promise<void> | undefined;
        const tokens = {
            resource: token("resource").of<{ readonly id: "resource" }>(),
            service: token("service").of<{ readonly resource: { readonly id: "resource" } }>(),
        };
        let disposeContainer = () => Promise.resolve();
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { resource: tokens.resource },
                ({ resource }) => {
                    factoryDisposePromise = disposeContainer();
                    events.push("factory");

                    return { resource };
                },
                {
                    dispose: () => events.push("service"),
                },
            ),
            bind(tokens.resource, () => ({ id: "resource" }), {
                dispose: () => events.push("resource"),
            }),
        );
        disposeContainer = () => container.dispose();

        expect(container.resolve(tokens.service)).toEqual({ resource: { id: "resource" } });
        expect(container.disposed).toBe(true);
        expect(events).toEqual(["factory"]);
        expect(factoryDisposePromise).toBeDefined();

        await expect(factoryDisposePromise as Promise<void>).resolves.toBeUndefined();

        expect(events).toEqual(["factory", "service", "resource"]);
    });

    it("disposes only instances owned by the disposed scope", async () => {
        const events: string[] = [];
        const tokens = {
            db: token("db").of<{ readonly id: "db" }>(),
            rootService: token("rootService").of<{ readonly id: "root" }>(),
            requestService: token("requestService").of<{ readonly id: "request" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.singleton(tokens.db, () => ({ id: "db" }), { dispose: () => events.push("db") }),
            bind.scoped(tokens.rootService, { db: tokens.db }, () => ({ id: "root" }), {
                dispose: () => events.push("root"),
            }),
            bind.scoped(tokens.requestService, { db: tokens.db }, () => ({ id: "request" }), {
                dispose: () => events.push("request"),
            }),
        );
        const childScope = container.createScope();

        childScope.resolve(tokens.requestService);
        container.resolve(tokens.rootService);

        await childScope.dispose();
        await childScope.dispose();

        expect(events).toEqual(["request"]);
        expect(childScope.disposed).toBe(true);
        expect(container.disposed).toBe(false);

        await container.dispose();

        expect(events).toEqual(["request", "root", "db"]);
        expect(container.disposed).toBe(true);
    });

    it("disposes child-owned singletons first resolved from grandchild scopes", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly id: "service" }>(),
        };
        const factory = vi.fn(() => ({ id: "service" as const }));
        const container = createContainer(Object.values(tokens));
        const childScope = container.createScope(
            bind.singleton(tokens.service, factory, {
                dispose: () => events.push("service"),
            }),
        );
        const grandchildScope = childScope.createScope();

        const service = grandchildScope.resolve(tokens.service);

        expect(childScope.resolve(tokens.service)).toBe(service);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(events).toEqual([]);

        await childScope.dispose();

        expect(events).toEqual(["service"]);
        expect(container.disposed).toBe(false);
        expect(childScope.disposed).toBe(true);
        expect(grandchildScope.disposed).toBe(true);

        await container.dispose();

        expect(events).toEqual(["service"]);
        expect(container.disposed).toBe(true);
    });

    it("cascades dispose to child scopes before disposing parent instances", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.service, () => ({ name: "root" }), { dispose: () => events.push("root") }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.service, () => ({ name: "child" }), { dispose: () => events.push("child") }),
        );
        const grandchildScope = childScope.createScope(
            bind.scoped(tokens.service, () => ({ name: "grandchild" }), {
                dispose: () => events.push("grandchild"),
            }),
        );

        container.resolve(tokens.service);
        childScope.resolve(tokens.service);
        grandchildScope.resolve(tokens.service);

        await container.dispose();

        expect(events).toEqual(["grandchild", "child", "root"]);
        expect(container.disposed).toBe(true);
        expect(childScope.disposed).toBe(true);
        expect(grandchildScope.disposed).toBe(true);
        expect(() => container.resolve(tokens.service)).toThrowError("Container has been disposed");
        expect(() => container.createScope()).toThrowError("Container has been disposed");
    });

    it("disposes sibling child scopes in reverse creation order", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.service, () => ({ name: "root" })),
        );
        const firstScope = container.createScope(
            bind.scoped(tokens.service, () => ({ name: "first" }), { dispose: () => events.push("first") }),
        );
        const secondScope = container.createScope(
            bind.scoped(tokens.service, () => ({ name: "second" }), { dispose: () => events.push("second") }),
        );

        secondScope.resolve(tokens.service);
        firstScope.resolve(tokens.service);

        await container.dispose();

        expect(events).toEqual(["second", "first"]);
        expect(firstScope.disposed).toBe(true);
        expect(secondScope.disposed).toBe(true);
    });

    it("cascades direct child scope dispose to grandchild scopes without disposing parent", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.service, () => ({ name: "root" }), { dispose: () => events.push("root") }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.service, () => ({ name: "child" }), { dispose: () => events.push("child") }),
        );
        const grandchildScope = childScope.createScope(
            bind.scoped(tokens.service, () => ({ name: "grandchild" }), {
                dispose: () => events.push("grandchild"),
            }),
        );

        const rootService = container.resolve(tokens.service);
        childScope.resolve(tokens.service);
        grandchildScope.resolve(tokens.service);

        await childScope.dispose();

        expect(events).toEqual(["grandchild", "child"]);
        expect(container.disposed).toBe(false);
        expect(childScope.disposed).toBe(true);
        expect(grandchildScope.disposed).toBe(true);
        expect(container.resolve(tokens.service)).toBe(rootService);

        await container.dispose();

        expect(events).toEqual(["grandchild", "child", "root"]);
        expect(container.disposed).toBe(true);
    });

    it("tracks disposable transient instances in the resolution scope", async () => {
        const disposedIds: number[] = [];
        const tokens = {
            resource: token("resource").of<{ readonly id: number }>(),
        };
        let nextId = 1;
        const container = createContainer(
            Object.values(tokens),
            bind.transient(tokens.resource, () => ({ id: nextId++ }), {
                dispose: (resource) => disposedIds.push(resource.id),
            }),
        );
        const childScope = container.createScope();

        childScope.resolve(tokens.resource);
        childScope.resolve(tokens.resource);

        await childScope.dispose();
        await container.dispose();

        expect(disposedIds).toEqual([2, 1]);
    });

    it("keeps unrelated later transient instances in reverse creation order when disposing eager dependents", async () => {
        const events: string[] = [];
        let nextResourceId = 1;
        const tokens = {
            resource: token("resource").of<{ readonly id: number }>(),
            service: token("service").of<{ readonly resource: { readonly id: number } }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, { resource: tokens.resource }, ({ resource }) => ({ resource }), {
                dispose: () => events.push("service"),
            }),
            bind.transient(tokens.resource, () => ({ id: nextResourceId++ }), {
                dispose: (resource) => events.push(`resource:${resource.id}`),
            }),
        );

        expect(container.resolve(tokens.service).resource).toEqual({ id: 1 });
        expect(container.resolve(tokens.resource)).toEqual({ id: 2 });

        await container.dispose();

        expect(events).toEqual(["resource:2", "service", "resource:1"]);
    });

    it("disposes lazily resolved ref dependencies after their consumers", async () => {
        const events: string[] = [];
        const tokens = {
            dependency: token("dependency").of<{ readonly name: "dependency" }>(),
            service: token("service").of<{ readonly getDependency: () => { readonly name: "dependency" } }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { dependency: ref(tokens.dependency) },
                ({ dependency }) => ({
                    getDependency: () => dependency.value,
                }),
                {
                    dispose: () => events.push("service"),
                },
            ),
            bind(tokens.dependency, () => ({ name: "dependency" }), {
                dispose: () => events.push("dependency"),
            }),
        );

        const service = container.resolve(tokens.service);

        expect(service.getDependency()).toEqual({ name: "dependency" });

        await container.dispose();

        expect(events).toEqual(["service", "dependency"]);
    });

    it("lets a disposer read an already resolved ref dependency before the dependency is disposed", async () => {
        const events: string[] = [];
        let dependencyDisposed = false;
        const tokens = {
            dependency: token("dependency").of<{ readonly read: () => string }>(),
            service: token("service").of<{ readonly readDependency: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { dependency: ref(tokens.dependency) },
                ({ dependency }) => ({
                    readDependency: () => dependency.value.read(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readDependency()}`),
                },
            ),
            bind(
                tokens.dependency,
                () => ({
                    read: () => {
                        if (dependencyDisposed) {
                            throw new Error("Dependency was disposed");
                        }

                        return "open";
                    },
                }),
                {
                    dispose: () => {
                        dependencyDisposed = true;
                        events.push("dependency");
                    },
                },
            ),
        );

        const service = container.resolve(tokens.service);

        expect(service.readDependency()).toBe("open");

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:open", "dependency"]);
    });

    it("wraps an unresolved ref read by a disposer without creating the target", async () => {
        const targetFactory = vi.fn(() => ({ name: "target" as const }));
        const tokens = {
            service: token("service").of<{ readonly readTarget: () => string }>(),
            target: token("target").of<{ readonly name: "target" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { target: ref(tokens.target) },
                ({ target }) => ({
                    readTarget: () => target.value.name,
                }),
                {
                    dispose: (service) => {
                        service.readTarget();
                    },
                },
            ),
            bind(tokens.target, targetFactory),
        );

        container.resolve(tokens.service);

        let disposeError: unknown;

        try {
            await container.dispose();
        } catch (error) {
            disposeError = error;
        }

        expect(disposeError).toBeInstanceOf(AggregateError);
        expect((disposeError as AggregateError).errors).toHaveLength(1);
        expect(((disposeError as AggregateError).errors[0] as Error).message).toBe("Container has been disposed");
        expect(targetFactory).not.toHaveBeenCalled();
    });

    it("propagates disposable ref dependency tracking through non-disposable eager wrappers", async () => {
        const events: string[] = [];
        let resourceDisposed = false;
        const tokens = {
            resource: token("resource").of<{ readonly read: () => string }>(),
            wrapper: token("wrapper").of<{ readonly readResource: () => string }>(),
            service: token("service").of<{ readonly readWrappedResource: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { wrapper: tokens.wrapper },
                ({ wrapper }) => ({
                    readWrappedResource: () => wrapper.readResource(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readWrappedResource()}`),
                },
            ),
            bind(tokens.wrapper, { resource: ref(tokens.resource) }, ({ resource }) => ({
                readResource: () => resource.value.read(),
            })),
            bind(
                tokens.resource,
                () => ({
                    read: () => {
                        if (resourceDisposed) {
                            throw new Error("Resource was disposed");
                        }

                        return "open";
                    },
                }),
                {
                    dispose: () => {
                        resourceDisposed = true;
                        events.push("resource");
                    },
                },
            ),
        );

        const service = container.resolve(tokens.service);

        expect(service.readWrappedResource()).toBe("open");

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:open", "resource"]);
    });

    it("preserves disposal order through cached non-disposable ref wrappers first read by disposers", async () => {
        const events: string[] = [];
        let resourceDisposed = false;
        const tokens = {
            resource: token("resource").of<{ readonly read: () => string }>(),
            wrapper: token("wrapper").of<{ readonly readResource: () => string }>(),
            service: token("service").of<{ readonly readWrappedResource: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.wrapper, { resource: ref(tokens.resource) }, ({ resource }) => ({
                readResource: () => resource.value.read(),
            })),
            bind(
                tokens.service,
                { wrapper: ref(tokens.wrapper) },
                ({ wrapper }) => ({
                    readWrappedResource: () => wrapper.value.readResource(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readWrappedResource()}`),
                },
            ),
            bind(
                tokens.resource,
                () => ({
                    read: () => {
                        if (resourceDisposed) {
                            throw new Error("Resource was disposed");
                        }

                        return "open";
                    },
                }),
                {
                    dispose: () => {
                        resourceDisposed = true;
                        events.push("resource");
                    },
                },
            ),
        );

        expect(container.resolve(tokens.wrapper).readResource).toBeTypeOf("function");
        expect(container.resolve(tokens.service).readWrappedResource).toBeTypeOf("function");
        expect(container.resolve(tokens.resource).read()).toBe("open");

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:open", "resource"]);
    });

    it("preserves disposal order through cyclic cached non-disposable ref wrappers", async () => {
        const events: string[] = [];
        let resourceDisposed = false;
        const tokens = {
            resource: token("resource").of<{ readonly read: () => string }>(),
            wrapperA: token("wrapperA").of<{ readonly readResource: () => string }>(),
            wrapperB: token("wrapperB").of<{ readonly getWrapperA: () => { readonly readResource: () => string } }>(),
            service: token("service").of<{ readonly readWrappedResource: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.wrapperA,
                { wrapperB: ref(tokens.wrapperB), resource: ref(tokens.resource) },
                ({ resource }) => ({
                    readResource: () => resource.value.read(),
                }),
            ),
            bind(tokens.wrapperB, { wrapperA: ref(tokens.wrapperA) }, ({ wrapperA }) => ({
                getWrapperA: () => wrapperA.value,
            })),
            bind(
                tokens.service,
                { wrapperA: ref(tokens.wrapperA) },
                ({ wrapperA }) => ({
                    readWrappedResource: () => wrapperA.value.readResource(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readWrappedResource()}`),
                },
            ),
            bind(
                tokens.resource,
                () => ({
                    read: () => {
                        if (resourceDisposed) {
                            throw new Error("Resource was disposed");
                        }

                        return "open";
                    },
                }),
                {
                    dispose: () => {
                        resourceDisposed = true;
                        events.push("resource");
                    },
                },
            ),
        );

        expect(container.resolve(tokens.wrapperA).readResource).toBeTypeOf("function");
        expect(container.resolve(tokens.wrapperB).getWrapperA).toBeTypeOf("function");
        expect(container.resolve(tokens.service).readWrappedResource).toBeTypeOf("function");
        expect(container.resolve(tokens.resource).read()).toBe("open");

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:open", "resource"]);
    });

    it("does not expand parent-owned cached wrappers while disposing child ref dependents", async () => {
        const events: string[] = [];
        const tokens = {
            wrapper: token("wrapper").of<{ readonly read: () => string }>(),
            service: token("service").of<{ readonly readWrapper: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.wrapper, () => ({
                read: () => "root",
            })),
        );
        const childScope = container.createScope(
            bind.scoped(
                tokens.service,
                { wrapper: ref(tokens.wrapper) },
                ({ wrapper }) => ({
                    readWrapper: () => wrapper.value.read(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readWrapper()}`),
                },
            ),
        );

        expect(container.resolve(tokens.wrapper).read()).toBe("root");
        expect(childScope.resolve(tokens.service).readWrapper).toBeTypeOf("function");

        await expect(childScope.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:root"]);

        await expect(container.dispose()).resolves.toBeUndefined();
    });

    it("lets child disposers read parent-owned cached refs during parent cascade", async () => {
        const events: string[] = [];
        const tokens = {
            wrapper: token("wrapper").of<{ readonly read: () => string }>(),
            service: token("service").of<{ readonly readWrapper: () => string }>(),
        };
        const wrapperFactory = vi.fn(() => ({
            read: () => "root",
        }));
        const container = createContainer(Object.values(tokens), bind(tokens.wrapper, wrapperFactory));
        let childScope: RuntimeContainerForTest;

        childScope = container.createScope(
            bind.scoped(
                tokens.service,
                { wrapper: ref(tokens.wrapper) },
                ({ wrapper }) => ({
                    readWrapper: () => wrapper.value.read(),
                }),
                {
                    dispose: (service) => {
                        events.push(`disposed:${container.disposed}:${childScope.disposed}`);
                        events.push(`service:${service.readWrapper()}`);
                    },
                },
            ),
        );

        expect(container.resolve(tokens.wrapper).read()).toBe("root");
        expect(childScope.resolve(tokens.service).readWrapper).toBeTypeOf("function");
        expect(wrapperFactory).toHaveBeenCalledTimes(1);

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["disposed:true:true", "service:root"]);
        expect(wrapperFactory).toHaveBeenCalledTimes(1);
        expect(childScope.disposed).toBe(true);
    });

    it("ignores self ref dependencies when disposing", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly getSelf: () => { readonly getSelf: () => unknown } }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { self: ref(tokens.service) },
                ({ self }) => ({
                    getSelf: () => self.value,
                }),
                {
                    dispose: () => events.push("service"),
                },
            ),
        );

        const service = container.resolve(tokens.service);

        expect(service.getSelf()).toBe(service);

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service"]);
    });

    it("deduplicates propagated ref dependencies through shared non-disposable wrappers", async () => {
        const events: string[] = [];
        let resourceDisposed = false;
        const tokens = {
            resource: token("resource").of<{ readonly read: () => string }>(),
            wrapper: token("wrapper").of<{ readonly readResource: () => string }>(),
            shared: token("shared").of<{ readonly readResource: () => string }>(),
            firstConsumer: token("firstConsumer").of<{ readonly readResource: () => string }>(),
            secondConsumer: token("secondConsumer").of<{ readonly readResource: () => string }>(),
            service: token("service").of<{ readonly readResource: () => string }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { firstConsumer: tokens.firstConsumer, secondConsumer: tokens.secondConsumer },
                ({ firstConsumer }) => ({
                    readResource: () => firstConsumer.readResource(),
                }),
                {
                    dispose: (service) => events.push(`service:${service.readResource()}`),
                },
            ),
            bind(tokens.firstConsumer, { shared: tokens.shared }, ({ shared }) => ({
                readResource: () => shared.readResource(),
            })),
            bind(tokens.secondConsumer, { shared: tokens.shared }, ({ shared }) => ({
                readResource: () => shared.readResource(),
            })),
            bind(tokens.shared, { wrapper: ref(tokens.wrapper) }, ({ wrapper }) => ({
                readResource: () => wrapper.value.readResource(),
            })),
            bind(tokens.wrapper, { resource: ref(tokens.resource) }, ({ resource }) => {
                const resolvedResource = resource.value;

                return {
                    readResource: () => resolvedResource.read(),
                };
            }),
            bind(
                tokens.resource,
                () => ({
                    read: () => {
                        if (resourceDisposed) {
                            throw new Error("Resource was disposed");
                        }

                        return "open";
                    },
                }),
                {
                    dispose: () => {
                        resourceDisposed = true;
                        events.push("resource");
                    },
                },
            ),
        );

        const service = container.resolve(tokens.service);

        expect(service.readResource()).toBe("open");

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["service:open", "resource"]);
    });

    it("deduplicates repeated disposable ref dependencies while reusing the same ref instance", async () => {
        const events: string[] = [];
        const tokens = {
            dependency: token("dependency").of<{ readonly name: "dependency" }>(),
            service: token("service").of<{
                readonly hasSharedDependencyRef: boolean;
                readonly readDependency: () => { readonly name: "dependency" };
            }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { firstDependency: ref(tokens.dependency), secondDependency: ref(tokens.dependency) },
                ({ firstDependency, secondDependency }) => ({
                    hasSharedDependencyRef: firstDependency === secondDependency,
                    readDependency: () => firstDependency.value,
                }),
                {
                    dispose: () => events.push("service"),
                },
            ),
            bind(tokens.dependency, () => ({ name: "dependency" }), {
                dispose: () => events.push("dependency"),
            }),
        );

        const service = container.resolve(tokens.service);

        expect(service.hasSharedDependencyRef).toBe(true);
        expect(service.readDependency()).toEqual({ name: "dependency" });

        await container.dispose();

        expect(events).toEqual(["service", "dependency"]);
    });

    it("disposes transient ref dependency instances after their consumer", async () => {
        const events: string[] = [];
        let nextResourceId = 1;
        const tokens = {
            resource: token("resource").of<{ readonly id: number }>(),
            service: token("service").of<{ readonly getResource: () => { readonly id: number } }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { resource: ref(tokens.resource) },
                ({ resource }) => ({
                    getResource: () => resource.value,
                }),
                {
                    dispose: () => events.push("service"),
                },
            ),
            bind.transient(tokens.resource, () => ({ id: nextResourceId++ }), {
                dispose: (resource) => events.push(`resource:${resource.id}`),
            }),
        );

        const service = container.resolve(tokens.service);

        expect(service.getResource()).toEqual({ id: 1 });
        expect(service.getResource()).toEqual({ id: 2 });

        await container.dispose();

        expect(events).toEqual(["service", "resource:2", "resource:1"]);
    });

    it("keeps unrelated later transient instances in reverse creation order when disposing ref dependents", async () => {
        const events: string[] = [];
        let nextResourceId = 1;
        const tokens = {
            resource: token("resource").of<{ readonly id: number }>(),
            service: token("service").of<{ readonly getResource: () => { readonly id: number } }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { resource: ref(tokens.resource) },
                ({ resource }) => ({
                    getResource: () => resource.value,
                }),
                {
                    dispose: () => events.push("service"),
                },
            ),
            bind.transient(tokens.resource, () => ({ id: nextResourceId++ }), {
                dispose: (resource) => events.push(`resource:${resource.id}`),
            }),
        );

        const service = container.resolve(tokens.service);

        expect(service.getResource()).toEqual({ id: 1 });
        expect(container.resolve(tokens.resource)).toEqual({ id: 2 });

        await container.dispose();

        expect(events).toEqual(["resource:2", "service", "resource:1"]);
    });

    it("disposes ref dependency cycles without recursing indefinitely", async () => {
        type ServiceA = {
            readonly getB: () => ServiceB;
        };
        type ServiceB = {
            readonly getA: () => ServiceA;
        };
        const events: string[] = [];
        const tokens = {
            serviceA: token("serviceA").of<ServiceA>(),
            serviceB: token("serviceB").of<ServiceB>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.serviceA,
                { serviceB: ref(tokens.serviceB) },
                ({ serviceB }) => ({
                    getB: () => serviceB.value,
                }),
                { dispose: () => events.push("serviceA") },
            ),
            bind(
                tokens.serviceB,
                { serviceA: ref(tokens.serviceA) },
                ({ serviceA }) => ({
                    getA: () => serviceA.value,
                }),
                { dispose: () => events.push("serviceB") },
            ),
        );

        const serviceA = container.resolve(tokens.serviceA);
        const serviceB = serviceA.getB();

        expect(serviceB.getA()).toBe(serviceA);

        await container.dispose();

        expect(events).toEqual(["serviceA", "serviceB"]);
    });

    it("collects dispose errors while still disposing every owned instance", async () => {
        const calls: string[] = [];
        const firstError = new Error("first dispose failed");
        const secondError = new Error("second dispose failed");
        const tokens = {
            first: token("first").of<{ readonly name: "first" }>(),
            second: token("second").of<{ readonly name: "second" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.first, () => ({ name: "first" }), {
                dispose: () => {
                    calls.push("first");
                    throw firstError;
                },
            }),
            bind(tokens.second, () => ({ name: "second" }), {
                dispose: async () => {
                    calls.push("second");
                    throw secondError;
                },
            }),
        );

        container.resolve(tokens.first);
        container.resolve(tokens.second);

        let disposeError: unknown;

        try {
            await container.dispose();
        } catch (error) {
            disposeError = error;
        }

        expect(disposeError).toBeInstanceOf(AggregateError);
        expect((disposeError as AggregateError).errors).toEqual([secondError, firstError]);
        expect(calls).toEqual(["second", "first"]);

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(calls).toEqual(["second", "first"]);
    });

    it("clears refs and cached instances after failed disposal", async () => {
        const disposeError = new Error("dispose failed");
        const dependency = { name: "dependency" as const };
        const tokens = {
            dependency: token("dependency").of<{ readonly name: "dependency" }>(),
            service: token("service").of<{
                readonly dependencyRef: { readonly value: { readonly name: "dependency" } };
            }>(),
        };
        const dependencyFactory = vi.fn(() => dependency);
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { dependency: ref(tokens.dependency) },
                ({ dependency }) => ({
                    dependencyRef: dependency,
                }),
                {
                    dispose: () => {
                        throw disposeError;
                    },
                },
            ),
            bind(tokens.dependency, dependencyFactory),
        );

        const service = container.resolve(tokens.service);
        const savedDependencyRef = service.dependencyRef;

        expect(savedDependencyRef.value).toBe(dependency);
        expect(savedDependencyRef.value).toBe(dependency);
        expect(dependencyFactory).toHaveBeenCalledTimes(1);

        let aggregateError: unknown;

        try {
            await container.dispose();
        } catch (error) {
            aggregateError = error;
        }

        expect(aggregateError).toBeInstanceOf(AggregateError);
        expect((aggregateError as AggregateError).errors).toEqual([disposeError]);
        expect(container.disposed).toBe(true);

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(() => savedDependencyRef.value).toThrowError("Container has been disposed");
        expect(dependencyFactory).toHaveBeenCalledTimes(1);
    });

    it("flattens AggregateError thrown by a direct disposer", async () => {
        const firstError = new Error("first nested dispose failed");
        const secondError = new Error("second nested dispose failed");
        const disposeError = new AggregateError([firstError, secondError], "nested dispose failures");
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: () => {
                    throw disposeError;
                },
            }),
        );

        container.resolve(tokens.service);

        let aggregateError: unknown;

        try {
            await container.dispose();
        } catch (error) {
            aggregateError = error;
        }

        expect(aggregateError).toBeInstanceOf(AggregateError);
        expect((aggregateError as AggregateError).errors).toEqual([firstError, secondError]);
    });

    it("flattens failed child scope disposal errors while still disposing parent instances", async () => {
        const calls: string[] = [];
        const firstError = new Error("first child dispose failed");
        const secondError = new Error("second child dispose failed");
        const tokens = {
            firstChild: token("firstChild").of<{ readonly name: "first" }>(),
            secondChild: token("secondChild").of<{ readonly name: "second" }>(),
            root: token("root").of<{ readonly name: "root" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.root, () => ({ name: "root" }), {
                dispose: () => calls.push("root"),
            }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.firstChild, () => ({ name: "first" }), {
                dispose: () => {
                    calls.push("firstChild");
                    throw firstError;
                },
            }),
            bind.scoped(tokens.secondChild, () => ({ name: "second" }), {
                dispose: () => {
                    calls.push("secondChild");
                    throw secondError;
                },
            }),
        );

        container.resolve(tokens.root);
        childScope.resolve(tokens.firstChild);
        childScope.resolve(tokens.secondChild);

        let disposeError: unknown;

        try {
            await container.dispose();
        } catch (error) {
            disposeError = error;
        }

        expect(disposeError).toBeInstanceOf(AggregateError);
        expect((disposeError as AggregateError).errors).toEqual([secondError, firstError]);
        expect(calls).toEqual(["secondChild", "firstChild", "root"]);
        expect(container.disposed).toBe(true);
        expect(childScope.disposed).toBe(true);
    });

    it("resolves repeated dispose calls as no-ops while a disposer is active", async () => {
        const disposeStarted = vi.fn();
        const disposeFinished = vi.fn();
        const disposeDeferred = createDeferred();
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    disposeStarted();
                    await disposeDeferred.promise;
                    disposeFinished();
                },
            }),
        );

        container.resolve(tokens.service);

        const firstDispose = container.dispose();
        const secondDispose = container.dispose();

        expect(secondDispose).not.toBe(firstDispose);
        expect(disposeStarted).toHaveBeenCalledTimes(1);
        expect(disposeFinished).not.toHaveBeenCalled();

        await expect(secondDispose).resolves.toBeUndefined();

        disposeDeferred.resolve();

        await expect(firstDispose).resolves.toBeUndefined();
        expect(disposeFinished).toHaveBeenCalledTimes(1);
    });

    it("returns the in-flight dispose promise before disposal enters a disposer", async () => {
        let firstDisposePromise: Promise<void> | undefined;
        let secondDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        let disposeContainer = () => Promise.resolve();
        const container = createContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                () => {
                    firstDisposePromise = disposeContainer();
                    secondDisposePromise = disposeContainer();
                    events.push("factory");

                    return { name: "service" };
                },
                {
                    dispose: () => events.push("service"),
                },
            ),
        );
        disposeContainer = () => container.dispose();

        expect(container.resolve(tokens.service)).toEqual({ name: "service" });
        expect(secondDisposePromise).toBe(firstDisposePromise);

        await expect(firstDisposePromise as Promise<void>).resolves.toBeUndefined();
        expect(events).toEqual(["factory", "service"]);
    });

    it("resolves synchronous reentrant dispose calls as no-ops", async () => {
        let reentrantDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        let disposeContainer = () => Promise.resolve();
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: () => {
                    reentrantDisposePromise = disposeContainer();
                    events.push("service");

                    return reentrantDisposePromise;
                },
            }),
        );
        disposeContainer = () => container.dispose();

        container.resolve(tokens.service);

        const disposePromise = container.dispose();

        expect(reentrantDisposePromise).toBeDefined();
        expect(reentrantDisposePromise).not.toBe(disposePromise);

        await expect(reentrantDisposePromise as Promise<void>).resolves.toBeUndefined();
        await expect(disposePromise).resolves.toBeUndefined();
        expect(events).toEqual(["service"]);
    });

    it("resolves awaited same-scope reentrant dispose calls as no-ops", async () => {
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        let disposeContainer = () => Promise.resolve();
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    events.push("before");
                    await disposeContainer();
                    events.push("after");
                },
            }),
        );
        disposeContainer = () => container.dispose();

        container.resolve(tokens.service);

        await expect(container.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["before", "after"]);
    });

    it("keeps same-scope reentrant disposal active after awaited disposer work", async () => {
        let reentrantDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        let disposeContainer = () => Promise.resolve();
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    events.push("before");
                    await Promise.resolve();
                    reentrantDisposePromise = disposeContainer();
                    await reentrantDisposePromise;
                    events.push("after");
                },
            }),
        );
        disposeContainer = () => container.dispose();

        container.resolve(tokens.service);

        const disposeResult = await Promise.race([
            container.dispose().then(() => "settled" as const),
            new Promise<"timeout">((resolve) => {
                setTimeout(() => resolve("timeout"), 50);
            }),
        ]);

        expect(disposeResult).toBe("settled");
        await expect(reentrantDisposePromise as Promise<void>).resolves.toBeUndefined();
        expect(events).toEqual(["before", "after"]);
    });

    it("resolves reentrant parent dispose calls from child disposers during parent cascade", async () => {
        let reentrantParentDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            child: token("child").of<{ readonly name: "child" }>(),
            root: token("root").of<{ readonly name: "root" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.root, () => ({ name: "root" }), {
                dispose: () => events.push("root"),
            }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.child, () => ({ name: "child" }), {
                dispose: () => {
                    events.push("child");
                    reentrantParentDisposePromise = container.dispose();

                    return reentrantParentDisposePromise;
                },
            }),
        );

        container.resolve(tokens.root);
        childScope.resolve(tokens.child);

        const disposePromise = container.dispose();

        expect(reentrantParentDisposePromise).toBeDefined();
        expect(reentrantParentDisposePromise).not.toBe(disposePromise);

        await expect(disposePromise).resolves.toBeUndefined();
        await expect(reentrantParentDisposePromise as Promise<void>).resolves.toBeUndefined();
        expect(events).toEqual(["child", "root"]);
        expect(container.disposed).toBe(true);
        expect(childScope.disposed).toBe(true);
    });

    it("keeps ancestor reentrant disposal active after awaited child disposer work", async () => {
        let reentrantParentDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            child: token("child").of<{ readonly name: "child" }>(),
            root: token("root").of<{ readonly name: "root" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.root, () => ({ name: "root" }), {
                dispose: () => events.push("root"),
            }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.child, () => ({ name: "child" }), {
                dispose: async () => {
                    events.push("child:before");
                    await Promise.resolve();
                    reentrantParentDisposePromise = container.dispose();
                    await reentrantParentDisposePromise;
                    events.push("child:after");
                },
            }),
        );

        container.resolve(tokens.root);
        childScope.resolve(tokens.child);

        const disposeResult = await Promise.race([
            container.dispose().then(() => "settled" as const),
            new Promise<"timeout">((resolve) => {
                setTimeout(() => resolve("timeout"), 50);
            }),
        ]);

        expect(disposeResult).toBe("settled");
        await expect(reentrantParentDisposePromise as Promise<void>).resolves.toBeUndefined();
        expect(events).toEqual(["child:before", "child:after", "root"]);
        expect(container.disposed).toBe(true);
        expect(childScope.disposed).toBe(true);
    });

    it("resolves parent disposal from child disposers that cascade back into the in-flight child", async () => {
        const events: string[] = [];
        const tokens = {
            child: token("child").of<{ readonly name: "child" }>(),
            root: token("root").of<{ readonly name: "root" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind.scoped(tokens.root, () => ({ name: "root" }), {
                dispose: () => events.push("root"),
            }),
        );
        const childScope = container.createScope(
            bind.scoped(tokens.child, () => ({ name: "child" }), {
                dispose: () => {
                    events.push("child");

                    return container.dispose();
                },
            }),
        );

        container.resolve(tokens.root);
        childScope.resolve(tokens.child);

        await expect(childScope.dispose()).resolves.toBeUndefined();
        expect(events).toEqual(["child", "root"]);
        expect(container.disposed).toBe(true);
        expect(childScope.disposed).toBe(true);
    });

    it("keeps unrelated in-flight dispose calls awaitable from active disposers", async () => {
        const otherDisposeDeferred = createDeferred();
        let nestedOtherDisposePromise: Promise<void> | undefined;
        const events: string[] = [];
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        const otherContainer = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    events.push("other:start");
                    await otherDisposeDeferred.promise;
                    events.push("other:end");
                },
            }),
        );
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    events.push("current:start");
                    nestedOtherDisposePromise = otherContainer.dispose();
                    otherDisposeDeferred.resolve();
                    await nestedOtherDisposePromise;
                    events.push("current:end");
                },
            }),
        );

        otherContainer.resolve(tokens.service);
        container.resolve(tokens.service);

        const otherDisposePromise = otherContainer.dispose();

        await expect(container.dispose()).resolves.toBeUndefined();
        await expect(otherDisposePromise).resolves.toBeUndefined();
        expect(nestedOtherDisposePromise).toBe(otherDisposePromise);
        expect(events).toEqual(["other:start", "current:start", "other:end", "current:end"]);
    });

    it("marks the container disposed and blocks public APIs during in-flight disposal", async () => {
        const disposeStarted = vi.fn();
        const disposeFinished = vi.fn();
        const disposeDeferred = createDeferred();
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.service, () => ({ name: "service" }), {
                dispose: async () => {
                    disposeStarted();
                    await disposeDeferred.promise;
                    disposeFinished();
                },
            }),
        );

        container.resolve(tokens.service);

        const disposePromise = container.dispose();

        expect(container.disposed).toBe(true);
        expect(disposeStarted).toHaveBeenCalledTimes(1);
        expect(disposeFinished).not.toHaveBeenCalled();
        expect(() => container.resolve(tokens.service)).toThrowError("Container has been disposed");
        expect(() => container.createScope()).toThrowError("Container has been disposed");

        disposeDeferred.resolve();

        await expect(disposePromise).resolves.toBeUndefined();
        expect(disposeFinished).toHaveBeenCalledTimes(1);
    });

    it("creates independent ref instances for sibling scopes", () => {
        type Service = {
            readonly configRef: object;
            readonly getConfig: () => { readonly name: string };
        };
        const tokens = {
            config: token("config").of<{ readonly name: string }>(),
            service: token("service").of<Service>(),
        };
        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            firstLogger: token("firstLogger").of<{ readonly name: "first" }>(),
            secondLogger: token("secondLogger").of<{ readonly name: "second" }>(),
            service: token("service").of<{
                readonly getLogger: () => { readonly name: "first" } | { readonly name: "second" };
            }>(),
        };
        let selectedToken: typeof tokens.firstLogger | typeof tokens.secondLogger = tokens.firstLogger;
        const resolveToken = vi.fn(() => selectedToken);
        const container = createContainer(
            Object.values(tokens),
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

    it("throws when a binding token is not in the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;

        expect(() =>
            createRuntimeContainer(
                Object.values(tokens),
                bind(externalToken, () => 3000),
            ),
        ).toThrowError('Token "external" is not included in the token list');
    });

    it("throws when an eager dependency token is not in the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;

        expect(() =>
            createRuntimeContainer(
                Object.values(tokens),
                bind(tokens.port, { external: externalToken }, ({ external }) => external),
            ),
        ).toThrowError('Token "external" is not included in the token list');
    });

    it("throws when an eager dependency token is listed but has no binding", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            server: token("server").of<{ readonly port: number }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
        );

        expect(() => container.resolve(tokens.server)).toThrowError(
            'Service "config" is not registered in the container',
        );
    });

    it("throws when a ref dependency resolves to a token outside the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.port, { external: ref(() => externalToken) }, ({ external }) => external.value),
        );

        expect(() => container.resolve(tokens.port)).toThrowError('Token "external" is not included in the token list');
    });

    it("throws when a ref dependency target is listed but has no binding", () => {
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.service, { logger: ref(tokens.logger) }, ({ logger }) => ({
                getLogger: () => logger.value,
            })),
        );

        const service = container.resolve(tokens.service) as {
            readonly getLogger: () => { readonly log: (message: string) => void };
        };

        expect(() => service.getLogger()).toThrowError('Service "logger" is not registered in the container');
    });

    it("throws when a disposable ref dependency target is listed but has no binding", () => {
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind(
                tokens.service,
                { logger: ref(tokens.logger) },
                ({ logger }) => ({
                    getLogger: () => logger.value,
                }),
                {
                    dispose: vi.fn(),
                },
            ),
        );

        const service = container.resolve(tokens.service) as {
            readonly getLogger: () => { readonly log: (message: string) => void };
        };

        expect(() => service.getLogger()).toThrowError('Service "logger" is not registered in the container');
    });

    it("throws when a listed token has no binding", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
        };
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.config, () => ({ port: 3000 })),
        );

        expect(() => (container as RuntimeContainerForTest).resolve(tokens.logger)).toThrowError(
            'Service "logger" is not registered in the container',
        );
    });

    it("throws when resolving a token outside the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;
        const container = createContainer(
            Object.values(tokens),
            bind(tokens.port, () => 3000),
        );

        expect(() => (container as RuntimeContainerForTest).resolve(externalToken)).toThrowError(
            'Token "external" is not included in the token list',
        );
    });

    it("throws when the same service is registered twice", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(() =>
            createContainer(
                Object.values(tokens),
                bind(tokens.port, () => 3000),
                bind(tokens.port, () => 4000),
            ),
        ).toThrowError('Service "port" is already registered in the container');
    });

    it("throws when the same service is registered twice in a child scope", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const container = createRuntimeContainer(Object.values(tokens));

        expect(() =>
            container.createScope(
                bind(tokens.port, () => 3000),
                bind(tokens.port, () => 4000),
            ),
        ).toThrowError('Service "port" is already registered in the container');
    });

    it("throws when a child scope binding was not created with bind", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const container = createRuntimeContainer(Object.values(tokens));

        expect(() =>
            container.createScope({
                token: tokens.port,
                factory: () => 3000,
            }),
        ).toThrowError("Bindings must be created with bind");
    });

    it("throws when a child scope binding token is not in the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(Object.values(tokens));

        expect(() => container.createScope(bind(externalToken, () => 3000))).toThrowError(
            'Token "external" is not included in the token list',
        );
    });

    it("throws when a child scope eager dependency token is not in the token list", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const externalToken = "external" as Token<"external", number>;
        const container = createRuntimeContainer(Object.values(tokens));

        expect(() =>
            container.createScope(bind(tokens.port, { external: externalToken }, ({ external }) => external)),
        ).toThrowError('Token "external" is not included in the token list');
    });

    it("throws when a child scope service depends on a listed token without a visible binding", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            server: token("server").of<{ readonly port: number }>(),
        };
        const container = createRuntimeContainer(Object.values(tokens));
        const childScope = container.createScope(
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
        );

        expect(() => childScope.resolve(tokens.server)).toThrowError(
            'Service "config" is not registered in the container',
        );
    });

    it("throws when child scope overrides create an eager circular dependency", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: "a" }>(),
            serviceB: token("serviceB").of<{ readonly name: "b" }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );

        expect(() =>
            container.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when child scope overrides create a cycle through a transient parent binding", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: "a" }>(),
            serviceB: token("serviceB").of<{ readonly name: "b" }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind.transient(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );

        expect(() =>
            container.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when nested scope overrides create an eager circular dependency", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: "a" }>(),
            serviceB: token("serviceB").of<{ readonly name: "b" }>(),
        };
        const container = createRuntimeContainer(
            Object.values(tokens),
            bind.scoped(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
            bind.scoped(tokens.serviceB, () => ({ name: "b" })),
        );
        const childScope = container.createScope();

        expect(() =>
            childScope.createScope(bind.scoped(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" }))),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when an eager dependency depends on itself during registration", () => {
        const tokens = {
            service: token("service").of<{ readonly name: "service" }>(),
        };

        expect(() =>
            createRuntimeContainer(
                Object.values(tokens),
                bind(tokens.service, { service: tokens.service }, () => ({ name: "service" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: service -> service");
    });

    it("throws when eager dependencies are circular during registration", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: "a" }>(),
            serviceB: token("serviceB").of<{ readonly name: "b" }>(),
        };

        expect(() =>
            createRuntimeContainer(
                Object.values(tokens),
                bind(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
                bind(tokens.serviceB, { serviceA: tokens.serviceA }, () => ({ name: "b" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: serviceA -> serviceB -> serviceA");
    });

    it("throws when eager dependencies form a long cycle during registration", () => {
        const tokens = {
            serviceA: token("serviceA").of<{ readonly name: "a" }>(),
            serviceB: token("serviceB").of<{ readonly name: "b" }>(),
            serviceC: token("serviceC").of<{ readonly name: "c" }>(),
        };

        expect(() =>
            createRuntimeContainer(
                Object.values(tokens),
                bind(tokens.serviceA, { serviceB: tokens.serviceB }, () => ({ name: "a" })),
                bind(tokens.serviceB, { serviceC: tokens.serviceC }, () => ({ name: "b" })),
                bind(tokens.serviceC, { serviceA: tokens.serviceA }, () => ({ name: "c" })),
            ),
        ).toThrowError(
            "Circular dependency detected while registering services: serviceA -> serviceB -> serviceC -> serviceA",
        );
    });

    it("throws when a binding was not created with bind", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(() =>
            createRuntimeContainer(Object.values(tokens), {
                token: tokens.port,
                factory: () => 3000,
            }),
        ).toThrowError("Bindings must be created with bind");
    });

    it("throws when bind receives a non-function dispose option at runtime", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(() => bind(tokens.port, () => 3000, { dispose: "not a function" } as never)).toThrowError(
            "Dispose option must be a function",
        );
        expect(() => bind(tokens.port, {}, () => 3000, { dispose: "not a function" } as never)).toThrowError(
            "Dispose option must be a function",
        );
    });

    it("throws when a registered binding has a non-function dispose value", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const binding = bind(tokens.port, () => 3000);

        (binding as { dispose?: unknown }).dispose = "not a function";

        expect(() => createRuntimeContainer(Object.values(tokens), binding)).toThrowError(
            "Dispose option must be a function",
        );
    });

    it("throws when a service resolves itself recursively", () => {
        const tokens = {
            service: token("service").of<unknown>(),
        };
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.service, () => container.resolve(tokens.service)),
        );

        expect(() => container.resolve(tokens.service)).toThrowError(
            "Circular dependency detected while resolving services: service -> service",
        );
    });

    it("throws when services resolve each other recursively", () => {
        const tokens = {
            serviceA: token("serviceA").of<unknown>(),
            serviceB: token("serviceB").of<unknown>(),
        };
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.serviceA, () => container.resolve(tokens.serviceB)),
            bind(tokens.serviceB, () => container.resolve(tokens.serviceA)),
        );

        expect(() => container.resolve(tokens.serviceA)).toThrowError(
            "Circular dependency detected while resolving services: serviceA -> serviceB -> serviceA",
        );
    });

    it("throws when services form a long recursive resolution cycle", () => {
        const tokens = {
            serviceA: token("serviceA").of<unknown>(),
            serviceB: token("serviceB").of<unknown>(),
            serviceC: token("serviceC").of<unknown>(),
        };
        let container: RuntimeContainerForTest;

        container = createRuntimeContainer(
            Object.values(tokens),
            bind(tokens.serviceA, () => container.resolve(tokens.serviceB)),
            bind(tokens.serviceB, () => container.resolve(tokens.serviceC)),
            bind(tokens.serviceC, () => container.resolve(tokens.serviceA)),
        );

        expect(() => container.resolve(tokens.serviceA)).toThrowError(
            "Circular dependency detected while resolving services: serviceA -> serviceB -> serviceC -> serviceA",
        );
    });

    it("resolves ref token factories lazily and uses the token selected at service initialization time", () => {
        const tokens = {
            firstLogger: token("firstLogger").of<{ readonly name: "first" }>(),
            secondLogger: token("secondLogger").of<{ readonly name: "second" }>(),
            service: token("service").of<{
                readonly getLogger: () => { readonly name: "first" } | { readonly name: "second" };
            }>(),
        };
        const firstLogger = { name: "first" as const };
        const secondLogger = { name: "second" as const };
        const firstLoggerFactory = vi.fn(() => firstLogger);
        const secondLoggerFactory = vi.fn(() => secondLogger);
        let selectedToken: typeof tokens.firstLogger | typeof tokens.secondLogger = tokens.firstLogger;
        const resolveToken = vi.fn(() => selectedToken);

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{ readonly getLogger: () => { readonly log: (message: string) => void } }>(),
        };
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            logger: token("logger").of<{ readonly id: number }>(),
            service: token("service").of<{ readonly getLogger: () => { readonly id: number } }>(),
        };
        let nextLoggerId = 1;
        const loggerFactory = vi.fn(() => ({ id: nextLoggerId++ }));

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            service: token("service").of<{
                readonly getLogger: () => { readonly log: (message: string) => void };
                readonly hasSharedLoggerRef: boolean;
            }>(),
        };
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            serviceA: token("serviceA").of<ServiceA>(),
            serviceB: token("serviceB").of<ServiceB>(),
        };

        const container = createContainer(
            Object.values(tokens),
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
        const tokens = {
            serviceA: token("serviceA").of<ServiceA>(),
            serviceB: token("serviceB").of<ServiceB>(),
        };
        const container = createContainer(
            Object.values(tokens),
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
