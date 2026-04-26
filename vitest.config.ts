import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        include: ["test/**/*.test.ts"],
        exclude: ["dist/**", "node_modules/**", "test-types/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            reportsDirectory: "coverage",
            thresholds: {
                100: true,
            },
        },
    },
});
