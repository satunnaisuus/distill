import { type Container, multiToken } from "@satunnaisuus/distill";
import { type Env, Hono } from "hono";

export type Router<TBindings extends Env = any> = { readonly path: string; readonly router: Hono<TBindings> };
export const ROUTER = multiToken("distill:hono:router").of<Router>();

export type HonoContainer = Pick<Container<readonly [], readonly [typeof ROUTER]>, "resolve">;

export function createHonoApp<TBindings extends Env = Env>(options: {
    container: HonoContainer;
    app?: Hono<TBindings>;
}): Hono<TBindings> {
    const app = options.app ?? new Hono<TBindings>();

    const routers = options.container.resolve(ROUTER);

    for (const { path, router } of routers) {
        app.route(path, router);
    }

    return app;
}
