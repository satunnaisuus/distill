import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import type { EventEmitter2 } from "eventemitter2";
import type { AppConfigValue } from "../config/index.js";
import type { DatabaseClient } from "../database/index.js";
import { USER_CREATED_EVENT, type UserCreatedEvent } from "../events/index.js";

export const createAuth = (database: DatabaseClient, config: AppConfigValue, eventEmitter: EventEmitter2) => {
    return betterAuth({
        baseURL: config.authBaseUrl,
        database: prismaAdapter(database, {
            provider: "sqlite",
        }),
        databaseHooks: {
            user: {
                create: {
                    after: async (user) => {
                        const event: UserCreatedEvent = {
                            id: user.id,
                            email: user.email,
                            name: user.name ?? user.email,
                        };

                        await eventEmitter.emitAsync(USER_CREATED_EVENT, event);
                    },
                },
            },
        },
        emailAndPassword: {
            enabled: true,
        },
        secret: config.authSecret,
    });
};
