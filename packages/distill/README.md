# Distill

Distill is a small, type-safe dependency injection container for TypeScript. It uses typed tokens and explicit factory bindings so TypeScript can catch unresolved services, singleton missing bindings, duplicate bindings, unknown dependencies, and eager dependency cycles at compile time.

## Installation

```sh
npm install @satunnaisuus/distill
```

## Features

- End-to-end type inference for tokens, dependency maps, factories, and resolved values.
- Compile-time checks for unresolved services, singleton missing bindings, duplicate bindings, unknown dependencies, and eager dependency cycles.
- Lazy service creation with singleton, scoped, and transient lifetimes.
- Child scopes for request-local overrides and per-scope service instances.
- Modules with internal bindings, explicit token imports, inline provider exports, and explicit composition roots.
- Multibind tokens for collecting multiple services with `resolveAll`.
- Async resource disposal for containers and scopes.
- Explicit dependency maps instead of decorators, reflection, or global state.
- Optional factory dependencies with `optional`.
- Lazy `ref` dependencies for deferred access and dependency cycles.
- No runtime dependencies; ESM-first package.

## Examples

### Define tokens and resolve a service

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

const Config = token("Config").of<Config>();

const container = defineContainer(
    [Config],
    bind(Config).factory(() => ({ port: 3000 })),
).create();

const config = container.resolve(Config);
//    ^? Config
```

### Collect multiple bindings

```ts
import { bind, defineContainer, multiToken } from "@satunnaisuus/distill";

type Handler = {
    readonly handle: (message: string) => void;
};

const Handlers = multiToken("Handlers").of<Handler>();

const container = defineContainer(
    [Handlers],
    bind(Handlers).factory(() => ({ handle: (message) => console.log("audit", message) })),
    bind(Handlers).factory(() => ({ handle: (message) => console.log("metrics", message) })),
).create();

const handlers = container.resolveAll(Handlers);
//    ^? Handler[]
```

Use `multiToken` for tokens that can have several bindings. Multibind tokens are resolved with `resolveAll`; regular `resolve` stays for single-service tokens.

### Wire dependencies explicitly

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

type Server = {
    readonly start: () => void;
};

const Config = token("Config").of<Config>();
const Logger = token("Logger").of<Logger>();
const Server = token("Server").of<Server>();

const container = defineContainer(
    [Config, Logger, Server],
    bind(Config).factory(() => ({ port: 3000 })),
    bind(Logger).factory(() => console),
    bind(Server).factory({ config: Config, logger: Logger }, ({ config, logger }) => ({
        start: () => logger.log(`Listening on ${config.port}`),
    })),
).create();

container.resolve(Server).start();
```

The `server` factory receives `{ config, logger }` with the correct inferred types. TypeScript reports dependencies outside the token list, singleton missing bindings, and eager cycles at the container definition. Scoped and transient services with unresolved dependencies are omitted from `resolve` until a scope supplies those dependencies.

### Compose modules with private bindings

```ts
import { bind, composeModules, defineContainer, defineModule, exported, token } from "@satunnaisuus/distill";

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
    bindings: [exported(bind(Config).factory(() => ({ url: "postgres://localhost" })))],
} as const);

const DbModule = defineModule({
    imports: [Config],
    bindings: [
        bind(Pool).factory({ config: Config }, ({ config }) => ({ url: config.url })),
        exported(bind(Db).factory({ pool: Pool }, ({ pool }) => createDb(pool))),
    ],
} as const);

const App = composeModules({
    modules: [DbModule, ConfigModule],
    exports: [Db],
} as const);

const app = defineContainer.module(App).create();

app.resolve(Db);
//    ^? Db

app.resolve(Pool);
// TypeScript error: Pool is internal to DbModule.
```

Module `imports` are tokens, not other modules. A module binding can depend on local bindings and on imported tokens; `composeModules(...)` then wires those imports to exported providers from the listed modules. If `exports` is omitted, every `exported(...)` token from the listed modules is public; pass `exports` to expose only selected exported tokens.

