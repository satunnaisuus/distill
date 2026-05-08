import { Hono } from "hono";
import type { HttpBindings, HttpSubRouter } from "../http/index.js";
import type { Auth } from "./auth-token.js";

type CreateAuthSubRouterDeps = {
    auth: Auth;
};

export const createAuthSubRouter = ({ auth }: CreateAuthSubRouterDeps): HttpSubRouter => {
    const router = new Hono<HttpBindings>();

    router.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));

    return {
        path: "/api/auth",
        router,
    };
};
