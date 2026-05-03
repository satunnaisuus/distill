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

        const binding = bind(tokens.port).factory(factory);

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

        const binding = bind(tokens.port).factory(dependencies, factory);

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

        expect(
            getBindingLifetime(
                bind(tokens.port)
                    .singleton()
                    .factory(() => 3000),
            ),
        ).toBe("singleton");
        expect(
            getBindingLifetime(
                bind(tokens.port)
                    .scoped()
                    .factory(() => 3000),
            ),
        ).toBe("scoped");
        expect(
            getBindingLifetime(
                bind(tokens.port)
                    .transient()
                    .factory(() => 3000),
            ),
        ).toBe("transient");
    });

    it("allows lifetime and disposable methods before or after provider methods", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const dispose = vi.fn();

        const beforeProvider = bind(tokens.port)
            .disposable(dispose)
            .scoped()
            .factory(() => 3000);
        const afterProvider = bind(tokens.port)
            .factory(() => 3000)
            .disposable(dispose)
            .transient();
        const mixed = bind(tokens.port).singleton().disposable(dispose).value(3000);

        expect(getBindingLifetime(beforeProvider)).toBe("scoped");
        expect(beforeProvider.dispose).toBe(dispose);
        expect(getBindingLifetime(afterProvider)).toBe("transient");
        expect(afterProvider.dispose).toBe(dispose);
        expect(getBindingLifetime(mixed)).toBe("singleton");
        expect(mixed.dispose).toBe(dispose);
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

        const binding = bind(tokens.port).factory(dependencies, factory);

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

        const portBinding = bind(tokens.port).value(3000).disposable(dispose);
        const handlerBinding = bind(tokens.handler).value(handler);
        const emptyBinding = bind(tokens.empty).value(undefined);

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

        const binding = bind(Service).class(ServiceImpl);
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

        const binding = bind(tokens.server).class(dependencies, ServerImpl);
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

        const binding = bind(tokens.logger).alias(tokens.consoleLogger);
        const useExistingBinding = bind(tokens.logger).useExisting(tokens.consoleLogger);
        const singletonBinding = bind(tokens.logger).singleton().alias(tokens.consoleLogger);

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
            bind(tokens.transient)
                .transient()
                .factory(() => ({ id: nextId++ })),
            bind(tokens.scoped)
                .scoped()
                .factory(() => ({ id: nextId++ })),
            bind(tokens.alias).alias(tokens.transient),
        ).create();

        expect(container.resolve(tokens.alias)).toEqual({ id: 1 });
        expect(container.resolve(tokens.alias)).toEqual({ id: 2 });

        const scopedAliasContainer = defineContainer(
            Object.values(tokens),
            bind(tokens.scoped)
                .scoped()
                .factory(() => ({ id: nextId++ })),
            bind(tokens.alias).alias(tokens.scoped),
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

        const binding = bind(tokens.port)
            .factory(() => 3000)
            .disposable(dispose);

        expect(binding.dispose).toBe(dispose);
    });

    it("stores dispose options for bindings with dependencies", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };
        const dispose = vi.fn();

        const binding = bind(tokens.port)
            .factory({ config: tokens.config }, ({ config }) => config.port)
            .disposable(dispose);

        expect(binding.dispose).toBe(dispose);
    });

    it("accepts options without dispose for bindings", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            port: token("port").of<number>(),
        };

        const bindingWithoutDependencies = bind(tokens.port).factory(() => 3000);
        const bindingWithDependencies = bind(tokens.port).factory(
            { config: tokens.config },
            ({ config }) => config.port,
        );

        expect(bindingWithoutDependencies.dispose).toBeUndefined();
        expect(bindingWithDependencies.dispose).toBeUndefined();
    });

    it("throws when fluent providers receive option arguments at runtime", () => {
        const tokens = {
            port: token("port").of<number>(),
        };

        expect(() => bind(tokens.port).factory(() => 3000, null as never)).toThrowError(
            "Factory bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).factory(() => 3000, "not options" as never)).toThrowError(
            "Factory bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).factory({}, () => 3000, null as never)).toThrowError(
            "Factory bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).factory({}, () => 3000, "not options" as never)).toThrowError(
            "Factory bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).value(3000, null as never)).toThrowError(
            "Value bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).class(class Port {}, "not options" as never)).toThrowError(
            "Class bindings use .disposable(...) instead of options",
        );
        expect(() => bind(tokens.port).class({}, class Port {}, null as never)).toThrowError(
            "Class bindings use .disposable(...) instead of options",
        );
    });

    it("throws when dependencies are provided without a factory", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const bindWithoutFactory = bind(tokens.port).factory as unknown as (
            dependencies: Record<string, never>,
        ) => unknown;

        expect(() => bindWithoutFactory({})).toThrowError("Factory is required when dependencies are provided");
    });

    it("throws when class bindings are missing a constructor at runtime", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const bindClass = bind(tokens.port).class as unknown as (
            dependenciesOrClass: unknown,
            serviceClass?: unknown,
        ) => unknown;

        expect(() => bindClass("not class")).toThrowError("Class constructor must be a function");
        expect(() => bindClass({})).toThrowError("Class constructor is required when dependencies are provided");
    });
});

describe("getBindingDependencies", () => {
    it("returns undefined for a binding without dependencies", () => {
        const tokens = {
            port: token("port").of<number>(),
        };
        const binding = bind(tokens.port).factory(() => 3000);

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
        const binding = bind(tokens.port).factory(dependencies, () => 3000);

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
