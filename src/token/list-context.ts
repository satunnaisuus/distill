import {
    type AnyToken,
    type AnyTokenArray,
    type TokenKey,
    tokenDisplayKey,
    tokenKey,
    tokenKeyRuntimeId,
    tokenRuntimeId,
} from "./core";

export type AssertTokenIsInTokenList = <TToken extends AnyToken>(currentToken: TToken) => TokenKey<TToken>;
export type RegisterToken = <TToken extends AnyToken>(currentToken: TToken) => TokenKey<TToken>;

export type TokenListContext = {
    readonly assertTokenIsInTokenList: AssertTokenIsInTokenList;
    readonly registerToken: RegisterToken;
};

type MutableTokenListContextOptions = {
    readonly allowUnknownTokens?: boolean;
};

export const createTokenListContext = <TTokenArray extends AnyTokenArray>(
    tokens: TTokenArray,
    options?: MutableTokenListContextOptions,
): TokenListContext => {
    const tokenListKeyIds = new Set<string>();
    const tokenListRuntimeTokenIds = new Set<string>();

    const registerInitialToken = <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
        const currentTokenDisplayKey = tokenDisplayKey(currentToken);
        const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
        const currentTokenId = tokenRuntimeId(currentToken);
        const currentTokenKey = tokenKey(currentToken);

        if (tokenListKeyIds.has(currentTokenKeyId)) {
            throw new Error(`Token "${currentTokenDisplayKey}" is already included in the token list`);
        }

        tokenListKeyIds.add(currentTokenKeyId);
        tokenListRuntimeTokenIds.add(currentTokenId);

        return currentTokenKey;
    };

    for (const currentToken of tokens) {
        registerInitialToken(currentToken);
    }

    return {
        assertTokenIsInTokenList: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentTokenDisplayKey = tokenDisplayKey(currentToken);
            const currentTokenId = tokenRuntimeId(currentToken);
            const currentTokenKey = tokenKey(currentToken);

            if (!tokenListRuntimeTokenIds.has(currentTokenId)) {
                throw new Error(`Token "${currentTokenDisplayKey}" is not included in the token list`);
            }

            return currentTokenKey;
        },
        registerToken: <TToken extends AnyToken>(currentToken: TToken): TokenKey<TToken> => {
            const currentTokenDisplayKey = tokenDisplayKey(currentToken);
            const currentTokenKeyId = tokenKeyRuntimeId(currentToken);
            const currentTokenId = tokenRuntimeId(currentToken);
            const currentTokenKey = tokenKey(currentToken);

            if (tokenListRuntimeTokenIds.has(currentTokenId)) {
                return currentTokenKey;
            }

            if (!options?.allowUnknownTokens) {
                throw new Error(`Token "${currentTokenDisplayKey}" is not included in the token list`);
            }

            tokenListKeyIds.add(currentTokenKeyId);
            tokenListRuntimeTokenIds.add(currentTokenId);

            return currentTokenKey;
        },
    };
};
