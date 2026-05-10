import type {
    MissingDependencyKeysFromAllTokenBindings,
    MissingDependencyKeysFromOptionalToken,
    MissingDependencyKeysFromToken,
    ValidateGraphBindings,
} from "../runtime/index";
import type { ScopeTemplate } from "../shared/index";
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
) => ModuleContainer<TComposition, TPublicBindings, TPublicTokenArray, readonly [...TScopeBindings, TNewScopeBindings]>;

type RunModuleScopedFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
> = <
    const TNewScopeBindings extends readonly AnyBinding[],
    TCallback extends (
        scope: ModuleContainer<
            TComposition,
            TPublicBindings,
            TPublicTokenArray,
            readonly [...TScopeBindings, TNewScopeBindings]
        >,
    ) => unknown,
>(
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
    callback: TCallback,
) => Promise<Awaited<ReturnType<TCallback>>>;

type ModuleScopeTemplateFactoryValidationArgs<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TScopeBindings extends BindingScopes,
    TNewScopeBindings extends readonly AnyBinding[],
    TValidation = readonly [...TNewScopeBindings] &
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
> = readonly [...TNewScopeBindings] extends TValidation ? [] : [validationError: TValidation];

type CreateModuleScopeTemplateFn<
    TComposition extends AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[],
    TPublicTokenArray extends AnyTokenArray,
    TScopeBindings extends BindingScopes,
> = {
    <const TArgs extends unknown[], const TNewScopeBindings extends readonly AnyBinding[]>(
        createBindings: (...args: TArgs) => readonly [...TNewScopeBindings],
        ...validation: ModuleScopeTemplateFactoryValidationArgs<
            TComposition,
            TPublicBindings,
            TScopeBindings,
            TNewScopeBindings
        >
    ): ScopeTemplate<
        TArgs,
        ModuleContainer<
            TComposition,
            TPublicBindings,
            TPublicTokenArray,
            readonly [...TScopeBindings, TNewScopeBindings]
        >
    >;
    <const TNewScopeBindings extends readonly AnyBinding[]>(
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
    ): ScopeTemplate<
        [],
        ModuleContainer<
            TComposition,
            TPublicBindings,
            TPublicTokenArray,
            readonly [...TScopeBindings, TNewScopeBindings]
        >
    >;
};

export type ModuleContainer<
    TComposition extends AnyComposedModuleDefinition = AnyComposedModuleDefinition,
    TPublicBindings extends readonly AnyBinding[] = CompositionPublicBindings<TComposition>,
    TPublicTokenArray extends AnyTokenArray = CompositionPublicTokenArray<TComposition>,
    TScopeBindings extends BindingScopes = readonly [],
    TPublicScopes extends BindingScopes = ModulePublicScopes<TPublicBindings, TScopeBindings>,
> = {
    resolve: ModuleResolveFn<TPublicScopes, TPublicTokenArray, TPublicBindings, TScopeBindings>;
    resolveOptional: ModuleResolveOptionalFn<TPublicScopes, TPublicBindings, TScopeBindings>;
    createScope: CreateModuleScopeFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings>;
    createScopeTemplate: CreateModuleScopeTemplateFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings>;
    runScoped: RunModuleScopedFn<TComposition, TPublicBindings, TPublicTokenArray, TScopeBindings>;
    dispose(): Promise<void>;
    readonly disposed: boolean;
};
