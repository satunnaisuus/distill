import { multiToken } from "@satunnaisuus/distill";
import type { Hono } from "hono";

export type HttpSubRouter = {
    readonly path: string;
    readonly router: Hono;
};

export const HttpSubRouterToken = multiToken("HttpSubRouter").of<HttpSubRouter>();
