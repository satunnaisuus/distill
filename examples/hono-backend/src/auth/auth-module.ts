import { bind, defineModule } from "@satunnaisuus/distill";
import { AppConfig } from "../config/index.js";
import { Database } from "../database/index.js";
import { HttpSubRouterToken } from "../http/index.js";
import { createAuth } from "./auth.js";
import { createAuthSubRouter } from "./auth-router.js";
import { AuthToken, CurrentSession, CurrentUser } from "./auth-token.js";
export const AuthModule = defineModule({
    imports: [AppConfig, Database],
    exports: [AuthToken, CurrentUser, CurrentSession, HttpSubRouterToken],
    bindings: [
        bind(AuthToken).factory({ config: AppConfig, database: Database }, ({ config, database }) =>
            createAuth(database, config),
        ),
        bind(CurrentUser)
            .scoped()
            .factory(() => null),
        bind(CurrentSession)
            .scoped()
            .factory(() => null),
        bind(HttpSubRouterToken).factory({ auth: AuthToken }, createAuthSubRouter),
    ],
} as const);
