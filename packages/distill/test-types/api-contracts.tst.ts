import { bind, type Disposer, defineContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Handler, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("bind rejects dependency map values that are not tokens or refs", () => {
    expect(() => {
        bind(tokens.port).factory({ invalid: "config" }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency map values that may be undefined", () => {
    expect(() => {
        bind(tokens.port).factory({ config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects optional dependency map values", () => {
    const dependencies: { readonly config?: typeof tokens.config } = {
        config: tokens.config,
    };

    expect(() => {
        bind(tokens.port).factory(dependencies, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects union dependency values that include non-tokens", () => {
    const condition = true as boolean;
    const dependency = condition ? tokens.config : "config";

    expect(() => {
        bind(tokens.port).factory({ dependency }, () => 3000);
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

test("bind rejects raw string values that were not created by token", () => {
    expect(() => {
        bind("port").factory(() => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps with symbol keys", () => {
    const dependencyKey = Symbol("dependency");

    expect(() => {
        bind(tokens.port).factory({ [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps with numeric keys", () => {
    expect(() => {
        bind(tokens.port).factory({ 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("bind rejects dependency maps without factories", () => {
    expect(() => {
        bind(tokens.port).factory();
    }).type.toRaiseError();
});

test("bind supports dispose options for dependency-free factories", () => {
    const binding = bind(tokens.port)
        .factory(() => 3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        });

    expect(binding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects invalid dispose options for dependency-free factories", () => {
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
});

test("bind rejects missing arguments", () => {
    expect(() => {
        bind();
    }).type.toRaiseError();
});

test("bind supports dispose options for dependency factories", () => {
    const binding = bind(tokens.port)
        .factory({}, () => 3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        });

    expect(binding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects invalid dispose options for dependency factories", () => {
    expect(() => {
        bind(tokens.port)
            .factory({}, () => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
});

test("bind rejects extra arguments after dispose options", () => {
    expect(() => {
        bind(tokens.port).factory(() => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port).factory({}, () => 3000, {});
    }).type.toRaiseError();
});

test("lifetime bind variants reject factories returning values outside the token type", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory(() => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory(() => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory(() => "3000");
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency factories returning values outside the token type", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({ config: tokens.config }, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({ config: tokens.config }, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({ config: tokens.config }, () => "3000");
    }).type.toRaiseError();
});

test("lifetime bind variants reject invalid dependency map values", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({ invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({ invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({ invalid: "config" }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency map values that may be undefined", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({ config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({ config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({ config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject optional dependency map values", () => {
    const dependencies: { readonly config?: typeof tokens.config } = {
        config: tokens.config,
    };

    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory(dependencies, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory(dependencies, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory(dependencies, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps with symbol keys", () => {
    const dependencyKey = Symbol("dependency");

    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({ [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({ [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({ [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps with numeric keys", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({ 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({ 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({ 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps without factories", () => {
    expect(() => {
        bind(tokens.port).singleton().factory();
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port).scoped().factory();
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port).transient().factory();
    }).type.toRaiseError();
});

test("lifetime bind variants support dispose options for dependency-free factories", () => {
    const singleton = bind(tokens.port)
        .singleton()
        .factory(() => 3000)
        .disposable((_value) => {});
    const scoped = bind(tokens.port)
        .scoped()
        .factory(() => 3000)
        .disposable((_value) => {});
    const transient = bind(tokens.port)
        .transient()
        .factory(() => 3000)
        .disposable((_value) => {});

    expect(singleton.dispose).type.toBe<Disposer<number> | undefined>();
    expect(scoped.dispose).type.toBe<Disposer<number> | undefined>();
    expect(transient.dispose).type.toBe<Disposer<number> | undefined>();
});

test("lifetime bind variants reject invalid dispose options for dependency-free factories", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory(() => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory(() => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory(() => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
});

test("lifetime bind variants reject missing arguments", () => {
    expect(() => {
        bind.singleton();
    }).type.toRaiseError();
    expect(() => {
        bind.scoped();
    }).type.toRaiseError();
    expect(() => {
        bind.transient();
    }).type.toRaiseError();
});

test("lifetime bind variants support dispose options for dependency factories", () => {
    const singleton = bind(tokens.port)
        .singleton()
        .factory({}, () => 3000)
        .disposable((_value) => {});
    const scoped = bind(tokens.port)
        .scoped()
        .factory({}, () => 3000)
        .disposable((_value) => {});
    const transient = bind(tokens.port)
        .transient()
        .factory({}, () => 3000)
        .disposable((_value) => {});

    expect(singleton.dispose).type.toBe<Disposer<number> | undefined>();
    expect(scoped.dispose).type.toBe<Disposer<number> | undefined>();
    expect(transient.dispose).type.toBe<Disposer<number> | undefined>();
});

test("lifetime bind variants reject invalid dispose options for dependency factories", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({}, () => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({}, () => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({}, () => 3000)
            .disposable((_port: string) => {});
    }).type.toRaiseError();
});

test("lifetime bind variants reject extra arguments after dispose options", () => {
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory(() => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory(() => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory(() => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .singleton()
            .factory({}, () => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .scoped()
            .factory({}, () => 3000, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .transient()
            .factory({}, () => 3000, {});
    }).type.toRaiseError();
});

test("lifetime bind variants support function-valued services", () => {
    const singleton = bind(tokens.handler)
        .singleton()
        .factory(() => (message) => message.length);
    const scoped = bind(tokens.handler)
        .scoped()
        .factory(() => (message) => message.length);
    const transient = bind(tokens.handler)
        .transient()
        .factory(() => (message) => message.length);

    expect<ReturnType<typeof singleton.factory>>().type.toBe<Handler>();
    expect<ReturnType<typeof scoped.factory>>().type.toBe<Handler>();
    expect<ReturnType<typeof transient.factory>>().type.toBe<Handler>();
});

test("lifetime bind variants infer dependency factory parameters", () => {
    const singleton = bind(tokens.server)
        .singleton()
        .factory({ config: tokens.config }, ({ config }) => ({
            port: config.port,
        }));
    const scoped = bind(tokens.server)
        .scoped()
        .factory({ logger: ref(tokens.logger), port: tokens.port }, ({ port }) => ({
            port,
        }));
    const transient = bind(tokens.server)
        .transient()
        .factory({ config: tokens.config, logger: ref(tokens.logger), port: tokens.port }, ({ config }) => ({
            port: config.port,
        }));

    expect<Parameters<typeof singleton.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof scoped.factory>[0]["logger"]["value"]>().type.toBe<Logger>();
    expect<Parameters<typeof scoped.factory>[0]["port"]>().type.toBe<number>();
    expect<Parameters<typeof transient.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof transient.factory>[0]["logger"]["value"]>().type.toBe<Logger>();
    expect<Parameters<typeof transient.factory>[0]["port"]>().type.toBe<number>();
});

test("defineContainer rejects missing token lists", () => {
    expect(() => {
        defineContainer().create();
    }).type.toRaiseError();
});

test("defineContainer rejects non-array token lists", () => {
    expect(() => {
        defineContainer(
            { port: token("port").of<number>() },
            bind(tokens.port).factory(() => 3000),
        ).create();
    }).type.toRaiseError();
});

test("defineContainer rejects rest arguments that are not bindings", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.port).factory(() => 3000),
            "config",
        ).create();
    }).type.toRaiseError();
});

test("defineContainer rejects structural bindings not created by bind", () => {
    expect(() => {
        defineContainer(tokenList, {
            token: tokens.port,
            factory: () => 3000,
        }).create();
    }).type.toRaiseError();
});

test("createScope rejects rest arguments that are not bindings", () => {
    const container = defineContainer(tokenList).create();

    expect(() => {
        container.createScope("config");
    }).type.toRaiseError();
});

test("createScope rejects structural bindings not created by bind", () => {
    const container = defineContainer(tokenList).create();

    expect(() => {
        container.createScope({
            token: tokens.port,
            factory: () => 3000,
        });
    }).type.toRaiseError();
});

test("runScoped rejects binding arrays that contain non-bindings", () => {
    const container = defineContainer(tokenList).create();

    expect(() => {
        container.runScoped(["config"], () => undefined);
    }).type.toRaiseError();
});

test("runScoped rejects structural bindings not created by bind", () => {
    const container = defineContainer(tokenList).create();

    expect(() => {
        container.runScoped(
            [
                {
                    token: tokens.port,
                    factory: () => 3000,
                },
            ],
            () => undefined,
        );
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
    const binding = bind(tokens.port).factory({}, (dependencies) => {
        expect(dependencies).type.toBe<{}>();

        return 3000;
    });
    const container = defineContainer(tokenList, binding).create();

    expect<Parameters<typeof binding.factory>[0]>().type.toBe<{}>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});
