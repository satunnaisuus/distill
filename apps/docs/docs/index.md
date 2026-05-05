# Distill

Distill is a type-safe dependency injection container for TypeScript. It uses typed tokens and explicit factory bindings so TypeScript can catch unresolved services, singleton missing bindings, duplicate bindings, unknown dependencies, and eager dependency cycles at compile time.

```sh
npm install @satunnaisuus/distill
```

## What It Solves

- Catches wiring errors at compile time: missing services, duplicate registrations, unknown dependencies, and eager cycles
  are reported where the container is defined.
- Keeps container resolution typed: services preserve their token types instead of relying on casts, `unknown`, or
  duplicated annotations.
- Enforces lifetime rules in types: long-lived services cannot capture shorter-lived request state.
- Makes dependency graphs explicit and reviewable: every factory declares the services it reads before creating the object.
- Keeps module boundaries intact: modules expose only their public services, while internal bindings remain private.

## First Container

```ts
import { bind, defineContainer, token } from "@satunnaisuus/distill";

type AppConfig = {
    readonly appUrl: string;
};

type Logger = {
    readonly info: (message: string) => void;
};

type WelcomeEmail = {
    readonly send: (user: { readonly name: string; readonly email: string }) => void;
};

const AppConfig = token("AppConfig").of<AppConfig>();
const Logger = token("Logger").of<Logger>();
const WelcomeEmail = token("WelcomeEmail").of<WelcomeEmail>();

const container = defineContainer(
    [AppConfig, Logger, WelcomeEmail],
    bind(AppConfig).value({ appUrl: "https://app.example.com" }),
    bind(Logger).value(console),
    bind(WelcomeEmail).factory({ config: AppConfig, logger: Logger }, ({ config, logger }) => ({
        send: ({ name, email }) => {
            const link = `${config.appUrl}/welcome`;
            logger.info(`Sending welcome email to ${name} <${email}>: ${link}`);
        },
    })),
).create();

const welcomeEmail = container.resolve(WelcomeEmail);

welcomeEmail.send({ name: "John", email: "john.doe@example.com" });
```

## Where To Go Next

| Goal | Read |
| --- | --- |
| Install the package and create the smallest useful container. | [Getting Started](/guide/getting-started) |
| Define regular, multibind, and qualified service identifiers. | [Tokens](/guide/tokens) |
| Choose between factory, value, class, alias, optional, lazy, and multibind providers. | [Bindings](/guide/bindings) |
| Create containers, resolve services, use scopes, override bindings, and dispose resources. | [Container](/guide/container) |
| Split features into private module bindings with explicit imports and exports. | [Modules](/guide/modules) |
| Check exact public types, overloads, and generated API pages. | [API Reference](/api/) |

## Package

The core package is [`@satunnaisuus/distill`](/packages/distill/). It provides the container primitives that future
integration packages can build on without redefining dependency injection behavior.
