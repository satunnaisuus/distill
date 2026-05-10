import {
    type Binding,
    type BindingLifetime,
    bind,
    defineContainer,
    ref,
    type ScopeTemplateArgs,
    type ScopeTemplateContainer,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("bind exposes singleton, scoped, and transient lifetime variants", () => {
    const singleton = bind(tokens.port)
        .singleton()
        .factory(() => 3000);
    const scoped = bind(tokens.port)
        .scoped()
        .factory(() => 3000);
    const transient = bind(tokens.port)
        .transient()
        .factory(() => 3000);

    expect<BindingLifetime>().type.toBe<"singleton" | "scoped" | "transient">();
    expect(singleton).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scoped).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(transient).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "transient">>();
});

test("default bind remains a singleton binding", () => {
    const binding = bind(tokens.port).factory(() => 3000);

    expect(binding).type.toBeAssignableTo<Binding<typeof tokens.port, undefined, "singleton">>();
});

test("createScope preserves parent bindings and adds scope bindings", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
    ).create();
    const scope = app.createScope(
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    );

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(scope.resolve(tokens.port)).type.toBe<number>();
});

test("createScope without bindings preserves parent bindings", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope();

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(() => {
        scope.resolve(tokens.port);
    }).type.toRaiseError();
});

test("createScope allows scope bindings to depend on parent bindings", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope(
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
    );

    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope allows scope bindings to depend on bindings declared later in the same scope", () => {
    const app = defineContainer(tokenList).create();
    const scope = app.createScope(
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(scope.resolve(tokens.config)).type.toBe<Config>();
});

test("runScoped preserves parent bindings and adds tuple bindings in the callback scope", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const result = app.runScoped(
        [
            bind(tokens.port)
                .scoped()
                .factory(() => 3000),
        ] as const,
        (scope) => {
            expect(scope.resolve(tokens.config)).type.toBe<Config>();
            expect(scope.resolve(tokens.port)).type.toBe<number>();

            return scope.resolve(tokens.port);
        },
    );

    expect(result).type.toBe<Promise<number>>();
    expect(() => {
        app.resolve(tokens.port);
    }).type.toRaiseError();
});

test("runScoped returns awaited async callback result types", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const result = app.runScoped([] as const, async (scope) => scope.resolve(tokens.config));

    expect(result).type.toBe<Promise<Config>>();
});

test("createScopeTemplate exposes reusable scoped container types", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const requestScope = app.createScopeTemplate(
        (input: { readonly port: number }) =>
            [
                bind(tokens.port)
                    .scoped()
                    .factory(() => input.port),
            ] as const,
    );
    type RequestScopeArgs = ScopeTemplateArgs<typeof requestScope>;
    type RequestContainer = ScopeTemplateContainer<typeof requestScope>;
    const requestContainer = {} as RequestContainer;
    const created = requestScope.create({ port: 4000 });
    const result = requestScope.runScoped({ port: 5000 }, (scope) => scope.resolve(tokens.port));

    expect<RequestScopeArgs>().type.toBe<[{ readonly port: number }]>();
    expect(requestContainer.resolve(tokens.config)).type.toBe<Config>();
    expect(requestContainer.resolve(tokens.port)).type.toBe<number>();
    expect(created.resolve(tokens.port)).type.toBe<number>();
    expect(result).type.toBe<Promise<number>>();
    expect(() => {
        app.resolve(tokens.port);
    }).type.toRaiseError();
});

test("createScopeTemplate accepts static scope bindings", () => {
    const app = defineContainer(tokenList).create();
    const requestScope = app.createScopeTemplate(
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    );
    type RequestContainer = ScopeTemplateContainer<typeof requestScope>;
    const requestContainer = {} as RequestContainer;

    expect(requestContainer.resolve(tokens.port)).type.toBe<number>();
    expect(requestScope.create().resolve(tokens.port)).type.toBe<number>();
    expect(requestScope.runScoped((scope) => scope.resolve(tokens.port))).type.toBe<Promise<number>>();
});

