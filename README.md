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
    bind(Config, () => ({ port: 3000 })),
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
    bind(Handlers, () => ({ handle: (message) => console.log("audit", message) })),
    bind(Handlers, () => ({ handle: (message) => console.log("metrics", message) })),
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
    bind(Config, () => ({ port: 3000 })),
    bind(Logger, () => console),
    bind(Server, { config: Config, logger: Logger }, ({ config, logger }) => ({
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
    bindings: [exported(bind(Config, () => ({ url: "postgres://localhost" })))],
} as const);

const DbModule = defineModule({
    imports: [Config],
    bindings: [
        bind(Pool, { config: Config }, ({ config }) => ({ url: config.url })),
        exported(bind(Db, { pool: Pool }, ({ pool }) => createDb(pool))),
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

Module `imports` are tokens, not other modules. A module binding can depend on local bindings and on imported tokens; `composeModules(...)` then wires those imports to exported providers from the listed modules. The composition `exports` list is the full public interface of the container.

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
        bind(Hooks, () => ({ name: "internal" })),
        exported(bind(Hooks, () => ({ name: "public" }))),
        exported(
            bind(Registry, { hooks: all(Hooks) }, ({ hooks }) => ({
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
    bind.value(Config, { port: 3000 }),
    bind.value(ConsoleLogger, console),
    bind.alias(Logger, ConsoleLogger),
    bind.class(Server, { config: Config, logger: Logger }, ServerImpl),
).create();

container.resolve(Server).start();
```

Provider helpers are shorthand for regular bindings. They keep the same explicit dependency maps and compile-time graph validation.

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
    bind(Server, { config: optional(Config) }, ({ config }) => ({
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
    bind(JobRunner, { logger: ref(Logger) }, ({ logger }) => ({
        run: () => {
            logger.value.log("Running job");
        },
    })),
    bind(Logger, () => console),
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
    bind(Users, { audit: ref(Audit) }, ({ audit }) => ({
        getAudit: () => audit.value,
    })),
    bind(Audit, { users: ref(Users) }, ({ users }) => ({
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
    bind(Clock, () => ({ now: () => new Date() })),
    bind(Reports, { clock: Clock }, ({ clock }) => ({
        createdAt: () => clock.now(),
    })),
    bind(ReportHooks, () => () => console.log("audit")),
    bind(ReportHooks, () => () => console.log("metrics")),
);

const production = app.create();

const test = app.create(
    override(bind(Clock, () => ({ now: () => new Date("2026-01-01T00:00:00.000Z") }))),
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
    bind.scoped(AuditLog, { currentUser: CurrentUser }, ({ currentUser }) => ({
        userId: currentUser.id,
    })),
).create();

const request = app.createScope(
    bind.scoped(CurrentUser, () => ({ id: "user-1" })),
);

request.resolve(AuditLog).userId;
//    ^? string
```

Scope bindings can override parent bindings. Scoped instances are cached in the scope that resolves them, so separate request scopes receive separate `auditLog` instances.

Use `runScoped` when a request or job scope should be disposed automatically:

```ts
const requestBindings = [
    bind.scoped(CurrentUser, () => ({ id: "user-1" })),
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
    bind.singleton(Db, () => createDb(), {
        dispose: (db) => db.close(),
    }),
    bind.scoped(Service, { unitOfWork: UnitOfWork }, ({ unitOfWork }) => ({
        run: async () => {
            // use unitOfWork
        },
    })),
).create();

const request = app.createScope(
    bind.scoped(UnitOfWork, { db: Db }, ({ db }) => db.createUnitOfWork(), {
        dispose: (unitOfWork) => unitOfWork.rollback(),
    }),
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
bind(token, factory, options?)
bind(token, dependencies, factory, options?)
bind.value(token, value, options?)
bind.factory(token, factory, options?)
bind.factory(token, dependencies, factory, options?)
bind.class(token, Class, options?)
bind.class(token, dependencies, Class, options?)
bind.alias(token, existingToken)
bind.useExisting(token, existingToken)
bind.singleton(token, factory, options?)
bind.singleton(token, dependencies, factory, options?)
bind.scoped(token, factory, options?)
bind.scoped(token, dependencies, factory, options?)
bind.transient(token, factory, options?)
bind.transient(token, dependencies, factory, options?)
bind.singleton|scoped|transient.value(...)
bind.singleton|scoped|transient.factory(...)
bind.singleton|scoped|transient.class(...)
bind.singleton|scoped|transient.alias(...)
bind.singleton|scoped|transient.useExisting(...)
ref(token)
ref(() => token)
exported(binding)
defineModule({ imports?, bindings })
composeModules({ modules, exports })
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

### `bind(token, factory, options?)`

Creates a binding for a service without declared dependencies.

```ts
const configBinding = bind(Config, () => ({ port: 3000 }));
```

The factory is lazy: it is not called when the binding or container is created. It runs when the service is resolved according to the binding lifetime.

The default `bind(...)` lifetime is singleton. Singleton values are cached in the scope where the binding is registered, so resolving the same token again returns the same instance, including falsy values such as `false`, `0`, `null`, and `undefined`.

The factory return type must be assignable to the token value type. If the service value itself is a function, return that function from the factory:

```ts
const handlerBinding = bind(Handler, () => (message: string) => message.length);
```

Pass `options.dispose` to close values created by the binding:

```ts
const dbBinding = bind.singleton(Db, () => createDb(), {
    dispose: (db) => db.close(),
});
```

The disposer receives the resolved service value and may return `void` or `Promise<void>`.

### `bind(token, dependencies, factory, options?)`

Creates a binding for a service with an explicit dependency map.

```ts
const serverBinding = bind(
    Server,
    { config: Config, logger: Logger },
    ({ config, logger }) => ({
        start: () => logger.log(`Listening on ${config.port}`),
    }),
);
```

Dependency map keys become properties on the factory parameter. Dependency values can be:

- tokens, which are resolved eagerly before the factory runs;
- `ref(...)` dependencies, which pass a lazy `Ref<T>` object to the factory.

The factory parameter is inferred from the dependency map:

```ts
bind(Server, { config: Config }, ({ config }) => {
    // config is inferred from Config
    return { port: config.port };
});
```

Dependency keys must be string keys, and dependency values must be defined tokens or refs. Optional or possibly `undefined` dependency values are rejected by TypeScript.

Binding order does not matter:

```ts
const container = defineContainer(
    [Config, Server],
    bind(Server, { config: Config }, ({ config }) => ({ port: config.port })),
    bind(Config, () => ({ port: 3000 })),
).create();
```

The optional fourth argument is the same binding options object accepted by dependency-free bindings.

### Provider helpers

Provider helpers create the same `Binding` objects as `bind(...)`.

```ts
const configBinding = bind.value(Config, { port: 3000 });
const serverBinding = bind.factory(Server, { config: Config }, ({ config }) => ({ port: config.port }));
const classBinding = bind.class(Server, { config: Config }, ServerImpl);
const aliasBinding = bind.alias(Logger, ConsoleLogger);
```

`bind.value(token, value, options?)` binds an already-created value. Use it for configuration objects, test doubles, and function-valued services that should be registered directly instead of returned from a factory.

`bind.factory(...)` is an explicit provider-name alias for `bind(...)`; it accepts the same overloads and options.

`bind.class(token, Class, options?)` creates the class with `new Class()`. `bind.class(token, dependencies, Class, options?)` resolves the dependency map and passes it as the single constructor argument:

```ts
class ServerImpl {
    constructor(services: { readonly config: Config; readonly logger: Logger }) {}
}
```

`bind.alias(token, existingToken)` and `bind.useExisting(token, existingToken)` resolve `existingToken` and return that value for `token`. The existing token must be a regular token; the bound token may be regular or multibind. The top-level alias helpers are transient so the alias follows the existing token's lifetime instead of caching the existing value on its own.

All provider helpers are also available on `bind.singleton`, `bind.scoped`, and `bind.transient`. Use explicit lifetime alias helpers only when the alias itself should have that lifetime.

### `bind.singleton`, `bind.scoped`, and `bind.transient`

Creates a binding with an explicit lifetime.

```ts
const dbBinding = bind.singleton(Db, () => createDb());
const requestUserBinding = bind.scoped(CurrentUser, () => currentUser);
const idBinding = bind.transient(Id, () => crypto.randomUUID());
```

Lifetimes behave as follows:

- `singleton`: cached in the scope where the binding is registered and shared with child scopes;
- `scoped`: cached in the scope that resolves the service;
- `transient`: not cached; the factory runs for every resolution.

`bind(...)` is equivalent to `bind.singleton(...)`.

Singleton bindings cannot depend on scoped bindings. TypeScript reports this at the container or scope definition, including through transitive dependencies.

Disposable transient values are tracked by the scope that resolved them and are closed when that scope is disposed. Transient values without a disposer are not tracked.

### `ref(token)` and `ref(() => token)`

Creates a lazy dependency reference.

```ts
const binding = bind(JobRunner, { logger: ref(Logger) }, ({ logger }) => ({
    run: () => logger.value.log("Running job"),
}));
```

A `ref` dependency gives the factory a `Ref<T>` object with a readonly `.value` getter. The target service is resolved only when `.value` is read, then cached like any other service.

Use `ref` when a dependency is expensive, optional within a code path, or part of a circular relationship where access can be delayed until after initialization.

```ts
const usersBinding = bind(Users, { audit: ref(Audit) }, ({ audit }) => ({
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
    bind(Config, () => ({ port: 3000 })),
    bind(Logger, () => console),
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
    bind(Config, () => ({ port: 3000 })),
    bind(Port, { config: Config }, ({ config }) => config.port),
] as const;

const container = defineContainer([Config, Port], ...bindings).create();
```

Avoid spreading a plain `Binding[]`; TypeScript cannot validate individual bindings after the tuple has been widened.

### `definition.create(...overrides)`

Creates an isolated runtime container from a definition. Each call has its own singleton, scoped, and disposal state.

```ts
const production = app.create();
const test = app.create(
    override(bind(Config, () => ({ port: 4000 }))),
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
        bind(Handlers, () => testHandler),
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
    bind.scoped(CurrentUser, () => user),
);

const service = request.resolve(Service);
```

Scope bindings are validated against the parent container and the token list. Duplicate bindings inside the same scope are rejected, but a child scope can override a parent binding for the same token.

Singleton bindings are initialized from the scope where they are registered. Scoped and transient bindings resolve their dependencies from the scope that requested them, so parent scoped services can use child bindings and overrides.

### `container.runScoped(bindings, callback)`

Creates a child scope, passes it to `callback`, then disposes that scope whether the callback succeeds or throws.

```ts
const result = await app.runScoped(
    [bind.scoped(CurrentUser, () => user)] as const,
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
    Binding,
    BindingOverride,
    BindingOverrideAll,
    BindingUnbind,
    BindingLifetime,
    BindingOptions,
    Container,
    ContainerDefinition,
    DependencyMap,
    Disposer,
    OptionalToken,
    Ref,
    RefToken,
    ResolvedDependencies,
    Token,
    TokenBuilder,
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

const rootConfig = bind.scoped(Config, () => ({ name: "root" }));
const childPort = bind.transient(Port, () => ({ value: 3000 }));
const childConfig = bind.singleton(Config, () => ({ name: "child" }));

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
