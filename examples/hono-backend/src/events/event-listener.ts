import type { EventEmitter2 } from "eventemitter2";
import type { EventHandler, EventListener } from "./event-emitter-token.js";

type CreateEventListenerDependencies = {
    readonly eventEmitter: EventEmitter2;
    readonly handlers: readonly EventHandler[];
};

export const createEventListener = ({ eventEmitter, handlers }: CreateEventListenerDependencies): EventListener => {
    let bootstrapped = false;

    return {
        bootstrap: () => {
            if (bootstrapped) {
                return;
            }

            for (const handler of handlers) {
                eventEmitter.on(handler.event, handler.handle);
            }

            bootstrapped = true;
        },
        dispose: () => {
            if (!bootstrapped) {
                return;
            }

            for (const handler of handlers) {
                eventEmitter.off(handler.event, handler.handle);
            }

            bootstrapped = false;
        },
    };
};
