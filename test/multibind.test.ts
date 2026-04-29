import { describe, expect, it, vi } from "vitest";
import { all } from "../src/all";
import { bind } from "../src/bind";
import { createContainer } from "../src/container";
import { multiToken, token, tokenKey } from "../src/token";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly resolveAll: (token: unknown) => unknown[];
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};

const createRuntimeContainer = createContainer as unknown as (
    tokens: readonly unknown[],
    ...bindings: readonly unknown[]
) => RuntimeContainerForTest;

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

        const container = createContainer(
            [Hooks],
            bind(Hooks, () => ({ name: "first" })),
            bind(Hooks, () => ({ name: "second" })),
        );

        expect(container.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
    });

    it("returns an empty array when a multibind token has no bindings", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const container = createContainer([Hooks]);

        expect(container.resolveAll(Hooks)).toEqual([]);
    });

    it("caches singleton multibind contributions independently", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const first = { name: "first" };
        const second = { name: "second" };
        const firstFactory = vi.fn(() => first);
        const secondFactory = vi.fn(() => second);

        const container = createContainer([Hooks], bind(Hooks, firstFactory), bind(Hooks, secondFactory));

        expect(container.resolveAll(Hooks)).toEqual([first, second]);
        expect(container.resolveAll(Hooks)).toEqual([first, second]);
        expect(firstFactory).toHaveBeenCalledTimes(1);
        expect(secondFactory).toHaveBeenCalledTimes(1);
    });

    it("creates transient multibind contributions for every resolveAll call", () => {
        const Hooks = multiToken("Hooks").of<{ readonly id: number }>();
        let nextId = 1;

        const container = createContainer(
            [Hooks],
            bind.transient(Hooks, () => ({ id: nextId++ })),
            bind.transient(Hooks, () => ({ id: nextId++ })),
        );

        expect(container.resolveAll(Hooks)).toEqual([{ id: 1 }, { id: 2 }]);
        expect(container.resolveAll(Hooks)).toEqual([{ id: 3 }, { id: 4 }]);
    });

    it("collects parent and child multibind contributions", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();

        const app = createContainer(
            [Hooks],
            bind(Hooks, () => ({ name: "root" })),
        );
        const request = app.createScope(bind(Hooks, () => ({ name: "request" })));

        expect(app.resolveAll(Hooks)).toEqual([{ name: "root" }]);
        expect(request.resolveAll(Hooks)).toEqual([{ name: "root" }, { name: "request" }]);
    });

    it("caches scoped multibind contributions in the resolution scope", () => {
        const Hooks = multiToken("Hooks").of<{ readonly id: number }>();
        let nextId = 1;

        const app = createContainer(
            [Hooks],
            bind.scoped(Hooks, () => ({ id: nextId++ })),
        );
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

        const container = createContainer(
            [Hooks],
            bind(Hooks, () => ({ name: "first" }), {
                dispose: () => events.push("first"),
            }),
            bind(Hooks, () => ({ name: "second" }), {
                dispose: () => events.push("second"),
            }),
        );

        expect(container.resolveAll(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);

        await container.dispose();

        expect(events).toEqual(["second", "first"]);
    });

    it("throws when resolve is used for a multibind token", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hooks],
            bind(Hooks, () => ({ name: "hook" })),
        );

        expect(() => container.resolve(Hooks)).toThrowError('Multibind token "Hooks" must be resolved with resolveAll');
    });

    it("rejects regular tokens with the same key as listed multibind tokens at runtime", () => {
        const Hook = token("Hook").of<{ readonly name: string }>();
        const Hooks = multiToken("Hook").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hooks],
            bind(Hooks, () => ({ name: "hook" })),
        );

        expect(() => container.resolveAll(Hook)).toThrowError('Token "Hook" is not included in the token list');
    });

    it("rejects multibind tokens with the same key as listed regular tokens at runtime", () => {
        const Hook = token("Hook").of<{ readonly name: string }>();
        const Hooks = multiToken("Hook").of<{ readonly name: string }>();
        const container = createRuntimeContainer(
            [Hook],
            bind(Hook, () => ({ name: "hook" })),
        );

        expect(() => container.resolve(Hooks)).toThrowError('Token "Hook" is not included in the token list');
    });

    it("throws when resolveAll is used for a regular token", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const container = createRuntimeContainer(
            [Config],
            bind(Config, () => ({ port: 3000 })),
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

        const container = createContainer(
            [Hooks, Registry],
            bind(Hooks, () => ({ name: "first" })),
            bind(Hooks, () => ({ name: "second" })),
            bind(Registry, { hooks: all(Hooks) }, factory),
        );

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory.mock.calls[0][0].hooks).toEqual([{ name: "first" }, { name: "second" }]);
    });

    it("injects an empty array when the multibind token has no bindings", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly count: number }>();

        const container = createContainer(
            [Hooks, Registry],
            bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({ count: hooks.length })),
        );

        expect(container.resolve(Registry)).toEqual({ count: 0 });
    });

    it("resolves all dependencies from the active resolution scope", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const app = createContainer(
            [Hooks, Registry],
            bind(Hooks, () => ({ name: "root" })),
            bind.scoped(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        );
        const request = app.createScope(bind(Hooks, () => ({ name: "request" })));

        expect(app.resolve(Registry)).toEqual({ names: ["root"] });
        expect(request.resolve(Registry)).toEqual({ names: ["root", "request"] });
    });

    it("resolves all dependencies before calling the dependent factory", () => {
        const calls: string[] = [];
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        const container = createContainer(
            [Hooks, Registry],
            bind(Hooks, () => {
                calls.push("first");
                return { name: "first" };
            }),
            bind(Hooks, () => {
                calls.push("second");
                return { name: "second" };
            }),
            bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => {
                calls.push("registry");
                return { names: hooks.map((hook) => hook.name) };
            }),
        );

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(calls).toEqual(["first", "second", "registry"]);
    });

    it("tracks all-injected dependencies for disposal ordering", async () => {
        const events: string[] = [];
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly hooks: readonly { readonly name: string }[] }>();

        const container = createContainer(
            [Hooks, Registry],
            bind(Hooks, () => ({ name: "first" }), {
                dispose: () => events.push("first"),
            }),
            bind(Hooks, () => ({ name: "second" }), {
                dispose: () => events.push("second"),
            }),
            bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({ hooks }), {
                dispose: () => events.push("registry"),
            }),
        );

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
                bind(Config, () => ({ port: 3000 })),
                bind(Server, { configs: allUnsafe(Config) as never }, () => ({ port: 3000 })),
            ),
        ).toThrowError('Token "Config" is not a multibind token');
    });

    it("throws when a multibind token is used as a direct dependency without all", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

        expect(() =>
            createRuntimeContainer(
                [Hooks, Registry],
                bind(Registry, { hooks: Hooks as never }, () => ({ names: [] })),
            ),
        ).toThrowError('Multibind token "Hooks" must be resolved with resolveAll');
    });

    it("detects eager circular dependencies through all", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly hooks: readonly { readonly name: string }[] }>();

        expect(() =>
            createRuntimeContainer(
                [Hooks, Registry],
                bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({ hooks })),
                bind(Hooks, { registry: Registry }, () => ({ name: "hook" })),
            ),
        ).toThrowError("Circular dependency detected while registering services: Registry -> Hooks -> Registry");
    });
});
