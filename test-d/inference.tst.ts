import {
    bind,
    defineTokens,
    type as defineType,
    type Ref,
    type RefToken,
    ref,
    type Token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

type Server = {
    readonly port: number;
};

const tokens = defineTokens({
    config: defineType<Config>(),
    logger: defineType<Logger>(),
    port: defineType<number>(),
    server: defineType<Server>(),
    unknown: defineType(),
});

test("defineTokens preserves literal token keys and value types", () => {
    expect(tokens.config).type.toBe<Token<"config", Config>>();
    expect(tokens.logger).type.toBe<Token<"logger", Logger>>();
    expect(tokens.unknown).type.toBe<Token<"unknown", unknown>>();
});

test("bind rejects factories returning values outside the token type", () => {
    expect(() => {
        bind(tokens.port, () => "3000");
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

test("ref rejects factories that do not return tokens", () => {
    expect(() => {
        ref(() => "logger");
    }).type.toRaiseError();
});
