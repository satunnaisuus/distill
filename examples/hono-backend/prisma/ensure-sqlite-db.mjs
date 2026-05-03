import "dotenv/config";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

if (databaseUrl.startsWith("file:")) {
    const databasePath = databaseUrl.slice("file:".length).split("?")[0];

    if (databasePath && databasePath !== ":memory:") {
        const absolutePath = databasePath.startsWith("/") ? databasePath : resolve(packageRoot, databasePath);

        mkdirSync(dirname(absolutePath), { recursive: true });
        closeSync(openSync(absolutePath, "a"));
    }
}
