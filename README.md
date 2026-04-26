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
- Async resource disposal for containers and scopes.
- Explicit dependency maps instead of decorators, reflection, or global state.
- Lazy `ref` dependencies for deferred access and dependency cycles.
- No runtime dependencies; ESM-first package.

## Examples

### Define tokens and resolve a service

```ts
import { bind, createContainer, defineTokens, type as defineType } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

const tokens = defineTokens({
    config: defineType<Config>(),
});

const container = createContainer(
    tokens,
    bind(tokens.config, () => ({ port: 3000 })),
);

const config = container.resolve(tokens.config);
//    ^? Config
```

### Wire dependencies explicitly

```ts
import { bind, createContainer, defineTokens, type as defineType } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

type Server = {
    readonly start: () => void;
};

const tokens = defineTokens({
    config: defineType<Config>(),
    logger: defineType<Logger>(),
    server: defineType<Server>(),
});

const container = createContainer(
    tokens,
    bind(tokens.config, () => ({ port: 3000 })),
    bind(tokens.logger, () => console),
    bind(tokens.server, { config: tokens.config, logger: tokens.logger }, ({ config, logger }) => ({
        start: () => logger.log(`Listening on ${config.port}`),
    })),
);

container.resolve(tokens.server).start();
```

The `server` factory receives `{ config, logger }` with the correct inferred types. TypeScript reports out-of-registry dependencies, singleton missing bindings, and eager cycles at the container definition. Scoped and transient services with unresolved dependencies are omitted from `resolve` until a scope supplies those dependencies.

### Defer work with `ref`

```ts
import { bind, createContainer, defineTokens, ref, type as defineType } from "@satunnaisuus/distill";

type Logger = {
    readonly log: (message: string) => void;
};

type JobRunner = {
    readonly run: () => void;
};

const tokens = defineTokens({
    logger: defineType<Logger>(),
    jobRunner: defineType<JobRunner>(),
});

const container = createContainer(
    tokens,
    bind(tokens.jobRunner, { logger: ref(tokens.logger) }, ({ logger }) => ({
        run: () => {
            logger.value.log("Running job");
        },
    })),
    bind(tokens.logger, () => console),
);

const runner = container.resolve(tokens.jobRunner);
// The logger has not been created yet.

runner.run();
// logger.value resolves and caches the logger on first access.
```

### Break dependency cycles with `ref`

```ts
import { bind, createContainer, defineTokens, ref, type as defineType } from "@satunnaisuus/distill";

type Users = {
    readonly getAudit: () => Audit;
};

type Audit = {
    readonly getUsers: () => Users;
};

const tokens = defineTokens({
    users: defineType<Users>(),
    audit: defineType<Audit>(),
});

const container = createContainer(
    tokens,
    bind(tokens.users, { audit: ref(tokens.audit) }, ({ audit }) => ({
        getAudit: () => audit.value,
    })),
    bind(tokens.audit, { users: ref(tokens.users) }, ({ users }) => ({
        getUsers: () => users.value,
    })),
);

const users = container.resolve(tokens.users);
const audit = users.getAudit();

audit.getUsers() === users;
```

Use `ref` when access can be delayed until after initialization. Eager circular dependencies are rejected.

### Swap bindings for tests or environments

```ts
import { bind, createContainer, defineTokens, type as defineType } from "@satunnaisuus/distill";

type Clock = {
    readonly now: () => Date;
};

type ReportService = {
    readonly createdAt: () => Date;
};

const tokens = defineTokens({
    clock: defineType<Clock>(),
    reports: defineType<ReportService>(),
});

const createReportsBinding = () =>
    bind(tokens.reports, { clock: tokens.clock }, ({ clock }) => ({
        createdAt: () => clock.now(),
    }));

const production = createContainer(
    tokens,
    bind(tokens.clock, () => ({ now: () => new Date() })),
    createReportsBinding(),
);

const test = createContainer(
    tokens,
    bind(tokens.clock, () => ({ now: () => new Date("2026-01-01T00:00:00.000Z") })),
    createReportsBinding(),
);

production.resolve(tokens.reports).createdAt();
test.resolve(tokens.reports).createdAt();
```

### Create request scopes

```ts
import { bind, createContainer, defineTokens, type as defineType } from "@satunnaisuus/distill";

type CurrentUser = {
    readonly id: string;
};

type AuditLog = {
    readonly userId: string;
};

const tokens = defineTokens({
    currentUser: defineType<CurrentUser>(),
    auditLog: defineType<AuditLog>(),
});

const app = createContainer(
    tokens,
    bind.scoped(tokens.auditLog, { currentUser: tokens.currentUser }, ({ currentUser }) => ({
        userId: currentUser.id,
    })),
);

const request = app.createScope(
    bind.scoped(tokens.currentUser, () => ({ id: "user-1" })),
);

request.resolve(tokens.auditLog).userId;
//    ^? string
```

