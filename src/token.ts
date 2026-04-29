import { tokenBrand } from "./brands";
import type { HasTrue, IsAny, IsExact } from "./type-utils";

type TokenRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;

export type Token<TKey = string, TValue = unknown> = TokenRuntimeKey<TKey> & {
    readonly [tokenBrand]: {
        readonly key: TokenRuntimeKey<TKey>;
        readonly type: TValue;
        readonly anyKey: IsAny<TKey>;
        readonly anyType: IsAny<TValue>;
    };
};

export type TokenBuilder<TKey extends string> = {
    readonly of: <TValue = unknown>() => Token<TKey, TValue>;
};

export type AnyToken = string & {
    readonly [tokenBrand]: {
        readonly key: string;
        readonly type: any;
        readonly anyKey: boolean;
        readonly anyType: boolean;
    };
};
export type TokenValue<TToken extends AnyToken> = TToken[typeof tokenBrand]["type"];
export type TokenKey<TToken extends AnyToken> = TToken[typeof tokenBrand]["key"];

export type AnyTokenArray = readonly AnyToken[];
export type TokenArrayTokens<TTokenArray extends AnyTokenArray> = TTokenArray[number];

type IsExactToken<TToken extends AnyToken, TCandidate extends AnyToken> =
    IsExact<TokenKey<TToken>, TokenKey<TCandidate>> extends true
        ? IsExact<TokenValue<TToken>, TokenValue<TCandidate>>
        : false;

export type TokenByKey<TToken extends AnyToken, TCandidates extends AnyToken> = TToken extends AnyToken
    ? TCandidates extends AnyToken
        ? IsExact<TokenKey<TToken>, TokenKey<TCandidates>> extends true
            ? TCandidates
            : never
        : never
    : never;

type HasExactToken<TToken extends AnyToken, TCandidates extends AnyToken> = HasTrue<
    TCandidates extends AnyToken ? IsExactToken<TToken, TCandidates> : false
>;

export type TokensNotIn<TTokens extends AnyToken, TCandidates extends AnyToken> = TTokens extends AnyToken
    ? HasExactToken<TTokens, TCandidates> extends true
        ? never
        : TTokens
    : never;

export const tokenKey = <TToken extends AnyToken>(token: TToken): TokenKey<TToken> => {
    return token as TokenKey<TToken>;
};

export const token = <const TKey extends string>(key: TKey): TokenBuilder<TKey> => {
    if (typeof key !== "string") {
        throw new Error("Token key must be a string");
    }

    return {
        of: <TValue = unknown>() => key as Token<TKey, TValue>,
    };
};
