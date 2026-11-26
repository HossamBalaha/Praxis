# Praxis — Architecture

This document describes the load-bearing rules of the codebase: the layer map, the layout
invariants, the state-management contract, the file-operation API surface, the quality gates,
and the testing architecture. It is written **from the code** — every rule below is enforced
by a module, a test, or a lint gate, and the file names are given so you can verify each
claim.

Long topics are split into sub-files under [`READMEs/`](./READMEs/) and referenced from
here:

- [READMEs/ARCHITECTURE-SPLIT-PANES.md](./READMEs/ARCHITECTURE-SPLIT-PANES.md) — §2.1–2.2, the split-pane engine.
- [READMEs/ARCHITECTURE-OVERLAYS.md](./READMEs/ARCHITECTURE-OVERLAYS.md) — §2.3–2.5, overlays, scrolling, progressive
  rendering, the highlight worker.
- [READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md) — §7, the Pyright sidecar.

Companion references (content, not rules): the feature map
[READMEs/FEATURES-OVERVIEW.md](./READMEs/FEATURES-OVERVIEW.md) +
[READMEs/README-FEATURES.md](./READMEs/README-FEATURES.md), the settings catalog
[READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md), the key map
[READMEs/SHORTCUTS.md](./READMEs/SHORTCUTS.md), and the full route inventory
[READMEs/API-CONTRACTS.md](./READMEs/API-CONTRACTS.md).

---

## 1. The layer map

The app is a **single-page Next.js application with a JSON API**. There is exactly one page (`src/app/page.tsx` +
`src/app/layout.tsx`); everything else is either a component, a pure
lib module, or an API route.

| Layer              | Contents                                                                                                                                                     | Rule                                                                                                                                         |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `src/app/`         | `page.tsx` (15,672 lines — the orchestrator monolith, being decomposed), `layout.tsx`                                                                        | The only place allowed to wire top-level components together.                                                                                |
| `src/app/api/`     | **127 `route.ts` files** across 110 top-level route folders (+ 1 non-route helper, `local-history/list/route-helpers.ts`)                                    | The **only** layer allowed to touch `fs`, `child_process`, or the network. No React.                                                         |
| `src/components/`  | 150 app components (134 directly + 15 in `toolbox/` + 1 in `settings/`, plus `code-viewer-types.ts`) and 32 shadcn/ui primitives in `components/ui/`         | Browser-only. May call `/api/*`, never `fs`.                                                                                                 |
| `src/lib/`         | 153 pure modules directly (+ `examples-data/` with 91 content modules, + `__tests__/` with 97 test files and the `fixtures/mock-langserver.mjs` mock server) | Pure logic: string transforms, parsers, localStorage stores. Imported by both routes and components — must not import React components back. |
| `src/layout/`      | `split-pane-engine.ts`, `code-overlay-engine.ts`                                                                                                             | Pure geometry engines (zero React/DOM), unit-tested in `src/layout/__tests__/`.                                                              |
| `src/hooks/`       | 7 hooks (`use-keyboard-shortcuts`, `use-pyright-lsp`, `use-tab-lifecycle`, `use-live-lint-diagnostics`, `use-examples`, `use-pwa-install`, `use-toast`)      | React glue over lib modules.                                                                                                                 |
| Workers            | `highlight-worker.ts` (syntax), `extensions-worker.ts` (extension sandbox)                                                                                   | Run off the main thread; communicate by structured-clone JSON protocols.                                                                     |
| `e2e/`, `scripts/` | 3 Playwright specs / 19 tests; 6 build/dev scripts                                                                                                           | Test and tooling surfaces.                                                                                                                   |

Data flow is one-directional: **components → API routes → lib/fs**. The page uses 53
`next/dynamic` lazy imports (all `{ ssr: false }`) so the initial bundle stays small; the
API layer is where the sandbox, rate limiting, and auth (`src/proxy.ts`) live.
Cross-component signalling uses the window event bus (§3.3), not shared mutable stores.

