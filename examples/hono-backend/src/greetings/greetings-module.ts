import { bind, defineModule } from "@satunnaisuus/distill";
import { Database } from "../database/index.js";
import { ROUTER } from "../integration.js";
import { ClockToken, systemClock } from "./clock.js";
import { GreetingService } from "./greeting-service.js";
import { GreetingServiceToken } from "./greeting-service-token.js";
import { createGreetingsRouter } from "./greetings-router.js";
export const GreetingsModule = defineModule({
    imports: [Database],
    exports: [GreetingServiceToken, ROUTER],
    bindings: [
        bind(ClockToken).value(systemClock),
        bind(GreetingServiceToken).class({ clock: ClockToken, database: Database }, GreetingService),
        bind(ROUTER).factory({ greetingService: GreetingServiceToken }, ({ greetingService }) =>
            createGreetingsRouter(greetingService),
        ),
    ],
} as const);
