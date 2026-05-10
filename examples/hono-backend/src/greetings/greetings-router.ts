import { Hono } from "hono";
import type { HttpBindings } from "../http/index.js";
import type { Router } from "../integration.js";
import type { GreetingService } from "./greeting-service.js";

export const createGreetingsRouter = (greetingService: GreetingService): Router => {
    const router = new Hono<HttpBindings>();

    router.get("/", (c) => {
        return c.json({
            greeting: greetingService.greet(c.req.query("name") ?? "Hono"),
        });
    });

    router.get("/greetings", async (c) => {
        const greetings = await greetingService.listGreetings();

        return c.json({
            greetings,
        });
    });

    router.post("/greetings", async (c) => {
        const name = c.req.query("name") ?? "Hono";
        const greeting = await greetingService.createGreeting(name);

        return c.json({ greeting }, 201);
    });

    return {
        path: "/",
        router,
    };
};
