import { token } from "@satunnaisuus/distill";

export type AppConfigValue = {
    readonly port: number;
    readonly databaseUrl: string;
};

export const AppConfig = token("AppConfig").of<AppConfigValue>();