Only bindings wrapped with `exported(...)` can satisfy another module's token import or a composition public export. Local bindings stay private to their module.

Modules are visibility boundaries, not disposal scopes. Singleton, scoped, transient, `ref`, `optional`, `all`, `createScope`, overrides, and disposal keep the same lifetime behavior as regular containers.

### Export selected multibind contributions

```ts
import { all, bind, composeModules, defineContainer, defineModule, exported, multiToken, token } from "@satunnaisuus/distill";

type Hook = {
    readonly name: string;
};

const Hooks = multiToken("Hooks").of<Hook>();
const Registry = token("Registry").of<{ readonly names: readonly string[] }>();

const AppModule = defineModule({
    bindings: [
        bind(Hooks).factory(() => ({ name: "internal" })),
        exported(bind(Hooks).factory(() => ({ name: "public" }))),
        exported(
            bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
                names: hooks.map((hook) => hook.name),
            })),
        ),
    ],
} as const);

const App = composeModules({
    modules: [AppModule],
    exports: [Hooks, Registry],
} as const);

const app = defineContainer.module(App).create();

app.resolveAll(Hooks);
// [{ name: "public" }]

app.resolve(Registry).names;
// ["internal", "public"]
```

Exports apply to concrete bindings, not whole tokens. This lets a module keep some multibind contributions private while exposing selected contributions to importers and public `resolveAll`.

### Use provider helpers

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

type Server = {
    readonly start: () => void;
};

class ServerImpl implements Server {
    constructor(private readonly services: { readonly config: Config; readonly logger: Logger }) {}

    start() {
        this.services.logger.log(`Listening on ${this.services.config.port}`);
    }
}

const Config = token("Config").of<Config>();
const Logger = token("Logger").of<Logger>();
const ConsoleLogger = token("ConsoleLogger").of<Logger>();
const Server = token("Server").of<Server>();

const container = defineContainer(
    [Config, Logger, ConsoleLogger, Server],
    bind(Config).value({ port: 3000 }),
    bind(ConsoleLogger).value(console),
    bind(Logger).alias(ConsoleLogger),
    bind(Server).class({ config: Config, logger: Logger }, ServerImpl),
).create();

