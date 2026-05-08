import { Hono } from "hono";
import type { HttpBindings, HttpSubRouter } from "./http-sub-router.js";

const router = new Hono<HttpBindings>();

router.get("/health", (c) => c.json({ ok: true }));

export const healthSubRouter: HttpSubRouter = {
    path: "/",
    router,
};
