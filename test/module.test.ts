import { describe, expect, it } from "vitest";
import { all } from "../src/all";
import { bind } from "../src/bind";
import { defineContainer } from "../src/container";
import { defineModule, exported } from "../src/module";
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
    it("resolves exported root bindings and hides internal root bindings", () => {
        const Config = token("Config").of<{ readonly url: string }>();
        const Pool = token("Pool").of<{ readonly url: string }>();
        const Db = token("Db").of<{ readonly url: string }>();

        const DbModule = defineModule({
            bindings: [
                bind(Config, () => ({ url: "postgres://localhost" })),
                bind(Pool, { config: Config }, ({ config }) => ({ url: config.url })),
                exported(bind(Db, { pool: Pool }, ({ pool }) => ({ url: pool.url }))),
            ],
        });

        const app = defineContainer.module(DbModule).create();

        expect(app.resolve(Db)).toEqual({ url: "postgres://localhost" });
        expect(() => (app as RuntimeContainerForTest).resolve(Pool)).toThrowError(
            'Service "Pool" is not exported by the module',
        );
    });

    it("allows imported exported bindings inside importers but hides imported internals", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Secret = token("Secret").of<{ readonly value: string }>();
        const Server = token("Server").of<{ readonly port: number }>();
        const Broken = token("Broken").of<{ readonly value: string }>();

        const ConfigModule = defineModule({
            bindings: [bind(Secret, () => ({ value: "internal" })), exported(bind(Config, () => ({ port: 3000 })))],
        });
        const ServerModule = defineModule({
            imports: [ConfigModule],
            bindings: [
                exported(bind(Server, { config: Config }, ({ config }) => ({ port: config.port }))),
                exported(bind(Broken, { secret: Secret }, ({ secret }) => ({ value: secret.value })) as never),
            ],
        } as never);

        const app = defineContainer.module(ServerModule).create();

        expect(app.resolve(Server)).toEqual({ port: 3000 });
        expect(() => app.resolve(Broken)).toThrowError('Service "Secret" is not registered in the container');
    });

    it("keeps same-key internals isolated across unrelated modules", () => {
        const Shared = token("Shared").of<{ readonly value: string }>();
        const First = token("First").of<{ readonly value: string }>();
        const Second = token("Second").of<{ readonly value: string }>();
        const Combined = token("Combined").of<{ readonly values: readonly string[] }>();

        const FirstModule = defineModule({
            bindings: [
                bind(Shared, () => ({ value: "first" })),
                exported(bind(First, { shared: Shared }, ({ shared }) => ({ value: shared.value }))),
            ],
        });
        const SecondModule = defineModule({
            bindings: [
                bind(Shared, () => ({ value: "second" })),
                exported(bind(Second, { shared: Shared }, ({ shared }) => ({ value: shared.value }))),
            ],
        });
        const AppModule = defineModule({
            imports: [FirstModule, SecondModule],
            bindings: [
                exported(
                    bind(Combined, { first: First, second: Second }, ({ first, second }) => ({
                        values: [first.value, second.value],
                    })),
                ),
            ],
        });

        const app = defineContainer.module(AppModule).create();

        expect(app.resolve(Combined)).toEqual({ values: ["first", "second"] });
    });

    it("keeps private same-key single and multibind tokens isolated across unrelated modules", () => {
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

        expect(app.resolve(Combined)).toEqual({ first: "single", second: ["multi"] });
    });

    it("keeps root module overrides out of imported module internals", () => {
        const Shared = token("Shared").of<{ readonly value: string }>();
        const Imported = token("Imported").of<{ readonly sharedValue: string }>();
        const App = token("App").of<{
            readonly importedSharedValue: string;
            readonly rootSharedValue: string;
        }>();

        const ImportedModule = defineModule({
            bindings: [
                bind(Shared, () => ({ value: "imported-private" })),
                exported(bind(Imported, { shared: Shared }, ({ shared }) => ({ sharedValue: shared.value }))),
            ],
        });
        const AppModule = defineModule({
            imports: [ImportedModule],
            bindings: [
                exported(bind(Shared, () => ({ value: "root-public" }))),
                exported(
                    bind(App, { imported: Imported, shared: Shared }, ({ imported, shared }) => ({
                        importedSharedValue: imported.sharedValue,
                        rootSharedValue: shared.value,
                    })),
                ),
            ],
        });

        const app = defineContainer
            .module(AppModule)
            .create(override(bind(Shared, () => ({ value: "root-override" }))));

        expect(app.resolve(App)).toEqual({
            importedSharedValue: "imported-private",
            rootSharedValue: "root-override",
        });
    });

    it("rejects duplicate visible exported single tokens", () => {
        const Shared = token("Shared").of<{ readonly value: string }>();
        const FirstModule = defineModule({
            bindings: [exported(bind(Shared, () => ({ value: "first" })))],
        });
        const SecondModule = defineModule({
            bindings: [exported(bind(Shared, () => ({ value: "second" })))],
        });
        const AppModule = defineModule({
            imports: [FirstModule, SecondModule],
            bindings: [],
        } as never);

        expect(() => defineContainer.module(AppModule)).toThrowError(
            'Service "Shared" is already registered in the module context',
        );
    });

    it("exports concrete multibind contributions without exposing internal contributions", () => {
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

        expect(app.resolveAll(Hooks)).toEqual([{ name: "public" }]);
        expect(app.resolve(Registry)).toEqual({ names: ["internal", "public"] });
    });

    it("does not type-check or instantiate private multibind contributions through public resolveAll", () => {
        const Request = token("Request").of<{ readonly id: string }>();
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        const AppModule = defineModule({
            bindings: [
                bind.scoped(Hooks, { request: Request }, ({ request }) => ({ name: request.id })),
                exported(bind(Hooks, () => ({ name: "public" }))),
            ],
        });

        const app = defineContainer.module(AppModule).create();

        expect(app.resolveAll(Hooks)).toEqual([{ name: "public" }]);
    });

    it("does not let failed public lookups reserve token keys", () => {
        const Public = token("Public").of<{ readonly ok: true }>();
        const Future = token("Future").of<{ readonly value: string }>();
        const FutureMany = multiToken("Future").of<{ readonly value: string }>();
        const AppModule = defineModule({
            bindings: [exported(bind(Public, () => ({ ok: true })))],
        });
        const app = defineContainer.module(AppModule).create();

        expect(() => (app as RuntimeContainerForTest).resolve(Future)).toThrowError(
            'Token "Future" is not included in the token list',
        );

        const scope = app.createScope(bind(FutureMany, () => ({ value: "scoped" })));

        expect(scope.resolveAll(FutureMany)).toEqual([{ value: "scoped" }]);
    });

    it("removes private root multibind contributions when overrideAll replaces an exported token", () => {
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

        const app = defineContainer.module(AppModule).create(overrideAll(Hooks, []));

        expect(app.resolveAll(Hooks)).toEqual([]);
        expect(app.resolve(Registry)).toEqual({ names: [] });
    });

    it("supports optional, ref, scoped bindings, and disposal through module boundaries", async () => {
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

        const app = defineContainer.module(AppModule).create();
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

    it("applies public overrides without giving override factories access to internals", () => {
        const Internal = token("Internal").of<{ readonly value: string }>();
        const Public = token("Public").of<{ readonly value: string }>();

        const AppModule = defineModule({
            bindings: [
                bind(Internal, () => ({ value: "internal" })),
                exported(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
            ],
        });
        const definition = defineContainer.module(AppModule);

        expect(() => definition.create(override(bind(Internal, () => ({ value: "override" }))))).toThrowError(
            'Service "Internal" is not exported by the module',
        );

        const app = definition.create(
            override(bind(Public, { internal: Internal }, ({ internal }) => ({ value: internal.value }))),
        );

        expect(() => app.resolve(Public)).toThrowError('Service "Internal" is not registered in the container');
    });

    it("detects module import cycles", () => {
        const Service = token("Service").of<{ readonly name: string }>();
        const FirstModule = defineModule({
            bindings: [exported(bind(Service, () => ({ name: "first" })))],
        });
        const SecondModule = defineModule({
            imports: [FirstModule],
            bindings: [],
        });

        (FirstModule as { imports: readonly unknown[] }).imports = [SecondModule];

        expect(() => defineContainer.module(FirstModule)).toThrowError("Module import cycle detected");
    });
});
