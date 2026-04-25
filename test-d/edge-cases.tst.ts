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

const tokens = defineTokens({
    config: defineType<Config>(),
    handler: defineType<Handler>(),
    logger: defineType<Logger>(),
    port: defineType<number>(),
    server: defineType<{ readonly port: number }>(),
});

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

test("ref rejects direct values that are not tokens", () => {
    expect(() => {
        ref("logger");
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

test("createContainer rejects same-key tokens with incompatible value types", () => {
    const stringPortToken = "port" as Token<"port", string>;

    expect(() => {
        createContainer(
            tokens,
            bind(stringPortToken, () => "3000"),
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
