import type { AnyBinding } from "../binding/index";
import type { TupleError, ValidationErrorIf } from "../shared/index";
import type { AnyMultiToken, AnySingleToken, TokenKey, TokensNotIn } from "../token/index";
import {
    type AnyBindingOverride,
    type AnySingleBinding,
    type ApplyContainerOverrideBindings,
    type ApplyContainerOverrides,
    type BindingIsOverridden,
    type BindingOverride,
    type BindingOverrideAll,
    type BindingUnbind,
    bindingOverrideAllBrand,
    bindingOverrideBrand,
    bindingUnbindBrand,
    type DuplicateOverridesError,
    isBindingOverride,
    isBindingOverrideAll,
    isBindingUnbind,
    type MissingSingleOverrideTargetsError,
    type MultiOverrideBindings,
    type OverrideOperationTokens,
    type OverridesPreserveRootResolution,
    type OverrideTokensOutsideTokenListError,
    type SingleOverrideBindings,
    type TupleOverridesError,
    type UnionOverrideTokenError,
} from "./brands";

export type { RuntimeOverrideCollection } from "./runtime";
export { collectRuntimeOverrideOperations } from "./runtime";

export type {
    AnyBindingOverride,
    ApplyContainerOverrideBindings,
    ApplyContainerOverrides,
    BindingIsOverridden,
    BindingOverride,
    BindingOverrideAll,
    BindingUnbind,
    DuplicateOverridesError,
    MissingSingleOverrideTargetsError,
    MultiOverrideBindings,
    OverrideOperationTokens,
    OverridesPreserveRootResolution,
    OverrideTokensOutsideTokenListError,
    SingleOverrideBindings,
    TupleOverridesError,
    UnionOverrideTokenError,
};
export { isBindingOverride, isBindingOverrideAll, isBindingUnbind };

type TupleBindingsError<TBindings extends readonly AnyBinding[]> = TupleError<
    TBindings,
    {
        readonly __bindings_must_be_tuple__: true;
    }
>;

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

export const unbind = <const TToken extends AnySingleToken>(currentToken: TToken): BindingUnbind<TToken> => {
    return {
        [bindingUnbindBrand]: true,
        token: currentToken,
    };
};
