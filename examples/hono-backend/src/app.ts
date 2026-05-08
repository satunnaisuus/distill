import { bind, composeModules } from "@satunnaisuus/distill";
import { Hono } from "hono";
import {
    type Auth,
    AuthModule,
    type AuthRequestContainer,
    AuthToken,
    CurrentSession,
    CurrentUser,
} from "./auth/index.js";
import { ConfigModule } from "./config/index.js";
import { DatabaseModule } from "./database/index.js";
import { GreetingsModule } from "./greetings/index.js";
import { type HttpBindings, HttpModule, type HttpSubRouter, HttpSubRouterToken } from "./http/index.js";

export const AppModule = composeModules({
    modules: [HttpModule, ConfigModule, DatabaseModule, AuthModule, GreetingsModule],
} as const);

export const createAppContainer = () => AppModule.createContainer();

export type AppContainer = {
    readonly resolve: {
        (token: typeof AuthToken): Auth;
        (token: typeof HttpSubRouterToken): HttpSubRouter[];
    };
    readonly runScoped: (...args: any[]) => Promise<unknown>;
};

export const createApp = (container: AppContainer): Hono<HttpBindings> => {
    const app = new Hono<HttpBindings>();

    app.use("*", async (c, next) => {
        const auth = container.resolve(AuthToken);
        const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
        const user = authSession?.user ?? null;
        const session = authSession?.session ?? null;

        await container.runScoped(
            [
                bind(CurrentUser)
                    .scoped()
                    .factory(() => user),
                bind(CurrentSession)
                    .scoped()
                    .factory(() => session),
            ] as const,
            async (requestContainer: AuthRequestContainer) => {
                c.set("requestContainer", requestContainer);
                c.set("user", requestContainer.resolve(CurrentUser));
                c.set("session", requestContainer.resolve(CurrentSession));

                await next();
            },
        );
    });

    for (const subRouter of container.resolve(HttpSubRouterToken)) {
        app.route(subRouter.path, subRouter.router);
    }

    return app;
};
