import { describe, expect, it, vi } from "vitest";
import { all, bind, defineContainer, multiToken, token } from "../src/index";
import { tokenKey } from "../src/token/index";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly resolveAll: (token: unknown) => unknown[];
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};

const defineRuntimeContainer = defineContainer as unknown as (
    tokens: readonly unknown[],
    ...bindings: readonly unknown[]
) => { readonly create: () => RuntimeContainerForTest };

const createRuntimeContainer = (
    tokens: readonly unknown[],
    ...bindings: readonly unknown[]
): RuntimeContainerForTest => {
    return defineRuntimeContainer(tokens, ...bindings).create();
};

describe("multiToken", () => {
    it("creates a multibind token with a public token key", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        expect(tokenKey(Hooks)).toBe("Hooks");
    });

    it("collides with regular tokens that use the same public key", () => {
        const Hook = token("Hook").of<{ readonly name: string }>();
        const Hooks = multiToken("Hook").of<{ readonly name: string }>();

        expect(() => createRuntimeContainer([Hook, Hooks])).toThrowError(
            'Token "Hook" is already included in the token list',
        );
    });
});

describe("resolveAll", () => {
    it("resolves all bindings for a multibind token in registration order", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        const container = defineContainer(
            [Hooks],
            bind(Hooks).factory(() => ({ name: "first" })),
            bind(Hooks).factory(() => ({ name: "second" })),
        ).create();

        expect(container.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
    });

    it("returns an empty array when a multibind token has no bindings", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const container = defineContainer([Hooks]).create();

        expect(container.resolveAll(Hooks)).toEqual([]);
    });

    it("caches singleton multibind contributions independently", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const first = { name: "first" };
        const second = { name: "second" };
        const firstFactory = vi.fn(() => first);
        const secondFactory = vi.fn(() => second);

        const container = defineContainer(
            [Hooks],
            bind(Hooks).factory(firstFactory),
            bind(Hooks).factory(secondFactory),
        ).create();

        expect(container.resolveAll(Hooks)).toEqual([first, second]);
        expect(container.resolveAll(Hooks)).toEqual([first, second]);
        expect(firstFactory).toHaveBeenCalledTimes(1);
        expect(secondFactory).toHaveBeenCalledTimes(1);
    });

    it("creates transient multibind contributions for every resolveAll call", () => {
        const Hooks = multiToken("Hooks").of<{ readonly id: number }>();
        let nextId = 1;

        const container = defineContainer(
            [Hooks],
            bind(Hooks)
                .transient()
                .factory(() => ({ id: nextId++ })),
            bind(Hooks)
                .transient()
                .factory(() => ({ id: nextId++ })),
        ).create();

        expect(container.resolveAll(Hooks)).toEqual([{ id: 1 }, { id: 2 }]);
        expect(container.resolveAll(Hooks)).toEqual([{ id: 3 }, { id: 4 }]);
    });

    it("collects parent and child multibind contributions", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        const app = defineContainer(
            [Hooks],
            bind(Hooks).factory(() => ({ name: "root" })),
        ).create();
        const request = app.createScope(bind(Hooks).factory(() => ({ name: "request" })));

        expect(app.resolveAll(Hooks)).toEqual([{ name: "root" }]);
        expect(request.resolveAll(Hooks)).toEqual([{ name: "root" }, { name: "request" }]);
    });

    it("caches scoped multibind contributions in the resolution scope", () => {
        const Hooks = multiToken("Hooks").of<{ readonly id: number }>();
        let nextId = 1;

        const app = defineContainer(
            [Hooks],
            bind(Hooks)
                .scoped()
                .factory(() => ({ id: nextId++ })),
        ).create();
        const firstScope = app.createScope();
        const secondScope = app.createScope();

        const rootHooks = app.resolveAll(Hooks);
        const firstHooks = firstScope.resolveAll(Hooks);
        const secondHooks = secondScope.resolveAll(Hooks);

        expect(app.resolveAll(Hooks)).toEqual(rootHooks);
        expect(firstScope.resolveAll(Hooks)).toEqual(firstHooks);
        expect(secondScope.resolveAll(Hooks)).toEqual(secondHooks);
        expect(rootHooks).toEqual([{ id: 1 }]);
        expect(firstHooks).toEqual([{ id: 2 }]);
        expect(secondHooks).toEqual([{ id: 3 }]);
    });

    it("disposes multibind contributions in reverse creation order", async () => {
        const events: string[] = [];
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        const container = defineContainer(
            [Hooks],
            bind(Hooks)
                .factory(() => ({ name: "first" }))
                .disposable(() => events.push("first")),
            bind(Hooks)
                .factory(() => ({ name: "second" }))
                .disposable(() => events.push("second")),
        ).create();

        expect(container.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);

        await container.dispose();

        expect(events).toEqual(["second", "first"]);
    });

    it("throws when resolve is used for a multibind token", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hooks],
            bind(Hooks).factory(() => ({ name: "hook" })),
        );

        expect(() => container.resolve(Hooks)).toThrowError('Multibind token "Hooks" must be resolved with resolveAll');
    });

    it("rejects regular tokens with the same key as listed multibind tokens at runtime", () => {
        const Hook = token("Hook").of<{ readonly name: string }>();
        const Hooks = multiToken("Hook").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hooks],
            bind(Hooks).factory(() => ({ name: "hook" })),
        );

        expect(() => container.resolveAll(Hook)).toThrowError('Token "Hook" is not included in the token list');
    });

    it("rejects multibind tokens with the same key as listed regular tokens at runtime", () => {
        const Hook = token("Hook").of<{ readonly name: string }>();
        const Hooks = multiToken("Hook").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hook],
            bind(Hook).factory(() => ({ name: "hook" })),
        );

        expect(() => container.resolve(Hooks)).toThrowError('Token "Hook" is not included in the token list');
    });

    it("throws when resolveAll is used for a regular token", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const container = createRuntimeContainer(
            [Config],
            bind(Config).factory(() => ({ port: 3000 })),
        );

        expect(() => container.resolveAll(Config)).toThrowError('Token "Config" is not a multibind token');
    });
});

