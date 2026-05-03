import { bind, defineModule, exported } from "@satunnaisuus/distill";
import { healthSubRouter } from "./health-router.js";
import { HttpSubRouterToken } from "./http-sub-router.js";

export const HttpModule = defineModule({
    bindings: [exported(bind(HttpSubRouterToken).value(healthSubRouter))],
} as const);
