# Architecture — The Pyright Language-Server Sidecar

Pyright runs as a managed sidecar process (spawned `--stdio`, single instance,
crash-budgeted) and provides cross-file F12 definition jumps, typed hovers, project-wide
F2 rename with preview, and live diagnostics. Every feature debounces on BOTH sides of
the wire, and every gesture falls back to the pre-LSP text heuristics when the server is
missing or dead — the sidecar is an accelerator, never a dependency. This document is the
full contract; the summary lives in [ARCHITECTURE.md](../ARCHITECTURE.md) §7.

---

## Module ownership

Ten modules, each with exactly one job:

| Module                              | Owns                                                                                                                                                                                                  | Key exports                                                                                                                                                                                                                                                        |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/lib/pyright-lsp.ts`            | The server-side **process manager**: spawn, JSON-RPC correlation, the lifecycle state machine, the crash budget, document sync, the diagnostics cache, the `globalThis.__praxisPyrightLsp` singleton. | `class PyrightLspManager` (`getStatus`, `resolveLaunch`, `ensure`, `stop`, `syncDocument`, `closeDocument`, `clearDocuments`, `hover/definition/references/prepareRename/rename`, `getDiagnostics`), `getPyrightLspManager()`, `resetPyrightLspManagerForTests()`. |
| `src/lib/lsp-jsonrpc.ts`            | Pure byte-level JSON-RPC **framing** over stdio (`Content-Length` headers) with resync and tolerant parsing.                                                                                          | `encodeLspMessage(payload)`, `class LspMessageDecoder`, `MAX_LSP_BODY_BYTES = 32 MiB`, `MAX_LSP_HEADER_BYTES = 16 KiB`.                                                                                                                                            |
| `src/lib/lsp-debounce.ts`           | The pure **time** primitive: trailing-edge + max-wait-capped debounce with 5 invariants and an injectable clock.                                                                                      | `createLspDebouncer<T>({delayMs, maxWaitMs, onFlush, clock?})` → `{push, pending, flush, cancel}`.                                                                                                                                                                 |
| `src/lib/lsp-mapping.ts`            | Pure **translators**: LSP 0-based ↔ Praxis 1-based positions, `file://` URI → folder/file, raw LSP results → UI row shapes.                                                                           | `toOneBasedLine`, `toOneBasedCol`, `uriToAbsolutePath`, `locateScriptPath`, `mapHover`, `mapDefinition`, `mapReferenceLocations`, `mapDiagnostics`, `mapPrepareRename`, `mapRenameEdits`, `applyExactRenames`, `severityFromLsp`.                                  |
| `src/lib/lsp-request.ts`            | Shared **request-body parsing** + traversal-guarded file resolution for every `/api/lsp/*` route, plus a bounded line-snippet reader.                                                                 | `resolveLspDocument(body)`, `readLineSnippet(absPath, line)` (files > 2 MB skipped, snippets trimmed to 200 chars), `joinScriptPath`.                                                                                                                              |
| `src/lib/pyright-client.ts`         | The browser **fetch + shape-validation layer** for `/api/lsp/*` — never throws; corrupt rows collapse to fallback values.                                                                             | `postLspDocument`, `fetchLspHover`, `fetchLspDefinition`, `fetchLspReferences`, `fetchLspRenamePrepare`, `fetchLspRenameApply`, `fetchLspDiagnostics`, `fetchLspStatus`, `mergeLspDiagnostics`.                                                                    |
| `src/hooks/use-pyright-lsp.ts`      | **React**: document sync, debounced hover, the diagnostics poll, immediate F12/⇧F12/F2, the availability latch.                                                                                       | `usePyrightLsp(options): PyrightLspSession`.                                                                                                                                                                                                                       |
| `src/lib/editor-lsp-actions.ts`     | The **decision ladder** for F12 / ⇧F12 gestures (kept out of the 8.6k-line code-viewer; unit-testable; no React/DOM).                                                                                 | `gotoDefinitionViaLsp`, `referencesViaLsp`.                                                                                                                                                                                                                        |
| `src/lib/python-symbols.ts`         | The no-sidecar **symbol fallback**: the AST-lite regex parser.                                                                                                                                        | `parsePythonSymbols`, `formatSymbol`.                                                                                                                                                                                                                              |
| 7 thin routes (`src/app/api/lsp/*`) | **HTTP**: one route per LSP surface, nothing else.                                                                                                                                                    | See the route table below.                                                                                                                                                                                                                                         |

