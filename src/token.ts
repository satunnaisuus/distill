import { qualifiedTokenBrand, qualifierBrand, tokenBrand } from "./brands";
import type { HasTrue, IsAny, IsExact } from "./type-utils";

type TokenClassKey = abstract new (...args: any[]) => unknown;
export type TokenKeyInput = string | symbol | TokenClassKey;

declare const runtimeTokenObjectBrand: unique symbol;

type RuntimeTokenObject<TKey = TokenKeyInput> = object & {
    readonly [runtimeTokenObjectBrand]: TKey;
};

type TokenRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends TokenKeyInput ? TKey : never;
type QualifierRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;
type TokenDefaultValue<TKey> =
    IsAny<TKey> extends true ? unknown : TKey extends abstract new (...args: any[]) => infer TValue ? TValue : unknown;

type PlainTokenIdentity<TKey> = readonly ["single", TokenRuntimeKey<TKey>];
type MultiTokenIdentity<TKey> = readonly ["multi", TokenRuntimeKey<TKey>];
type QualifiedTokenIdentity<TBaseToken extends AnySingleToken, TQualifier extends AnyQualifier> = readonly [
    "qualified",
    TokenIdentity<TBaseToken>,
    QualifierKey<TQualifier>,
];
type QualifiedTokenKey<TBaseToken extends AnySingleToken, TQualifier extends AnyQualifier> =
    TokenKey<TBaseToken> extends string ? `${TokenKey<TBaseToken>}:${QualifierKey<TQualifier>}` : string;

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

type SingleTokenRuntimeValue<TKey> = TokenRuntimeKey<TKey>;
type MultiTokenRuntimeValue<TKey> =
    TokenRuntimeKey<TKey> extends string ? string : RuntimeTokenObject<TokenRuntimeKey<TKey>>;
type QualifiedTokenRuntimeValue<TBaseToken extends AnySingleToken> = TBaseToken extends string
    ? string
    : RuntimeTokenObject<TokenKey<TBaseToken>>;
type AnyRuntimeTokenValue = string | symbol | TokenClassKey | object;

export type Token<TKey = string, TValue = unknown> = SingleTokenRuntimeValue<TKey> &
    TokenBrand<TKey, TValue, false, PlainTokenIdentity<TKey>>;

export type MultiToken<TKey = string, TValue = unknown> = MultiTokenRuntimeValue<TKey> &
    TokenBrand<TKey, TValue, true, MultiTokenIdentity<TKey>>;

export type Qualifier<TKey = string> = QualifierRuntimeKey<TKey> & QualifierBrand<TKey>;

export type AnyQualifier = string & {
    readonly [qualifierBrand]: {
        readonly key: string;
        readonly anyKey: boolean;
    };
};

export type TokenBuilder<TKey extends TokenKeyInput> = {
    readonly of: <TValue = TokenDefaultValue<TKey>>() => Token<TKey, TValue>;
};

export type MultiTokenBuilder<TKey extends TokenKeyInput> = {
    readonly of: <TValue = TokenDefaultValue<TKey>>() => MultiToken<TKey, TValue>;
};

