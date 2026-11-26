/**
 * Vitest configuration for the Praxis unit-test suite.
 *
 * The modules under test (src/lib/*) are pure logic — string transforms,
 * small parsers, localStorage-backed stores and fs-backed server helpers —
 * so the plain "node" environment is sufficient.
 *
 * jsdom was deliberately avoided: none of the tested lib modules render
 * DOM; the browser-facing ones only touch `window.localStorage`, which the
 * tests mock with `vi.stubGlobal("window", …)`. Skipping jsdom keeps the
 * suite fast and dependency-free.
 *
 * After, `vitest` is a real devDependency (bun install
 * materializes it), so the typed helper is used.
 */
import {resolve} from "node:path";
import {defineConfig} from "vitest/config";

const config = defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    test: {
        // Pure logic modules — no DOM needed (see header comment).
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});

export default config;
