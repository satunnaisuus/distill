import { bind, defineModule } from "@satunnaisuus/distill";
import { Database } from "../database/index.js";
import { HttpSubRouterToken } from "../http/index.js";
import { ClockToken, systemClock } from "./clock.js";
import { GreetingService } from "./greeting-service.js";
import { GreetingServiceToken } from "./greeting-service-token.js";
import { createGreetingsSubRouter } from "./greetings-router.js";
export const GreetingsModule = defineModule({
    imports: [Database],
    exports: [GreetingServiceToken, HttpSubRouterToken],
    bindings: [
        bind(ClockToken).value(systemClock),
        bind(GreetingServiceToken).class({ clock: ClockToken, database: Database }, GreetingService),
        bind(HttpSubRouterToken).factory({ greetingService: GreetingServiceToken }, ({ greetingService }) =>
            createGreetingsSubRouter(greetingService),
        ),
    ],
} as const);
