import { token } from "@satunnaisuus/distill";
import type { createAuth } from "./auth.js";

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];

export const AuthToken = token("Auth").of<Auth>();
export const CurrentUser = token("CurrentUser").of<AuthUser | null>();
export const CurrentSession = token("CurrentSession").of<AuthSession | null>();
