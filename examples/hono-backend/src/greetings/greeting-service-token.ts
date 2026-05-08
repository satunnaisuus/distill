import { token } from "@satunnaisuus/distill";
import type { GreetingService } from "./greeting-service.js";

export const GreetingServiceToken = token("GreetingService").of<GreetingService>();
