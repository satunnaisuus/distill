import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import type { AppConfigValue } from "../config/index.js";
import type { DatabaseClient } from "../database/index.js";

export const createAuth = (database: DatabaseClient, config: AppConfigValue) => {
    return betterAuth({
        baseURL: config.authBaseUrl,
        database: prismaAdapter(database, {
            provider: "sqlite",
        }),
        emailAndPassword: {
            enabled: true,
        },
        secret: config.authSecret,
    });
};
