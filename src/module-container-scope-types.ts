import type { AnyBinding } from "./bind";
import type { BindingScopes, BindingTokens } from "./graph";
import type { ScopeTokenCompatibilityError } from "./module-definition-validation-types";
import type {
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicTokenArray,
} from "./module-interface-types";
import type { AnyComposedModuleDefinition } from "./module-types";
import type { AnyBindingOverride } from "./override";
import type { AnyMultiToken, AnySingleToken, AnyToken, AnyTokenArray, TokenByKey, TokenValue } from "./token";
import type { IfNever } from "./type-utils";
import type {
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromToken,
    ValidateGraphBindings,
} from "./validation";

type ModulePublicScopes<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = readonly [TPublicBindings, ...TScopeBindings];

type ModuleVisiblePublicBindings<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = BindingTokens<TPublicBindings | TScopeBindings[number]>;

type ModuleResolvableTokenInScopes<
    TModuleScopes extends BindingScopes,
    TToken extends AnyToken,
> = TToken extends AnyToken ? IfNever<MissingDependencyKeysFromToken<TModuleScopes, TToken>, TToken, never> : never;

type ModuleResolveFn<
    TModuleScopes extends BindingScopes,
    TPublicTokenArray extends AnyTokenArray,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
    TResolvableTokens extends AnyToken = ModuleResolvableTokenInScopes<
        TModuleScopes,
        Extract<
            TPublicTokenArray[number] | ModuleVisiblePublicBindings<TPublicBindings, TScopeBindings>,
            AnySingleToken
        >
    >,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => TokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ModulePublicMultiTokens<TPublicTokenArray extends AnyTokenArray, TScopeBindings extends BindingScopes> = Extract<
    TPublicTokenArray[number] | BindingTokens<TScopeBindings[number]>,
    AnyMultiToken
>;

type ModuleResolvableMultiTokenInScopes<
    TModuleScopes extends BindingScopes,
    TToken extends AnyMultiToken,
> = TToken extends AnyMultiToken
    ? IfNever<MissingDependencyKeysFromAllTokenBindings<TModuleScopes, TToken>, TToken, never>
    : never;

type ModuleResolveAllFn<
    TModuleScopes extends BindingScopes,
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TResolvableTokens extends AnyMultiToken = ModuleResolvableMultiTokenInScopes<
        TModuleScopes,
        ModulePublicMultiTokens<TPublicTokenArray, TScopeBindings>
    >,
> = IfNever<
    TResolvableTokens,
    (token: never) => never[],
    <TToken extends TResolvableTokens>(token: TToken) => Array<TokenValue<TokenByKey<TToken, TResolvableTokens>>>
>;

type ModuleScopeCompatibilityTokens<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = BindingTokens<
    ModulePublicScopes<TPublicBindings, TScopeBindings>[number] | CompositionLocalBindings<TComposition["modules"]>
>;

type CreateModuleScopeFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TOverrides extends readonly AnyBindingOverride[],
> = <const TNewScopeBindings extends readonly AnyBinding[]>(
    ...bindings: TNewScopeBindings &
        ValidateGraphBindings<
            TNewScopeBindings,
            readonly [
                ...ModulePublicScopes<TPublicBindings, readonly [...TScopeBindings, TNewScopeBindings]>,
                TNewScopeBindings,
            ]
        > &
        ScopeTokenCompatibilityError<
            TNewScopeBindings,
            ModuleScopeCompatibilityTokens<TComposition, TPublicBindings, TScopeBindings>
        >
) => ModuleContainer<
    TComposition,
    TPublicBindings,
    TPublicTokenArray,
    readonly [...TScopeBindings, TNewScopeBindings],
    TOverrides
>;

type RunModuleScopedFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
    TOverrides extends readonly AnyBindingOverride[],
> = <const TNewScopeBindings extends readonly AnyBinding[], TResult>(
    bindings: readonly [...TNewScopeBindings] &
        Readonly<
            ValidateGraphBindings<
                TNewScopeBindings,
                readonly [
                    ...ModulePublicScopes<TPublicBindings, readonly [...TScopeBindings, TNewScopeBindings]>,
                    TNewScopeBindings,
                ]
            >
        > &
        ScopeTokenCompatibilityError<
            TNewScopeBindings,
            ModuleScopeCompatibilityTokens<TComposition, TPublicBindings, TScopeBindings>
        >,
    callback: (
        scope: ModuleContainer<
            TComposition,
            TPublicBindings,
            TPublicTokenArray,
            readonly [...TScopeBindings, TNewScopeBindings],
            TOverrides
        >,
    ) => TResult,
) => Promise<Awaited<TResult>>;

export type ModuleContainer<
    TComposition extends AnyComposedModuleDefinition = AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
    TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    TScopeBindings extends BindingScopes = readonly [],
    TOverrides extends readonly AnyBindingOverride[] = readonly [],
    TPublicScopes extends BindingScopes = ModulePublicScopes<TPublicBindings, TScopeBindings>,
> = {
    resolve: ModuleResolveFn<TPublicScopes, TPublicTokenArray, TPublicBindings, TScopeBindings>;
    resolveAll: ModuleResolveAllFn<TPublicScopes, TPublicTokenArray, TScopeBindings>;
    createScope: CreateModuleScopeFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    runScoped: RunModuleScopedFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};
