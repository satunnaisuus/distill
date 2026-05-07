import {
    all,
    bind,
    composeModules,
    defineContainer,
    defineModule,
    type MultiToken,
    multiToken,
    type QualifiedToken,
    qualified,
    qualifier,
    type RefToken,
    ref,
    type Token,
    type TokenKey,
    type TokenValue,
    token,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("symbol token keys preserve symbol identity and value types", () => {
    const configKey = Symbol("config");
    const Config = token(configKey).of<{
        readonly port: number;
    }>();
    const container = defineContainer(
        [Config],
        bind(Config).factory(() => ({ port: 3000 })),
    ).create();
    expect(Config).type.toBe<
        Token<
            typeof configKey,
            {
                readonly port: number;
            }
        >
    >();
    expect<TokenKey<typeof Config>>().type.toBe<typeof configKey>();
    expect<TokenValue<typeof Config>>().type.toBe<{
        readonly port: number;
    }>();
    expect(ref(Config)).type.toBe<RefToken<typeof Config>>();
    expect(container.resolve(Config)).type.toBe<{
        readonly port: number;
    }>();
});
test("class token keys default to the class instance type", () => {
    class Service {
        readonly status = "ready";
    }
    const ServiceToken = token(Service).of();
    const ExplicitServiceToken = token(Service).of<{
        readonly status: string;
    }>();
    const container = defineContainer([ServiceToken], bind(ServiceToken).class(Service)).create();
    expect(ServiceToken).type.toBe<Token<typeof Service, Service>>();
    expect(ExplicitServiceToken).type.toBe<
        Token<
            typeof Service,
            {
                readonly status: string;
            }
        >
    >();
    expect<TokenKey<typeof ServiceToken>>().type.toBe<typeof Service>();
    expect<TokenValue<typeof ServiceToken>>().type.toBe<Service>();
    expect(ref(ServiceToken)).type.toBe<RefToken<typeof ServiceToken>>();
    expect(container.resolve(ServiceToken)).type.toBe<Service>();
});
test("symbol and class multibind tokens preserve key identity", () => {
    class Hook {
        readonly name = "hook";
    }
    const hookKey = Symbol("hooks");
    const SymbolHooks = multiToken(hookKey).of<{
        readonly name: string;
    }>();
    const ClassHooks = multiToken(Hook).of();
    expect(SymbolHooks).type.toBe<
        MultiToken<
            typeof hookKey,
            {
                readonly name: string;
            }
        >
    >();
    expect(ClassHooks).type.toBe<MultiToken<typeof Hook, Hook>>();
    expect<TokenKey<typeof SymbolHooks>>().type.toBe<typeof hookKey>();
    expect<TokenKey<typeof ClassHooks>>().type.toBe<typeof Hook>();
    expect(all(SymbolHooks).resolveToken()).type.toBe<typeof SymbolHooks>();
    expect(all(ClassHooks).resolveToken()).type.toBe<typeof ClassHooks>();
});
test("qualified class tokens preserve the base token value type", () => {
    class Logger {
        readonly name = "logger";
    }
    const LoggerToken = token(Logger).of();
    const Json = qualifier("json");
    const JsonLogger = qualified(LoggerToken, Json);
    expect(JsonLogger).type.toBe<QualifiedToken<typeof LoggerToken, typeof Json>>();
    expect<TokenKey<typeof JsonLogger>>().type.toBe<string>();
    expect<TokenValue<typeof JsonLogger>>().type.toBe<Logger>();
});
test("nested qualified class tokens keep object runtime type", () => {
    class Logger {
        readonly name = "logger";
    }
    const Json = qualifier("json");
    const Special = qualifier("special");
    const JsonLogger = qualified(token(Logger).of(), Json);
    const SpecialJsonLogger = qualified(JsonLogger, Special);
    expect(SpecialJsonLogger).type.toBe<QualifiedToken<typeof JsonLogger, typeof Special>>();
    expect(SpecialJsonLogger).type.not.toBe<string>();
    expect<TokenKey<typeof SpecialJsonLogger>>().type.toBe<`${string}:special`>();
    expect<TokenValue<typeof SpecialJsonLogger>>().type.toBe<Logger>();
});
test("qualified class tokens with the same runtime name remain distinct", () => {
    const FirstLogger = class Logger {
        readonly id = "first";
    };
    const SecondLogger = class Logger {
        readonly id = "second";
    };
    const Json = qualifier("json");
    const FirstJsonLogger = qualified(token(FirstLogger).of(), Json);
    const SecondJsonLogger = qualified(token(SecondLogger).of(), Json);
    const container = defineContainer(
        [FirstJsonLogger, SecondJsonLogger],
        bind(FirstJsonLogger).factory(() => new FirstLogger()),
        bind(SecondJsonLogger).factory(() => new SecondLogger()),
    ).create();
    expect(container.resolve(FirstJsonLogger)).type.toBe<InstanceType<typeof FirstLogger>>();
    expect(container.resolve(SecondJsonLogger)).type.toBe<InstanceType<typeof SecondLogger>>();
});
test("duplicate validation uses symbol identity", () => {
    const symbolKey = Symbol("service");
    const SymbolService = token(symbolKey).of<{
        readonly id: "symbol";
    }>();
    const DuplicateSymbolService = token(symbolKey).of<{
        readonly id: "duplicate-symbol";
    }>();
    expect(() => {
        defineContainer([SymbolService, DuplicateSymbolService] as const);
    }).type.toRaiseError("__duplicate_token_key__");
});
test("different classes with the same runtime name remain distinct", () => {
    const FirstService = class Service {
        readonly id = "first";
    };
    const SecondService = class Service {
        readonly id = "second";
    };
    const First = token(FirstService).of();
    const Second = token(SecondService).of();
    const container = defineContainer(
        [First, Second],
        bind(First).class(FirstService),
        bind(Second).class(SecondService),
    ).create();
    expect(container.resolve(First)).type.toBe<InstanceType<typeof FirstService>>();
    expect(container.resolve(Second)).type.toBe<InstanceType<typeof SecondService>>();
});
test("different classes with the same public shape remain distinct", () => {
    class FirstService {}
    class SecondService {}
    const First = token(FirstService).of();
    const Second = token(SecondService).of();
    const container = defineContainer(
        [First, Second],
        bind(First).class(FirstService),
        bind(Second).class(SecondService),
    ).create();
    expect(container.resolve(First)).type.toBe<FirstService>();
    expect(container.resolve(Second)).type.toBe<SecondService>();
});
test("qualified string token identity does not collide on delimiters", () => {
    const First = qualified(token("A:B").of<"first">(), qualifier("C"));
    const Second = qualified(token("A").of<"second">(), qualifier("B:C"));
    const container = defineContainer(
        [First, Second],
        bind(First).factory(() => "first" as const),
        bind(Second).factory(() => "second" as const),
    ).create();
    expect<TokenKey<typeof First>>().type.toBe<"A:B:C">();
    expect<TokenKey<typeof Second>>().type.toBe<"A:B:C">();
    expect(container.resolve(First)).type.toBe<"first">();
    expect(container.resolve(Second)).type.toBe<"second">();
});
test("modules compose symbol and class tokens", () => {
    class Config {
        readonly port = 3000;
    }
    const ConfigToken = token(Config).of();
    const consumerKey = Symbol("Consumer");
    const Consumer = token(consumerKey).of<{
        readonly config: Config;
    }>();
    const ConsumerModule = defineModule({
        exports: [Consumer],
        imports: [ConfigToken],
        bindings: [bind(Consumer).factory({ config: ConfigToken }, ({ config }) => ({ config }))],
    });
    const ConfigModule = defineModule({
        exports: [ConfigToken],
        bindings: [bind(ConfigToken).class(Config)],
    });
    const App = composeModules({
        modules: [ConsumerModule, ConfigModule],
        exports: [Consumer],
    });
    const container = App.createContainer();
    expect(container.resolve(Consumer)).type.toBe<{
        readonly config: Config;
    }>();
});
