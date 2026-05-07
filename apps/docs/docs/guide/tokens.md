# Tokens

Tokens are the typed keys Distill uses to register and resolve services. A token carries both the runtime identity used
by the container and the TypeScript value type returned when that token is resolved.

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

Use tokens at call sites instead of classes or string literals. This lets TypeScript connect each service key to the
value type it represents.

## Token Keys

Token keys can be strings, symbols, or classes.

Call shapes:

```ts
token("Name").of<T>()
token(symbolKey).of<T>()
token(ClassKey).of()
```

```ts
import { token } from "@satunnaisuus/distill";

class LoggerService {
    log(message: string) {
        console.log(message);
    }
}

const Logger = token(LoggerService).of();
const Cache = token(Symbol("Cache")).of<{ readonly get: (key: string) => unknown }>();
```

When the key is a class, `.of()` defaults to the class instance type. Pass an explicit type to `.of<T>()` when the token
should resolve an interface, object shape, or narrower public contract.

## Multibind Tokens

Use `multiToken(...)` when several bindings should contribute values to the same service collection.

Call shapes:

```ts
multiToken(key).of<T>()
container.resolve(multibindToken)
```

```ts
import { bind, defineContainer, multiToken } from "@satunnaisuus/distill";

type Hook = {
    readonly run: () => void;
};

const Hooks = multiToken("Hooks").of<Hook>();

const container = defineContainer(
    [Hooks],
    bind(Hooks).factory(() => ({ run: () => console.log("audit") })),
    bind(Hooks).factory(() => ({ run: () => console.log("metrics") })),
).create();

const hooks = container.resolve(Hooks);
//    ^? Hook[]
```

Regular tokens resolve with `resolve(token)` to one service value. Multibind tokens also use `resolve(token)` and return
all visible contributions in registration order.

## Qualified Tokens

Use `qualifier(...)` and `qualified(...)` when several services share the same value type but must remain separate
container entries.

Call shapes:

```ts
qualifier(key)
qualified(baseToken, qualifier)
```

```ts
import { bind, defineContainer, qualified, qualifier, token } from "@satunnaisuus/distill";

type Logger = {
    readonly log: (message: string) => void;
};

const Logger = token("Logger").of<Logger>();
const Json = qualifier("json");
const Text = qualifier("text");

const JsonLogger = qualified(Logger, Json);
const TextLogger = qualified(Logger, Text);

const container = defineContainer(
    [JsonLogger, TextLogger],
    bind(JsonLogger).value(console),
    bind(TextLogger).value(console),
).create();

const logger = container.resolve(JsonLogger);
//    ^? Logger
```

Qualified tokens keep the value type of the base token. They are still single tokens, so they use `resolve(...)`. Use the
qualified token value anywhere you would use a regular single token: token lists, bindings, dependency maps, overrides,
and `resolve(...)`.

## Token Lists

`defineContainer(tokens, ...bindings)` uses the token list as the container's public vocabulary. Bindings and dependency
maps must use tokens from that list.

Call shape:

```ts
defineContainer(tokens, ...bindings)
```

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

const Config = token("Config").of<{ readonly port: number }>();

const app = defineContainer(
    [Config],
    bind(Config).value({ port: 3000 }),
);
```

Keep token lists and reusable binding lists as tuples with `as const` or `satisfies` when they are moved into variables,
so TypeScript can keep validating individual entries.
