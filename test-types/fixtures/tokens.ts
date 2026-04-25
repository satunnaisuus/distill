import { type Binding, defineTokens, type as defineType } from "@satunnaisuus/distill";
import type {
    CallableHandler,
    Config,
    Counter,
    Handler,
    InjectableService,
    Logger,
    Parser,
    Server,
    ServiceA,
    ServiceB,
} from "./services.js";

export const tokens = defineTokens({
    callableHandler: defineType<CallableHandler>(),
    config: defineType<Config>(),
    counter: defineType<Counter>(),
    handler: defineType<Handler>(),
    logger: defineType<Logger>(),
    parser: defineType<Parser>(),
    port: defineType<number>(),
    serviceConstructor: defineType<typeof InjectableService>(),
    server: defineType<Server>(),
    unknown: defineType(),
});

export const cycleTokens = defineTokens({
    serviceA: defineType<ServiceA>(),
    serviceB: defineType<ServiceB>(),
});

export type ServerBinding = Binding<typeof tokens.server, { readonly config: typeof tokens.config }>;
export type ConfigBinding = Binding<typeof tokens.config>;
export type PortBinding = Binding<typeof tokens.port>;
