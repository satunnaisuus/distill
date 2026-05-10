import { token } from "@satunnaisuus/distill";
import type { createAuth } from "./auth.js";

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];

export const AUTH = token("Auth").of<Auth>();
export const CURRENT_USER = token("CurrentUser").of<AuthUser | null>();
export const CURRENT_SESSION = token("CurrentSession").of<AuthSession | null>();