test("createScopeTemplate rejects invalid scope bindings", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScopeTemplate(
            () =>
                [
                    bind(tokens.server).factory({ config: tokens.config }, ({ config }) => ({
                        port: config.port,
                    })),
                ] as const,
        );
    }).type.toRaiseError();
});

test("runScoped rejects invalid scope bindings like createScope", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.runScoped(
            [
                bind(tokens.server).factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                })),
            ],
            () => undefined,
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("scoped and transient bindings can depend on scoped bindings", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
        bind(tokens.port)
            .transient()
            .factory({ config: tokens.config }, ({ config }) => config.port),
    ).create();

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("parent scoped services can depend on dependencies supplied by child scopes", () => {
    type Request = { readonly id: string };
    type Service = { readonly request: Request };

    const scopedTokens = {
        request: token("request").of<Request>(),
        service: token("service").of<Service>(),
        transientService: token("transientService").of<Service>(),
        transientServiceWithRef: token("transientServiceWithRef").of<Service>(),
    };
    const scopedTokenList = [
        scopedTokens.request,
        scopedTokens.service,
        scopedTokens.transientService,
        scopedTokens.transientServiceWithRef,
    ] as const;

    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.service)
            .scoped()
            .factory({ request: scopedTokens.request }, ({ request }) => ({ request })),
    ).create();
    const requestScope = app.createScope(
        bind(scopedTokens.request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );

    expect(() => {
        app.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(requestScope.resolve(scopedTokens.service)).type.toBe<Service>();

    const appWithRef = defineContainer(
        scopedTokenList,
        bind(scopedTokens.service)
            .scoped()
            .factory({ request: ref(scopedTokens.request) }, ({ request }) => ({
                request: request.value,
            })),
    ).create();
    const refRequestScope = appWithRef.createScope(
        bind(scopedTokens.request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );

    expect(() => {
        appWithRef.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(refRequestScope.resolve(scopedTokens.service)).type.toBe<Service>();

    const transientApp = defineContainer(
        scopedTokenList,
        bind(scopedTokens.transientService)
            .transient()
            .factory({ request: scopedTokens.request }, ({ request }) => ({
                request,
            })),
    ).create();
    const transientRequestScope = transientApp.createScope(
        bind(scopedTokens.request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );

    expect(() => {
        transientApp.resolve(scopedTokens.transientService);
    }).type.toRaiseError();
    expect(transientRequestScope.resolve(scopedTokens.transientService)).type.toBe<Service>();

    const transientAppWithRef = defineContainer(
        scopedTokenList,
        bind(scopedTokens.transientServiceWithRef)
            .transient()
            .factory({ request: ref(scopedTokens.request) }, ({ request }) => ({
                request: request.value,
            })),
    ).create();
    const transientRefRequestScope = transientAppWithRef.createScope(
        bind(scopedTokens.request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );

    expect(() => {
        transientAppWithRef.resolve(scopedTokens.transientServiceWithRef);
    }).type.toRaiseError();
    expect(transientRefRequestScope.resolve(scopedTokens.transientServiceWithRef)).type.toBe<Service>();
});

test("createScope allows scope bindings to override parent bindings", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 4000 })),
    );

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
});

test("createScope ignores shadowed regular parent bindings during cycle validation", () => {
    type ServiceA = {
        readonly name: string;
    };
    type ServiceB = {
        readonly name: string;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, () => ({ name: "root-a" })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory(() => ({ name: "root-b" })),
    ).create();
    const scope = app.createScope(
        bind(scopedTokens.serviceA)
            .scoped()
            .factory(() => ({ name: "child-a" })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory({ serviceA: scopedTokens.serviceA }, () => ({ name: "child-b" })),
    );

    expect(scope.resolve(scopedTokens.serviceB)).type.toBe<ServiceB>();
});

test("scope-only bindings do not change the parent resolve surface", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope(
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    );

    expect(scope.resolve(tokens.port)).type.toBe<number>();
    expect(() => {
        app.resolve(tokens.port);
    }).type.toRaiseError();
});

test("nested scopes inherit child bindings and keep grandchild bindings local", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const child = app.createScope(
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    );
    const grandchild = child.createScope(
        bind(tokens.logger)
            .scoped()
            .factory(() => ({
                log: () => {},
            })),
    );

    expect(child.resolve(tokens.config)).type.toBe<Config>();
    expect(child.resolve(tokens.port)).type.toBe<number>();
    expect(grandchild.resolve(tokens.config)).type.toBe<Config>();
    expect(grandchild.resolve(tokens.port)).type.toBe<number>();
    expect(grandchild.resolve(tokens.logger)).type.toBe<Logger>();
    expect(() => {
        child.resolve(tokens.logger);
    }).type.toRaiseError();
});

