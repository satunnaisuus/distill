import type { AuthSession, AuthUser, CurrentSession, CurrentUser } from "./auth-token.js";

export type AuthRequestContainer = {
    resolve(token: typeof CurrentUser): AuthUser | null;
    resolve(token: typeof CurrentSession): AuthSession | null;
};

export type AuthHttpVariables = {
    readonly requestContainer: AuthRequestContainer;
    readonly user: AuthUser | null;
    readonly session: AuthSession | null;
};

export type AuthHonoBindings = {
    readonly Variables: AuthHttpVariables;
};
