import { Hono } from "hono";
import { type AppContainer, AppModule, createAppContainer, createAuthRequestScopeTemplate } from "./app-container.js";
import { AUTH, CURRENT_SESSION, CURRENT_USER } from "./auth/index.js";
import { EVENT_LISTENER } from "./events/index.js";
import type { HttpBindings } from "./http/index.js";
import { createHonoApp, type HonoContainer, type ROUTER } from "./integration.js";

export { AppModule, createAppContainer };

export const createApp = (container: AppContainer): Hono<HttpBindings> => {
    container.resolve(EVENT_LISTENER).bootstrap();

    const honoContainer: HonoContainer = {
        resolve: ((token: typeof ROUTER) => container.resolve(token)) as HonoContainer["resolve"],
    };
    const app = new Hono<HttpBindings>();
    const authRequestScopeTemplate = createAuthRequestScopeTemplate(container);

    app.use("*", async (c, next) => {
        const auth = container.resolve(AUTH);
        const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
        const user = authSession?.user ?? null;
        const session = authSession?.session ?? null;

        await authRequestScopeTemplate.runScoped({ user, session }, async (requestContainer) => {
            c.set("container", requestContainer);
            c.set("user", requestContainer.resolve(CURRENT_USER));
            c.set("session", requestContainer.resolve(CURRENT_SESSION));

            await next();
        });
    });

    return createHonoApp<HttpBindings>({
        container: honoContainer,
        app,
    });
};
