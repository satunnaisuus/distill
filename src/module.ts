import type { AllToken } from "./all";
import type { AnyBinding, Binding, BindingLifetimeOf } from "./bind";
import { isBinding } from "./bind";
import { composedModuleDefinitionBrand, exportedBindingBrand, moduleDefinitionBrand } from "./brands";
import type { DependencyMap } from "./dependencies";
import type {
    BindingAllDependencyTokens,
    BindingDependencyTokens,
    BindingOptionalSingleDependencyTokens,
    BindingRequiredSingleDependencyTokens,
    BindingScopes,
    SameTokenKey,
} from "./graph";
import type { AnyMultiToken, AnyToken, IsMultiToken, TokenKey, TokensNotIn } from "./token";
import { isRuntimeMultiToken, tokenKey } from "./token";
import type { HasTrue, IfNever, IsExact } from "./type-utils";
import type { ValidateGraphBindings } from "./validation";

export type ExportedBinding<TBinding extends AnyBinding = AnyBinding> = {
    readonly [exportedBindingBrand]: true;
    readonly binding: TBinding;
};

export type ModuleBindingInput = AnyBinding | ExportedBinding<AnyBinding>;

export type AnyModuleDefinition = {
    readonly [moduleDefinitionBrand]: true;
    readonly id: number;
    readonly imports: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
};

export type ModuleDefinition<
    TImports extends readonly AnyToken[] = readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[] = readonly ModuleBindingInput[],
> = {
    readonly [moduleDefinitionBrand]: true;
    readonly id: number;
    readonly imports: TImports;
    readonly bindings: TBindings;
};

export type AnyComposedModuleDefinition = {
    readonly [composedModuleDefinitionBrand]: true;
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports: readonly AnyToken[];
};

export type ComposedModuleDefinition<
    TModules extends readonly AnyModuleDefinition[] = readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[] = readonly AnyToken[],
> = {
    readonly [composedModuleDefinitionBrand]: true;
    readonly modules: TModules;
    readonly exports: TExports;
};

export type UnwrapModuleBinding<TBinding extends ModuleBindingInput> =
    TBinding extends ExportedBinding<infer TExportedBinding>
        ? TExportedBinding
        : TBinding extends AnyBinding
          ? TBinding
          : never;

export type UnwrapModuleBindings<TBindings extends readonly ModuleBindingInput[]> = number extends TBindings["length"]
    ? readonly UnwrapModuleBinding<TBindings[number]>[]
    : TBindings extends readonly [
            infer TCurrentBinding extends ModuleBindingInput,
            ...infer TRemainingBindings extends readonly ModuleBindingInput[],
        ]
      ? readonly [UnwrapModuleBinding<TCurrentBinding>, ...UnwrapModuleBindings<TRemainingBindings>]
      : readonly [];

export type ModuleLocalBindings<TModule extends AnyModuleDefinition> = UnwrapModuleBindings<TModule["bindings"]>;

export type ModuleExportedBindingsFromInputs<TBindings extends readonly ModuleBindingInput[]> =
    number extends TBindings["length"]
        ? readonly AnyBinding[]
        : TBindings extends readonly [
                infer TCurrentBinding extends ModuleBindingInput,
                ...infer TRemainingBindings extends readonly ModuleBindingInput[],
            ]
          ? TCurrentBinding extends ExportedBinding<infer TExportedBinding>
              ? readonly [TExportedBinding, ...ModuleExportedBindingsFromInputs<TRemainingBindings>]
              : ModuleExportedBindingsFromInputs<TRemainingBindings>
          : readonly [];

export type ModuleExportedBindings<TModule extends AnyModuleDefinition> = ModuleExportedBindingsFromInputs<
    TModule["bindings"]
>;

export type ModuleExportedInterfaceBinding<
    TBinding extends AnyBinding = AnyBinding,
    TDependencies extends DependencyMap | undefined = DependencyMap | undefined,
> = Binding<TBinding["token"], TDependencies, BindingLifetimeOf<TBinding>> & {
    readonly __module_exported_interface_binding__: true;
};

type ModuleImportedInterfaceBinding<TToken extends AnyToken = AnyToken> = Binding<TToken, undefined, "singleton"> & {
    readonly __module_imported_interface_binding__: true;
};

