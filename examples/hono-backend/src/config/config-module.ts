import "dotenv/config";
import { bind, defineModule } from "@satunnaisuus/distill";
import { APP_CONFIG } from "./app-config.js";

const parsePort = (value: string | undefined) => {
    const port = Number.parseInt(value ?? "3000", 10);
    return Number.isInteger(port) && port > 0 ? port : 3000;
};
const port = parsePort(process.env.PORT);
export const ConfigModule = defineModule({
    exports: [APP_CONFIG],
    bindings: [
        bind(APP_CONFIG).value({
            port,
            databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
            authBaseUrl: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
            authSecret: process.env.BETTER_AUTH_SECRET ?? "distill-hono-backend-dev-secret-change-me",
        }),
    ],
} as const);