test("scope resolve accepts unions of visible bound tokens", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope(
        bind(tokens.logger)
            .scoped()
            .factory(() => ({
                log: () => {},
            })),
    );
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(scope.resolve(selectedToken)).type.toBe<Config | Logger>();
});

test("scope resolve rejects unions when any token variant has no visible binding", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope();
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        scope.resolve(selectedToken);
    }).type.toRaiseError();
});

test("scope resolve rejects unions when any token variant is outside the token list", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();
    const scope = app.createScope();
    const selectedToken = tokens.config as typeof tokens.config | typeof externalToken;

    expect(() => {
        scope.resolve(selectedToken);
    }).type.toRaiseError();
});

test("createScope allows scoped overrides to depend on parent singletons that use parent bindings", () => {
    type ServiceA = {
        readonly name: string;
        readonly serviceB?: ServiceB;
    };
    type ServiceB = {
        readonly serviceA: ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .singleton()
            .factory(() => ({ name: "root" })),
        bind(scopedTokens.serviceB)
            .singleton()
            .factory({ serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                serviceA,
            })),
    ).create();
    const scope = app.createScope(
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                name: "child",
                serviceB,
            })),
    );

    expect(scope.resolve(scopedTokens.serviceA)).type.toBe<ServiceA>();
    expect(scope.resolve(scopedTokens.serviceB)).type.toBe<ServiceB>();
});

test("nested scopes preserve parent singleton owners after child overrides", () => {
    type ServiceA = {
        readonly name: string;
    };
    type ServiceB = {
        readonly serviceA: ServiceA;
    };
    type ServiceC = {
        readonly serviceB: ServiceB;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB, scopedTokens.serviceC] as const;
    const child = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .singleton()
            .factory(() => ({ name: "root" })),
        bind(scopedTokens.serviceB)
            .singleton()
            .factory({ serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                serviceA,
            })),
    )
        .create()
        .createScope(
            bind(scopedTokens.serviceA)
                .scoped()
                .factory(() => ({ name: "child" })),
        );

    const grandchild = child.createScope(
        bind(scopedTokens.serviceC)
            .singleton()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                serviceB,
            })),
    );

    expect(grandchild.resolve(scopedTokens.serviceC)).type.toBe<ServiceC>();
});

test("nested scopes preserve same-scope override owners after child overrides", () => {
    type Config = {
        readonly name: string;
    };
    type Service = {
        readonly config: Config;
    };
    type Consumer = {
        readonly service: Service;
    };
    const scopedTokens = {
        config: token("config").of<Config>(),
        service: token("service").of<Service>(),
        consumer: token("consumer").of<Consumer>(),
    };
    const scopedTokenList = [scopedTokens.config, scopedTokens.service, scopedTokens.consumer] as const;
    const rootConfigBinding = bind(scopedTokens.config)
        .scoped()
        .factory(() => ({ name: "root" }));
    const rootServiceBinding = bind(scopedTokens.service)
        .scoped()
        .factory({ config: scopedTokens.config }, ({ config }) => ({
            config,
        }));
    const childServiceBinding = bind(scopedTokens.service)
        .singleton()
        .factory({ config: scopedTokens.config }, ({ config }) => ({
            config,
        }));
    const childConfigBinding = bind(scopedTokens.config)
        .singleton()
        .factory(() => ({ name: "child" }));
    const child = defineContainer(scopedTokenList, rootConfigBinding, rootServiceBinding)
        .create()
        .createScope(childServiceBinding, childConfigBinding);

    const grandchild = child.createScope(
        bind(scopedTokens.consumer)
            .singleton()
            .factory({ service: scopedTokens.service }, ({ service }) => ({
                service,
            })),
    );

    expect(grandchild.resolve(scopedTokens.consumer)).type.toBe<Consumer>();
});

