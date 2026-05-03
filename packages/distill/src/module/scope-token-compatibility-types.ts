import type { AnyBinding, AnyToken, HasSameKeyIncompatibleToken, IfNever, TokenKey } from "./types";

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
