import { type AnyBinding, isBinding } from "../binding/index";
import { exportedBindingBrand } from "./brands";
import type { ExportedBinding, ModuleBindingInput } from "./types";

export const exported = <const TBinding extends AnyBinding>(binding: TBinding): ExportedBinding<TBinding> => {
    if (!isBinding(binding)) {
        throw new Error("exported(...) expects a binding created with bind");
    }

    return {
        [exportedBindingBrand]: true,
        binding,
    };
};

export const isExportedBinding = (value: unknown): value is ExportedBinding => {
    return typeof value === "object" && value !== null && Object.hasOwn(value, exportedBindingBrand);
};

export const unwrapModuleBinding = (binding: ModuleBindingInput): AnyBinding => {
    return isExportedBinding(binding) ? binding.binding : binding;
};
