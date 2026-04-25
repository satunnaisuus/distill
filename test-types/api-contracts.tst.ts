import { bind, createContainer, defineTokens, type as defineType, ref } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import { tokens } from "./fixtures/tokens.js";

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
