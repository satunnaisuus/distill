import {
    type Binding,
    type Container,
    createContainer,
    type DependencyMap,
    defineTokens,
    type as defineType,
    type Ref,
    type RefToken,
    type ResolvedDependencies,
    type Token,
    type TokenDefinitions,
    type Tokens,
    type TypeDescriptor,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";
import type { Config, Logger } from "./fixtures/services.js";
import type { tokens } from "./fixtures/tokens.js";

test("public helper types preserve their documented type relationships", () => {
    type Definitions = {
        readonly config: TypeDescriptor<Config>;
        readonly logger: TypeDescriptor<Logger>;
        readonly port: TypeDescriptor<number>;
    };
    type Dependencies = {
        readonly config: typeof tokens.config;
        readonly logger: RefToken<typeof tokens.logger>;
    };

    expect(defineType<Config>()).type.toBe<TypeDescriptor<Config>>();
    expect(defineType()).type.toBe<TypeDescriptor<unknown>>();
    expect<Definitions>().type.toBeAssignableTo<TokenDefinitions>();
    expect<Tokens<Definitions>>().type.toBe<{
        readonly config: Token<"config", Config>;
        readonly logger: Token<"logger", Logger>;
        readonly port: Token<"port", number>;
    }>();
    expect<Dependencies>().type.toBeAssignableTo<DependencyMap>();
    expect<ResolvedDependencies<Dependencies>>().type.toBe<{
        readonly config: Config;
        readonly logger: Ref<Logger>;
    }>();
    expect<Binding<typeof tokens.port>["factory"]>().type.toBe<() => number>();
    expect<Binding<typeof tokens.port, { readonly config: typeof tokens.config }>["factory"]>().type.toBe<
        (dependencies: { readonly config: Config }) => number
    >();
    expect<Parameters<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>[0]>().type.toBe<
        typeof tokens.port
    >();
    expect<ReturnType<Container<readonly [Binding<typeof tokens.port>]>["resolve"]>>().type.toBe<number>();
});

test("defineTokens and createContainer preserve empty token registries", () => {
    const emptyTokens = defineTokens({});
    const container = createContainer(emptyTokens);

    expect(emptyTokens).type.toBe<{}>();
    expect(container.resolve).type.toBe<(token: never) => never>();
    expect<Parameters<typeof container.resolve>[0]>().type.toBe<never>();
});
