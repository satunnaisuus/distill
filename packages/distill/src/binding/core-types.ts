import type { AnyToken } from "../token/index";
import { bindingBrand, bindingDependenciesBrand, bindingLifetimeBrand, hasOwnBindingBrand } from "./brands";
import type { BindingLifetime } from "./lifetime";

export type { BindingLifetime };

export type Disposer<TValue> = (value: TValue) => void | Promise<void>;

export type CoreBinding<
    TToken extends AnyToken = AnyToken,
    TDependencies = any,
    TLifetime extends BindingLifetime = BindingLifetime,
    TFactory extends (...args: any[]) => unknown = (...args: any[]) => unknown,
    TDispose = unknown,
> = {
    readonly [key in typeof bindingBrand]: true;
} & {
    readonly [key in typeof bindingLifetimeBrand]: TLifetime;
} & {
    readonly token: TToken;
    readonly factory: TFactory;
    readonly dispose?: TDispose;
} & {
    readonly [key in typeof bindingDependenciesBrand]?: TDependencies;
};

export type AnyBinding = CoreBinding;
export type BindingDependencies<TBinding extends AnyBinding> = TBinding[typeof bindingDependenciesBrand];
export type BindingLifetimeOf<TBinding extends AnyBinding> = TBinding[typeof bindingLifetimeBrand];

export const getBindingDependencies = <TDependencies = unknown>(binding: AnyBinding): TDependencies | undefined => {
    return Object.hasOwn(binding, bindingDependenciesBrand)
        ? (binding[bindingDependenciesBrand] as TDependencies | undefined)
        : undefined;
};

export const getBindingLifetime = (binding: AnyBinding): BindingLifetime => {
    return binding[bindingLifetimeBrand];
};

export const isBinding = (value: unknown): value is AnyBinding => {
    return hasOwnBindingBrand(value, bindingBrand);
};
