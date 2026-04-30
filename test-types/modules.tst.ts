import {
    all,
    bind,
    defineContainer,
    defineModule,
    exported,
    multiToken,
    override,
    type Token,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("module containers expose only exported root single bindings", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal, () => ({ value: "internal" })),
            exported(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(app.resolve(Public)).type.toBe<{ readonly value: string }>();
    expect(() => {
        app.resolve(Internal);
    }).type.toRaiseError();
});

test("module bindings can depend on imported exported bindings", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const ConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 3000 })))],
    });
    const ServerModule = defineModule({
        imports: [ConfigModule],
        bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port })))],
    });
    const app = defineContainer.module(ServerModule).create();

    expect(app.resolve(Server)).type.toBe<{ readonly port: number }>();
});

test("module bindings can depend on imported exports backed by internals", () => {
    const Secret = token("Secret").of<{ readonly value: string }>();
    const Config = token("Config").of<{ readonly value: string }>();
    const Server = token("Server").of<{ readonly value: string }>();
    const ConfigModule = defineModule({
        bindings: [
            bind(Secret, () => ({ value: "secret" })),
            exported(bind(Config, { secret: Secret }, ({ secret }) => ({ value: secret.value }))),
        ],
    });
    const ServerModule = defineModule({
        imports: [ConfigModule],
        bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ value: config.value })))],
    });
    const app = defineContainer.module(ServerModule).create();

    expect(app.resolve(Server)).type.toBe<{ readonly value: string }>();
});

test("imported exports preserve unresolved scoped dependencies", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const App = token("App").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const AppModule = defineModule({
        imports: [ApiModule],
        bindings: [exported(bind.scoped(App, { service: Service }, ({ service }) => service))],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.resolve(App);
    }).type.toRaiseError();

    const requestScope = app.createScope(bind.scoped(Request, () => ({ id: "request-1" })));

    expect(requestScope.resolve(App)).type.toBe<{ readonly requestId: string }>();
});

test("imported export dependencies are not satisfied by importer local bindings", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const App = token("App").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const AppModule = defineModule({
        imports: [ApiModule],
        bindings: [
            bind.scoped(Request, () => ({ id: "app-request" })),
            exported(bind.scoped(App, { service: Service }, ({ service }) => service)),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.resolve(App);
    }).type.toRaiseError();
});

test("module bindings reject imported internal dependencies", () => {
    const Secret = token("Secret").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const Broken = token("Broken").of<{ readonly value: string }>();
    const SecretModule = defineModule({
        bindings: [bind(Secret, () => ({ value: "secret" })), exported(bind(Public, () => ({ value: "public" })))],
    });

    expect(() => {
        defineModule({
            imports: [SecretModule],
            bindings: [exported(bind(Broken, { secret: Secret }, ({ secret }) => ({ value: secret.value })))],
        });
    }).type.toRaiseError("__missing_dependencies__");
});

