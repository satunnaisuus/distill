import { Hono } from "hono";
import type { HttpBindings } from "../http/index.js";
import type { Router } from "../integration.js";
import type { Auth } from "./auth-token.js";

type CreateAuthRouterDeps = {
    auth: Auth;
};

export const createAuthRouter = ({ auth }: CreateAuthRouterDeps): Router => {
    const router = new Hono<HttpBindings>();

    router.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));

    return {
        path: "/api/auth",
        router,
    };
};
