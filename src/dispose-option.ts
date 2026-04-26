export type UnknownDisposer = (value: unknown) => void | Promise<void>;

export const DISPOSE_OPTION_TYPE_ERROR = "Dispose option must be a function";

export const assertDisposeOption: (dispose: unknown) => asserts dispose is UnknownDisposer = (dispose) => {
    if (typeof dispose !== "function") {
        throw new Error(DISPOSE_OPTION_TYPE_ERROR);
    }
};

export const getDisposeOption = <TDisposer extends UnknownDisposer>(
    options: { readonly dispose?: TDisposer } | undefined,
): TDisposer | undefined => {
    if (options === undefined) {
        return undefined;
    }

    if (typeof options !== "object" || options === null) {
        throw new Error("Binding options must be an object");
    }

    const dispose = (options as { readonly dispose?: unknown }).dispose;

    if (dispose === undefined) {
        return undefined;
    }

    assertDisposeOption(dispose);

    return dispose as TDisposer;
};
