import { bind, defineContainer, type Ref, type RefToken, ref, type Token, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger, Server } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("token list preserves literal token keys and value types", () => {
    expect(tokens.config).type.toBe<Token<"config", Config>>();
    expect(tokens.logger).type.toBe<Token<"logger", Logger>>();
    expect(tokens.unknown).type.toBe<Token<"unknown", unknown>>();
});

test("token and defineContainer preserve literal token keys and value types", () => {
    const Config = token("Config").of<Config>();
    const Logger = token("Logger").of<Logger>();
    const container = defineContainer(
        [Config, Logger],
        bind(Config, () => ({ port: 3000 })),
        bind(Logger, () => ({ log: () => {} })),
    ).create();

    expect(Config).type.toBe<Token<"Config", Config>>();
    expect(Logger).type.toBe<Token<"Logger", Logger>>();
    expect(container.resolve(Config)).type.toBe<Config>();
    expect(container.resolve(Logger)).type.toBe<Logger>();
});

test("bind and resolve preserve unknown service types", () => {
    const binding = bind(tokens.unknown, () => ({ port: 3000 }));
    const container = defineContainer(tokenList, binding).create();

    expect<ReturnType<typeof binding.factory>>().type.toBe<unknown>();
    expect(container.resolve(tokens.unknown)).type.toBe<unknown>();
});

test("bind rejects factories returning values outside the token type", () => {
    expect(() => {
        bind(tokens.port, () => "3000");
    }).type.toRaiseError();
});

test("bind rejects dependency factories returning values outside the token type", () => {
    expect(() => {
        bind(tokens.port, { config: tokens.config }, () => "3000");
    }).type.toRaiseError();
});

test("bind infers eager and ref dependency factory parameters", () => {
    const binding = bind(
        tokens.server,
        { config: tokens.config, logger: ref(tokens.logger), port: tokens.port },
        ({ config }) => ({
            port: config.port,
        }),
    );

    expect<Parameters<typeof binding.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof binding.factory>[0]["logger"]>().type.toBe<Ref<Logger>>();
    expect<Parameters<typeof binding.factory>[0]["port"]>().type.toBe<number>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Server>();
});

test("bind rejects incorrectly annotated eager dependency parameters", () => {
    expect(() => {
        bind(tokens.server, { config: tokens.config }, ({ config }: { readonly config: string }) => ({
            port: config.length,
        }));
    }).type.toRaiseError();
});

test("bind rejects dependency factories requiring undeclared dependency parameters", () => {
    expect(() => {
        bind(
            tokens.server,
            { config: tokens.config },
            ({ config }: { readonly config: Config; readonly logger: Logger }) => ({
                port: config.port,
            }),
        );
    }).type.toRaiseError();
});

test("bind rejects incorrectly annotated ref dependency parameters", () => {
    expect(() => {
        bind(tokens.server, { logger: ref(tokens.logger) }, ({ logger }: { readonly logger: Logger }) => {
            logger.log("ready");

            return {
                port: 3000,
            };
        });
    }).type.toRaiseError();
});

test("ref preserves direct and lazy token types", () => {
    expect(ref(tokens.logger)).type.toBe<RefToken<typeof tokens.logger>>();
    expect(ref(() => tokens.logger)).type.toBe<RefToken<typeof tokens.logger>>();
});

test("ref preserves union token value types", () => {
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const dependency = ref(() => selectedToken);
    const binding = bind(tokens.server, { dependency }, () => ({
        port: 3000,
    }));

    expect(dependency).type.toBe<RefToken<typeof tokens.config | typeof tokens.logger>>();
    expect(dependency.resolveToken()).type.toBe<typeof tokens.config | typeof tokens.logger>();
    expect<Parameters<typeof binding.factory>[0]["dependency"]>().type.toBe<Ref<Config | Logger>>();
});

test("ref preserves direct union token value types", () => {
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const dependency = ref(selectedToken);
    const binding = bind(tokens.server, { dependency }, () => ({
        port: 3000,
    }));

    expect(dependency).type.toBe<RefToken<typeof tokens.config | typeof tokens.logger>>();
    expect(dependency.resolveToken()).type.toBe<typeof tokens.config | typeof tokens.logger>();
    expect<Parameters<typeof binding.factory>[0]["dependency"]>().type.toBe<Ref<Config | Logger>>();
});

test("bind preserves mixed eager and ref union dependency parameters", () => {
    const condition = true as boolean;
    const dependency = condition ? tokens.config : ref(tokens.logger);
    const binding = bind(tokens.server, { dependency }, () => ({
        port: 3000,
    }));

    expect(dependency).type.toBe<typeof tokens.config | RefToken<typeof tokens.logger>>();
    expect<Parameters<typeof binding.factory>[0]["dependency"]>().type.toBe<Config | Ref<Logger>>();
});

test("ref rejects factories that do not return tokens", () => {
    expect(() => {
        ref(() => "logger");
    }).type.toRaiseError();
});