type IsModuleExportedInterfaceBinding<TBinding extends AnyBinding> = TBinding extends {
    readonly __module_exported_interface_binding__: true;
}
    ? true
    : false;

type TokenByDependencyKey<TTokens extends AnyToken, TKey extends string> = TTokens extends AnyToken
    ? TokenKey<TTokens> extends TKey
        ? TTokens
        : never
    : never;

type DependencyReferenceFromToken<TToken extends AnyToken> = TToken extends AnyMultiToken ? AllToken<TToken> : TToken;

type DependencyMapFromTokens<TTokens extends AnyToken> = IfNever<
    TTokens,
    undefined,
    {
        readonly [TKey in TokenKey<TTokens>]: DependencyReferenceFromToken<TokenByDependencyKey<TTokens, TKey>>;
    }
>;

type HasExactToken<TTokens extends AnyToken, TToken extends AnyToken> = IfNever<
    TokensNotIn<TToken, TTokens>,
    true,
    false
>;

type BindingByExactToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TBinding extends AnyBinding = TBindings[number],
> = TBinding extends AnyBinding ? (HasExactToken<TBinding["token"], TToken> extends true ? TBinding : never) : never;

type BindingTokenMatchesRequest<TBindingToken extends AnyToken, TRequestedToken extends AnyToken> = IfNever<
    TokensNotIn<TBindingToken, TRequestedToken>,
    true,
    false
>;

type ResolveExactBindingInScopes<TScopes extends BindingScopes, TToken extends AnyToken> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ? IfNever<
          BindingByExactToken<TCurrentScope, TToken>,
          ResolveExactBindingInScopes<TRemainingScopes, TToken>,
          BindingByExactToken<TCurrentScope, TToken>
      >
    : never;

type ResolveAllExactBindingsInScopes<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
> = TScopes extends readonly [
    ...infer TRemainingScopes extends BindingScopes,
    infer TCurrentScope extends readonly AnyBinding[],
]
    ?
          | ResolveAllExactBindingsInScopes<TRemainingScopes, TToken>
          | (BindingByExactToken<TCurrentScope, TToken> extends infer TBinding extends AnyBinding ? TBinding : never)
    : never;

type ExternalDependencyTokensFromSingleToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends AnyToken,
    TWhenMissing = TToken,
> = TToken extends AnyToken
    ? HasExactToken<TPath, TToken> extends true
        ? never
        : IfNever<
              ResolveExactBindingInScopes<TScopes, TToken>,
              TWhenMissing,
              ResolveExactBindingInScopes<TScopes, TToken> extends infer TResolvedBinding
                  ? TResolvedBinding extends AnyBinding
                      ? ExternalDependencyTokensFromBinding<TScopes, TResolvedBinding, TPath | TToken>
                      : TWhenMissing
                  : never
          >
    : never;

type ExternalDependencyTokensFromAllToken<
    TScopes extends BindingScopes,
    TToken extends AnyToken,
    TPath extends AnyToken,
> = TToken extends AnyToken
    ? ResolveAllExactBindingsInScopes<TScopes, TToken> extends infer TResolvedBinding
        ? TResolvedBinding extends AnyBinding
            ? ExternalDependencyTokensFromBinding<TScopes, TResolvedBinding, TPath | TToken>
            : never
        : never
    : never;

type ExternalDependencyTokensFromBinding<
    TScopes extends BindingScopes,
    TBinding extends AnyBinding,
    TPath extends AnyToken = never,
> =
    IsModuleExportedInterfaceBinding<TBinding> extends true
        ? BindingDependencyTokens<TBinding>
        :
              | ExternalDependencyTokensFromSingleToken<TScopes, BindingRequiredSingleDependencyTokens<TBinding>, TPath>
              | ExternalDependencyTokensFromSingleToken<
                    TScopes,
                    BindingOptionalSingleDependencyTokens<TBinding>,
                    TPath,
                    never
                >
              | ExternalDependencyTokensFromAllToken<TScopes, BindingAllDependencyTokens<TBinding>, TPath>;

