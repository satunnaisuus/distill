import type { AnyBinding } from "../binding/index";
import type { IsUnion, TupleError, ValidationErrorUnlessNever } from "../shared/index";
import type {
    AnyMultiToken,
    AnySingleToken,
    AnyToken,
    AnyTokenArray,
    HasExactToken,
    HasTokenWithSameKey,
    IsMultiToken,
    TokenArrayTokens,
    TokenKey,
    TokensNotIn,
} from "../token/index";

export const bindingOverrideBrand: unique symbol = Symbol("bindingOverrideBrand");
export const bindingOverrideAllBrand: unique symbol = Symbol("bindingOverrideAllBrand");
export const bindingUnbindBrand: unique symbol = Symbol("bindingUnbindBrand");

type BindingOverrideBrand = typeof bindingOverrideBrand | typeof bindingOverrideAllBrand | typeof bindingUnbindBrand;

export const hasOwnBindingOverrideBrand = (value: unknown, brand: BindingOverrideBrand): value is object => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, brand);
};

export type AnySingleBinding = AnyBinding & {
    readonly token: AnySingleToken;
};

export type BindingOverride<TBinding extends AnySingleBinding = AnySingleBinding> = {
    readonly [bindingOverrideBrand]: true;
    readonly binding: TBinding;
};

export type BindingOverrideAll<
    TToken extends AnyMultiToken = AnyMultiToken,
    TBindings extends readonly AnyBinding[] = readonly AnyBinding[],
> = {
    readonly [bindingOverrideAllBrand]: true;
    readonly token: TToken;
    readonly bindings: TBindings;
};

export type BindingUnbind<TToken extends AnySingleToken = AnySingleToken> = {
    readonly [bindingUnbindBrand]: true;
    readonly token: TToken;
};

export type AnyBindingOverride = BindingOverride | BindingOverrideAll | BindingUnbind;

type SingleOverrideTokens<TOverrides extends readonly AnyBindingOverride[]> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverride<infer TBinding>
        ? TBinding["token"]
        : TOverride extends BindingUnbind<infer TToken>
          ? TToken
          : never
    : never;

type BindingTokens<TBindings extends readonly AnyBinding[]> = TBindings[number]["token"];

type MultiOverrideTokens<TOverrides extends readonly AnyBindingOverride[]> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverrideAll<infer TToken>
        ? TToken
        : never
    : never;

export type BindingIsOverridden<TBinding extends AnyBinding, TOverrides extends readonly AnyBindingOverride[]> =
    IsMultiToken<TBinding["token"]> extends true
        ? HasExactToken<MultiOverrideTokens<TOverrides>, TBinding["token"]>
        : HasExactToken<SingleOverrideTokens<TOverrides>, TBinding["token"]>;

type RemoveOverriddenBindings<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
> = TBindings extends readonly [
    infer TCurrentBinding extends AnyBinding,
    ...infer TRemainingBindings extends AnyBinding[],
]
    ? BindingIsOverridden<TCurrentBinding, TOverrides> extends true
        ? RemoveOverriddenBindings<TRemainingBindings, TOverrides>
        : readonly [TCurrentBinding, ...RemoveOverriddenBindings<TRemainingBindings, TOverrides>]
    : readonly [];

export type SingleOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = TOverrides extends readonly [
    infer TCurrentOverride extends AnyBindingOverride,
    ...infer TRemainingOverrides extends AnyBindingOverride[],
]
    ? TCurrentOverride extends BindingOverride<infer TBinding>
        ? readonly [TBinding, ...SingleOverrideBindings<TRemainingOverrides>]
        : SingleOverrideBindings<TRemainingOverrides>
    : readonly [];

export type MultiOverrideBindings<TOverrides extends readonly AnyBindingOverride[]> = TOverrides extends readonly [
    infer TCurrentOverride extends AnyBindingOverride,
    ...infer TRemainingOverrides extends AnyBindingOverride[],
]
    ? TCurrentOverride extends BindingOverrideAll<AnyMultiToken, infer TBindings>
        ? readonly [...TBindings, ...MultiOverrideBindings<TRemainingOverrides>]
        : MultiOverrideBindings<TRemainingOverrides>
    : readonly [];

export type ApplyContainerOverrides<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
> = readonly [
    ...RemoveOverriddenBindings<TBindings, TOverrides>,
    ...SingleOverrideBindings<TOverrides>,
    ...MultiOverrideBindings<TOverrides>,
];

export type ApplyContainerOverrideBindings<
    TBindings extends readonly AnyBinding[],
    TOverrides extends readonly AnyBindingOverride[],
    TOverrideBindings extends readonly AnyBinding[],
> = readonly [...RemoveOverriddenBindings<TBindings, TOverrides>, ...TOverrideBindings];

