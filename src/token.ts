import { qualifiedTokenBrand, qualifierBrand, tokenBrand } from "./brands";
import type { HasTrue, IsAny, IsExact } from "./type-utils";

type TokenRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;
type QualifierRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;

type PlainTokenIdentity<TKey> = readonly ["single", TokenRuntimeKey<TKey>];
type MultiTokenIdentity<TKey> = readonly ["multi", TokenRuntimeKey<TKey>];
type QualifiedTokenIdentity<TBaseToken extends AnySingleToken, TQualifier extends AnyQualifier> = readonly [
    "qualified",
    TokenIdentity<TBaseToken>,
    QualifierKey<TQualifier>,
];

type TokenBrand<TKey, TValue, TMulti extends boolean, TIdentity> = {
    readonly [tokenBrand]: {
        readonly key: TokenRuntimeKey<TKey>;
        readonly type: TValue;
        readonly anyKey: IsAny<TKey>;
        readonly anyType: IsAny<TValue>;
        readonly multi: TMulti;
        readonly identity: TIdentity;
    };
};

type QualifierBrand<TKey> = {
    readonly [qualifierBrand]: {
        readonly key: QualifierRuntimeKey<TKey>;
        readonly anyKey: IsAny<TKey>;
    };
};

const multiTokenPrefix = "\u0000distill:multi\u0000";
const qualifiedTokenPrefix = "\u0000distill:qualified\u0000";

export type Token<TKey = string, TValue = unknown> = TokenRuntimeKey<TKey> &
    TokenBrand<TKey, TValue, false, PlainTokenIdentity<TKey>>;

export type MultiToken<TKey = string, TValue = unknown> = string &
    TokenBrand<TKey, TValue, true, MultiTokenIdentity<TKey>>;

export type Qualifier<TKey = string> = QualifierRuntimeKey<TKey> & QualifierBrand<TKey>;

export type AnyQualifier = string & {
    readonly [qualifierBrand]: {
        readonly key: string;
        readonly anyKey: boolean;
    };
};

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
        readonly identity: unknown;
    };
};
export type AnyMultiToken = string & {
    readonly [tokenBrand]: {
        readonly key: string;
        readonly type: any;
        readonly anyKey: boolean;
        readonly anyType: boolean;
        readonly multi: true;
        readonly identity: unknown;
    };
};
export type AnyToken = AnySingleToken | AnyMultiToken;
export type TokenValue<TToken extends AnyToken> = TToken[typeof tokenBrand]["type"];
export type TokenKey<TToken extends AnyToken> = TToken[typeof tokenBrand]["key"];
export type TokenIdentity<TToken extends AnyToken> = TToken[typeof tokenBrand]["identity"];
export type IsMultiToken<TToken extends AnyToken> = TToken extends AnyMultiToken ? true : false;
export type QualifierKey<TQualifier extends AnyQualifier> = TQualifier[typeof qualifierBrand]["key"];
export type QualifiedToken<
    TBaseToken extends AnySingleToken = AnySingleToken,
    TQualifier extends AnyQualifier = AnyQualifier,
> = string &
    TokenBrand<
        `${TokenKey<TBaseToken>}:${QualifierKey<TQualifier>}`,
        TokenValue<TBaseToken>,
        false,
        QualifiedTokenIdentity<TBaseToken, TQualifier>
    > & {
        readonly [qualifiedTokenBrand]: {
            readonly baseToken: TBaseToken;
            readonly qualifier: TQualifier;
        };
    };

export type AnyTokenArray = readonly AnyToken[];
export type TokenArrayTokens<TTokenArray extends AnyTokenArray> = TTokenArray[number];

type IsExactToken<TToken extends AnyToken, TCandidate extends AnyToken> =
    IsExact<TokenKey<TToken>, TokenKey<TCandidate>> extends true
        ? IsExact<IsMultiToken<TToken>, IsMultiToken<TCandidate>> extends true
            ? IsExact<TokenIdentity<TToken>, TokenIdentity<TCandidate>> extends true
                ? IsExact<TokenValue<TToken>, TokenValue<TCandidate>>
                : false
            : false
        : false;

export type TokenByKey<TToken extends AnyToken, TCandidates extends AnyToken> = TToken extends AnyToken
    ? TCandidates extends AnyToken
        ? IsExact<TokenKey<TToken>, TokenKey<TCandidates>> extends true
            ? IsExact<IsMultiToken<TToken>, IsMultiToken<TCandidates>> extends true
                ? IsExact<TokenIdentity<TToken>, TokenIdentity<TCandidates>> extends true
                    ? TCandidates
                    : never
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

const parseQualifiedToken = (runtimeToken: string): [string, string] => {
    return JSON.parse(runtimeToken.slice(qualifiedTokenPrefix.length)) as [string, string];
};

const createQualifiedRuntimeToken = (baseToken: string, qualifierKey: string): string => {
    return `${qualifiedTokenPrefix}${JSON.stringify([baseToken, qualifierKey])}`;
};

export const isRuntimeQualifiedToken = (token: string): boolean => {
    return token.startsWith(qualifiedTokenPrefix);
};

export const isRuntimeMultiToken = (token: string): boolean => {
    return token.startsWith(multiTokenPrefix);
};

export const tokenKey = <TToken extends AnyToken>(token: TToken): TokenKey<TToken> => {
    const runtimeToken = token as string;

    if (isRuntimeMultiToken(runtimeToken)) {
        return runtimeToken.slice(multiTokenPrefix.length) as TokenKey<TToken>;
    }

    if (isRuntimeQualifiedToken(runtimeToken)) {
        const [baseToken, qualifierKey] = parseQualifiedToken(runtimeToken);

        return `${tokenKey(baseToken as AnyToken)}:${qualifierKey}` as TokenKey<TToken>;
    }

    return runtimeToken as TokenKey<TToken>;
};

const assertTokenKey = (key: string): void => {
    if (typeof key !== "string") {
        throw new Error("Token key must be a string");
    }

    if (key.startsWith(multiTokenPrefix) || key.startsWith(qualifiedTokenPrefix)) {
        throw new Error("Token key uses a reserved prefix");
    }
};

const assertQualifierKey = (key: string): void => {
    if (typeof key !== "string") {
        throw new Error("Qualifier key must be a string");
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

export const qualifier = <const TKey extends string>(key: TKey): Qualifier<TKey> => {
    assertQualifierKey(key);

    return key as Qualifier<TKey>;
};

export const qualified = <const TBaseToken extends AnySingleToken, const TQualifier extends AnyQualifier>(
    baseToken: TBaseToken,
    currentQualifier: TQualifier,
): QualifiedToken<TBaseToken, TQualifier> => {
    if (isRuntimeMultiToken(baseToken as string)) {
        throw new Error("qualified(...) only accepts single tokens");
    }

    assertQualifierKey(currentQualifier as string);

    return createQualifiedRuntimeToken(baseToken as string, currentQualifier as string) as QualifiedToken<
        TBaseToken,
        TQualifier
    >;
};
