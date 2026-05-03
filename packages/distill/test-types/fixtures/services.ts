export type Config = {
    readonly port: number;
};

export type Logger = {
    readonly log: (message: string) => void;
};

export type Server = {
    readonly port: number;
};

export type Handler = (message: string) => number;

export type Counter = () => number;

export type CallableHandler = {
    readonly kind: "callable";
    (message: string): number;
};

export type Parser = {
    (input: string): number;
    (input: number): string;
};

export class InjectableService {
    readonly status = "ready" as const;
}

export type ServiceA = {
    readonly getB: () => ServiceB;
};

export type ServiceB = {
    readonly getA: () => ServiceA;
};
