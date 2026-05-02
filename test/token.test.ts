import { describe, expect, it } from "vitest";
import { bind } from "../src/bind";
import { defineContainer } from "../src/container";
import { ref } from "../src/ref";
import { isRuntimeMultiToken, multiToken, qualified, qualifier, type Token, token, tokenKey } from "../src/token";

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

    it("returns symbol keys for tokens created from symbols", () => {
        const configKey = Symbol("Config");
        const Config = token(configKey).of<{ readonly port: number }>();

        expect(tokenKey(Config)).toBe(configKey);
        expect(Config).toBe(configKey);
    });

    it("returns class keys for tokens created from classes", () => {
        class ConfigService {
            readonly port = 3000;
        }

        const Config = token(ConfigService).of();

        expect(tokenKey(Config)).toBe(ConfigService);
        expect(Config).toBe(ConfigService);
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

describe("symbol and class token keys", () => {
    it("resolves services registered with symbol tokens", () => {
        const configKey = Symbol("config");
        const Config = token(configKey).of<{ readonly port: number }>();
        const container = defineContainer(
            [Config],
            bind(Config, () => ({ port: 3000 })),
        ).create();

        expect(container.resolve(Config)).toEqual({ port: 3000 });
    });

    it("uses the class instance type as the default token value", () => {
        class Service {
            readonly status = "ready";
        }

        const ServiceToken = token(Service).of();
        const container = defineContainer([ServiceToken], bind.class(ServiceToken, Service)).create();

        expect(container.resolve(ServiceToken)).toBeInstanceOf(Service);
        expect(container.resolve(ServiceToken).status).toBe("ready");
    });

    it("treats class tokens passed to ref as direct tokens", () => {
        class Service {
            readonly name = "service";
        }

        const ServiceToken = token(Service).of();
        const Consumer = token("Consumer").of<{ readonly name: string }>();
        const container = defineContainer(
            [ServiceToken, Consumer],
            bind.class(ServiceToken, Service),
            bind(Consumer, { service: ref(ServiceToken) }, ({ service }) => ({ name: service.value.name })),
        ).create();

        expect(container.resolve(Consumer)).toEqual({ name: "service" });
    });

    it("keeps different classes with the same name distinct", () => {
        const FirstService = class Service {
            readonly id = "first";
        };
        const SecondService = class Service {
            readonly id = "second";
        };

        const First = token(FirstService).of();
        const Second = token(SecondService).of();
        const container = defineContainer(
            [First, Second],
            bind.class(First, FirstService),
            bind.class(Second, SecondService),
        ).create();

        expect(container.resolve(First).id).toBe("first");
        expect(container.resolve(Second).id).toBe("second");
    });

    it("keeps different classes with the same public shape distinct", () => {
        class FirstService {}
        class SecondService {}

        const First = token(FirstService).of();
        const Second = token(SecondService).of();
        const container = defineContainer(
            [First, Second],
            bind.class(First, FirstService),
            bind.class(Second, SecondService),
        ).create();

        expect(container.resolve(First)).toBeInstanceOf(FirstService);
        expect(container.resolve(Second)).toBeInstanceOf(SecondService);
    });

    it("supports multibind and qualified tokens from non-string keys", () => {
        class Logger {}

        const hookKey = Symbol("Hooks");
        const Hooks = multiToken(hookKey).of<{ readonly name: string }>();
        const LoggerToken = token(Logger).of<{ readonly name: string }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(LoggerToken, Json);
        const container = defineContainer(
            [Hooks, JsonLogger],
            bind(Hooks, () => ({ name: "first" })),
            bind(Hooks, () => ({ name: "second" })),
            bind.qualified(LoggerToken, Json, () => ({ name: "json" })),
        ).create();

        expect(tokenKey(Hooks)).toBe(hookKey);
        expect(tokenKey(JsonLogger)).toBe("Logger:json");
        expect(container.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
        expect(container.resolve(JsonLogger)).toEqual({ name: "json" });
    });

    it("keeps qualified tokens from same-name classes distinct", () => {
        const FirstLogger = class Logger {
            readonly id = "first";
        };
        const SecondLogger = class Logger {
            readonly id = "second";
        };

        const Json = qualifier("json");
        const FirstJsonLogger = qualified(token(FirstLogger).of(), Json);
        const SecondJsonLogger = qualified(token(SecondLogger).of(), Json);
        const container = defineContainer(
            [FirstJsonLogger, SecondJsonLogger],
            bind(FirstJsonLogger, () => new FirstLogger()),
            bind(SecondJsonLogger, () => new SecondLogger()),
        ).create();

        expect(tokenKey(FirstJsonLogger)).toBe("Logger:json");
        expect(tokenKey(SecondJsonLogger)).toBe("Logger:json");
        expect(container.resolve(FirstJsonLogger).id).toBe("first");
        expect(container.resolve(SecondJsonLogger).id).toBe("second");
    });

    it("keeps qualified tokens with delimiter collisions distinct", () => {
        const First = qualified(token("A:B").of<string>(), qualifier("C"));
        const Second = qualified(token("A").of<string>(), qualifier("B:C"));
        const container = defineContainer(
            [First, Second],
            bind(First, () => "first"),
            bind(Second, () => "second"),
        ).create();

        expect(tokenKey(First)).toBe("A:B:C");
        expect(tokenKey(Second)).toBe("A:B:C");
        expect(container.resolve(First)).toBe("first");
        expect(container.resolve(Second)).toBe("second");
    });
});
