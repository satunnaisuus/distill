import type { ValidateGraphBindings } from "../runtime/index";
import type { ModuleImportInterfaceBindingsFromTokens } from "./interface-types";
import type {
    AnyBinding,
    AnyToken,
    DuplicateTokenKeys,
    HasExactToken,
    HasSameKeyIncompatibleToken,
    HasTokenWithSameKey,
    IfNever,
    IsMultiToken,
    ModuleBindingInput,
    TokenKey,
    TokensNotIn,
    TupleError,
} from "./types";

type BindingScopes = readonly (readonly AnyBinding[])[];

type ModuleVisibleBindingsFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = readonly [...ModuleImportInterfaceBindingsFromTokens<TImports>, ...TBindings];

type ModuleBindingScopesFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [ModuleImportInterfaceBindingsFromTokens<TImports>, TBindings, ...TAdditionalScopes];

type TupleBindingsError<TBindings extends readonly ModuleBindingInput[]> = TupleError<
    TBindings,
    {
        readonly __bindings_must_be_tuple__: true;
    }
>;

type TupleImportsError<TImports extends readonly AnyToken[]> = TupleError<
    TImports,
    {
        readonly __imports_must_be_tuple__: true;
    }
>;

type TupleExportsError<TExports extends readonly AnyToken[]> = TupleError<
    TExports,
    {
        readonly __exports_must_be_tuple__: true;
    }
>;

type BindingTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

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
    TBindings,
    ModuleBindingScopesFromParts<TImports, TBindings>,
    ModuleVisibleBindingsFromParts<TImports, TBindings>
>;

export type ValidateModuleBindingInputTuple<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TValidatedBindings = ValidatedModuleLocalBindings<TImports, TBindings>,
> = TupleBindingsError<TBindings> &
    VisibleDuplicateBindingError<ModuleVisibleBindingsFromParts<TImports, TBindings>> &
    VisibleIncompatibleTokenError<ModuleVisibleBindingsFromParts<TImports, TBindings>> & {
        [TIndex in keyof TBindings]: TBindings[TIndex] extends ModuleBindingInput
            ? TIndex extends keyof TValidatedBindings
                ? TValidatedBindings[TIndex]
                : never
            : TBindings[TIndex];
    };

export type ValidateModuleImports<TImports extends readonly AnyToken[]> = TupleImportsError<TImports> &
    DuplicateTokenListError<TImports, "imports"> & {
        [TIndex in keyof TImports]: TImports[TIndex] extends AnyToken ? TImports[TIndex] : never;
    };

type SingleExportTokensWithoutLocalBinding<
    TExports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = TExports[number] extends infer TCurrentExport extends AnyToken
    ? IsMultiToken<TCurrentExport> extends true
        ? never
        : HasExactToken<BindingTokens<TBindings>, TCurrentExport> extends true
          ? never
          : TCurrentExport
    : never;

type IncompatibleExportTokenKeys<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[],
    TVisibleTokens extends AnyToken = TImports[number] | BindingTokens<TBindings>,
> = TExports[number] extends infer TCurrentExport extends AnyToken
    ? HasSameKeyIncompatibleToken<TVisibleTokens, TCurrentExport> extends true
        ? TokenKey<TCurrentExport>
        : never
    : never;

type MissingSingleExportBindingError<
    TExports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = IfNever<
    SingleExportTokensWithoutLocalBinding<TExports, TBindings>,
    {},
    {
        readonly __missing_export_binding__: TokenKey<SingleExportTokensWithoutLocalBinding<TExports, TBindings>>;
    }
>;

type IncompatibleExportTokenError<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[],
> = IfNever<
    IncompatibleExportTokenKeys<TImports, TBindings, TExports>,
    {},
    {
        readonly __token_not_in_tokens__: IncompatibleExportTokenKeys<TImports, TBindings, TExports>;
    }
>;

export type ValidateModuleExports<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TExports extends readonly AnyToken[],
> = TupleExportsError<TExports> &
    DuplicateTokenListError<TExports, "exports"> &
    MissingSingleExportBindingError<TExports, TBindings> &
    IncompatibleExportTokenError<TImports, TBindings, TExports> & {
        [TIndex in keyof TExports]: TExports[TIndex] extends AnyToken ? TExports[TIndex] : never;
    };
