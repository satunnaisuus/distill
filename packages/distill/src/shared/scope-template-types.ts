export type ScopeTemplate<TArgs extends unknown[] = unknown[], TContainer = unknown> = {
    create(...args: TArgs): TContainer;
    runScoped<TCallback extends (scope: TContainer) => unknown>(
        ...argsAndCallback: [...TArgs, callback: TCallback]
    ): Promise<Awaited<ReturnType<TCallback>>>;
};

export type ScopeTemplateArgs<TTemplate> = TTemplate extends ScopeTemplate<infer TArgs, unknown> ? TArgs : never;

export type ScopeTemplateContainer<TTemplate> =
    TTemplate extends ScopeTemplate<infer _TArgs, infer TContainer> ? TContainer : never;
