import type { DatabaseClient } from "../database/index.js";
import type { Clock } from "./clock.js";

export type GreetingRecord = {
    readonly id: number;
    readonly name: string;
    readonly message: string;
    readonly createdAt: Date;
};

type GreetingServiceDependencies = {
    readonly clock: Clock;
    readonly database: DatabaseClient;
};

export class GreetingService {
    readonly #clock: Clock;
    readonly #database: DatabaseClient;

    constructor({ clock, database }: GreetingServiceDependencies) {
        this.#clock = clock;
        this.#database = database;
    }

    greet(name: string): string {
        return `Hello, ${name}! It is ${this.#clock.now().toISOString()}.`;
    }

    createGreeting(name: string): Promise<GreetingRecord> {
        return this.#database.greeting.create({
            data: {
                name,
                message: this.greet(name),
            },
        });
    }

    listGreetings(): Promise<readonly GreetingRecord[]> {
        return this.#database.greeting.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
        });
    }
}
