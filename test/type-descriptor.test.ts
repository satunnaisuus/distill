import { describe, expect, it } from "vitest";

import { typeBrand } from "../src/brands";
import { type as defineType } from "../src/type-descriptor";

describe("type", () => {
    it("creates an empty type descriptor", () => {
        const descriptor = defineType<{ readonly port: number }>();

        expect(descriptor).toEqual({});
        expect(Object.keys(descriptor)).toEqual([]);
        expect(Object.getOwnPropertySymbols(descriptor)).toEqual([]);
    });

    it("does not materialize the type brand at runtime", () => {
        const descriptor = defineType<string>();

        expect(Object.hasOwn(descriptor, typeBrand)).toBe(false);
        expect(typeBrand in descriptor).toBe(false);
    });

    it("returns a new descriptor for each call", () => {
        const firstDescriptor = defineType<string>();
        const secondDescriptor = defineType<string>();

        expect(firstDescriptor).not.toBe(secondDescriptor);
        expect(firstDescriptor).toEqual(secondDescriptor);
    });
});
