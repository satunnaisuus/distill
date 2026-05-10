import type { AuthRequestContainer } from "../app-container.js";
import type { AuthSession, AuthUser } from "./auth-token.js";

export type { AuthRequestContainer } from "../app-container.js";

export type AuthHttpVariables = {
    readonly container: AuthRequestContainer;
    readonly user: AuthUser | null;
    readonly session: AuthSession | null;
};

declare module "hono" {
    interface ContextVariableMap extends AuthHttpVariables {}
}

export type AuthHonoBindings = {
    readonly Variables: AuthHttpVariables;
};
