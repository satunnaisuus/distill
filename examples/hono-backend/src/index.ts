import { serve } from "@hono/node-server";
import { createApp, createAppContainer } from "./app.js";
import { AppConfig } from "./config/index.js";

const container = createAppContainer();
const app = createApp(container);
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