test("createScope allows circular dependencies when a ref breaks the same-scope eager path", () => {
    type ServiceA = {
        readonly getB: () => ServiceB;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(scopedTokenList).create();
    const scope = app.createScope(
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                getB: () => serviceB,
            })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory({ serviceA: ref(scopedTokens.serviceA) }, ({ serviceA }) => ({
                getA: () => serviceA.value,
            })),
    );

    expect(scope.resolve(scopedTokens.serviceA)).type.toBe<ServiceA>();
    expect(scope.resolve(scopedTokens.serviceB)).type.toBe<ServiceB>();
});

test("createScope allows circular dependencies when a ref breaks a parent override eager path", () => {
    type ServiceA = {
        readonly getB: () => ServiceB;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                getB: () => serviceB,
            })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory(() => ({
                getA: () => {
                    throw new Error("unused");
                },
            })),
    ).create();
    const scope = app.createScope(
        bind(scopedTokens.serviceB)
            .scoped()
            .factory({ serviceA: ref(scopedTokens.serviceA) }, ({ serviceA }) => ({
                getA: () => serviceA.value,
            })),
    );

    expect(scope.resolve(scopedTokens.serviceA)).type.toBe<ServiceA>();
    expect(scope.resolve(scopedTokens.serviceB)).type.toBe<ServiceB>();
});

