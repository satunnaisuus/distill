import { describe, expect, it, vi } from "vitest";
import { isOptionalDependency } from "../src/dependency/optional";
import { optionalDependencyBrand } from "../src/dependency/reference-brands";
import { all, bind, defineContainer, multiToken, optional, ref, type Token, token } from "../src/index";

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

describe("optional", () => {
    it("creates an optional dependency for a direct token", () => {
        const Config = token("Config").of<{ readonly port: number }>();

        const dependency = optional(Config);

        expect(isOptionalDependency(dependency)).toBe(true);
        expect(dependency.resolveDependency()).toBe(Config);
    });

    it("creates a lazy optional dependency from a dependency factory", () => {
        const First = token("First").of<{ readonly name: "first" }>();
        const Second = token("Second").of<{ readonly name: "second" }>();
        let selectedToken: Token = First;
        const resolveDependency = vi.fn(() => selectedToken);

        const dependency = optional(resolveDependency);

        expect(resolveDependency).not.toHaveBeenCalled();

        selectedToken = Second;

        expect(dependency.resolveDependency()).toBe(Second);
        expect(resolveDependency).toHaveBeenCalledTimes(1);
    });
});

describe("isOptionalDependency", () => {
    it("returns true for optional dependencies", () => {
        const Config = token("Config").of<{ readonly port: number }>();

        expect(isOptionalDependency(optional(Config))).toBe(true);
    });

    it("returns true when the optional dependency brand is inherited", () => {
        const dependency = Object.create({
            [optionalDependencyBrand]: true,
        });

        expect(isOptionalDependency(dependency)).toBe(true);
    });

    it("returns false for non-optional runtime values", () => {
        const Config = token("Config").of<{ readonly port: number }>();

        expect(isOptionalDependency(Config)).toBe(false);
        expect(isOptionalDependency(ref(Config))).toBe(false);
        expect(isOptionalDependency({})).toBe(false);
        expect(isOptionalDependency(null)).toBe(false);
    });
});