container.resolve(Server).start();
```

Provider methods are shorthand for regular factory bindings. They keep the same explicit dependency maps and compile-time graph validation.

### Mark a dependency as optional

```ts
import { bind, defineContainer, optional, token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

type Server = {
    readonly port: number;
};

const Config = token("Config").of<Config>();
const Server = token("Server").of<Server>();

const container = defineContainer(
    [Config, Server],
    bind(Server).factory({ config: optional(Config) }, ({ config }) => ({
        port: config?.port ?? 3000,
    })),
).create();

container.resolve(Server);
```

The `config` factory parameter is inferred as `Config | undefined`. Optional dependencies must still use tokens from the token list, and registered optional dependencies still validate their own dependency graph.

### Defer work with `ref`

```ts
import { bind, defineContainer, ref, token } from "@satunnaisuus/distill";

type Logger = {
    readonly log: (message: string) => void;
};

type JobRunner = {
    readonly run: () => void;
};

const Logger = token("Logger").of<Logger>();
const JobRunner = token("JobRunner").of<JobRunner>();

const container = defineContainer(
    [Logger, JobRunner],
    bind(JobRunner).factory({ logger: ref(Logger) }, ({ logger }) => ({
        run: () => {
            logger.value.log("Running job");
        },
    })),
    bind(Logger).factory(() => console),
).create();

const runner = container.resolve(JobRunner);
// The logger has not been created yet.

runner.run();
// logger.value resolves and caches the logger on first access.
```

### Break dependency cycles with `ref`

```ts
import { bind, defineContainer, ref, token } from "@satunnaisuus/distill";

type Users = {
    readonly getAudit: () => Audit;
};

type Audit = {
    readonly getUsers: () => Users;
};

const Users = token("Users").of<Users>();
const Audit = token("Audit").of<Audit>();

const container = defineContainer(
    [Users, Audit],
    bind(Users).factory({ audit: ref(Audit) }, ({ audit }) => ({
        getAudit: () => audit.value,
    })),
    bind(Audit).factory({ users: ref(Users) }, ({ users }) => ({
        getUsers: () => users.value,
    })),
).create();

const users = container.resolve(Users);
const audit = users.getAudit();

audit.getUsers() === users;
```

Use `ref` when access can be delayed until after initialization. Eager circular dependencies are rejected.

### Swap bindings for tests or environments

```ts
import { bind, defineContainer, override, overrideAll, token, multiToken } from "@satunnaisuus/distill";

type Clock = {
    readonly now: () => Date;
};

type ReportService = {
    readonly createdAt: () => Date;
};

const Clock = token("Clock").of<Clock>();
const Reports = token("Reports").of<ReportService>();
const ReportHooks = multiToken("ReportHooks").of<() => void>();

const app = defineContainer(
    [Clock, Reports, ReportHooks],
    bind(Clock).factory(() => ({ now: () => new Date() })),
    bind(Reports).factory({ clock: Clock }, ({ clock }) => ({
        createdAt: () => clock.now(),
    })),
    bind(ReportHooks).factory(() => () => console.log("audit")),
    bind(ReportHooks).factory(() => () => console.log("metrics")),
);

const production = app.create();

const test = app.create(
    override(bind(Clock).factory(() => ({ now: () => new Date("2026-01-01T00:00:00.000Z") }))),
    overrideAll(ReportHooks, []),
);

production.resolve(Reports).createdAt();
test.resolve(Reports).createdAt();
```

`override(...)` replaces one regular token binding before the runtime container is created, so singleton graphs use the replacement. `unbind(...)` removes one regular token binding for that container. `overrideAll(...)` replaces every contribution for a multibind token; pass an empty tuple or array literal to remove all contributions for that container.

### Create request scopes

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type CurrentUser = {
    readonly id: string;
};

type AuditLog = {
    readonly userId: string;
};

const CurrentUser = token("CurrentUser").of<CurrentUser>();
const AuditLog = token("AuditLog").of<AuditLog>();

const app = defineContainer(
    [CurrentUser, AuditLog],
    bind(AuditLog).scoped().factory({ currentUser: CurrentUser }, ({ currentUser }) => ({
        userId: currentUser.id,
    })),
).create();

const request = app.createScope(
    bind(CurrentUser).scoped().factory(() => ({ id: "user-1" })),
);

request.resolve(AuditLog).userId;
//    ^? string
```

Scope bindings can override parent bindings. Scoped instances are cached in the scope that resolves them, so separate request scopes receive separate `auditLog` instances.

Use `runScoped` when a request or job scope should be disposed automatically:

```ts
const requestBindings = [
    bind(CurrentUser).scoped().factory(() => ({ id: "user-1" })),
] as const;

const userId = await app.runScoped(requestBindings, async (request) => {
    return request.resolve(AuditLog).userId;
});
```

Preserve tuple information for reusable binding arrays with `as const`, a typed tuple, or `satisfies`; widened `Binding[]` arrays cannot be fully validated by TypeScript.

### Dispose resources

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type Db = {
    readonly close: () => Promise<void>;
    readonly createUnitOfWork: () => UnitOfWork;
};

type UnitOfWork = {
    readonly rollback: () => Promise<void>;
};

type Service = {
    readonly run: () => Promise<void>;
};

const Db = token("Db").of<Db>();
const UnitOfWork = token("UnitOfWork").of<UnitOfWork>();
const Service = token("Service").of<Service>();

const app = defineContainer(
    [Db, UnitOfWork, Service],
    bind(Db).singleton().factory(() => createDb()).disposable((db) => db.close()),
    bind(Service).scoped().factory({ unitOfWork: UnitOfWork }, ({ unitOfWork }) => ({
        run: async () => {
            // use unitOfWork
        },
    })),
).create();

const request = app.createScope(
    bind(UnitOfWork).scoped().factory({ db: Db }, ({ db }) => db.createUnitOfWork()).disposable((unitOfWork) => unitOfWork.rollback()),
);

try {
    await request.resolve(Service).run();
} finally {
    await request.dispose();
}

await app.dispose();
```

Disposing a scope closes only instances owned by that scope. The request scope closes its `unitOfWork`; the app container closes the root `db`. Parent disposal cascades to child scopes before closing parent-owned instances.

## API

```ts
token(key).of<T>()
multiToken(key).of<T>()
qualifier(key)
qualified(token, qualifier)
bind(token)
bind(token).value(value)
bind(token).factory(factory)
bind(token).factory(dependencies, factory)
bind(token).class(Class)
bind(token).class(dependencies, Class)
bind(token).alias(existingToken)
bind(token).useExisting(existingToken)
bind(qualified(token, qualifier)).factory(factory)
bind(qualified(token, qualifier)).factory(dependencies, factory)
bind(token).singleton()
bind(token).scoped()
bind(token).transient()
bind(token).disposable(disposer)
all(multibindToken)
all(() => multibindToken)
optional(dependency)
optional(() => dependency)
ref(token)
ref(() => token)
exported(binding)
defineModule({ imports?, bindings })
composeModules({ modules })
composeModules({ modules, wire })
composeModules({ modules, exports })
composeModules({ modules, exports, wire })
provideImport(module, importToken).with(providerToken)
defineContainer([Config, Logger], ...bindings)
defineContainer.module(composedModule)
definition.create()
definition.create(override(binding))
definition.create(overrideAll(multibindToken, bindings))
definition.create(unbind(token))
container.resolve(token)
container.resolveAll(multibindToken)
container.createScope(...bindings)
container.runScoped(bindings, callback)
container.dispose()
container.disposed
```

### `token(key).of<T>()`

Creates a token with a runtime key and a TypeScript value type.

```ts
import { token } from "@satunnaisuus/distill";

const Config = token("Config").of<{ readonly port: number }>();
const ConfigKey = Symbol("Config");
const SymbolConfig = token(ConfigKey).of<{ readonly port: number }>();
const UnknownValue = token("UnknownValue").of();

class Logger {}

const LoggerToken = token(Logger).of();
```

For single tokens, the token runtime value is its key:

```ts
Config === "Config";
SymbolConfig === ConfigKey;
LoggerToken === Logger;
```

Each token keeps its literal key and declared value type. Token keys can be strings, symbols, or classes. If `T` is omitted, class-keyed tokens use the class instance type; other tokens use `unknown`.

### `multiToken(key).of<T>()`

Creates a token that can have several bindings and resolves to an array through `resolveAll` or `all`.

```ts
import { multiToken } from "@satunnaisuus/distill";

const Hooks = multiToken("Hooks").of<{ readonly name: string }>();
```

Multibind tokens use the same key rules and default value inference as regular tokens. Single tokens are bound once in a visible scope; multibind tokens may have multiple contributions.

### `qualifier(key)` and `qualified(token, qualifier)`

Creates a qualified variant of a regular token.

```ts
import { bind, defineContainer, qualified, qualifier, token } from "@satunnaisuus/distill";

type Logger = {
    readonly name: string;
};

const Logger = token("Logger").of<Logger>();
const Json = qualifier("json");
const JsonLogger = qualified(Logger, Json);

const container = defineContainer(
    [JsonLogger],
    bind(qualified(Logger, Json)).factory(() => ({ name: "json" })),
).create();

container.resolve(JsonLogger);
//    ^? Logger
```

`qualified(...)` accepts regular tokens, not multibind tokens. The qualified token keeps the base token's value type but has its own token identity, so it does not collide with a plain token whose key has the same displayed text.

Bind a qualified token by passing the result of `qualified(...)` to `bind(...)`.

### `bind(token).factory(factory)`

Creates a binding for a service without declared dependencies.

```ts
const configBinding = bind(Config).factory(() => ({ port: 3000 }));
```

The factory is lazy: it is not called when the binding or container is created. It runs when the service is resolved according to the binding lifetime.

The default `bind(...)` lifetime is singleton. Singleton values are cached in the scope where the binding is registered, so resolving the same token again returns the same instance, including falsy values such as `false`, `0`, `null`, and `undefined`.

The factory return type must be assignable to the token value type. If the service value itself is a function, return that function from the factory:

```ts
const handlerBinding = bind(Handler).factory(() => (message: string) => message.length);
```

Use `.disposable(...)` to close values created by the binding:

```ts
const dbBinding = bind(Db).singleton().factory(() => createDb()).disposable((db) => db.close());
```

The disposer receives the resolved service value and may return `void` or `Promise<void>`.

### `bind(token).factory(dependencies, factory)`

Creates a binding for a service with an explicit dependency map.

```ts
const serverBinding = bind(Server).factory({ config: Config, logger: Logger }, ({ config, logger }) => ({
    start: () => logger.log(`Listening on ${config.port}`),
}));
```

Dependency map keys become properties on the factory parameter. Dependency values can be:

- tokens, which are resolved eagerly before the factory runs;
- `ref(...)` dependencies, which pass a lazy `Ref<T>` object to the factory;
- `all(...)` dependencies, which pass all visible contributions for a multibind token;
- `optional(...)` dependencies, which pass `undefined` when the wrapped dependency is not currently visible.

The factory parameter is inferred from the dependency map:

```ts
bind(Server).factory({ config: Config }, ({ config }) => {
    // config is inferred from Config
    return { port: config.port };
});
```

Dependency keys must be string keys, and dependency values must be defined tokens, refs, all-dependencies, or optional wrappers. Possibly `undefined` dependency map values are rejected by TypeScript; use `optional(...)` when absence is intentional.

Binding order does not matter:

```ts
const container = defineContainer(
    [Config, Server],
    bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port })),
    bind(Config).factory(() => ({ port: 3000 })),
).create();
```

### `all(multibindToken)` and `all(() => multibindToken)`

Creates a dependency reference for every visible binding of a multibind token.

```ts
const registryBinding = bind(Registry).factory({ hooks: all(Hooks) }, ({ hooks }) => ({
    names: hooks.map((hook) => hook.name),
}));
```

The factory parameter is inferred as `Array<TokenValue<typeof Hooks>>`. `all(() => token)` defers token selection until the dependent service is initialized.

### `optional(dependency)` and `optional(() => dependency)`

Marks a dependency as optional.

```ts
const serverBinding = bind(Server).factory({ config: optional(Config) }, ({ config }) => ({
    port: config?.port ?? 3000,
}));
```

The wrapped dependency can be a regular token, `ref(...)`, or `all(...)`. The factory receives `undefined` when the dependency is not visible in the current container or scope. If the dependency is visible, its own graph is still validated and resolved normally.

### Provider methods

Provider methods create the same `Binding` objects as factory bindings.

```ts
const Json = qualifier("json");
const configBinding = bind(Config).value({ port: 3000 });
const serverBinding = bind(Server).factory({ config: Config }, ({ config }) => ({ port: config.port }));
const classBinding = bind(Server).class({ config: Config }, ServerImpl);
const aliasBinding = bind(Logger).alias(ConsoleLogger);
const qualifiedBinding = bind(qualified(Logger, Json)).factory(() => console);
```

`bind(token).value(value)` binds an already-created value. Use it for configuration objects, test doubles, and function-valued services that should be registered directly instead of returned from a factory.

`bind(token).factory(...)` accepts the dependency-free and dependency-map overloads shown above.

`bind(token).class(Class)` creates the class with `new Class()`. `bind(token).class(dependencies, Class)` resolves the dependency map and passes it as the single constructor argument:

```ts
class ServerImpl {
    constructor(services: { readonly config: Config; readonly logger: Logger }) {}
}
```

`bind(token).alias(existingToken)` and `bind(token).useExisting(existingToken)` resolve `existingToken` and return that value for `token`. The existing token must be a regular token; the bound token may be regular or multibind. Alias bindings are transient by default so the alias follows the existing token's lifetime instead of caching the existing value on its own.

`bind(qualified(baseToken, qualifier)).factory(...)` binds the qualified token created from that base token and qualifier.

Lifetime and disposal methods may be called before or after the provider method:

```ts
const dbBinding = bind(Db).factory(() => createDb()).singleton().disposable((db) => db.close());
const requestUserBinding = bind(CurrentUser).scoped().factory(() => currentUser);
```

Use an explicit lifetime on aliases only when the alias binding itself should have that lifetime.

### `singleton()`, `scoped()`, and `transient()`

Creates a binding with an explicit lifetime.

```ts
const dbBinding = bind(Db).factory(() => createDb()).singleton();
const requestUserBinding = bind(CurrentUser).factory(() => currentUser).scoped();
const idBinding = bind(Id).transient().factory(() => crypto.randomUUID());
```

Lifetimes behave as follows:

- `singleton`: cached in the scope where the binding is registered and shared with child scopes;
- `scoped`: cached in the scope that resolves the service;
- `transient`: not cached; the factory runs for every resolution.

Factory, value, and class bindings are singleton by default. Alias bindings are transient by default.

Singleton bindings cannot depend on scoped bindings. TypeScript reports this at the container or scope definition, including through transitive dependencies.

Disposable transient values are tracked by the scope that resolved them and are closed when that scope is disposed. Transient values without a disposer are not tracked.

### `ref(token)` and `ref(() => token)`

Creates a lazy dependency reference.

```ts
const binding = bind(JobRunner).factory({ logger: ref(Logger) }, ({ logger }) => ({
    run: () => logger.value.log("Running job"),
}));
```

A `ref` dependency gives the factory a `Ref<T>` object with a readonly `.value` getter. The target service is resolved only when `.value` is read, then cached like any other service.

Use `ref` when a dependency is expensive, optional within a code path, or part of a circular relationship where access can be delayed until after initialization.

```ts
const usersBinding = bind(Users).factory({ audit: ref(Audit) }, ({ audit }) => ({
    getAudit: () => audit.value,
}));
```

`ref(() => token)` defers target token selection until the dependent service is initialized. The target service itself is still not created until `.value` is read.

```ts
const selectedLogger = ref(() => (useJson ? JsonLogger : TextLogger));
```

Accessing a `ref` before its target has finished initializing throws a circular initialization error. Return a function that reads `.value` later instead of reading it directly inside both sides of a cycle.

### `defineContainer(tokens, ...bindings)`

Creates a reusable container definition from an array of tokens and bindings.

```ts
const app = defineContainer(
    [Config, Logger],
    bind(Config).factory(() => ({ port: 3000 })),
    bind(Logger).factory(() => console),
);