test("createScope rejects scoped override cycles through non-singleton parent bindings", () => {
    type ServiceA = {
        readonly serviceB?: ServiceB;
    };
    type ServiceB = {
        readonly serviceA?: ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                serviceB,
            })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory(() => ({})),
    ).create();

    expect(() => {
        app.createScope(
            bind(scopedTokens.serviceB)
                .scoped()
                .factory({ serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                    serviceA,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects eager dependencies on themselves inside the same scope", () => {
    type Service = {
        readonly name: "service";
    };
    const scopedTokens = {
        service: token("service").of<Service>(),
    };
    const scopedTokenList = [scopedTokens.service] as const;
    const app = defineContainer(scopedTokenList).create();

    expect(() => {
        app.createScope(
            bind(scopedTokens.service)
                .scoped()
                .factory({ service: scopedTokens.service }, () => ({
                    name: "service" as const,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects eager circular dependencies contained in the same scope", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB, scopedTokens.serviceC] as const;
    const app = defineContainer(scopedTokenList).create();

    expect(() => {
        app.createScope(
            bind(scopedTokens.serviceA)
                .scoped()
                .factory({ serviceB: scopedTokens.serviceB }, () => ({
                    name: "a" as const,
                })),
            bind(scopedTokens.serviceB)
                .scoped()
                .factory({ serviceC: scopedTokens.serviceC }, () => ({
                    name: "b" as const,
                })),
            bind(scopedTokens.serviceC)
                .scoped()
                .factory({ serviceA: scopedTokens.serviceA }, () => ({
                    name: "c" as const,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects scoped override cycles through transient parent bindings", () => {
    type ServiceA = {
        readonly serviceB?: ServiceB;
    };
    type ServiceB = {
        readonly serviceA?: ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .transient()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                serviceB,
            })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory(() => ({})),
    ).create();

    expect(() => {
        app.createScope(
            bind(scopedTokens.serviceB)
                .scoped()
                .factory({ serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                    serviceA,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects eager circular dependencies introduced by nested scopes", () => {
    type ServiceA = {
        readonly serviceB?: ServiceB;
    };
    type ServiceB = {
        readonly serviceA?: ServiceA;
    };
    const scopedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
    };
    const scopedTokenList = [scopedTokens.serviceA, scopedTokens.serviceB] as const;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.serviceA)
            .scoped()
            .factory({ serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
                serviceB,
            })),
        bind(scopedTokens.serviceB)
            .scoped()
            .factory(() => ({})),
    ).create();
    const child = app.createScope();

    expect(() => {
        child.createScope(
            bind(scopedTokens.serviceB)
                .scoped()
                .factory({ serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                    serviceA,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects duplicate bindings within the same scope", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();

    expect(() => {
        app.createScope(
            bind(tokens.port)
                .scoped()
                .factory(() => 3000),
            bind(tokens.port)
                .scoped()
                .factory(() => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("createScope rejects binding tokens outside the token list", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(bind(externalToken).factory(() => 3000));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("createScope rejects dependency tokens outside the token list", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(bind(tokens.port).factory({ external: externalToken }, ({ external }) => external));
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects direct ref dependency tokens outside the token list", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server).factory({ external: ref(externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects lazy ref dependency tokens outside the token list", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server).factory({ external: ref(() => externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope allows missing scoped dependencies to be supplied by descendant scopes", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    ).create();
    const scope = app.createScope(
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
    );
    const childScope = scope.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("nested scopes can supply missing dependencies for parent scoped services", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.server)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
    ).create();
    const childScope = app.createScope();
    const grandchildScope = childScope.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(() => {
        childScope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(grandchildScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("descendant scopes can complete overridden dependency chains", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
        bind(tokens.server)
            .scoped()
            .factory({ port: tokens.port }, ({ port }) => ({
                port,
            })),
    ).create();
    const childScope = app.createScope(
        bind(tokens.port)
            .scoped()
            .factory({ config: tokens.config }, ({ config }) => config.port),
    );
    const grandchildScope = childScope.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 4000 })),
    );

    expect(app.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(() => {
        childScope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(grandchildScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("descendant scopes can supply every variant of union dependencies", () => {
    type RequestA = { readonly kind: "a" };
    type RequestB = { readonly kind: "b" };
    type Service = { readonly request: RequestA | RequestB };

    const scopedTokens = {
        requestA: token("requestA").of<RequestA>(),
        requestB: token("requestB").of<RequestB>(),
        service: token("service").of<Service>(),
        serviceWithRef: token("serviceWithRef").of<Service>(),
        transientService: token("transientService").of<Service>(),
    };
    const scopedTokenList = [
        scopedTokens.requestA,
        scopedTokens.requestB,
        scopedTokens.service,
        scopedTokens.serviceWithRef,
        scopedTokens.transientService,
    ] as const;
    const requestToken = scopedTokens.requestA as typeof scopedTokens.requestA | typeof scopedTokens.requestB;
    const app = defineContainer(
        scopedTokenList,
        bind(scopedTokens.service)
            .scoped()
            .factory({ request: requestToken }, ({ request }) => ({
                request,
            })),
        bind(scopedTokens.serviceWithRef)
            .scoped()
            .factory({ request: ref(requestToken) }, ({ request }) => ({
                request: request.value,
            })),
        bind(scopedTokens.transientService)
            .transient()
            .factory({ request: requestToken }, ({ request }) => ({
                request,
            })),
    ).create();
    const partialScope = app.createScope(
        bind(scopedTokens.requestA)
            .scoped()
            .factory(() => ({ kind: "a" as const })),
    );
    const fullScope = partialScope.createScope(
        bind(scopedTokens.requestB)
            .scoped()
            .factory(() => ({ kind: "b" as const })),
    );

    expect(() => {
        app.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(() => {
        partialScope.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(fullScope.resolve(scopedTokens.service)).type.toBe<Service>();
    expect(fullScope.resolve(scopedTokens.serviceWithRef)).type.toBe<Service>();
    expect(fullScope.resolve(scopedTokens.transientService)).type.toBe<Service>();
});

test("createScope allows missing scoped ref dependencies to be supplied by descendant scopes", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    ).create();
    const scope = app.createScope(
        bind(tokens.server)
            .scoped()
            .factory({ logger: ref(tokens.logger) }, () => ({
                port: 3000,
            })),
    );
    const childScope = scope.createScope(
        bind(tokens.logger)
            .scoped()
            .factory(() => ({
                log: () => {},
            })),
    );

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope allows missing lazy scoped ref dependencies to be supplied by descendant scopes", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.port)
            .scoped()
            .factory(() => 3000),
    ).create();
    const scope = app.createScope(
        bind(tokens.server)
            .scoped()
            .factory({ logger: ref(() => tokens.logger) }, () => ({
                port: 3000,
            })),
    );
    const childScope = scope.createScope(
        bind(tokens.logger)
            .scoped()
            .factory(() => ({
                log: () => {},
            })),
    );

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("scope resolve requires transitive ref dependencies to be visible", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.server)
            .scoped()
            .factory({ port: ref(tokens.port) }, ({ port }) => ({
                port: port.value,
            })),
        bind(tokens.port)
            .transient()
            .factory({ config: tokens.config }, ({ config }) => config.port),
    ).create();
    const childScope = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope rejects union binding tokens", () => {
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(bind(configOrPortToken).factory(() => 3000));
    }).type.toRaiseError("__union_binding_token__");
});

test("createScope rejects union dependency tokens when any variant is outside the token list", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();

    expect(() => {
        app.createScope(bind(tokens.port).factory({ dependency: configOrExternalToken }, () => 3000));
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects union dependency tokens when any variant has no visible binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();

    expect(() => {
        app.createScope(bind(tokens.port).factory({ dependency: configOrLoggerToken }, () => 3000));
    }).type.toRaiseError("__missing_dependencies__");
});

test("createScope rejects eager cycles through union dependency tokens", () => {
    type ServiceA = {
        readonly getNext: () => ServiceB | ServiceC;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unionTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unionTokenList = [unionTokens.serviceA, unionTokens.serviceB, unionTokens.serviceC] as const;
    const serviceBOrC = unionTokens.serviceB as typeof unionTokens.serviceB | typeof unionTokens.serviceC;
    const app = defineContainer(unionTokenList).create();

    expect(() => {
        app.createScope(
            bind(unionTokens.serviceA)
                .scoped()
                .factory({ next: serviceBOrC }, ({ next }) => ({
                    getNext: () => next,
                })),
            bind(unionTokens.serviceB)
                .scoped()
                .factory({ serviceA: unionTokens.serviceA }, ({ serviceA }) => ({
                    getA: () => serviceA,
                })),
            bind(unionTokens.serviceC)
                .scoped()
                .factory(() => ({
                    name: "c" as const,
                })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope allows union dependency tokens when ref breaks the eager path", () => {
    type ServiceA = {
        readonly getNext: () => ServiceB | ServiceC;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unionTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unionTokenList = [unionTokens.serviceA, unionTokens.serviceB, unionTokens.serviceC] as const;
    const serviceBOrC = unionTokens.serviceB as typeof unionTokens.serviceB | typeof unionTokens.serviceC;
    const app = defineContainer(unionTokenList).create();
    const scope = app.createScope(
        bind(unionTokens.serviceA)
            .scoped()
            .factory({ next: ref(serviceBOrC) }, ({ next }) => ({
                getNext: () => next.value,
            })),
        bind(unionTokens.serviceB)
            .scoped()
            .factory({ serviceA: unionTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
        bind(unionTokens.serviceC)
            .scoped()
            .factory(() => ({
                name: "c" as const,
            })),
    );

    expect(scope.resolve(unionTokens.serviceA)).type.toBe<ServiceA>();
    expect(scope.resolve(unionTokens.serviceB)).type.toBe<ServiceB>();
    expect(scope.resolve(unionTokens.serviceC)).type.toBe<ServiceC>();
});

test("defineContainer rejects singleton bindings that depend on scoped union dependency variants", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ dependency: configOrLoggerToken }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
            bind(tokens.logger)
                .singleton()
                .factory(() => ({
                    log: () => {},
                })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ dependency: ref(configOrLoggerToken) }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
            bind(tokens.logger)
                .singleton()
                .factory(() => ({
                    log: () => {},
                })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ dependency: ref(() => configOrLoggerToken) }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
            bind(tokens.logger)
                .singleton()
                .factory(() => ({
                    log: () => {},
                })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped union dependency variants", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server)
                .singleton()
                .factory({ dependency: configOrLoggerToken }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
            bind(tokens.logger)
                .singleton()
                .factory(() => ({
                    log: () => {},
                })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer rejects singleton bindings that depend on scoped bindings", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer rejects widened singleton bindings that depend on scoped bindings", () => {
    const serverBinding: Binding<typeof tokens.server, { readonly config: typeof tokens.config }, BindingLifetime> =
        bind(tokens.server)
            .singleton()
            .factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            }));

    expect(() => {
        defineContainer(
            tokenList,
            serverBinding,
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer rejects singletons that depend on widened scoped bindings", () => {
    const configBinding: Binding<typeof tokens.config, undefined, BindingLifetime> = bind(tokens.config)
        .scoped()
        .factory(() => ({
            port: 3000,
        }));

    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                })),
            configBinding,
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer rejects maybe-singleton bindings that depend on scoped bindings", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind(tokens.server)
              .singleton()
              .factory({ config: tokens.config }, ({ config }) => ({
                  port: config.port,
              }))
        : bind(tokens.server)
              .transient()
              .factory({ config: tokens.config }, ({ config }) => ({
                  port: config.port,
              }));

    expect(() => {
        defineContainer(
            tokenList,
            serverBinding,
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer preserves correlated lifetime and dependencies in union bindings", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind(tokens.server)
              .singleton()
              .factory({ logger: tokens.logger }, () => ({
                  port: 3000,
              }))
        : bind(tokens.server)
              .transient()
              .factory({ config: tokens.config }, ({ config }) => ({
                  port: config.port,
              }));

    const container = defineContainer(
        tokenList,
        serverBinding,
        bind(tokens.logger)
            .singleton()
            .factory(() => ({
                log: () => {},
            })),
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("defineContainer validates singleton missing dependencies per union binding branch", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind(tokens.server)
              .singleton()
              .factory({ logger: tokens.logger }, () => ({
                  port: 3000,
              }))
        : bind(tokens.server)
              .transient()
              .factory({ config: tokens.config }, ({ config }) => ({
                  port: config.port,
              }));

    const app = defineContainer(
        tokenList,
        serverBinding,
        bind(tokens.logger)
            .singleton()
            .factory(() => ({
                log: () => {},
            })),
    ).create();
    const scope = app.createScope(
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    );

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("defineContainer rejects singleton bindings that depend on scoped bindings through ref", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ config: ref(tokens.config) }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("defineContainer rejects singleton bindings that transitively depend on scoped bindings", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ port: tokens.port }, ({ port }) => ({
                    port,
                })),
            bind(tokens.port)
                .transient()
                .factory({ config: tokens.config }, ({ config }) => config.port),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton scope bindings that depend on scoped parent bindings", () => {
    const app = defineContainer(
        tokenList,
        bind(tokens.config)
            .scoped()
            .factory(() => ({ port: 3000 })),
    ).create();

    expect(() => {
        app.createScope(
            bind(tokens.server)
                .singleton()
                .factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped bindings from the same scope", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server)
                .singleton()
                .factory({ config: tokens.config }, ({ config }) => ({
                    port: config.port,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped same-scope bindings through ref", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server)
                .singleton()
                .factory({ config: ref(tokens.config) }, () => ({
                    port: 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that transitively depend on scoped bindings from the same scope", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server)
                .singleton()
                .factory({ port: tokens.port }, ({ port }) => ({
                    port,
                })),
            bind(tokens.port)
                .transient()
                .factory({ config: tokens.config }, ({ config }) => config.port),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope treats default bind as a singleton when checking scoped dependencies", () => {
    const app = defineContainer(tokenList).create();

    expect(() => {
        app.createScope(
            bind(tokens.server).factory({ config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});