Scope bindings can override parent bindings. Scoped instances are cached in the scope that resolves them, so separate request scopes receive separate `auditLog` instances.

### Dispose resources

```ts
import { bind, createContainer, defineTokens, type as defineType } from "@satunnaisuus/distill";

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

const tokens = defineTokens({
    db: defineType<Db>(),
    unitOfWork: defineType<UnitOfWork>(),
    service: defineType<Service>(),
});

const app = createContainer(
    tokens,
    bind.singleton(tokens.db, () => createDb(), {
        dispose: (db) => db.close(),
    }),
    bind.scoped(tokens.service, { unitOfWork: tokens.unitOfWork }, ({ unitOfWork }) => ({
        run: async () => {
            // use unitOfWork
        },
    })),
);

const request = app.createScope(
    bind.scoped(tokens.unitOfWork, { db: tokens.db }, ({ db }) => db.createUnitOfWork(), {
        dispose: (unitOfWork) => unitOfWork.rollback(),
    }),
);

try {
    await request.resolve(tokens.service).run();
} finally {
    await request.dispose();
}

await app.dispose();
```

Disposing a scope closes only instances owned by that scope. The request scope closes its `unitOfWork`; the app container closes the root `db`. Parent disposal cascades to child scopes before closing parent-owned instances.

## API

```ts
type<T>()
defineTokens(definitions)
bind(token, factory, options?)
bind(token, dependencies, factory, options?)
bind.singleton(token, factory, options?)
bind.singleton(token, dependencies, factory, options?)
bind.scoped(token, factory, options?)
bind.scoped(token, dependencies, factory, options?)
bind.transient(token, factory, options?)
bind.transient(token, dependencies, factory, options?)
ref(token)
ref(() => token)
createContainer(tokens, ...bindings)
container.resolve(token)
container.createScope(...bindings)
container.dispose()
container.disposed
```

### `type<T>()`

Declares the value type for a token.

```ts
import { type as defineType } from "@satunnaisuus/distill";

const config = defineType<{ readonly port: number }>();
const unknownValue = defineType();
```

Type descriptors exist only to carry TypeScript information into `defineTokens`. They do not validate values at runtime. If `T` is omitted, the token value type is `unknown`.

Because the export is named `type`, import it with an alias such as `type as defineType`.

### `defineTokens(definitions)`

Creates a token registry from string keys and type descriptors.

```ts
const tokens = defineTokens({
    config: defineType<{ readonly port: number }>(),
    logger: defineType<{ readonly log: (message: string) => void }>(),
});
```

Each registry property becomes a token whose runtime value is the property key:

```ts
tokens.config === "config";
```

Each returned token keeps its literal key and declared value type. Token keys must be string keys, and definition values must be created with `type<T>()`.

### `bind(token, factory, options?)`

Creates a binding for a service without declared dependencies.

```ts
const configBinding = bind(tokens.config, () => ({ port: 3000 }));
```

The factory is lazy: it is not called when the binding or container is created. It runs when the service is resolved according to the binding lifetime.

The default `bind(...)` lifetime is singleton. Singleton values are cached in the scope where the binding is registered, so resolving the same token again returns the same instance, including falsy values such as `false`, `0`, `null`, and `undefined`.

The factory return type must be assignable to the token value type. If the service value itself is a function, return that function from the factory:

```ts
const handlerBinding = bind(tokens.handler, () => (message: string) => message.length);
```

Pass `options.dispose` to close values created by the binding:

```ts
const dbBinding = bind.singleton(tokens.db, () => createDb(), {
    dispose: (db) => db.close(),
});
```

The disposer receives the resolved service value and may return `void` or `Promise<void>`.

### `bind(token, dependencies, factory, options?)`

Creates a binding for a service with an explicit dependency map.

```ts
const serverBinding = bind(
    tokens.server,
    { config: tokens.config, logger: tokens.logger },
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
bind(tokens.server, { config: tokens.config }, ({ config }) => {
    // config is inferred from tokens.config
    return { port: config.port };
});
```

Dependency keys must be string keys, and dependency values must be defined tokens or refs. Optional or possibly `undefined` dependency values are rejected by TypeScript.

Binding order does not matter:

```ts
const container = createContainer(
    tokens,
    bind(tokens.server, { config: tokens.config }, ({ config }) => ({ port: config.port })),
    bind(tokens.config, () => ({ port: 3000 })),
);
```

The optional fourth argument is the same binding options object accepted by dependency-free bindings.

### `bind.singleton`, `bind.scoped`, and `bind.transient`

Creates a binding with an explicit lifetime.

```ts
const dbBinding = bind.singleton(tokens.db, () => createDb());
const requestUserBinding = bind.scoped(tokens.currentUser, () => currentUser);
const idBinding = bind.transient(tokens.id, () => crypto.randomUUID());
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
const binding = bind(tokens.jobRunner, { logger: ref(tokens.logger) }, ({ logger }) => ({
    run: () => logger.value.log("Running job"),
}));
```

