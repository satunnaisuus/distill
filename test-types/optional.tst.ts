import {
    all,
    bind,
    createContainer,
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

test("optional preserves direct, lazy, ref, and all dependency types", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const allHandlers = all(handlers);

    expect(optional(tokens.config)).type.toBe<OptionalToken<typeof tokens.config>>();
    expect(optional(() => tokens.config)).type.toBe<OptionalToken<typeof tokens.config>>();
    expect(optional(ref(tokens.logger))).type.toBe<OptionalToken<RefToken<typeof tokens.logger>>>();
    expect(optional(allHandlers)).type.toBe<OptionalToken<typeof allHandlers>>();
});

test("optional dependencies infer undefined factory parameters", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const binding = bind(
        tokens.server,
        {
            config: optional(tokens.config),
            handlers: optional(all(handlers)),
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
    const allHandlers = all(handlers);

    expect<
        ResolvedDependencies<{
            readonly config: OptionalToken<typeof tokens.config>;
            readonly handlers: OptionalToken<typeof allHandlers>;
            readonly logger: OptionalToken<RefToken<typeof tokens.logger>>;
        }>
    >().type.toBe<{
        readonly config: Config | undefined;
        readonly handlers: Handler[] | undefined;
        readonly logger: Ref<Logger> | undefined;
    }>();
});

test("createContainer allows singleton bindings with missing optional dependencies", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.server, { config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 3000,
        })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("optional dependency tokens must still belong to the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.port, { external: optional(externalToken) }, ({ external }) => external ?? 3000),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("optional ref dependency tokens must still belong to the token list", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { external: optional(ref(externalToken)) }, () => ({
                port: 3000,
            })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("optional all dependency tokens must still belong to the token list", () => {
    const handlers = multiToken("handlers").of<Handler>();
    const registry = token("registry").of<{ readonly handlers: Handler[] | undefined }>();

    expect(() => {
        createContainer(
            [registry],
            bind(registry, { handlers: optional(all(handlers)) }, ({ handlers }) => ({ handlers })),
        );
    }).type.toRaiseError("__dependencies_not_in_tokens__");
});

test("registered optional dependencies still validate transitive missing dependencies", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.server, { port: optional(tokens.port) }, ({ port }) => ({
                port: port ?? 3000,
            })),
            bind(tokens.port, { config: tokens.config }, ({ config }) => config.port),
        );
    }).type.toRaiseError("__missing_dependencies__");
});

test("missing optional dependencies do not block scoped and transient resolve surfaces", () => {
    const container = createContainer(
        tokenList,
        bind.scoped(tokens.server, { config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 3000,
        })),
        bind.transient(tokens.port, { config: optional(tokens.config) }, ({ config }) => config?.port ?? 3000),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
    expect(container.resolve(tokens.port)).type.toBe<number>();
});

test("registered optional scoped dependencies are still rejected from singleton graphs", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind.singleton(tokens.server, { config: optional(tokens.config) }, ({ config }) => ({
                port: config?.port ?? 3000,
            })),
            bind.scoped(tokens.config, () => ({ port: 3000 })),
        );
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("missing optional scoped dependencies are allowed in singleton graphs", () => {
    const container = createContainer(
        tokenList,
        bind.singleton(tokens.server, { config: optional(tokens.config) }, ({ config }) => ({
            port: config?.port ?? 3000,
        })),
    );

    expect(container.resolve(tokens.server)).type.toBe<{ readonly port: number }>();
});

test("registered optional eager dependencies still participate in cycle validation", () => {
    expect(() => {
        createContainer(
            cycleTokenList,
            bind(cycleTokens.serviceA, { serviceB: optional(cycleTokens.serviceB) }, ({ serviceB }) => ({
                getB: () => serviceB as ServiceB,
            })),
            bind(cycleTokens.serviceB, { serviceA: cycleTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("optional refs do not participate in eager cycle validation", () => {
    const container = createContainer(
        cycleTokenList,
        bind(cycleTokens.serviceA, { serviceB: cycleTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(cycleTokens.serviceB, { serviceA: optional(ref(cycleTokens.serviceA)) }, ({ serviceA }) => ({
            getA: () => serviceA?.value as ServiceA,
        })),
    );

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
