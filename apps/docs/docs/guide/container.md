# Container

A container definition describes a typed dependency graph. Calling `.create()` creates an isolated runtime container with
its own singleton cache, child scopes, and disposal state.

Call shapes:

```ts
defineContainer(tokens, ...bindings)
definition.create()
definition.create(...overrides)
```

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

type Logger = {
    readonly log: (message: string) => void;
};

const Config = token("Config").of<Config>();
const Logger = token("Logger").of<Logger>();

const app = defineContainer(
    [Config, Logger],
    bind(Config).value({ port: 3000 }),
    bind(Logger).value(console),
);

const container = app.create();
```

The definition is reusable. Each container created from it owns independent cached instances and can be disposed
separately.

## Resolution

Use `resolve(token)` for single tokens and `resolveAll(token)` for multibind tokens. Services are lazy: factory and class
providers run only when a visible service is requested.

Call shapes:

```ts
container.resolve(token)
container.resolveAll(multibindToken)
```

```ts
const config = container.resolve(Config);
//    ^? Config
```

Distill validates dependency maps against the token list and checks the graph where TypeScript can see tuple types. A
service is resolvable only when its eager dependencies are visible in the current container or scope.

## Scopes

Scopes inherit parent bindings and can add request-local bindings.

Call shape:

```ts
container.createScope(...bindings)
```

```ts
const CurrentUser = token("CurrentUser").of<{ readonly id: string }>();

const request = container.createScope(
    bind(CurrentUser).scoped().factory(() => ({ id: "user-1" })),
);

const currentUser = request.resolve(CurrentUser);
```

Use scoped bindings for values that should be cached once per resolving scope. Singleton bindings are cached where they
are registered, and transient bindings are created on every resolution.

## Automatic Scope Disposal

`runScoped(...)` creates a child scope, passes it to a callback, and disposes the scope after the callback settles.

Call shape:

```ts
container.runScoped(bindings, callback)
```

```ts
await container.runScoped(
    [bind(CurrentUser).scoped().factory(() => ({ id: "user-1" }))],
    async (scope) => {
        await handleRequest(scope.resolve(CurrentUser));
    },
);
```

This is useful for requests, jobs, tests, and any workflow where scoped resources should not escape.

## Overrides

Pass overrides to `.create(...)` when a container instance needs different bindings from the definition.

Call shapes:

```ts
definition.create(override(binding))
definition.create(overrideAll(multibindToken, bindings))
definition.create(unbind(token))
```

```ts
import { override, overrideAll, unbind } from "@satunnaisuus/distill";

const testContainer = app.create(
    override(bind(Config).value({ port: 0 })),
);

const withoutLogger = app.create(
    unbind(Logger),
);
```

Use overrides for tests and composition roots. They are checked against the same token list and graph rules as regular
bindings.

Use `override(...)` for regular tokens. Use `unbind(...)` to remove a regular token binding for one container instance;
optional dependencies on that token receive `undefined`, and required services that still need it become unavailable.

Use `overrideAll(...)` for multibind tokens. It replaces the whole visible contribution list for that token, preserving
the replacement binding order.

```ts
import { multiToken } from "@satunnaisuus/distill";

const Hooks = multiToken("Hooks").of<() => void>();
const testHook = () => console.log("test");

const appWithHooks = defineContainer(
    [Hooks],
    bind(Hooks).value(() => console.log("audit")),
);

const testHooks = appWithHooks.create(
    overrideAll(Hooks, [
        bind(Hooks).value(testHook),
    ]),
);

const withoutHooks = appWithHooks.create(
    overrideAll(Hooks, []),
);
```

## Disposal

Attach disposers to bindings that own resources, then dispose the container or scope that owns them.

Call shapes:

```ts
bind(token).factory(...).disposable(disposer)
container.dispose()
container.disposed
```

```ts
const Db = token("Db").of<{ readonly close: () => Promise<void> }>();

const dbBinding = bind(Db)
    .singleton()
    .factory(() => createDb())
    .disposable((db) => db.close());
```

Disposing a parent container cascades through child scopes before closing parent-owned instances. A disposed container or
scope cannot resolve services or create more child scopes.

Use the readonly `disposed` flag when shutdown code needs to avoid duplicate work.

```ts
if (!container.disposed) {
    await container.dispose();
}
```
