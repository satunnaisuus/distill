# Getting Started

Install Distill from npm:

```sh
npm install @satunnaisuus/distill
```

## Define Tokens

Tokens are the typed keys used to register and resolve services. A token carries the runtime key and the TypeScript value
type for the service.

Call shape:

```ts
token(key).of<T>()
```

```ts
import { token } from "@satunnaisuus/distill";

type Config = {
    readonly port: number;
};

const Config = token("Config").of<Config>();
```

## Bind Services

Use `bind(token).factory(...)` to create a lazy service binding. The factory is called when the service is resolved, not
when the container is defined.

Call shapes:

```ts
defineContainer(tokens, ...bindings)
bind(token).factory(factory)
definition.create()
container.resolve(token)
```

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

## Add Dependencies

Factories can declare dependencies with an explicit object map. Distill infers the factory parameter from that map and
validates the graph against the container token list.

Call shape:

```ts
bind(token).factory(dependencies, factory)
```

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

const app = defineContainer(
    [Config, Logger, Server],
    bind(Config).factory(() => ({ port: 3000 })),
    bind(Logger).factory(() => console),
    bind(Server).factory({ config: Config, logger: Logger }, ({ config, logger }) => ({
        start: () => logger.log(`Listening on ${config.port}`),
    })),
);

const container = app.create();
container.resolve(Server).start();
```

## Next Steps

- Read [Tokens](/guide/tokens) for regular, multibind, and qualified service identifiers.
- Read [Bindings](/guide/bindings) for provider methods, lifetimes, optional dependencies, and lazy references.
- Read [Container](/guide/container) for definitions, resolution, scopes, overrides, and disposal.
- Read [Modules](/guide/modules) for imports, exports, private bindings, and composition roots.
- Open the [API Reference](/api/) when you need exact public types and functions.