type ModuleImportInterfaceBindingsFromTokens<TImports extends readonly AnyToken[]> = number extends TImports["length"]
    ? readonly ModuleImportedInterfaceBinding<TImports[number]>[]
    : TImports extends readonly [
            infer TCurrentToken extends AnyToken,
            ...infer TRemainingTokens extends readonly AnyToken[],
        ]
      ? readonly [
            ModuleImportedInterfaceBinding<TCurrentToken>,
            ...ModuleImportInterfaceBindingsFromTokens<TRemainingTokens>,
        ]
      : readonly [];

export type ModuleImportedExportedBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes = readonly [],
    TExcludedModule = never,
> = TModules[number] extends infer TCurrentModule extends AnyModuleDefinition
    ? IsExact<TCurrentModule, TExcludedModule> extends true
        ? never
        : ModuleExportedInterfaceBindingByExactToken<TCurrentModule, TModules, TToken, TAdditionalScopes>
    : never;

export type ModuleImportedExportedBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly ModuleImportedExportedBindingForToken<TModules, TModule["imports"][number], TAdditionalScopes, TModule>[];

type ModuleBindingScopesFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [ModuleImportedExportedBindings<TModule, TModules, TAdditionalScopes>, ModuleLocalBindings<TModule>];

type ModuleExportedInterfaceDependenciesFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TBinding extends AnyBinding,
    TAdditionalScopes extends BindingScopes,
> = DependencyMapFromTokens<
    ExternalDependencyTokensFromBinding<
        ModuleBindingScopesFromComposition<TModule, TModules, TAdditionalScopes>,
        TBinding
    >
>;

type ModuleExportedInterfaceBindingByExactToken<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes,
    TBinding extends AnyBinding = ModuleExportedBindings<TModule>[number],
> = TBinding extends AnyBinding
    ? BindingTokenMatchesRequest<TBinding["token"], TToken> extends true
        ? ModuleExportedInterfaceBinding<
              TBinding,
              ModuleExportedInterfaceDependenciesFromComposition<TModule, TModules, TBinding, TAdditionalScopes>
          >
        : never
    : never;

export type CompositionPublicInterfaceBindings<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = number extends TExports["length"]
    ? readonly ModuleImportedExportedBindingForToken<TModules, TExports[number], TAdditionalScopes>[]
    : TExports extends readonly [
            infer TCurrentExport extends AnyToken,
            ...infer TRemainingExports extends readonly AnyToken[],
        ]
      ? readonly [
            ModuleImportedExportedBindingForToken<TModules, TCurrentExport, TAdditionalScopes>,
            ...CompositionPublicInterfaceBindings<TModules, TRemainingExports, TAdditionalScopes>,
        ]
      : readonly [];

export type CompositionLocalBindings<TModules extends readonly AnyModuleDefinition[]> =
    number extends TModules["length"]
        ? readonly AnyBinding[]
        : TModules extends readonly [
                infer TCurrentModule extends AnyModuleDefinition,
                ...infer TRemainingModules extends readonly AnyModuleDefinition[],
            ]
          ? readonly [...ModuleLocalBindings<TCurrentModule>, ...CompositionLocalBindings<TRemainingModules>]
          : readonly [];

export type CompositionPublicBindings<TComposition extends AnyComposedModuleDefinition> =
    CompositionPublicInterfaceBindings<TComposition["modules"], TComposition["exports"]>;

export type CompositionPublicTokenArray<TComposition extends AnyComposedModuleDefinition> = TComposition["exports"];

type ModuleVisibleBindingsFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = readonly [...ModuleImportInterfaceBindingsFromTokens<TImports>, ...UnwrapModuleBindings<TBindings>];

type ModuleBindingScopesFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [ModuleImportInterfaceBindingsFromTokens<TImports>, UnwrapModuleBindings<TBindings>, ...TAdditionalScopes];

type ModuleVisibleBindingsFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
> = readonly [...ModuleImportedExportedBindings<TModule, TModules>, ...ModuleLocalBindings<TModule>];

