# Hono Backend Example

Create the SQLite database and run the Prisma migration:

```sh
pnpm --filter @satunnaisuus/distill-example-hono-backend prisma:migrate --name init
```

Run the example backend:

```sh
pnpm nx run @satunnaisuus/distill-example-hono-backend:dev
```

Then open:

```sh
curl "http://localhost:3000/?name=Distill"
```

Create and list persisted greetings:

```sh
curl -X POST "http://localhost:3000/greetings?name=Distill"
curl "http://localhost:3000/greetings"
```

Better Auth is mounted at `/api/auth/*`:

```sh
curl -i -c cookies.txt \
  -H "content-type: application/json" \
  -X POST "http://localhost:3000/api/auth/sign-up/email" \
  --data '{"email":"dev@example.com","password":"password123","name":"Dev"}'

curl -b cookies.txt "http://localhost:3000/api/auth/get-session"
```

Request handlers can read the request-scoped auth data from the Hono context:

```ts
const user = c.var.requestContainer.resolve(CurrentUser);
const session = c.var.requestContainer.resolve(CurrentSession);
```

Run the override-based route tests:

```sh
pnpm nx run @satunnaisuus/distill-example-hono-backend:test
```

The test example in `test/app.test.ts` creates the Hono app without starting the server and replaces exported container
bindings:

```ts
const container = AppModule.createContainer(
    override(bind(AuthToken).value(createAuthStub())),
    override(bind(GreetingServiceToken).value(service)),
);

const app = createApp(container);
const response = await app.request("/?name=Vitest");
```
