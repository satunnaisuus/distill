# Distill

Distill is a small, type-safe dependency injection container for TypeScript. It uses typed tokens and explicit factory bindings so TypeScript can catch missing bindings, duplicate bindings, unknown dependencies, and eager dependency cycles at compile time.

## Installation

```sh
npm install @satunnaisuus/distill
```

## Features

- End-to-end type inference for tokens, dependency maps, factories, and resolved values.
- Compile-time checks for missing bindings, duplicate bindings, unknown dependencies, and eager dependency cycles.
- Lazy service creation with per-container instance caching.
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

The `server` factory receives `{ config, logger }` with the correct inferred types. TypeScript reports missing bindings, out-of-registry dependencies, and eager cycles at the container definition.

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

## API

```ts
type<T>()
defineTokens(definitions)
bind(token, factory)
bind(token, dependencies, factory)
ref(token)
ref(() => token)
createContainer(tokens, ...bindings)
container.resolve(token)
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

### `bind(token, factory)`

Creates a binding for a service without declared dependencies.

```ts
const configBinding = bind(tokens.config, () => ({ port: 3000 }));
```

The factory is lazy: it is not called when the binding or container is created. It runs the first time the service is resolved.

The created value is cached per container, so resolving the same token again returns the same instance, including falsy values such as `false`, `0`, `null`, and `undefined`.

The factory return type must be assignable to the token value type. If the service value itself is a function, return that function from the factory:

```ts
const handlerBinding = bind(tokens.handler, () => (message: string) => message.length);
```

### `bind(token, dependencies, factory)`

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
- every dependency token has a binding in the container;
- each token is bound once;
- eager dependencies do not form a cycle;
- binding tokens are not unions;
- spread bindings are passed as a tuple, not a widened array.

Runtime checks cover the same cases for plain JavaScript or TypeScript code that bypasses the type system. Eager circular dependencies are rejected when the container is created. Missing services and recursive resolution cycles are reported when the affected service is resolved or a `ref` value is read.

When spreading a binding list, preserve tuple information:

```ts
const bindings = [
    bind(tokens.config, () => ({ port: 3000 })),
    bind(tokens.port, { config: tokens.config }, ({ config }) => config.port),
] as const;

const container = createContainer(tokens, ...bindings);
```

Avoid spreading a plain `Binding[]`; TypeScript cannot validate individual bindings after the tuple has been widened.

### `container.resolve(token)`

Resolves a bound service.

```ts
const config = container.resolve(tokens.config);
//    ^? { readonly port: number }
```

Only tokens that have bindings in that container can be resolved at compile time. The return type is inferred from the token.

Resolution is lazy and cached:

```ts
const first = container.resolve(tokens.config);
const second = container.resolve(tokens.config);

first === second; // true
```

### Exported Types

Distill also exports helper types for advanced typing:

```ts
import type {
    Binding,
    Container,
    DependencyMap,
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