The page's top-level layout, in render order: `MenuBar` → `FocusSessions` → sidebar
`FolderTree` → editor column (`EditorTabs` + `WorkspaceWelcome` / `FileViewer` /
`CodeViewer` / `SplitFilePane` / `EmptyState` + `BreadcrumbsBar`) → bottom dock (`OutputPanel`, `DiagnosticsPanel`,
`TodoPanel`, `TestsPanel`, `ConsolePanel`,
`PlotsPanel`, `TerminalPanel`) → right `AiChatSidebar` → overlays (`VariableGridDialogHost`,
`TemplatePickerDialog`, `FolderPickerDialog`, `ShortcutsDialog`, `TabSwitcherOverlay`,
`PerfHud`, `OfflineIndicator`).

## 2. Core layout invariants

The editor layout is governed by two pure engines in `src/layout/`. Their invariants are the
difference between an IDE that feels solid and one that drifts.

### 2.1 The gutter invariant — *N panes ⇒ exactly N − 1 gutters*

A layout with `N` panes renders exactly `N − 1` draggable gutters, and a gutter drag
redistributes width **only within its own pair**. `split-pane-engine.ts` is the single
source of truth (`gutterCount`, `gutterIndices`, `panePairForGutter` — the last returns
`null` on a wiring mistake instead of guessing). The pane cap is `MAX_SPLIT_PANES = 4`;
each pane keeps `SPLIT_SHARE_FLOOR = 10`% when its pair can afford it. **Full
contract → [READMEs/ARCHITECTURE-SPLIT-PANES.md](./READMEs/ARCHITECTURE-SPLIT-PANES.md).**

### 2.2 The share invariants

