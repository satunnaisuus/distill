import {
    bind,
    composeModules,
    defineContainer,
    defineModule,
    exported,
    type ModuleImportWire,
    override,
    provideImport,
    type QualifiedToken,
    qualified,
    qualifier,
    type TokenKey,
    type TokenValue,
    token,
    unbind,
} from "@satunnaisuus/distill";
import { expect, test } from "tstyche";

test("qualified tokens preserve base token value type", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);

    expect(JsonLogger).type.toBe<QualifiedToken<typeof Logger, typeof Json>>();
    expect(JsonLogger).type.not.toBe<"Logger:json">();
    expect<TokenKey<typeof JsonLogger>>().type.toBe<"Logger:json">();
    expect<TokenValue<typeof JsonLogger>>().type.toBe<{ readonly name: string }>();
});

test("bind.qualified requires the qualified token in flat container token lists", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const PlainJsonLogger = token("Logger:json").of<{ readonly name: string }>();

    const container = defineContainer(
        [JsonLogger],
        bind.qualified(Logger, Json, () => ({ name: "json" })),
    ).create();

    expect(container.resolve(JsonLogger)).type.toBe<{ readonly name: string }>();

    expect(() => {
        defineContainer(
            [Logger],
            bind.qualified(Logger, Json, () => ({ name: "json" })),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");

    expect(() => {
        defineContainer(
            [PlainJsonLogger],
            bind.qualified(Logger, Json, () => ({ name: "json" })),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");

    expect(() => {
        defineContainer(
            [JsonLogger],
            bind(PlainJsonLogger, () => ({ name: "plain" })),
        ).create();
    }).type.toRaiseError("__token_not_in_tokens__");
});

test("same-key plain and qualified module providers are not ambiguous", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const PlainJsonLogger = token("Logger:json").of<{ readonly name: string }>();
    const PlainLoggerModule = defineModule({
        bindings: [exported(bind(PlainJsonLogger, () => ({ name: "plain" })))],
    });
    const QualifiedLoggerModule = defineModule({
        bindings: [exported(bind.qualified(Logger, Json, () => ({ name: "qualified" })))],
    });
    const PlainApp = composeModules({
        modules: [PlainLoggerModule, QualifiedLoggerModule],
        exports: [PlainJsonLogger],
    });
    const QualifiedApp = composeModules({
        modules: [PlainLoggerModule, QualifiedLoggerModule],
        exports: [JsonLogger],
    });

    expect(defineContainer.module(PlainApp).create().resolve(PlainJsonLogger)).type.toBe<{
        readonly name: string;
    }>();
    expect(defineContainer.module(QualifiedApp).create().resolve(JsonLogger)).type.toBe<{
        readonly name: string;
    }>();
});

test("module imports do not satisfy same-key qualified dependencies", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const PlainJsonLogger = token("Logger:json").of<{ readonly name: string }>();
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();

    expect(() => {
        defineModule({
            imports: [PlainJsonLogger],
            bindings: [
                exported(
                    bind(Consumer, { logger: JsonLogger }, ({ logger }) => ({
                        loggerName: logger.name,
                    })),
                ),
            ],
        });
    }).type.toRaiseError("__missing_dependencies__");
});

test("provideImport wires single imports to assignable provider tokens", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();
    const ConsumerModule = defineModule({
        imports: [Logger],
        bindings: [
            exported(
                bind(Consumer, { logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ),
        ],
    });
    const LoggerModule = defineModule({
        bindings: [exported(bind.qualified(Logger, Json, () => ({ name: "json" })))],
    });
    const wire = provideImport(ConsumerModule, Logger).with(JsonLogger);

    expect(wire).type.toBe<ModuleImportWire<typeof ConsumerModule, typeof Logger, typeof JsonLogger>>();

    const App = composeModules({
        modules: [ConsumerModule, LoggerModule],
        wire: [wire],
        exports: [Consumer],
    });

    expect(defineContainer.module(App).create().resolve(Consumer)).type.toBe<{ readonly loggerName: string }>();
});

test("wired imports reject structurally ambiguous module targets", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const FirstConsumerModule = defineModule({
        imports: [Logger],
        bindings: [],
    });
    const SecondConsumerModule = defineModule({
        imports: [Logger],
        bindings: [],
    });
    const LoggerModule = defineModule({
        bindings: [
            exported(bind(Logger, () => ({ name: "plain" }))),
            exported(bind.qualified(Logger, Json, () => ({ name: "json" }))),
        ],
    });

    expect(() => {
        composeModules({
            modules: [FirstConsumerModule, SecondConsumerModule, LoggerModule],
            wire: [provideImport(FirstConsumerModule, Logger).with(JsonLogger)],
            exports: [JsonLogger],
        });
    }).type.toRaiseError("__ambiguous_wire_module__");
});

test("wired imports do not require an unwired provider when mixed with other imports", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Config = token("Config").of<{ readonly port: number }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const Consumer = token("Consumer").of<{ readonly loggerName: string; readonly port: number }>();
    const ConsumerModule = defineModule({
        imports: [Logger, Config],
        bindings: [
            exported(
                bind(Consumer, { logger: Logger, config: Config }, ({ logger, config }) => ({
                    loggerName: logger.name,
                    port: config.port,
                })),
            ),
        ],
    });
    const ProviderModule = defineModule({
        bindings: [
            exported(bind.qualified(Logger, Json, () => ({ name: "json" }))),
            exported(bind(Config, () => ({ port: 3000 }))),
        ],
    });
    const App = composeModules({
        modules: [ConsumerModule, ProviderModule],
        wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
        exports: [Consumer],
    });

    expect(defineContainer.module(App).create().resolve(Consumer)).type.toBe<{
        readonly loggerName: string;
        readonly port: number;
    }>();
});

test("provideImport rejects incompatible provider value types", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const NumberLogger = token("NumberLogger").of<{ readonly name: number }>();
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();
    const ConsumerModule = defineModule({
        imports: [Logger],
        bindings: [
            exported(
                bind(Consumer, { logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ),
        ],
    });

    expect(() => {
        provideImport(ConsumerModule, Logger).with(NumberLogger);
    }).type.toRaiseError("__wire_provider_value_not_assignable__");
});

test("wired scoped providers still fail singleton consumers", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();
    const ConsumerModule = defineModule({
        imports: [Logger],
        bindings: [
            exported(
                bind.singleton(Consumer, { logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ),
        ],
    });
    const LoggerModule = defineModule({
        bindings: [exported(bind.scoped.qualified(Logger, Json, () => ({ name: "json" })))],
    });

    expect(() => {
        composeModules({
            modules: [ConsumerModule, LoggerModule],
            wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
            exports: [Consumer],
        });
    }).type.toRaiseError("__scoped_dependency_in_singleton__");
});

test("wired provider overrides participate in module override validation", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();
    const ConsumerModule = defineModule({
        imports: [Logger],
        bindings: [
            exported(
                bind.singleton(Consumer, { logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ),
        ],
    });
    const LoggerModule = defineModule({
        bindings: [exported(bind.qualified(Logger, Json, () => ({ name: "json" })))],
    });
    const App = composeModules({
        modules: [ConsumerModule, LoggerModule],
        wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
        exports: [Consumer, JsonLogger],
    });
    const definition = defineContainer.module(App);

    expect(() => {
        definition.create(override(bind.scoped(JsonLogger, () => ({ name: "scoped" }))));
    }).type.toRaiseError("__invalid_overrides__");

    expect(() => {
        definition.create(unbind(JsonLogger));
    }).type.toRaiseError("__invalid_overrides__");
});

test("wired provider overrides match exact token identity when keys collide", () => {
    const Logger = token("Logger").of<{ readonly name: string }>();
    const Json = qualifier("json");
    const JsonLogger = qualified(Logger, Json);
    const PlainJsonLogger = token("Logger:json").of<{ readonly name: string }>();
    const Consumer = token("Consumer").of<{ readonly loggerName: string }>();
    const ConsumerModule = defineModule({
        imports: [PlainJsonLogger],
        bindings: [
            exported(
                bind(Consumer, { logger: PlainJsonLogger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ),
        ],
    });
    const LoggerModule = defineModule({
        bindings: [exported(bind.qualified(Logger, Json, () => ({ name: "json" })))],
    });
    const App = composeModules({
        modules: [ConsumerModule, LoggerModule],
        wire: [provideImport(ConsumerModule, PlainJsonLogger).with(JsonLogger)],
        exports: [Consumer, JsonLogger],
    });
    const app = defineContainer.module(App).create(override(bind(JsonLogger, () => ({ name: "override" }))));

    expect(app.resolve(Consumer)).type.toBe<{ readonly loggerName: string }>();
});
