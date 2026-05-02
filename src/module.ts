import type { AllToken } from "./all";
import type { AnyBinding, Binding, BindingDependencies, BindingLifetimeOf } from "./bind";
import { isBinding } from "./bind";
import {
    composedModuleDefinitionBrand,
    exportedBindingBrand,
    moduleDefinitionBrand,
    moduleImportWireBrand,
} from "./brands";
import type { DependencyMap } from "./dependencies";
import type {
    BindingAllDependencyTokens,
    BindingDependencyTokens,
    BindingOptionalSingleDependencyTokens,
    BindingRequiredSingleDependencyTokens,
    BindingScopes,
    BindingSingleDependencyTokens,
    SameTokenKey,
} from "./graph";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    IsMultiToken,
    TokenIdentity,
    TokenKey,
    TokensNotIn,
    TokenValue,
} from "./token";
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

export type ModuleImportWire<
    TModule extends AnyModuleDefinition = AnyModuleDefinition,
    TImportToken extends AnySingleToken = AnySingleToken,
    TProviderToken extends AnySingleToken = AnySingleToken,
> = {
    readonly [moduleImportWireBrand]: true;
    readonly module: TModule;
    readonly importToken: TImportToken;
    readonly providerToken: TProviderToken;
};

export type AnyModuleImportWire = ModuleImportWire<AnyModuleDefinition, AnySingleToken, AnySingleToken>;

export type AnyComposedModuleDefinition = {
    readonly [composedModuleDefinitionBrand]: true;
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports: readonly AnyToken[];
    readonly wire: readonly AnyModuleImportWire[];
};

