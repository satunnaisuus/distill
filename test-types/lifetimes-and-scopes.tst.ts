import { type Binding, type BindingLifetime, bind, createContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("bind exposes singleton, scoped, and transient lifetime variants", () => {
    const singleton = bind.singleton(tokens.port, () => 3000);
    const scoped = bind.scoped(tokens.port, () => 3000);
    const transient = bind.transient(tokens.port, () => 3000);

    expect<BindingLifetime>().type.toBe<"singleton" | "scoped" | "transient">();
    expect(singleton).type.toBe<Binding<typeof tokens.port, undefined, "singleton">>();
    expect(scoped).type.toBe<Binding<typeof tokens.port, undefined, "scoped">>();
    expect(transient).type.toBe<Binding<typeof tokens.port, undefined, "transient">>();
});

test("default bind remains a singleton binding", () => {
    const binding = bind(tokens.port, () => 3000);

    expect(binding).type.toBe<Binding<typeof tokens.port, undefined, "singleton">>();
});

test("createScope preserves parent bindings and adds scope bindings", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    );
    const scope = app.createScope(bind.scoped(tokens.port, () => 3000));

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(scope.resolve(tokens.port)).type.toBe<number>();
});

test("createScope without bindings preserves parent bindings", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope();

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
    expect(() => {
        scope.resolve(tokens.port);
    }).type.toRaiseError();
});

test("createScope allows scope bindings to depend on parent bindings", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope(
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    );

    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope allows scope bindings to depend on bindings declared later in the same scope", () => {
    const app = createContainer(tokenList);
    const scope = app.createScope(
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(scope.resolve(tokens.config)).type.toBe<Config>();
});

test("scoped and transient bindings can depend on scoped bindings", () => {
    const container = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
        bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
    );

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

    const app = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.service, { request: scopedTokens.request }, ({ request }) => ({ request })),
    );
    const requestScope = app.createScope(bind.scoped(scopedTokens.request, () => ({ id: "request-1" })));

    expect(() => {
        app.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(requestScope.resolve(scopedTokens.service)).type.toBe<Service>();

    const appWithRef = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.service, { request: ref(scopedTokens.request) }, ({ request }) => ({
            request: request.value,
        })),
    );
    const refRequestScope = appWithRef.createScope(bind.scoped(scopedTokens.request, () => ({ id: "request-1" })));

    expect(() => {
        appWithRef.resolve(scopedTokens.service);
    }).type.toRaiseError();
    expect(refRequestScope.resolve(scopedTokens.service)).type.toBe<Service>();

    const transientApp = createContainer(
        scopedTokenList,
        bind.transient(scopedTokens.transientService, { request: scopedTokens.request }, ({ request }) => ({
            request,
        })),
    );
    const transientRequestScope = transientApp.createScope(
        bind.scoped(scopedTokens.request, () => ({ id: "request-1" })),
    );

    expect(() => {
        transientApp.resolve(scopedTokens.transientService);
    }).type.toRaiseError();
    expect(transientRequestScope.resolve(scopedTokens.transientService)).type.toBe<Service>();

    const transientAppWithRef = createContainer(
        scopedTokenList,
        bind.transient(scopedTokens.transientServiceWithRef, { request: ref(scopedTokens.request) }, ({ request }) => ({
            request: request.value,
        })),
    );
    const transientRefRequestScope = transientAppWithRef.createScope(
        bind.scoped(scopedTokens.request, () => ({ id: "request-1" })),
    );

    expect(() => {
        transientAppWithRef.resolve(scopedTokens.transientServiceWithRef);
    }).type.toRaiseError();
    expect(transientRefRequestScope.resolve(scopedTokens.transientServiceWithRef)).type.toBe<Service>();
});

test("createScope allows scope bindings to override parent bindings", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope(bind.scoped(tokens.config, () => ({ port: 4000 })));

    expect(scope.resolve(tokens.config)).type.toBe<Config>();
});

test("scope-only bindings do not change the parent resolve surface", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope(bind.scoped(tokens.port, () => 3000));

    expect(scope.resolve(tokens.port)).type.toBe<number>();
    expect(() => {
        app.resolve(tokens.port);
    }).type.toRaiseError();
});

