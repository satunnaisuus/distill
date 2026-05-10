import { bind, defineModule } from "@satunnaisuus/distill";
import { ROUTER } from "../integration.js";
import { healthRouter } from "./health-router.js";
export const HttpModule = defineModule({
    exports: [ROUTER],
    bindings: [bind(ROUTER).value(healthRouter)],
} as const);