export type ComposedModuleDefinition<
    TModules extends readonly AnyModuleDefinition[] = readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[] = readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = {
    readonly [composedModuleDefinitionBrand]: true;
    readonly modules: TModules;
    readonly exports: TExports;
    readonly wire: TWire;
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

type ModuleWiredImportedInterfaceBinding<
    TImportToken extends AnySingleToken,
    TProviderBinding extends AnyBinding,
> = Binding<TImportToken, BindingDependencies<TProviderBinding>, BindingLifetimeOf<TProviderBinding>> & {
    readonly __module_exported_interface_binding__: true;
};

type ModuleSingleImportTokens<TModule extends AnyModuleDefinition> = Extract<
    TModule["imports"][number],
    AnySingleToken
>;

type WireProviderValueConstraint<TImportToken extends AnySingleToken, TProviderToken extends AnySingleToken> =
    TokenValue<TProviderToken> extends NoInfer<TokenValue<TImportToken>>
        ? unknown
        : {
              readonly __wire_provider_value_not_assignable__: TokenValue<TProviderToken>;
          };

type ModuleImportWireBuilder<TModule extends AnyModuleDefinition, TImportToken extends AnySingleToken> = {
    readonly with: <const TProviderToken extends AnySingleToken>(
        providerToken: TProviderToken & WireProviderValueConstraint<TImportToken, TProviderToken>,
    ) => ModuleImportWire<TModule, TImportToken, TProviderToken>;
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

type ModuleImportWireForEntry<
    TModules extends readonly AnyModuleDefinition[],
    TCurrentWire extends AnyModuleImportWire,
    TModule extends AnyModuleDefinition,
    TToken extends AnySingleToken,
> = TCurrentWire extends AnyModuleImportWire
    ? HasMultipleExactModules<TModules, TModule> extends true
        ? never
        : IsExact<TCurrentWire["module"], TModule> extends true
          ? HasExactToken<TCurrentWire["importToken"], TToken> extends true
              ? TCurrentWire
              : never
          : never
    : never;

type ModuleImportWireFor<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
    TModule extends AnyModuleDefinition,
    TToken extends AnySingleToken,
> = ModuleImportWireForEntry<TModules, TWire[number], TModule, TToken>;

type ExactModuleMatch<TCurrentModule, TModule extends AnyModuleDefinition> = TCurrentModule extends AnyModuleDefinition
    ? IsExact<TCurrentModule, TModule>
    : false;

type HasExactModule<TModules extends readonly AnyModuleDefinition[], TModule extends AnyModuleDefinition> = HasTrue<
    ExactModuleMatch<TModules[number], TModule>
>;

type HasMultipleExactModules<
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
    TSeen extends boolean = false,
> = number extends TModules["length"]
    ? false
    : TModules extends readonly [
            infer TCurrentModule extends AnyModuleDefinition,
            ...infer TRemainingModules extends readonly AnyModuleDefinition[],
        ]
      ? IsExact<TCurrentModule, TModule> extends true
          ? TSeen extends true
              ? true
              : HasMultipleExactModules<TRemainingModules, TModule, true>
          : HasMultipleExactModules<TRemainingModules, TModule, TSeen>
      : false;

type AmbiguousWireModuleTargets<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> = IfNever<
    TWire[number],
    never,
    TWire[number] extends infer TCurrentWire extends AnyModuleImportWire
        ? HasMultipleExactModules<TModules, TCurrentWire["module"]> extends true
            ? true
            : never
        : never
>;

type ModuleExportedInterfaceBindingForTokenInModule<
    TCurrentModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes = readonly [],
    TExcludedModule = never,
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> =
    IsExact<TCurrentModule, TExcludedModule> extends true
        ? never
        : ModuleExportedInterfaceBindingByExactToken<TCurrentModule, TModules, TToken, TAdditionalScopes, TWire>;

type ModuleExportedInterfaceBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes = readonly [],
    TExcludedModule = never,
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = TModules[number] extends infer TCurrentModule
    ? TCurrentModule extends AnyModuleDefinition
        ? ModuleExportedInterfaceBindingForTokenInModule<
              TCurrentModule,
              TModules,
              TToken,
              TAdditionalScopes,
              TExcludedModule,
              TWire
          >
        : never
    : never;

type ModuleWiredImportedExportedBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnySingleToken,
    TAdditionalScopes extends BindingScopes,
    TWireEntry extends AnyModuleImportWire,
    TWire extends readonly AnyModuleImportWire[],
> =
    ModuleExportedInterfaceBindingForToken<
        TModules,
        TWireEntry["providerToken"],
        TAdditionalScopes,
        never,
        TWire
    > extends infer TProviderBinding extends AnyBinding
        ? ModuleWiredImportedInterfaceBinding<TToken, TProviderBinding>
        : never;

export type ModuleImportedExportedBindingForToken<
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes = readonly [],
    TExcludedModule = never,
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = [TExcludedModule] extends [AnyModuleDefinition]
    ? TToken extends AnySingleToken
        ? IfNever<
              ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken>,
              ModuleExportedInterfaceBindingForToken<TModules, TToken, TAdditionalScopes, TExcludedModule, TWire>,
              ModuleImportWireFor<TModules, TWire, TExcludedModule, TToken> extends infer TWireEntry extends
                  AnyModuleImportWire
                  ? ModuleWiredImportedExportedBindingForToken<TModules, TToken, TAdditionalScopes, TWireEntry, TWire>
                  : never
          >
        : ModuleExportedInterfaceBindingForToken<TModules, TToken, TAdditionalScopes, TExcludedModule, TWire>
    : ModuleExportedInterfaceBindingForToken<TModules, TToken, TAdditionalScopes, TExcludedModule, TWire>;

type ModuleImportedExportedBindingsFromTokens<
    TImports extends readonly AnyToken[],
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
    TAdditionalScopes extends BindingScopes = readonly [],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = number extends TImports["length"]
    ? readonly ModuleImportedExportedBindingForToken<TModules, TImports[number], TAdditionalScopes, TModule, TWire>[]
    : TImports extends readonly [
            infer TCurrentImport extends AnyToken,
            ...infer TRemainingImports extends readonly AnyToken[],
        ]
      ? readonly [
            ModuleImportedExportedBindingForToken<TModules, TCurrentImport, TAdditionalScopes, TModule, TWire>,
            ...ModuleImportedExportedBindingsFromTokens<TRemainingImports, TModules, TModule, TAdditionalScopes, TWire>,
        ]
      : readonly [];

export type ModuleImportedExportedBindings<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TAdditionalScopes extends BindingScopes = readonly [],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = ModuleImportedExportedBindingsFromTokens<TModule["imports"], TModules, TModule, TAdditionalScopes, TWire>;

type ModuleBindingScopesFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TAdditionalScopes extends BindingScopes = readonly [],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = readonly [
    ModuleImportedExportedBindings<TModule, TModules, TAdditionalScopes, TWire>,
    ModuleLocalBindings<TModule>,
];

type ModuleExportedInterfaceDependenciesFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TBinding extends AnyBinding,
    TAdditionalScopes extends BindingScopes,
    TWire extends readonly AnyModuleImportWire[],
> = DependencyMapFromTokens<
    ExternalDependencyTokensFromBinding<
        ModuleBindingScopesFromComposition<TModule, TModules, TAdditionalScopes, TWire>,
        TBinding
    >
>;

type ModuleExportedInterfaceBindingByExactToken<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TToken extends AnyToken,
    TAdditionalScopes extends BindingScopes,
    TWire extends readonly AnyModuleImportWire[] = readonly [],
    TBinding extends AnyBinding = ModuleExportedBindings<TModule>[number],
> = TBinding extends AnyBinding
    ? BindingTokenMatchesRequest<TBinding["token"], TToken> extends true
        ? ModuleExportedInterfaceBinding<
              TBinding,
              ModuleExportedInterfaceDependenciesFromComposition<TModule, TModules, TBinding, TAdditionalScopes, TWire>
          >
        : never
    : never;

export type CompositionPublicInterfaceBindings<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
    TAdditionalScopes extends BindingScopes = readonly [],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = number extends TExports["length"]
    ? readonly ModuleImportedExportedBindingForToken<TModules, TExports[number], TAdditionalScopes, never, TWire>[]
    : TExports extends readonly [
            infer TCurrentExport extends AnyToken,
            ...infer TRemainingExports extends readonly AnyToken[],
        ]
      ? readonly [
            ModuleImportedExportedBindingForToken<TModules, TCurrentExport, TAdditionalScopes, never, TWire>,
            ...CompositionPublicInterfaceBindings<TModules, TRemainingExports, TAdditionalScopes, TWire>,
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
    CompositionPublicInterfaceBindings<
        TComposition["modules"],
        TComposition["exports"],
        readonly [],
        TComposition["wire"]
    >;

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
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = readonly [
    ...ModuleImportedExportedBindings<TModule, TModules, readonly [], TWire>,
    ...ModuleLocalBindings<TModule>,
];

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

type TupleWireError<TWire extends readonly AnyModuleImportWire[]> = number extends TWire["length"]
    ? {
          readonly __wire_must_be_tuple__: true;
      }
    : {};

type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

type HasTokenWithSameIdentity<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? IsExact<TokenIdentity<TTokens>, TokenIdentity<TToken>> : false
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

type ModuleImportTokenIsWired<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
    TModule extends AnyModuleDefinition,
    TToken extends AnyToken,
> = TToken extends AnySingleToken ? IfNever<ModuleImportWireFor<TModules, TWire, TModule, TToken>, false, true> : false;

type UnwiredModuleImportToken<
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
    TWire extends readonly AnyModuleImportWire[],
    TToken extends AnyToken,
> = TToken extends AnyToken
    ? ModuleImportTokenIsWired<TModules, TWire, TModule, TToken> extends true
        ? never
        : TToken
    : never;

type UnwiredModuleImportTokensFromModule<
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
    TWire extends readonly AnyModuleImportWire[],
> = TModule extends AnyModuleDefinition
    ? TModule["imports"][number] extends infer TCurrentImport extends AnyToken
        ? UnwiredModuleImportToken<TModules, TModule, TWire, TCurrentImport>
        : never
    : never;

type UnwiredModuleImportTokens<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> = TModules[number] extends infer TCurrentModule extends AnyModuleDefinition
    ? UnwiredModuleImportTokensFromModule<TModules, TCurrentModule, TWire>
    : never;

type WireProviderTokens<TWire extends readonly AnyModuleImportWire[]> = TWire[number]["providerToken"];

type CompositionReferencedTokens<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[],
> = UnwiredModuleImportTokens<TModules, TWire> | WireProviderTokens<TWire> | TExports[number];

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

type DuplicateExportedSingleProviderKeys<
    TBindings extends readonly AnyBinding[],
    TSeenTokens extends AnyToken = never,
> = number extends TBindings["length"]
    ? never
    : TBindings extends readonly [
            infer TCurrentBinding extends AnyBinding,
            ...infer TRemainingBindings extends readonly AnyBinding[],
        ]
      ? IsMultiToken<TCurrentBinding["token"]> extends true
          ? DuplicateExportedSingleProviderKeys<TRemainingBindings, TSeenTokens>
          : HasTokenWithSameIdentity<TSeenTokens, TCurrentBinding["token"]> extends true
            ? TokenKey<TCurrentBinding["token"]> | DuplicateExportedSingleProviderKeys<TRemainingBindings, TSeenTokens>
            : DuplicateExportedSingleProviderKeys<TRemainingBindings, TSeenTokens | TCurrentBinding["token"]>
      : never;

type AmbiguousSingleProviderKeys<TModules extends readonly AnyModuleDefinition[]> = DuplicateExportedSingleProviderKeys<
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

type InvalidComposedModuleBindingsForModule<
    TCurrentModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> =
    ModuleLocalBindings<TCurrentModule> extends ValidateGraphBindings<
        ModuleLocalBindings<TCurrentModule>,
        ModuleBindingScopesFromComposition<TCurrentModule, TModules, readonly [], TWire>,
        ModuleVisibleBindingsFromComposition<TCurrentModule, TModules, TWire>
    >
        ? never
        : ValidateGraphBindings<
              ModuleLocalBindings<TCurrentModule>,
              ModuleBindingScopesFromComposition<TCurrentModule, TModules, readonly [], TWire>,
              ModuleVisibleBindingsFromComposition<TCurrentModule, TModules, TWire>
          >;

type InvalidComposedModuleBindings<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> = TModules[number] extends infer TCurrentModule
    ? TCurrentModule extends AnyModuleDefinition
        ? InvalidComposedModuleBindingsForModule<TCurrentModule, TModules, TWire>
        : never
    : never;

type WireModulesOutsideComposition<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> = IfNever<
    TWire[number],
    never,
    TWire[number] extends infer TCurrentWire extends AnyModuleImportWire
        ? HasExactModule<TModules, TCurrentWire["module"]> extends true
            ? never
            : true
        : never
>;

type WireImportTokensOutsideModule<TWire extends readonly AnyModuleImportWire[]> = IfNever<
    TWire[number],
    never,
    TWire[number] extends infer TCurrentWire extends AnyModuleImportWire
        ? HasExactToken<TCurrentWire["module"]["imports"][number], TCurrentWire["importToken"]> extends true
            ? never
            : TokenKey<TCurrentWire["importToken"]>
        : never
>;

type IncompatibleWireProviderTokens<TWire extends readonly AnyModuleImportWire[]> = IfNever<
    TWire[number],
    never,
    TWire[number] extends infer TCurrentWire extends AnyModuleImportWire
        ? TokenValue<TCurrentWire["providerToken"]> extends TokenValue<TCurrentWire["importToken"]>
            ? never
            : TokenKey<TCurrentWire["providerToken"]>
        : never
>;

type SameWireTarget<TLeftWire extends AnyModuleImportWire, TRightWire extends AnyModuleImportWire> =
    IsExact<TLeftWire["module"], TRightWire["module"]> extends true
        ? HasExactToken<TLeftWire["importToken"], TRightWire["importToken"]>
        : false;

type HasWireTarget<TWireTargets extends AnyModuleImportWire, TWire extends AnyModuleImportWire> = HasTrue<
    TWireTargets extends AnyModuleImportWire ? SameWireTarget<TWireTargets, TWire> : false
>;

type DuplicateWireTokenKeys<
    TWire extends readonly AnyModuleImportWire[],
    TSeenWireTargets extends AnyModuleImportWire = never,
> = number extends TWire["length"]
    ? never
    : TWire extends readonly [
            infer TCurrentWire extends AnyModuleImportWire,
            ...infer TRemainingWire extends readonly AnyModuleImportWire[],
        ]
      ? HasWireTarget<TSeenWireTargets, TCurrentWire> extends true
          ? TokenKey<TCurrentWire["importToken"]> | DuplicateWireTokenKeys<TRemainingWire, TSeenWireTargets>
          : DuplicateWireTokenKeys<TRemainingWire, TSeenWireTargets | TCurrentWire>
      : never;

type WiredScopedImportTokenForModule<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
    TModule extends AnyModuleDefinition,
    TCurrentImport extends AnyToken,
> = TCurrentImport extends AnySingleToken
    ? IfNever<
          ModuleImportWireFor<TModules, TWire, TModule, TCurrentImport>,
          never,
          ModuleImportWireFor<TModules, TWire, TModule, TCurrentImport> extends infer TCurrentWire extends
              AnyModuleImportWire
              ? ModuleExportedInterfaceBindingForToken<
                    TModules,
                    TCurrentWire["providerToken"],
                    readonly [],
                    never,
                    TWire
                > extends infer TProviderBinding
                  ? TProviderBinding extends AnyBinding
                      ? BindingLifetimeOf<TProviderBinding> extends "scoped"
                          ? TCurrentImport
                          : never
                      : never
                  : never
              : never
      >
    : never;

type WiredScopedImportTokensForModule<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
    TModule extends AnyModuleDefinition,
> = IfNever<
    TWire[number],
    never,
    TModule["imports"][number] extends infer TCurrentImport extends AnyToken
        ? WiredScopedImportTokenForModule<TModules, TWire, TModule, TCurrentImport>
        : never
>;

type HasWiredScopedDependencyInSingletonBinding<TBinding extends AnyBinding, TScopedImportTokens extends AnyToken> =
    BindingLifetimeOf<TBinding> extends "singleton"
        ? HasTrue<
              TScopedImportTokens extends AnyToken
                  ? HasExactToken<BindingSingleDependencyTokens<TBinding>, TScopedImportTokens>
                  : false
          >
        : false;

type WiredScopedDependencyInSingletonModules<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
> =
    HasTrue<
        TModules[number] extends infer TCurrentModule
            ? TCurrentModule extends AnyModuleDefinition
                ? ModuleLocalBindings<TCurrentModule>[number] extends infer TCurrentBinding extends AnyBinding
                    ? HasWiredScopedDependencyInSingletonBinding<
                          TCurrentBinding,
                          WiredScopedImportTokensForModule<TModules, TWire, TCurrentModule>
                      >
                    : false
                : false
            : false
    > extends true
        ? true
        : never;

type ValidationErrorUnlessNever<TValue, TError> = IfNever<TValue, {}, TError>;

type ValidateComposeOptions<
    TModules extends readonly AnyModuleDefinition[],
    TExports extends readonly AnyToken[],
    TWire extends readonly AnyModuleImportWire[],
> = ValidationErrorUnlessNever<
    MissingProviderTokens<TModules, CompositionReferencedTokens<TModules, TExports, TWire>>,
    {
        readonly __missing_provider__: TokenKey<
            MissingProviderTokens<TModules, CompositionReferencedTokens<TModules, TExports, TWire>>
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
        WiredScopedDependencyInSingletonModules<TModules, TWire>,
        {
            readonly __scoped_dependency_in_singleton__: true;
        }
    > &
    ValidationErrorUnlessNever<
        InvalidComposedModuleBindings<TModules, TWire>,
        {
            readonly __invalid_modules__: InvalidComposedModuleBindings<TModules, TWire>;
        }
    > &
    ValidationErrorUnlessNever<
        IncompatibleExportedMultibindProviderKeys<TModules>,
        {
            readonly __incompatible_provider__: IncompatibleExportedMultibindProviderKeys<TModules>;
        }
    > &
    ValidationErrorUnlessNever<
        WireModulesOutsideComposition<TModules, TWire>,
        {
            readonly __wire_module_not_in_modules__: true;
        }
    > &
    ValidationErrorUnlessNever<
        AmbiguousWireModuleTargets<TModules, TWire>,
        {
            readonly __ambiguous_wire_module__: true;
        }
    > &
    ValidationErrorUnlessNever<
        WireImportTokensOutsideModule<TWire>,
        {
            readonly __wire_import_not_in_module__: WireImportTokensOutsideModule<TWire>;
        }
    > &
    ValidationErrorUnlessNever<
        DuplicateWireTokenKeys<TWire>,
        {
            readonly __duplicate_wire__: DuplicateWireTokenKeys<TWire>;
        }
    > &
    ValidationErrorUnlessNever<
        IncompatibleWireProviderTokens<TWire>,
        {
            readonly __wire_provider_value_not_assignable__: IncompatibleWireProviderTokens<TWire>;
        }
    >;

type ValidateComposeModules<TModules extends readonly AnyModuleDefinition[]> = TupleModulesError<TModules> & {
    [TIndex in keyof TModules]: TModules[TIndex] extends AnyModuleDefinition ? TModules[TIndex] : never;
};

type ValidateComposeExports<TExports extends readonly AnyToken[]> = TupleExportsError<TExports> &
    DuplicateTokenListError<TExports, "exports"> & {
        [TIndex in keyof TExports]: TExports[TIndex] extends AnyToken ? TExports[TIndex] : never;
    };

type ValidateComposeWire<TWire extends readonly AnyModuleImportWire[]> = TupleWireError<TWire> & {
    [TIndex in keyof TWire]: TWire[TIndex] extends AnyModuleImportWire ? TWire[TIndex] : never;
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

export const isModuleImportWire = (value: unknown): value is AnyModuleImportWire => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, moduleImportWireBrand);
};

export const provideImport = <
    const TModule extends AnyModuleDefinition,
    const TImportToken extends ModuleSingleImportTokens<TModule>,
>(
    module: TModule,
    importToken: TImportToken,
): ModuleImportWireBuilder<TModule, TImportToken> => {
    const builder = {
        with(providerToken: AnySingleToken): ModuleImportWire<TModule, TImportToken> {
            return {
                [moduleImportWireBrand]: true,
                module,
                importToken,
                providerToken,
            };
        },
    };

    return builder as ModuleImportWireBuilder<TModule, TImportToken>;
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

const validateComposedModuleRuntime = (
    modules: readonly AnyModuleDefinition[],
    exports: readonly AnyToken[],
    wire: readonly AnyModuleImportWire[],
): void => {
    if (!Array.isArray(modules)) {
        throw new Error("composeModules modules must be an array");
    }

    if (!Array.isArray(exports)) {
        throw new Error("composeModules exports must be an array");
    }

    if (!Array.isArray(wire)) {
        throw new Error("composeModules wire must be an array");
    }

    const moduleIds = new Set<number>();
    const moduleSet = new Set<AnyModuleDefinition>();

    for (const currentModule of modules) {
        if (!isModuleDefinition(currentModule)) {
            throw new Error("composeModules modules must be created with defineModule");
        }

        if (moduleIds.has(currentModule.id)) {
            throw new Error("Module is already included in the composition");
        }

        moduleIds.add(currentModule.id);
        moduleSet.add(currentModule);
    }

    for (const currentExport of exports) {
        assertTokenInput(currentExport, "composeModules exports must be tokens");
    }

    assertNoDuplicateTokenKeys(exports, (currentTokenKey) => `Token "${currentTokenKey}" is already exported`);

    const wireTargetId = (currentModule: AnyModuleDefinition, currentImport: AnyToken): string => {
        return `${currentModule.id}\u0000${tokenRuntimeId(currentImport)}`;
    };
    const wireProviderByTarget = new Map<string, AnySingleToken>();

    for (const currentWire of wire) {
        if (!isModuleImportWire(currentWire)) {
            throw new Error("composeModules wire entries must be created with provideImport");
        }

        if (!isModuleDefinition(currentWire.module) || !moduleSet.has(currentWire.module)) {
            throw new Error("Wire module must be included in composeModules modules");
        }

        assertTokenInput(currentWire.importToken, "Wire import token must be a token");
        assertTokenInput(currentWire.providerToken, "Wire provider token must be a token");

        const importTokenKey = tokenKey(currentWire.importToken);

        if (isMultiToken(currentWire.importToken)) {
            throw new Error(`Multibind token "${importTokenKey}" cannot be wired with provideImport`);
        }

        const providerTokenKey = tokenKey(currentWire.providerToken);

        if (isMultiToken(currentWire.providerToken)) {
            throw new Error(`Multibind token "${providerTokenKey}" cannot be used as a wired provider`);
        }

        if (
            !currentWire.module.imports.some(
                (currentImport) => tokenRuntimeId(currentImport) === tokenRuntimeId(currentWire.importToken),
            )
        ) {
            throw new Error(`Service "${importTokenKey}" is not imported by the wired module`);
        }

        const targetId = wireTargetId(currentWire.module, currentWire.importToken);

        if (wireProviderByTarget.has(targetId)) {
            throw new Error(`Service "${importTokenKey}" is already wired for the module`);
        }

        wireProviderByTarget.set(targetId, currentWire.providerToken);
    }

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
            const wiredProvider = wireProviderByTarget.get(wireTargetId(currentModule, currentImport));

            if (wiredProvider) {
                assertProviders(
                    wiredProvider,
                    findExportedProviders(exportedEntries, wiredProvider),
                    `is wired to import "${tokenKey(currentImport)}"`,
                );
                continue;
            }

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

type ComposeModules = {
    <const TModules extends readonly AnyModuleDefinition[], const TExports extends readonly AnyToken[]>(
        options: {
            readonly modules: TModules & ValidateComposeModules<TModules>;
            readonly exports: TExports & ValidateComposeExports<TExports>;
        } & ValidateComposeOptions<TModules, TExports, readonly []>,
    ): ComposedModuleDefinition<TModules, TExports, readonly []>;

    <
        const TModules extends readonly AnyModuleDefinition[],
        const TExports extends readonly AnyToken[],
        const TWire extends readonly AnyModuleImportWire[],
    >(
        options: {
            readonly modules: TModules & ValidateComposeModules<TModules>;
            readonly exports: TExports & ValidateComposeExports<TExports>;
            readonly wire: TWire & ValidateComposeWire<TWire>;
        } & ValidateComposeOptions<TModules, TExports, TWire>,
    ): ComposedModuleDefinition<TModules, TExports, TWire>;
};

const composeModulesImplementation = (options: {
    readonly modules: readonly AnyModuleDefinition[];
    readonly exports: readonly AnyToken[];
    readonly wire?: readonly AnyModuleImportWire[];
}): AnyComposedModuleDefinition => {
    const wire = options.wire ?? [];

    validateComposedModuleRuntime(options.modules, options.exports, wire);

    return {
        [composedModuleDefinitionBrand]: true,
        modules: options.modules,
        exports: options.exports,
        wire,
    };
};

export const composeModules = composeModulesImplementation as unknown as ComposeModules;