A `ref` dependency gives the factory a `Ref<T>` object with a readonly `.value` getter. The target service is resolved only when `.value` is read, then cached like any other service.

Use `ref` when a dependency is expensive, optional within a code path, or part of a circular relationship where access can be delayed until after initialization.

```ts
const usersBinding = bind(tokens.users, { audit: ref(tokens.audit) }, ({ audit }) => ({
    getAudit: () => audit.value,
}));
```

`ref(() => token)` defers target token selection until the dependent service is initialized. The target service itself is still not created until `.value` is read.

```ts
const selectedLogger = ref(() => useJson ? tokens.jsonLogger : tokens.textLogger);
```

Accessing a `ref` before its target has finished initializing throws a circular initialization error. Return a function that reads `.value` later instead of reading it directly inside both sides of a cycle.

### `createContainer(tokens, ...bindings)`

Creates an isolated container from a token registry and bindings.

```ts
const container = createContainer(
    tokens,
    bind(tokens.config, () => ({ port: 3000 })),
    bind(tokens.logger, () => console),
);
```

At compile time, `createContainer` validates that:

- every binding token belongs to the provided registry;
- every dependency token belongs to the registry;
- singleton dependency graphs have visible bindings;
- each token is bound once;
- eager dependencies do not form a cycle;
- singleton bindings do not depend on scoped bindings;
- binding tokens are not unions;
- spread bindings are passed as a tuple, not a widened array.

Scoped and transient bindings may depend on tokens supplied by a descendant scope. The parent `resolve` type only accepts
services whose dependencies are visible in that scope; the descendant `resolve` type includes the service once the needed
bindings are supplied.

Runtime checks cover binding shape, registry membership, duplicate bindings, and eager cycles for plain JavaScript or TypeScript code that bypasses the type system. Missing services and recursive resolution cycles are reported when the affected service is resolved or a `ref` value is read.

When spreading a binding list, preserve tuple information:

```ts
const bindings = [
    bind(tokens.config, () => ({ port: 3000 })),
    bind(tokens.port, { config: tokens.config }, ({ config }) => config.port),
] as const;

const container = createContainer(tokens, ...bindings);
```

Avoid spreading a plain `Binding[]`; TypeScript cannot validate individual bindings after the tuple has been widened.

### `container.createScope(...bindings)`

Creates a child scope that inherits parent bindings and can add or override bindings.

```ts
const request = app.createScope(
    bind.scoped(tokens.currentUser, () => user),
);

const service = request.resolve(tokens.service);
```

Scope bindings are validated against the parent container and the token registry. Duplicate bindings inside the same scope are rejected, but a child scope can override a parent binding for the same token.

Singleton bindings are initialized from the scope where they are registered. Scoped and transient bindings resolve their dependencies from the scope that requested them, so parent scoped services can use child bindings and overrides.

### `container.resolve(token)`

Resolves a bound service.

```ts
const config = container.resolve(tokens.config);
//    ^? { readonly port: number }
```

Only tokens with bindings and currently visible dependencies can be resolved at compile time. The return type is inferred from the token.

Resolution is lazy. Singleton and scoped bindings are cached according to their lifetime, while transient bindings create a new value on every resolution:

```ts
const first = container.resolve(tokens.config);
const second = container.resolve(tokens.config);

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
    BindingLifetime,
    BindingOptions,
    Container,
    DependencyMap,
    Disposer,
    Ref,
    RefToken,
    ResolvedDependencies,
    Token,
    TokenDefinitions,
    Tokens,
    TypeDescriptor,
} from "@satunnaisuus/distill";
```

Most applications only need the functions. The types are useful when sharing binding tuples between modules, writing helpers that accept token registries, or exposing container-related types from your own library.

When annotating containers manually, prefer preserving the container type returned by `createContainer` and `createScope`.
`Container<FlatBindings, Registry>` can infer basic scope boundaries from a flat binding tuple, but it cannot reliably
reconstruct every child scope from that tuple alone. For example, a child binding that appears before a child override is
ambiguous without the original `createScope` boundary:

```ts
const rootConfig = bind.scoped(tokens.config, () => ({ name: "root" }));
const childPort = bind.transient(tokens.port, () => ({ value: 3000 }));
const childConfig = bind.singleton(tokens.config, () => ({ name: "child" }));

const child = createContainer(tokens, rootConfig).createScope(childPort, childConfig);

// Avoid: the flat tuple does not say that childPort and childConfig were added together.
const typedChild: Container<
    readonly [typeof rootConfig, typeof childPort, typeof childConfig],
    typeof tokens
> = child;
```

If you need to write the type explicitly for a scoped container, pass the third `TScopes` parameter:

```ts
const typedChild: Container<
    readonly [typeof rootConfig, typeof childPort, typeof childConfig],
    typeof tokens,
    readonly [readonly [typeof rootConfig], readonly [typeof childPort, typeof childConfig]]
> = child;
```
