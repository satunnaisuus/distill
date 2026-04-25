import { tokenBrand } from "./brands";
import type { AnyTypeDescriptor, TypeValue } from "./type-descriptor";

type IsAny<TValue> = 0 extends 1 & TValue ? true : false;
type TokenRuntimeKey<TKey> = IsAny<TKey> extends true ? string : TKey extends string ? TKey : never;

export type Token<TKey = string, TValue = unknown> = TokenRuntimeKey<TKey> & {
    readonly [tokenBrand]: {
        readonly key: TokenRuntimeKey<TKey>;
        readonly type: TValue;
        readonly anyKey: IsAny<TKey>;
        readonly anyType: IsAny<TValue>;
    };
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

export type TokenDefinitions = Record<string, AnyTypeDescriptor>;
export type AnyTokenRegistry = Record<string, AnyToken>;
export type RegistryTokens<TRegistry extends AnyTokenRegistry> = TRegistry[keyof TRegistry];

type IsExact<TActual, TExpected> =
    IsAny<TActual> extends true
        ? IsAny<TExpected>
        : IsAny<TExpected> extends true
          ? false
          : [TActual] extends [TExpected]
            ? [TExpected] extends [TActual]
                ? true
                : false
            : false;

type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;

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

type TokenDefinitionKeyError<TDefinitions> = [Exclude<keyof TDefinitions, string>] extends [never]
    ? {}
    : {
          readonly __non_string_token_keys_not_supported__: Exclude<keyof TDefinitions, string>;
      };

export type Tokens<TDefinitions extends TokenDefinitions> = {
    [TKey in keyof TDefinitions as TKey extends string ? TKey : never]: Token<
        Extract<TKey, string>,
        TypeValue<TDefinitions[TKey]>
    >;
};

export const tokenKey = <TToken extends AnyToken>(token: TToken): TokenKey<TToken> => {
    return token as TokenKey<TToken>;
};

export const defineTokens = <const TDefinitions extends TokenDefinitions>(
    definitions: TDefinitions & TokenDefinitionKeyError<TDefinitions>,
): Tokens<TDefinitions> => {
    const tokens = {} as Tokens<TDefinitions>;

    for (const key of Object.keys(definitions) as Array<Extract<keyof TDefinitions, string>>) {
        tokens[key] = key as Tokens<TDefinitions>[typeof key];
    }

    return tokens;
};
