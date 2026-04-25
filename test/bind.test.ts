import { describe, expect, it } from "vitest";

import { bind, getBindingDependencies } from "../src/bind";
import { bindingDependenciesBrand } from "../src/brands";
import { defineTokens } from "../src/token";
import { type as defineType } from "../src/type-descriptor";

describe("bind", () => {
    it("creates a binding without dependencies", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const factory = () => 3000;

        const binding = bind(tokens.port, factory);

        expect(binding.token).toBe(tokens.port);
        expect(binding.factory).toBe(factory);
        expect(binding.factory()).toBe(3000);
        expect(getBindingDependencies(binding)).toBeUndefined();
        expect(Object.hasOwn(binding, bindingDependenciesBrand)).toBe(false);
    });

    it("creates a binding with dependencies", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            port: defineType<number>(),
        });
        const dependencies = {
            config: tokens.config,
        };
        const factory = ({ config }: { readonly config: { readonly port: number } }) => config.port;

        const binding = bind(tokens.port, dependencies, factory);

        expect(binding.token).toBe(tokens.port);
        expect(binding.factory).toBe(factory);
        expect(binding.factory({ config: { port: 3000 } })).toBe(3000);
        expect(getBindingDependencies(binding)).toBe(dependencies);
        expect(binding[bindingDependenciesBrand]).toBe(dependencies);
    });

    it("throws when dependencies are provided without a factory", () => {
        const tokens = defineTokens({
            port: defineType<number>(),
        });
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
        const tokens = defineTokens({
            port: defineType<number>(),
        });
        const binding = {
            token: tokens.port,
            factory: () => 3000,
        };

        expect(getBindingDependencies(binding)).toBeUndefined();
    });

    it("returns dependencies from the binding brand", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            port: defineType<number>(),
        });
        const dependencies = {
            config: tokens.config,
        };
        const binding = {
            token: tokens.port,
            [bindingDependenciesBrand]: dependencies,
            factory: () => 3000,
        };

        expect(getBindingDependencies(binding)).toBe(dependencies);
    });

    it("returns dependencies when the binding brand is inherited", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            port: defineType<number>(),
        });
        const dependencies = {
            config: tokens.config,
        };
        const binding = Object.assign(Object.create({ [bindingDependenciesBrand]: dependencies }), {
            token: tokens.port,
            factory: () => 3000,
        });

        expect(getBindingDependencies(binding)).toBe(dependencies);
    });
});
