import type { AnyBinding } from "./bind";
import type { BindingTokens } from "./graph";
import type { AnyBindingOverride, BindingOverride, BindingOverrideAll, BindingUnbind } from "./override";
import type {
    AnyMultiToken,
    AnyToken,
    AnyTokenArray,
    IsMultiToken,
    TokenArrayTokens,
    TokenKey,
    TokensNotIn,
} from "./token";
import type { HasExactToken, HasTokenWithSameKey } from "./token-type-utils";
import type { IfNever, IsUnion, TupleError, ValidationErrorIf, ValidationErrorUnlessNever } from "./type-utils";
import type { ValidateBindings } from "./validation";

type SingleOverrideTokens<TOverrides extends readonly AnyBindingOverride[]> = TOverrides[number] extends infer TOverride
    ? TOverride extends BindingOverride<infer TBinding>
        ? TBinding["token"]
        : TOverride extends BindingUnbind<infer TToken>
          ? TToken
          : never
    : never;

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

type InvalidOverrideGraphError<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
> = IfNever<
    TOverrides[number],
    {},
    ValidationErrorIf<
        TBindings extends ValidateBindings<TBindings, TTokenArray> ? false : true,
        {
            readonly __invalid_overrides__: ValidateBindings<TBindings, TTokenArray>;
        }
    >
>;

export type ValidateContainerOverrides<
    TOverrides extends readonly AnyBindingOverride[],
    TBindings extends readonly AnyBinding[],
    TTokenArray extends AnyTokenArray,
    TResolvedBindings extends readonly AnyBinding[] = ApplyContainerOverrides<TBindings, TOverrides>,
> = TupleOverridesError<TOverrides> &
    UnionOverrideTokenError<TOverrides> &
    DuplicateOverridesError<TOverrides> &
    OverrideTokensOutsideTokenListError<TOverrides, TTokenArray> &
    MissingSingleOverrideTargetsError<TOverrides, TBindings> &
    InvalidOverrideGraphError<TOverrides, TResolvedBindings, TTokenArray>;
