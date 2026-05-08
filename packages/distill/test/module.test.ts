import { describe, expect, it } from "vitest";
import {
    bind,
    composeModules,
    defineModule,
    multiToken,
    optional,
    override,
    overrideAll,
    provideImport,
    qualified,
    qualifier,
    ref,
    token,
    unbind,
} from "../src/index";
import { isComposedModuleDefinition, isModuleDefinition, isModuleImportWire } from "../src/module/index";
import { assertNoDuplicateTokenKeys, assertNoImportedLocalSingleBindings } from "../src/module/runtime-validation";

type RuntimeContainerForTest = {
    readonly resolve: (token: unknown) => unknown;
    readonly createScope: (...bindings: readonly unknown[]) => RuntimeContainerForTest;
    readonly dispose: () => Promise<void>;
    readonly disposed: boolean;
};
describe("module createContainer", () => {
    it("rejects single exports without local providers", () => {
        const Config = token("Config").of<{ readonly port: number }>();

        expect(() =>
            defineModule({
                exports: [Config],
                bindings: [],
            } as never),
        ).toThrowError('Service "Config" is exported by the module, but no local provider exists');
    });
    it("rejects re-exporting imported single tokens without local providers", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        expect(() =>
            defineModule({
                imports: [Config],
                exports: [Config],
                bindings: [],
            } as never),
        ).toThrowError('Service "Config" is exported by the module, but no local provider exists');
    });
    it("identifies module runtime definitions and import wires", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        const ConsumerModule = defineModule({
            imports: [Config],
            bindings: [],
        });
        const App = composeModules({
            modules: [ConfigModule],
            exports: [Config],
        });
        const wire = provideImport(ConsumerModule, Config).with(Config);
        expect(isModuleDefinition(ConfigModule)).toBe(true);
        expect(isModuleDefinition({})).toBe(false);
        expect(isModuleDefinition(null)).toBe(false);
        expect(isModuleDefinition("module")).toBe(false);
        expect(isComposedModuleDefinition(App)).toBe(true);
        expect(isComposedModuleDefinition({})).toBe(false);
        expect(isComposedModuleDefinition(null)).toBe(false);
        expect(isComposedModuleDefinition("composition")).toBe(false);
        expect(isModuleImportWire(wire)).toBe(true);
        expect(isModuleImportWire({})).toBe(false);
        expect(isModuleImportWire(null)).toBe(false);
        expect(isModuleImportWire("wire")).toBe(false);
    });
    it("supports symbol and class tokens in module imports and exports", () => {
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
        const app = App.createContainer();
        expect(app.resolve(Consumer).config).toBeInstanceOf(Config);
    });
    it("wires module imports to different qualified providers", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Json = qualifier("json");
        const Human = qualifier("human");
        const JsonLogger = qualified(Logger, Json);
        const HumanLogger = qualified(Logger, Human);
        const FirstConsumer = token("FirstConsumer").of<{
            readonly loggerName: string;
        }>();
        const SecondConsumer = token("SecondConsumer").of<{
            readonly loggerName: string;
        }>();
        const FirstConsumerModule = defineModule({
            exports: [FirstConsumer],
            imports: [Logger],
            bindings: [
                bind(FirstConsumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const SecondConsumerModule = defineModule({
            exports: [SecondConsumer],
            imports: [Logger],
            bindings: [
                bind(SecondConsumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [qualified(Logger, Json), qualified(Logger, Human)],
            bindings: [
                bind(qualified(Logger, Json)).factory(() => ({ name: "json" })),
                bind(qualified(Logger, Human)).factory(() => ({ name: "human" })),
            ],
        });
        const App = composeModules({
            modules: [FirstConsumerModule, SecondConsumerModule, LoggerModule],
            wire: [
                provideImport(FirstConsumerModule, Logger).with(JsonLogger),
                provideImport(SecondConsumerModule, Logger).with(HumanLogger),
            ],
            exports: [FirstConsumer, SecondConsumer],
        });
        const app = App.createContainer();
        expect(app.resolve(FirstConsumer)).toEqual({ loggerName: "json" });
        expect(app.resolve(SecondConsumer)).toEqual({ loggerName: "human" });
        expect(() => (app as RuntimeContainerForTest).resolve(JsonLogger)).toThrowError(
            'Service "Logger:json" is not exported by the module',
        );
    });
    it("does not expose qualified tokens through same-key plain exports", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(Logger, Json);
        const PlainJsonLogger = token("Logger:json").of<{
            readonly name: string;
        }>();
        const PlainLoggerModule = defineModule({
            exports: [PlainJsonLogger],
            bindings: [bind(PlainJsonLogger).factory(() => ({ name: "plain" }))],
        });
        const QualifiedLoggerModule = defineModule({
            exports: [qualified(Logger, Json)],
            bindings: [bind(qualified(Logger, Json)).factory(() => ({ name: "qualified" }))],
        });
        const App = composeModules({
            modules: [PlainLoggerModule, QualifiedLoggerModule],
            exports: [PlainJsonLogger],
        });
        const definition = App;
        const app = definition.createContainer();
        expect(app.resolve(PlainJsonLogger)).toEqual({ name: "plain" });
        expect(() => (app as RuntimeContainerForTest).resolve(JsonLogger)).toThrowError(
            'Service "Logger:json" is not exported by the module',
        );
        expect(() =>
            definition.createContainer(override(bind(JsonLogger).factory(() => ({ name: "override" })))),
        ).toThrowError('Service "Logger:json" is not exported by the module');
    });
    it("wires same-key plain imports to qualified providers by runtime identity", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(Logger, Json);
        const PlainJsonLogger = token("Logger:json").of<{
            readonly name: string;
        }>();
        const Consumer = token("Consumer").of<{
            readonly loggerName: string;
        }>();
        const ConsumerModule = defineModule({
            exports: [Consumer],
            imports: [PlainJsonLogger],
            bindings: [
                bind(Consumer).factory({ logger: PlainJsonLogger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [qualified(Logger, Json)],
            bindings: [bind(qualified(Logger, Json)).factory(() => ({ name: "qualified" }))],
        });
        const App = composeModules({
            modules: [ConsumerModule, LoggerModule],
            wire: [provideImport(ConsumerModule, PlainJsonLogger).with(JsonLogger)],
            exports: [Consumer],
        });
        expect(App.createContainer().resolve(Consumer)).toEqual({ loggerName: "qualified" });
    });
    it("lets public base-token overrides take precedence over wired imports", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(Logger, Json);
        const Consumer = token("Consumer").of<{
            readonly loggerName: string;
        }>();
        const ConsumerModule = defineModule({
            exports: [Consumer],
            imports: [Logger],
            bindings: [
                bind(Consumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [Logger, qualified(Logger, Json)],
            bindings: [
                bind(Logger).factory(() => ({ name: "plain" })),
                bind(qualified(Logger, Json)).factory(() => ({ name: "json" })),
            ],
        });
        const App = composeModules({
            modules: [ConsumerModule, LoggerModule],
            wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
            exports: [Consumer, Logger],
        });
        const app = App.createContainer(override(bind(Logger).factory(() => ({ name: "override" }))));
        expect(app.resolve(Consumer)).toEqual({ loggerName: "override" });
        expect(app.resolve(Logger)).toEqual({ name: "override" });
    });
    it("rejects unbinding a public provider used by a wired import", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(Logger, Json);
        const Consumer = token("Consumer").of<{
            readonly loggerName: string;
        }>();
        const ConsumerModule = defineModule({
            exports: [Consumer],
            imports: [Logger],
            bindings: [
                bind(Consumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [qualified(Logger, Json)],
            bindings: [bind(qualified(Logger, Json)).factory(() => ({ name: "json" }))],
        });
        const App = composeModules({
            modules: [ConsumerModule, LoggerModule],
            wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
            exports: [Consumer, JsonLogger],
        });
        const definition = App;
        expect(() => definition.createContainer(unbind(JsonLogger) as never)).toThrowError(
            'Service "Logger:json" is wired to import "Logger", but no exported provider exists',
        );
    });
    it("rejects invalid import wires at runtime", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const Other = token("Other").of<{
            readonly name: string;
        }>();
        const Consumer = token("Consumer").of<{
            readonly loggerName: string;
        }>();
        const Json = qualifier("json");
        const JsonLogger = qualified(Logger, Json);
        const ConsumerModule = defineModule({
            exports: [Consumer],
            imports: [Logger],
            bindings: [
                bind(Consumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [qualified(Logger, Json)],
            bindings: [bind(qualified(Logger, Json)).factory(() => ({ name: "json" }))],
        });
        const OutsideModule = defineModule({
            imports: [Logger],
            bindings: [],
        });
        expect(() =>
            composeModules({
                modules: [ConsumerModule],
                wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
                exports: [Consumer],
            } as never),
        ).toThrowError('Service "Logger:json" is wired to import "Logger", but no exported provider exists');
        expect(() =>
            composeModules({
                modules: [ConsumerModule, LoggerModule],
                wire: [
                    provideImport(ConsumerModule, Logger).with(JsonLogger),
                    provideImport(ConsumerModule, Logger).with(JsonLogger),
                ],
                exports: [Consumer],
            } as never),
        ).toThrowError('Service "Logger" is already wired for the module');
        expect(() =>
            composeModules({
                modules: [ConsumerModule, LoggerModule],
                wire: [provideImport(ConsumerModule as never, Other as never).with(JsonLogger as never)],
                exports: [Consumer],
            } as never),
        ).toThrowError('Service "Other" is not imported by the wired module');
        expect(() =>
            composeModules({
                modules: [ConsumerModule, LoggerModule],
                wire: [provideImport(OutsideModule, Logger).with(JsonLogger)],
                exports: [Consumer],
            } as never),
        ).toThrowError("Wire module must be included in composeModules modules");
    });
    it("resolves imported single-token providers through an explicit composition root", () => {
        const Config = token("Config").of<{
            readonly url: string;
        }>();
        const Pool = token("Pool").of<{
            readonly url: string;
        }>();
        const Db = token("Db").of<{
            readonly url: string;
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ url: "postgres://localhost" }))],
        });
        const DbModule = defineModule({
            exports: [Db],
            imports: [Config],
            bindings: [
                bind(Pool).factory({ config: Config }, ({ config }) => ({ url: config.url })),
                bind(Db).factory({ pool: Pool }, ({ pool }) => ({ url: pool.url })),
            ],
        });
        const App = composeModules({
            modules: [DbModule, ConfigModule],
            exports: [Db],
        });
        const app = App.createContainer();
        expect(app.resolve(Db)).toEqual({ url: "postgres://localhost" });
        expect(() => (app as RuntimeContainerForTest).resolve(Pool)).toThrowError(
            'Service "Pool" is not exported by the module',
        );
    });
    it("keeps provider internals private across token imports", () => {
        const Secret = token("Secret").of<{
            readonly value: string;
        }>();
        const Config = token("Config").of<{
            readonly value: string;
        }>();
        const Server = token("Server").of<{
            readonly value: string;
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [
                bind(Secret).factory(() => ({ value: "secret" })),
                bind(Config).factory({ secret: Secret }, ({ secret }) => ({ value: secret.value })),
            ],
        });
        const ServerModule = defineModule({
            exports: [Server],
            imports: [Config],
            bindings: [bind(Server).factory({ config: Config }, ({ config }) => ({ value: config.value }))],
        });
        const App = composeModules({
            modules: [ConfigModule, ServerModule],
            exports: [Server],
        });
        const app = App.createContainer();
        expect(app.resolve(Server)).toEqual({ value: "secret" });
        expect(() => (app as RuntimeContainerForTest).resolve(Secret)).toThrowError(
            'Service "Secret" is not exported by the module',
        );
    });
    it("allows modules to keep separate private single-token bindings with the same token", () => {
        const Shared = token("Shared").of<{
            readonly owner: string;
        }>();
        const First = token("First").of<{
            readonly owner: string;
        }>();
        const Second = token("Second").of<{
            readonly owner: string;
        }>();
        const FirstModule = defineModule({
            exports: [First],
            bindings: [
                bind(Shared).factory(() => ({ owner: "first" })),
                bind(First).factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
            ],
        });
        const SecondModule = defineModule({
            exports: [Second],
            bindings: [
                bind(Shared).factory(() => ({ owner: "second" })),
                bind(Second).factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
            ],
        });
        const App = composeModules({
            modules: [FirstModule, SecondModule],
            exports: [First, Second],
        });
        const app = App.createContainer();
        expect(app.resolve(First)).toEqual({ owner: "first" });
        expect(app.resolve(Second)).toEqual({ owner: "second" });
        expect(() => (app as RuntimeContainerForTest).resolve(Shared)).toThrowError(
            'Service "Shared" is not exported by the module',
        );
    });
    it("uses composition exports as the only public resolve and override surface", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Server = token("Server").of<{
            readonly port: number;
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        const ServerModule = defineModule({
            exports: [Server],
            imports: [Config],
            bindings: [bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port }))],
        });
        const App = composeModules({
            modules: [ConfigModule, ServerModule],
            exports: [Server],
        });
        const definition = App;
        expect(() => (definition.createContainer() as RuntimeContainerForTest).resolve(Config)).toThrowError(
            'Service "Config" is not exported by the module',
        );
        expect(() => definition.createContainer(override(bind(Config).factory(() => ({ port: 4000 }))))).toThrowError(
            'Service "Config" is not exported by the module',
        );
        const app = definition.createContainer(override(bind(Server).factory(() => ({ port: 5000 }))));
        expect(app.resolve(Server)).toEqual({ port: 5000 });
    });
    it("exposes all exported providers when composition exports are omitted", () => {
        const Secret = token("Secret").of<{
            readonly value: string;
        }>();
        const Config = token("Config").of<{
            readonly value: string;
        }>();
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const PrivateHooks = multiToken("PrivateHooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [
                bind(Secret).factory(() => ({ value: "secret" })),
                bind(PrivateHooks).factory(() => ({ name: "private" })),
                bind(Config).factory(() => ({ value: "public" })),
            ],
        });
        const FirstPluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "first" }))],
        });
        const SecondPluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "second" }))],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [ConfigModule, RegistryModule, FirstPluginModule, SecondPluginModule],
        });
        const app = App.createContainer();
        expect(app.resolve(Config)).toEqual({ value: "public" });
        expect(app.resolve(Registry)).toEqual({ names: ["first", "second"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
        expect(() => (app as RuntimeContainerForTest).resolve(Secret)).toThrowError(
            'Service "Secret" is not exported by the module',
        );
        expect(() => (app as RuntimeContainerForTest).resolve(PrivateHooks)).toThrowError(
            'Multibind token "PrivateHooks" is not exported by the module',
        );
        expect(() => App.createContainer(overrideAll(PrivateHooks, []))).toThrowError(
            'Multibind token "PrivateHooks" is not exported by the module',
        );
    });
    it("applies public overrides to same-module exported dependencies", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Server = token("Server").of<{
            readonly port: number;
        }>();
        const AppModule = defineModule({
            exports: [Config, Server],
            bindings: [
                bind(Config).factory(() => ({ port: 3000 })),
                bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
            ],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Config, Server],
        });
        const app = App.createContainer(override(bind(Config).factory(() => ({ port: 4000 }))));
        expect(app.resolve(Config)).toEqual({ port: 4000 });
        expect(app.resolve(Server)).toEqual({ port: 4000 });
    });
    it("does not add container creation to direct modules and rejects old module-to-module imports", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const ConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        expect(Object.hasOwn(ConfigModule, "createContainer")).toBe(false);
        expect(() =>
            defineModule({
                imports: [ConfigModule],
                bindings: [],
            } as never),
        ).toThrowError("Module imports must be tokens");
    });
    it("validates module token key helpers at runtime", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const SingleHooks = token("Hooks").of<{
            readonly name: string;
        }>();
        const ManyHooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        expect(() =>
            assertNoDuplicateTokenKeys([Config], (currentKey) => `Token "${currentKey}" is duplicated`),
        ).not.toThrow();
        expect(() =>
            assertNoDuplicateTokenKeys([Config, Config], (currentKey) => `Token "${currentKey}" is duplicated`),
        ).toThrowError('Token "Config" is duplicated');
        expect(() => assertNoImportedLocalSingleBindings([SingleHooks, ManyHooks], [])).toThrowError(
            'Token "Hooks" is already included in module imports',
        );
    });
    it("rejects malformed module definitions at runtime", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const SingleHooks = token("Hooks").of<{
            readonly name: string;
        }>();
        const ManyHooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        expect(() =>
            defineModule({
                imports: [{}],
                bindings: [],
            } as never),
        ).toThrowError("Module imports must be tokens");
        expect(() =>
            defineModule({
                imports: {},
                bindings: [],
            } as never),
        ).toThrowError("Module imports must be an array");
        expect(() =>
            defineModule({
                bindings: {},
            } as never),
        ).toThrowError("Module bindings must be an array");
        expect(() =>
            defineModule({
                exports: {},
                bindings: [],
            } as never),
        ).toThrowError("Module exports must be an array");
        expect(() =>
            defineModule({
                exports: [{}],
                bindings: [],
            } as never),
        ).toThrowError("Module exports must be tokens");
        expect(() =>
            defineModule({
                exports: [Config, Config],
                bindings: [bind(Config).factory(() => ({ port: 3000 }))],
            } as never),
        ).toThrowError('Token "Config" is already exported');
        expect(() =>
            defineModule({
                imports: [Config, Config],
                bindings: [],
            } as never),
        ).toThrowError('Token "Config" is already imported');
        expect(() =>
            defineModule({
                imports: [Config],
                bindings: [bind(Config).factory(() => ({ port: 3000 }))],
            } as never),
        ).toThrowError('Service "Config" cannot be both imported and locally bound in the same module');
        expect(() =>
            defineModule({
                imports: [SingleHooks],
                bindings: [bind(ManyHooks).factory(() => ({ name: "many" }))],
            } as never),
        ).toThrowError('Token "Hooks" is already included in module imports');
        expect(() =>
            defineModule({
                imports: [SingleHooks],
                exports: [ManyHooks],
                bindings: [],
            } as never),
        ).toThrowError('Token "Hooks" has an incompatible module export');
        expect(() =>
            defineModule({
                bindings: [
                    bind(SingleHooks).factory(() => ({ name: "single" })),
                    bind(ManyHooks).factory(() => ({ name: "many" })),
                ],
            } as never),
        ).toThrowError('Token "Hooks" is already included in module bindings');
        expect(() =>
            defineModule({
                exports: [Config],
                bindings: [
                    bind(Config).factory({ hooks: ManyHooks }, () => ({
                        port: 3000,
                    })),
                ],
            } as never),
        ).toThrowError('Multibind token "Hooks" is not imported, exported, or locally bound by the module');
        expect(() =>
            defineModule({
                bindings: [{}],
            } as never),
        ).toThrowError("Module bindings must be created with bind");
    });
    it("rejects malformed module compositions at runtime", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Consumer = token("Consumer").of<{
            readonly port: number;
        }>();
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const EmptyModule = defineModule({ bindings: [] });
        const ConsumerModule = defineModule({
            imports: [Config],
            bindings: [],
        });
        const ProviderModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        expect(() =>
            composeModules({
                modules: {},
                exports: [],
                wire: [],
            } as never),
        ).toThrowError("composeModules modules must be an array");
        expect(() =>
            composeModules({
                modules: [],
                exports: {},
                wire: [],
            } as never),
        ).toThrowError("composeModules exports must be an array");
        expect(() =>
            composeModules({
                modules: [],
                exports: [],
                wire: {},
            } as never),
        ).toThrowError("composeModules wire must be an array");
        expect(() =>
            composeModules({
                modules: [{}],
                exports: [],
            } as never),
        ).toThrowError("composeModules modules must be created with defineModule");
        expect(() =>
            composeModules({
                modules: [EmptyModule, EmptyModule],
                exports: [],
            } as never),
        ).toThrowError("Module is already included in the composition");
        expect(() =>
            composeModules({
                modules: [],
                exports: [{}],
            } as never),
        ).toThrowError("composeModules exports must be tokens");
        expect(() =>
            composeModules({
                modules: [ProviderModule],
                exports: [Config, Config],
            } as never),
        ).toThrowError('Token "Config" is already exported');
        expect(() =>
            composeModules({
                modules: [],
                exports: [],
                wire: [{}],
            } as never),
        ).toThrowError("composeModules wire entries must be created with provideImport");
        const invalidImportWire = provideImport(ConsumerModule, Config).with(Config);
        (
            invalidImportWire as {
                importToken: unknown;
            }
        ).importToken = {};
        expect(() =>
            composeModules({
                modules: [ConsumerModule, ProviderModule],
                exports: [],
                wire: [invalidImportWire],
            } as never),
        ).toThrowError("Wire import token must be a token");
        const invalidProviderWire = provideImport(ConsumerModule, Config).with(Config);
        (
            invalidProviderWire as {
                providerToken: unknown;
            }
        ).providerToken = {};
        expect(() =>
            composeModules({
                modules: [ConsumerModule, ProviderModule],
                exports: [],
                wire: [invalidProviderWire],
            } as never),
        ).toThrowError("Wire provider token must be a token");
        const HookConsumerModule = defineModule({
            imports: [Hooks],
            bindings: [],
        });
        expect(() =>
            composeModules({
                modules: [HookConsumerModule, ProviderModule],
                exports: [],
                wire: [provideImport(HookConsumerModule as never, Hooks as never).with(Config as never)],
            } as never),
        ).toThrowError('Multibind token "Hooks" cannot be wired with provideImport');
        expect(() =>
            composeModules({
                modules: [ConsumerModule, ProviderModule],
                exports: [],
                wire: [provideImport(ConsumerModule, Config).with(Hooks as never)],
            } as never),
        ).toThrowError('Multibind token "Hooks" cannot be used as a wired provider');
        expect(() =>
            composeModules({
                modules: [ConsumerModule, ProviderModule],
                exports: [Consumer],
            } as never),
        ).toThrowError('Service "Consumer" is exported, but no exported provider exists');
    });
    it("wires imports to falsey string provider tokens", () => {
        const Logger = token("Logger").of<{
            readonly name: string;
        }>();
        const EmptyLogger = token("").of<{
            readonly name: string;
        }>();
        const Consumer = token("Consumer").of<{
            readonly loggerName: string;
        }>();
        const ConsumerModule = defineModule({
            exports: [Consumer],
            imports: [Logger],
            bindings: [
                bind(Consumer).factory({ logger: Logger }, ({ logger }) => ({
                    loggerName: logger.name,
                })),
            ],
        });
        const LoggerModule = defineModule({
            exports: [EmptyLogger],
            bindings: [bind(EmptyLogger).factory(() => ({ name: "empty" }))],
        });
        const App = composeModules({
            modules: [ConsumerModule, LoggerModule],
            exports: [Consumer],
            wire: [provideImport(ConsumerModule, Logger).with(EmptyLogger)],
        });
        expect(App.createContainer().resolve(Consumer)).toEqual({ loggerName: "empty" });
    });
    it("retains the ambiguity guard for unstable exported binding tokens", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const OtherConfig = token("OtherConfig").of<{
            readonly port: number;
        }>();
        const ConsumerModule = defineModule({
            imports: [Config],
            bindings: [],
        });
        const FirstProviderModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        const SecondProviderModule = defineModule({
            exports: [OtherConfig],
            bindings: [bind(OtherConfig).factory(() => ({ port: 4000 }))],
        });
        const secondProviderBinding = SecondProviderModule.bindings[0] as {
            readonly token: unknown;
        };
        let tokenReads = 0;
        Object.defineProperty(secondProviderBinding, "token", {
            configurable: true,
            get: () => (tokenReads++ === 0 ? OtherConfig : Config),
        });
        expect(() =>
            composeModules({
                modules: [ConsumerModule, FirstProviderModule, SecondProviderModule],
                exports: [],
            } as never),
        ).toThrowError('Service "Config" has multiple exported providers');
    });
    it("rejects providers that become ambiguous after the exported-provider preflight", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const OtherConfig = token("OtherConfig").of<{
            readonly port: number;
        }>();
        const ConsumerModule = defineModule({
            imports: [Config],
            bindings: [],
        });
        const FirstProviderModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        const SecondProviderModule = defineModule({
            exports: [OtherConfig],
            bindings: [bind(OtherConfig).factory(() => ({ port: 4000 }))],
        });
        const secondProviderBinding = SecondProviderModule.bindings[0] as {
            readonly token: unknown;
        };
        let tokenReads = 0;
        Object.defineProperty(secondProviderBinding, "token", {
            configurable: true,
            get: () => (tokenReads++ < 2 ? OtherConfig : Config),
        });
        expect(() =>
            composeModules({
                modules: [ConsumerModule, FirstProviderModule, SecondProviderModule],
                exports: [],
            } as never),
        ).toThrowError('Service "Config" has multiple exported providers');
    });
    it("rejects duplicate local single-token bindings at runtime", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        expect(() =>
            defineModule({
                bindings: [bind(Config).factory(() => ({ port: 3000 })), bind(Config).factory(() => ({ port: 4000 }))],
            } as never),
        ).toThrowError('Service "Config" is already registered in the module context');
    });
    it("rejects missing and ambiguous single-token import providers", () => {
        const Config = token("Config").of<{
            readonly port: number;
        }>();
        const Server = token("Server").of<{
            readonly port: number;
        }>();
        const ServerModule = defineModule({
            exports: [Server],
            imports: [Config],
            bindings: [bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port }))],
        });
        expect(() =>
            composeModules({
                modules: [ServerModule],
                exports: [Server],
            } as never),
        ).toThrowError('Service "Config" is imported by a module, but no exported provider exists');
        const FirstConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 3000 }))],
        });
        const SecondConfigModule = defineModule({
            exports: [Config],
            bindings: [bind(Config).factory(() => ({ port: 4000 }))],
        });
        expect(() =>
            composeModules({
                modules: [ServerModule, FirstConfigModule, SecondConfigModule],
                exports: [Server],
            } as never),
        ).toThrowError('Service "Config" has multiple exported providers');
    });
    it("rejects mixed single and multibind exported providers with the same key", () => {
        const SingleHooks = token("Hooks").of<{
            readonly name: string;
        }>();
        const ManyHooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Public = token("Public").of<{
            readonly ok: true;
        }>();
        const SingleHooksModule = defineModule({
            exports: [SingleHooks],
            bindings: [bind(SingleHooks).factory(() => ({ name: "single" }))],
        });
        const ManyHooksModule = defineModule({
            exports: [ManyHooks],
            bindings: [bind(ManyHooks).factory(() => ({ name: "many" }))],
        });
        const PublicModule = defineModule({
            exports: [Public],
            bindings: [bind(Public).factory(() => ({ ok: true as const }))],
        });
        expect(() =>
            composeModules({
                modules: [PublicModule, SingleHooksModule, ManyHooksModule],
                exports: [Public],
            } as never),
        ).toThrowError('Token "Hooks" has incompatible exported providers');
    });
    it("requires composition public exports to have exported providers", () => {
        const Public = token("Public").of<{
            readonly ok: true;
        }>();
        const Internal = token("Internal").of<{
            readonly ok: true;
        }>();
        const AppModule = defineModule({
            bindings: [bind(Internal).factory(() => ({ ok: true as const }))],
        });
        expect(() =>
            composeModules({
                modules: [AppModule],
                exports: [Public],
            } as never),
        ).toThrowError('Service "Public" is exported, but no exported provider exists');
    });
    it("aggregates all local multibind contributions for exported tokens", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const FirstPluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "first" }))],
        });
        const SecondPluginModule = defineModule({
            exports: [Hooks],
            bindings: [
                bind(Hooks).factory(() => ({ name: "private-plugin" })),
                bind(Hooks).factory(() => ({ name: "second" })),
            ],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule, FirstPluginModule, SecondPluginModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: ["first", "private-plugin", "second"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "first" }, { name: "private-plugin" }, { name: "second" }]);
    });
    it("keeps local private multibind contributions visible only inside the owning module", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const PluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "public" }))],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Hooks).factory(() => ({ name: "local-private" })),
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule, PluginModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: ["local-private", "public"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "public" }]);
    });
    it("keeps non-imported private multibind contributions isolated from exported providers", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const PluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "first" })), bind(Hooks).factory(() => ({ name: "second" }))],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            bindings: [
                bind(Hooks).factory(() => ({ name: "local-private" })),
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [PluginModule, RegistryModule],
            exports: [Hooks, Registry],
        });
        const app = App.createContainer();
        expect(app.resolve(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
        expect(app.resolve(Registry)).toEqual({ names: ["local-private"] });
    });
    it("does not expose multibind tokens that are absent from module exports", () => {
        const InternalHooks = multiToken("InternalHooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const AppModule = defineModule({
            exports: [Registry],
            bindings: [
                bind(InternalHooks).factory(() => ({ name: "internal" })),
                bind(Registry).factory({ hooks: InternalHooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [AppModule],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: ["internal"] });
        expect(() => (app as RuntimeContainerForTest).resolve(InternalHooks)).toThrowError(
            'Multibind token "InternalHooks" is not exported by the module',
        );
        expect(() => App.createContainer(overrideAll(InternalHooks, []))).toThrowError(
            'Multibind token "InternalHooks" is not exported by the module',
        );
    });
    it("injects imported and owner-local multibind contributions into private module bindings", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Snapshot = token("Snapshot").of<{
            readonly names: readonly string[];
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const FirstPluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "first" }))],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Hooks).factory(() => ({ name: "local-private" })),
                bind(Snapshot).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
                bind(Registry).factory({ snapshot: Snapshot }, ({ snapshot }) => snapshot),
            ],
        });
        const SecondPluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "second" }))],
        });
        const App = composeModules({
            modules: [FirstPluginModule, RegistryModule, SecondPluginModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: ["first", "local-private", "second"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
        expect(() => (app as RuntimeContainerForTest).resolve(Snapshot)).toThrowError(
            'Service "Snapshot" is not exported by the module',
        );
    });
    it("allows multibind modules to consume their own exported contributions", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const RegistryModule = defineModule({
            exports: [Hooks, Registry],
            imports: [Hooks],
            bindings: [
                bind(Hooks).factory(() => ({ name: "self" })),
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: ["self"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "self" }]);
    });
    it("allows modules to re-export imported multibind tokens without local contributions", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const PluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "first" })), bind(Hooks).factory(() => ({ name: "second" }))],
        });
        const ReExportModule = defineModule({
            imports: [Hooks],
            exports: [Hooks, Registry],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [ReExportModule, PluginModule],
            exports: [Hooks, Registry],
        });
        const app = App.createContainer();
        expect(app.resolve(Hooks)).toEqual([{ name: "first" }, { name: "second" }]);
        expect(app.resolve(Registry)).toEqual({ names: ["first", "second"] });
    });
    it("allows exported multibind tokens without contributions", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        expect(() =>
            composeModules({
                modules: [RegistryModule],
                exports: [Registry],
            } as never),
        ).toThrowError('Multibind token "Hooks" is imported by a module, but no module exports it');
        const EmptyModule = defineModule({
            exports: [Hooks],
            bindings: [],
        });
        const App = composeModules({
            modules: [RegistryModule, EmptyModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer();
        expect(app.resolve(Registry)).toEqual({ names: [] });
        expect(app.resolve(Hooks)).toEqual([]);
    });
    it("applies public overrideAll to exported multibind dependencies without local contributions", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const RegistryModule = defineModule({
            exports: [Hooks, Registry],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer(overrideAll(Hooks, [bind(Hooks).factory(() => ({ name: "override" }))]));
        expect(app.resolve(Registry)).toEqual({ names: ["override"] });
        expect(app.resolve(Hooks)).toEqual([{ name: "override" }]);
    });
    it("allows imported multibind contributions to be replaced through public overrideAll", () => {
        const Hooks = multiToken("Hooks").of<{
            readonly name: string;
        }>();
        const Registry = token("Registry").of<{
            readonly names: readonly string[];
        }>();
        const PluginModule = defineModule({
            exports: [Hooks],
            bindings: [bind(Hooks).factory(() => ({ name: "public" }))],
        });
        const RegistryModule = defineModule({
            exports: [Registry],
            imports: [Hooks],
            bindings: [
                bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
                    names: hooks.map((hook) => hook.name),
                })),
            ],
        });
        const App = composeModules({
            modules: [RegistryModule, PluginModule],
            exports: [Registry, Hooks],
        });
        const app = App.createContainer(overrideAll(Hooks, [bind(Hooks).factory(() => ({ name: "override" }))]));
        expect(app.resolve(Hooks)).toEqual([{ name: "override" }]);
        expect(app.resolve(Registry)).toEqual({ names: ["override"] });
    });
    it("supports optional, ref, scoped bindings, and disposal through composed modules", async () => {
        const events: string[] = [];
        const Config = token("Config").of<{
            readonly name: string;
        }>();
        const Request = token("Request").of<{
            readonly id: string;
        }>();
        const Service = token("Service").of<{
            readonly getName: () => string;
            readonly requestId: string;
        }>();
        const AppModule = defineModule({
            exports: [Service],
            bindings: [
                bind(Config)
                    .factory(() => ({ name: "app" }))
                    .disposable(() => events.push("config")),
                bind(Service)
                    .scoped()
                    .factory({ config: ref(Config), request: optional(Request) }, ({ config, request }) => ({
                        getName: () => config.value.name,
                        requestId: request?.id ?? "none",
                    }))
                    .disposable(() => events.push("service")),
            ],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Service],
        });
        const app = App.createContainer();
        const rootService = app.resolve(Service);
        const request = app.createScope(
            bind(Request)
                .scoped()
                .factory(() => ({ id: "request-1" })),
        );
        const requestService = request.resolve(Service);
        expect(rootService.requestId).toBe("none");
        expect(rootService.getName()).toBe("app");
        expect(requestService.requestId).toBe("request-1");
        expect(requestService.getName()).toBe("app");
        await request.dispose();
        await app.dispose();
        expect(events).toEqual(["service", "service", "config"]);
    });
    it("does not let module scopes shadow private same-token bindings", async () => {
        const Shared = token("Shared").of<{
            readonly owner: string;
        }>();
        const First = token("First").of<{
            readonly owner: string;
        }>();
        const Second = token("Second").of<{
            readonly owner: string;
        }>();
        const FirstModule = defineModule({
            exports: [First],
            bindings: [
                bind(Shared)
                    .scoped()
                    .factory(() => ({ owner: "first" })),
                bind(First)
                    .scoped()
                    .factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
            ],
        });
        const SecondModule = defineModule({
            exports: [Second],
            bindings: [
                bind(Shared)
                    .scoped()
                    .factory(() => ({ owner: "second" })),
                bind(Second)
                    .scoped()
                    .factory({ shared: Shared }, ({ shared }) => ({ owner: shared.owner })),
            ],
        });
        const App = composeModules({
            modules: [FirstModule, SecondModule],
            exports: [First, Second],
        });
        const app = App.createContainer();
        const request = app.createScope(
            bind(Shared)
                .scoped()
                .factory(() => ({ owner: "scope" })),
        );

        expect(request.resolve(First)).toEqual({ owner: "first" });
        expect(request.resolve(Second)).toEqual({ owner: "second" });
        expect(request.resolve(Shared)).toEqual({ owner: "scope" });

        await request.dispose();
        await app.dispose();
    });
    it("extends module scope public access with local multibind bindings", async () => {
        const Service = token("Service").of<{
            readonly name: string;
        }>();
        const Hooks = multiToken("RequestHooks").of<{
            readonly name: string;
        }>();
        const AppModule = defineModule({
            exports: [Service],
            bindings: [bind(Service).factory(() => ({ name: "app" }))],
        });
        const App = composeModules({
            modules: [AppModule],
            exports: [Service],
        });
        const app = App.createContainer();
        const request = app.createScope(bind(Hooks).factory(() => ({ name: "request" })));
        expect(request.resolve(Hooks)).toEqual([{ name: "request" }]);
        expect(() => (app as RuntimeContainerForTest).resolve(Hooks)).toThrowError(
            'Multibind token "RequestHooks" is not exported by the module',
        );
        await request.dispose();
        await app.dispose();
    });
});