const container = app.create();
```

At compile time, `defineContainer` validates that:

- every binding token belongs to the provided token list;
- every dependency token belongs to the token list;
- singleton dependency graphs have visible bindings;
- each token is bound once;
- eager dependencies do not form a cycle;
- singleton bindings do not depend on scoped bindings;
- binding tokens are not unions;
- spread bindings are passed as a tuple, not a widened array.

Scoped and transient bindings may depend on tokens supplied by a descendant scope. The parent `resolve` type only accepts
services whose dependencies are visible in that scope; the descendant `resolve` type includes the service once the needed
bindings are supplied.

Runtime checks cover binding shape, token list membership, duplicate bindings, and eager cycles for plain JavaScript or TypeScript code that bypasses the type system. Missing services and recursive resolution cycles are reported when the affected service is resolved or a `ref` value is read.

When spreading a binding list, preserve tuple information:

```ts
const bindings = [
    bind(Config).factory(() => ({ port: 3000 })),
    bind(Port).factory({ config: Config }, ({ config }) => config.port),
] as const;

const container = defineContainer([Config, Port], ...bindings).create();
```

Avoid spreading a plain `Binding[]`; TypeScript cannot validate individual bindings after the tuple has been widened.

### `defineModule(...)`, `exported(...)`, `composeModules(...)`, and `provideImport(...)`

Modules group local bindings behind an explicit exported interface.

```ts
const Json = qualifier("json");
const JsonLogger = qualified(Logger, Json);

