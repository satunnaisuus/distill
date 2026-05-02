import {
    all,
    bind,
    composeModules,
    defineContainer,
    defineModule,
    exported,
    type MultiToken,
    multiToken,
    override,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("module containers expose only composition exports", () => {
    const Internal = token("Internal").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const AppModule = defineModule({
        bindings: [
            bind(Internal, () => ({ value: "internal" })),
            exported(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Public],
    });
    const app = defineContainer.module(App).create();

    expect(app.resolve(Public)).type.toBe<{ readonly value: string }>();
    expect(() => {
        app.resolve(Internal);
    }).type.toRaiseError();
});

test("module token imports allow factory dependencies after composition", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const ConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 3000 })))],
    });
    const ServerModule = defineModule({
        imports: [Config],
        bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port })))],
    });
    const App = composeModules({
        modules: [ServerModule, ConfigModule],
        exports: [Server],
    });
    const app = defineContainer.module(App).create();

    expect(app.resolve(Server)).type.toBe<{ readonly port: number }>();
});

test("old module-to-module imports no longer type-check", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const ConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 3000 })))],
    });

    expect(() => {
        defineModule({
            imports: [ConfigModule],
            bindings: [],
        });
    }).type.toRaiseError();
});

test("defineContainer.module requires a composed module root", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const ConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 3000 })))],
    });
    const App = composeModules({
        modules: [ConfigModule],
        exports: [Config],
    });

    expect(defineContainer.module(App).create().resolve(Config)).type.toBe<{ readonly port: number }>();
    expect(() => {
        defineContainer.module(ConfigModule);
    }).type.toRaiseError();
});

test("composeModules rejects missing and ambiguous single providers", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const ServerModule = defineModule({
        imports: [Config],
        bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port })))],
    });

    expect(() => {
        composeModules({
            modules: [ServerModule],
            exports: [Server],
        });
    }).type.toRaiseError("__missing_provider__");

    const FirstConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 3000 })))],
    });
    const SecondConfigModule = defineModule({
        bindings: [exported(bind(Config, () => ({ port: 4000 })))],
    });

    expect(() => {
        composeModules({
            modules: [ServerModule, FirstConfigModule, SecondConfigModule],
            exports: [Server],
        });
    }).type.toRaiseError("__ambiguous_provider__");

    const StringConfig = token("SameKeyConfig").of<string>();
    const NumberConfig = token("SameKeyConfig").of<number>();
    const Public = token("Public").of<{ readonly ok: true }>();
    const StringConfigModule = defineModule({
        bindings: [exported(bind(StringConfig, () => "config"))],
    });
    const NumberConfigModule = defineModule({
        bindings: [exported(bind(NumberConfig, () => 3000))],
    });
    const PublicModule = defineModule({
        bindings: [exported(bind(Public, () => ({ ok: true as const })))],
    });

    expect(() => {
        composeModules({
            modules: [PublicModule, StringConfigModule, NumberConfigModule],
            exports: [Public],
        });
    }).type.toRaiseError("__ambiguous_provider__");
});

test("composeModules rejects public exports without providers", () => {
    const Public = token("Public").of<{ readonly ok: true }>();
    const AppModule = defineModule({
        bindings: [],
    });

    expect(() => {
        composeModules({
            modules: [AppModule],
            exports: [Public],
        });
    }).type.toRaiseError("__missing_provider__");
});

test("composeModules rejects incompatible same-key exported multibind providers", () => {
    const StringHooks = multiToken("Hooks").of<string>();
    const NumberHooks = multiToken("Hooks").of<number>();
    const Registry = token("Registry").of<{ readonly names: readonly string[] }>();
    const StringModule = defineModule({
        bindings: [exported(bind(StringHooks, () => "hook"))],
    });
    const NumberModule = defineModule({
        bindings: [exported(bind(NumberHooks, () => 1))],
    });
    const RegistryModule = defineModule({
        imports: [StringHooks],
        bindings: [exported(bind(Registry, { hooks: all(StringHooks) }, ({ hooks }) => ({ names: hooks })))],
    });

    expect(() => {
        composeModules({
            modules: [RegistryModule, StringModule, NumberModule],
            exports: [Registry],
        });
    }).type.toRaiseError("__incompatible_provider__");
});

test("singleton consumers cannot capture scoped imported providers after composition", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const Consumer = token("Consumer").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const AppModule = defineModule({
        imports: [Service],
        bindings: [exported(bind.singleton(Consumer, { service: Service }, ({ service }) => service))],
    });

    expect(() => {
        composeModules({
            modules: [ApiModule, AppModule],
            exports: [Consumer],
        });
    }).type.toRaiseError("__invalid_modules__");
});

test("imported exported bindings preserve unresolved scoped dependencies", () => {
    const Request = token("Request").of<{ readonly id: string }>();
    const Service = token("Service").of<{ readonly requestId: string }>();
    const AppService = token("AppService").of<{ readonly requestId: string }>();
    const ApiModule = defineModule({
        bindings: [exported(bind.scoped(Service, { request: Request }, ({ request }) => ({ requestId: request.id })))],
    });
    const AppModule = defineModule({
        imports: [Service],
        bindings: [exported(bind.scoped(AppService, { service: Service }, ({ service }) => service))],
    });
    const App = composeModules({
        modules: [ApiModule, AppModule],
        exports: [AppService],
    });
    const app = defineContainer.module(App).create();

    expect(() => {
        app.resolve(AppService);
    }).type.toRaiseError();

    const requestScope = app.createScope(bind.scoped(Request, () => ({ id: "request-1" })));

    expect(requestScope.resolve(AppService)).type.toBe<{ readonly requestId: string }>();
});