type TupleBindingsError<TBindings extends readonly ModuleBindingInput[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type TupleImportsError<TImports extends readonly AnyToken[]> = number extends TImports["length"]
    ? {
          readonly __imports_must_be_tuple__: true;
      }
    : {};

type TupleModulesError<TModules extends readonly AnyModuleDefinition[]> = number extends TModules["length"]
    ? {
          readonly __modules_must_be_tuple__: true;
      }
    : {};

type TupleExportsError<TExports extends readonly AnyToken[]> = number extends TExports["length"]
    ? {
          readonly __exports_must_be_tuple__: true;
      }
    : {};

type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

type DuplicateVisibleSingleTokenKeys<
    TBindings extends readonly AnyBinding[],
    TSeenTokens extends AnyToken = never,
> = number extends TBindings["length"]
    ? never
    : TBindings extends readonly [
            infer TCurrentBinding extends AnyBinding,
            ...infer TRemainingBindings extends readonly AnyBinding[],
        ]
      ? IsMultiToken<TCurrentBinding["token"]> extends true
          ? DuplicateVisibleSingleTokenKeys<TRemainingBindings, TSeenTokens>
          : HasTokenWithSameKey<TSeenTokens, TCurrentBinding["token"]> extends true
            ? TokenKey<TCurrentBinding["token"]> | DuplicateVisibleSingleTokenKeys<TRemainingBindings, TSeenTokens>
            : DuplicateVisibleSingleTokenKeys<TRemainingBindings, TSeenTokens | TCurrentBinding["token"]>
      : never;

type VisibleDuplicateBindingError<TBindings extends readonly AnyBinding[]> = IfNever<
    DuplicateVisibleSingleTokenKeys<TBindings>,
    {},
    {
        readonly __duplicate_binding__: DuplicateVisibleSingleTokenKeys<TBindings>;
    }
>;

type IncompatibleVisibleTokenKeys<
    TBindings extends readonly AnyBinding[],
    TSeenTokens extends AnyToken = never,
> = number extends TBindings["length"]
    ? never
    : TBindings extends readonly [
            infer TCurrentBinding extends AnyBinding,
            ...infer TRemainingBindings extends readonly AnyBinding[],
        ]
      ?
            | (HasTokenWithSameKey<TSeenTokens, TCurrentBinding["token"]> extends true
                  ? TokenKey<TokensNotIn<TCurrentBinding["token"], TSeenTokens>>
                  : never)
            | IncompatibleVisibleTokenKeys<TRemainingBindings, TSeenTokens | TCurrentBinding["token"]>
      : never;

type VisibleIncompatibleTokenError<TBindings extends readonly AnyBinding[]> = IfNever<
    IncompatibleVisibleTokenKeys<TBindings>,
    {},
    {
        readonly __token_not_in_tokens__: IncompatibleVisibleTokenKeys<TBindings>;
    }
>;

type HasSameKeyIncompatibleToken<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken
        ? SameTokenKey<TTokens, TToken> extends true
            ? IfNever<TokensNotIn<TToken, TTokens>, false, true>
            : false
        : false
>;

type ScopeIncompatibleTokenKeys<
    TBindings extends readonly AnyBinding[],
    TVisibleTokens extends AnyToken,
> = number extends TBindings["length"]
    ? never
    : TBindings extends readonly [
            infer TCurrentBinding extends AnyBinding,
            ...infer TRemainingBindings extends readonly AnyBinding[],
        ]
      ?
            | (HasSameKeyIncompatibleToken<TVisibleTokens, TCurrentBinding["token"]> extends true
                  ? TokenKey<TCurrentBinding["token"]>
                  : never)
            | ScopeIncompatibleTokenKeys<TRemainingBindings, TVisibleTokens | TCurrentBinding["token"]>
      : never;

export type ScopeTokenCompatibilityError<
    TBindings extends readonly AnyBinding[],
    TVisibleTokens extends AnyToken,
> = IfNever<
    ScopeIncompatibleTokenKeys<TBindings, TVisibleTokens>,
    {},
    {
        readonly __token_not_in_tokens__: ScopeIncompatibleTokenKeys<TBindings, TVisibleTokens>;
    }
>;

type DuplicateTokenKeys<
    TTokenArray extends readonly AnyToken[],
    TSeenTokens extends AnyToken = never,
> = number extends TTokenArray["length"]
    ? never
    : TTokenArray extends readonly [infer TCurrentToken extends AnyToken, ...infer TRemainingTokens extends AnyToken[]]
      ? HasTokenWithSameKey<TSeenTokens, TCurrentToken> extends true
          ? TokenKey<TCurrentToken> | DuplicateTokenKeys<TRemainingTokens, TSeenTokens>
          : DuplicateTokenKeys<TRemainingTokens, TSeenTokens | TCurrentToken>
      : never;

type DuplicateTokenListError<TTokenArray extends readonly AnyToken[], TProperty extends string> = IfNever<
    DuplicateTokenKeys<TTokenArray>,
    {},
    TProperty extends "imports"
        ? {
              readonly __duplicate_import__: DuplicateTokenKeys<TTokenArray>;
          }
        : {
              readonly __duplicate_export__: DuplicateTokenKeys<TTokenArray>;
          }
>;

type ValidatedModuleLocalBindings<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = ValidateGraphBindings<
    UnwrapModuleBindings<TBindings>,
    ModuleBindingScopesFromParts<TImports, TBindings>,
    ModuleVisibleBindingsFromParts<TImports, TBindings>
>;

type RewrapModuleBindingInput<TInput extends ModuleBindingInput, TValidatedBinding> =
    TInput extends ExportedBinding<AnyBinding>
        ? ExportedBinding<Extract<TValidatedBinding, AnyBinding>>
        : TValidatedBinding;

type ValidateModuleBindingInputTuple<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TValidatedBindings = ValidatedModuleLocalBindings<TImports, TBindings>,
> = TupleBindingsError<TBindings> &
    VisibleDuplicateBindingError<ModuleVisibleBindingsFromParts<TImports, TBindings>> &
    VisibleIncompatibleTokenError<ModuleVisibleBindingsFromParts<TImports, TBindings>> & {
        [TIndex in keyof TBindings]: TBindings[TIndex] extends ModuleBindingInput
            ? RewrapModuleBindingInput<
                  TBindings[TIndex],
                  TIndex extends keyof TValidatedBindings ? TValidatedBindings[TIndex] : never
              >
            : TBindings[TIndex];
    };

type ValidateModuleImports<TImports extends readonly AnyToken[]> = TupleImportsError<TImports> &
    DuplicateTokenListError<TImports, "imports"> & {
        [TIndex in keyof TImports]: TImports[TIndex] extends AnyToken ? TImports[TIndex] : never;
    };

type ModuleImportTokens<TModules extends readonly AnyModuleDefinition[]> = TModules[number]["imports"][number];

type CompositionReferencedTokens<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
> = ModuleImportTokens<TModules> | TExports[number];

type CompositionExportedBindingByExactToken<
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
> = TModules[number] extends infer TCurrentModule extends AnyModuleDefinition
    ? BindingByExactToken<ModuleExportedBindings<TCurrentModule>, TToken>
    : never;

type CompositionExportedProviderTokens<TModules extends readonly AnyModuleDefinition[]> =
    TModules[number] extends infer TCurrentModule extends AnyModuleDefinition
        ? ModuleExportedBindings<TCurrentModule>[number]["token"]
        : never;

type CompositionExportedBindings<TModules extends readonly AnyModuleDefinition[]> = number extends TModules["length"]
    ? readonly AnyBinding[]
    : TModules extends readonly [
            infer TCurrentModule extends AnyModuleDefinition,
            ...infer TRemainingModules extends readonly AnyModuleDefinition[],
        ]
      ? readonly [...ModuleExportedBindings<TCurrentModule>, ...CompositionExportedBindings<TRemainingModules>]
      : readonly [];

type MissingProviderTokens<
    TModules extends readonly AnyModuleDefinition[],
    TTokens extends AnyToken,
> = TTokens extends AnyToken
    ? IfNever<CompositionExportedBindingByExactToken<TModules, TTokens>, TTokens, never>
    : never;

type AmbiguousSingleProviderKeys<TModules extends readonly AnyModuleDefinition[]> = DuplicateVisibleSingleTokenKeys<
    CompositionExportedBindings<TModules>
>;

type IncompatibleExportedMultibindProviderKeys<
    TModules extends readonly AnyModuleDefinition[],
    TProviderTokens extends AnyToken = CompositionExportedProviderTokens<TModules>,
> = TProviderTokens extends AnyMultiToken
    ? HasSameKeyIncompatibleToken<CompositionExportedProviderTokens<TModules>, TProviderTokens> extends true
        ? TokenKey<TProviderTokens>
        : never
    : never;

type InvalidComposedModuleBindings<TModules extends readonly AnyModuleDefinition[]> =
    TModules[number] extends infer TCurrentModule extends AnyModuleDefinition
        ? ModuleLocalBindings<TCurrentModule> extends ValidateGraphBindings<
              ModuleLocalBindings<TCurrentModule>,
              ModuleBindingScopesFromComposition<TCurrentModule, TModules>,
              ModuleVisibleBindingsFromComposition<TCurrentModule, TModules>
          >
            ? never
            : ValidateGraphBindings<
                  ModuleLocalBindings<TCurrentModule>,
                  ModuleBindingScopesFromComposition<TCurrentModule, TModules>,
                  ModuleVisibleBindingsFromComposition<TCurrentModule, TModules>
              >
        : never;

type ValidationErrorUnlessNever<TValue, TError> = IfNever<TValue, {}, TError>;

type ValidateComposeOptions<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
> = ValidationErrorUnlessNever<
    MissingProviderTokens<TModules, CompositionReferencedTokens<TModules, TExports>>,
    {
        readonly __missing_provider__: TokenKey<
            MissingProviderTokens<TModules, CompositionReferencedTokens<TModules, TExports>>
        >;
    }
> &
    ValidationErrorUnlessNever<
        AmbiguousSingleProviderKeys<TModules>,
        {
            readonly __ambiguous_provider__: AmbiguousSingleProviderKeys<TModules>;
        }
    > &
    ValidationErrorUnlessNever<
        InvalidComposedModuleBindings<TModules>,
        {
            readonly __invalid_modules__: InvalidComposedModuleBindings<TModules>;
        }
    > &
    ValidationErrorUnlessNever<
        IncompatibleExportedMultibindProviderKeys<TModules>,
        {
            readonly __incompatible_provider__: IncompatibleExportedMultibindProviderKeys<TModules>;
        }
    >;

type ValidateComposeModules<TModules extends readonly AnyModuleDefinition[]> = TupleModulesError<TModules> & {
    [TIndex in keyof TModules]: TModules[TIndex] extends AnyModuleDefinition ? TModules[TIndex] : never;
};

type ValidateComposeExports<TExports extends readonly AnyToken[]> = TupleExportsError<TExports> &
    DuplicateTokenListError<TExports, "exports"> & {
        [TIndex in keyof TExports]: TExports[TIndex] extends AnyToken ? TExports[TIndex] : never;
    };

let nextModuleId = 1;

export const exported = <const TBinding extends AnyBinding>(binding: TBinding): ExportedBinding<TBinding> => {
    if (!isBinding(binding)) {
        throw new Error("exported(...) expects a binding created with bind");
    }

    return {
        [exportedBindingBrand]: true,
        binding,
    };
};

export const isExportedBinding = (value: unknown): value is ExportedBinding => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, exportedBindingBrand);
};

