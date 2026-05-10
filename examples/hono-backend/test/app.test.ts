import { bind, override } from "@satunnaisuus/distill";
import { describe, expect, it, vi } from "vitest";
import { AppModule, createApp } from "../src/app.js";
import { AUTH, type Auth } from "../src/auth/index.js";
import { EVENT_EMITTER, USER_CREATED_EVENT } from "../src/events/index.js";
import { GREETING_SERVICE, type GreetingRecord, type GreetingService } from "../src/greetings/index.js";

const createAuthStub = (): Auth =>
    ({
        api: {
            getSession: async () => null,
        },
        handler: () => new Response("Not found", { status: 404 }),
    }) as unknown as Auth;

const persistedGreeting: GreetingRecord = {
    id: 1,
    name: "Stored",
    message: "Stored greeting",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const createGreetingServiceStub = () => {
    const createGreeting = vi.fn(async (name: string): Promise<GreetingRecord> => {
        return {
            id: 2,
            name,
            message: `Created greeting for ${name}`,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
        };
    });

    const service = {
        greet: (name: string) => `Test greeting for ${name}`,
        createGreeting,
        listGreetings: async () => [persistedGreeting],
    } as unknown as GreetingService;

    return { createGreeting, service };
};

describe("Hono app with Distill overrides", () => {
    it("tests routes against overridden container bindings", async () => {
        const { createGreeting, service } = createGreetingServiceStub();
        const container = AppModule.createContainer(
            override(bind(AUTH).value(createAuthStub())),
            override(bind(GREETING_SERVICE).value(service)),
        );

        try {
            const app = createApp(container);

            const greetingResponse = await app.request("/?name=Vitest");
            expect(greetingResponse.status).toBe(200);
            expect(await greetingResponse.json()).toEqual({
                greeting: "Test greeting for Vitest",
            });

            const listResponse = await app.request("/greetings");
            expect(listResponse.status).toBe(200);
            expect(await listResponse.json()).toEqual({
                greetings: [
                    {
                        id: 1,
                        name: "Stored",
                        message: "Stored greeting",
                        createdAt: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const createResponse = await app.request("/greetings?name=Override", { method: "POST" });
            expect(createResponse.status).toBe(201);
            expect(await createResponse.json()).toEqual({
                greeting: {
                    id: 2,
                    name: "Override",
                    message: "Created greeting for Override",
                    createdAt: "2026-01-02T00:00:00.000Z",
                },
            });
            expect(createGreeting).toHaveBeenCalledWith("Override");
        } finally {
            await container.dispose();
        }
    });

    it("creates a greeting when a user.created event is emitted", async () => {
        const { createGreeting, service } = createGreetingServiceStub();
        const container = AppModule.createContainer(
            override(bind(AUTH).value(createAuthStub())),
            override(bind(GREETING_SERVICE).value(service)),
        );

        try {
            createApp(container);
            createApp(container);

            await container.resolve(EVENT_EMITTER).emitAsync(USER_CREATED_EVENT, {
                id: "user-1",
                email: "new-user@example.com",
                name: "New User",
            });

            expect(createGreeting).toHaveBeenCalledWith("New User");
            expect(createGreeting).toHaveBeenCalledTimes(1);
        } finally {
            await container.dispose();
        }
    });
});
