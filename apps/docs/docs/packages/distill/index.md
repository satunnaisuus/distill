# @satunnaisuus/distill

`@satunnaisuus/distill` is the core dependency injection package. It provides tokens, bindings, containers, scopes, modules, overrides, multibind collections, optional dependencies, lazy references, and disposal.

## Start Here

- [Getting Started](/guide/getting-started)
- [Tokens](/guide/tokens)
- [Bindings](/guide/bindings)
- [Container](/guide/container)
- [Modules](/guide/modules)
- [API Reference](/api/distill/)

## Package Role

The core package has no framework dependency. Integration packages such as `distill-hono` and `distill-react` should build on these primitives instead of redefining container behavior.
