import { type Binding, bind, type Disposer, defineContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { CallableHandler, Config, Handler, Logger, Parser, Server } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("bind accepts sync and async dispose functions that return void", () => {
    const syncBinding = bind(tokens.port)
        .factory(() => 3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        });
    const promiseBinding = bind(tokens.port)
        .factory(() => 3000)
        .disposable((port) => {
            expect(port).type.toBe<number>();

            return Promise.resolve();
        });
    const asyncBinding = bind(tokens.port)
        .factory(() => 3000)
        .disposable(async (port) => {
            expect(port).type.toBe<number>();
        });
    const dependencyBinding = bind(tokens.port)
        .factory({ config: tokens.config }, () => 3000)
        .disposable(async (port) => {
            expect(port).type.toBe<number>();
        });

    expect(syncBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(promiseBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(asyncBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(dependencyBinding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects dispose functions that return non-void values", () => {
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable(() => 1);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable(async () => 1);
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable(() => Promise.resolve(1));
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory({ config: tokens.config }, () => 3000)
            .disposable(async () => 1);
    }).type.toRaiseError();
});

test("bind rejects dispose functions that require additional parameters", () => {
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable((_port, _reason: string) => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory({}, () => 3000)
            .disposable((_port, _reason: string) => {});
    }).type.toRaiseError();
});

test("bind infers object-valued dispose parameters", () => {
    const binding = bind(tokens.config)
        .factory(() => ({ port: 3000 }))
        .disposable((config) => {
            expect(config).type.toBeAssignableTo<Config>();
            expect(config.port).type.toBe<number>();
        });

    expect(binding.dispose).type.toBe<Disposer<Config> | undefined>();
});

test("bind rejects dispose functions with narrower object parameters", () => {
    bind(tokens.config)
        .factory(() => ({ port: 3000 }))
        .disposable((_config: unknown) => {});

    expect(() => {
        bind(tokens.config)
            .factory(() => ({ port: 3000 }))
            .disposable((_config: Config & { readonly close: () => void }) => {});
    }).type.toRaiseError();
});

test("bind infers unknown-valued dispose parameters", () => {
    const binding = bind(tokens.unknown)
        .factory(() => ({ port: 3000 }))
        .disposable((value) => {
            expect(value).type.toBe<unknown>();
        });

    expect(binding.dispose).type.toBe<Disposer<unknown> | undefined>();
});

test("bind infers void and undefined dispose parameters", () => {
    const disposableTokens = {
        empty: token("empty").of<undefined>(),
        sideEffect: token("sideEffect").of<void>(),
    };
    const emptyBinding = bind(disposableTokens.empty)
        .factory(() => undefined)
        .disposable((value) => {
            expect(value).type.toBe<undefined>();
        });
    const sideEffectBinding = bind(disposableTokens.sideEffect)
        .factory(() => {})
        .disposable((value) => {
            expect(value).type.toBe<void>();
        });

    expect(emptyBinding.dispose).type.toBe<Disposer<undefined> | undefined>();
    expect(sideEffectBinding.dispose).type.toBe<Disposer<void> | undefined>();
});

test("bind infers function-valued dispose parameters", () => {
    const handlerBinding = bind(tokens.handler)
        .factory(() => (message) => message.length)
        .disposable((handler) => {
            expect(handler).type.toBeAssignableTo<Handler>();
            expect(handler("ready")).type.toBe<number>();
        });
    const parser = ((input: string | number) => {
        return typeof input === "string" ? input.length : input.toString();
    }) as Parser;
    const parserBinding = bind(tokens.parser)
        .factory(() => parser)
        .disposable((parser) => {
            expect(parser).type.toBeAssignableTo<Parser>();
            expect(parser("ready")).type.toBe<number>();
            expect(parser(3000)).type.toBe<string>();
        });
    const callableBinding = bind(tokens.callableHandler)
        .factory(() => Object.assign((message: string) => message.length, { kind: "callable" as const }))
        .disposable((handler) => {
            expect(handler).type.toBeAssignableTo<CallableHandler>();
            expect(handler("ready")).type.toBe<number>();
            expect(handler.kind).type.toBe<"callable">();
        });

    expect(handlerBinding.dispose).type.toBe<Disposer<Handler> | undefined>();
    expect(parserBinding.dispose).type.toBe<Disposer<Parser> | undefined>();
    expect(callableBinding.dispose).type.toBe<Disposer<CallableHandler> | undefined>();
});

test("public Binding dispose type follows the token value type", () => {
    expect<Binding<typeof tokens.config>["dispose"]>().type.toBe<Disposer<Config> | undefined>();
    expect<Binding<typeof tokens.handler>["dispose"]>().type.toBe<Disposer<Handler> | undefined>();
    expect<Binding<typeof tokens.unknown>["dispose"]>().type.toBe<Disposer<unknown> | undefined>();
});

test("defineContainer accepts disposable bindings and preserves resolve types", () => {
    const configBinding = bind(tokens.config)
        .factory(() => ({ port: 3000 }))
        .disposable((config) => {
            expect(config).type.toBeAssignableTo<Config>();
        });
    const portBinding = bind(tokens.port)
        .factory({ config: tokens.config }, ({ config }) => config.port)
        .disposable((port) => {
            expect(port).type.toBe<number>();
        });
    const container = defineContainer(tokenList, configBinding, portBinding).create();

    expect(container.resolve(tokens.config)).type.toBe<Config>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("createScope accepts disposable bindings and preserves resolve types", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .factory(() => ({ port: 3000 }))
            .disposable((config) => {
                expect(config).type.toBeAssignableTo<Config>();
            }),
    ).create();
    const scope = app.createScope(
        bind(tokens.port)
            .factory({ config: tokens.config }, ({ config }) => config.port)
            .disposable((port) => {
                expect(port).type.toBe<number>();
            }),
    );

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(scope.resolve(tokens.port)).type.toBe<number>();
});

test("bind preserves dispose value types for ref dependency bindings", () => {
    const binding = bind(tokens.server)
        .factory({ logger: ref(tokens.logger) }, ({ logger }) => {
            expect(logger.value).type.toBeAssignableTo<Logger>();

            return { port: 3000 };
        })
        .disposable((server) => {
            expect(server).type.toBeAssignableTo<Server>();
            expect(server.port).type.toBe<number>();
        });

    expect(binding.dispose).type.toBe<Disposer<Server> | undefined>();
});

test("disposable bindings still participate in singleton scoped dependency validation", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                }))
                .disposable((_value) => {}),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 }))
                .disposable((_value) => {}),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("disposable bindings still participate in token list and duplicate validation", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.port)
                .factory(() => 3000)
                .disposable((_value) => {}),
            bind(tokens.port)
                .factory(() => 4000)
                .disposable((_value) => {}),
        ).create();
    }).type.toRaiseError("__duplicate_binding__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(externalToken)
                .factory(() => 3000)
                .disposable((_value) => {}),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.port)
                .factory({ external: externalToken }, ({ external }) => external)
                .disposable((_value) => {}),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");

    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.port)
                .scoped()
                .factory(() => 3000)
                .disposable((_value) => {}),
            bind(tokens.port)
                .scoped()
                .factory(() => 4000)
                .disposable((_value) => {}),
        );
    }).type.toRaiseError("__duplicate_binding__");
    expect(() => {
        app.createScope(
            bind(externalToken)
                .factory(() => 3000)
                .disposable((_value) => {}),
        );
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("created containers and scopes expose typed dispose APIs", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.config).factory(() => ({ port: 3000 })),
    ).create();
    const scope = container.createScope(
        bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
    );

    expect(container.dispose()).type.toBe<Promise<void>>();
    expect(scope.dispose()).type.toBe<Promise<void>>();
    expect(container.disposed).type.toBe<boolean>();
    expect(scope.disposed).type.toBe<boolean>();

    expect(() => {
        container.dispose(undefined);
    }).type.toRaiseError();
    expect(() => {
        scope.dispose(undefined);
    }).type.toRaiseError();
    expect(() => {
        container.disposed = false;
    }).type.toRaiseError();
    expect(() => {
        scope.disposed = false;
    }).type.toRaiseError();
});

test("bind rejects invalid dispose option shapes", () => {
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable("not a function");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory(() => 3000)
            .disposable(() => {});
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory({}, () => 3000)
            .disposable("not a function");
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port)
            .factory({}, () => 3000)
            .disposable(() => {});
    }).type.toRaiseError();
});
