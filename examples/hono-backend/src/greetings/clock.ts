import { token } from "@satunnaisuus/distill";

export type Clock = {
    readonly now: () => Date;
};

export const ClockToken = token("Clock").of<Clock>();

export const systemClock: Clock = {
    now: () => new Date(),
};
