import type { AnyBinding, BindingDependencies } from "./bind";
import type { DependencyMap } from "./dependencies";
import type { DependencyToken } from "./ref";
import type { AnyToken, AnyTokenRegistry, RegistryTokens, TokenKey } from "./token";

type BindingByToken<TBindings extends readonly AnyBinding[], TToken extends AnyToken> = Extract<
    TBindings[number],
    { readonly token: TToken }
>;

type BindingEagerDependencyTokens<TBinding extends AnyBinding> = BindingDependencies<TBinding> extends infer TDependencies
    ? TDependencies extends DependencyMap
        ? Extract<TDependencies[keyof TDependencies], AnyToken>
        : never
    : never;

type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;

type RegisteredTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

type DependencyKeysNotIn<TBinding extends AnyBinding, TAllowedTokens extends AnyToken> = (
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? {
                [TKey in keyof TDependencies]: [Exclude<DependencyToken<TDependencies[TKey]>, TAllowedTokens>] extends [never]
                    ? never
                    : TKey;
            }[keyof TDependencies]
            : never
        : never
);

type MissingDependencyKeys<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> =
    DependencyKeysNotIn<TBinding, TRegisteredTokens>;

type DependencyKeysOutsideRegistry<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> =
    DependencyKeysNotIn<TBinding, TRegistryTokens>;

type HasCircularDependencyFromToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TPath extends AnyToken = never,
> = [Extract<TToken, TPath>] extends [never]
    ? BindingByToken<TBindings, TToken> extends infer TBinding
        ? [TBinding] extends [never]
            ? false
            : TBinding extends AnyBinding
                ? HasTrue<
                    BindingEagerDependencyTokens<TBinding> extends infer TDependencyToken
                        ? TDependencyToken extends AnyToken
                            ? HasCircularDependencyFromToken<TBindings, TDependencyToken, TPath | TToken>
                            : false
                        : false
                >
                : false
        : false
    : true;

type BindingOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = (
    [Exclude<TBinding["token"], TRegistryTokens>] extends [never]
        ? {}
        : {
            readonly __token_not_in_registry__: TokenKey<TBinding["token"]>;
        }
);

type DependenciesOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = (
    [DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>] extends [never]
        ? {}
        : {
            readonly __dependencies_not_in_registry__: DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>;
        }
);

type MissingDependenciesError<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> = (
    [MissingDependencyKeys<TBinding, TRegisteredTokens>] extends [never]
        ? {}
        : {
            readonly __missing_dependencies__: MissingDependencyKeys<TBinding, TRegisteredTokens>;
        }
);

type CircularDependencyError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> = (
    HasCircularDependencyFromToken<TBindings, TBinding["token"]> extends true
        ? {
            readonly __circular_dependency__: true;
        }
        : {}
);

type ValidateBinding<
    TBinding extends AnyBinding,
    TBindings extends readonly AnyBinding[],
    TRegisteredTokens extends AnyToken,
    TRegistryTokens extends AnyToken,
> = TBinding &
    BindingOutsideRegistryError<TBinding, TRegistryTokens> &
    DependenciesOutsideRegistryError<TBinding, TRegistryTokens> &
    MissingDependenciesError<TBinding, TRegisteredTokens> &
    CircularDependencyError<TBinding, TBindings>;

export type ValidateBindings<TBindings extends readonly AnyBinding[], TRegistry extends AnyTokenRegistry> = {
    [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
        ? ValidateBinding<TBindings[TIndex], TBindings, RegisteredTokens<TBindings>, RegistryTokens<TRegistry>>
        : TBindings[TIndex];
};