export const unwrapModuleBinding = (binding: ModuleBindingInput): AnyBinding => {
    return isExportedBinding(binding) ? binding.binding : binding;
};

export const isModuleDefinition = (value: unknown): value is AnyModuleDefinition => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleDefinitionBrand);
};

export const isComposedModuleDefinition = (value: unknown): value is AnyComposedModuleDefinition => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, composedModuleDefinitionBrand);
};

const isMultiToken = (currentToken: AnyToken): boolean => {
    return isRuntimeMultiToken(currentToken as string);
};

const tokenRuntimeId = (currentToken: AnyToken): string => {
    return currentToken as string;
};

function assertTokenInput(value: unknown, message: string): asserts value is AnyToken {
    if (typeof value !== "string") {
        throw new Error(message);
    }
}

const assertNoDuplicateTokenKeys = (tokens: readonly AnyToken[], duplicateMessage: (key: string) => string): void => {
    const seen = new Set<string>();

    for (const currentToken of tokens) {
        const currentTokenKey = tokenKey(currentToken);

        if (seen.has(currentTokenKey)) {
            throw new Error(duplicateMessage(currentTokenKey));
        }

        seen.add(currentTokenKey);
    }
};

const assertNoImportedLocalSingleBindings = (
    imports: readonly AnyToken[],
    bindings: readonly ModuleBindingInput[],
): void => {
    const importedSingleTokenKeys = new Set<string>();
    const importedTokenKinds = new Map<string, boolean>();

    for (const currentImport of imports) {
        const currentImportKey = tokenKey(currentImport);
        const currentImportIsMulti = isMultiToken(currentImport);
        const previousKind = importedTokenKinds.get(currentImportKey);

        if (previousKind !== undefined && previousKind !== currentImportIsMulti) {
            throw new Error(`Token "${currentImportKey}" is already included in module imports`);
        }

        importedTokenKinds.set(currentImportKey, currentImportIsMulti);

        if (!currentImportIsMulti) {
            importedSingleTokenKeys.add(currentImportKey);
        }
    }

    for (const binding of bindings) {
        const unwrappedBinding = unwrapModuleBinding(binding);
        const bindingTokenKey = tokenKey(unwrappedBinding.token);
        const bindingIsMulti = isMultiToken(unwrappedBinding.token);
        const importedKind = importedTokenKinds.get(bindingTokenKey);

        if (importedKind !== undefined && importedKind !== bindingIsMulti) {
            throw new Error(`Token "${bindingTokenKey}" is already included in module imports`);
        }

        if (!bindingIsMulti && importedSingleTokenKeys.has(bindingTokenKey)) {
            throw new Error(
                `Service "${bindingTokenKey}" cannot be both imported and locally bound in the same module`,
            );
        }
    }
};

