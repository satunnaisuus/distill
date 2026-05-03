import { bind, defineContainer } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { CallableHandler, Config, Counter, Handler, Parser } from "./fixtures/services.js";
import { InjectableService } from "./fixtures/services.js";
import { tokenList, tokens } from "./fixtures/tokens.js";

test("bind supports function-valued services", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.handler, () => (message) => message.length),
    ).create();

    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
});

test("bind supports callable object services", () => {
    const binding = bind(tokens.callableHandler, () =>
        Object.assign((message: string) => message.length, { kind: "callable" as const }),
    );
    const container = defineContainer(tokenList, binding).create();
    const callableHandler = container.resolve(tokens.callableHandler);

    expect(callableHandler).type.toBe<CallableHandler>();
    expect(callableHandler("ready")).type.toBe<number>();
    expect(callableHandler.kind).type.toBe<"callable">();
});

test("bind supports overloaded function services", () => {
    const parser = ((input: string | number) => {
        return typeof input === "string" ? input.length : input.toString();
    }) as Parser;
    const binding = bind(tokens.parser, () => parser);
    const container = defineContainer(tokenList, binding).create();
    const resolvedParser = container.resolve(tokens.parser);

    expect<ReturnType<typeof binding.factory>>().type.toBe<Parser>();
    expect(resolvedParser("ready")).type.toBe<number>();
    expect(resolvedParser(3000)).type.toBe<string>();

    expect(() => {
        bind(tokens.parser, parser);
    }).type.toRaiseError();
});

test("bind supports constructor-valued services", () => {
    const binding = bind(tokens.serviceConstructor, () => InjectableService);
    const container = defineContainer(tokenList, binding).create();
    const ServiceConstructor = container.resolve(tokens.serviceConstructor);

    expect<ReturnType<typeof binding.factory>>().type.toBe<typeof InjectableService>();
    expect(ServiceConstructor).type.toBe<typeof InjectableService>();
    expect(new ServiceConstructor().status).type.toBe<"ready">();

    expect(() => {
        bind(tokens.serviceConstructor, InjectableService);
    }).type.toRaiseError();
});

test("bind rejects direct function-valued services", () => {
    expect(() => {
        bind(tokens.handler, (message) => message.length);
    }).type.toRaiseError();
});

test("bind supports function-valued services with dependencies", () => {
    const binding = bind(tokens.handler, { config: tokens.config }, ({ config }) => (message) => {
        return message.length + config.port;
    });
    const container = defineContainer(
        tokenList,
        binding,
        bind(tokens.config, () => ({ port: 3000 })),
    ).create();

    expect<Parameters<typeof binding.factory>[0]["config"]>().type.toBe<Config>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Handler>();
    expect(container.resolve(tokens.handler)).type.toBe<Handler>();
});

test("bind requires factories for zero-argument function-valued services", () => {
    const binding = bind(tokens.counter, () => () => 1);
    const container = defineContainer(tokenList, binding).create();

    expect<typeof binding.factory>().type.toBe<() => Counter>();
    expect<ReturnType<typeof binding.factory>>().type.toBe<Counter>();
    expect(container.resolve(tokens.counter)).type.toBe<Counter>();

    expect(() => {
        bind(tokens.counter, () => 1);
    }).type.toRaiseError();
});
