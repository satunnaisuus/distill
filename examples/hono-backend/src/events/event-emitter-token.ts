import { multiToken, token } from "@satunnaisuus/distill";
import type { EventEmitter2, ListenerFn } from "eventemitter2";

export type EventHandler = {
    readonly name: string;
    readonly event: Parameters<EventEmitter2["on"]>[0];
    readonly handle: ListenerFn;
};

export type EventListener = {
    readonly bootstrap: () => void;
    readonly dispose: () => void;
};

export const EVENT_EMITTER = token("EventEmitter2").of<EventEmitter2>();
export const EVENT_HANDLER = multiToken("EventHandler").of<EventHandler>();
export const EVENT_LISTENER = token("EventListener").of<EventListener>();