const ConsumerModule = defineModule({
    imports: [Logger],
    bindings: [
        exported(bind(Consumer).factory({ logger: Logger }, ({ logger }) => ({
            loggerName: logger.name,
        }))),
    ],
} as const);

const LoggerModule = defineModule({
    bindings: [exported(bind(qualified(Logger, Json)).factory(() => ({ name: "json" })))],
} as const);

const App = composeModules({
    modules: [ConsumerModule, LoggerModule],
    wire: [provideImport(ConsumerModule, Logger).with(JsonLogger)],
    exports: [Consumer],
} as const);

const app = defineContainer.module(App).create();
```

`defineModule({ imports?, bindings })` creates a visibility boundary. Local bindings can depend on local tokens and imported tokens. Only `exported(bind(...))` bindings can satisfy another module's imports or a composition public export.

`composeModules({ modules })` wires module imports to exported providers with the same token and exposes all `exported(...)` tokens publicly. Use `exports` to narrow the public container surface, and use `wire` when a specific module import should be satisfied by a different exported provider token.

`provideImport(module, importToken).with(providerToken)` creates a wire entry for one imported regular token. The module must be included in the composition, the import token must appear in that module's `imports`, and the provider token's value type must be assignable to the import token's value type. Multibind imports are collected by token and are not wired with `provideImport`.

### `definition.create(...overrides)`

Creates an isolated runtime container from a definition. Each call has its own singleton, scoped, and disposal state.

```ts
const production = app.create();
const test = app.create(
    override(bind(Config).factory(() => ({ port: 4000 }))),
);
```

Use `override(binding)` for regular tokens. The binding must target a token already bound in the definition. Overrides are applied before the runtime container is built, so singleton services receive the replacement dependency.

Use `unbind(token)` to remove a regular token binding while creating a container:

```ts
const withoutLogger = app.create(
    unbind(Logger),
);
```

The token must already be bound in the definition. `unbind(...)` does not mutate the definition or existing containers. After unbinding, resolving that token fails and optional dependencies receive `undefined`. Singleton services with required dependencies on the token fail validation; scoped and transient services stay unavailable until a scope supplies the dependency.

Use `overrideAll(multibindToken, bindings)` for multibind tokens:

```ts
const test = app.create(
    overrideAll(Handlers, [
        bind(Handlers).factory(() => testHandler),
    ]),
);