test("nested scopes inherit child bindings and keep grandchild bindings local", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const child = app.createScope(bind.scoped(tokens.port, () => 3000));
    const grandchild = child.createScope(
        bind.scoped(tokens.logger, () => ({
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
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope(
        bind.scoped(tokens.logger, () => ({
            log: () => {},
        })),
    );
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(scope.resolve(selectedToken)).type.toBe<Config | Logger>();
});

test("scope resolve rejects unions when any token variant has no visible binding", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
    const scope = app.createScope();
    const selectedToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        scope.resolve(selectedToken);
    }).type.toRaiseError();
});

test("scope resolve rejects unions when any token variant is outside the token list", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );
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
    const app = createContainer(
        scopedTokenList,
        bind.singleton(scopedTokens.serviceA, () => ({ name: "root" })),
        bind.singleton(scopedTokens.serviceB, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
            serviceA,
        })),
    );
    const scope = app.createScope(
        bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
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
    const child = createContainer(
        scopedTokenList,
        bind.singleton(scopedTokens.serviceA, () => ({ name: "root" })),
        bind.singleton(scopedTokens.serviceB, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
            serviceA,
        })),
    ).createScope(bind.scoped(scopedTokens.serviceA, () => ({ name: "child" })));

    const grandchild = child.createScope(
        bind.singleton(scopedTokens.serviceC, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
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
    const rootConfigBinding = bind.scoped(scopedTokens.config, () => ({ name: "root" }));
    const rootServiceBinding = bind.scoped(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        config,
    }));
    const childServiceBinding = bind.singleton(scopedTokens.service, { config: scopedTokens.config }, ({ config }) => ({
        config,
    }));
    const childConfigBinding = bind.singleton(scopedTokens.config, () => ({ name: "child" }));
    const child = createContainer(scopedTokenList, rootConfigBinding, rootServiceBinding).createScope(
        childServiceBinding,
        childConfigBinding,
    );

    const grandchild = child.createScope(
        bind.singleton(scopedTokens.consumer, { service: scopedTokens.service }, ({ service }) => ({
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
    const app = createContainer(scopedTokenList);
    const scope = app.createScope(
        bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind.scoped(scopedTokens.serviceB, { serviceA: ref(scopedTokens.serviceA) }, ({ serviceA }) => ({
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
    const app = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind.scoped(scopedTokens.serviceB, () => ({
            getA: () => {
                throw new Error("unused");
            },
        })),
    );
    const scope = app.createScope(
        bind.scoped(scopedTokens.serviceB, { serviceA: ref(scopedTokens.serviceA) }, ({ serviceA }) => ({
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
    const app = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
            serviceB,
        })),
        bind.scoped(scopedTokens.serviceB, () => ({})),
    );

    expect(() => {
        app.createScope(
            bind.scoped(scopedTokens.serviceB, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
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
    const app = createContainer(scopedTokenList);

    expect(() => {
        app.createScope(
            bind.scoped(scopedTokens.service, { service: scopedTokens.service }, () => ({
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
    const app = createContainer(scopedTokenList);

    expect(() => {
        app.createScope(
            bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, () => ({
                name: "a" as const,
            })),
            bind.scoped(scopedTokens.serviceB, { serviceC: scopedTokens.serviceC }, () => ({
                name: "b" as const,
            })),
            bind.scoped(scopedTokens.serviceC, { serviceA: scopedTokens.serviceA }, () => ({
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
    const app = createContainer(
        scopedTokenList,
        bind.transient(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
            serviceB,
        })),
        bind.scoped(scopedTokens.serviceB, () => ({})),
    );

    expect(() => {
        app.createScope(
            bind.scoped(scopedTokens.serviceB, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
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
    const app = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.serviceA, { serviceB: scopedTokens.serviceB }, ({ serviceB }) => ({
            serviceB,
        })),
        bind.scoped(scopedTokens.serviceB, () => ({})),
    );
    const child = app.createScope();

    expect(() => {
        child.createScope(
            bind.scoped(scopedTokens.serviceB, { serviceA: scopedTokens.serviceA }, ({ serviceA }) => ({
                serviceA,
            })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("createScope rejects duplicate bindings within the same scope", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        app.createScope(
            bind.scoped(tokens.port, () => 3000),
            bind.scoped(tokens.port, () => 4000),
        );
    }).type.toRaiseError("__duplicate_binding__");
});

test("createScope rejects binding tokens outside the token list", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(bind(externalToken, () => 3000));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("createScope rejects dependency tokens outside the token list", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(bind(tokens.port, { external: externalToken }, ({ external }) => external));
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects direct ref dependency tokens outside the token list", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind(tokens.server, { external: ref(externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects lazy ref dependency tokens outside the token list", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind(tokens.server, { external: ref(() => externalToken) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope allows missing scoped dependencies to be supplied by descendant scopes", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.port, () => 3000),
    );
    const scope = app.createScope(
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    );
    const childScope = scope.createScope(bind.scoped(tokens.config, () => ({ port: 3000 })));

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("nested scopes can supply missing dependencies for parent scoped services", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        })),
    );
    const childScope = app.createScope();
    const grandchildScope = childScope.createScope(bind.scoped(tokens.config, () => ({ port: 3000 })));

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(() => {
        childScope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(grandchildScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("descendant scopes can complete overridden dependency chains", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.port, () => 3000),
        bind.scoped(tokens.server, { port: tokens.port }, ({ port }) => ({
            port,
        })),
    );
    const childScope = app.createScope(
        bind.scoped(tokens.port, { config: tokens.config }, ({ config }) => config.port),
    );
    const grandchildScope = childScope.createScope(bind.scoped(tokens.config, () => ({ port: 4000 })));

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
    const app = createContainer(
        scopedTokenList,
        bind.scoped(scopedTokens.service, { request: requestToken }, ({ request }) => ({
            request,
        })),
        bind.scoped(scopedTokens.serviceWithRef, { request: ref(requestToken) }, ({ request }) => ({
            request: request.value,
        })),
        bind.transient(scopedTokens.transientService, { request: requestToken }, ({ request }) => ({
            request,
        })),
    );
    const partialScope = app.createScope(bind.scoped(scopedTokens.requestA, () => ({ kind: "a" as const })));
    const fullScope = partialScope.createScope(bind.scoped(scopedTokens.requestB, () => ({ kind: "b" as const })));

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
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.port, () => 3000),
    );
    const scope = app.createScope(
        bind.scoped(tokens.server, { logger: ref(tokens.logger) }, () => ({
            port: 3000,
        })),
    );
    const childScope = scope.createScope(
        bind.scoped(tokens.logger, () => ({
            log: () => {},
        })),
    );

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope allows missing lazy scoped ref dependencies to be supplied by descendant scopes", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.port, () => 3000),
    );
    const scope = app.createScope(
        bind.scoped(tokens.server, { logger: ref(() => tokens.logger) }, () => ({
            port: 3000,
        })),
    );
    const childScope = scope.createScope(
        bind.scoped(tokens.logger, () => ({
            log: () => {},
        })),
    );

    expect(() => {
        scope.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("scope resolve requires transitive ref dependencies to be visible", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.server, { port: ref(tokens.port) }, ({ port }) => ({
            port: port.value,
        })),
        bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
    );
    const childScope = app.createScope(bind.scoped(tokens.config, () => ({ port: 3000 })));

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(childScope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createScope rejects union binding tokens", () => {
    const configOrPortToken = tokens.config as typeof tokens.config | typeof tokens.port;
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(bind(configOrPortToken, () => 3000));
    }).type.toRaiseError("__union_binding_token__");
});

test("createScope rejects union dependency tokens when any variant is outside the token list", () => {
    const configOrExternalToken = tokens.config as typeof tokens.config | typeof externalToken;
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        app.createScope(bind(tokens.port, { dependency: configOrExternalToken }, () => 3000));
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("createScope rejects union dependency tokens when any variant has no visible binding", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        app.createScope(bind(tokens.port, { dependency: configOrLoggerToken }, () => 3000));
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
    const app = createContainer(unionTokenList);

    expect(() => {
        app.createScope(
            bind.scoped(unionTokens.serviceA, { next: serviceBOrC }, ({ next }) => ({
                getNext: () => next,
            })),
            bind.scoped(unionTokens.serviceB, { serviceA: unionTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
            bind.scoped(unionTokens.serviceC, () => ({
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
    const app = createContainer(unionTokenList);
    const scope = app.createScope(
        bind.scoped(unionTokens.serviceA, { next: ref(serviceBOrC) }, ({ next }) => ({
            getNext: () => next.value,
        })),
        bind.scoped(unionTokens.serviceB, { serviceA: unionTokens.serviceA }, ({ serviceA }) => ({
            getA: () => serviceA,
        })),
        bind.scoped(unionTokens.serviceC, () => ({
            name: "c" as const,
        })),
    );

    expect(scope.resolve(unionTokens.serviceA)).type.toBe<ServiceA>();
    expect(scope.resolve(unionTokens.serviceB)).type.toBe<ServiceB>();
    expect(scope.resolve(unionTokens.serviceC)).type.toBe<ServiceC>();
});

test("createContainer rejects singleton bindings that depend on scoped union dependency variants", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;

    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { dependency: configOrLoggerToken }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
            bind.singleton(tokens.logger, () => ({
                log: () => {},
            })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { dependency: ref(configOrLoggerToken) }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
            bind.singleton(tokens.logger, () => ({
                log: () => {},
            })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");

    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { dependency: ref(() => configOrLoggerToken) }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
            bind.singleton(tokens.logger, () => ({
                log: () => {},
            })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped union dependency variants", () => {
    const configOrLoggerToken = tokens.config as typeof tokens.config | typeof tokens.logger;
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind.singleton(tokens.server, { dependency: configOrLoggerToken }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
            bind.singleton(tokens.logger, () => ({
                log: () => {},
            })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer rejects singleton bindings that depend on scoped bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer rejects widened singleton bindings that depend on scoped bindings", () => {
    const serverBinding: Binding<typeof tokens.server, { readonly config: typeof tokens.config }, BindingLifetime> =
        bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
            port: config.port,
        }));

    expect(() => {
        createContainer(
            tokenList,
            serverBinding,
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer rejects singletons that depend on widened scoped bindings", () => {
    const configBinding: Binding<typeof tokens.config, undefined, BindingLifetime> = bind.scoped(tokens.config, () => ({
        port: 3000,
    }));

    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
            configBinding,
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer rejects maybe-singleton bindings that depend on scoped bindings", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
              port: config.port,
          }))
        : bind.transient(tokens.server, { config: tokens.config }, ({ config }) => ({
              port: config.port,
          }));

    expect(() => {
        createContainer(
            tokenList,
            serverBinding,
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer preserves correlated lifetime and dependencies in union bindings", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind.singleton(tokens.server, { logger: tokens.logger }, () => ({
              port: 3000,
          }))
        : bind.transient(tokens.server, { config: tokens.config }, ({ config }) => ({
              port: config.port,
          }));

    const container = createContainer(
        tokenList,
        serverBinding,
        bind.singleton(tokens.logger, () => ({
            log: () => {},
        })),
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createContainer validates singleton missing dependencies per union binding branch", () => {
    const useSingleton = true as boolean;
    const serverBinding = useSingleton
        ? bind.singleton(tokens.server, { logger: tokens.logger }, () => ({
              port: 3000,
          }))
        : bind.transient(tokens.server, { config: tokens.config }, ({ config }) => ({
              port: config.port,
          }));

    const app = createContainer(
        tokenList,
        serverBinding,
        bind.singleton(tokens.logger, () => ({
            log: () => {},
        })),
    );
    const scope = app.createScope(bind.scoped(tokens.config, () => ({ port: 3000 })));

    expect(() => {
        app.resolve(tokens.server);
    }).type.toRaiseError();
    expect(scope.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("createContainer rejects singleton bindings that depend on scoped bindings through ref", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { config: ref(tokens.config) }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createContainer rejects singleton bindings that transitively depend on scoped bindings", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { port: tokens.port }, ({ port }) => ({
                port,
            })),
            bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton scope bindings that depend on scoped parent bindings", () => {
    const app = createContainer(
        tokenList,
        bind.scoped(tokens.config, () => ({ port: 3000 })),
    );

    expect(() => {
        app.createScope(
            bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped bindings from the same scope", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind.singleton(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that depend on scoped same-scope bindings through ref", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind.singleton(tokens.server, { config: ref(tokens.config) }, () => ({
                port: 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope rejects singleton bindings that transitively depend on scoped bindings from the same scope", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind.singleton(tokens.server, { port: tokens.port }, ({ port }) => ({
                port,
            })),
            bind.transient(tokens.port, { config: tokens.config }, ({ config }) => config.port),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("createScope treats default bind as a singleton when checking scoped dependencies", () => {
    const app = createContainer(tokenList);

    expect(() => {
        app.createScope(
            bind(tokens.server, { config: tokens.config }, ({ config }) => ({
                port: config.port,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});
