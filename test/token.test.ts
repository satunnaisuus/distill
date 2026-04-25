import { describe, expect, it } from "vitest";

import { defineTokens, type Token, tokenKey } from "../src/token";
import { type as defineType } from "../src/type-descriptor";

describe("tokenKey", () => {
    it("returns the key for a defined token", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            logger: defineType<{ log: (message: string) => void }>(),
        });

        expect(tokenKey(tokens.config)).toBe("config");
        expect(tokenKey(tokens.logger)).toBe("logger");
    });

    it("returns the literal key for a branded token", () => {
        const token = "feature-flags" as Token<"feature-flags", { readonly enabled: boolean }>;

        expect(tokenKey(token)).toBe("feature-flags");
    });
});

describe("defineTokens", () => {
    it("creates a token registry from definition keys", () => {
        const tokens = defineTokens({
            config: defineType<{ readonly port: number }>(),
            logger: defineType<{ log: (message: string) => void }>(),
        });

        expect(tokens).toEqual({
            config: "config",
            logger: "logger",
        });
        expect(tokens.config).toBe("config");
        expect(tokens.logger).toBe("logger");
    });

    it("returns an empty registry for empty definitions", () => {
        expect(defineTokens({})).toEqual({});
    });

    it("uses own enumerable string definition keys", () => {
        const definitions = Object.create({
            inherited: defineType<string>(),
        }) as Record<string, ReturnType<typeof defineType>>;

        definitions.visible = defineType<number>();
        Object.defineProperty(definitions, "hidden", {
            enumerable: false,
            value: defineType<boolean>(),
        });

        expect(defineTokens(definitions)).toEqual({
            visible: "visible",
        });
    });
});