type OverrideOperationToken<TOverride extends AnyBindingOverride> =
    TOverride extends BindingOverride<infer TBinding>
        ? TBinding["token"]
        : TOverride extends BindingOverrideAll<infer TToken>
          ? TToken
          : TOverride extends BindingUnbind<infer TToken>
            ? TToken
            : never;

export type OverrideOperationTokens<TOverrides extends readonly AnyBindingOverride[]> =
    TOverrides[number] extends infer TOverride extends AnyBindingOverride ? OverrideOperationToken<TOverride> : never;

type DuplicateOverrideTokenKeys<
    TOverrides extends readonly AnyBindingOverride[],
    TSeenTokens extends AnyToken = never,
> = number extends TOverrides["length"]
    ? never
    : TOverrides extends readonly [
            infer TCurrentOverride extends AnyBindingOverride,
            ...infer TRemainingOverrides extends readonly AnyBindingOverride[],
        ]
      ? OverrideOperationToken<TCurrentOverride> extends infer TCurrentToken extends AnyToken
          ? HasTokenWithSameKey<TSeenTokens, TCurrentToken> extends true
              ? TokenKey<TCurrentToken> | DuplicateOverrideTokenKeys<TRemainingOverrides, TSeenTokens>
              : DuplicateOverrideTokenKeys<TRemainingOverrides, TSeenTokens | TCurrentToken>
          : never
      : never;

type UnionOverrideTokenKeys<TOverrides extends readonly AnyBindingOverride[]> = number extends TOverrides["length"]
    ? never
    : TOverrides extends readonly [
            infer TCurrentOverride extends AnyBindingOverride,
            ...infer TRemainingOverrides extends readonly AnyBindingOverride[],
        ]
      ? OverrideOperationToken<TCurrentOverride> extends infer TCurrentToken extends AnyToken
          ? IsUnion<TCurrentToken> extends true
              ? TokenKey<TCurrentToken> | UnionOverrideTokenKeys<TRemainingOverrides>
              : UnionOverrideTokenKeys<TRemainingOverrides>
          : never
      : never;

type MissingSingleOverrideTargetKeys<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverride<infer TBinding>
        ? HasExactToken<BindingTokens<TBindings>, TBinding["token"]> extends true
            ? never
            : TokenKey<TBinding["token"]>
        : TOverride extends BindingUnbind<infer TToken>
          ? HasExactToken<BindingTokens<TBindings>, TToken> extends true
              ? never
              : TokenKey<TToken>
          : never
    : never;

export type TupleOverridesError<TOverrides extends readonly AnyBindingOverride[]> = TupleError<
    TOverrides,
    {
        readonly __overrides_must_be_tuple__: true;
    }
>;

export type DuplicateOverridesError<TOverrides extends readonly AnyBindingOverride[]> = ValidationErrorUnlessNever<
    DuplicateOverrideTokenKeys<TOverrides>,
    {
        readonly __duplicate_override__: DuplicateOverrideTokenKeys<TOverrides>;
    }
>;

type OverrideTokenKeysOutsideTokenList<
    TOverrides extends readonly AnyBindingOverride[],
    TTokenArray extends AnyTokenArray,
> = TokenKey<TokensNotIn<OverrideOperationTokens<TOverrides>, TokenArrayTokens<TTokenArray>>>;

export type OverrideTokensOutsideTokenListError<
    TOverrides extends readonly AnyBindingOverride[],
    TTokenArray extends AnyTokenArray,
> = ValidationErrorUnlessNever<
    OverrideTokenKeysOutsideTokenList<TOverrides, TTokenArray>,
    {
        readonly __override_token_not_in_tokens__: OverrideTokenKeysOutsideTokenList<TOverrides, TTokenArray>;
    }
>;

export type UnionOverrideTokenError<TOverrides extends readonly AnyBindingOverride[]> = ValidationErrorUnlessNever<
    UnionOverrideTokenKeys<TOverrides>,
    {
        readonly __union_override_token__: UnionOverrideTokenKeys<TOverrides>;
    }
>;

export type MissingSingleOverrideTargetsError<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
> = ValidationErrorUnlessNever<
    MissingSingleOverrideTargetKeys<TOverrides, TBindings>,
    {
        readonly __override_target_not_bound__: MissingSingleOverrideTargetKeys<TOverrides, TBindings>;
    }
>;

export const isBindingOverride = (value: unknown): value is BindingOverride => {
    return hasOwnBindingOverrideBrand(value, bindingOverrideBrand);
};

export const isBindingOverrideAll = (value: unknown): value is BindingOverrideAll => {
    return hasOwnBindingOverrideBrand(value, bindingOverrideAllBrand);
};

export const isBindingUnbind = (value: unknown): value is BindingUnbind => {
    return hasOwnBindingOverrideBrand(value, bindingUnbindBrand);
};
