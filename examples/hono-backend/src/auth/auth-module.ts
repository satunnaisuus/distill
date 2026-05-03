import { bind, defineModule, exported } from "@satunnaisuus/distill";
import { AppConfig } from "../config/index.js";
import { Database } from "../database/index.js";
import { HttpSubRouterToken } from "../http/index.js";
import { createAuth } from "./auth.js";
import { createAuthSubRouter } from "./auth-router.js";
import { AuthToken, CurrentSession, CurrentUser } from "./auth-token.js";

export const AuthModule = defineModule({
    imports: [AppConfig, Database],
    bindings: [
        exported(
            bind(AuthToken, { config: AppConfig, database: Database }, ({ config, database }) =>
                createAuth(database, config),
            ),
        ),
        exported(bind.scoped(CurrentUser, () => null)),
        exported(bind.scoped(CurrentSession, () => null)),
        exported(bind(HttpSubRouterToken, { auth: AuthToken }, createAuthSubRouter)),
    ],
} as const);
