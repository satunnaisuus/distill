import { describe, expect, it, vi } from "vitest";
import { bind, getBindingDependencies, getBindingLifetime, isBinding } from "../src/bind";
import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand } from "../src/brands";
import { token } from "../src/token";

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
