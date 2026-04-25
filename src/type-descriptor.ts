import { typeBrand } from "./brands";

export type TypeDescriptor<T> = {
    readonly [typeBrand]: T;
};

export type AnyTypeDescriptor = TypeDescriptor<any>;
export type TypeValue<TType extends AnyTypeDescriptor> = TType[typeof typeBrand];

export const type = <T = unknown>(): TypeDescriptor<T> => {
    return {} as TypeDescriptor<T>;
};