const assertNoDuplicateLocalSingleBindings = (bindings: readonly ModuleBindingInput[]): void => {
    const seenSingleTokenKeys = new Set<string>();
    const seenTokenKinds = new Map<string, boolean>();

    for (const binding of bindings) {
        const unwrappedBinding = unwrapModuleBinding(binding);
        const bindingTokenKey = tokenKey(unwrappedBinding.token);
        const bindingIsMulti = isMultiToken(unwrappedBinding.token);
        const previousKind = seenTokenKinds.get(bindingTokenKey);

        if (previousKind !== undefined && previousKind !== bindingIsMulti) {
            throw new Error(`Token "${bindingTokenKey}" is already included in module bindings`);
        }

        seenTokenKinds.set(bindingTokenKey, bindingIsMulti);

        if (bindingIsMulti) {
            continue;
        }

        if (seenSingleTokenKeys.has(bindingTokenKey)) {
            throw new Error(`Service "${bindingTokenKey}" is already registered in the module context`);
        }

        seenSingleTokenKeys.add(bindingTokenKey);
    }
};

export function defineModule<const TBindings extends readonly ModuleBindingInput[]>(options: {
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<readonly [], TBindings>;
}): ModuleDefinition<readonly [], TBindings>;
export function defineModule<
    const TImports extends readonly AnyToken[],
    const TBindings extends readonly ModuleBindingInput[],
