import { describe, expect, it, vi } from "vitest";
import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "../src/binding/brands";
import { getBindingDependencies, getBindingLifetime, isBinding } from "../src/binding/types";
import { bind, defineContainer, token } from "../src/index";

describe("bind", () => {
    it("creates a binding without dependencies", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const factory = () => 3000;

        const binding = bind(tokens.port, factory);

        expect(binding.token).toBe(tokens.port);
        expect(binding.factory).toBe(factory);
        expect(binding.factory()).toBe(3000);
        expect(isBinding(binding)).toBe(true);
        expect(Object.hasOwn(binding, bindingBrand)).toBe(true);
        expect(Object.hasOwn(binding, bindingLifetimeBrand)).toBe(true);
        expect(getBindingLifetime(binding)).toBe("singleton");
        expect(getBindingDependencies(binding)).toBeUndefined();
        expect(Object.hasOwn(binding, bindingDependenciesBrand)).toBe(false);
    });

    it("creates a binding with dependencies", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dependencies = {
            config: tokens.config,
        };
        const factory = ({ config }: { readonly config: { readonly port: number } }) => config.port;

        const binding = bind(tokens.port, dependencies, factory);

        expect(binding.token).toBe(tokens.port);
        expect(binding.factory).toBe(factory);
        expect(binding.factory({ config: { port: 3000 } })).toBe(3000);
        expect(isBinding(binding)).toBe(true);
        expect(Object.hasOwn(binding, bindingBrand)).toBe(true);
        expect(getBindingLifetime(binding)).toBe("singleton");
        expect(getBindingDependencies(binding)).toBe(dependencies);
        expect(binding[bindingDependenciesBrand]).toBe(dependencies);
    });

    it("creates explicit singleton, scoped, and transient bindings", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(getBindingLifetime(bind.singleton(tokens.port, () => 3000))).toBe("singleton");
        expect(getBindingLifetime(bind.scoped(tokens.port, () => 3000))).toBe("scoped");
        expect(getBindingLifetime(bind.transient(tokens.port, () => 3000))).toBe("transient");
    });

    it("creates factory provider bindings", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dependencies = {
            config: tokens.config,
        };
        const factory = ({ config }: { readonly config: { readonly port: number } }) => config.port;

        const binding = bind.factory(tokens.port, dependencies, factory);

        expect(binding.token).toBe(tokens.port);
        expect(binding.factory).toBe(factory);
        expect(binding.factory({ config: { port: 3000 } })).toBe(3000);
        expect(getBindingLifetime(binding)).toBe("singleton");
        expect(getBindingDependencies(binding)).toBe(dependencies);
    });

    it("creates value provider bindings for direct values", () => {
        const tokens = {
            empty: token("empty").of<undefined>(),
            handler: token("handler").of<(message: string) => number>(),
            port: token("port").of<number>(),
        };
        const handler = vi.fn((message: string) => message.length);
        const dispose = vi.fn();

        const portBinding = bind.value(tokens.port, 3000, { dispose });
        const handlerBinding = bind.value(tokens.handler, handler);
        const emptyBinding = bind.value(tokens.empty, undefined);

        expect(portBinding.factory()).toBe(3000);
        expect(portBinding.dispose).toBe(dispose);
        expect(handlerBinding.factory()).toBe(handler);
        expect(handlerBinding.factory()("ready")).toBe(5);
        expect(emptyBinding.factory()).toBeUndefined();
        expect(getBindingDependencies(portBinding)).toBeUndefined();
    });

    it("creates class provider bindings without dependencies", () => {
        const Service = token("Service").of<{ readonly status: string }>();

        class ServiceImpl {
            readonly status = "ready";
        }

        const binding = bind.class(Service, ServiceImpl);
        const instance = binding.factory();

        expect(instance).toBeInstanceOf(ServiceImpl);
        expect(instance.status).toBe("ready");
        expect(getBindingLifetime(binding)).toBe("singleton");
        expect(getBindingDependencies(binding)).toBeUndefined();
    });

    it("creates class provider bindings with dependencies", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            server: token("server").of<{ readonly port: number }>(),
        };
        const dependencies = { config: tokens.config };

        class ServerImpl {
            constructor(private readonly services: { readonly config: { readonly port: number } }) {}

            get port(): number {
                return this.services.config.port;
            }
        }

        const binding = bind.class(tokens.server, dependencies, ServerImpl);
        const instance = binding.factory({ config: { port: 3000 } });

        expect(instance).toBeInstanceOf(ServerImpl);
        expect(instance.port).toBe(3000);
        expect(getBindingDependencies(binding)).toBe(dependencies);
    });

    it("creates alias provider bindings", () => {
        const tokens = {
            logger: token("logger").of<{ readonly log: (message: string) => void }>(),
            consoleLogger: token("consoleLogger").of<{ readonly log: (message: string) => void }>(),
        };
        const logger = { log: vi.fn() };

        const binding = bind.alias(tokens.logger, tokens.consoleLogger);
        const useExistingBinding = bind.useExisting(tokens.logger, tokens.consoleLogger);
        const singletonBinding = bind.singleton.alias(tokens.logger, tokens.consoleLogger);

        expect(binding.factory({ existing: logger })).toBe(logger);
        expect(useExistingBinding.factory({ existing: logger })).toBe(logger);
        expect(getBindingDependencies(binding)).toEqual({ existing: tokens.consoleLogger });
        expect(getBindingLifetime(binding)).toBe("transient");
        expect(getBindingLifetime(useExistingBinding)).toBe("transient");
        expect(getBindingLifetime(singletonBinding)).toBe("singleton");
    });

    it("resolves aliases through the existing token lifetime", () => {
        const tokens = {
            alias: token("alias").of<{ readonly id: number }>(),
            scoped: token("scoped").of<{ readonly id: number }>(),
            transient: token("transient").of<{ readonly id: number }>(),
        };
        let nextId = 1;
        const container = defineContainer(
            Object.values(tokens),
            bind.transient(tokens.transient, () => ({ id: nextId++ })),
            bind.scoped(tokens.scoped, () => ({ id: nextId++ })),
            bind.alias(tokens.alias, tokens.transient),
        ).create();

        expect(container.resolve(tokens.alias)).toEqual({ id: 1 });
        expect(container.resolve(tokens.alias)).toEqual({ id: 2 });

        const scopedAliasContainer = defineContainer(
            Object.values(tokens),
            bind.scoped(tokens.scoped, () => ({ id: nextId++ })),
            bind.alias(tokens.alias, tokens.scoped),
        ).create();
        const firstScope = scopedAliasContainer.createScope();
        const secondScope = scopedAliasContainer.createScope();

        expect(firstScope.resolve(tokens.alias)).toBe(firstScope.resolve(tokens.alias));
        expect(secondScope.resolve(tokens.alias)).not.toBe(firstScope.resolve(tokens.alias));
    });

    it("stores dispose options for bindings without dependencies", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const dispose = vi.fn();

        const binding = bind(tokens.port, () => 3000, { dispose });

        expect(binding.dispose).toBe(dispose);
    });

    it("stores dispose options for bindings with dependencies", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dispose = vi.fn();

        const binding = bind(tokens.port, { config: tokens.config }, ({ config }) => config.port, { dispose });

        expect(binding.dispose).toBe(dispose);
    });

    it("accepts options without dispose for bindings", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };

        const bindingWithoutDependencies = bind(tokens.port, () => 3000, {});
        const bindingWithDependencies = bind(tokens.port, { config: tokens.config }, ({ config }) => config.port, {});

        expect(bindingWithoutDependencies.dispose).toBeUndefined();
        expect(bindingWithDependencies.dispose).toBeUndefined();
    });

    it("throws when binding options are not objects at runtime", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(() => bind(tokens.port, () => 3000, null as never)).toThrowError("Binding options must be an object");
        expect(() => bind(tokens.port, () => 3000, "not options" as never)).toThrowError(
            "Binding options must be an object",
        );
        expect(() => bind(tokens.port, {}, () => 3000, null as never)).toThrowError(
            "Binding options must be an object",
        );
        expect(() => bind(tokens.port, {}, () => 3000, "not options" as never)).toThrowError(
            "Binding options must be an object",
        );
        expect(() => bind.value(tokens.port, 3000, null as never)).toThrowError("Binding options must be an object");
        expect(() => bind.class(tokens.port, class Port {}, "not options" as never)).toThrowError(
            "Binding options must be an object",
        );
        expect(() => bind.class(tokens.port, {}, class Port {}, null as never)).toThrowError(
            "Binding options must be an object",
        );
    });

    it("throws when dependencies are provided without a factory", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const bindWithoutFactory = bind as unknown as (
            token: typeof tokens.port,
            dependencies: Record<string, never>,
        ) => unknown;

        expect(() => bindWithoutFactory(tokens.port, {})).toThrowError(
            "Factory is required when dependencies are provided",
        );
    });

    it("throws when class bindings are missing a constructor at runtime", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const bindClass = bind.class as unknown as (
            token: typeof tokens.port,
            dependenciesOrClass: unknown,
            serviceClass?: unknown,
        ) => unknown;

        expect(() => bindClass(tokens.port, "not class")).toThrowError("Class constructor must be a function");
        expect(() => bindClass(tokens.port, {})).toThrowError(
            "Class constructor is required when dependencies are provided",
        );
    });
});

describe("getBindingDependencies", () => {
    it("returns undefined for a binding without dependencies", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const binding = bind(tokens.port, () => 3000);

        expect(getBindingDependencies(binding)).toBeUndefined();
    });

    it("returns dependencies from the binding brand", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dependencies = {
            config: tokens.config,
        };
        const binding = bind(tokens.port, dependencies, () => 3000);

        expect(getBindingDependencies(binding)).toBe(dependencies);
    });

    it("ignores dependencies when the dependency brand is inherited", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dependencies = {
            config: tokens.config,
        };
        const binding = Object.assign(Object.create({ [bindingDependenciesBrand]: dependencies }), {
            [bindingBrand]: true as const,
            token: tokens.port,
            factory: () => 3000,
        });

        expect(getBindingDependencies(binding)).toBeUndefined();
    });
});

describe("isBinding", () => {
    it("rejects structural objects that were not created by bind", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(
            isBinding({
                token: tokens.port,
                factory: () => 3000,
            }),
        ).toBe(false);
    });

    it("rejects objects with inherited binding brands", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const binding = Object.assign(Object.create({ [bindingBrand]: true }), {
            token: tokens.port,
            factory: () => 3000,
        });

        expect(isBinding(binding)).toBe(false);
    });
});
