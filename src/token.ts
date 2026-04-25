import { tokenBrand } from "./brands";
import type { AnyTypeDescriptor, TypeValue } from "./type-descriptor";

export type Token<TKey extends string = string, TValue = unknown> = TKey & {
    readonly [tokenBrand]: {
        readonly key: TKey;
        readonly type: TValue;
    };
};

export type AnyToken = Token<string, any>;
export type TokenValue<TToken extends AnyToken> = TToken[typeof tokenBrand]["type"];
export type TokenKey<TToken extends AnyToken> = TToken[typeof tokenBrand]["key"];

export type TokenDefinitions = Record<string, AnyTypeDescriptor>;
export type AnyTokenRegistry = Record<string, AnyToken>;
export type RegistryTokens<TRegistry extends AnyTokenRegistry> = TRegistry[keyof TRegistry];

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
