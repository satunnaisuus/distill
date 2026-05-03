import type { SameTokenKey } from "./graph";
import type { AnyToken, TokenKey, TokensNotIn } from "./token";
import type { HasTrue, IfNever } from "./type-utils";

export type HasExactToken<TTokens extends AnyToken, TToken extends AnyToken> = IfNever<
    TokensNotIn<TToken, TTokens>,
    true,
    false
>;

export type HasTokenWithSameKey<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken ? SameTokenKey<TTokens, TToken> : false
>;

export type HasSameKeyIncompatibleToken<TTokens extends AnyToken, TToken extends AnyToken> = HasTrue<
    TTokens extends AnyToken
        ? SameTokenKey<TTokens, TToken> extends true
            ? IfNever<TokensNotIn<TToken, TTokens>, false, true>
            : false
        : false
>;

export type DuplicateTokenKeys<
    TTokenArray extends readonly AnyToken[],
    TSeenTokens extends AnyToken = never,
> = number extends TTokenArray["length"]
    ? never
    : TTokenArray extends readonly [infer TCurrentToken extends AnyToken, ...infer TRemainingTokens extends AnyToken[]]
      ? HasTokenWithSameKey<TSeenTokens, TCurrentToken> extends true
          ? TokenKey<TCurrentToken> | DuplicateTokenKeys<TRemainingTokens, TSeenTokens>
          : DuplicateTokenKeys<TRemainingTokens, TSeenTokens | TCurrentToken>
      : never;
