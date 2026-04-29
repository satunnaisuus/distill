import type { AnyBinding } from "./bind";
import { bindingOverrideAllBrand, bindingOverrideBrand } from "./brands";
import type { AnyMultiToken, AnySingleToken, TokenKey, TokensNotIn } from "./token";

type AnySingleBinding = AnyBinding & {
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

export type AnyBindingOverride = BindingOverride | BindingOverrideAll;

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = number extends TBindings["length"]
    ? {
          readonly __bindings_must_be_tuple__: true;
      }
    : {};

type ValidationErrorIf<TCondition extends boolean, TError> = [TCondition] extends [true] ? TError : {};

type OverrideAllBindingTokenError<TBinding extends AnyBinding, TToken extends AnyMultiToken> = ValidationErrorIf<
    [TokensNotIn<TBinding["token"], TToken>] extends [never] ? false : true,
    {
        readonly __override_all_binding_token__: TokenKey<TToken>;
    }
>;

type ValidateOverrideAllBindings<
    TBindings extends readonly AnyBinding[],
    TToken extends AnyMultiToken,
> = TupleBindingsError<TBindings> & {
    [TIndex in keyof TBindings]: TBindings[TIndex] extends AnyBinding
        ? TBindings[TIndex] & OverrideAllBindingTokenError<TBindings[TIndex], TToken>
        : TBindings[TIndex];
};

export const override = <const TBinding extends AnySingleBinding>(binding: TBinding): BindingOverride<TBinding> => {
    return {
        [bindingOverrideBrand]: true,
        binding,
    };
};

export const overrideAll = <const TToken extends AnyMultiToken, const TBindings extends readonly AnyBinding[]>(
    currentToken: TToken,
    bindings: TBindings & ValidateOverrideAllBindings<TBindings, TToken>,
): BindingOverrideAll<TToken, TBindings> => {
    return {
        [bindingOverrideAllBrand]: true,
        token: currentToken,
        bindings,
    };
};

export const isBindingOverride = (value: unknown): value is BindingOverride => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, bindingOverrideBrand);
};

export const isBindingOverrideAll = (value: unknown): value is BindingOverrideAll => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, bindingOverrideAllBrand);
};
