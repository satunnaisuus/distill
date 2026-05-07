import {
    all,
    bind,
    composeModules,
    defineModule,
    type MultiToken,
    multiToken,
    override,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("module containers expose only composition exports", () => {
    const Internal = token("Internal").of<{
        readonly value: string;
    }>();
    const Public = token("Public").of<{
        readonly value: string;
    }>();
    const AppModule = defineModule({
        exports: [Public],
        bindings: [
            bind(Internal).factory(() => ({ value: "internal" })),
            bind(Public).factory({ internal: Internal }, ({ internal }) => ({ value: internal.value })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Public],
    });
    const app = App.createContainer();
    expect(app.resolve(Public)).type.toBe<{
        readonly value: string;
    }>();
    expect(() => {
        app.resolve(Internal);
    }).type.toRaiseError();
});
test("omitted composition exports expose all exported bindings", () => {
    const Internal = token("Internal").of<{
        readonly value: string;
    }>();
    const Public = token("Public").of<{
        readonly value: string;
    }>();
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const AppModule = defineModule({
        exports: [Public, Hooks],
        bindings: [
            bind(Internal).factory(() => ({ value: "internal" })),
            bind(Public).factory(() => ({ value: "public" })),
            bind(Hooks).factory(() => ({ name: "hook" })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
    });
    const app = App.createContainer();
    expect(app.resolve(Public)).type.toBe<{
        readonly value: string;
    }>();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
    expect(() => {
        app.resolve(Internal);
    }).type.toRaiseError();
});
test("module token imports allow factory dependencies after composition", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const Server = token("Server").of<{
        readonly port: number;
    }>();
    const ConfigModule = defineModule({
        exports: [Config],
        bindings: [bind(Config).factory(() => ({ port: 3000 }))],
    });
    const ServerModule = defineModule({
        exports: [Server],
        imports: [Config],
        bindings: [bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port }))],
    });
    const App = composeModules({
        modules: [ServerModule, ConfigModule],
        exports: [Server],
    });
    const app = App.createContainer();
    expect(app.resolve(Server)).type.toBe<{
        readonly port: number;
    }>();
});
test("old module-to-module imports no longer type-check", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const ConfigModule = defineModule({
        exports: [Config],
        bindings: [bind(Config).factory(() => ({ port: 3000 }))],
    });
    expect(() => {
        defineModule({
            imports: [ConfigModule],
            bindings: [],
        });
    }).type.toRaiseError();
});
test("only composed modules create containers", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const ConfigModule = defineModule({
        exports: [Config],
        bindings: [bind(Config).factory(() => ({ port: 3000 }))],
    });
    const App = composeModules({
        modules: [ConfigModule],
        exports: [Config],
    });
    expect(App.createContainer().resolve(Config)).type.toBe<{
        readonly port: number;
    }>();
    expect(() => {
        ConfigModule.createContainer();
    }).type.toRaiseError();
});
test("composeModules rejects missing and ambiguous single providers", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const Server = token("Server").of<{
        readonly port: number;
    }>();
    const ServerModule = defineModule({
        exports: [Server],
        imports: [Config],
        bindings: [bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port }))],
    });
    expect(() => {
        composeModules({
            modules: [ServerModule],
            exports: [Server],
        });
    }).type.toRaiseError("__missing_provider__");
    const FirstConfigModule = defineModule({
        exports: [Config],
        bindings: [bind(Config).factory(() => ({ port: 3000 }))],
    });
    const SecondConfigModule = defineModule({
        exports: [Config],
        bindings: [bind(Config).factory(() => ({ port: 4000 }))],
    });
    expect(() => {
        composeModules({
            modules: [ServerModule, FirstConfigModule, SecondConfigModule],
            exports: [Server],
        });
    }).type.toRaiseError("__ambiguous_provider__");
    const StringConfig = token("SameKeyConfig").of<string>();
    const NumberConfig = token("SameKeyConfig").of<number>();
    const Public = token("Public").of<{
        readonly ok: true;
    }>();
    const StringConfigModule = defineModule({
        exports: [StringConfig],
        bindings: [bind(StringConfig).factory(() => "config")],
    });
    const NumberConfigModule = defineModule({
        exports: [NumberConfig],
        bindings: [bind(NumberConfig).factory(() => 3000)],
    });
    const PublicModule = defineModule({
        exports: [Public],
        bindings: [bind(Public).factory(() => ({ ok: true as const }))],
    });
    expect(() => {
        composeModules({
            modules: [PublicModule, StringConfigModule, NumberConfigModule],
            exports: [Public],
        });
    }).type.toRaiseError("__ambiguous_provider__");
});
test("composeModules rejects public exports without providers", () => {
    const Public = token("Public").of<{
        readonly ok: true;
    }>();
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
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const StringModule = defineModule({
        exports: [StringHooks],
        bindings: [bind(StringHooks).factory(() => "hook")],
    });
    const NumberModule = defineModule({
        exports: [NumberHooks],
        bindings: [bind(NumberHooks).factory(() => 1)],
    });
    const RegistryModule = defineModule({
        exports: [Registry],
        imports: [StringHooks],
        bindings: [bind(Registry).factory({ hooks: all(StringHooks) }, ({ hooks }) => ({ names: hooks }))],
    });
    expect(() => {
        composeModules({
            modules: [RegistryModule, StringModule, NumberModule],
            exports: [Registry],
        });
    }).type.toRaiseError("__incompatible_provider__");
});
test("singleton consumers cannot capture scoped imported providers after composition", () => {
    const Request = token("Request").of<{
        readonly id: string;
    }>();
    const Service = token("Service").of<{
        readonly requestId: string;
    }>();
    const Consumer = token("Consumer").of<{
        readonly requestId: string;
    }>();
    const ApiModule = defineModule({
        exports: [Service],
        bindings: [
            bind(Service)
                .scoped()
                .factory({ request: Request }, ({ request }) => ({ requestId: request.id })),
        ],
    });
    const AppModule = defineModule({
        exports: [Consumer],
        imports: [Service],
        bindings: [
            bind(Consumer)
                .singleton()
                .factory({ service: Service }, ({ service }) => service),
        ],
    });
    expect(() => {
        composeModules({
            modules: [ApiModule, AppModule],
            exports: [Consumer],
        });
    }).type.toRaiseError("__invalid_modules__");
});
test("imported exported bindings preserve unresolved scoped dependencies", () => {
    const Request = token("Request").of<{
        readonly id: string;
    }>();
    const Service = token("Service").of<{
        readonly requestId: string;
    }>();
    const AppService = token("AppService").of<{
        readonly requestId: string;
    }>();
    const ApiModule = defineModule({
        exports: [Service],
        bindings: [
            bind(Service)
                .scoped()
                .factory({ request: Request }, ({ request }) => ({ requestId: request.id })),
        ],
    });
    const AppModule = defineModule({
        exports: [AppService],
        imports: [Service],
        bindings: [
            bind(AppService)
                .scoped()
                .factory({ service: Service }, ({ service }) => service),
        ],
    });
    const App = composeModules({
        modules: [ApiModule, AppModule],
        exports: [AppService],
    });
    const app = App.createContainer();
    expect(() => {
        app.resolve(AppService);
    }).type.toRaiseError();
    const requestScope = app.createScope(
        bind(Request)
            .scoped()
            .factory(() => ({ id: "request-1" })),
    );
    expect(requestScope.resolve(AppService)).type.toBe<{
        readonly requestId: string;
    }>();
});
test("module bindings reject imported internals", () => {
    const Secret = token("Secret").of<{
        readonly value: string;
    }>();
    const Public = token("Public").of<{
        readonly value: string;
    }>();
    const Broken = token("Broken").of<{
        readonly value: string;
    }>();
    const SecretModule = defineModule({
        exports: [Public],
        bindings: [
            bind(Secret).factory(() => ({ value: "secret" })),
            bind(Public).factory(() => ({ value: "public" })),
        ],
    });
    expect(() => {
        defineModule({
            exports: [Broken],
            imports: [Public],
            bindings: [bind(Broken).factory({ secret: Secret }, ({ secret }) => ({ value: secret.value }))],
        });
    }).type.toRaiseError("__missing_dependencies__");
    expect(SecretModule).type.not.toBe<never>();
});
test("single token imports cannot be locally rebound in the same module", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    expect(() => {
        defineModule({
            imports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
    }).type.toRaiseError("__duplicate_binding__");
});
test("single token imports cannot be re-exported without local providers", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    expect(() => {
        defineModule({
            imports: [Config],
            exports: [Config],
            bindings: [],
        });
    }).type.toRaiseError("__missing_export_binding__");
});
test("private single-token bindings may be repeated across modules", () => {
    const Shared = token("Shared").of<{
        readonly owner: string;
    }>();
    const First = token("First").of<{
        readonly owner: string;
    }>();
    const Second = token("Second").of<{
        readonly owner: string;
    }>();
    const FirstModule = defineModule({
        exports: [First],
        bindings: [
            bind(Shared).factory(() => ({ owner: "first" })),
            bind(First).factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
        ],
    });
    const SecondModule = defineModule({
        exports: [Second],
        bindings: [
            bind(Shared).factory(() => ({ owner: "second" })),
            bind(Second).factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
        ],
    });
    const App = composeModules({
        modules: [FirstModule, SecondModule],
        exports: [First, Second],
    });
    const app = App.createContainer();
    expect(app.resolve(First)).type.toBe<{
        readonly owner: string;
    }>();
    expect(app.resolve(Second)).type.toBe<{
        readonly owner: string;
    }>();
    expect(() => {
        app.resolve(Shared);
    }).type.toRaiseError();
});
test("module bindings reject same-key dependencies with incompatible token types", () => {
    const NumberPort = token("Port").of<number>();
    const StringPort = token("Port").of<string>();
    const Server = token("Server").of<{
        readonly port: string;
    }>();
    expect(() => {
        defineModule({
            exports: [Server],
            imports: [NumberPort],
            bindings: [bind(Server).factory({ port: StringPort }, ({ port }) => ({ port }))],
        });
    }).type.toRaiseError("__missing_dependencies__");
});
test("multibind imports aggregate exported contributions and owner-local contributions", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const PluginModule = defineModule({
        exports: [Hooks],
        bindings: [bind(Hooks).factory(() => ({ name: "public" }))],
    });
    const RegistryModule = defineModule({
        exports: [Registry],
        imports: [Hooks],
        bindings: [
            bind(Hooks).factory(() => ({ name: "local-private" })),
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ],
    });
    const App = composeModules({
        modules: [RegistryModule, PluginModule],
        exports: [Registry, Hooks],
    });
    const app = App.createContainer();
    expect(app.resolve(Registry)).type.toBe<{
        readonly names: readonly string[];
    }>();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
});
test("non-imported private multibind contributions stay isolated from exported providers", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const PluginModule = defineModule({
        exports: [Hooks],
        bindings: [bind(Hooks).factory(() => ({ name: "first" })), bind(Hooks).factory(() => ({ name: "second" }))],
    });
    const RegistryModule = defineModule({
        exports: [Registry],
        bindings: [
            bind(Hooks).factory(() => ({ name: "local-private" })),
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ],
    });
    const App = composeModules({
        modules: [PluginModule, RegistryModule],
        exports: [Hooks, Registry],
    });
    const app = App.createContainer();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
    expect(app.resolve(Registry)).type.toBe<{
        readonly names: readonly string[];
    }>();
});
test("unexported multibind tokens stay off the module public surface", () => {
    const InternalHooks = multiToken("InternalHooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const AppModule = defineModule({
        exports: [Registry],
        bindings: [
            bind(InternalHooks).factory(() => ({ name: "internal" })),
            bind(Registry).factory({ hooks: all(InternalHooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
    });
    const app = App.createContainer();
    expect(app.resolve(Registry)).type.toBe<{
        readonly names: readonly string[];
    }>();
    expect(() => {
        app.resolveAll(InternalHooks);
    }).type.toRaiseError();
});
test("module bindings reject undeclared multibind dependencies", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    expect(() => {
        defineModule({
            exports: [Registry],
            bindings: [
                bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
    }).type.toRaiseError("__missing_dependencies__");
});
test("exported multibind declarations are visible to module bindings", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const RegistryModule = defineModule({
        exports: [Hooks, Registry],
        bindings: [
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ],
    });
    const App = composeModules({
        modules: [RegistryModule],
        exports: [Registry, Hooks],
    });
    const app = App.createContainer();
    expect(app.resolve(Registry)).type.toBe<{
        readonly names: readonly string[];
    }>();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
});
test("private module bindings receive imported and owner-local multibind contributions", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Snapshot = token("Snapshot").of<{
        readonly names: readonly string[];
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const FirstPluginModule = defineModule({
        exports: [Hooks],
        bindings: [bind(Hooks).factory(() => ({ name: "first" }))],
    });
    const RegistryModule = defineModule({
        exports: [Registry],
        imports: [Hooks],
        bindings: [
            bind(Hooks).factory(() => ({ name: "local-private" })),
            bind(Snapshot).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
            bind(Registry).factory({ snapshot: Snapshot }, ({ snapshot }) => snapshot),
        ],
    });
    const SecondPluginModule = defineModule({
        exports: [Hooks],
        bindings: [bind(Hooks).factory(() => ({ name: "second" }))],
    });
    const App = composeModules({
        modules: [FirstPluginModule, RegistryModule, SecondPluginModule],
        exports: [Registry, Hooks],
    });
    const app = App.createContainer();
    expect(app.resolve(Registry)).type.toBe<{
        readonly names: readonly string[];
    }>();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
    expect(() => {
        app.resolve(Snapshot);
    }).type.toRaiseError();
});
test("multibind imports can be re-exported without local contributions", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const PluginModule = defineModule({
        exports: [Hooks],
        bindings: [bind(Hooks).factory(() => ({ name: "first" })), bind(Hooks).factory(() => ({ name: "second" }))],
    });
    const ReExportModule = defineModule({
        imports: [Hooks],
        exports: [Hooks],
        bindings: [],
    });
    const App = composeModules({
        modules: [ReExportModule, PluginModule],
        exports: [Hooks],
    });
    const app = App.createContainer();
    expect(app.resolveAll(Hooks)).type.toBe<
        Array<{
            readonly name: string;
        }>
    >();
});
test("composeModules allows exported multibind tokens without contributions", () => {
    const Hooks = multiToken("Hooks").of<{
        readonly name: string;
    }>();
    const Registry = token("Registry").of<{
        readonly names: readonly string[];
    }>();
    const RegistryModule = defineModule({
        exports: [Registry],
        imports: [Hooks],
        bindings: [
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ],
    });
    expect(() => {
        composeModules({
            modules: [RegistryModule],
            exports: [Registry],
        });
    }).type.toRaiseError("__missing_provider__");
    const EmptyModule = defineModule({
        exports: [Hooks],
        bindings: [],
    });
    const App = composeModules({
        modules: [RegistryModule, EmptyModule],
        exports: [Registry, Hooks],
    });
    const app = App.createContainer();
    expect(app.resolve(Registry)).type.toBe<{ readonly names: readonly string[] }>();
    expect(app.resolveAll(Hooks)).type.toBe<Array<{ readonly name: string }>>();
});
test("module overrides are limited to composition exports", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const Server = token("Server").of<{
        readonly port: number;
    }>();
    const AppModule = defineModule({
        exports: [Config, Server],
        bindings: [
            bind(Config).factory(() => ({ port: 3000 })),
            bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Server],
    });
    const definition = App;
    expect(() => {
        definition.createContainer(override(bind(Config).factory(() => ({ port: 4000 }))));
    }).type.toRaiseError("__override_token_not_in_tokens__");
    expect(() => {
        definition.createContainer(unbind(Config));
    }).type.toRaiseError("__override_token_not_in_tokens__");
    expect(
        definition.createContainer(override(bind(Server).factory(() => ({ port: 5000 })))).resolve(Server),
    ).type.toBe<{
        readonly port: number;
    }>();
});
test("module override types preserve non-overridden composition exports", () => {
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const Credentials = token("Credentials").of<{
        readonly port: number;
    }>();
    const Server = token("Server").of<{
        readonly port: number;
    }>();
    const AppModule = defineModule({
        exports: [Credentials, Config, Server],
        bindings: [
            bind(Credentials).factory(() => ({ port: 4000 })),
            bind(Config).factory(() => ({ port: 3000 })),
            bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Credentials, Config, Server],
    });
    const definition = App;
    expect(() => {
        definition.createContainer(
            override(
                bind(Config)
                    .scoped()
                    .factory(() => ({ port: 4000 })),
            ),
        );
    }).type.toRaiseError("__invalid_overrides__");
    expect(() => {
        definition.createContainer(unbind(Config));
    }).type.toRaiseError("__invalid_overrides__");
    const app = definition.createContainer(
        override(bind(Config).factory({ credentials: Credentials }, ({ credentials }) => ({ port: credentials.port }))),
    );
    expect(app.resolve(Config)).type.toBe<{
        readonly port: number;
    }>();
    expect(app.resolve(Server)).type.toBe<{
        readonly port: number;
    }>();
});
test("module override validation follows public override dependencies", () => {
    const Request = token("Request").of<{
        readonly port: number;
    }>();
    const Config = token("Config").of<{
        readonly port: number;
    }>();
    const Server = token("Server").of<{
        readonly port: number;
    }>();
    const AppModule = defineModule({
        exports: [Request, Config, Server],
        bindings: [
            bind(Request)
                .scoped()
                .factory(() => ({ port: 4000 })),
            bind(Config).factory(() => ({ port: 3000 })),
            bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
        ],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [Request, Config, Server],
    });
    const definition = App;
    expect(() => {
        definition.createContainer(
            override(
                bind(Config)
                    .transient()
                    .factory({ request: Request }, ({ request }) => ({ port: request.port })),
            ),
        );
    }).type.toRaiseError("__invalid_overrides__");
});
test("module scopes reject same-key bindings with incompatible public token types", () => {
    const NumberHooks = multiToken("Hooks").of<number>();
    const StringHooks = multiToken("Hooks").of<string>();
    const AppModule = defineModule({
        exports: [StringHooks],
        bindings: [bind(StringHooks).factory(() => "hook")],
    });
    const App = composeModules({
        modules: [AppModule],
        exports: [StringHooks],
    });
    const app = App.createContainer();
    expect(() => {
        app.createScope(bind(NumberHooks).factory(() => 1));
    }).type.toRaiseError("__token_not_in_tokens__");
    expect(NumberHooks).type.toBe<MultiToken<"Hooks", number>>();
});
