import type { AnyBinding } from "./bind";
import type { BindingScopes } from "./graph";
import type { ModuleImportInterfaceBindingsFromTokens } from "./module-interface-types";
import type { ExportedBinding, ModuleBindingInput, UnwrapModuleBindings } from "./module-types";
import type { AnyToken, IsMultiToken, TokenKey, TokensNotIn } from "./token";
import type { DuplicateTokenKeys, HasSameKeyIncompatibleToken, HasTokenWithSameKey } from "./token-type-utils";
import type { IfNever, TupleError } from "./type-utils";
import type { ValidateGraphBindings } from "./validation";

type ModuleVisibleBindingsFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
> = readonly [...ModuleImportInterfaceBindingsFromTokens<TImports>, ...UnwrapModuleBindings<TBindings>];

type ModuleBindingScopesFromParts<
    TImports extends readonly AnyToken[],
    TBindings extends readonly ModuleBindingInput[],
    TAdditionalScopes extends BindingScopes = readonly [],
> = readonly [ModuleImportInterfaceBindingsFromTokens<TImports>, UnwrapModuleBindings<TBindings>, ...TAdditionalScopes];

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

export type ValidateModuleBindingInputTuple<
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

export type ValidateModuleImports<TImports extends readonly AnyToken[]> = TupleImportsError<TImports> &
    DuplicateTokenListError<TImports, "imports"> & {
        [TIndex in keyof TImports]: TImports[TIndex] extends AnyToken ? TImports[TIndex] : never;
    };