>(options: {
    readonly imports: TImports & ValidateModuleImports<TImports>;
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<TImports, TBindings>;
}): ModuleDefinition<TImports, TBindings>;
export function defineModule(options: {
    readonly imports?: readonly AnyToken[];
    readonly bindings: readonly ModuleBindingInput[];
}): AnyModuleDefinition {
    const imports = options.imports ?? [];

    for (const currentImport of imports) {
        if (isModuleDefinition(currentImport)) {
            throw new Error("Module imports must be tokens; compose modules with composeModules(...)");
        }

        assertTokenInput(currentImport, "Module imports must be tokens");
    }

    assertNoDuplicateTokenKeys(imports, (currentTokenKey) => `Token "${currentTokenKey}" is already imported`);

    for (const binding of options.bindings) {
        const unwrappedBinding = isExportedBinding(binding) ? binding.binding : binding;

        if (!isBinding(unwrappedBinding)) {
            throw new Error("Module bindings must be created with bind or exported(bind(...))");
        }
    }

    assertNoImportedLocalSingleBindings(imports, options.bindings);
    assertNoDuplicateLocalSingleBindings(options.bindings);

    return {
        [moduleDefinitionBrand]: true,
        id: nextModuleId++,
        imports,
        bindings: options.bindings,
    };
}

type RuntimeExportedEntry = {
    readonly module: AnyModuleDefinition;
    readonly binding: AnyBinding;
};

const collectExportedEntries = (modules: readonly AnyModuleDefinition[]): readonly RuntimeExportedEntry[] => {
    const entries: RuntimeExportedEntry[] = [];

    for (const currentModule of modules) {
        for (const moduleBinding of currentModule.bindings) {
            if (isExportedBinding(moduleBinding)) {
                entries.push({ module: currentModule, binding: moduleBinding.binding });
            }
        }
    }

    return entries;
};

