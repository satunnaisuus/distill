import {
    type Binding,
    bind,
    type Container,
    createContainer,
    type DependencyMap,
    defineTokens,
    type as defineType,
    type Ref,
    type RefToken,
    type ResolvedDependencies,
    ref,
    type Token,
    type TokenDefinitions,
    type Tokens,
    type TypeDescriptor,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

type Handler = (message: string) => number;
type Counter = () => number;
type CallableHandler = {
    readonly kind: "callable";
    (message: string): number;
};
type Parser = {
    (input: string): number;
    (input: number): string;
};

class InjectableService {
    readonly status = "ready" as const;
}

const tokens = defineTokens({
    callableHandler: defineType<CallableHandler>(),
    config: defineType<Config>(),
    counter: defineType<Counter>(),
    handler: defineType<Handler>(),
    logger: defineType<Logger>(),
    parser: defineType<Parser>(),
    port: defineType<number>(),
    serviceConstructor: defineType<typeof InjectableService>(),
    server: defineType<{ readonly port: number }>(),
});

type ServerBinding = Binding<typeof tokens.server, { readonly config: typeof tokens.config }>;
type ConfigBinding = Binding<typeof tokens.config>;
type PortBinding = Binding<typeof tokens.port>;

test("createContainer validates and preserves bindings passed as readonly tuples", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ] as const;

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed as typed tuples", () => {
    const bindings: readonly [ServerBinding, ConfigBinding] = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed as mutable tuples", () => {
    const bindings: [ServerBinding, ConfigBinding] = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
    ];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
});