describe("all dependencies", () => {
    it("injects all multibind values into a dependency factory in registration order", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();
        const factory = vi.fn(({ hooks }: { readonly hooks: Array<{ readonly name: string }> }) => ({
            names: hooks.map((hook) => hook.name),
        }));

        const container = defineContainer(
            [Hooks, Registry],
            bind(Hooks).factory(() => ({ name: "first" })),
            bind(Hooks).factory(() => ({ name: "second" })),
            bind(Registry).factory({ hooks: all(Hooks) }, factory),
        ).create();

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory.mock.calls[0][0].hooks).toEqual([{ name: "first" }, { name: "second" }]);
    });

    it("injects an empty array when the multibind token has no bindings", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly count: number }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({ count: hooks.length })),
        ).create();

        expect(container.resolve(Registry)).toEqual({ count: 0 });
    });

    it("resolves all dependencies from the active resolution scope", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const app = defineContainer(
            [Hooks, Registry],
            bind(Hooks).factory(() => ({ name: "root" })),
            bind(Registry)
                .scoped()
                .factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
        ).create();
        const request = app.createScope(bind(Hooks).factory(() => ({ name: "request" })));

        expect(app.resolve(Registry)).toEqual({ names: ["root"] });
        expect(request.resolve(Registry)).toEqual({ names: ["root", "request"] });
    });

    it("resolves all dependencies before calling the dependent factory", () => {
        const calls: string[] = [];
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Hooks).factory(() => {
                calls.push("first");
                return { name: "first" };
            }),
            bind(Hooks).factory(() => {
                calls.push("second");
                return { name: "second" };
            }),
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => {
                calls.push("registry");
                return { names: hooks.map((hook) => hook.name) };
            }),
        ).create();

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(calls).toEqual(["first", "second", "registry"]);
    });

    it("tracks all-injected dependencies for disposal ordering", async () => {
        const events: string[] = [];
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly hooks: readonly { readonly name: string }[] }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Hooks)
                .factory(() => ({ name: "first" }))
                .disposable(() => events.push("first")),
            bind(Hooks)
                .factory(() => ({ name: "second" }))
                .disposable(() => events.push("second")),
            bind(Registry)
                .factory({ hooks: all(Hooks) }, ({ hooks }) => ({ hooks }))
                .disposable(() => events.push("registry")),
        ).create();

        expect(container.resolve(Registry)).toEqual({ hooks: [{ name: "first" }, { name: "second" }] });

        await container.dispose();

        expect(events).toEqual(["registry", "second", "first"]);
    });

    it("throws when all is used with a regular token at runtime", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Server = token("Server").of<{ readonly port: number }>();
        const allUnsafe = all as unknown as (dependency: unknown) => unknown;

        expect(() =>
            createRuntimeContainer(
                [Config, Server],
                bind(Config).factory(() => ({ port: 3000 })),
                bind(Server).factory({ configs: allUnsafe(Config) as never }, () => ({ port: 3000 })),
            ),
        ).toThrowError('Token "Config" is not a multibind token');
    });

    it("throws when a multibind token is used as a direct dependency without all", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        expect(() =>
            createRuntimeContainer(
                [Hooks, Registry],
                bind(Registry).factory({ hooks: Hooks as never }, () => ({ names: [] })),
            ),
        ).toThrowError('Multibind token "Hooks" must be resolved with resolveAll');
    });

    it("detects eager circular dependencies through all", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly hooks: readonly { readonly name: string }[] }>();

        expect(() =>
            createRuntimeContainer(
                [Hooks, Registry],
                bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({ hooks })),
                bind(Hooks).factory({ registry: Registry }, () => ({ name: "hook" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: Registry -> Hooks -> Registry");
    });
});
