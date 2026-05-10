import { Hono } from "hono";
import type { Router } from "../integration.js";
import type { HttpBindings } from "./http-bindings.js";

const router = new Hono<HttpBindings>();

router.get("/health", (c) => c.json({ ok: true }));

export const healthRouter: Router = {
    path: "/",
    router,
};