Pane shares are **whole integer percents summing to exactly 100**, `sizes.length ===
panes.length` always (hidden panes keep theirs), the group width clamps to `[10, 90]`
(`SPLIT_GROUP_WIDTH_MIN`/`MAX`), and at most 4 panes exist. `splitLayoutViolations(state)`
audits all of this after every transition in a 500-step randomized test storm;
`restoreSplitLayout` never trusts a corrupt saved snapshot — it falls back to equal
shares. Visibility is deliberately orthogonal to content: the menu toggle hides the group
without clearing it. **Full
contract → [READMEs/ARCHITECTURE-SPLIT-PANES.md](./READMEs/ARCHITECTURE-SPLIT-PANES.md#the-share-invariants).**

### 2.3 Text and overlay layers share ONE scroll container

All decoration layers (squiggles, fold chevrons, diff/coverage strips, spell chips, blame
gutter, rainbow brackets) are absolutely-positioned children of the **same** `overflow-auto`
scroller as the text, so they scroll for free and are positioned by the pure math in
`code-overlay-engine.ts` (`lineTopOf`, the ±40-line overlay window with 20-line hysteresis,
`viewRowTopOf` returning `null` for hidden rows). **Full
contract → [READMEs/ARCHITECTURE-OVERLAYS.md](./READMEs/ARCHITECTURE-OVERLAYS.md#text-and-overlay-layers-share-one-scroll-container).**

### 2.4 A clipping surface must never depend on measurement to clip

Overlays may depend on measurement (a stale rect displaces a decoration by a pixel until the
`MutationObserver` re-measures). **Clipping surfaces may not**: the collapsed "Show less"
preview clips with CSS geometry only (`overflow-hidden` + `overscroll-behavior: contain` +
scroll-offset re-pinning), never with a measured "clip to this height" — a stale measurement
there would leak scrollbars or clip the wrong rows. `e2e/round3-fixes.spec.ts` pins this
behaviour. **Full
contract → [READMEs/ARCHITECTURE-OVERLAYS.md](./READMEs/ARCHITECTURE-OVERLAYS.md#a-clipping-surface-must-never-depend-on-measurement-to-clip).**

### 2.5 Worker grammars must match the main-thread registry

Syntax highlighting runs in one module Web Worker with a JSON protocol (`{id, code, language}` → `{id, tokens}` /
`{id, error}`), an LRU cache of 96 results, and a
`workerBroken` latch that falls back to a main-thread simple renderer. The main-thread Prism
registry (`src/lib/highlighter.ts`) and the worker registry (`src/lib/highlight-worker.ts`)
are **hand-maintained mirrors** (43 grammars each, plus the kind→grammar router in
`file-viewer.tsx`) — there is no code-level guarantee, so adding a language is always
three coordinated edits. **Full
contract → [READMEs/ARCHITECTURE-OVERLAYS.md](./READMEs/ARCHITECTURE-OVERLAYS.md#worker-grammars-must-match-the-main-thread-registry).**

## 3. State management rules

### 3.1 Untitled drafts are memory-only — no implicit disk writes

Untitled drafts (the API-client `.http` scratch files) live **only in React refs** —
`untitledHttpDraftsRef` and `untitledHttpCounterRef` in `src/hooks/use-tab-lifecycle.ts` —
never in `useState`, never on disk, never in localStorage. The header of
`src/lib/tab-lifecycle.ts` states the rule verbatim: *nothing writes to disk without an
explicit Save As; an untitled draft never blocks a tab switch, and never routes ⌘S into an
editor that is not mounted*. The machinery: `nextUntitledDraft(n)` mints `Untitled-N.http`
tabs (`untitled-http-N` ids); `draftTabFor` builds the dirty, untitled tab (empty slugs,
`untitled: true`); `routeSaveIntent(activeTab, fileKind)` decides where a save goes (`"open-save-as"` |
`"file-viewer"` | `"code-viewer"`); `liveDraftIds(openTabs,
closedTabHistory)` keeps the drafts reachable through the reopen history; and
`evictDeadDrafts` garbage-collects texts no live tab claims — "a draft freed here is gone
for good". `SAVE_AS_DEFAULT_NAME` is `"requests.http"`; `normalizeSaveAsName` appends the
`.http` extension but never invents a name for an empty input. Closed-tab history is capped
at `CLOSED_TAB_HISTORY_CAP = 10` (newest-first, deduped). The persisted session excludes
untitled drafts by design — a reload drops them.

### 3.2 Client state is client state

Per-browser UI state (settings, fold state, bookmarks, zoom, layouts) lives in **`localStorage`** under `praxis.*` keys
(prefix from `src/lib/config.ts` — `STORAGE_PREFIX`,
overridable via `NEXT_PUBLIC_STORAGE_PREFIX`). The server holds **no per-user UI state**.
Key families: `praxis.settings` (all settings, `src/lib/settings.ts`), `praxis.session`
(workspace session), `praxis.layout` (sidebar width + code panel height),
`praxis.layout-preset`, `praxis.code-theme`, `praxis.output-theme`, `praxis.language`,
`praxis.collab.{identity,settings}`, `praxis.focus-{settings,stats,pos}`, `praxis.ambient`,
`praxis-custom-shortcuts`, `praxis-tab-order`, `praxis-pinned-tabs`, `praxis.run-history`,
`praxis.recent-{scripts,commands}`, `praxis.offline-writes`, `praxis-folded.<folder>.<file>`,
`praxis.fold-state`, `praxis.http.{envs,activeEnv,history,collections}`,
`praxis.extensions.enabled`, and roughly 60 more (full inventory in
[READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md#storage-model)).

The one deliberate exception: per-project overrides live in
`<project>/.praxis/settings.json` on disk and are merged key-by-key for map-shaped settings (`mergeProjectSettings`,
`GET/POST /api/project-settings`), so the same project can carry
its own dictionary/spell-ignore/appearance overrides across machines. Project pins win for
plain values; map-shaped keys (`topRightQuickActions`, `formatLangIndent`,
`formatLangAutoSave`) merge per key so a shipped empty project map can never reset browser
choices. `.praxis/` also carries `active-project.json` (the active project pointer),
`projects.json` (the created-projects registry), `notes.json`, `appearance.json`, and
`spell-ignore.json`.

### 3.3 Cross-component communication uses the window event bus

Components signal each other with `CustomEvent`s on `window`, all named `praxis:*` — **~100 distinct names** (65 of them
dispatched or listened in `page.tsx`, 203 dispatch
constructor sites repo-wide). The bus exists because `page.tsx` orchestrates components that
must not import each other. Highest-traffic events: `praxis:settings-saved` (12
dispatches / 12 listeners), `praxis:focus-command` (12), `praxis:refresh-folders` (9),
`praxis:announce` (9), `praxis:reveal-current` (7), `praxis:open-refactor-palette` (7),
`praxis:split-editor` (5), `praxis:open-local-history` (5), `praxis:git-refresh` (5),
`praxis:find-usages` (5), `praxis:file-saved` (5), plus `praxis:goto-line`,
`praxis:term-cd`, `praxis:breakpoints-changed`, and `praxis:lsp-diagnostics` (dispatched by
`use-pyright-lsp.ts` with `{folderSlug, fileSlug, diagnostics}` in the detail). The
contract: events carry a small serializable `detail`, listeners clean up after themselves (every `addEventListener` has
a paired `removeEventListener`), and **no event handler
writes files directly** — mutations go through API routes. Menu-bar events carry a
monotonic `nonce` (`nextMenuEventNonce()`), because `FolderTree` renders two instances (desktop + mobile drawer) that
both listen — the nonce set dedupes cross-instance echoes.

### 3.4 Heavy page state goes through refs when it must not re-render

`page.tsx` holds 74 `useRef`s beside 165 `useState`s. Anything that changes faster than the
UI should paint lives in a ref: the run-sink map (`runSinksRef` — latest streamed result
per file), the code cache (`codeCacheRef` backed by `globalThis.__codeCache`, LRU-capped at
`CODE_CACHE_MAX = 240`), the mtime validation map (`codeMtimesRef`), the tab-state mirror (`tabsStateRef` — keeps the
Ctrl+Tab handler free of stale closures), navigation history (`navHistoryRef`), tab MRU order (`tabMruRef`, capped at
30), abort controllers (`runAbortControllersRef` — lets Stop break an in-flight fetch before the first SSE event).
Similarly `code-viewer.tsx` mirrors `contentRef`/`interpreterRef` fresh on every render so
imperative methods never read stale closures. Pointer-driven layout (split-gutter drags,
panel resize, sidebar resize) additionally goes through `rafThrottle`
(`src/lib/raf-batch.ts`): one state commit per animation frame, last arguments win — built
because "each direct setState re-rendered the whole page component — the classic 'IDE lags
while resizing' source". Keystroke-frequency page state (cursor position, selection,
word counts) goes through the external store in `src/lib/footer-store.ts`
(`useSyncExternalStore`, snapshots replaced only on actual change) instead of page state —
the fix for "editing is very slow like lagging".

### 3.5 The session snapshot is forward-compatible

`src/lib/workspace-session.ts` persists the workspace layout to localStorage key
`"praxis.session"` (with a one-time migration from the legacy `"praxis.session.v1"`):
open tabs, active tab, split-pane snapshot, bottom panel, split widths, dirty buffers (capped at `MAX_DIRTY = 12`,
`MAX_DIRTY_BYTES = 262,144`, 3-day TTL), terminal sessions, and
console session id. Forward compatibility rules:

- Snapshots carry `version: 1`; a **future** version is dropped wholesale rather than
  half-parsed (a new field can never crash an old client or vice versa).
- Newer *optional* fields are added through typed accessors (`readBottomPanel` / `readSplitWidths` / `withBottomPanel` /
  `withSplitWidths`) that sanitize
  ranges — bottom height 5–95, split ratio 0.1–0.9, right rail 160–800 px — and return `null`
  for old snapshots so the page keeps its defaults. A non-boolean `open` or a bogus
  `activeTab` drops the whole bottom-panel block — "half-restored UI state is worse than none".
- Saves are debounced (500 ms default; the page uses 700 ms for layout changes and 400 ms on
  dirty-buffer capture), flushed on `beforeunload`, and on a quota error the snapshot is
  retried **once without dirty buffers** (the layout survives even when buffers don't fit).

## 4. The file-operation API contract

**Every file-touching route imports shared helpers from `@/lib/scripts`** (1,442 lines).
The common shape:

- `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` — these
  routes touch `fs` and must never be statically evaluated or run on an edge runtime. (The
  two plain listing routes `/api/folders` and `/api/projects` declare neither.)
- POST + JSON body; an unparsable body is a 400 `{ "error": "Invalid JSON body." }` (the
  multipart route `/api/upload-zip` says `"Expected multipart/form-data upload."` instead).
- Success is `{ ok: true, … }`; failure is `{ error: string }` with a meaningful status code (400/404/409/413/415/500).

**Root resolution** (`getScriptsRoot()`): the active project root (module state set via
`/api/projects`, persisted atomically — temp file + `fs.rename` — to
`<defaultRoot>/.praxis/active-project.json`) → the `SCRIPTS_ROOT` env var (Docker/standalone;
plus a standalone-chdir climb-out) → the default `python_scripts/` directory. Project
switches are vetted by `projectRootRejectionReason()` + `FORBIDDEN_ROOT_NAMES` (19 reserved
names: `node_modules`, `.next`, `.git`, `.svn`, `.hg`, `public`, `src`, `.vscode`, `.idea`,
`prisma`, `db`, `mini-services`, `scripts`, `out`, `dist`, `build`, `.cache`, `.turbo`,
`.vercel`) — drive roots, the app's own directory, and dot-folders are rejected with
readable reasons.

**The sandbox guard** — every per-file route resolves paths through
`resolveScriptPath(folderSlug, fileSlug)` in `src/lib/scripts.ts`, which rebuilds the path from
deslugged names and then contains it:

```ts
// A resolved path must stay inside the scripts root, and must be a real file.
const rel = path.relative(scriptsRoot, absPath);
if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
}
```

Slugs are base64url (`slugify`/`deslugify` — lossless for any Unicode name), so raw
traversal strings never reach the path builder; `.py`-only unless `{anyKind: true}`. A
file's slug always encodes its **relative path inside the folder** (nested files included).
Sub-folder paths go through `sanitizeSubPath` (rejects `..`, `\`, leading/trailing `/`,
dot-prefixed and empty segments); renames must match
`NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-.()]{0,200}\.[A-Za-z0-9]+$/`, stay within the source
directory, and return **409** when the destination exists. `fs.rename` is used for moves (atomic on the same
filesystem). Every `file-write` (and `import-py`) captures pre-write
content and saves a local-history snapshot through the shared `saveLocalHistorySnapshot`
(best-effort, pruned to the newest 50 per file under `os.tmpdir()/praxis-local-history/`).

**Slug addressing — the two forms.** Data-file routes (`/api/data-file`, `/api/data-sheet`)
accept the preferred `folder=<slug>` + `file=<base64url slug of the file's relative path>`
form (resolves nested files; `/` allowed) OR the legacy `name=<plain filename>` form that
resolves against the **folder root only** — clients must send `file=<slug>` whenever the
listing provides one (`DataFileInfo.slug` from `/api/folders`, alongside `dir`/`path`), or
nested data files (`"Data Files/x.csv"`) 404. The Data File Browser keys its selection by the
entry's `path` (two subfolders may share a basename) and resolves "Open in editor" by slug
→ path → bare name in that order.

**Watching** is `fs.watch`, not polling: `POST /api/watch` opens an SSE stream on one file (`watching` → debounced 500
ms `changed` events → `timeout` after 5 minutes), and
`/api/watch-dir` watches a folder recursively and invalidates the 5-second folders cache on
every event.

**Archive/zip family.** `/api/folder-zip` (GET) and `/api/batch-zip` (POST) stream downloads
under `ZIP_LIMITS = { maxEntryBytes: 512 MB, maxTotalBytes: 2 GB, maxEntries: 20,000 }`;
`/api/compress` writes the zip ON DISK (never overwrites — `name (2).zip` counters);
`/api/upload-zip` imports a zip (≤ 200 MB) as a new project or into a folder; `/api/archive`
lists/extracts archives inline (≤ 512 MB) with capability-gated format support (zip always;
tar/tgz/tbz2/txz via system `tar`; single-file gz always via node:zlib; xz/bz2 via
`runStream -dc`; rar via the built-in WASM `node-unrar-js`, else `unrar`, else 7-Zip with
the RAR codec; 7z via the vendored `bin/7za` probed first). The full per-route contract
lives in [READMEs/API-FILES-FOLDERS.md](./READMEs/API-FILES-FOLDERS.md).

## 5. Quality gates (the safety net)

Three gates, run in this order by `bun run check` (and by any external pipeline you wire up):

1. **`bun run typecheck`** — `tsc --noEmit` against `strict: true` TypeScript (`noImplicitAny: false`; build-time tsc is
   skipped via
   `typescript.ignoreBuildErrors: true` because tsc + turbopack OOMs on 4 GB machines — the
   standalone typecheck is the gate).
2. **`bun run lint`** — ESLint behind `scripts/lint-with-budget.mjs`: a **warning budget
   ratchet**. The budget lives in `.lint-warning-budget` (currently **358**) and may only
   move **down**. Errors always fail; only the warning count *above* the budget fails. This
   is how the remaining pre-existing warnings (159 × `no-unused-vars`,
   88 × `react-hooks/exhaustive-deps`, 49 × `no-mixed-spaces-and-tabs`, 25 ×
   `no-useless-escape`, 13 × `prefer-const`, plus assorted) are paid down incrementally
   instead of blocking every change. (`bun run lint:raw` is the ungated escape hatch. The
   script resolves a real `node` binary because eslint under bun's compat layer dies on
   this codebase.)
3. **`bun run test`** — the Vitest suite (§6).

The same spirit governs file sizes: `max-lines` errors at 2,000 lines for every new file, with
the pre-existing monoliths grandfathered at exactly their current size (§8) — a budget may
only move down.

## 6. Testing architecture

- **Unit suite** — Vitest, `environment: "node"`, `include: ["src/**/*.test.ts"]`, alias
  `@` → `src`. jsdom is deliberately avoided: the tested modules are pure logic, and the
  few browser-facing stores mock `window` with `vi.stubGlobal`. **99 test files** (97 in
  `src/lib/__tests__/` + 2 in `src/layout/__tests__/`), **1,789 `it`/`test` declarations**,
  including a fixtures directory (`mock-langserver.mjs`, a protocol-faithful fake Pyright
  used by the LSP tests — driven by `MOCK_LOG`/`MOCK_DELAY_MS` env vars and `KILL_SERVER` /
  `PUBLISH_DIAG` / `CROSS_FILE` text markers).
- **E2E suite** — Playwright, 3 specs / 19 tests (`smoke.spec.ts` 11, `ui-surfaces.spec.ts`
  5, `round3-fixes.spec.ts` 3): app shell + folders API + health, a real Python run through
  the API, UI open/run with a zero-console-errors assertion, security headers, stdin
  rejection for unknown runs, markdown view/edit, the Show-Less clip regression, split-pane
  gutters, and untitled-draft Save As. The config is **serial, single-chromium (one worker), 120 s timeout, zero
  retries** — flakiness is fixed, not retried. The
  `webServer` boots `bun run dev` locally or `bun run start` when
  `PRAXIS_E2E_SERVER=prod` (CI runs the production build).
- **Contract tests** — `scripts/check-examples.ts` renders every one of the 3,700 embedded
  examples and pins the corpus contract (exactly 2,150 Python examples; 4 generated
  categories × 200; 14 categories × 25; every non-Python language exactly 50; duplicate
  IDs fail).

## 7. The Pyright language-server sidecar

Pyright runs as a managed sidecar process (spawned `--stdio`, single instance, crash-budgeted)
and provides cross-file F12 definition jumps, typed hovers, project-wide F2 rename with
preview, and live diagnostics. Every feature debounces on **both** sides of the wire, and
every gesture falls back to the pre-LSP text heuristics when the server is missing or dead —
the sidecar is an accelerator, never a dependency.

### 7.1 Module ownership

Ten modules, each with exactly one job: the manager (`src/lib/pyright-lsp.ts`) owns the
process, `lsp-jsonrpc` owns framing, `lsp-debounce` owns time, `lsp-mapping` owns
slugs ↔ URIs, `lsp-request` owns guards, `pyright-client` owns the fetch layer, seven thin
routes own HTTP, the hook owns React, and `editor-lsp-actions` owns the decision ladder. **Full
contract → [READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md#module-ownership).**

### 7.2 Process lifecycle

`stopped → starting → ready`, with a crash path through `failed` back to `starting`, a
3-restart budget (forgiven only after the instance has served a real request), then
`unavailable` (negative-cached 30 s). The launch ladder is `PRAXIS_PYRIGHT_PATH` →
`node_modules/pyright/langserver.index.js` → `pyright-langserver` on PATH — never `npx`, and
never a shell (`shell: false`, `windowsHide: true`). Interpreter changes perform a clean
restart with a new generation. **Full
contract → [READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md#process-lifecycle).**

### 7.3 Debouncing invariants (the two-sided contract)

Typing syncs on a 300 ms trailing edge (1,500 ms max wait), hovers on 150 ms (600 ms max
wait), diagnostics poll at 1,500 ms, the server coalesces didChange at ~120 ms — and **user
gestures (F12 / ⇧F12 / F2) are never debounced**. **Full
contract → [READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md#debouncing-invariants--the-two-sided-contract).**

### 7.4 The fallback ladder

Ask the sidecar first; if there is no answer, run the pre-LSP text heuristics (`wordAt` +
`/api/full-text-search`), with the AST-lite parser in `python-symbols.ts` as the floor that
always works offline. **Full
contract → [READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md#the-fallback-ladder).**

## 8. File-size budget ledger

Enforced by `eslint.config.mjs` (`max-lines`). Default cap: **2,000 lines** for any new
file. The pre-existing monoliths are grandfathered at exactly their line count on
2026-11-21 (Phase 2); **a budget may only move down** — extract a module, then lower the
number in the same change. `src/lib/examples-data/**` is exempt (content library, not
logic). Adding one line to a grandfathered file fails lint; new files never get an override.

| File                                    | Budget (lines)                   |
|-----------------------------------------|----------------------------------|
| `src/app/page.tsx`                      | 15,672                           |
| `src/components/folder-tree.tsx`        | 10,520                           |
| `src/components/code-viewer.tsx`        | 8,596 *(Phase 3: 8,616 → 8,596)* |
| `src/components/file-viewer.tsx`        | 7,729                            |
| `src/components/toolbox/tool-extra.tsx` | 6,660                            |
| `src/components/settings-dialog.tsx`    | 6,413                            |
| `src/components/menu-bar.tsx`           | 4,151                            |
| `src/components/output-panel.tsx`       | 3,687                            |
| `src/components/diagnostics-panel.tsx`  | 2,997                            |
| `src/components/chart-preview.tsx`      | 2,560                            |
| `src/lib/ambient.ts`                    | 2,409                            |
| `src/components/ai-chat-sidebar.tsx`    | 2,388                            |
| `src/components/notebook-view.tsx`      | 2,104                            |
| `src/components/dev-toolbox.tsx`        | 2,027                            |

The companion warning budget is `.lint-warning-budget` = **358** (baseline 368 on
2026-11-21, ratcheted 368 → 367 → 360 → 358 by the Phase 2/2b/3 extractions) — same rule:
down only. The four new React-Compiler-backed hook rules (`set-state-in-effect`, `refs`, `globals`, `immutability`) are
switched **off** pending
cleanup of 83 pre-existing patterns across 30+ files.

## 9. Where the docs live

The documentation set is part of the repo and versioned with the code. The root directory
holds only [README.md](./README.md) and this file; every detailed reference lives in
[`READMEs/`](./READMEs/):

| Document                                                                                                                                                         | Scope                                                            |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| [README.md](./README.md)                                                                                                                                         | Orientation, quick start, deployment, the documentation index    |
| [READMEs/FEATURES-OVERVIEW.md](./READMEs/FEATURES-OVERVIEW.md)                                                                                                   | Every feature, tool and menu option (the 15 menus, item by item) |
| [READMEs/README-FEATURES.md](./READMEs/README-FEATURES.md)                                                                                                       | Deep per-category feature reference                              |
| [READMEs/SHORTCUTS.md](./READMEs/SHORTCUTS.md)                                                                                                                   | Every keyboard shortcut (52 rebindable + all fixed keys)         |
| [READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md) · [READMEs/README-SETTINGS.md](./READMEs/README-SETTINGS.md)                                    | Every setting/default/option · the prose guide + catalogues      |
| [READMEs/API-CONTRACTS.md](./READMEs/API-CONTRACTS.md)                                                                                                           | All 127 API routes with methods, params, bodies, responses       |
| [READMEs/README-PROJECT-LAYOUT.md](./READMEs/README-PROJECT-LAYOUT.md)                                                                                           | The directory tree with counts                                   |
| [READMEs/CONTRIBUTING.md](./READMEs/CONTRIBUTING.md) · [READMEs/SECURITY.md](./READMEs/SECURITY.md) · [READMEs/CODE_OF_CONDUCT.md](./READMEs/CODE_OF_CONDUCT.md) | Contribution, security and conduct policies                      |