export type AnySingleToken = AnyRuntimeTokenValue & {
    readonly [tokenBrand]: {
        readonly key: TokenKeyInput;
        readonly type: any;
        readonly anyKey: boolean;
        readonly anyType: boolean;
        readonly multi: false;
        readonly identity: unknown;
    };
};
export type AnyMultiToken = AnyRuntimeTokenValue & {
    readonly [tokenBrand]: {
        readonly key: TokenKeyInput;
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
> = QualifiedTokenRuntimeValue<TBaseToken> &
    TokenBrand<
        QualifiedTokenKey<TBaseToken, TQualifier>,
        TokenValue<TBaseToken>,
        false,
        QualifiedTokenIdentity<TBaseToken, TQualifier>
    > & {
        readonly [qualifiedTokenBrand]: {
            readonly baseToken: TBaseToken;
            readonly qualifier: TQualifier;
        };
    };

export type HasClassTokenKey<TToken extends AnyToken> =
    TToken extends QualifiedToken<infer TBaseToken>
        ? HasClassTokenKey<TBaseToken>
        : TokenKey<TToken> extends TokenClassKey
          ? true
          : false;

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

type RuntimeTokenKey = string | symbol | Function;

type RuntimeTokenMetadata = {
    readonly key: RuntimeTokenKey;
    readonly displayKey: string;
    readonly keyId: string;
    readonly tokenId: string;
    readonly multi: boolean;
    readonly qualified: boolean;
};

const objectTokenMetadata = new WeakMap<object, RuntimeTokenMetadata>();
const symbolTokenMetadata = new Map<symbol, RuntimeTokenMetadata>();
const objectKeyIds = new WeakMap<object, string>();
const symbolKeyIds = new Map<symbol, string>();
let nextRuntimeKeyId = 1;

const parseQualifiedToken = (runtimeToken: string): [string, string] => {
    return JSON.parse(runtimeToken.slice(qualifiedTokenPrefix.length)) as [string, string];
};

const createQualifiedRuntimeToken = (baseToken: string, qualifierKey: string): string => {
    return `${qualifiedTokenPrefix}${JSON.stringify([baseToken, qualifierKey])}`;
};

const qualifiedRuntimeId = (baseTokenId: string, qualifierKey: string): string => {
    return `qualified:${JSON.stringify([baseTokenId, qualifierKey])}`;
};

const isClassConstructor = (value: Function): boolean => {
    return /^class\s/.test(Function.prototype.toString.call(value));
};

const formatTokenKey = (key: RuntimeTokenKey): string => {
    if (typeof key === "string") {
        return key;
    }

    if (typeof key === "symbol") {
        return String(key);
    }

    return key.name || "<anonymous class>";
};

const runtimeKeyId = (key: RuntimeTokenKey): string => {
    if (typeof key === "string") {
        return `string:${key}`;
    }

    if (typeof key === "symbol") {
        const existingId = symbolKeyIds.get(key);

        if (existingId) {
            return existingId;
        }

        const keyId = `symbol:${nextRuntimeKeyId++}`;

        symbolKeyIds.set(key, keyId);
        return keyId;
    }

    const existingId = objectKeyIds.get(key);

    if (existingId) {
        return existingId;
    }

    const keyId = `object:${nextRuntimeKeyId++}`;

    objectKeyIds.set(key, keyId);
    return keyId;
};

const createPlainRuntimeTokenMetadata = (key: RuntimeTokenKey, multi: boolean): RuntimeTokenMetadata => {
    const keyId = runtimeKeyId(key);

    return {
        key,
        displayKey: formatTokenKey(key),
        keyId,
        tokenId: `${multi ? "multi" : "single"}:${keyId}`,
        multi,
        qualified: false,
    };
};

const createQualifiedRuntimeTokenMetadata = (
    baseToken: AnySingleToken,
    currentQualifier: AnyQualifier,
): RuntimeTokenMetadata => {
    const baseMetadata = runtimeTokenMetadata(baseToken);
    const qualifierKey = currentQualifier as string;
    const displayKey = `${baseMetadata.displayKey}:${qualifierKey}`;
    const runtimeId = qualifiedRuntimeId(baseMetadata.tokenId, qualifierKey);

    return {
        key: displayKey,
        displayKey,
        keyId: runtimeId,
        tokenId: runtimeId,
        multi: false,
        qualified: true,
    };
};

const registerDirectTokenMetadata = (key: TokenKeyInput, metadata: RuntimeTokenMetadata): void => {
    if (typeof key === "symbol") {
        symbolTokenMetadata.set(key, metadata);
        return;
    }

    if (typeof key === "function") {
        objectTokenMetadata.set(key, metadata);
    }
};

const runtimeTokenMetadataFromString = (runtimeToken: string): RuntimeTokenMetadata => {
    if (runtimeToken.startsWith(multiTokenPrefix)) {
        return createPlainRuntimeTokenMetadata(runtimeToken.slice(multiTokenPrefix.length), true);
    }

    if (runtimeToken.startsWith(qualifiedTokenPrefix)) {
        const [baseToken, qualifierKey] = parseQualifiedToken(runtimeToken);
        const baseMetadata = runtimeTokenMetadata(baseToken as AnySingleToken);
        const displayKey = `${baseMetadata.displayKey}:${qualifierKey}`;
        const runtimeId = qualifiedRuntimeId(baseMetadata.tokenId, qualifierKey);

        return {
            key: displayKey,
            displayKey,
            keyId: runtimeId,
            tokenId: runtimeId,
            multi: false,
            qualified: true,
        };
    }

    return createPlainRuntimeTokenMetadata(runtimeToken, false);
};

const runtimeTokenMetadata = (currentToken: AnyToken): RuntimeTokenMetadata => {
    if (typeof currentToken === "string") {
        return runtimeTokenMetadataFromString(currentToken);
    }

    if (typeof currentToken === "symbol") {
        const existingMetadata = symbolTokenMetadata.get(currentToken);

        if (existingMetadata) {
            return existingMetadata;
        }

        const metadata = createPlainRuntimeTokenMetadata(currentToken, false);

        symbolTokenMetadata.set(currentToken, metadata);
        return metadata;
    }

    const existingMetadata = objectTokenMetadata.get(currentToken);

    if (existingMetadata) {
        return existingMetadata;
    }

    if (typeof currentToken === "function") {
        const metadata = createPlainRuntimeTokenMetadata(currentToken, false);

        objectTokenMetadata.set(currentToken, metadata);
        return metadata;
    }

    throw new Error("Token must be created with token, multiToken, or qualified");
};

export const isRuntimeToken = (value: unknown): value is AnyToken => {
    if (typeof value === "string" || typeof value === "symbol") {
        return true;
    }

    if (typeof value === "function") {
        return objectTokenMetadata.has(value) || isClassConstructor(value);
    }

    if (typeof value === "object" && value !== null) {
        return objectTokenMetadata.has(value);
    }

    return false;
};

export const isRuntimeQualifiedToken = (currentToken: unknown): boolean => {
    if (typeof currentToken === "string") {
        return currentToken.startsWith(qualifiedTokenPrefix);
    }

    if ((typeof currentToken === "object" && currentToken !== null) || typeof currentToken === "function") {
        return objectTokenMetadata.get(currentToken)?.qualified ?? false;
    }

    return false;
};

export const isRuntimeMultiToken = (currentToken: unknown): boolean => {
    if (typeof currentToken === "string") {
        return currentToken.startsWith(multiTokenPrefix);
    }

    if (typeof currentToken === "symbol") {
        return symbolTokenMetadata.get(currentToken)?.multi ?? false;
    }

    if ((typeof currentToken === "object" && currentToken !== null) || typeof currentToken === "function") {
        return objectTokenMetadata.get(currentToken)?.multi ?? false;
    }

    return false;
};

export const tokenKey = <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
    return runtimeTokenMetadata(currentToken).key as TokenKey<TToken>;
};

export const tokenDisplayKey = (currentToken: AnyToken): string => {
    return runtimeTokenMetadata(currentToken).displayKey;
};

export const tokenKeyRuntimeId = (currentToken: AnyToken): string => {
    return runtimeTokenMetadata(currentToken).keyId;
};

export const tokenRuntimeId = (currentToken: AnyToken): string => {
    return runtimeTokenMetadata(currentToken).tokenId;
};

function assertTokenKey(key: unknown): asserts key is TokenKeyInput {
    if (typeof key !== "string" && typeof key !== "symbol" && typeof key !== "function") {
        throw new Error("Token key must be a string, symbol, or class");
    }

    if (typeof key === "string" && (key.startsWith(multiTokenPrefix) || key.startsWith(qualifiedTokenPrefix))) {
        throw new Error("Token key uses a reserved prefix");
    }
}

function assertQualifierKey(key: string): void {
    if (typeof key !== "string") {
        throw new Error("Qualifier key must be a string");
    }
}

export const token = <const TKey extends TokenKeyInput>(key: TKey): TokenBuilder<TKey> => {
    assertTokenKey(key);

    const metadata = createPlainRuntimeTokenMetadata(key, false);
    registerDirectTokenMetadata(key, metadata);

    return {
        of: <TValue = TokenDefaultValue<TKey>>() => key as Token<TKey, TValue>,
    };
};

export const multiToken = <const TKey extends TokenKeyInput>(key: TKey): MultiTokenBuilder<TKey> => {
    assertTokenKey(key);

    return {
        of: <TValue = TokenDefaultValue<TKey>>() => {
            if (typeof key === "string") {
                return `${multiTokenPrefix}${key}` as MultiToken<TKey, TValue>;
            }

            const metadata = createPlainRuntimeTokenMetadata(key, true);
            const runtimeToken = {};

            objectTokenMetadata.set(runtimeToken, metadata);
            return runtimeToken as MultiToken<TKey, TValue>;
        },
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
    if (isRuntimeMultiToken(baseToken)) {
        throw new Error("qualified(...) only accepts single tokens");
    }

    assertQualifierKey(currentQualifier as string);

    if (typeof baseToken === "string") {
        return createQualifiedRuntimeToken(baseToken, currentQualifier as string) as QualifiedToken<
            TBaseToken,
            TQualifier
        >;
    }

    const metadata = createQualifiedRuntimeTokenMetadata(baseToken, currentQualifier);
    const runtimeToken = {};

    objectTokenMetadata.set(runtimeToken, metadata);
    return runtimeToken as QualifiedToken<TBaseToken, TQualifier>;
};
