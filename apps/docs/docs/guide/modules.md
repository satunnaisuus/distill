# Modules

Modules group local bindings behind explicit imports and exports. Use them when a package or feature needs private
services while exposing only a small public surface to the rest of the application.

Call shapes:

```ts
defineModule({ bindings })
defineModule({ exports, bindings })
defineModule({ imports, bindings })
defineModule({ imports, exports, bindings })
composeModules({ modules })
composeModules({ modules, exports })
composedModule.createContainer()
```

```ts
import { bind, composeModules, defineModule, token } from "@satunnaisuus/distill";

type Config = {
    readonly url: string;
};

type Pool = {
    readonly url: string;
};

type Db = {
    readonly query: (sql: string) => Promise<unknown>;
};

const Config = token("Config").of<Config>();
const Pool = token("Pool").of<Pool>();
const Db = token("Db").of<Db>();

const ConfigModule = defineModule({
    exports: [Config],
    bindings: [bind(Config).value({ url: "postgres://localhost" })],
} as const);

const DbModule = defineModule({
    imports: [Config],
    exports: [Db],
    bindings: [
        bind(Pool).factory({ config: Config }, ({ config }) => ({ url: config.url })),
        bind(Db).factory({ pool: Pool }, ({ pool }) => createDb(pool)),
    ],
} as const);

const App = composeModules({
    modules: [DbModule, ConfigModule],
    exports: [Db],
} as const);

const app = App.createContainer();
```

`app.resolve(Db)` is public in this composition. `Pool` remains internal to `DbModule`.

## Imports

Module `imports` are tokens, not other modules. A module binding can depend on local bindings and imported tokens.

Call shape:

```ts
defineModule({ imports, exports, bindings })
```

```ts
const JobsModule = defineModule({
    imports: [Db],
    exports: [JobRunner],
    bindings: [bind(JobRunner).factory({ db: Db }, ({ db }) => createJobRunner(db))],
} as const);
```

The composition wires imported tokens to exported providers from the modules listed in `composeModules(...)`.

## Exports

Bindings whose token appears in module `exports` can satisfy another module's import or become visible from the composed
container.

Call shapes:

```ts
defineModule({ exports, bindings })
composeModules({ modules })
composeModules({ modules, exports })
```

```ts
const MetricsModule = defineModule({
    exports: [Metrics],
    bindings: [
        bind(MetricsClient).factory(() => createMetricsClient()),
        bind(Metrics).factory({ client: MetricsClient }, ({ client }) => createMetrics(client)),
    ],
} as const);
```

If `composeModules(...)` omits `exports`, every exported token from the listed modules is public. Pass `exports` to expose
only selected exported tokens.

## Import Wiring

When multiple modules export compatible tokens, use `provideImport(...)` to choose the provider for a specific module
import.

Call shapes:

```ts
composeModules({ modules, wire })
composeModules({ modules, exports, wire })
provideImport(module, importToken).with(providerToken)
```

```ts
import { provideImport } from "@satunnaisuus/distill";

const App = composeModules({
    modules: [JobsModule, PrimaryDbModule, ReportingDbModule],
    wire: [provideImport(JobsModule, Db).with(ReportingDb)],
    exports: [JobRunner],
} as const);
```

The import token is the token a module asks for. The provider token is the exported token supplied by the composition.

## Multibind Exports

Exports apply to tokens. When a module exports a multibind token, all local bindings for that token are exported. A
multibind token can also be exported without local bindings, which makes `resolve(...)` return an empty array until
another module or override contributes bindings.

Call shapes:

```ts
defineModule({ exports: [multibindToken], bindings })
container.resolve(multibindToken)
```

```ts
import { bind, defineModule, multiToken, token } from "@satunnaisuus/distill";

type Hook = {
    readonly name: string;
};

const Hooks = multiToken("Hooks").of<Hook>();
const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

const AppModule = defineModule({
    exports: [Hooks, Registry],
    bindings: [
        bind(Hooks).factory(() => ({ name: "public" })),
        bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
            names: hooks.map((hook) => hook.name),
        })),
    ],
} as const);
```

Importers and the composed container see the exported hook.

## Overrides

Pass overrides to `createContainer(...)` when a composed module needs test doubles or environment-specific bindings.

Call shapes:

```ts
composedModule.createContainer(override(binding))
composedModule.createContainer(overrideAll(multibindToken, bindings))
composedModule.createContainer(unbind(token))
```

```ts
import { override } from "@satunnaisuus/distill";

const testApp = App.createContainer(
    override(bind(Db).value({ query: async () => [] })),
);
```

Composed containers use the same override helpers as regular containers: `override(...)` for regular tokens,
`overrideAll(...)` for multibind tokens, and `unbind(...)` to remove a regular token binding for that container
instance. Overrides must target tokens that are visible from the composition's public exports.

## Runtime Behavior

Modules are visibility boundaries, not disposal scopes. Singleton, scoped, transient, `ref`, `optional`, `all`,
`createScope`, overrides, and disposal keep the same behavior they have in regular containers.