const withoutHandlers = app.create(
    overrideAll(Handlers, []),
);
```

`overrideAll` replaces the whole collection for that token. The replacement order is the order of the bindings array. Use `overrideAll(token, [])` to remove all multibind contributions. Duplicate override or unbind operations for the same token are rejected.

### `container.createScope(...bindings)`

Creates a child scope that inherits parent bindings and can add or override bindings.

```ts
const request = app.createScope(
    bind(CurrentUser).scoped().factory(() => user),
);

const service = request.resolve(Service);
```

Scope bindings are validated against the parent container and the token list. Duplicate bindings inside the same scope are rejected, but a child scope can override a parent binding for the same token.

Singleton bindings are initialized from the scope where they are registered. Scoped and transient bindings resolve their dependencies from the scope that requested them, so parent scoped services can use child bindings and overrides.

### `container.runScoped(bindings, callback)`

Creates a child scope, passes it to `callback`, then disposes that scope whether the callback succeeds or throws.

```ts
const result = await app.runScoped(
    [bind(CurrentUser).scoped().factory(() => user)] as const,
    async (request) => request.resolve(Service).run(),
);
```

`runScoped` returns `Promise<Awaited<TResult>>` from the callback. If both the callback and scope disposal fail, it rejects with an `AggregateError` containing both failures.

### `container.resolve(token)`

Resolves a bound service.

```ts
const config = container.resolve(Config);
//    ^? { readonly port: number }
```

Only tokens with bindings and currently visible dependencies can be resolved at compile time. The return type is inferred from the token.

Resolution is lazy. Singleton and scoped bindings are cached according to their lifetime, while transient bindings create a new value on every resolution:

```ts
const first = container.resolve(Config);
const second = container.resolve(Config);

