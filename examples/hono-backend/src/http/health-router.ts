import { Hono } from "hono";
import type { HttpSubRouter } from "./http-sub-router.js";

const router = new Hono();

router.get("/health", (c) => c.json({ ok: true }));

export const healthSubRouter: HttpSubRouter = {
    path: "/",
    router,
};
