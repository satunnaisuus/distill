import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { bind, defineModule, exported } from "@satunnaisuus/distill";
import { AppConfig } from "../config/index.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { Database } from "./database-token.js";

const createDatabaseClient = (databaseUrl: string) => {
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

    return new PrismaClient({ adapter });
};

export const DatabaseModule = defineModule({
    imports: [AppConfig],
    bindings: [
        exported(
            bind(Database, { config: AppConfig }, ({ config }) => createDatabaseClient(config.databaseUrl), {
                dispose: (database) => database.$disconnect(),
            }),
        ),
    ],
} as const);