first === second; // true
```

Calling `resolve` after the container or scope has been disposed throws an error.

### `container.resolveAll(multibindToken)`

Resolves every visible contribution for a multibind token.

```ts
const hooks = container.resolveAll(Hooks);
//    ^? Hook[]
```

The returned array follows binding order within the visible container or module interface. Only multibind tokens with currently visible bindings can be resolved at compile time.

### `container.dispose()`

Disposes the container or scope and returns a `Promise<void>`.

```ts
await request.dispose();
await app.dispose();
```

Disposal behavior:

- only instances owned by the disposed scope are closed;
- parent disposal cascades to child scopes first;
- owned instances are disposed after their dependents, falling back to reverse creation order for unrelated instances;
- repeated `dispose()` calls are no-ops;
- if disposers throw, Distill still attempts to close every owned instance and rejects with an `AggregateError`.

After disposal, `resolve` and `createScope` throw.

### `container.disposed`

Boolean flag indicating whether the container or scope has been disposed.

### Exported Types

Distill also exports helper types for advanced typing:

```ts
import type {
    AllToken,
    AnyBindingOverride,
    Binding,
    BindingOverride,
    BindingOverrideAll,
    BindingUnbind,
    BindingLifetime,
    ComposedModuleDefinition,
    Container,
    ContainerDefinition,
    DependencyMap,
    Disposer,
    ExportedBinding,
    ModuleDefinition,
    ModuleImportWire,
    MultiToken,
    MultiTokenBuilder,
    OptionalToken,
    QualifiedToken,
    Qualifier,
    Ref,
    RefToken,
    ResolvedDependencies,
    Token,
    TokenBuilder,
    TokenKey,
    TokenKeyInput,
    TokenValue,
} from "@satunnaisuus/distill";
```

Most applications only need the functions. The types are useful when sharing binding tuples between modules, writing helpers that accept token lists, or exposing container-related types from your own library.

When annotating containers manually, prefer preserving the container type returned by `defineContainer` and `createScope`.
`Container<FlatBindings, TokenList>` can infer basic scope boundaries from a flat binding tuple, but it cannot reliably
reconstruct every child scope from that tuple alone. For example, a child binding that appears before a child override is
ambiguous without the original `createScope` boundary:

```ts
import { bind, defineContainer, token, type Container } from "@satunnaisuus/distill";

const Config = token("Config").of<{ readonly name: string }>();
const Port = token("Port").of<{ readonly value: number }>();

const rootConfig = bind(Config).scoped().factory(() => ({ name: "root" }));
const childPort = bind(Port).transient().factory(() => ({ value: 3000 }));
const childConfig = bind(Config).singleton().factory(() => ({ name: "child" }));

const child = defineContainer([Config, Port], rootConfig).create().createScope(childPort, childConfig);

// Avoid: the flat tuple does not say that childPort and childConfig were added together.
const typedChild: Container<
    readonly [typeof rootConfig, typeof childPort, typeof childConfig],
    readonly [typeof Config, typeof Port]
> = child;
```

If you need to write the type explicitly for a scoped container, pass the third `TScopes` parameter:

```ts
const typedChild: Container<
    readonly [typeof rootConfig, typeof childPort, typeof childConfig],
    readonly [typeof Config, typeof Port],
    readonly [readonly [typeof rootConfig], readonly [typeof childPort, typeof childConfig]]
> = child;
```
