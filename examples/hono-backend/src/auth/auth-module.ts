import { bind, defineModule } from "@satunnaisuus/distill";
import { APP_CONFIG } from "../config/index.js";
import { DATABASE } from "../database/index.js";
import { ROUTER } from "../integration.js";
import { createAuth } from "./auth.js";
import { createAuthRouter } from "./auth-router.js";
import { AUTH, CURRENT_SESSION, CURRENT_USER } from "./auth-token.js";
export const AuthModule = defineModule({
    imports: [APP_CONFIG, DATABASE],
    exports: [AUTH, CURRENT_USER, CURRENT_SESSION, ROUTER],
    bindings: [
        bind(AUTH).factory({ config: APP_CONFIG, database: DATABASE }, ({ config, database }) =>
            createAuth(database, config),
        ),
        bind(CURRENT_USER)
            .scoped()
            .factory(() => null),
        bind(CURRENT_SESSION)
            .scoped()
            .factory(() => null),
        bind(ROUTER).factory({ auth: AUTH }, createAuthRouter),
    ],
} as const);
