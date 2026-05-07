import {
    bind,
    defineContainer,
    multiToken,
    type OptionalToken,
    optional,
    type Ref,
    type RefToken,
    type ResolvedDependencies,
    ref,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Handler, Logger, ServiceA, ServiceB } from "./fixtures/services.js";
import { cycleTokenList, cycleTokens, tokenList, tokens } from "./fixtures/tokens.js";
import { externalToken } from "./fixtures/unsafe-tokens.js";

test("optional preserves direct, lazy, ref, and multibind dependency types", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect(optional(tokens.config)).type.toBe<OptionalToken<typeof tokens.config>>();
    expect(optional(() => tokens.config)).type.toBe<OptionalToken<typeof tokens.config>>();
    expect(optional(ref(tokens.logger))).type.toBe<OptionalToken<RefToken<typeof tokens.logger>>>();
    expect(optional(handlers)).type.toBe<OptionalToken<typeof handlers>>();
});

test("optional dependencies infer undefined factory parameters", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const binding = bind(tokens.server).factory(
        {
            config: optional(tokens.config),
            handlers: optional(handlers),
            logger: optional(ref(tokens.logger)),
            port: tokens.port,
        },
        ({ config, port }) => ({
            port: config?.port ?? port,
        }),
    );

    expect<Parameters<typeof binding.factory>[0]["config"]>().type.toBe<Config | undefined>();
    expect<Parameters<typeof binding.factory>[0]["handlers"]>().type.toBe<Handler[] | undefined>();
    expect<Parameters<typeof binding.factory>[0]["logger"]>().type.toBe<Ref<Logger> | undefined>();
    expect<Parameters<typeof binding.factory>[0]["port"]>().type.toBe<number>();
});

test("ResolvedDependencies exposes optional dependency values as undefined unions", () => {
    const handlers = multiToken("handlers").of<Handler>();

    expect<
        ResolvedDependencies<{
            readonly config: OptionalToken<typeof tokens.config>;
            readonly handlers: OptionalToken<typeof handlers>;
            readonly logger: OptionalToken<RefToken<typeof tokens.logger>>;
        }>
    >().type.toBe<{
        readonly config: Config | undefined;
        readonly handlers: Handler[] | undefined;
        readonly logger: Ref<Logger> | undefined;
    }>();
});

test("defineContainer allows singleton bindings with missing optional dependencies", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.server).factory({ config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 3000,
        })),
    ).create();

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("optional dependency tokens must still belong to the token list", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.port).factory({ external: optional(externalToken) }, ({ external }) => external ?? 3000),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("optional ref dependency tokens must still belong to the token list", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server).factory({ external: optional(ref(externalToken)) }, () => ({
                port: 3000,
            })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("optional multibind dependency tokens must still belong to the token list", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<{ readonly handlers: Handler[] | undefined }>();

    expect(() => {
        defineContainer(
            [registry],
            bind(registry).factory({ handlers: optional(handlers) }, ({ handlers }) => ({ handlers })),
        ).create();
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("registered optional dependencies still validate transitive missing dependencies", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server).factory({ port: optional(tokens.port) }, ({ port }) => ({
                port: port ?? 3000,
            })),
            bind(tokens.port).factory({ config: tokens.config }, ({ config }) => config.port),
        ).create();
    }).type.toRaiseError("__missing_dependencies__");
});

test("missing optional dependencies do not block scoped and transient resolve surfaces", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.server)
            .scoped()
            .factory({ config: optional(tokens.config) }, ({ config }) => ({
                port: config?.port ?? 3000,
            })),
        bind(tokens.port)
            .transient()
            .factory({ config: optional(tokens.config) }, ({ config }) => config?.port ?? 3000),
    ).create();

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("registered optional scoped dependencies are still rejected from singleton graphs", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.server)
                .singleton()
                .factory({ config: optional(tokens.config) }, ({ config }) => ({
                    port: config?.port ?? 3000,
                })),
            bind(tokens.config)
                .scoped()
                .factory(() => ({ port: 3000 })),
        ).create();
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("missing optional scoped dependencies are allowed in singleton graphs", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.server)
            .singleton()
            .factory({ config: optional(tokens.config) }, ({ config }) => ({
                port: config?.port ?? 3000,
            })),
    ).create();

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("registered optional eager dependencies still participate in cycle validation", () => {
    expect(() => {
        defineContainer(
            cycleTokenList,
            bind(cycleTokens.serviceA).factory({ serviceB: optional(cycleTokens.serviceB) }, ({ serviceB }) => ({
                getB: () => serviceB as ServiceB,
            })),
            bind(cycleTokens.serviceB).factory({ serviceA: cycleTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("optional refs do not participate in eager cycle validation", () => {
    const container = defineContainer(
        cycleTokenList,
        bind(cycleTokens.serviceA).factory({ serviceB: cycleTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(cycleTokens.serviceB).factory({ serviceA: optional(ref(cycleTokens.serviceA)) }, ({ serviceA }) => ({
            getA: () => serviceA?.value as ServiceA,
        })),
    ).create();

    expect(container.resolve(cycleTokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(cycleTokens.serviceB)).type.toBe<ServiceB>();
});

test("optional rejects dependency values that are not dependency references", () => {
    expect(() => {
        optional("config");
    }).type.toRaiseError();
});

test("optional rejects nested optional dependencies", () => {
    expect(() => {
        optional(optional(tokens.config));
    }).type.toRaiseError();
});
