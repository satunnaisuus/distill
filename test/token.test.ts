import { describe, expect, it } from "vitest";
import { type Token, token, tokenKey } from "../src/token";

describe("tokenKey", () => {
    it("returns the key for a token created by token().of()", () => {
        const config = token("Config").of<{ readonly port: number }>();

        expect(tokenKey(config)).toBe("Config");
        expect(config).toBe("Config");
    });

    it("returns the key for tokens created by token().of()", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            logger: token("logger").of<{ log: (message: string) => void }>(),
        };

        expect(tokenKey(tokens.config)).toBe("config");
        expect(tokenKey(tokens.logger)).toBe("logger");
    });

    it("returns the literal key for a branded token", () => {
        const token = "feature-flags" as Token<"feature-flags", { readonly enabled: boolean }>;

        expect(tokenKey(token)).toBe("feature-flags");
    });
});

describe("token arrays", () => {
    it("creates an array from tokens", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
            logger: token("logger").of<{ log: (message: string) => void }>(),
        };

        expect(Object.values(tokens)).toEqual(["config", "logger"]);
        expect(tokens.config).toBe("config");
        expect(tokens.logger).toBe("logger");
    });

    it("supports an empty token array", () => {
        expect([]).toEqual([]);
    });
});
