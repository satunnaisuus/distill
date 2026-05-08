import type { Token } from "@satunnaisuus/distill";

export const externalToken = "external" as Token<"external", number>;
export const anyValuePortToken = "port" as Token<"port", any>;
export const anyKeyPortToken = "port" as Token<any, number>;
export const anyKeyAnyValuePortToken = "port" as Token<any, any>;
export const wideAnyValueToken = "port" as Token<string, any>;
