import { multiToken } from "@satunnaisuus/distill";
import type { Hono } from "hono";
import type { AuthHonoBindings } from "../auth/index.js";

export type HttpBindings = AuthHonoBindings;

export type HttpSubRouter = {
    readonly path: string;
    readonly router: Hono<HttpBindings>;
};

export const HttpSubRouterToken = multiToken("HttpSubRouter").of<HttpSubRouter>();
