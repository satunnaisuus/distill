import { bind, defineModule } from "@satunnaisuus/distill";
import { EventEmitter2 } from "eventemitter2";
import { EVENT_EMITTER, EVENT_HANDLER, EVENT_LISTENER } from "./event-emitter-token.js";
import { createEventListener } from "./event-listener.js";

export const EventsModule = defineModule({
    imports: [EVENT_HANDLER],
    exports: [EVENT_EMITTER, EVENT_HANDLER, EVENT_LISTENER],
    bindings: [
        bind(EVENT_EMITTER)
            .factory(() => new EventEmitter2({ delimiter: ".", wildcard: true }))
            .disposable((eventEmitter) => {
                eventEmitter.removeAllListeners();
            }),
        bind(EVENT_LISTENER)
            .factory({ eventEmitter: EVENT_EMITTER, handlers: EVENT_HANDLER }, createEventListener)
            .disposable((eventListener) => eventListener.dispose()),
    ],
} as const);
