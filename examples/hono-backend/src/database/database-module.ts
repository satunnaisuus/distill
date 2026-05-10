import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { bind, defineModule } from "@satunnaisuus/distill";
import { APP_CONFIG } from "../config/index.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { DATABASE } from "./database-token.js";

const createDatabaseClient = (databaseUrl: string) => {
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    return new PrismaClient({ adapter });
};
export const DatabaseModule = defineModule({
    imports: [APP_CONFIG],
    exports: [DATABASE],
    bindings: [
        bind(DATABASE)
            .factory({ config: APP_CONFIG }, ({ config }) => createDatabaseClient(config.databaseUrl))
            .disposable((database) => database.$disconnect()),
    ],
} as const);
