import { bind, composeModules, type ScopeTemplateContainer } from "@satunnaisuus/distill";
import { AuthModule } from "./auth/auth-module.js";
import { type AuthSession, type AuthUser, CURRENT_SESSION, CURRENT_USER } from "./auth/auth-token.js";
import { ConfigModule } from "./config/index.js";
import { DatabaseModule } from "./database/index.js";
import { GreetingsModule } from "./greetings/index.js";
import { HttpModule } from "./http/index.js";

export const AppModule = composeModules({
    modules: [HttpModule, ConfigModule, DatabaseModule, AuthModule, GreetingsModule],
} as const);

export const createAppContainer = () => AppModule.createContainer();

export type AppContainer = ReturnType<typeof createAppContainer>;

export type AuthRequestScopeState = {
    readonly user: AuthUser | null;
    readonly session: AuthSession | null;
};

export function createAuthRequestScopeTemplate(container: AppContainer) {
    return container.createScopeTemplate(
        (state: AuthRequestScopeState) =>
            [
                bind(CURRENT_USER)
                    .scoped()
                    .factory(() => state.user),
                bind(CURRENT_SESSION)
                    .scoped()
                    .factory(() => state.session),
            ] as const,
    );
}

export type AuthRequestContainer = ScopeTemplateContainer<ReturnType<typeof createAuthRequestScopeTemplate>>;
