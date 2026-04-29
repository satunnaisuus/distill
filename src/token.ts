import { tokenBrand } from "./brands";
import type { HasTrue, IsAny, IsExact } from "./type-utils";

type TokenRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;

type TokenBrand<TKey, TValue, TMulti extends boolean> = {
    readonly [tokenBrand]: {
        readonly key: TokenRuntimeKey<TKey>;
        readonly type: TValue;
        readonly anyKey: IsAny<TKey>;
        readonly anyType: IsAny<TValue>;
        readonly multi: TMulti;
    };
};

const multiTokenPrefix = "\u0000distill:multi\u0000";

export type Token<TKey = string, TValue = unknown> = TokenRuntimeKey<TKey> & TokenBrand<TKey, TValue, false>;

export type MultiToken<TKey = string, TValue = unknown> = string & TokenBrand<TKey, TValue, true>;

export type TokenBuilder<TKey extends string> = {
    readonly of: <TValue = unknown>() => Token<TKey, TValue>;
};

export type MultiTokenBuilder<TKey extends string> = {
    readonly of: <TValue = unknown>() => MultiToken<TKey, TValue>;
};

export type AnySingleToken = string & {
    readonly [tokenBrand]: {
        readonly key: string;
        readonly type: any;
        readonly anyKey: boolean;
        readonly anyType: boolean;
        readonly multi: false;
    };
};
export type AnyMultiToken = string & {
    readonly [tokenBrand]: {
        readonly key: string;
        readonly type: any;
        readonly anyKey: boolean;
        readonly anyType: boolean;
        readonly multi: true;
    };
};
export type AnyToken = AnySingleToken | AnyMultiToken;
export type TokenValue<TToken extends AnyToken> = TToken[typeof tokenBrand]["type"];
export type TokenKey<TToken extends AnyToken> = TToken[typeof tokenBrand]["key"];
export type IsMultiToken<TToken extends AnyToken> = TToken extends AnyMultiToken ? true : false;

export type AnyTokenArray = readonly AnyToken[];
export type TokenArrayTokens<TTokenArray extends AnyTokenArray> = TTokenArray[number];

type IsExactToken<TToken extends AnyToken, TCandidate extends AnyToken> =
    IsExact<TokenKey<TToken>, TokenKey<TCandidate>> extends true
        ? IsExact<IsMultiToken<TToken>, IsMultiToken<TCandidate>> extends true
            ? IsExact<TokenValue<TToken>, TokenValue<TCandidate>>
            : false
        : false;

export type TokenByKey<TToken extends AnyToken, TCandidates extends AnyToken> = TToken extends AnyToken
    ? TCandidates extends AnyToken
        ? IsExact<TokenKey<TToken>, TokenKey<TCandidates>> extends true
            ? IsExact<IsMultiToken<TToken>, IsMultiToken<TCandidates>> extends true
                ? TCandidates
                : never
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

export const isRuntimeMultiToken = (token: string): boolean => {
    return token.startsWith(multiTokenPrefix);
};

export const tokenKey = <TToken extends AnyToken>(token: TToken): TokenKey<TToken> => {
    const runtimeToken = token as string;

    return (
        isRuntimeMultiToken(runtimeToken) ? runtimeToken.slice(multiTokenPrefix.length) : runtimeToken
    ) as TokenKey<TToken>;
};

const assertTokenKey = (key: string): void => {
    if (typeof key !== "string") {
        throw new Error("Token key must be a string");
    }

    if (key.startsWith(multiTokenPrefix)) {
        throw new Error("Token key uses a reserved prefix");
    }
};

export const token = <const TKey extends string>(key: TKey): TokenBuilder<TKey> => {
    assertTokenKey(key);

    return {
        of: <TValue = unknown>() => key as Token<TKey, TValue>,
    };
};

export const multiToken = <const TKey extends string>(key: TKey): MultiTokenBuilder<TKey> => {
    assertTokenKey(key);

    return {
        of: <TValue = unknown>() => `${multiTokenPrefix}${key}` as MultiToken<TKey, TValue>,
    };
};