test("module bindings reject same-key dependencies with incompatible token types", () => {
    const NumberPort = token("Port").of<number>();
    const StringPort = token("Port").of<string>();
    const Server = token("Server").of<{ readonly port: string }>();

    expect(() => {
        defineModule({
            bindings: [
                bind(NumberPort, () => 3000),
                exported(bind(Server, { port: StringPort }, ({ port }) => ({ port }))),
            ],
        });
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("module scopes require exact tokens for imported export dependencies", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const WrongRequest = token("Request").of<{ readonly id: number }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const app = defineContainer.module(ApiModule).create();
    const requestScope = app.createScope(bind.scoped(WrongRequest, () => ({ id: 1 })));

    expect(WrongRequest).type.toBe<Token<"Request", { readonly id: number }>>();
    expect(() => {
        requestScope.resolve(Service);
    }).type.toRaiseError();
});

test("module scopes reject same-key bindings that shadow private internals", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const WrongRequest = token("Request").of<{ readonly id: number }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const AppModule = defineModule({
        bindings: [
            bind.scoped(Request, () => ({ id: "request-1" })),
            exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id }))),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.createScope(bind.scoped(WrongRequest, () => ({ id: 1 })));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("module scopes reject same-key bindings that shadow imported private internals", () => {
    const Private = token("Private").of<{ readonly value: string }>();
    const WrongPrivate = token("Private").of<{ readonly value: number }>();
    const Service = token("Service").of<{ readonly value: string }>();
    const App = token("App").of<{ readonly value: string }>();
    const ServiceModule = defineModule({
        bindings: [
            bind.scoped(Private, () => ({ value: "private" })),
            exported(bind.scoped(Service, { private: Private }, ({ private: privateValue }) => privateValue)),
        ],
    });
    const AppModule = defineModule({
        imports: [ServiceModule],
        bindings: [exported(bind.scoped(App, { service: Service }, ({ service }) => service))],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.createScope(bind.scoped(WrongPrivate, () => ({ value: 1 })));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("modules reject duplicate visible exported single tokens", () => {
    const Shared = token("Shared").of<{ readonly value: string }>();
    const FirstModule = defineModule({
        bindings: [exported(bind(Shared, () => ({ value: "first" })))],
    });
    const SecondModule = defineModule({
        bindings: [exported(bind(Shared, () => ({ value: "second" })))],
    });

    expect(() => {
        defineModule({
            imports: [FirstModule, SecondModule],
            bindings: [],
        });
    }).type.toRaiseError("__duplicate_binding__");
});

test("module containers expose only exported multibind contributions", () => {
    const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
    const Registry = token("Registry").of<{ readonly names: readonly string[] }>();
    const AppModule = defineModule({
        bindings: [
            bind(Hooks, () => ({ name: "internal" })),
            exported(bind(Hooks, () => ({ name: "public" }))),
            exported(
                bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(app.resolveAll(Hooks)).type.toBe<Array<{ readonly name: string }>>();
    expect(app.resolve(Registry)).type.toBe<{ readonly names: readonly string[] }>();
});

test("module public resolveAll ignores private multibind dependencies", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
    const AppModule = defineModule({
        bindings: [
            bind.scoped(Hooks, { request: Request }, ({ request }) => ({ name: request.id })),
            exported(bind(Hooks, () => ({ name: "public" }))),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(app.resolveAll(Hooks)).type.toBe<Array<{ readonly name: string }>>();
});

test("modules reject same-key multibind contributions with incompatible token types", () => {
    const NumberHooks = multiToken("Hooks").of<number>();
    const StringHooks = multiToken("Hooks").of<string>();

    expect(() => {
        defineModule({
            bindings: [bind(NumberHooks, () => 1), exported(bind(StringHooks, () => "hook"))],
        });
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("modules allow private same-key single and multibind tokens in unrelated modules", () => {
    const Shared = token("Shared").of<{ readonly value: string }>();
    const SharedMany = multiToken("Shared").of<{ readonly value: string }>();
    const First = token("First").of<{ readonly value: string }>();
    const Second = token("Second").of<{ readonly values: readonly string[] }>();
    const Combined = token("Combined").of<{ readonly first: string; readonly second: readonly string[] }>();
    const FirstModule = defineModule({
        bindings: [
            bind(Shared, () => ({ value: "single" })),
            exported(bind(First, { shared: Shared }, ({ shared }) => ({ value: shared.value }))),
        ],
    });
    const SecondModule = defineModule({
        bindings: [
            bind(SharedMany, () => ({ value: "multi" })),
            exported(
                bind(Second, { shared: all(SharedMany) }, ({ shared }) => ({
                    values: shared.map((item) => item.value),
                })),
            ),
        ],
    });
    const AppModule = defineModule({
        imports: [FirstModule, SecondModule],
        bindings: [
            exported(
                bind(Combined, { first: First, second: Second }, ({ first, second }) => ({
                    first: first.value,
                    second: second.values,
                })),
            ),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(app.resolve(Combined)).type.toBe<{ readonly first: string; readonly second: readonly string[] }>();
});

test("module scopes reject same-key bindings with incompatible public token types", () => {
    const NumberHooks = multiToken("Hooks").of<number>();
    const StringHooks = multiToken("Hooks").of<string>();
    const AppModule = defineModule({
        bindings: [exported(bind(StringHooks, () => "hook"))],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.createScope(bind(NumberHooks, () => 1));
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("module containers reject non-exported multibind tokens", () => {
    const InternalHooks = multiToken("InternalHooks").of<{ readonly name: string }>();
    const Public = token("Public").of<{ readonly ok: true }>();
    const AppModule = defineModule({
        bindings: [
            bind(InternalHooks, () => ({ name: "internal" })),
            exported(bind(Public, () => ({ ok: true as const }))),
        ],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.resolveAll(InternalHooks);
    }).type.toRaiseError();
});

test("module overrides are limited to exported root tokens", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal, () => ({ value: "internal" })),
            exported(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        ],
    });
    const definition = defineContainer.module(AppModule);

    expect(() => {
        definition.create(override(bind(Internal, () => ({ value: "test" }))));
    }).type.toRaiseError("__override_token_not_in_tokens__");
    expect(() => {
        definition.create(
            override(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        );
    }).type.toRaiseError("__invalid_overrides__");
});

test("module override dependencies are resolved in the public context", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal, () => ({ value: "internal" })),
            exported(bind.scoped(Public, () => ({ value: "original" }))),
        ],
    });
    const app = defineContainer
        .module(AppModule)
        .create(override(bind.scoped(Public, { internal: Internal }, ({ internal }) => internal)));

    expect(() => {
        app.resolve(Public);
    }).type.toRaiseError();

    const requestScope = app.createScope(bind.scoped(Internal, () => ({ value: "request" })));

    expect(requestScope.resolve(Public)).type.toBe<{ readonly value: string }>();
});

test("module overrides validate dependencies through exported interfaces", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Config = token("Config").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal, () => ({ value: "internal" })),
            exported(bind(Config, { internal: Internal }, ({ internal }) => internal)),
            exported(bind(Public, () => ({ value: "original" }))),
        ],
    });
    const app = defineContainer
        .module(AppModule)
        .create(override(bind(Public, { config: Config }, ({ config }) => config)));

    expect(app.resolve(Public)).type.toBe<{ readonly value: string }>();
});

test("module override public deps see transitive override dependencies", () => {
    const Request = token("Request").of<{ readonly value: string }>();
    const Config = token("Config").of<{ readonly value: string }>();
    const Server = token("Server").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind.scoped(Config, () => ({ value: "config" }))),
            exported(bind.scoped(Server, { config: Config }, ({ config }) => config)),
            exported(bind.scoped(Public, () => ({ value: "original" }))),
        ],
    });
    const app = defineContainer
        .module(AppModule)
        .create(
            override(bind.scoped(Config, { request: Request }, ({ request }) => request)),
            override(bind.scoped(Public, { server: Server }, ({ server }) => server)),
        );
    const requestScope = app.createScope(bind.scoped(Request, () => ({ value: "request" })));

    expect(() => {
        app.resolve(Public);
    }).type.toRaiseError();
    expect(requestScope.resolve(Public)).type.toBe<{ readonly value: string }>();
});

test("module overrides revalidate existing root bindings", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind(Config, () => ({ port: 3000 }))),
            exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
        ],
    });
    const definition = defineContainer.module(AppModule);

    expect(() => {
        definition.create(override(bind.scoped(Config, () => ({ port: 4000 }))));
    }).type.toRaiseError("__invalid_overrides__");
    expect(() => {
        definition.create(unbind(Config));
    }).type.toRaiseError("__invalid_overrides__");
});

test("module overrides update transitive public resolve surfaces", () => {
    const Request = token("Request").of<{ readonly port: number }>();
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind.scoped(Config, () => ({ port: 3000 }))),
            exported(bind.scoped(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
        ],
    });
    const app = defineContainer
        .module(AppModule)
        .create(override(bind.scoped(Config, { request: Request }, ({ request }) => ({ port: request.port }))));
    const requestScope = app.createScope(bind.scoped(Request, () => ({ port: 4000 })));

    expect(() => {
        app.resolve(Server);
    }).type.toRaiseError();
    expect(requestScope.resolve(Server)).type.toBe<{ readonly port: number }>();
});

test("module scopes reject cycles through exported interfaces", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const App = token("App").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const AppModule = defineModule({
        imports: [ApiModule],
        bindings: [exported(bind.scoped(App, { service: Service }, ({ service }) => service))],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.createScope(bind.scoped(Request, { app: App }, ({ app }) => ({ id: app.requestId })));
    }).type.toRaiseError("__circular_dependency__");
});

test("module scopes reject singleton scoped leaks through exported interfaces", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const App = token("App").of<{ readonly requestId: string }>();
    const Consumer = token("Consumer").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [
            exported(bind.transient(Service, { request: Request }, ({ request }) => ({ requestId: request.id }))),
        ],
    });
    const AppModule = defineModule({
        imports: [ApiModule],
        bindings: [exported(bind.transient(App, { service: Service }, ({ service }) => service))],
    });
    const app = defineContainer.module(AppModule).create();

    expect(() => {
        app.createScope(
            bind.scoped(Request, () => ({ id: "request-1" })),
            bind.singleton(Consumer, { app: App }, ({ app }) => ({ requestId: app.requestId })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});