test("createContainer validates and preserves bindings passed with satisfies readonly tuple", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    ] satisfies readonly [ServerBinding, ConfigBinding, PortBinding];

    const container = createContainer(tokens, ...bindings);

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.config)).type.toBe<Config>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("createContainer rejects invalid bindings passed as readonly tuples", () => {
    const bindings = [
        bind(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    ] as const;

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__missing_dependencies__");
});

test("createContainer rejects valid bindings passed through mutable arrays", () => {
    const bindings = [bind(tokens.config, () => ({ port: 3000 })), bind(tokens.port, () => 3000)];

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__bindings_must_be_tuple__");
});

test("createContainer rejects valid bindings passed through readonly arrays", () => {
    const bindings: readonly Binding[] = [bind(tokens.config, () => ({ port: 3000 })), bind(tokens.port, () => 3000)];

    expect(() => {
        createContainer(tokens, ...bindings);
    }).type.toRaiseError("__bindings_must_be_tuple__");
});

test("resolve accepts unions of bound tokens and returns the union of service values", () => {
    const container = createContainer(
        tokens,
        bind(tokens.config, () => ({ port: 3000 })),
        bind(tokens.port, () => 3000),
    );
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.port;

    expect(container.resolve(selectedToken)).type.toBe<Config | number>();
});

test("bind rejects dependency map values that are not tokens or refs", () => {
    expect(() => {
        bind(tokens.port, { invalid: "config" }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency map values that may be undefined", () => {
    expect(() => {
        bind(tokens.port, { config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects optional dependency map values", () => {
    const dependencies: { readonly config?: typeof tokens.config } = {
        config: tokens.config,
    };

    expect(() => {
        bind(tokens.port, dependencies, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects union dependency values that include non-tokens", () => {
    const condition = true as boolean;
    const dependency = condition ? tokens.config : "config";

    expect(() => {
        bind(tokens.port, { dependency }, () => 3000);
    }).type.toRaiseError();
});

test("ref rejects lazy union dependency values that include non-tokens", () => {
    const condition = true as boolean;

    expect(() => {
        ref(() => (condition ? tokens.logger : "logger"));
    }).type.toRaiseError();
});

test("ref rejects direct union dependency values that include non-tokens", () => {
    const condition = true as boolean;
    const dependency = (condition ? tokens.logger : "logger") as typeof tokens.logger | "logger";

    expect(() => {
        ref(dependency);
    }).type.toRaiseError();
});

test("bind rejects direct token values that were not created by defineTokens", () => {
    expect(() => {
        bind("port", () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps with symbol keys", () => {
    const dependencyKey = Symbol("dependency");

    expect(() => {
        bind(tokens.port, { [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps with numeric keys", () => {
    expect(() => {
        bind(tokens.port, { 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps without factories", () => {
    expect(() => {
        bind(tokens.port, {});
    }).type.toRaiseError();
});

test("bind rejects extra arguments for dependency-free factories", () => {
    expect(() => {
        bind(tokens.port, () => 3000, {});
    }).type.toRaiseError();
});

test("bind rejects missing arguments", () => {
    expect(() => {
        bind();
    }).type.toRaiseError();
});

test("bind rejects extra arguments for dependency factories", () => {
    expect(() => {
        bind(tokens.port, {}, () => 3000, {});
    }).type.toRaiseError();
});

test("defineTokens rejects missing definitions", () => {
    expect(() => {
        defineTokens();
    }).type.toRaiseError();
});

test("createContainer rejects missing token registries", () => {
    expect(() => {
        createContainer();
    }).type.toRaiseError();
});

test("createContainer rejects token registries not created by defineTokens", () => {
    expect(() => {
        createContainer(
            { port: "port" },
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError();
});

test("createContainer rejects rest arguments that are not bindings", () => {
    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, () => 3000),
            "config",
        );
    }).type.toRaiseError();
});

test("createContainer rejects structural bindings not created by bind", () => {
    expect(() => {
        createContainer(tokens, {
            token: tokens.port,
            factory: () => 3000,
        });
    }).type.toRaiseError();
});

test("ref rejects missing dependency tokens", () => {
    expect(() => {
        ref();
    }).type.toRaiseError();
});

test("ref rejects direct values that are not tokens", () => {
    expect(() => {
        ref("logger");
    }).type.toRaiseError();
});

test("ref rejects extra arguments", () => {
    expect(() => {
        ref(tokens.logger, {});
    }).type.toRaiseError();
});

test("public helper types preserve their documented type relationships", () => {
    type Definitions = {
        readonly config: TypeDescriptor<Config>;
        readonly logger: TypeDescriptor<Logger>;
        readonly port: TypeDescriptor<number>;
    };
    type Dependencies = {
        readonly config: typeof tokens.config;
        readonly logger: RefToken<typeof tokens.logger>;
    };

    expect(defineType<Config>()).type.toBe<TypeDescriptor<Config>>();
    expect(defineType()).type.toBe<TypeDescriptor<unknown>>();
    expect<Definitions>().type.toBeAssignableTo<TokenDefinitions>();
    expect<Tokens<Definitions>>().type.toBe<{
        readonly config: Token<"config", Config>;
        readonly logger: Token<"logger", Logger>;
        readonly port: Token<"port", number>;
    }>();
    expect<Dependencies>().type.toBeAssignableTo<DependencyMap>();
    expect<ResolvedDependencies<Dependencies>>().type.toBe<{
        readonly config: Config;
        readonly logger: Ref<Logger>;
    }>();
    expect<Binding<typeof tokens.port>["factory"]>().type.toBe<() => number>();
    expect<Binding<typeof tokens.port, { readonly config: typeof tokens.config }>["factory"]>().type.toBe<
        (dependencies: { readonly config: Config }) => number
    >();
    expect<Parameters<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>[0]>().type.toBe<
        typeof tokens.port
    >();
    expect<ReturnType<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>>().type.toBe<number>();
});

test("defineTokens and createContainer preserve empty token registries", () => {
    const emptyTokens = defineTokens({});
    const container = createContainer(emptyTokens);

    expect(emptyTokens).type.toBe<{}>();
    expect(container.resolve).type.toBe<(token: never) => never>();
    expect<Parameters<typeof container.resolve>[0]>().type.toBe<never>();
});

test("createContainer rejects same-key tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(stringPortToken, () => "3000"),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects same-key tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        createContainer(
            tokens,
            bind(narrowPortToken, () => 3000 as const),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects binding tokens with widened keys", () => {
    const widenedPortToken: Token<string, number> = tokens.port;

    expect(() => {
        createContainer(
            tokens,
            bind(widenedPortToken, () => 3000),
        );
    }).type.toRaiseError("__token_not_in_registry__");
});

test("createContainer rejects same-key dependency tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: stringPortToken }, ({ port }) => ({
                port: port.length,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects same-key dependency tokens with narrower value types", () => {
    const narrowPortToken = "port" as Token<"port", 3000>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { port: narrowPortToken }, ({ port }) => ({
                port,
            })),
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects dependency tokens with widened keys", () => {
    const widenedConfigToken: Token<string, Config> = tokens.config;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { config: widenedConfigToken }, ({ config }) => ({
                port: config.port,
            })),
            bind(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with widened keys", () => {
    const widenToken = <TValue>(token: Token<string, TValue>) => token;
    const widenedLoggerToken = widenToken(tokens.logger);

    expect(widenedLoggerToken).type.toBe<Token<string, Logger>>();

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => widenedLoggerToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with any-typed tokens", () => {
    const anyTypedToken = tokens.logger as any;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => anyTypedToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects lazy ref dependency tokens with same keys and incompatible value types", () => {
    const sameKeyWrongValueToken = "logger" as Token<"logger", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.server, { logger: ref(() => sameKeyWrongValueToken) }, () => ({
                port: 3000,
            })),
            bind(tokens.logger, () => ({
                log() {},
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_registry__");
});

test("createContainer rejects duplicate binding tokens with equivalent key aliases", () => {
    const portAlias = "port" as typeof tokens.port;

    expect(() => {
        createContainer(
            tokens,
            bind(tokens.port, () => 3000),
            bind(portAlias, () => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("bind supports function-valued services", () => {
    const container = createContainer(
        tokens,
        bind(tokens.handler, () => (message) => message.length),
    );

    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
});

test("bind supports callable object services", () => {
    const binding = bind(tokens.callableHandler, () =>
        Object.assign((message: string) => message.length, { kind: "callable" as const }),
    );
    const container = createContainer(tokens, binding);
    const callableHandler = container.resolve(tokens.callableHandler);

    expect(callableHandler).type.toBe<CallableHandler>();
    expect(callableHandler("ready")).type.toBe<number>();
    expect(callableHandler.kind).type.toBe<"callable">();
});

test("bind supports overloaded function services", () => {
    const parser = ((input: string | number) => {
        return typeof input === "string" ? input.length : input.toString();
    }) as Parser;
    const binding = bind(tokens.parser, () => parser);
    const container = createContainer(tokens, binding);
    const resolvedParser = container.resolve(tokens.parser);

    expect<ReturnType<typeof binding.factory>>().type.toBe<Parser>();
    expect(resolvedParser("ready")).type.toBe<number>();
    expect(resolvedParser(3000)).type.toBe<string>();

    expect(() => {
        bind(tokens.parser, parser);
    }).type.toRaiseError();
});

test("bind supports constructor-valued services", () => {
    const binding = bind(tokens.serviceConstructor, () => InjectableService);
    const container = createContainer(tokens, binding);
    const ServiceConstructor = container.resolve(tokens.serviceConstructor);

    expect<ReturnType<typeof binding.factory>>().type.toBe<typeof InjectableService>();
    expect(ServiceConstructor).type.toBe<typeof InjectableService>();
    expect(new ServiceConstructor().status).type.toBe<"ready">();

    expect(() => {
        bind(tokens.serviceConstructor, InjectableService);
    }).type.toRaiseError();
});

test("bind rejects direct function-valued services", () => {
    expect(() => {
        bind(tokens.handler, (message) => message.length);
    }).type.toRaiseError();
});

test("bind supports function-valued services with dependencies", () => {
    const binding = bind(tokens.handler, { config: tokens.config }, ({ config }) => (message) => {
        return message.length + config.port;
    });
    const container = createContainer(
        tokens,
        binding,
        bind(tokens.config, () => ({ port: 3000 })),
    );

    expect<Parameters<typeof binding.factory>[0]["config"]>().type.toBe<Config>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Handler>();
    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
});

test("bind requires factories for zero-argument function-valued services", () => {
    const binding = bind(tokens.counter, () => () => 1);
    const container = createContainer(tokens, binding);

    expect<typeof binding.factory>().type.toBe<() => Counter>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Counter>();
    expect(container.resolve(tokens.counter)).type.toBe<Counter>();

    expect(() => {
        bind(tokens.counter, () => 1);
    }).type.toRaiseError();
});

test("bind supports explicit empty dependency objects", () => {
    const binding = bind(tokens.port, {}, (dependencies) => {
        expect(dependencies).type.toBe<{}>();

        return 3000;
    });
    const container = createContainer(tokens, binding);

    expect<Parameters<typeof binding.factory>[0]>().type.toBe<{}>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("defineTokens rejects symbol token keys", () => {
    const serviceKey = Symbol("service");

    expect(() => {
        defineTokens({
            [serviceKey]: defineType<string>(),
        });
    }).type.toRaiseError("__non_string_token_keys_not_supported__");
});

test("defineTokens rejects numeric token keys", () => {
    expect(() => {
        defineTokens({
            1: defineType<string>(),
        });
    }).type.toRaiseError("__non_string_token_keys_not_supported__");
});

test("defineTokens rejects values not created by defineType", () => {
    expect(() => {
        defineTokens({
            port: 3000,
        });
    }).type.toRaiseError();
});
