import { type Binding, bind, createContainer, type Disposer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { CallableHandler, Config, Handler, Logger, Parser, Server } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("bind accepts sync and async dispose functions that return void", () => {
    const syncBinding = bind(tokens.port, () => 3000, {
        dispose: (port) => {
            expect(port).type.toBe<number>();
        },
    });
    const promiseBinding = bind(tokens.port, () => 3000, {
        dispose: (port) => {
            expect(port).type.toBe<number>();

            return Promise.resolve();
        },
    });
    const asyncBinding = bind(tokens.port, () => 3000, {
        dispose: async (port) => {
            expect(port).type.toBe<number>();
        },
    });
    const dependencyBinding = bind(tokens.port, { config: tokens.config }, () => 3000, {
        dispose: async (port) => {
            expect(port).type.toBe<number>();
        },
    });

    expect(syncBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(promiseBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(asyncBinding.dispose).type.toBe<Disposer<number> | undefined>();
    expect(dependencyBinding.dispose).type.toBe<Disposer<number> | undefined>();
});

test("bind rejects dispose functions that return non-void values", () => {
    expect(() => {
        bind(tokens.port, () => 3000, { dispose: () => 1 });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, () => 3000, { dispose: async () => 1 });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, () => 3000, { dispose: () => Promise.resolve(1) });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, { config: tokens.config }, () => 3000, { dispose: async () => 1 });
    }).type.toRaiseError();
});

test("bind rejects dispose functions that require additional parameters", () => {
    expect(() => {
        bind(tokens.port, () => 3000, {
            dispose: (_port, _reason: string) => {},
        });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, {}, () => 3000, {
            dispose: (_port, _reason: string) => {},
        });
    }).type.toRaiseError();
});

test("bind infers object-valued dispose parameters", () => {
    const binding = bind(tokens.config, () => ({ port: 3000 }), {
        dispose: (config) => {
            expect(config).type.toBeAssignableTo<Config>();
            expect(config.port).type.toBe<number>();
        },
    });

    expect(binding.dispose).type.toBe<Disposer<Config> | undefined>();
});

test("bind rejects dispose functions with narrower object parameters", () => {
    bind(tokens.config, () => ({ port: 3000 }), {
        dispose: (_config: unknown) => {},
    });

    expect(() => {
        bind(tokens.config, () => ({ port: 3000 }), {
            dispose: (_config: Config & { readonly close: () => void }) => {},
        });
    }).type.toRaiseError();
});

test("bind infers unknown-valued dispose parameters", () => {
    const binding = bind(tokens.unknown, () => ({ port: 3000 }), {
        dispose: (value) => {
            expect(value).type.toBe<unknown>();
        },
    });

    expect(binding.dispose).type.toBe<Disposer<unknown> | undefined>();
});

test("bind infers void and undefined dispose parameters", () => {
    const disposableTokens = {
        empty: token("empty").of<undefined>(),
        sideEffect: token("sideEffect").of<void>(),
    };
    const emptyBinding = bind(disposableTokens.empty, () => undefined, {
        dispose: (value) => {
            expect(value).type.toBe<undefined>();
        },
    });
    const sideEffectBinding = bind(disposableTokens.sideEffect, () => {}, {
        dispose: (value) => {
            expect(value).type.toBe<void>();
        },
    });

    expect(emptyBinding.dispose).type.toBe<Disposer<undefined> | undefined>();
    expect(sideEffectBinding.dispose).type.toBe<Disposer<void> | undefined>();
});

test("bind infers function-valued dispose parameters", () => {
    const handlerBinding = bind(tokens.handler, () => (message) => message.length, {
        dispose: (handler) => {
            expect(handler).type.toBeAssignableTo<Handler>();
            expect(handler("ready")).type.toBe<number>();
        },
    });
    const parser = ((input: string | number) => {
        return typeof input === "string" ? input.length : input.toString();
    }) as Parser;
    const parserBinding = bind(tokens.parser, () => parser, {
        dispose: (parser) => {
            expect(parser).type.toBeAssignableTo<Parser>();
            expect(parser("ready")).type.toBe<number>();
            expect(parser(3000)).type.toBe<string>();
        },
    });
    const callableBinding = bind(
        tokens.callableHandler,
        () => Object.assign((message: string) => message.length, { kind: "callable" as const }),
        {
            dispose: (handler) => {
                expect(handler).type.toBeAssignableTo<CallableHandler>();
                expect(handler("ready")).type.toBe<number>();
                expect(handler.kind).type.toBe<"callable">();
            },
        },
    );

    expect(handlerBinding.dispose).type.toBe<Disposer<Handler> | undefined>();
    expect(parserBinding.dispose).type.toBe<Disposer<Parser> | undefined>();
    expect(callableBinding.dispose).type.toBe<Disposer<CallableHandler> | undefined>();
});

