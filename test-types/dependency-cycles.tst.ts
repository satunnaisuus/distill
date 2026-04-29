import { bind, createContainer, ref, token } from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { ServiceA, ServiceB } from "./fixtures/services.js";
import { cycleTokenList as tokenList, cycleTokens as tokens } from "./fixtures/tokens.js";

test("rejects eager circular dependencies without ref", () => {
    expect(() => {
        createContainer(
            tokenList,
            bind(tokens.serviceA, { serviceB: tokens.serviceB }, ({ serviceB }) => ({
                getB: () => serviceB,
            })),
            bind(tokens.serviceB, { serviceA: tokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
        );
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
        createContainer(
            selfTokenList,
            bind(selfTokens.service, { service: selfTokens.service }, () => ({
                name: "service" as const,
            })),
        );
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
        createContainer(
            longCycleTokenList,
            bind(longCycleTokens.serviceA, { serviceB: longCycleTokens.serviceB }, () => ({
                name: "a" as const,
            })),
            bind(longCycleTokens.serviceB, { serviceC: longCycleTokens.serviceC }, () => ({
                name: "b" as const,
            })),
            bind(longCycleTokens.serviceC, { serviceA: longCycleTokens.serviceA }, () => ({
                name: "c" as const,
            })),
        );
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
        createContainer(
            unorderedTokenList,
            bind(unorderedTokens.serviceC, { serviceA: unorderedTokens.serviceA }, () => ({
                name: "c" as const,
            })),
            bind(unorderedTokens.serviceA, { serviceB: unorderedTokens.serviceB }, () => ({
                name: "a" as const,
            })),
            bind(unorderedTokens.serviceB, { serviceC: unorderedTokens.serviceC }, () => ({
                name: "b" as const,
            })),
        );
    }).type.toRaiseError("__circular_dependency__");
});

test("allows cycles when a single ref breaks the eager path", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.serviceA, { serviceB: tokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(tokens.serviceB, { serviceA: ref(tokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    );

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

    const container = createContainer(
        longRefCycleTokenList,
        bind(longRefCycleTokens.serviceA, { serviceB: longRefCycleTokens.serviceB }, ({ serviceB }) => ({
            getB: () => serviceB,
        })),
        bind(longRefCycleTokens.serviceB, { serviceC: longRefCycleTokens.serviceC }, ({ serviceC }) => ({
            getC: () => serviceC,
        })),
        bind(longRefCycleTokens.serviceC, { serviceA: ref(longRefCycleTokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    );

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
        createContainer(
            mixedTokenList,
            bind(
                mixedTokens.serviceA,
                { serviceB: mixedTokens.serviceB, serviceC: ref(mixedTokens.serviceC) },
                ({ serviceB }) => ({
                    getB: () => serviceB,
                }),
            ),
            bind(mixedTokens.serviceB, { serviceA: mixedTokens.serviceA }, ({ serviceA }) => ({
                getA: () => serviceA,
            })),
            bind(mixedTokens.serviceC, () => ({
                name: "c" as const,
            })),
        );
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
        createContainer(
            branchingTokenList,
            bind(
                branchingTokens.serviceA,
                { serviceB: branchingTokens.serviceB, serviceC: branchingTokens.serviceC },
                () => ({
                    name: "a" as const,
                }),
            ),
            bind(branchingTokens.serviceB, () => ({
                name: "b" as const,
            })),
            bind(branchingTokens.serviceC, { serviceA: branchingTokens.serviceA }, () => ({
                name: "c" as const,
            })),
        );
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
        createContainer(
            unionCycleTokenList,
            bind(unionCycleTokens.serviceA, { next: serviceBOrC }, () => ({
                name: "a" as const,
            })),
            bind(unionCycleTokens.serviceB, { serviceA: unionCycleTokens.serviceA }, () => ({
                name: "b" as const,
            })),
            bind(unionCycleTokens.serviceC, () => ({
                name: "c" as const,
            })),
        );
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

    const container = createContainer(
        unionTokenList,
        bind(unionTokens.serviceA, { next: serviceBOrC }, ({ next }) => ({
            getNext: () => next,
        })),
        bind(unionTokens.serviceB, () => ({
            name: "b" as const,
        })),
        bind(unionTokens.serviceC, () => ({
            name: "c" as const,
        })),
    );

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

    const container = createContainer(
        unionRefTokenList,
        bind(unionRefTokens.serviceA, { next: ref(serviceBOrC) }, ({ next }) => ({
            getNext: () => next.value,
        })),
        bind(unionRefTokens.serviceB, { serviceA: unionRefTokens.serviceA }, ({ serviceA }) => ({
            getA: () => serviceA,
        })),
        bind(unionRefTokens.serviceC, () => ({
            name: "c" as const,
        })),
    );

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

    const container = createContainer(
        acyclicTokenList,
        bind(acyclicTokens.serviceA, { serviceB: acyclicTokens.serviceB, serviceC: acyclicTokens.serviceC }, () => ({
            name: "a" as const,
        })),
        bind(acyclicTokens.serviceB, { serviceD: acyclicTokens.serviceD }, () => ({
            name: "b" as const,
        })),
        bind(acyclicTokens.serviceC, { serviceD: acyclicTokens.serviceD }, () => ({
            name: "c" as const,
        })),
        bind(acyclicTokens.serviceD, () => ({
            name: "d" as const,
        })),
    );

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

    const container = createContainer(
        selfRefTokenList,
        bind(selfRefTokens.service, { service: ref(selfRefTokens.service) }, ({ service }) => ({
            getSelf: () => service.value,
        })),
    );

    expect(container.resolve(selfRefTokens.service)).type.toBe<Service>();
});

test("allows circular dependencies through ref", () => {
    const container = createContainer(
        tokenList,
        bind(tokens.serviceA, { serviceB: ref(tokens.serviceB) }, ({ serviceB }) => ({
            getB: () => serviceB.value,
        })),
        bind(tokens.serviceB, { serviceA: ref(tokens.serviceA) }, ({ serviceA }) => ({
            getA: () => serviceA.value,
        })),
    );

    expect(container.resolve(tokens.serviceA)).type.toBe<ServiceA>();
    expect(container.resolve(tokens.serviceB)).type.toBe<ServiceB>();
});