test("module bindings reject imported internals", () => {
    const Secret = token("Secret").of<{ readonly value: string }>();
    const Public = token("Public").of<{ readonly value: string }>();
    const Broken = token("Broken").of<{ readonly value: string }>();
    const SecretModule = defineModule({
        bindings: [bind(Secret, () => ({ value: "secret" })), exported(bind(Public, () => ({ value: "public" })))],
    });

    expect(() => {
        defineModule({
            imports: [Public],
            bindings: [exported(bind(Broken, { secret: Secret }, ({ secret }) => ({ value: secret.value })))],
        });
    }).type.toRaiseError("__missing_dependencies__");

    expect(SecretModule).type.not.toBe<never>();
});

test("single token imports cannot be locally rebound in the same module", () => {
    const Config = token("Config").of<{ readonly port: number }>();

    expect(() => {
        defineModule({
            imports: [Config],
            bindings: [bind(Config, () => ({ port: 3000 }))],
        });
    }).type.toRaiseError("__duplicate_binding__");
});

test("module bindings reject same-key dependencies with incompatible token types", () => {
    const NumberPort = token("Port").of<number>();
    const StringPort = token("Port").of<string>();
    const Server = token("Server").of<{ readonly port: string }>();

    expect(() => {
        defineModule({
            imports: [NumberPort],
            bindings: [exported(bind(Server, { port: StringPort }, ({ port }) => ({ port })))],
        });
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("multibind imports aggregate exported contributions and owner-local contributions", () => {
    const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
    const Registry = token("Registry").of<{ readonly names: readonly string[] }>();
    const PluginModule = defineModule({
        bindings: [exported(bind(Hooks, () => ({ name: "public" })))],
    });
    const RegistryModule = defineModule({
        imports: [Hooks],
        bindings: [
            bind(Hooks, () => ({ name: "local-private" })),
            exported(
                bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ),
        ],
    });
    const App = composeModules({
        modules: [RegistryModule, PluginModule],
        exports: [Registry, Hooks],
    });
    const app = defineContainer.module(App).create();

    expect(app.resolve(Registry)).type.toBe<{ readonly names: readonly string[] }>();
    expect(app.resolveAll(Hooks)).type.toBe<Array<{ readonly name: string }>>();
});

test("composeModules rejects imported and exported multibind tokens without contributions", () => {
    const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
    const Registry = token("Registry").of<{ readonly names: readonly string[] }>();
    const RegistryModule = defineModule({
        imports: [Hooks],
        bindings: [
            exported(
                bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ),
        ],
    });

    expect(() => {
        composeModules({
            modules: [RegistryModule],
            exports: [Registry],
        });
    }).type.toRaiseError("__missing_provider__");

    const EmptyModule = defineModule({ bindings: [] });

    expect(() => {
        composeModules({
            modules: [EmptyModule],
            exports: [Hooks],
        });
    }).type.toRaiseError("__missing_provider__");
});

test("module overrides are limited to composition exports", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind(Config, () => ({ port: 3000 }))),
            exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Server],
    });
    const definition = defineContainer.module(App);

    expect(() => {
        definition.create(override(bind(Config, () => ({ port: 4000 }))));
    }).type.toRaiseError("__override_token_not_in_tokens__");
    expect(() => {
        definition.create(unbind(Config));
    }).type.toRaiseError("__override_token_not_in_tokens__");
    expect(definition.create(override(bind(Server, () => ({ port: 5000 })))).resolve(Server)).type.toBe<{
        readonly port: number;
    }>();
});

test("module override types preserve non-overridden composition exports", () => {
    const Config = token("Config").of<{ readonly port: number }>();
    const Credentials = token("Credentials").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind(Credentials, () => ({ port: 4000 }))),
            exported(bind(Config, () => ({ port: 3000 }))),
            exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Credentials, Config, Server],
    });
    const definition = defineContainer.module(App);

    expect(() => {
        definition.create(override(bind.scoped(Config, () => ({ port: 4000 }))));
    }).type.toRaiseError("__invalid_overrides__");
    expect(() => {
        definition.create(unbind(Config));
    }).type.toRaiseError("__invalid_overrides__");

    const app = definition.create(
        override(bind(Config, { credentials: Credentials }, ({ credentials }) => ({ port: credentials.port }))),
    );

    expect(app.resolve(Config)).type.toBe<{ readonly port: number }>();
    expect(app.resolve(Server)).type.toBe<{ readonly port: number }>();
});

test("module override validation follows public override dependencies", () => {
    const Request = token("Request").of<{ readonly port: number }>();
    const Config = token("Config").of<{ readonly port: number }>();
    const Server = token("Server").of<{ readonly port: number }>();
    const AppModule = defineModule({
        bindings: [
            exported(bind.scoped(Request, () => ({ port: 4000 }))),
            exported(bind(Config, () => ({ port: 3000 }))),
            exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Request, Config, Server],
    });
    const definition = defineContainer.module(App);

    expect(() => {
        definition.create(
            override(bind.transient(Config, { request: Request }, ({ request }) => ({ port: request.port }))),
        );
    }).type.toRaiseError("__invalid_overrides__");
});

test("module scopes reject same-key bindings with incompatible public token types", () => {
    const NumberHooks = multiToken("Hooks").of<number>();
    const StringHooks = multiToken("Hooks").of<string>();
    const AppModule = defineModule({
        bindings: [exported(bind(StringHooks, () => "hook"))],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [StringHooks],
    });
    const app = defineContainer.module(App).create();

    expect(() => {
        app.createScope(bind(NumberHooks, () => 1));
    }).type.toRaiseError("__token_not_in_tokens__");

    expect(NumberHooks).type.toBe<MultiToken<"Hooks", number>>();
});
