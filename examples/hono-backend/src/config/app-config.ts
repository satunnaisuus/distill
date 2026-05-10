import { token } from "@satunnaisuus/distill";

export type AppConfigValue = {
    readonly port: number;
    readonly databaseUrl: string;
    readonly authBaseUrl: string;
    readonly authSecret: string;
};

export const APP_CONFIG = token("AppConfig").of<AppConfigValue>();
