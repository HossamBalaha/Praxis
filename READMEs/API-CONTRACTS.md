# Praxis — API Contracts Reference

The complete inventory of the **127 API routes** under `src/app/api/` (110 top-level
folders), with methods, params, bodies, responses, status codes, caps, and side effects —
all read from the route implementations. This index holds the shared conventions and the
route-group tables; each group's exhaustive per-route contract lives in its sub-file:

- [API-FILES-FOLDERS.md](./API-FILES-FOLDERS.md) — files & folders, import/zip/archive, projects & project settings (46
  routes)
- [API-EXECUTION-TESTS.md](./API-EXECUTION-TESTS.md) — execution, console, debug, profiling, tests, terminal, tasks (22
  routes)
- [API-CODE-INTELLIGENCE.md](./API-CODE-INTELLIGENCE.md) — lint, typecheck, format, AST/disasm, refactor, spell,
  symbols, search, snippets/notes/todos (24 routes)
- [API-GIT-PROJECTS-ENV.md](./API-GIT-PROJECTS-ENV.md) — git, interpreters/environments, pip, env-sync, projects,
  backup, local history (24 routes)
- [API-DATA-MEDIA-PLATFORM.md](./API-DATA-MEDIA-PLATFORM.md) — data files/sheets, SQL workbenches, figures, export,
  preview, http-proxy, media, AI, collab, stats (11 routes + the rest)

## Conventions (read this first)

- **Runtime.** Every route that touches disk or spawns processes exports
  `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` — never
  statically evaluated, never edge. (Plain listing routes `/api/folders` and `/api/projects`
  declare neither.)
- **Bodies.** POST + JSON; an unparsable body is a 400 `{ "error": "Invalid JSON body." }`
  (multipart routes say so explicitly). Success is `{ ok: true, … }`; failure is
  `{ error: string }` or `{ ok: false, error }` with a meaningful status (400/404/409/410/
  413/415/422/501/502/503/504/500).
- **Slug addressing.** `folder` and `file` params are **base64url slugs**
  (`slugify`/`deslugify` in `src/lib/scripts.ts`) of relative paths — a file slug encodes
  its path *inside* the folder, so nested files ride the same machinery. Every per-file
  route resolves through `resolveScriptPath(folderSlug, fileSlug, {anyKind?})` (deslug →
  join under the scripts root → `path.relative` traversal guard → must be a real file;
  `.py`-only unless `anyKind`). The **data-file family** additionally accepts the legacy
  `name=<plain filename>` form (folder-root only) — always send `file=<slug>` when the
  listing provides one.
- **Root resolution.** `getScriptsRoot()` = the active project root (module state, persisted
  atomically to `<defaultRoot>/.praxis/active-project.json`) → the `SCRIPTS_ROOT` env var (Docker/standalone) → the
  default `python_scripts/` directory.
- **Auth (opt-in) + rate limiting.** `src/proxy.ts` matches `/api/:path*`:
  `PRAXIS_ACCESS_TOKEN` set → every route needs `Authorization: Bearer <token>`
  (401 `{error, tokenRequired: true}` + `WWW-Authenticate: Bearer`); `/api/health` is the
  only exempt path. Rate classes (in-memory sliding 60 s window, per client IP):
  **exec 60/min** (`/api/run*`, `/api/console*`, `/api/term*`, `/api/debug`,
  `/api/profile*`, `/api/test*`, `/api/stop`, `/api/watch*`), **ai 40/min** (`/api/ai-*`), **other 600/min** (everything
  else). Env overrides `PRAXIS_RATE_LIMIT_EXEC/_AI/_OTHER`
  (0 disables). Breach → 429 `{error, rateLimited: true}` + `Retry-After`.
- **Spawns.** Every child process is argv-array only (no shell strings), `stdio` pipes,
  SIGKILL on timeout; Windows `.cmd` shims retried via `%ComSpec%`. Fixed Python snippets
  run through `runPyOnce` (`src/lib/py-exec.ts`, default 30 s, `PYTHONIOENCODING=utf-8`).
- **SSE.** Streaming routes return `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`,
  and emit `data: {json}\n\n` frames.
- **Caches** live on `globalThis` (HMR-safe): folders 5 s TTL; `/api/code` 50 files (mtime+size keyed); lint 50 files;
  git diff 50; runtime statuses 60 s; interpreter
  process-lifetime.

## Key routes at a glance

