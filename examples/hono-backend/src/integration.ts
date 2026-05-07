import { type Container, multiToken } from "@satunnaisuus/distill";
import { Hono } from "hono";

export type Router = { path: string; router: Hono };
export const ROUTER = multiToken("distill:hono:router").of<Router>();

export type HonoContainer = Pick<Container<readonly [], readonly [typeof ROUTER]>, "resolve">;

export function createHono(options: { container: HonoContainer; app?: Hono }) {
    const app = options.app ?? new Hono();

    const routers = options.container.resolve(ROUTER);

    for (const { path, router } of routers) {
        app.route(path, router);
    }

    return app;
}
