# Bindings

Bindings connect tokens to providers. Start with `bind(token)`, choose a provider, and optionally set a lifetime or a
disposer.

## Factory Bindings

Factories are lazy and infer their result type from the token.

Call shapes:

```ts
bind(token).factory(factory)
bind(token).factory(dependencies, factory)
```

```ts
import { bind } from "@satunnaisuus/distill";

const configBinding = bind(Config).factory(() => ({ port: 3000 }));
```

Use a dependency map when the factory needs services from the container:

```ts
const serverBinding = bind(Server).factory({ config: Config, logger: Logger }, ({ config, logger }) => ({
    start: () => logger.log(`Listening on ${config.port}`),
}));
```

Dependency map values can be tokens, `optional(...)`, or `ref(...)`.

## Value, Class, and Alias Providers

Use `.value(...)` for already-created values:

Call shape:

```ts
bind(token).value(value)
```

```ts
const configBinding = bind(Config).value({ port: 3000 });
```

Use `.class(...)` for class construction. Without dependencies, Distill calls the class constructor with no arguments.
With dependencies, Distill passes the resolved dependency object as the single constructor argument.

Call shapes:

```ts
bind(token).class(Class)
bind(token).class(dependencies, Class)
```

```ts
class ClockImpl {
    now() {
        return new Date();
    }
}

class ServerImpl {
    constructor(private readonly services: { readonly config: Config; readonly logger: Logger }) {}
}

const clockBinding = bind(Clock).class(ClockImpl);
const serverBinding = bind(Server).class({ config: Config, logger: Logger }, ServerImpl);
```

Use `.alias(...)` or `.useExisting(...)` when one token should resolve another token's value.

Call shapes:

```ts
bind(token).alias(existingToken)
bind(token).useExisting(existingToken)
```

```ts
const loggerBinding = bind(Logger).alias(ConsoleLogger);
```

## Lifetimes

Set lifetime before or after the provider method:

Call shapes:

```ts
bind(token).singleton()
bind(token).scoped()
bind(token).transient()
bind(token).singleton().factory(...)
bind(token).factory(...).scoped()
```

```ts
const dbBinding = bind(Db).singleton().factory(() => createDb());
const currentUserBinding = bind(CurrentUser).factory(() => currentUser).scoped();
const requestIdBinding = bind(RequestId).transient().factory(() => crypto.randomUUID());
```

The lifetimes are:

- `singleton`: cached in the scope where the binding is registered.
- `scoped`: cached in the scope that resolves the service.
- `transient`: not cached.

Factory, value, and class bindings are singleton by default. Alias bindings are transient by default so the alias follows
the existing token's lifetime instead of caching a separate value.

Singleton bindings cannot depend on scoped bindings.

## Optional Dependencies

Wrap a dependency with `optional(...)` when absence is intentional.

Call shapes:

```ts
optional(dependency)
optional(() => dependency)
```

```ts
import { optional } from "@satunnaisuus/distill";

const serverBinding = bind(Server).factory({ config: optional(Config) }, ({ config }) => ({
    port: config?.port ?? 3000,
}));
```

The factory receives `undefined` when the dependency is not visible in the current container or scope.

Use `optional(() => dependency)` when the dependency reference itself should be selected lazily.

```ts
const maybeConfig = optional(() => Config);
```

## Lazy References

Use `ref(...)` when access can be delayed, when a dependency is expensive, or when two services need to refer to each
other after initialization.

Call shapes:

```ts
ref(token)
ref(() => token)
```

```ts
import { ref } from "@satunnaisuus/distill";

const jobRunnerBinding = bind(JobRunner).factory({ logger: ref(Logger) }, ({ logger }) => ({
    run: () => logger.value.log("Running job"),
}));
```

The target service is resolved when `.value` is read.

Use `ref(() => token)` when the target token should be selected lazily. The service is still not resolved until `.value`
is read.

```ts
const selectedLogger = ref(() => (useJson ? JsonLogger : TextLogger));
```

## Multibind Dependencies

Use `multiToken(...)` for a token with multiple contributions. In dependency maps, use the multibind token directly to
inject all visible contributions.

Call shapes:

```ts
multiToken(key).of<T>()
container.resolve(multibindToken)
```

```ts
import { bind, multiToken } from "@satunnaisuus/distill";

const Hooks = multiToken("Hooks").of<{ readonly run: () => void }>();

const registryBinding = bind(Registry).factory({ hooks: Hooks }, ({ hooks }) => ({
    run: () => hooks.forEach((hook) => hook.run()),
}));
```

Resolve multibind tokens with `resolve(...)`.

```ts
const hooks = container.resolve(Hooks);
```

## Disposal

Attach a disposer to close values owned by a binding.

Call shapes:

```ts
bind(token).factory(...).disposable(disposer)
bind(token).disposable(disposer).factory(...)
container.dispose()
```

```ts
const dbBinding = bind(Db)
    .singleton()
    .factory(() => createDb())
    .disposable((db) => db.close());
```

Disposing a container or scope closes owned disposable values. Parent disposal cascades to child scopes before closing
parent-owned instances.