| Route          | Method     | One-line contract                                                                                                                                                                                                                            | Full                                           |
|----------------|------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `/api/run`     | POST (SSE) | Run a script with the Python prelude (figures, DataFrames, variables, coverage, tests) or any of the 30 non-Python runtimes; `start`/`stdout`/`stderr`/`figure`/`dataframe`/`end` events; 60 s default timeout (≤600), 2 MB/stream (≤16 MB). | [→](./API-EXECUTION-TESTS.md#postrun-sse)      |
| `/api/file`    | GET        | Raw bytes of any file in the project (per-ext MIME, inline disposition, media cache headers).                                                                                                                                                | [→](./API-FILES-FOLDERS.md#getapifile)         |
| `/api/archive` | POST       | `action: list \| extract \| capabilities` over zip/tar/gz/xz/bz2/rar/7z archives; ≤512 MB inline; 500-entry listings; capability-gated.                                                                                                      | [→](./API-FILES-FOLDERS.md#apiarchive)         |
| `/api/health`  | GET        | `{ok, scriptsRootReadable, uptimeSec}` — token-exempt.                                                                                                                                                                                       | [→](./API-EXECUTION-TESTS.md#getapihealth)     |
| `/api/folders` | GET        | The whole project tree (folders, files, dirs, tags, dataFiles).                                                                                                                                                                              | [→](./API-FILES-FOLDERS.md#getapifolders)      |
| `/api/lsp/*`   | POST/GET   | The Pyright sidecar surface (document/hover/definition/references/rename/diagnostics/status).                                                                                                                                                | [→](./ARCHITECTURE-PYRIGHT-LSP.md#route-table) |

## Complete route inventory by group

Counts as implemented (127 `route.ts` files):

**Files & folders (46)** — [API-FILES-FOLDERS.md](./API-FILES-FOLDERS.md):
`GET /api/file` · `GET /api/code` · `POST /api/file-create` · `POST /api/file-write` ·
`POST /api/file-delete` · `POST /api/file-rename` · `POST /api/file-duplicate` ·
`POST /api/file-copy` · `POST /api/file-move` · `POST /api/file-stats` ·
`POST /api/files-import` · `GET /api/folders` · `POST /api/folder-create` ·
`POST /api/folder-delete` · `POST /api/folder-rename` · `POST /api/folder-move` ·
`POST /api/folder-stats` · `POST /api/folder-compare` · `POST /api/folder-lint` ·
`GET /api/folder-list` · `GET /api/folder-zip` · `POST /api/batch-zip` ·
`POST /api/compress` · `POST /api/archive` · `POST /api/upload-zip` · `GET /api/download` ·
`POST /api/github-import` · `POST /api/import-ipynb` · `POST /api/import-py` ·
`GET /api/resolve-path` · `POST /api/open-folder` ·
local-history: `GET list` · `POST save` · `GET restore` · `GET diff` ·
projects: `GET/POST /api/projects` · `POST /api/projects/create` ·
`GET/POST/DELETE /api/project-settings` · `GET/POST/DELETE /api/project-appearance` ·
`GET/POST /api/project-backup`.

**Execution & tests (22)** — [API-EXECUTION-TESTS.md](./API-EXECUTION-TESTS.md):
`POST /api/run` (SSE) · `GET /api/run/queue` · `POST /api/run-all` (SSE) ·
`POST /api/run-input` · `POST /api/stop` · `POST /api/console` (+`exec` SSE) ·
`POST /api/console/variable` · `POST /api/debug` (SSE + JSON) · `POST /api/time-travel` ·
`POST /api/profile` · `POST /api/line-profile` · `POST /api/hypothesis-run` ·
`POST /api/test` · `POST /api/test/collect` · `POST /api/watch` (SSE) ·
`POST /api/watch-dir` (SSE) · `POST /api/term` (+`exec` SSE) · `GET /api/term/stream` (SSE) ·
`GET+POST /api/tasks` (run via SSE) · `POST /api/agent-plan` · `GET /api/health` ·
`GET /api/stats`. *(There is no `/api/estimate-runtime` route — run-duration estimation is
the client-side `src/lib/estimate-runtime.ts` library.)*

**Code intelligence (24)** — [API-CODE-INTELLIGENCE.md](./API-CODE-INTELLIGENCE.md):
`POST /api/lint` · `POST /api/folder-lint` (grouped with files above for placement, listed
here for topic) · `POST /api/typecheck` · `POST /api/format` · `POST /api/fix-all` ·
`GET /api/ast` · `GET /api/disasm` · `GET /api/rename-preview` · `POST /api/refactor` ·
`GET+POST /api/spell` · `GET /api/docstring-coverage` · `GET /api/full-text-search` ·
`GET /api/project-symbols` · `GET/POST/DELETE /api/snippets` · `GET /api/templates` ·
`GET/POST /api/notes` · `GET /api/todos` · `POST /api/validate-config` ·
`GET+PATCH /api/bytes` · `POST /api/convert` · `POST /api/audit` ·
`GET /api/lsp/document|hover|definition|references|rename|diagnostics|status` (7 — full
contract in [ARCHITECTURE-PYRIGHT-LSP.md](./ARCHITECTURE-PYRIGHT-LSP.md#route-table)).

**Git, environments & project services (24)** — [API-GIT-PROJECTS-ENV.md](./API-GIT-PROJECTS-ENV.md):
`GET /api/git-status` · `GET /api/git-log` · `POST /api/git-commit` ·
`POST /api/git-branch` · `GET /api/git-diff` · `GET /api/git-diff-content` ·
`POST /api/git-blame` · `POST /api/git-command` · `GET /api/envs` ·
`POST /api/create-venv` · `GET+POST /api/env-sync` · `POST /api/install-deps` (SSE) ·
`POST /api/pip-install` · `GET+POST /api/pip-list` · `GET /api/python-check` ·
`GET /api/runtime-check` · `POST /api/screenshot-save` · `GET /api/pdf-info` ·
`POST /api/media-trim` · `GET /api/figure/[runId]/[figureName]` ·
`POST /api/preview` + `GET /api/preview-stream` (SSE) · `POST /api/http-proxy` ·
`POST /api/collab` (SSE relay) — plus the project routes already listed under Files & folders.

**Data & AI (11 + exports)** — [API-DATA-MEDIA-PLATFORM.md](./API-DATA-MEDIA-PLATFORM.md):
`GET /api/data-file` · `GET /api/data-sheet` · `POST /api/data-sheet-write` ·
`GET+POST /api/duckdb-query` · `GET+POST /api/sqlite-query` · `POST /api/export/md` ·
`POST /api/export/html` · `POST /api/export/ipynb` · `POST /api/export/folder-ipynb` ·
`POST /api/ai-chat` (SSE) · `POST /api/ai-completion` · `POST /api/ai-generate-tests`
(SSE) · `POST /api/ai-keys` · `POST /api/ai-test` · `GET /api/stats` · `POST /api/collab` ·
`POST /api/compress` · `POST /api/media-trim` · `POST /api/screenshot-save` ·
`GET /api/pdf-info`.
