# Contributing to Praxis

Thank you for considering a contribution. This guide is written from the code — the
rules below are the ones the lint gates, the tests, and the review process actually
enforce.

## Table of contents

- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Coding standards](#coding-standards)
- [Adding a new feature](#adding-a-new-feature)
- [Adding a new API route](#adding-a-new-api-route)
- [Adding a new Python prelude signal](#adding-a-new-python-prelude-signal)
- [Running the tests](#running-the-tests)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [License](#license)

## Quick start

```bash
# 1. Fork & clone.
git clone https://github.com/HossamBalaha/Praxis.git && cd Praxis

# 2. Install dependencies (Bun is the canonical package manager).
#    Note that bun.lock is the single lockfile, and npm install works too.
bun install

# 3. Drop your chapter folders under python_scripts/ (or File → Open Project).
#    Make sure python3 is on your PATH for any folder you open on your machine.
```

```bash
# 4. Start the dev server.
bun run dev

# 5. Lint, type-check and run the unit tests before committing.
bun run check
```

## Project layout

The complete tree with counts lives in
[README-PROJECT-LAYOUT.md](READMEs/README-PROJECT-LAYOUT.md); the load-bearing
rules (layer map, invariants, state management, quality gates) in
[ARCHITECTURE.md](ARCHITECTURE.md). The one-line version:

| Path                | Rule                                                                                         |
|---------------------|----------------------------------------------------------------------------------------------|
| `src/app/page.tsx`  | The single page; the only place allowed to wire top-level components together.               |
| `src/app/api/**`    | 127 routes; the only layer allowed to touch `fs`, `child_process`, or the network. No React. |
| `src/components/**` | Browser-only. May call `/api/*`, never `fs`.                                                 |
| `src/lib/**`        | Pure logic imported by both routes and components; must not import React components back.    |
| `src/layout/**`     | The two pure geometry engines, unit-tested.                                                  |
| `src/hooks/**`      | React glue over lib modules.                                                                 |
| `electron-main.js`  | Electron desktop main process; boots `.next/standalone/server.js` on `127.0.0.1:3000`.       |
| `scripts/**`        | Build, lint-budget, standalone asset copy, and symlink dereferencing helpers.                |

## Coding standards

Enforced by `eslint.config.mjs` + `tsc --noEmit` and checked by `bun run lint` /
`bun run typecheck`:

- **TypeScript strict** (`strict: true`; `noImplicitAny: false` is the one deliberate
  relaxation). Types over `any`; `@/*` imports only.
- **File sizes**: `max-lines` errors at **2,000 lines** for every new or refactored
  file. The 14 grandfathered monoliths are pinned at their 2026-11-21 sizes in the
  budget ledger ([ARCHITECTURE.md](ARCHITECTURE.md) §8) — a budget may only move
  DOWN: extract a module, then lower the number in the same change.
- **Warning budget**: `.lint-warning-budget` = 358 and ratchets down only. Fix
  warnings via `bun run lint:raw`, then lower the number to match. Never raise it.
- **Purity discipline**: browser-facing logic goes in `src/lib` as pure functions with
  a paired `src/lib/__tests__/<name>.test.ts` (jsdom is deliberately avoided — mock
  `window` with `vi.stubGlobal`). Components render; lib modules compute.
- **Client-safe twins**: never import `src/lib/scripts.ts` from a component (it pulls
  `node:fs`); use the browser twins (`slug-codec.ts`, `data-file-types.ts`).
- **State rules**: per-browser state in localStorage under `praxis.*` keys;
  cross-component signalling via `praxis:*` window events (serializable `detail`,
  paired cleanup, **no event handler writes files directly**); heavy/fast-changing page
  state through refs; untitled drafts are memory-only. See
  [ARCHITECTURE.md](ARCHITECTURE.md) §3.
- **No new stores**: cross-component signalling uses the existing `praxis:*` bus, never
  a new shared store.
- **Naming**: React components in `PascalCase` files; lib modules in kebab-case files
  with the module's exports matching its name.
- **Snippet style** (also the style used in every documentation example in this folder):

```ts
// Split the camelCase variables from the CamelCase functions and classes.
const maxAttempts = 3;

// A guard function that decides whether a retry is still allowed.
function RetryAllowed(attemptCount: number): boolean {
    // Parentheses are always written on the if statement.
    if (attemptCount < maxAttempts) {
        return true;
    }
    return false;
}
```

Comments sit above the statement they describe and end with a period; double quotes
everywhere except docstrings. `camelCase` for variables; `CamelCase` for functions,
classes, files and dictionary keys you introduce. (Request/response field names are
fixed by the API contract and stay exactly as [API-CONTRACTS.md](READMEs/API-CONTRACTS.md)
documents them.)

## Adding a new feature

1. Read [ARCHITECTURE.md](ARCHITECTURE.md) — the layer map decides where your code
   lives (component vs lib vs route) before anything else.
2. Put the logic in a pure `src/lib` module with unit tests; wire the UI in a
   component; surface it through the existing surfaces (menu item, quick action,
   context-menu group) rather than a new chrome surface.
3. Menus and context menus are data-driven — add items through
   `src/components/menu-bar.tsx` and the `menuGroupsForKind` spec (`src/lib/context-menu-spec.ts`), never a bespoke
   menu.
4. Wire any new setting into `DEFAULT_SETTINGS` (`src/lib/settings.ts`) and give it a
   row + search-index entry in the settings dialog.
5. Add or extend the e2e spec that covers the user-visible behavior; update the
   affected reference ([FEATURES-OVERVIEW.md](READMEs/FEATURES-OVERVIEW.md)
   for menus, [README-FEATURES.md](READMEs/README-FEATURES.md) for features).
6. Run `bun run check` — all three gates must pass before you commit.

## Adding a new API route

The shared contract (see [API-CONTRACTS.md](READMEs/API-CONTRACTS.md) for the
conventions and every existing route):

```ts
// Export the Node.js runtime so this route can touch the filesystem.
export const runtime = "nodejs";

// Never let the route be statically evaluated.
export const dynamic = "force-dynamic";

// Handle one POST request against the shared JSON contract.
export async function POST(request: NextRequest): Promise<NextResponse> {
    // Parse the JSON body before touching anything.
    let body: { folder?: string; file?: string } = {};
    try {
        // Read the request body as JSON.
        body = await request.json();
    } catch {
        // Reject an unparsable body with the shared error shape.
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    // Resolve the slugs through the shared sandbox guard.
    const resolved = resolveScriptPath(body.folder ?? "", body.file ?? "");
    if (!resolved) {
        // Refuse anything that escaped the scripts root.
        return NextResponse.json({error: "Invalid folder or file slug."}, {status: 400});
    }

    // Return the shared success shape.
    return NextResponse.json({ok: true, path: resolved.absPath});
}
```

Rules: import the shared helpers from `@/lib/scripts` (never re-implement slug decoding
or the traversal guard); success is `{ ok: true, … }` and failure is `{ error }` with a
meaningful status; every spawn is an argv array (`shell: false`), SIGKILL on timeout;
file writes go through the shared `saveLocalHistorySnapshot`; long-running responses
use the SSE helper conventions (the standard four headers); anything per-file is
`.py`-only unless it deliberately passes `{ anyKind: true }`. Rate classes are prefix
based — name your route so it lands in the right class (`/api/ai-*` for AI, run/console/
term/debug/profile/test/stop/watch prefixes for exec).

## Adding a new Python prelude signal

Signals are **files in the per-run temp dir**, never stdout markers (stdout belongs to
the user). In `src/lib/python-prelude.ts`:

1. Pick a filename for the signal (for example `mymetrics.json`).
2. Emit it at exit (an `atexit` hook like the existing `variables.json`/`coverage.json`
   writers, or lazily like the figure/DataFrame captures).
3. Read it in the route's `finalize()` (`src/app/api/run/route.ts`) and attach it to the
   `end` event payload.
4. Render it in the Output panel family and document it in
   [API-EXECUTION-TESTS.md](READMEs/API-EXECUTION-TESTS.md).

Keep the prelude defensive: a signal failure must never break the user's script — every
capture is wrapped in a best-effort guard, and the figures poller only emits artifacts
whose size is stable across two polls.

## Running the tests

```bash
# The unit suite (Vitest, node environment, 99 files / 1,789 tests).
bun run test:unit

# Watch mode for the module you are editing.
bun run test:unit:watch

# The e2e suite (Playwright, serial, single chromium, zero retries).
bun run test:e2e

# The examples corpus contract (compiles and executes all 3,700 examples).
bun run check:examples

# The full CI order.
bun run check
```

The e2e suite boots `bun run dev` locally or `bun run start` when
`PRAXIS_E2E_SERVER=prod`. Flakiness is fixed, not retried — the config has zero retries
by design.

## Submitting a pull request

1. One concern per PR; describe the user-visible change first.
2. `bun run check` green (lint budget not raised, typecheck clean, unit tests pass).
3. New logic in a pure lib module → ship its test file in the same PR.
4. User-visible feature → update the matching reference; route change →
   update [API-CONTRACTS.md](READMEs/API-CONTRACTS.md) (and the group file it
   links to); setting change → update the settings catalog.
5. If you shrank a monolith, lower the `max-lines` budget in the same change; if you
   paid down warnings, lower `.lint-warning-budget` to the new measured count.
6. Do not reformat unrelated files; the warning budget exists precisely so risky
   mechanical sweeps stay out of feature PRs.

## Reporting bugs

Open an issue with: the browser + OS, the interpreter/runtime involved (if any), the
exact steps, the observed versus expected behavior, and the console output. For run
issues include the timeout/truncation state shown on the run pill. For API issues, the
route and the request body shape (redact tokens — never paste the access token or an AI
key).

## License

The project is licensed CC BY-NC 4.0 ([LICENSE](LICENSE)) — contributions are accepted
under the same terms, and the machine-readable metadata lives in
[CITATION.cff](CITATION.cff).
