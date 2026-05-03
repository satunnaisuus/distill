import { serve } from "@hono/node-server";
import { bind, defineContainer, token } from "@satunnaisuus/distill";
import { Hono } from "hono";

type AppConfig = {
    readonly port: number;
};

type Clock = {
    readonly now: () => Date;
};

type GreetingService = {
    readonly greet: (name: string) => string;
};

const AppConfig = token("AppConfig").of<AppConfig>();
const Clock = token("Clock").of<Clock>();
const GreetingService = token("GreetingService").of<GreetingService>();

const parsePort = (value: string | undefined) => {
    const port = Number.parseInt(value ?? "3000", 10);
    return Number.isInteger(port) && port > 0 ? port : 3000;
};

const container = defineContainer(
    [AppConfig, Clock, GreetingService],
    bind.value(AppConfig, {
        port: parsePort(process.env.PORT),
    }),
    bind.value(Clock, {
        now: () => new Date(),
    }),
    bind(GreetingService, { clock: Clock }, ({ clock }) => ({
        greet: (name) => `Hello, ${name}! It is ${clock.now().toISOString()}.`,
    })),
).create();

const app = new Hono();

app.get("/", (c) => {
    const greetingService = container.resolve(GreetingService);

    return c.json({
        greeting: greetingService.greet(c.req.query("name") ?? "Hono"),
    });
});

app.get("/health", (c) => c.json({ ok: true }));

const config = container.resolve(AppConfig);

serve(
    {
        fetch: app.fetch,
        port: config.port,
    },
    (info) => {
        console.log(`Listening on http://localhost:${info.port}`);
    },
);
