export const bindingBrand: unique symbol = Symbol("bindingBrand");
export const bindingDependenciesBrand: unique symbol = Symbol("bindingDependencies");
export const bindingLifetimeBrand: unique symbol = Symbol("bindingLifetime");

type BindingBrand = typeof bindingBrand | typeof bindingDependenciesBrand | typeof bindingLifetimeBrand;

export const hasOwnBindingBrand = (value: unknown, brand: BindingBrand): value is object => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, brand);
};
