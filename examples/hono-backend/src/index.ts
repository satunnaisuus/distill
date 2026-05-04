import { serve } from "@hono/node-server";
import { bind, composeModules, defineContainer } from "@satunnaisuus/distill";
import { Hono } from "hono";
import { AuthModule, AuthToken, CurrentSession, CurrentUser } from "./auth/index.js";
import { AppConfig, ConfigModule } from "./config/index.js";
import { DatabaseModule } from "./database/index.js";
import { GreetingsModule } from "./greetings/index.js";
import { type HttpBindings, HttpModule, HttpSubRouterToken } from "./http/index.js";

const AppModule = composeModules({
    modules: [HttpModule, ConfigModule, DatabaseModule, AuthModule, GreetingsModule],
} as const);

const container = defineContainer.module(AppModule).create();

const app = new Hono<HttpBindings>();

app.use("*", async (c, next) => {
    const auth = container.resolve(AuthToken);
    const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
    const user = authSession?.user ?? null;
    const session = authSession?.session ?? null;

    await container.runScoped(
        [
            bind(CurrentUser)
                .scoped()
                .factory(() => user),
            bind(CurrentSession)
                .scoped()
                .factory(() => session),
        ] as const,
        async (requestContainer) => {
            c.set("requestContainer", requestContainer);
            c.set("user", requestContainer.resolve(CurrentUser));
            c.set("session", requestContainer.resolve(CurrentSession));

            await next();
        },
    );
});

for (const subRouter of container.resolveAll(HttpSubRouterToken)) {
    app.route(subRouter.path, subRouter.router);
}

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

const shutdown = async () => {
    await container.dispose();
};

process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
});
