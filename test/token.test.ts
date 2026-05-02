import { describe, expect, it } from "vitest";
import { isRuntimeMultiToken, qualified, qualifier, type Token, token, tokenKey } from "../src/token";

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

    it("returns stable keys for qualified single tokens", () => {
        const Logger = token("Logger").of<{ readonly name: string }>();
        const Json = qualifier("json");
        const Human = qualifier("human");
        const JsonLogger = qualified(Logger, Json);
        const HumanLogger = qualified(Logger, Human);

        expect(tokenKey(JsonLogger)).toBe("Logger:json");
        expect(tokenKey(HumanLogger)).toBe("Logger:human");
        expect(JsonLogger).not.toBe(HumanLogger);
        expect(isRuntimeMultiToken(JsonLogger)).toBe(false);
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
