import { serve } from "@hono/node-server";
import { composeModules, defineContainer } from "@satunnaisuus/distill";
import { Hono } from "hono";
import { AppConfig, ConfigModule } from "./config/index.js";
import { DatabaseModule } from "./database/index.js";
import { GreetingsModule } from "./greetings/index.js";
import { HttpModule, HttpSubRouterToken } from "./http/index.js";

const AppModule = composeModules({
    modules: [HttpModule, ConfigModule, DatabaseModule, GreetingsModule],
    exports: [AppConfig, HttpSubRouterToken],
} as const);

const container = defineContainer.module(AppModule).create();

const app = new Hono();

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
