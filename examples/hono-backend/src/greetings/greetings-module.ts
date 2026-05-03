import { bind, defineModule, exported } from "@satunnaisuus/distill";
import { Database } from "../database/index.js";
import { HttpSubRouterToken } from "../http/index.js";
import { ClockToken, systemClock } from "./clock.js";
import { GreetingService } from "./greeting-service.js";
import { GreetingServiceToken } from "./greeting-service-token.js";
import { createGreetingsSubRouter } from "./greetings-router.js";

export const GreetingsModule = defineModule({
    imports: [Database],
    bindings: [
        bind(ClockToken).value(systemClock),
        exported(bind(GreetingServiceToken).class({ clock: ClockToken, database: Database }, GreetingService)),
        exported(
            bind(HttpSubRouterToken).factory({ greetingService: GreetingServiceToken }, ({ greetingService }) =>
                createGreetingsSubRouter(greetingService),
            ),
        ),
    ],
} as const);