test("public Binding dispose type follows the token value type", () => {
    expect<Binding<typeof tokens.config>["dispose"]>().type.toBe<Disposer<Config> | undefined>();
    expect<Binding<typeof tokens.handler>["dispose"]>().type.toBe<Disposer<Handler> | undefined>();
    expect<Binding<typeof tokens.unknown>["dispose"]>().type.toBe<Disposer<unknown> | undefined>();
});

test("createContainer accepts disposable bindings and preserves resolve types", () => {
    const configBinding = bind(tokens.config, () => ({ port: 3000 }), {
        dispose: (config) => {
            expect(config).type.toBeAssignableTo<Config>();
        },
    });
    const portBinding = bind(tokens.port, { config: tokens.config }, ({ config }) => config.port, {
        dispose: (port) => {
            expect(port).type.toBe<number>();
        },
    });
    const container = createContainer(tokenList, configBinding, portBinding);

    expect(container.resolve(tokens.config)).type.toBe<Config>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("createScope accepts disposable bindings and preserves resolve types", () => {
    const app = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 }), {
            dispose: (config) => {
                expect(config).type.toBeAssignableTo<Config>();
            },
        }),
    );
    const scope = app.createScope(
        bind(tokens.port, { config: tokens.config }, ({ config }) => config.port, {
            dispose: (port) => {
                expect(port).type.toBe<number>();
            },
        }),
    );

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(scope.resolve(tokens.port)).type.toBe<number>();
});

test("bind preserves dispose value types for ref dependency bindings", () => {
    const binding = bind(
        tokens.server,
        { logger: ref(tokens.logger) },
        ({ logger }) => {
            expect(logger.value).type.toBeAssignableTo<Logger>();

            return { port: 3000 };
        },
        {
            dispose: (server) => {
                expect(server).type.toBeAssignableTo<Server>();
                expect(server.port).type.toBe<number>();
            },
        },
    );

    expect(binding.dispose).type.toBe<Disposer<Server> | undefined>();
});

test("disposable bindings still participate in singleton scoped dependency validation", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(
                tokens.server,
                { config: tokens.config },
                ({ config }) => ({
                    port: config.port,
                }),
                {
                    dispose: () => {},
                },
            ),
            bind.scoped(tokens.config, () => ({ port: 3000 }), {
                dispose: () => {},
            }),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("disposable bindings still participate in token list and duplicate validation", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, () => 3000, { dispose: () => {} }),
            bind(tokens.port, () => 4000, { dispose: () => {} }),
        );
    }).type.toRaiseError("__duplicate_binding__");
    expect(() => {
        createContainer(
            tokenList,
            bind(externalToken, () => 3000, { dispose: () => {} }),
        );
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { external: externalToken }, ({ external }) => external, { dispose: () => {} }),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");

    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind.scoped(tokens.port, () => 3000, { dispose: () => {} }),
            bind.scoped(tokens.port, () => 4000, { dispose: () => {} }),
        );
    }).type.toRaiseError("__duplicate_binding__");
    expect(() => {
        app.createScope(bind(externalToken, () => 3000, { dispose: () => {} }));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("created containers and scopes expose typed dispose APIs", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.config, () => ({ port: 3000 })),
    );
    const scope = container.createScope(bind(tokens.port, { config: tokens.config }, ({ config }) => config.port));

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
        bind(tokens.port, () => 3000, { dispose: "not a function" });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, () => 3000, { dispose: () => {}, extra: true });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, {}, () => 3000, { dispose: "not a function" });
    }).type.toRaiseError();
    expect(() => {
        bind(tokens.port, {}, () => 3000, { dispose: () => {}, extra: true });
    }).type.toRaiseError();
});
