import { token } from "@satunnaisuus/distill";
import type { GreetingService } from "./greeting-service.js";

export const GREETING_SERVICE = token("GreetingService").of<GreetingService>();
