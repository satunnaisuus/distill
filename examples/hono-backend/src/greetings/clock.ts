import { token } from "@satunnaisuus/distill";

export type Clock = {
    readonly now: () => Date;
};

export const CLOCK = token("Clock").of<Clock>();

export const systemClock: Clock = {
    now: () => new Date(),
};
