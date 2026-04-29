import { all, bind, createContainer, type Disposer, multiToken, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Handler, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

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

test("all rejects lazy union dependency values that include non-multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const condition = true as boolean;

    expect(() => {
        all(() => (condition ? handlers : "handlers"));
    }).type.toRaiseError();
});

test("all rejects direct union dependency values that include non-multibind tokens", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const condition = true as boolean;
    const dependency = (condition ? handlers : "handlers") as typeof handlers | "handlers";

    expect(() => {
        all(dependency);
    }).type.toRaiseError();
});

test("bind rejects raw string values that were not created by token", () => {
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

test("bind supports dispose options for dependency-free factories", () => {
    const binding = bind(tokens.port, () => 3000, {
        dispose: (port) => {
            expect(port).type.toBe<number>();
        },
    });

    expect(binding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects invalid dispose options for dependency-free factories", () => {
    expect(() => {
        bind(tokens.port, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
});

test("bind rejects missing arguments", () => {
    expect(() => {
        bind();
    }).type.toRaiseError();
});

test("bind supports dispose options for dependency factories", () => {
    const binding = bind(tokens.port, {}, () => 3000, {
        dispose: (port) => {
            expect(port).type.toBe<number>();
        },
    });

    expect(binding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects invalid dispose options for dependency factories", () => {
    expect(() => {
        bind(tokens.port, {}, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
});

test("bind rejects extra arguments after dispose options", () => {
    expect(() => {
        bind(tokens.port, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, {}, () => 3000, {}, {});
    }).type.toRaiseError();
});

test("lifetime bind variants reject factories returning values outside the token type", () => {
    expect(() => {
        bind.singleton(tokens.port, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, () => "3000");
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency factories returning values outside the token type", () => {
    expect(() => {
        bind.singleton(tokens.port, { config: tokens.config }, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, { config: tokens.config }, () => "3000");
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, { config: tokens.config }, () => "3000");
    }).type.toRaiseError();
});

test("lifetime bind variants reject invalid dependency map values", () => {
    expect(() => {
        bind.singleton(tokens.port, { invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, { invalid: "config" }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, { invalid: "config" }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency map values that may be undefined", () => {
    expect(() => {
        bind.singleton(tokens.port, { config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, { config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, { config: undefined as typeof tokens.config | undefined }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject optional dependency map values", () => {
    const dependencies: { readonly config?: typeof tokens.config } = {
        config: tokens.config,
    };

    expect(() => {
        bind.singleton(tokens.port, dependencies, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, dependencies, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, dependencies, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps with symbol keys", () => {
    const dependencyKey = Symbol("dependency");

    expect(() => {
        bind.singleton(tokens.port, { [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, { [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, { [dependencyKey]: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps with numeric keys", () => {
    expect(() => {
        bind.singleton(tokens.port, { 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, { 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, { 1: tokens.config }, () => 3000);
    }).type.toRaiseError();
});

test("lifetime bind variants reject dependency maps without factories", () => {
    expect(() => {
        bind.singleton(tokens.port, {});
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, {});
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, {});
    }).type.toRaiseError();
});

test("lifetime bind variants support dispose options for dependency-free factories", () => {
    const singleton = bind.singleton(tokens.port, () => 3000, { dispose: () => {} });
    const scoped = bind.scoped(tokens.port, () => 3000, { dispose: () => {} });
    const transient = bind.transient(tokens.port, () => 3000, { dispose: () => {} });

    expect(singleton.dispose).type.toBe<Disposer<number> | undefined>();
    expect(scoped.dispose).type.toBe<Disposer<number> | undefined>();
    expect(transient.dispose).type.toBe<Disposer<number> | undefined>();
});

test("lifetime bind variants reject invalid dispose options for dependency-free factories", () => {
    expect(() => {
        bind.singleton(tokens.port, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, () => 3000, { dispose: (_port: string) => {} });
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
    const singleton = bind.singleton(tokens.port, {}, () => 3000, { dispose: () => {} });
    const scoped = bind.scoped(tokens.port, {}, () => 3000, { dispose: () => {} });
    const transient = bind.transient(tokens.port, {}, () => 3000, { dispose: () => {} });

    expect(singleton.dispose).type.toBe<Disposer<number> | undefined>();
    expect(scoped.dispose).type.toBe<Disposer<number> | undefined>();
    expect(transient.dispose).type.toBe<Disposer<number> | undefined>();
});

test("lifetime bind variants reject invalid dispose options for dependency factories", () => {
    expect(() => {
        bind.singleton(tokens.port, {}, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, {}, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, {}, () => 3000, { dispose: (_port: string) => {} });
    }).type.toRaiseError();
});

test("lifetime bind variants reject extra arguments after dispose options", () => {
    expect(() => {
        bind.singleton(tokens.port, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind.singleton(tokens.port, {}, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind.scoped(tokens.port, {}, () => 3000, {}, {});
    }).type.toRaiseError();
    expect(() => {
        bind.transient(tokens.port, {}, () => 3000, {}, {});
    }).type.toRaiseError();
});

test("lifetime bind variants support function-valued services", () => {
    const singleton = bind.singleton(tokens.handler, () => (message) => message.length);
    const scoped = bind.scoped(tokens.handler, () => (message) => message.length);
    const transient = bind.transient(tokens.handler, () => (message) => message.length);

    expect<ReturnType<typeof singleton.factory>>().type.toBe<Handler>();
    expect<ReturnType<typeof scoped.factory>>().type.toBe<Handler>();
    expect<ReturnType<typeof transient.factory>>().type.toBe<Handler>();
});

test("lifetime bind variants infer dependency factory parameters", () => {
    const singleton = bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
        port: config.port,
    }));
    const scoped = bind.scoped(tokens.server, { logger: ref(tokens.logger), port: tokens.port }, ({ port }) => ({
        port,
    }));
    const transient = bind.transient(
        tokens.server,
        { config: tokens.config, logger: ref(tokens.logger), port: tokens.port },
        ({ config }) => ({
            port: config.port,
        }),
    );

    expect<Parameters<typeof singleton.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof scoped.factory>[0]["logger"]["value"]>().type.toBe<Logger>();
    expect<Parameters<typeof scoped.factory>[0]["port"]>().type.toBe<number>();
    expect<Parameters<typeof transient.factory>[0]["config"]>().type.toBe<Config>();
    expect<Parameters<typeof transient.factory>[0]["logger"]["value"]>().type.toBe<Logger>();
    expect<Parameters<typeof transient.factory>[0]["port"]>().type.toBe<number>();
});

test("createContainer rejects missing token lists", () => {
    expect(() => {
        createContainer();
    }).type.toRaiseError();
});

test("createContainer rejects non-array token lists", () => {
    expect(() => {
        createContainer(
            { port: token("port").of<number>() },
            bind(tokens.port, () => 3000),
        );
    }).type.toRaiseError();
});

test("createContainer rejects rest arguments that are not bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, () => 3000),
            "config",
        );
    }).type.toRaiseError();
});

test("createContainer rejects structural bindings not created by bind", () => {
    expect(() => {
        createContainer(tokenList, {
            token: tokens.port,
            factory: () => 3000,
        });
    }).type.toRaiseError();
});

test("createScope rejects rest arguments that are not bindings", () => {
    const container = createContainer(tokenList);

    expect(() => {
        container.createScope("config");
    }).type.toRaiseError();
});

test("createScope rejects structural bindings not created by bind", () => {
    const container = createContainer(tokenList);

    expect(() => {
        container.createScope({
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
    const container = createContainer(tokenList, binding);

    expect<Parameters<typeof binding.factory>[0]>().type.toBe<{}>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});
