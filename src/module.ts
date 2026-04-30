import type { AllToken } from "./all";
import type { AnyBinding, Binding, BindingLifetimeOf } from "./bind";
import { isBinding } from "./bind";
import { exportedBindingBrand, moduleDefinitionBrand } from "./brands";
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
import type { HasTrue, IfNever } from "./type-utils";
import type { ValidateGraphBindings } from "./validation";

export type ExportedBinding<TBinding extends AnyBinding = AnyBinding> = {
    readonly [exportedBindingBrand]: true;
    readonly binding: TBinding;
};

export type ModuleBindingInput = AnyBinding | ExportedBinding<AnyBinding>;

export type AnyModuleDefinition = {
    readonly [moduleDefinitionBrand]: true;
    readonly id: number;
    readonly imports: readonly AnyModuleDefinition[];
    readonly bindings: readonly ModuleBindingInput[];
};

export type ModuleDefinition<
    TImports extends readonly AnyModuleDefinition[] = readonly AnyModuleDefinition[],
    TBindings extends readonly ModuleBindingInput[] = readonly ModuleBindingInput[],
> = {
    readonly [moduleDefinitionBrand]: true;
    readonly id: number;
    readonly imports: TImports;
    readonly bindings: TBindings;
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

type ModuleExportedInterfaceDependencies<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly ModuleBindingInput[],
    TBinding extends AnyBinding,
    _TAdditionalScopes extends BindingScopes,
> = DependencyMapFromTokens<
    ExternalDependencyTokensFromBinding<ModuleBindingScopesFromParts<TImports, TBindings>, TBinding>
>;

type ModuleResolvedBindingScopesFromParts<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly AnyBinding[],
> = readonly [ModuleImportedExportedBindingsFromImports<TImports>, TBindings];

type ModuleExportedInterfaceDependenciesFromResolvedBindings<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly AnyBinding[],
    TBinding extends AnyBinding,
> = DependencyMapFromTokens<
    ExternalDependencyTokensFromBinding<ModuleResolvedBindingScopesFromParts<TImports, TBindings>, TBinding>
>;

export type ModuleExportedInterfaceBindingsFromResolvedBindings<
    TImports extends readonly AnyModuleDefinition[],
    TExportedBindings extends readonly AnyBinding[],
    TResolvedBindings extends readonly AnyBinding[],
> = number extends TExportedBindings["length"]
    ? readonly AnyBinding[]
    : TExportedBindings extends readonly [
            infer TCurrentBinding extends AnyBinding,
            ...infer TRemainingBindings extends readonly AnyBinding[],
        ]
      ? readonly [
            ModuleExportedInterfaceBinding<
                TCurrentBinding,
                ModuleExportedInterfaceDependenciesFromResolvedBindings<TImports, TResolvedBindings, TCurrentBinding>
            >,
            ...ModuleExportedInterfaceBindingsFromResolvedBindings<TImports, TRemainingBindings, TResolvedBindings>,
        ]
      : readonly [];

type ModuleExportedInterfaceBindingsFromParts<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly ModuleBindingInput[],
    TAdditionalScopes extends BindingScopes,
    TAllBindings extends readonly ModuleBindingInput[] = TBindings,
> = number extends TBindings["length"]
    ? readonly AnyBinding[]
    : TBindings extends readonly [
            infer TCurrentBinding extends ModuleBindingInput,
            ...infer TRemainingBindings extends readonly ModuleBindingInput[],
        ]
      ? TCurrentBinding extends ExportedBinding<infer TExportedBinding>
          ? readonly [
                ModuleExportedInterfaceBinding<
                    TExportedBinding,
                    ModuleExportedInterfaceDependencies<TImports, TAllBindings, TExportedBinding, TAdditionalScopes>
                >,
                ...ModuleExportedInterfaceBindingsFromParts<
                    TImports,
                    TRemainingBindings,
                    TAdditionalScopes,
                    TAllBindings
                >,
            ]
          : ModuleExportedInterfaceBindingsFromParts<TImports, TRemainingBindings, TAdditionalScopes, TAllBindings>
      : readonly [];

export type ModuleExportedInterfaceBindings<
    TModule extends AnyModuleDefinition,
    TAdditionalScopes extends BindingScopes = readonly [],
> = ModuleExportedInterfaceBindingsFromParts<TModule["imports"], TModule["bindings"], TAdditionalScopes>;

export type ModuleImportedExportedBindingsFromImports<
    TImports extends readonly AnyModuleDefinition[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = number extends TImports["length"]
    ? readonly AnyBinding[]
    : TImports extends readonly [
            infer TCurrentModule extends AnyModuleDefinition,
            ...infer TRemainingModules extends readonly AnyModuleDefinition[],
        ]
      ? readonly [
            ...ModuleExportedInterfaceBindings<TCurrentModule, TAdditionalScopes>,
            ...ModuleImportedExportedBindingsFromImports<TRemainingModules, TAdditionalScopes>,
        ]
      : readonly [];

export type ModuleImportedExportedBindings<
    TModule extends AnyModuleDefinition,
    TAdditionalScopes extends BindingScopes = readonly [],
> = ModuleImportedExportedBindingsFromImports<TModule["imports"], TAdditionalScopes>;

type ModuleImportedLocalBindingsFromImports<TImports extends readonly AnyModuleDefinition[]> =
    number extends TImports["length"]
        ? readonly AnyBinding[]
        : TImports extends readonly [
                infer TCurrentModule extends AnyModuleDefinition,
                ...infer TRemainingModules extends readonly AnyModuleDefinition[],
            ]
          ? readonly [
                ...ModuleLocalBindings<TCurrentModule>,
                ...ModuleImportedLocalBindingsFromImports<TCurrentModule["imports"]>,
                ...ModuleImportedLocalBindingsFromImports<TRemainingModules>,
            ]
          : readonly [];

export type ModuleImportedLocalBindings<TModule extends AnyModuleDefinition> = ModuleImportedLocalBindingsFromImports<
    TModule["imports"]
>;

export type ModuleVisibleBindingsFromParts<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly ModuleBindingInput[],
> = readonly [...ModuleImportedExportedBindingsFromImports<TImports>, ...UnwrapModuleBindings<TBindings>];

export type ModuleVisibleBindings<TModule extends AnyModuleDefinition> = ModuleVisibleBindingsFromParts<
    TModule["imports"],
    TModule["bindings"]
>;

export type ModuleGraphScopes<
    TModule extends AnyModuleDefinition,
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [
    ModuleImportedExportedBindings<TModule, TAdditionalScopes>,
    ModuleLocalBindings<TModule>,
    ...TAdditionalScopes,
];

type TupleBindingsError<TBindings extends readonly ModuleBindingInput[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type TupleImportsError<TImports extends readonly AnyModuleDefinition[]> = number extends TImports["length"]
    ? {
          readonly __imports_must_be_tuple__: true;
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

type ModuleBindingScopesFromParts<
    TImports extends readonly AnyModuleDefinition[],
    TBindings extends readonly ModuleBindingInput[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [
    ModuleImportedExportedBindingsFromImports<TImports, TAdditionalScopes>,
    UnwrapModuleBindings<TBindings>,
    ...TAdditionalScopes,
];

type ValidatedModuleLocalBindings<
    TImports extends readonly AnyModuleDefinition[],
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
    TImports extends readonly AnyModuleDefinition[],
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

type ValidateModuleImports<TImports extends readonly AnyModuleDefinition[]> = TupleImportsError<TImports> & {
    [TIndex in keyof TImports]: TImports[TIndex] extends AnyModuleDefinition ? TImports[TIndex] : never;
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

export function defineModule<const TBindings extends readonly ModuleBindingInput[]>(options: {
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<readonly [], TBindings>;
}): ModuleDefinition<readonly [], TBindings>;
export function defineModule<
    const TImports extends readonly AnyModuleDefinition[],
    const TBindings extends readonly ModuleBindingInput[],
>(options: {
    readonly imports: TImports & ValidateModuleImports<TImports>;
    readonly bindings: TBindings & ValidateModuleBindingInputTuple<TImports, TBindings>;
}): ModuleDefinition<TImports, TBindings>;
export function defineModule(options: {
    readonly imports?: readonly AnyModuleDefinition[];
    readonly bindings: readonly ModuleBindingInput[];
}): AnyModuleDefinition {
    const imports = options.imports ?? [];

    for (const moduleImport of imports) {
        if (!isModuleDefinition(moduleImport)) {
            throw new Error("Module imports must be created with defineModule");
        }
    }

    for (const binding of options.bindings) {
        const unwrappedBinding = isExportedBinding(binding) ? binding.binding : binding;

        if (!isBinding(unwrappedBinding)) {
            throw new Error("Module bindings must be created with bind or exported(bind(...))");
        }
    }

    return {
        [moduleDefinitionBrand]: true,
        id: nextModuleId++,
        imports,
        bindings: options.bindings,
    };
}
