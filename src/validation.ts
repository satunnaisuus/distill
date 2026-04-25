import type { AnyBinding, BindingDependencies } from "./bind";
import type { DependencyMap } from "./dependencies";
import type { DependencyToken } from "./ref";
import type { AnyToken, AnyTokenRegistry, RegistryTokens, TokenKey, TokensNotIn } from "./token";

type BindingByToken<TBindings extends readonly AnyBinding[], TToken extends AnyToken> = Extract<
    TBindings[number],
    { readonly token: TToken }
>;

type BindingEagerDependencyTokens<TBinding extends AnyBinding> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? Extract<TDependencies[keyof TDependencies], AnyToken>
            : never
        : never;

type IsAny<TValue> = 0 extends 1 & TValue ? true : false;

type IsUnion<TValue, TUnion = TValue> =
    IsAny<TValue> extends true ? false : TValue extends unknown ? ([TUnion] extends [TValue] ? false : true) : false;

type HasTrue<TValue> = Extract<TValue, true> extends never ? false : true;

type RegisteredTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type HasDuplicateBindingToken<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyToken,
    TSeen extends boolean = false,
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends readonly AnyBinding[],
]
    ? [TokenKey<TCurrentBinding["token"]>] extends [TokenKey<TToken>]
        ? [TokenKey<TToken>] extends [TokenKey<TCurrentBinding["token"]>]
            ? TSeen extends true
                ? true
                : HasDuplicateBindingToken<TRemainingBindings, TToken, true>
            : HasDuplicateBindingToken<TRemainingBindings, TToken, TSeen>
        : HasDuplicateBindingToken<TRemainingBindings, TToken, TSeen>
    : false;

type DependencyTokenKeysNotIn<TBinding extends AnyBinding, TAllowedTokens extends AnyToken> =
    BindingDependencies<TBinding> extends infer TDependencies
        ? TDependencies extends DependencyMap
            ? {
                  [TKey in keyof TDependencies]: TokenKey<
                      TokensNotIn<DependencyToken<TDependencies[TKey]>, TAllowedTokens>
                  >;
              }[keyof TDependencies]
            : never
        : never;

type MissingDependencyKeys<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> = DependencyTokenKeysNotIn<
    TBinding,
    TRegisteredTokens
>;

type DependencyKeysOutsideRegistry<
    TBinding extends AnyBinding,
    TRegistryTokens extends AnyToken,
> = DependencyTokenKeysNotIn<TBinding, TRegistryTokens>;

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

type BindingOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = [
    TokensNotIn<TBinding["token"], TRegistryTokens>,
] extends [never]
    ? {}
    : {
          readonly __token_not_in_registry__: TokenKey<TBinding["token"]>;
      };

type DependenciesOutsideRegistryError<TBinding extends AnyBinding, TRegistryTokens extends AnyToken> = [
    DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>,
] extends [never]
    ? {}
    : {
          readonly __dependencies_not_in_registry__: DependencyKeysOutsideRegistry<TBinding, TRegistryTokens>;
      };

type MissingDependenciesError<TBinding extends AnyBinding, TRegisteredTokens extends AnyToken> = [
    MissingDependencyKeys<TBinding, TRegisteredTokens>,
] extends [never]
    ? {}
    : {
          readonly __missing_dependencies__: MissingDependencyKeys<TBinding, TRegisteredTokens>;
      };

type DuplicateBindingError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> =
    HasDuplicateBindingToken<TBindings, TBinding["token"]> extends true
        ? {
              readonly __duplicate_binding__: TokenKey<TBinding["token"]>;
          }
        : {};

type CircularDependencyError<TBinding extends AnyBinding, TBindings extends readonly AnyBinding[]> =
    HasCircularDependencyFromToken<TBindings, TBinding["token"]> extends true
        ? {
              readonly __circular_dependency__: true;
          }
        : {};

type UnionBindingTokenError<TBinding extends AnyBinding> =
    IsUnion<TBinding["token"]> extends true
        ? {
              readonly __union_binding_token__: TokenKey<TBinding["token"]>;
          }
        : {};

type ValidateBinding<
    TBinding extends AnyBinding,
    TBindings extends readonly AnyBinding[],
    TRegisteredTokens extends AnyToken,
    TRegistryTokens extends AnyToken,
> = TBinding &
    BindingOutsideRegistryError<TBinding, TRegistryTokens> &
    DependenciesOutsideRegistryError<TBinding, TRegistryTokens> &
    MissingDependenciesError<TBinding, TRegisteredTokens> &
    DuplicateBindingError<TBinding, TBindings> &
    CircularDependencyError<TBinding, TBindings> &
    UnionBindingTokenError<TBinding>;

export type ValidateBindings<
    TBindings extends readonly AnyBinding[],
    TRegistry extends AnyTokenRegistry,
> = number extends TBindings["length"]
    ? TupleBindingsError<TBindings>
    : {
          [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
              ? ValidateBinding<TBindings[TIndex], TBindings, RegisteredTokens<TBindings>, RegistryTokens<TRegistry>>
              : TBindings[TIndex];
      };
