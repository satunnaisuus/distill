import type { AllToken } from "./all";
import type { AnyBinding, Binding, BindingDependencies, BindingLifetimeOf } from "./bind";
import type { DependencyMap } from "./dependencies";
import type {
    BindingAllDependencyTokens,
    BindingDependencyTokens,
    BindingOptionalSingleDependencyTokens,
    BindingRequiredSingleDependencyTokens,
    BindingScopes,
} from "./graph";
import type {
    AnyComposedModuleDefinition,
    AnyModuleDefinition,
    AnyModuleImportWire,
    ModuleExportedBindings,
    ModuleImportWire,
    ModuleLocalBindings,
} from "./module-types";
import type { AnyMultiToken, AnySingleToken, AnyToken, TokenKey, TokensNotIn, TokenValue } from "./token";
import type { HasExactToken } from "./token-type-utils";
import type { HasTrue, IfNever, IsExact } from "./type-utils";

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

export type ModuleSingleImportTokens<TModule extends AnyModuleDefinition> = Extract<
    TModule["imports"][number],
    AnySingleToken
>;

type WireProviderValueConstraint<TImportToken extends AnySingleToken, TProviderToken extends AnySingleToken> =
    TokenValue<TProviderToken> extends NoInfer<TokenValue<TImportToken>>
        ? unknown
        : {
              readonly __wire_provider_value_not_assignable__: TokenValue<TProviderToken>;
          };

export type ModuleImportWireBuilder<TModule extends AnyModuleDefinition, TImportToken extends AnySingleToken> = {
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

type StringTokenKeys<TTokens extends AnyToken> = Extract<TokenKey<TTokens>, string>;
type NonStringKeyTokens<TTokens extends AnyToken> = TTokens extends AnyToken
    ? TokenKey<TTokens> extends string
        ? never
        : TTokens
    : never;

type DependencyMapFromTokens<TTokens extends AnyToken> = IfNever<
    TTokens,
    undefined,
    {
        readonly [TKey in StringTokenKeys<TTokens>]: DependencyReferenceFromToken<TokenByDependencyKey<TTokens, TKey>>;
    } & IfNever<
        NonStringKeyTokens<TTokens>,
        unknown,
        {
            readonly [key: string]: DependencyReferenceFromToken<TTokens>;
        }
    >
>;

export type BindingByExactToken<
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

export type ModuleImportInterfaceBindingsFromTokens<TImports extends readonly AnyToken[]> =
    number extends TImports["length"]
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

export type ModuleImportWireFor<
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[],
    TModule extends AnyModuleDefinition,
    TToken extends AnySingleToken,
> = ModuleImportWireForEntry<TModules, TWire[number], TModule, TToken>;

type ExactModuleMatch<TCurrentModule, TModule extends AnyModuleDefinition> = TCurrentModule extends AnyModuleDefinition
    ? IsExact<TCurrentModule, TModule>
    : false;

export type HasExactModule<
    TModules extends readonly AnyModuleDefinition[],
    TModule extends AnyModuleDefinition,
> = HasTrue<ExactModuleMatch<TModules[number], TModule>>;

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

export type AmbiguousWireModuleTargets<
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

export type ModuleExportedInterfaceBindingForToken<
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

export type ModuleBindingScopesFromComposition<
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
