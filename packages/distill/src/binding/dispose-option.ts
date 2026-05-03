export type UnknownDisposer = (value: unknown) => void | Promise<void>;

export const DISPOSE_OPTION_TYPE_ERROR = "Dispose option must be a function";

export const assertDisposeOption: (dispose: unknown) => asserts dispose is UnknownDisposer = (dispose) => {
    if (typeof dispose !== "function") {
        throw new Error(DISPOSE_OPTION_TYPE_ERROR);
    }
};
