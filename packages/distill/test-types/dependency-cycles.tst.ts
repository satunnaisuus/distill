import { bind, defineContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { ServiceA, ServiceB } from "./fixtures/services.js";
import { cycleTokenList as tokenList, cycleTokens as tokens } from "./fixtures/tokens.js";

test("rejects eager circular dependencies without ref", () => {
    expect(() => {
        defineContainer(
            tokenList,
            bind(tokens.serviceA).factory({ serviceB: tokens.serviceB }, ({ serviceB }) => ({
                getB: () => serviceB,
            })),
            bind(tokens.serviceB).factory({ serviceA: tokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("rejects eager dependency on itself without ref", () => {
    type Service = {
        readonly name: "service";
    };
    const selfTokens = {
        service: token("service").of<Service>(),
    };
    const selfTokenList = [selfTokens.service] as const;

    expect(() => {
        defineContainer(
            selfTokenList,
            bind(selfTokens.service).factory({ service: selfTokens.service }, () => ({
                name: "service" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("rejects long eager circular dependencies without ref", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const longCycleTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const longCycleTokenList = [longCycleTokens.serviceA, longCycleTokens.serviceB, longCycleTokens.serviceC] as const;

    expect(() => {
        defineContainer(
            longCycleTokenList,
            bind(longCycleTokens.serviceA).factory({ serviceB: longCycleTokens.serviceB }, () => ({
                name: "a" as const,
            })),
            bind(longCycleTokens.serviceB).factory({ serviceC: longCycleTokens.serviceC }, () => ({
                name: "b" as const,
            })),
            bind(longCycleTokens.serviceC).factory({ serviceA: longCycleTokens.serviceA }, () => ({
                name: "c" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("rejects eager circular dependencies regardless of binding order", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unorderedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unorderedTokenList = [unorderedTokens.serviceA, unorderedTokens.serviceB, unorderedTokens.serviceC] as const;

    expect(() => {
        defineContainer(
            unorderedTokenList,
            bind(unorderedTokens.serviceC).factory({ serviceA: unorderedTokens.serviceA }, () => ({
                name: "c" as const,
            })),
            bind(unorderedTokens.serviceA).factory({ serviceB: unorderedTokens.serviceB }, () => ({
                name: "a" as const,
            })),
            bind(unorderedTokens.serviceB).factory({ serviceC: unorderedTokens.serviceC }, () => ({
                name: "b" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("allows cycles when a single ref breaks the eager path", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.serviceA).factory({ serviceB: tokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(tokens.serviceB).factory({ serviceA: ref(tokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    ).create();

    expect(container.resolve(tokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(tokens.serviceB)).type.toBe<ServiceB>();
});

test("allows long cycles when ref breaks the eager path", () => {
    type ServiceA = {
        readonly getB: () => ServiceB;
    };
    type ServiceB = {
        readonly getC: () => ServiceC;
    };
    type ServiceC = {
        readonly getA: () => ServiceA;
    };
    const longRefCycleTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const longRefCycleTokenList = [
        longRefCycleTokens.serviceA,
        longRefCycleTokens.serviceB,
        longRefCycleTokens.serviceC,
    ] as const;

    const container = defineContainer(
        longRefCycleTokenList,
        bind(longRefCycleTokens.serviceA).factory({ serviceB: longRefCycleTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(longRefCycleTokens.serviceB).factory({ serviceC: longRefCycleTokens.serviceC }, ({ serviceC }) => ({
            getC: () => serviceC,
        })),
        bind(longRefCycleTokens.serviceC).factory({ serviceA: ref(longRefCycleTokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    ).create();

    expect(container.resolve(longRefCycleTokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(longRefCycleTokens.serviceB)).type.toBe<ServiceB>();
    expect(container.resolve(longRefCycleTokens.serviceC)).type.toBe<ServiceC>();
});

test("rejects eager cycles when an unrelated ref dependency is present", () => {
    type ServiceA = {
        readonly getB: () => ServiceB;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    type ServiceC = {
        readonly name: "c";
    };
    const mixedTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const mixedTokenList = [mixedTokens.serviceA, mixedTokens.serviceB, mixedTokens.serviceC] as const;

    expect(() => {
        defineContainer(
            mixedTokenList,
            bind(mixedTokens.serviceA).factory(
                { serviceB: mixedTokens.serviceB, serviceC: ref(mixedTokens.serviceC) },
                ({ serviceB }) => ({
                    getB: () => serviceB,
                }),
            ),
            bind(mixedTokens.serviceB).factory({ serviceA: mixedTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
            bind(mixedTokens.serviceC).factory(() => ({
                name: "c" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("rejects cycles through a branching dependency graph", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const branchingTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const branchingTokenList = [branchingTokens.serviceA, branchingTokens.serviceB, branchingTokens.serviceC] as const;

    expect(() => {
        defineContainer(
            branchingTokenList,
            bind(branchingTokens.serviceA).factory(
                { serviceB: branchingTokens.serviceB, serviceC: branchingTokens.serviceC },
                () => ({
                    name: "a" as const,
                }),
            ),
            bind(branchingTokens.serviceB).factory(() => ({
                name: "b" as const,
            })),
            bind(branchingTokens.serviceC).factory({ serviceA: branchingTokens.serviceA }, () => ({
                name: "c" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("rejects cycles through eager union dependency tokens", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unionCycleTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unionCycleTokenList = [
        unionCycleTokens.serviceA,
        unionCycleTokens.serviceB,
        unionCycleTokens.serviceC,
    ] as const;
    const serviceBOrC = unionCycleTokens.serviceB as
        | typeof unionCycleTokens.serviceB
        | typeof unionCycleTokens.serviceC;

    expect(() => {
        defineContainer(
            unionCycleTokenList,
            bind(unionCycleTokens.serviceA).factory({ next: serviceBOrC }, () => ({
                name: "a" as const,
            })),
            bind(unionCycleTokens.serviceB).factory({ serviceA: unionCycleTokens.serviceA }, () => ({
                name: "b" as const,
            })),
            bind(unionCycleTokens.serviceC).factory(() => ({
                name: "c" as const,
            })),
        ).create();
    }).type.toRaiseError("__circular_dependency__");
});

test("allows acyclic eager union dependency tokens", () => {
    type ServiceA = {
        readonly getNext: () => ServiceB | ServiceC;
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unionTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unionTokenList = [unionTokens.serviceA, unionTokens.serviceB, unionTokens.serviceC] as const;
    const serviceBOrC = unionTokens.serviceB as typeof unionTokens.serviceB | typeof unionTokens.serviceC;

    const container = defineContainer(
        unionTokenList,
        bind(unionTokens.serviceA).factory({ next: serviceBOrC }, ({ next }) => ({
            getNext: () => next,
        })),
        bind(unionTokens.serviceB).factory(() => ({
            name: "b" as const,
        })),
        bind(unionTokens.serviceC).factory(() => ({
            name: "c" as const,
        })),
    ).create();

    expect(container.resolve(unionTokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(unionTokens.serviceB)).type.toBe<ServiceB>();
    expect(container.resolve(unionTokens.serviceC)).type.toBe<ServiceC>();
});

test("allows union dependency tokens when ref breaks the eager path", () => {
    type ServiceA = {
        readonly getNext: () => ServiceB | ServiceC;
    };
    type ServiceB = {
        readonly getA: () => ServiceA;
    };
    type ServiceC = {
        readonly name: "c";
    };
    const unionRefTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
    };
    const unionRefTokenList = [unionRefTokens.serviceA, unionRefTokens.serviceB, unionRefTokens.serviceC] as const;
    const serviceBOrC = unionRefTokens.serviceB as typeof unionRefTokens.serviceB | typeof unionRefTokens.serviceC;

    const container = defineContainer(
        unionRefTokenList,
        bind(unionRefTokens.serviceA).factory({ next: ref(serviceBOrC) }, ({ next }) => ({
            getNext: () => next.value,
        })),
        bind(unionRefTokens.serviceB).factory({ serviceA: unionRefTokens.serviceA }, ({ serviceA }) => ({
            getA: () => serviceA,
        })),
        bind(unionRefTokens.serviceC).factory(() => ({
            name: "c" as const,
        })),
    ).create();

    expect(container.resolve(unionRefTokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(unionRefTokens.serviceB)).type.toBe<ServiceB>();
    expect(container.resolve(unionRefTokens.serviceC)).type.toBe<ServiceC>();
});

test("allows acyclic eager dependency graphs with shared dependencies", () => {
    type ServiceA = {
        readonly name: "a";
    };
    type ServiceB = {
        readonly name: "b";
    };
    type ServiceC = {
        readonly name: "c";
    };
    type ServiceD = {
        readonly name: "d";
    };
    const acyclicTokens = {
        serviceA: token("serviceA").of<ServiceA>(),
        serviceB: token("serviceB").of<ServiceB>(),
        serviceC: token("serviceC").of<ServiceC>(),
        serviceD: token("serviceD").of<ServiceD>(),
    };
    const acyclicTokenList = [
        acyclicTokens.serviceA,
        acyclicTokens.serviceB,
        acyclicTokens.serviceC,
        acyclicTokens.serviceD,
    ] as const;

    const container = defineContainer(
        acyclicTokenList,
        bind(acyclicTokens.serviceA).factory(
            { serviceB: acyclicTokens.serviceB, serviceC: acyclicTokens.serviceC },
            () => ({
                name: "a" as const,
            }),
        ),
        bind(acyclicTokens.serviceB).factory({ serviceD: acyclicTokens.serviceD }, () => ({
            name: "b" as const,
        })),
        bind(acyclicTokens.serviceC).factory({ serviceD: acyclicTokens.serviceD }, () => ({
            name: "c" as const,
        })),
        bind(acyclicTokens.serviceD).factory(() => ({
            name: "d" as const,
        })),
    ).create();

    expect(container.resolve(acyclicTokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(acyclicTokens.serviceD)).type.toBe<ServiceD>();
});

test("allows self references through ref", () => {
    type Service = {
        readonly getSelf: () => Service;
    };
    const selfRefTokens = {
        service: token("service").of<Service>(),
    };
    const selfRefTokenList = [selfRefTokens.service] as const;

    const container = defineContainer(
        selfRefTokenList,
        bind(selfRefTokens.service).factory({ service: ref(selfRefTokens.service) }, ({ service }) => ({
            getSelf: () => service.value,
        })),
    ).create();

    expect(container.resolve(selfRefTokens.service)).type.toBe<Service>();
});

test("allows circular dependencies through ref", () => {
    const container = defineContainer(
        tokenList,
        bind(tokens.serviceA).factory({ serviceB: ref(tokens.serviceB) }, ({ serviceB }) => ({
            getB: () => serviceB.value,
        })),
        bind(tokens.serviceB).factory({ serviceA: ref(tokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    ).create();

    expect(container.resolve(tokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(tokens.serviceB)).type.toBe<ServiceB>();
});
