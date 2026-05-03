import "dotenv/config";
import { bind, defineModule, exported } from "@satunnaisuus/distill";
import { AppConfig } from "./app-config.js";

const parsePort = (value: string | undefined) => {
    const port = Number.parseInt(value ?? "3000", 10);
    return Number.isInteger(port) && port > 0 ? port : 3000;
};

export const ConfigModule = defineModule({
    bindings: [
        exported(
            bind.value(AppConfig, {
                port: parsePort(process.env.PORT),
                databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
            }),
        ),
    ],
} as const);
