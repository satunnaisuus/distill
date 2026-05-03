import { describe, expect, it, vi } from "vitest";
import { type DependencyReference, isRefDependency } from "../src/dependency/ref";
import { refDependencyBrand } from "../src/dependency/reference-brands";
import { ref, type Token, token } from "../src/index";

describe("ref", () => {
    it("creates a ref dependency for a direct token", () => {
        const tokens = {
            logger: token("logger").of<{ log: (message: string) => void }>(),
        };

        const dependency = ref(tokens.logger);

        expect(isRefDependency(dependency)).toBe(true);
        expect(dependency.resolveToken()).toBe(tokens.logger);
    });

    it("creates a lazy ref dependency from a token factory", () => {
        const tokens = {
            first: token("first").of<{ readonly name: "first" }>(),
            second: token("second").of<{ readonly name: "second" }>(),
        };
        let selectedToken: Token = tokens.first;
        const resolveToken = vi.fn(() => selectedToken);

        const dependency = ref(resolveToken);

        expect(resolveToken).not.toHaveBeenCalled();

        selectedToken = tokens.second;

        expect(dependency.resolveToken()).toBe(tokens.second);
        expect(resolveToken).toHaveBeenCalledTimes(1);
    });
});

describe("isRefDependency", () => {
    it("returns true for ref dependencies", () => {
        const tokens = {
            config: token("config").of<{ readonly port: number }>(),
        };

        expect(isRefDependency(ref(tokens.config))).toBe(true);
    });

    it("returns true when the ref dependency brand is inherited", () => {
        const dependency = Object.create({
            [refDependencyBrand]: true,
        }) as DependencyReference;

        expect(isRefDependency(dependency)).toBe(true);
    });

    it("returns false for token dependencies", () => {
        const token = "feature-flags" as Token<"feature-flags", { readonly enabled: boolean }>;

        expect(isRefDependency(token)).toBe(false);
    });

    it("returns false for function values", () => {
        expect(isRefDependency((() => "logger") as unknown as DependencyReference)).toBe(false);
    });

    it("returns false for non-ref runtime values", () => {
        expect(isRefDependency({} as DependencyReference)).toBe(false);
        expect(isRefDependency(null as unknown as DependencyReference)).toBe(false);
    });
});
