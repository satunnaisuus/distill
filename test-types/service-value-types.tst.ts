import { bind, createContainer, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("bind and resolve preserve falsy literal service value types", () => {
    const literalTokens = {
        disabled: token("disabled").of<false>(),
        empty: token("empty").of<undefined>(),
        none: token("none").of<null>(),
        zero: token("zero").of<0>(),
    };
    const disabledBinding = bind(literalTokens.disabled, () => false as const);
    const emptyBinding = bind(literalTokens.empty, () => undefined);
    const noneBinding = bind(literalTokens.none, () => null);
    const zeroBinding = bind(literalTokens.zero, () => 0 as const);
    const container = createContainer(
        Object.values(literalTokens),
        disabledBinding,
        emptyBinding,
        noneBinding,
        zeroBinding,
    );

    expect<ReturnType<typeof disabledBinding.factory>>().type.toBe<false>();
    expect<ReturnType<typeof emptyBinding.factory>>().type.toBe<undefined>();
    expect<ReturnType<typeof noneBinding.factory>>().type.toBe<null>();
    expect<ReturnType<typeof zeroBinding.factory>>().type.toBe<0>();
    expect(container.resolve(literalTokens.disabled)).type.toBe<false>();
    expect(container.resolve(literalTokens.empty)).type.toBe<undefined>();
    expect(container.resolve(literalTokens.none)).type.toBe<null>();
    expect(container.resolve(literalTokens.zero)).type.toBe<0>();
});

test("bind and resolve distinguish undefined service values from void", () => {
    const voidTokens = {
        empty: token("empty").of<undefined>(),
        sideEffect: token("sideEffect").of<void>(),
    };
    const emptyBinding = bind(voidTokens.empty, () => undefined);
    const sideEffectBinding = bind(voidTokens.sideEffect, () => {});
    const container = createContainer(Object.values(voidTokens), emptyBinding, sideEffectBinding);

    expect<ReturnType<typeof emptyBinding.factory>>().type.toBe<undefined>();
    expect<ReturnType<typeof sideEffectBinding.factory>>().type.toBe<void>();
    expect(container.resolve(voidTokens.empty)).type.toBe<undefined>();
    expect(container.resolve(voidTokens.sideEffect)).type.toBe<void>();
    expect(() => {
        bind(voidTokens.empty, () => {});
    }).type.toRaiseError();
});

test("bind and resolve preserve never service value types", () => {
    const neverTokens = {
        impossible: token("impossible").of<never>(),
    };
    const impossibleBinding = bind(neverTokens.impossible, () => {
        throw new Error("impossible");
    });
    const container = createContainer(Object.values(neverTokens), impossibleBinding);

    expect<ReturnType<typeof impossibleBinding.factory>>().type.toBe<never>();
    expect(container.resolve(neverTokens.impossible)).type.toBe<never>();

    expect(() => {
        bind(neverTokens.impossible, () => undefined);
    }).type.toRaiseError();
});