### Route table

All routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, validation via
`resolveLspDocument` (400 + `{ok: false, error}` on malformed input). A missing pyright is
a feature downgrade, never an error — `unavailable` answers HTTP **200** with
`available: false`.

| Route                  | Method | Request (exact fields)                                                                                                                       | Response (exact fields)                                                                                                                                                                                                                                         |
|------------------------|--------|----------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/api/lsp/document`    | POST   | `folder`, `file`, `content?`, `close?`, `interpreter?`                                                                                       | `{ ok, available, state, reason, generation, serverVersion }`                                                                                                                                                                                                   |
| `/api/lsp/hover`       | POST   | `folder`, `file`, `content`, `line` (1-based), `col` (1-based), `interpreter?`                                                               | `{ ok, available, hover: { title, body? } \| null }`                                                                                                                                                                                                            |
| `/api/lsp/definition`  | POST   | `folder`, `file`, `content`, `line`, `col`, `interpreter?`                                                                                   | `{ ok, available, targets: [{ folderName, fileName, folderSlug, fileSlug, line, col }], externalCount }`                                                                                                                                                        |
| `/api/lsp/references`  | POST   | `folder`, `file`, `content`, `line`, `col`, `interpreter?`                                                                                   | `{ ok, available, hits: [{ folder, folderSlug, file, fileSlug, line, snippet }] }` (same shape as `/api/full-text-search`)                                                                                                                                      |
| `/api/lsp/rename`      | POST   | Phase 1: `folder`, `file`, `content`, `line`, `col`, `interpreter?`. Phase 2 adds `mode: "apply"`, `newName` (`/^[A-Za-z_][A-Za-z0-9_]*$/`). | Phase 1: `{ ok, available, supported, placeholder?, line?, col?, endCol? }`. Phase 2: `{ ok, available, supported, source: "pyright", name, files, totalOccurrences }` with per-file `occurrences: [{ line, col, endCol, snippet, context: "code", defSite }]`. |
| `/api/lsp/diagnostics` | GET    | query `folder`, `file`                                                                                                                       | `{ ok, available, diagnostics: [{ line, col?, severity, message }], version }` — reads the manager's cache only, never spawns.                                                                                                                                  |
| `/api/lsp/status`      | GET    | none                                                                                                                                         | `{ ok, state, ready, available, reason, serverVersion, pythonPath, generation, restarts, startedAt, processAlive }` — pure snapshot, never spawns.                                                                                                              |

---

## Process lifecycle

States: `stopped → starting → ready`, with a crash path through `failed` back to
`starting`, and a terminal `unavailable`:

1. `stopped → starting` when `ensure()` begins a spawn; `starting → ready` on a successful
   `initialize` handshake (generation += 1, `startedAt` stamped).
2. `ready → failed` on a child exit while `restarts < DEFAULT_MAX_AUTO_RESTARTS (3)`;
   `failed → starting` on the next `ensure()` after the backoff window (`DEFAULT_BACKOFF_MS = 2_000`).
3. Any state → `unavailable` when `restarts >= 3` ("gave up after N crashes"),
   negative-cached for `DEFAULT_NEGATIVE_PROBE_TTL_MS = 30_000` (30 s). Launch-resolution
   failure or a spawn error takes the same path.
4. `stop(reason)` (shutdown, interpreter change) → `stopped`, clearing documents,
   diagnostics, `serverVersion`, `pythonPath`.

The crash budget is **forgiven only when the instance has served a real feature request**:
`servedSinceStart` is set after a resolved hover/definition/references/prepareRename/
rename; a crash after serving resets `restarts = 1` (a fresh incident), a crash before
serving accumulates. A successful handshake alone does NOT reset the budget.

**The launch ladder** (`resolveLaunch()`, exact order):

1. The `PRAXIS_PYRIGHT_PATH` env var — a `.js/.cjs/.mjs` path runs through
   `process.execPath` (works on Windows where `.cmd` shims would need a shell); otherwise
   an X_OK-probed direct executable.
2. `<projectRoot>/node_modules/pyright/langserver.index.js` — what `bun add -d pyright`
   installs.
3. Bare `pyright-langserver` on `PATH` (POSIX only, probed per PATH dir with
   `fs.accessSync(X_OK)`).

**Never `npx`** — npx's cold-start latency and network behaviour make it unusable for a
keystroke-latency-sensitive sidecar. The spawn is always
`spawn(command, [...args, "--stdio"], { stdio: ["pipe","pipe","pipe"], windowsHide: true,
shell: false })` — no shell anywhere, so no injection and no `.cmd` parsing.

**Interpreter changes** perform a clean restart: when the requested path differs from the
running `pythonPath`, `ensure()` stops the process ("interpreter changed") and restarts
against the new path; `generation` increments on each successful start so clients detect
the restart and re-sync. The `initialize` handshake carries
`initializationOptions.python.pythonPath`, so pyright resolves types against that
interpreter.

**Orphan prevention:** the initialize params carry `processId: process.pid` (pyright
self-terminates if the Praxis server dies); static once-per-process hooks on
`exit`/`SIGINT`/`SIGTERM` SIGKILL the singleton child. A clean `stop()` sends `shutdown`
with a 1,500 ms budget, an `exit` notification, waits a 400 ms grace, then SIGKILL (idempotent). The manager is pinned
on `globalThis.__praxisPyrightLsp` — HMR-proof.

The JSON-RPC details: `Content-Length: <utf-8 body bytes>\r\n\r\n` framing (body byte
count, not char count); the decoder is incremental over raw Buffers with
resync-to-next-header for wrapper noise, an oversized-header drop (16 KiB), a body cap (32 MiB), and tolerant
`JSON.parse` that reports faults without wedging. The initialize
params are `{ processId, clientInfo: { name: "praxis" }, capabilities: {}, rootUri: null,
initializationOptions: { python: { pythonPath } } }` — no client capabilities are
advertised; `workspace/configuration` server requests are answered with one benign `{}`
per item; `textDocument/publishDiagnostics` is cached per-URI with a monotonic version
bump. The initialize handshake times out at `DEFAULT_INIT_TIMEOUT_MS = 15_000`; each
request at `DEFAULT_REQUEST_TIMEOUT_MS = 5_000` — and a timeout NEVER kills the server:
the pending entry is deleted so a late response is dropped by unknown id.

---

## Debouncing invariants — the two-sided contract

| Surface                         | Value                                                                           | Constant                                                 |
|---------------------------------|---------------------------------------------------------------------------------|----------------------------------------------------------|
| Typing sync — trailing edge     | **300 ms**                                                                      | `DOCUMENT_SYNC_DELAY_MS` (client hook)                   |
| Typing sync — max wait ceiling  | **1500 ms**                                                                     | `DOCUMENT_SYNC_MAX_WAIT_MS`                              |
| Hover debounce                  | **150 ms**                                                                      | `HOVER_DELAY_MS`                                         |
| Hover max wait                  | **600 ms**                                                                      | `HOVER_MAX_WAIT_MS`                                      |
| Hover stale-response drop       | a sequence number — a response whose `seq !== hoverSeqRef.current` is discarded | (not a timer)                                            |
| Diagnostics poll interval       | **1500 ms**, only while `status === "ready"`                                    | `DIAGNOSTICS_POLL_MS`                                    |
| Server-side didChange coalesce  | **120 ms**                                                                      | `DEFAULT_COALESCE_MS` (manager)                          |
| Live ruff re-lint (edit buffer) | **700 ms**                                                                      | `LIVE_LINT_DEBOUNCE_MS` (`use-live-lint-diagnostics.ts`) |

**User gestures (F12 / ⇧F12 / F2) are NEVER debounced** — they are immediate,
user-initiated calls (`definitionAt`, `referencesAt`, `renamePrepareAt`, `renameApplyAt`),
and any request touching a document force-flushes the pending server-side coalesced change
first (`immediate: true` sync inside `withCurrentDocument`).

The composed effective typing rate: ≤ ~4 posts/second client-side, collapsed to one
`didChange` per 120 ms server-side. The `lsp-debounce` primitive itself guarantees five
invariants: (1) trailing edge, latest-wins, fires once; (2) flush within `maxWaitMs` of the
window's opening push; (3) at most one scheduled timer; (4) `cancel()` drops payload and
timer so the callback never fires; (5) `flush()` fires immediately.

---

## The fallback ladder

Ask the sidecar first; if there is no answer, run the pre-LSP text heuristics, with the
AST-lite parser as the floor that always works offline:

1. **Sidecar (LSP-first)** — `gotoDefinitionViaLsp` / `referencesViaLsp` in
   `src/lib/editor-lsp-actions.ts` require (a) a session (the `availableRef` latch true)
   and (b) a position `{line ≥ 1, col ≥ 1}`, then ask the sidecar immediately. In-project
   targets jump (first target for F12); external-only targets toast "definition is in
   `<package>`"; semantic hits open the peek-references popup (same `ReferenceHit` shape
   as text search).
2. **Pre-LSP text heuristics** — on no session / no position / `available: false` / an
   empty answer, the functions return `false`/`null` and the caller runs its fallback:
   `wordAt` + `/api/full-text-search` feeding the same popup / Find Usages dialog. If the
   sidecar answered "no definition found", the heuristic still gets a chance (dynamic
   patterns pyright cannot resolve).
3. **`python-symbols.ts` AST-lite parser** — the regex `def`/`async def`/`class`/block
   parser powering the symbol outline, folding, and hover fallback whenever the sidecar is
   unavailable. Works fully offline.

The client hook's behavior on top: on mount/file-open it pushes
`{folder, file, content, interpreter}` into the 300 ms doc-sync debouncer; on file switch
it fire-and-forgets a `didClose` for the previous document; on unmount the same for the
current one. Every fresh diagnostics batch is relayed to the app as
`window.dispatchEvent(new CustomEvent("praxis:lsp-diagnostics", { detail: { folderSlug,
fileSlug, diagnostics } }))` for the Problems panel; the poll skips `version === 0` with
zero rows and re-renders only on a version change. The first sync answering
`available: false` latches the hook to `"unavailable"` (hover flush becomes a no-op); the
latch resets when the interpreter changes — a changed interpreter legitimizes a retry.

Security posture: `resolveLspDocument` runs every request through
`resolveScriptPath(folderSlug, fileSlug)` from `@/lib/scripts` (deslugged, `.py`-only,
`path.relative` containment, `fs.stat` isFile) — a crafted slug cannot escape the scripts
root through the LSP routes any more than through `/api/code`. `locateScriptPath`
re-applies the same guard to server→client URIs (external results are counted or dropped,
never navigated). Body caps: 32 MiB wire messages, 16 KiB headers, 2 MB snippets. The
stderr tail is bounded at 4,096 chars. Every route 400s on non-JSON bodies, missing slugs,
`line/col < 1`, missing content, or an invalid `newName` identifier — verbatim error
strings.

Test coverage (`src/lib/__tests__/`): `pyright-lsp.test.ts` (launch resolution incl. env
precedence, handshake, didChange coalescing, diagnostics caching, request timeouts without
a server kill, crash backoff/budget/give-up, interpreter restart + generation bump,
shutdown, singleton), `lsp-jsonrpc.test.ts`, `lsp-debounce.test.ts`, `lsp-mapping.test.ts`,
`pyright-client.test.ts`, `editor-lsp-actions.test.ts`, `python-symbols.test.ts`, plus the
protocol-faithful mock server `fixtures/mock-langserver.mjs` — a Content-Length-framed
Node script driven by `MOCK_LOG`/`MOCK_DELAY_MS` env vars and text markers (`KILL_SERVER`, `PUBLISH_DIAG`, `CROSS_FILE`,
`mock_symbol`), so the whole lifecycle is
proven in CI without pyright.
