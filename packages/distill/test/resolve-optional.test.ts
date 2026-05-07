import { describe, expect, it, vi } from "vitest";
import { bind, composeModules, defineContainer, defineModule, multiToken, optional, token, unbind } from "../src/index";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly resolveOptional: (token: unknown) => unknown;
    readonly resolveAll: (token: unknown) => unknown[];
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};
const defineRuntimeContainer = defineContainer as unknown as (
    tokens: readonly unknown[],
    ...bindings: readonly unknown[]
) => {
    readonly create: (...overrides: readonly unknown[]) => RuntimeContainerForTest;
};
describe("resolveOptional", () => {
    it("resolves registered single tokens and uses the normal instance cache", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const config = { port: 3000 };
        const factory = vi.fn(() => config);
        const container = defineContainer([Config], bind(Config).factory(factory)).create();
        expect(container.resolveOptional(Config)).toBe(config);
        expect(container.resolve(Config)).toBe(config);
        expect(factory).toHaveBeenCalledTimes(1);
    });
    it("returns undefined for listed single tokens without a visible binding", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const container = defineContainer([Config]).create();
        expect(container.resolveOptional(Config)).toBeUndefined();
    });
    it("uses parent bindings and current scope bindings", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Request = token("Request").of<{
            readonly id: string;
        }>();
        const app = defineContainer(
            [Config, Request],
            bind(Config).factory(() => ({ port: 3000 })),
        ).create();
        const request = app.createScope(
            bind(Request)
                .scoped()
                .factory(() => ({ id: "request-1" })),
        );
        expect(app.resolveOptional(Config)).toEqual({ port: 3000 });
        expect(app.resolveOptional(Request)).toBeUndefined();
        expect(request.resolveOptional(Config)).toEqual({ port: 3000 });
        expect(request.resolveOptional(Request)).toEqual({ id: "request-1" });
    });
    it("returns undefined for bindings removed with unbind", () => {
        const Feature = token("Feature").of<{
            readonly enabled: boolean;
        }>();
        const Service = token("Service").of<{
            readonly feature:
                | {
                      readonly enabled: boolean;
                  }
                | undefined;
        }>();
        const definition = defineContainer(
            [Feature, Service],
            bind(Feature).factory(() => ({ enabled: true })),
            bind(Service).factory({ feature: optional(Feature) }, ({ feature }) => ({ feature })),
        );
        const testContainer = definition.create(unbind(Feature));
        expect(testContainer.resolveOptional(Feature)).toBeUndefined();
        expect(testContainer.resolve(Service)).toEqual({ feature: undefined });
    });
    it("does not hide missing dependencies from a registered binding", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Server = token("Server").of<{
            readonly port: number;
        }>();
        const container = defineRuntimeContainer(
            [Config, Server],
            bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
        ).create();
        expect(() => container.resolveOptional(Server)).toThrowError(
            'Service "Config" is not registered in the container',
        );
    });
    it("does not hide errors thrown by a registered binding factory", () => {
        const Broken = token("Broken").of<{
            readonly ok: boolean;
        }>();
        const container = defineContainer(
            [Broken],
            bind(Broken).factory(() => {
                throw new Error("factory failed");
            }),
        ).create();
        expect(() => container.resolveOptional(Broken)).toThrowError("factory failed");
    });
    it("throws for tokens outside the token list", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const External = token("External").of<{
            readonly port: number;
        }>();
        const container = defineRuntimeContainer([Config]).create();
        expect(() => container.resolveOptional(External)).toThrowError(
            'Token "External" is not included in the token list',
        );
    });
    it("throws for multibind tokens", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const container = defineRuntimeContainer([Hooks]).create();
        expect(() => container.resolveOptional(Hooks)).toThrowError(
            'Multibind token "Hooks" must be resolved with resolveAll',
        );
    });
    it("throws after disposal even when the token has no binding", async () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const container = defineContainer([Config]).create();
        await container.dispose();
        expect(() => container.resolveOptional(Config)).toThrowError("Container has been disposed");
    });
    it("respects module public visibility", () => {
        const Secret = token("Secret").of<{
            readonly value: string;
        }>();
        const Public = token("Public").of<{
            readonly value: string;
        }>();
        const AppModule = defineModule({
            exports: [Public],
            bindings: [
                bind(Secret).factory(() => ({ value: "secret" })),
                bind(Public).factory({ secret: Secret }, ({ secret }) => ({ value: secret.value })),
            ],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Public],
        });
        const app = App.createContainer();
        expect(app.resolveOptional(Public)).toEqual({ value: "secret" });
        expect(() => (app as RuntimeContainerForTest).resolveOptional(Secret)).toThrowError(
            'Service "Secret" is not exported by the module',
        );
    });
    it("extends module public visibility with scope bindings", () => {
        const Service = token("Service").of<{
            readonly name: string;
        }>();
        const Request = token("Request").of<{
            readonly id: string;
        }>();
        const AppModule = defineModule({
            exports: [Service],
            bindings: [bind(Service).factory(() => ({ name: "app" }))],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Service],
        });
        const app = App.createContainer() as RuntimeContainerForTest;
        const request = app.createScope(
            bind(Request)
                .scoped()
                .factory(() => ({ id: "request-1" })),
        );
        expect(() => app.resolveOptional(Request)).toThrowError('Service "Request" is not exported by the module');
        expect(request.resolveOptional(Request)).toEqual({ id: "request-1" });
    });
});