describe("optional dependencies", () => {
    it("injects undefined for an unregistered optional eager dependency", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Server = token("Server").of<{ readonly port: number }>();
        const factory = vi.fn(({ config }: { readonly config: { readonly port: number } | undefined }) => ({
            port: config?.port ?? 8080,
        }));

        const container = defineContainer(
            [Config, Server],
            bind(Server).factory({ config: optional(Config) }, factory),
        ).create();

        expect(container.resolve(Server)).toEqual({ port: 8080 });
        expect(factory).toHaveBeenCalledWith({ config: undefined });
    });

    it("resolves an optional eager dependency before calling the dependent factory when it is registered", () => {
        const calls: string[] = [];
        const Config = token("Config").of<{ readonly port: number }>();
        const Server = token("Server").of<{ readonly port: number }>();

        const container = defineContainer(
            [Config, Server],
            bind(Server).factory({ config: optional(Config) }, ({ config }) => {
                calls.push("server");
                return { port: config?.port ?? 8080 };
            }),
            bind(Config).factory(() => {
                calls.push("config");
                return { port: 3000 };
            }),
        ).create();

        expect(container.resolve(Server)).toEqual({ port: 3000 });
        expect(calls).toEqual(["config", "server"]);
    });

    it("unwraps nested optional eager dependencies at runtime", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Server = token("Server").of<{ readonly port: number }>();
        const optionalUnsafe = optional as unknown as (dependency: unknown) => unknown;
        const nestedConfig = optionalUnsafe(optional(Config));

        const configuredContainer = createRuntimeContainer(
            [Config, Server],
            bind(Server).factory(
                { config: nestedConfig as never },
                ({ config }: { readonly config: { readonly port: number } | undefined }) => ({
                    port: config?.port ?? 8080,
                }),
            ),
            bind(Config).factory(() => ({ port: 3000 })),
        );
        const defaultContainer = createRuntimeContainer(
            [Config, Server],
            bind(Server).factory(
                { config: nestedConfig as never },
                ({ config }: { readonly config: { readonly port: number } | undefined }) => ({
                    port: config?.port ?? 8080,
                }),
            ),
        );

        expect(configuredContainer.resolve(Server)).toEqual({ port: 3000 });
        expect(defaultContainer.resolve(Server)).toEqual({ port: 8080 });
    });

    it("resolves optional eager dependencies from the active scope", () => {
        const Request = token("Request").of<{ readonly id: string }>();
        const Service = token("Service").of<{ readonly requestId: string }>();

        const app = defineContainer(
            [Request, Service],
            bind(Service)
                .scoped()
                .factory({ request: optional(Request) }, ({ request }) => ({
                    requestId: request?.id ?? "none",
                })),
        ).create();
        const requestScope = app.createScope(
            bind(Request)
                .scoped()
                .factory(() => ({ id: "request-1" })),
        );

        expect(app.resolve(Service)).toEqual({ requestId: "none" });
        expect(requestScope.resolve(Service)).toEqual({ requestId: "request-1" });
    });

    it("injects undefined for an unregistered optional ref dependency", () => {
        const Logger = token("Logger").of<{ readonly log: (message: string) => void }>();
        const Service = token("Service").of<{ readonly getLogger: () => unknown }>();

        const container = defineContainer(
            [Logger, Service],
            bind(Service).factory({ logger: optional(ref(Logger)) }, ({ logger }) => ({
                getLogger: () => logger?.value,
            })),
        ).create();

        expect(container.resolve(Service).getLogger()).toBeUndefined();
    });

    it("injects a lazy ref for a registered optional ref dependency", () => {
        const Logger = token("Logger").of<{ readonly log: (message: string) => void }>();
        const Service = token("Service").of<{
            readonly getLogger: () => { readonly log: (message: string) => void };
        }>();
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = defineContainer(
            [Logger, Service],
            bind(Service).factory({ logger: optional(ref(Logger)) }, ({ logger }) => ({
                getLogger: () => {
                    if (!logger) {
                        throw new Error("logger missing");
                    }

                    return logger.value;
                },
            })),
            bind(Logger).factory(loggerFactory),
        ).create();

        const service = container.resolve(Service);

        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(logger);
        expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    it("injects registered optional ref dependencies into transient factories", () => {
        const Logger = token("Logger").of<{ readonly log: (message: string) => void }>();
        const Service = token("Service").of<{
            readonly getLogger: () => { readonly log: (message: string) => void };
        }>();
        const logger = { log: vi.fn() };
        const loggerFactory = vi.fn(() => logger);

        const container = defineContainer(
            [Logger, Service],
            bind(Service)
                .transient()
                .factory({ logger: optional(ref(Logger)) }, ({ logger }) => ({
                    getLogger: () => {
                        if (!logger) {
                            throw new Error("logger missing");
                        }

                        return logger.value;
                    },
                })),
            bind(Logger).factory(loggerFactory),
        ).create();

        const service = container.resolve(Service);

        expect(loggerFactory).not.toHaveBeenCalled();
        expect(service.getLogger()).toBe(logger);
        expect(loggerFactory).toHaveBeenCalledTimes(1);
    });

    it("injects undefined for an optional all dependency without registered contributions", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] | undefined }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Registry).factory({ hooks: optional(all(Hooks)) }, ({ hooks }) => ({
                names: hooks?.map((hook) => hook.name),
            })),
        ).create();

        expect(container.resolve(Registry)).toEqual({ names: undefined });
    });

    it("resolves an optional all dependency when contributions are registered", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] | undefined }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Hooks).factory(() => ({ name: "first" })),
            bind(Hooks).factory(() => ({ name: "second" })),
            bind(Registry).factory({ hooks: optional(all(Hooks)) }, ({ hooks }) => ({
                names: hooks?.map((hook) => hook.name),
            })),
        ).create();

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
    });

    it("injects registered optional all dependencies into transient factories", () => {
        const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
        const Registry = token("Registry").of<{ readonly names: readonly string[] | undefined }>();

        const container = defineContainer(
            [Hooks, Registry],
            bind(Hooks).factory(() => ({ name: "first" })),
            bind(Hooks).factory(() => ({ name: "second" })),
            bind(Registry)
                .transient()
                .factory({ hooks: optional(all(Hooks)) }, ({ hooks }) => ({
                    names: hooks?.map((hook) => hook.name),
                })),
        ).create();

        expect(container.resolve(Registry)).toEqual({ names: ["first", "second"] });
    });

    it("throws when an optional eager dependency token is not in the token list", () => {
        const Port = token("Port").of<number>();
        const externalToken = "external" as Token<"external", number>;

        expect(() =>
            createRuntimeContainer(
                [Port],
                bind(Port).factory({ external: optional(externalToken) }, ({ external }) => external ?? 3000),
            ),
        ).toThrowError('Token "external" is not included in the token list');
    });

    it("throws when a registered optional dependency has an unresolved required dependency", () => {
        const Config = token("Config").of<{ readonly port: number }>();
        const Port = token("Port").of<number>();
        const Server = token("Server").of<{ readonly port: number }>();
        const container = createRuntimeContainer(
            [Config, Port, Server],
            bind(Server).factory({ port: optional(Port) }, ({ port }) => ({ port: port ?? 8080 })),
            bind(Port).factory({ config: Config }, ({ config }) => config.port),
        );

        expect(() => container.resolve(Server)).toThrowError('Service "Config" is not registered in the container');
    });

    it("detects eager cycles through registered optional dependencies", () => {
        const ServiceA = token("ServiceA").of<{ readonly name: "a" }>();
        const ServiceB = token("ServiceB").of<{ readonly name: "b" }>();

        expect(() =>
            createRuntimeContainer(
                [ServiceA, ServiceB],
                bind(ServiceA).factory({ serviceB: optional(ServiceB) }, () => ({ name: "a" as const })),
                bind(ServiceB).factory({ serviceA: ServiceA }, () => ({ name: "b" as const })),
            ),
        ).toThrowError("Circular dependency detected while registering services: ServiceA -> ServiceB -> ServiceA");
    });

    it("throws when an optional ref dependency resolves to a token outside the token list", () => {
        const Service = token("Service").of<{ readonly hasLogger: boolean }>();
        const externalToken = "external" as Token<"external", { readonly log: (message: string) => void }>;
        const container = createRuntimeContainer(
            [Service],
            bind(Service).factory({ logger: optional(ref(externalToken)) }, ({ logger }) => ({
                hasLogger: Boolean(logger),
            })),
        );

        expect(() => container.resolve(Service)).toThrowError('Token "external" is not included in the token list');
    });
});
