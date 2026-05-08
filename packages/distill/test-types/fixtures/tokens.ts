import { type Binding, token } from "@satunnaisuus/distill";
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

export const tokens = {
    callableHandler: token("callableHandler").of<CallableHandler>(),
    config: token("config").of<Config>(),
    counter: token("counter").of<Counter>(),
    handler: token("handler").of<Handler>(),
    logger: token("logger").of<Logger>(),
    parser: token("parser").of<Parser>(),
    port: token("port").of<number>(),
    serviceConstructor: token("serviceConstructor").of<typeof InjectableService>(),
    server: token("server").of<Server>(),
    unknown: token("unknown").of(),
};

export const tokenList = [
    tokens.callableHandler,
    tokens.config,
    tokens.counter,
    tokens.handler,
    tokens.logger,
    tokens.parser,
    tokens.port,
    tokens.serviceConstructor,
    tokens.server,
    tokens.unknown,
] as const;

export const cycleTokens = {
    serviceA: token("serviceA").of<ServiceA>(),
    serviceB: token("serviceB").of<ServiceB>(),
};

export const cycleTokenList = [cycleTokens.serviceA, cycleTokens.serviceB] as const;

export type ServerBinding = Binding<typeof tokens.server, { readonly config: typeof tokens.config }>;
export type ConfigBinding = Binding<typeof tokens.config>;
export type PortBinding = Binding<typeof tokens.port>;
