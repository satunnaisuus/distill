import { bind, defineModule } from "@satunnaisuus/distill";
import { DATABASE } from "../database/index.js";
import { EVENT_HANDLER } from "../events/index.js";
import { ROUTER } from "../integration.js";
import { CLOCK, systemClock } from "./clock.js";
import { GreetingService } from "./greeting-service.js";
import { GREETING_SERVICE } from "./greeting-service-token.js";
import { createGreetingsRouter } from "./greetings-router.js";
import { createUserCreatedGreetingHandler } from "./user-created-greeting-handler.js";
export const GreetingsModule = defineModule({
    imports: [DATABASE],
    exports: [GREETING_SERVICE, ROUTER, EVENT_HANDLER],
    bindings: [
        bind(CLOCK).value(systemClock),
        bind(GREETING_SERVICE).class({ clock: CLOCK, database: DATABASE }, GreetingService),
        bind(EVENT_HANDLER).factory({ greetingService: GREETING_SERVICE }, createUserCreatedGreetingHandler),
        bind(ROUTER).factory({ greetingService: GREETING_SERVICE }, ({ greetingService }) =>
            createGreetingsRouter(greetingService),
        ),
    ],
} as const);
