export const USER_CREATED_EVENT = "user.created" as const;

export type UserCreatedEvent = {
    readonly id: string;
    readonly email: string;
    readonly name: string;
};
