import { bind, defineModule } from "@satunnaisuus/distill";
import { AppConfig } from "../config/index.js";
import { Database } from "../database/index.js";
import { ROUTER } from "../integration.js";
import { createAuth } from "./auth.js";
import { createAuthRouter } from "./auth-router.js";
import { AuthToken, CurrentSession, CurrentUser } from "./auth-token.js";
export const AuthModule = defineModule({
    imports: [AppConfig, Database],
    exports: [AuthToken, CurrentUser, CurrentSession, ROUTER],
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
        bind(ROUTER).factory({ auth: AuthToken }, createAuthRouter),
    ],
} as const);
