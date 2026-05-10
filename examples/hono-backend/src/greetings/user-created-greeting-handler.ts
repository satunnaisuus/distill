import type { ListenerFn } from "eventemitter2";
import { type EventHandler, USER_CREATED_EVENT, type UserCreatedEvent } from "../events/index.js";
import type { GreetingService } from "./greeting-service.js";

type CreateUserCreatedGreetingHandlerDependencies = {
    readonly greetingService: GreetingService;
};

export const createUserCreatedGreetingHandler = ({
    greetingService,
}: CreateUserCreatedGreetingHandlerDependencies): EventHandler => {
    const handle: ListenerFn = async (event: UserCreatedEvent) => {
        await greetingService.createGreeting(event.name);
    };

    return {
        name: "greetings.user-created",
        event: USER_CREATED_EVENT,
        handle,
    };
};
