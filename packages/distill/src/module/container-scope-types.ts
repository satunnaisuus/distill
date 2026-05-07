import type { AnyBindingOverride } from "../override/index";
import type {
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromOptionalToken,
    MissingDependencyKeysFromToken,
    ValidateGraphBindings,
} from "../runtime/index";
import type {
    CompositionLocalBindings,
    CompositionPublicBindings,
    CompositionPublicTokenArray,
} from "./interface-types";
import type { ScopeTokenCompatibilityError } from "./scope-token-compatibility-types";
import type {
    AnyBinding,
    AnyComposedModuleDefinition,
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    IfNever,
    TokenByKey,
    TokenValue,
} from "./types";

type BindingScopes = readonly (readonly AnyBinding[])[];
type BindingTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

type ModulePublicScopes<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = readonly [TPublicBindings, ...TScopeBindings];

type ModuleVisiblePublicBindings<
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
> = BindingTokens<TPublicBindings | TScopeBindings[number]>;

type ResolvedModuleTokenValue<TToken extends AnyToken> = TToken extends AnyMultiToken
    ? Array<TokenValue<TToken>>
    : TokenValue<TToken>;

type ModuleResolvableSingleTokenInScopes<
    TModuleScopes extends BindingScopes,
    TToken extends AnyToken,
> = TToken extends AnyToken ? IfNever<MissingDependencyKeysFromToken<TModuleScopes, TToken>, TToken, never> : never;

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

type ModuleResolveFn<
    TModuleScopes extends BindingScopes,
    TPublicTokenArray extends AnyTokenArray,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
    TResolvableTokens extends AnyToken =
        | ModuleResolvableSingleTokenInScopes<
              TModuleScopes,
              Extract<
                  TPublicTokenArray[number] | ModuleVisiblePublicBindings<TPublicBindings, TScopeBindings>,
                  AnySingleToken
              >
          >
        | ModuleResolvableMultiTokenInScopes<TModuleScopes, ModulePublicMultiTokens<TPublicTokenArray, TScopeBindings>>,
> = IfNever<
    TResolvableTokens,
    (token: never) => never,
    <TToken extends TResolvableTokens>(token: TToken) => ResolvedModuleTokenValue<TokenByKey<TToken, TResolvableTokens>>
>;

type ModuleResolveOptionalTokenValidation<TModuleScopes extends BindingScopes, TToken extends AnySingleToken> = IfNever<
    MissingDependencyKeysFromOptionalToken<TModuleScopes, TToken>,
    unknown,
    never
>;

type ModuleResolveOptionalFn<
    TModuleScopes extends BindingScopes,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
    TTokens extends AnySingleToken = Extract<
        ModuleVisiblePublicBindings<TPublicBindings, TScopeBindings>,
        AnySingleToken
    >,
> = IfNever<
    TTokens,
    (token: never) => undefined,
    <TToken extends TTokens>(
        token: TToken & ModuleResolveOptionalTokenValidation<TModuleScopes, TToken>,
    ) => TokenValue<TokenByKey<TToken, TTokens>> | undefined
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
    resolveOptional: ModuleResolveOptionalFn<TPublicScopes, TPublicBindings, TScopeBindings>;
    createScope: CreateModuleScopeFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    runScoped: RunModuleScopedFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings, TOverrides>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};
