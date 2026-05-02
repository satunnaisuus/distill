import { describe, expect, it } from "vitest";
import { all } from "../src/all";
import { bind } from "../src/bind";
import { defineContainer } from "../src/container";
import { composeModules, defineModule, exported } from "../src/module";
import { optional } from "../src/optional";
import { override, overrideAll } from "../src/override";
import { ref } from "../src/ref";
import { multiToken, token } from "../src/token";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly resolveAll: (token: unknown) => unknown[];
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};

describe("defineContainer.module", () => {
    it("resolves imported single-token providers through an explicit composition root", () => {
        const Config = token("Config").of<{ readonly url: string }>();
        const Pool = token("Pool").of<{ readonly url: string }>();
        const Db = token("Db").of<{ readonly url: string }>();

        const ConfigModule = defineModule({
            bindings: [exported(bind(Config, () => ({ url: "postgres://localhost" })))],
        });
        const DbModule = defineModule({
            imports: [Config],
            bindings: [
                bind(Pool, { config: Config }, ({ config }) => ({ url: config.url })),
                exported(bind(Db, { pool: Pool }, ({ pool }) => ({ url: pool.url }))),
            ],
        });
        const App = composeModules({
            modules: [DbModule, ConfigModule],
            exports: [Db],
        });

        const app = defineContainer.module(App).create();

        expect(app.resolve(Db)).toEqual({ url: "postgres://localhost" });
        expect(() => (app as RuntimeContainerForTest).resolve(Pool)).toThrowError(
            'Service "Pool" is not exported by the module',
        );
    });

    it("keeps provider internals private across token imports", () => {
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
            imports: [Config],
            bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ value: config.value })))],
        });
        const App = composeModules({
            modules: [ConfigModule, ServerModule],
            exports: [Server],
        });

        const app = defineContainer.module(App).create();

        expect(app.resolve(Server)).toEqual({ value: "secret" });
        expect(() => (app as RuntimeContainerForTest).resolve(Secret)).toThrowError(
            'Service "Secret" is not exported by the module',
        );
    });

    it("uses composition exports as the only public resolve and override surface", () => {
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
            modules: [ConfigModule, ServerModule],
            exports: [Server],
        });
        const definition = defineContainer.module(App);

        expect(() => (definition.create() as RuntimeContainerForTest).resolve(Config)).toThrowError(
            'Service "Config" is not exported by the module',
        );
        expect(() => definition.create(override(bind(Config, () => ({ port: 4000 }))))).toThrowError(
            'Service "Config" is not exported by the module',
        );

        const app = definition.create(override(bind(Server, () => ({ port: 5000 }))));

        expect(app.resolve(Server)).toEqual({ port: 5000 });
    });

    it("applies public overrides to same-module exported dependencies", () => {
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
            exports: [Config, Server],
        });

        const app = defineContainer.module(App).create(override(bind(Config, () => ({ port: 4000 }))));

        expect(app.resolve(Config)).toEqual({ port: 4000 });
        expect(app.resolve(Server)).toEqual({ port: 4000 });
    });

    it("rejects direct module containers and old module-to-module imports", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const ConfigModule = defineModule({
            bindings: [exported(bind(Config, () => ({ port: 3000 })))],
        });

        expect(() => defineContainer.module(ConfigModule as never)).toThrowError(
            "Module container root must be created with composeModules",
        );
        expect(() =>
            defineModule({
                imports: [ConfigModule],
                bindings: [],
            } as never),
        ).toThrowError("Module imports must be tokens");
    });

    it("rejects duplicate local single-token bindings at runtime", () => {
        const Config = token("Config").of<{ readonly port: number }>();

        expect(() =>
            defineModule({
                bindings: [bind(Config, () => ({ port: 3000 })), bind(Config, () => ({ port: 4000 }))],
            } as never),
        ).toThrowError('Service "Config" is already registered in the module context');
    });

    it("rejects missing and ambiguous single-token import providers", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Server = token("Server").of<{ readonly port: number }>();

        const ServerModule = defineModule({
            imports: [Config],
            bindings: [exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port })))],
        });

        expect(() =>
            composeModules({
                modules: [ServerModule],
                exports: [Server],
            } as never),
        ).toThrowError('Service "Config" is imported by a module, but no exported provider exists');

        const FirstConfigModule = defineModule({
            bindings: [exported(bind(Config, () => ({ port: 3000 })))],
        });
        const SecondConfigModule = defineModule({
            bindings: [exported(bind(Config, () => ({ port: 4000 })))],
        });

        expect(() =>
            composeModules({
                modules: [ServerModule, FirstConfigModule, SecondConfigModule],
                exports: [Server],
            } as never),
        ).toThrowError('Service "Config" has multiple exported providers');
    });

    it("rejects mixed single and multibind exported providers with the same key", () => {
        const SingleHooks = token("Hooks").of<{ readonly name: string }>();
        const ManyHooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Public = token("Public").of<{ readonly ok: true }>();

        const SingleHooksModule = defineModule({
            bindings: [exported(bind(SingleHooks, () => ({ name: "single" })))],
        });
        const ManyHooksModule = defineModule({
            bindings: [exported(bind(ManyHooks, () => ({ name: "many" })))],
        });
        const PublicModule = defineModule({
            bindings: [exported(bind(Public, () => ({ ok: true as const })))],
        });

        expect(() =>
            composeModules({
                modules: [PublicModule, SingleHooksModule, ManyHooksModule],
                exports: [Public],
            } as never),
        ).toThrowError('Token "Hooks" has incompatible exported providers');
    });

    it("requires composition public exports to have exported providers", () => {
        const Public = token("Public").of<{ readonly ok: true }>();
        const Internal = token("Internal").of<{ readonly ok: true }>();
        const AppModule = defineModule({
            bindings: [bind(Internal, () => ({ ok: true as const }))],
        });

        expect(() =>
            composeModules({
                modules: [AppModule],
                exports: [Public],
            } as never),
        ).toThrowError('Service "Public" is exported, but no exported provider exists');
    });

    it("aggregates imported multibind contributions from exported providers only", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const FirstPluginModule = defineModule({
            bindings: [exported(bind(Hooks, () => ({ name: "first" })))],
        });
        const SecondPluginModule = defineModule({
            bindings: [
                bind(Hooks, () => ({ name: "private-plugin" })),
                exported(bind(Hooks, () => ({ name: "second" }))),
            ],
        });
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
        const App = composeModules({
            modules: [RegistryModule, FirstPluginModule, SecondPluginModule],
            exports: [Registry, Hooks],
        });

        const app = defineContainer.module(App).create();

        expect(app.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(app.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
    });

    it("keeps local private multibind contributions visible only inside the owning module", () => {
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

        expect(app.resolve(Registry)).toEqual({ names: ["local-private", "public"] });
        expect(app.resolveAll(Hooks)).toEqual([{ name: "public" }]);
    });

    it("allows multibind modules to consume their own exported contributions", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const RegistryModule = defineModule({
            imports: [Hooks],
            bindings: [
                exported(bind(Hooks, () => ({ name: "self" }))),
                exported(
                    bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
                        names: hooks.map((hook) => hook.name),
                    })),
                ),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule],
            exports: [Registry, Hooks],
        });

        const app = defineContainer.module(App).create();

        expect(app.resolve(Registry)).toEqual({ names: ["self"] });
        expect(app.resolveAll(Hooks)).toEqual([{ name: "self" }]);
    });

    it("rejects imported and public multibind tokens without exported contributions", () => {
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

        expect(() =>
            composeModules({
                modules: [RegistryModule],
                exports: [Registry],
            } as never),
        ).toThrowError('Multibind token "Hooks" is imported by a module, but no exported contributions exist');

        const EmptyModule = defineModule({ bindings: [] });

        expect(() =>
            composeModules({
                modules: [EmptyModule],
                exports: [Hooks],
            } as never),
        ).toThrowError('Multibind token "Hooks" is exported, but no exported contributions exist');
    });

    it("allows imported multibind contributions to be replaced through public overrideAll", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const PluginModule = defineModule({
            bindings: [exported(bind(Hooks, () => ({ name: "public" })))],
        });
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
        const App = composeModules({
            modules: [RegistryModule, PluginModule],
            exports: [Registry, Hooks],
        });

        const app = defineContainer.module(App).create(overrideAll(Hooks, [bind(Hooks, () => ({ name: "override" }))]));

        expect(app.resolveAll(Hooks)).toEqual([{ name: "override" }]);
        expect(app.resolve(Registry)).toEqual({ names: ["override"] });
    });

    it("supports optional, ref, scoped bindings, and disposal through composed modules", async () => {
        const events: string[] = [];
        const Config = token("Config").of<{ readonly name: string }>();
        const Request = token("Request").of<{ readonly id: string }>();
        const Service = token("Service").of<{ readonly getName: () => string; readonly requestId: string }>();

        const AppModule = defineModule({
            bindings: [
                bind(Config, () => ({ name: "app" }), {
                    dispose: () => events.push("config"),
                }),
                exported(
                    bind.scoped(
                        Service,
                        { config: ref(Config), request: optional(Request) },
                        ({ config, request }) => ({
                            getName: () => config.value.name,
                            requestId: request?.id ?? "none",
                        }),
                        {
                            dispose: () => events.push("service"),
                        },
                    ),
                ),
            ],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Service],
        });

        const app = defineContainer.module(App).create();
        const rootService = app.resolve(Service);
        const request = app.createScope(bind.scoped(Request, () => ({ id: "request-1" })));
        const requestService = request.resolve(Service);

        expect(rootService.requestId).toBe("none");
        expect(rootService.getName()).toBe("app");
        expect(requestService.requestId).toBe("request-1");
        expect(requestService.getName()).toBe("app");

        await request.dispose();
        await app.dispose();

        expect(events).toEqual(["service", "service", "config"]);
    });
});
