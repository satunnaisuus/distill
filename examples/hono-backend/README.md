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
