# Distill

> Type-safe dependency injection for TypeScript

- End-to-end type inference for tokens, dependency maps, factories, and resolved values
- Compile-time checks for missing services, duplicate bindings, unknown dependencies, and eager cycles
- Explicit factory bindings without decorators, reflection, containers as globals, or runtime dependencies
- Singleton, scoped, and transient lifetimes with request-local overrides
- Modules with private bindings, explicit imports, selected exports, and multibind contributions
- VitePress documentation, generated API pages, and a real Hono backend example

Distill is a small dependency injection container for TypeScript applications. This monorepo contains the core package,
the documentation site, and examples that show how to keep service graphs explicit, typed, and reviewable.

[Read the docs](./apps/docs/docs/index.md) | [Core package](./packages/distill)

## Packages

| Project | Path | Description |
| --- | --- | --- |
| `@satunnaisuus/distill` | [`packages/distill`](./packages/distill) | Core DI container with tokens, bindings, scopes, modules, overrides, optional dependencies, lazy refs, multibinds, and disposal. |
| `@satunnaisuus/distill-docs` | [`apps/docs`](./apps/docs) | VitePress documentation site with TypeDoc-generated API pages. |
| `@satunnaisuus/distill-example-hono-backend` | [`examples/hono-backend`](./examples/hono-backend) | Hono, Prisma, Better Auth, and Distill example backend. |

## Getting Started

Install the core package in an application:

```sh
npm i @satunnaisuus/distill
```

## License

[MIT](./LICENSE)
