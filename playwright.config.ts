import {defineConfig, devices} from "@playwright/test";

/**
 * Praxis — Playwright smoke-test config.
 *
 * The suite is a SERIAL smoke pass: one server, shared server-side
 * state (run registry, term sessions), tests that build on each other.
 * Hence fullyParallel: false and a single chromium project — Playwright
 * then runs everything in one worker, in file order.
 *
 * The `webServer` boots dev or prod — see the PRAXIS_E2E_SERVER switch
 * documented just above the config object.
 */
/**
 * The `webServer` boots either the dev server or the production
 * standalone build, selected by PRAXIS_E2E_SERVER:
 *   - unset / "dev"  → `bun run dev` (compile-on-demand; fine on roomy
 *     machines, but a cold dev server can transiently use ~2 GB RSS
 *     while compiling the 16k-line page, which OOMs constrained
 *     sandboxes next to a Chromium instance).
 *   - "prod"         → `bun run start` (requires `bun run build`
 *     first). Boots in ~1 s, serves with a fraction of the memory,
 *     exercises the exact artifact users run, and the build itself
 *     becomes part of the gate. CI uses prod for these reasons.
 */
const serverCommand = process.env.PRAXIS_E2E_SERVER === "prod" ? "bun run start" : "bun run dev";

export default defineConfig({
    testDir: "./e2e",
    // 120s per test: dev-mode e2e pays first-compile costs inside the test
    // budget (a cold `next dev` compiling the 16k-line page plus the
    // file/run routes can eat 30-60s before assertions even start). The
    // suite is SERIAL with one worker, so a generous per-test cap costs
    // nothing on fast machines and only ever helps slow/cold ones.
    timeout: 120_000,
    fullyParallel: false,
    retries: 0,
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
    },
    webServer: {
        command: serverCommand,
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        {
            name: "chromium",
            use: {...devices["Desktop Chrome"]},
        },
    ],
});
