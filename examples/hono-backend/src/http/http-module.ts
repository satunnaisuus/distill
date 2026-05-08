import { bind, defineModule } from "@satunnaisuus/distill";
import { healthSubRouter } from "./health-router.js";
import { HttpSubRouterToken } from "./http-sub-router.js";
export const HttpModule = defineModule({
    exports: [HttpSubRouterToken],
    bindings: [bind(HttpSubRouterToken).value(healthSubRouter)],
} as const);
