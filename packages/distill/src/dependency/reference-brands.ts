export const allDependencyBrand: unique symbol = Symbol("allDependency");
export const optionalDependencyBrand: unique symbol = Symbol("optionalDependency");
export const refDependencyBrand: unique symbol = Symbol("refDependency");

type DependencyBrand = typeof allDependencyBrand | typeof optionalDependencyBrand | typeof refDependencyBrand;

export const hasDependencyBrand = (dependency: unknown, brand: DependencyBrand): dependency is object => {
    return typeof dependency === "object" && dependency !== null && brand in dependency;
};
