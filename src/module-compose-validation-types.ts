import type { AnyBinding, BindingLifetimeOf } from "./bind";
import type { BindingSingleDependencyTokens, SameTokenKey } from "./graph";
import type {
    AmbiguousWireModuleTargets,
    BindingByExactToken,
    HasExactModule,
    ModuleBindingScopesFromComposition,
    ModuleExportedInterfaceBindingForToken,
    ModuleImportedExportedBindings,
    ModuleImportWireFor,
} from "./module-interface-types";
import type {
    AnyModuleDefinition,
    AnyModuleImportWire,
    ComposedModuleDefinition,
    ModuleExportedBindings,
    ModuleLocalBindings,
} from "./module-types";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    HasClassTokenKey,
    IsMultiToken,
    TokenIdentity,
    TokenKey,
    TokenValue,
} from "./token";
import type { DuplicateTokenKeys, HasExactToken, HasSameKeyIncompatibleToken } from "./token-type-utils";
import type { HasTrue, IfNever, IsExact, TupleError, ValidationErrorUnlessNever } from "./type-utils";
import type { ValidateGraphBindings } from "./validation";

type ModuleVisibleBindingsFromComposition<
    TModule extends AnyModuleDefinition,
    TModules extends readonly AnyModuleDefinition[],
    TWire extends readonly AnyModuleImportWire[] = readonly [],
> = readonly [
    ...ModuleImportedExportedBindings<TModule, TModules, readonly [], TWire>,
    ...ModuleLocalBindings<TModule>,
];

type TupleModulesError<TModules extends readonly AnyModuleDefinition[]> = TupleError<
    TModules,
    {
        readonly __modules_must_be_tuple__: true;
    }
>;

type TupleExportsError<TExports extends readonly AnyToken[]> = TupleError<
    TExports,
    {
        readonly __exports_must_be_tuple__: true;
    }
>;

type TupleWireError<TWire extends readonly AnyModuleImportWire[]> = TupleError<
    TWire,
    {
        readonly __wire_must_be_tuple__: true;
    }
>;

type HasTokenWithSameIdentity<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken
        ? HasClassTokenKey<TTokens> extends true
            ? false
            : HasClassTokenKey<TToken> extends true
              ? false
              : IsExact<TokenIdentity<TTokens>, TokenIdentity<TToken>>
        : false
>;

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
        ? SameTokenKey<TLeftWire["importToken"], TRightWire["importToken"]>
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

export type ValidateComposeOptions<
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

export type ValidateComposeModules<TModules extends readonly AnyModuleDefinition[]> = TupleModulesError<TModules> & {
    [TIndex in keyof TModules]: TModules[TIndex] extends AnyModuleDefinition ? TModules[TIndex] : never;
};

export type ValidateComposeExports<TExports extends readonly AnyToken[]> = TupleExportsError<TExports> &
    DuplicateTokenListError<TExports, "exports"> & {
        [TIndex in keyof TExports]: TExports[TIndex] extends AnyToken ? TExports[TIndex] : never;
    };

export type ValidateComposeWire<TWire extends readonly AnyModuleImportWire[]> = TupleWireError<TWire> & {
    [TIndex in keyof TWire]: TWire[TIndex] extends AnyModuleImportWire ? TWire[TIndex] : never;
};

export type ComposeModules = {
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