const findExportedProviders = (
    entries: readonly RuntimeExportedEntry[],
    currentToken: AnyToken,
    excludedModule?: AnyModuleDefinition,
): readonly RuntimeExportedEntry[] => {
    const currentTokenId = tokenRuntimeId(currentToken);

    return entries.filter(
        (entry) => entry.module !== excludedModule && tokenRuntimeId(entry.binding.token) === currentTokenId,
    );
};

const validateComposedModuleRuntime = (modules: readonly AnyModuleDefinition[], exports: readonly AnyToken[]): void => {
    if (!Array.isArray(modules)) {
        throw new Error("composeModules modules must be an array");
    }

    if (!Array.isArray(exports)) {
        throw new Error("composeModules exports must be an array");
    }

    const moduleIds = new Set<number>();

    for (const currentModule of modules) {
        if (!isModuleDefinition(currentModule)) {
            throw new Error("composeModules modules must be created with defineModule");
        }

        if (moduleIds.has(currentModule.id)) {
            throw new Error("Module is already included in the composition");
        }

        moduleIds.add(currentModule.id);
    }

    for (const currentExport of exports) {
        assertTokenInput(currentExport, "composeModules exports must be tokens");
    }

    assertNoDuplicateTokenKeys(exports, (currentTokenKey) => `Token "${currentTokenKey}" is already exported`);

    const exportedEntries = collectExportedEntries(modules);
    const exportedProviderKinds = new Map<string, boolean>();
    const exportedSingleProviders = new Map<string, string>();

    for (const entry of exportedEntries) {
        const entryToken = entry.binding.token;
        const entryTokenKey = tokenKey(entryToken);
        const entryIsMultiToken = isMultiToken(entryToken);
        const previousKind = exportedProviderKinds.get(entryTokenKey);

        if (previousKind !== undefined && previousKind !== entryIsMultiToken) {
            throw new Error(`Token "${entryTokenKey}" has incompatible exported providers`);
        }

        exportedProviderKinds.set(entryTokenKey, entryIsMultiToken);

        if (entryIsMultiToken) {
            continue;
        }

        const entryTokenId = tokenRuntimeId(entryToken);

        if (exportedSingleProviders.has(entryTokenId)) {
            throw new Error(`Service "${entryTokenKey}" has multiple exported providers`);
        }

        exportedSingleProviders.set(entryTokenId, entryTokenKey);
    }

    const assertProviders = (currentToken: AnyToken, providers: readonly RuntimeExportedEntry[], action: string) => {
        const currentTokenKey = tokenKey(currentToken);

        if (isMultiToken(currentToken)) {
            if (providers.length === 0) {
                throw new Error(`Multibind token "${currentTokenKey}" ${action}, but no exported contributions exist`);
            }

            return;
        }

        if (providers.length === 0) {
            throw new Error(`Service "${currentTokenKey}" ${action}, but no exported provider exists`);
        }

        if (providers.length > 1) {
            throw new Error(`Service "${currentTokenKey}" has multiple exported providers`);
        }
    };

    for (const currentModule of modules) {
        for (const currentImport of currentModule.imports) {
            const excludedProviderModule = isMultiToken(currentImport) ? undefined : currentModule;

            assertProviders(
                currentImport,
                findExportedProviders(exportedEntries, currentImport, excludedProviderModule),
                "is imported by a module",
            );
        }
    }

    for (const currentExport of exports) {
        assertProviders(currentExport, findExportedProviders(exportedEntries, currentExport), "is exported");
    }
};

export const composeModules = <
    const TModules extends readonly AnyModuleDefinition[],
    const TExports extends readonly AnyToken[],
>(
    options: {
        readonly modules: TModules & ValidateComposeModules<TModules>;
        readonly exports: TExports & ValidateComposeExports<TExports>;
    } & ValidateComposeOptions<TModules, TExports>,
): ComposedModuleDefinition<TModules, TExports> => {
    validateComposedModuleRuntime(options.modules, options.exports);

    return {
        [composedModuleDefinitionBrand]: true,
        modules: options.modules,
        exports: options.exports,
    };
};
