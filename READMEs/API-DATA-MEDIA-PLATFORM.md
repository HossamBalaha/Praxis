# API Contracts — Data Workbenches, Export, Preview, Proxy, AI, Collaboration

Back to [API-CONTRACTS.md](./API-CONTRACTS.md) for the shared conventions. AI routes are
rate class **ai (40/min)**; everything else here is **other (600/min)**.

## `GET /api/data-file`

Query `folder`* (slug) + **exactly one of** `name` (legacy plain filename, folder-root
only, no `/`) or `file` (base64url slug of the relative path — the preferred nested form);
optional `download=1`.

- **download=1** → raw bytes as an attachment (per-ext content types: `.csv` →
  `text/csv; charset=utf-8`, `.tsv` → tab-separated, `.jsonl` → `application/x-ndjson`,
  parquet/feather/db/sqlite/pkl/npz/npy/xlsx/h5 → their MIME or octet-stream).
- **Text preview** (ext ∈ csv/tsv/json/jsonl/txt/md/yaml/yml/toml/py) → `{ ok, name, ext,
  size, text, truncated, contentType: "text" }` — text capped at **200,000 chars**.
- **Binary** → `{ ok, name, ext, size, contentType: "binary", mimeType, dataUrl? }` — a
  base64 `dataUrl` is included only for png/jpg/jpeg/gif/webp/svg.

Errors: 400 (missing/invalid params, a `/` inside `name`, traversal); 404.

## `GET /api/data-sheet` · `POST /api/data-sheet-write`

- **data-sheet** (tabular preview): query `folder`* + `name|file` (the two addressing
  forms), `sheet` (≤200 chars), `interpreter?`. Formats: `.xlsx`/`.xls` (pandas +
  openpyxl), `.parquet`/`.feather` (pyarrow) — a fixed Python reader (30 s) → `{ ok,
  name, ext, sheets: [...], sheet, columns, dtypes, rows, totalRows, totalCols, engine }`
  with caps **MAX_ROWS 1,000 / MAX_COLS 200** (`totalCols` is the pre-slice count so the
  grid editor can detect truncation). Errors: 400/404/500; **422** `{error, hint?,
  missing?}` where `missing` ∈ openpyxl|pyarrow|pandas feeds the one-click install card.
- **data-sheet-write** (grid save-back): body `{ folder`*, `file`* (slug ONLY), columns (1–500), rows (≤100,000, each
  row the same length as columns), interpreter? }`.
  Writable: `.csv`/`.tsv` via a direct Node text writer (RFC-4180 quoting) →
  `engine: "text"`; `.xlsx`/`.parquet`/`.feather` via a fixed Python writer (60 s). Undo
  is client-side — the grid calls `/api/local-history/save` before saving. Errors:
  400/404/500/422.

## `GET+POST /api/duckdb-query` · `GET+POST /api/sqlite-query`

- **duckdb-query** (SQL over parquet/csv/feather): GET `?folder=&file=` → schema
  inference `{ ok, table, columns: [{name, type, sample}], rowCountApprox, engine }`;
  POST `{ folder, file, sql`*, `interpreter? }` → SQL executed **verbatim** through a
  Python `duckdb` module (pip-installed binary; the table name is the sanitized file
  stem, loaders `read_parquet/read_feather/read_ipc/read_csv_auto`). The user SQL travels
  on **stdin** — never argv or a shell. Caps: 1,000 rows (`truncated`), cell strings ≤200
  chars, 60 s timeout (504). Errors: 400/404/500/504/**422** — notably `{ ok: false,
  missing: "duckdb", hint: "pip install duckdb" }`. Read-only enforcement: **none** (an
  in-memory connection; see [SECURITY.md](./SECURITY.md)).
- **sqlite-query** (the SQLite workbench): GET `?folder=&file=` (ext db/sqlite/sqlite3/
  db3) → `{ ok, tables: [{name, type, columns: [{name, type, pk}], rows, fks}],
  indexes }` (PRAGMA-driven); POST `{ folder, file, sql`*, `write?: boolean,
  interpreter? }` → SELECT → `{ ok, columns, rows, truncated, maxRows: 500 }`; writes (only when `write: true` — the
  UI-gated toggle) → `{ ok, columns: [], rows: [],
  changes }`. **Read-only by default** — the connection opens `file:<path>?mode=ro` so
  SQLite refuses writes at the C level. Timeout 15 s (504). Errors: 400/404/422/500.

## `GET /api/figure/[runId]/[figureName]`

Serves artifacts written into a run temp dir `RUN_TMP_ROOT/<runId>/` — matplotlib
figures (png/jpg/jpeg/svg/gif/webp), animations (mp4/webm), DataFrame HTML captures,
csv/json exports. Guards: `runId` matches `/^[A-Za-z0-9_-]+$/`; `figureName` has no `/`,
no `\`, no `..`; `path.relative` containment; must be a real file → 404
`"Figure not found."` otherwise. Headers: `Cache-Control: public, max-age=3600,
immutable`.

## The export family

All POST + JSON; every route resolves the source via `resolveScriptPath(anyKind)` and
blocks binary sources with **415** (`readSourceText` — binary extension or a NUL byte in
the first 8 KB). An inline `source` (the live editor buffer) wins when ≤2 MB.

| Route                      | Body                                                                           | Response                                                                                                                                                                                                                                                                  |
|----------------------------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/api/export/md`           | `{ folder`*, `file`*, `runId?, stdout?, stderr?, figures?: [names], source? }` | `{ ok, markdown, filename: "<stem>.md" }` — headings + `## Source` (fence language per ext, fence dynamically grown so embedded ``` cannot close it) + Output/stderr sections + `## Figures` with absolute `![name](<origin>/api/figure/…)` URLs                          |
| `/api/export/html`         | same                                                                           | `{ ok, html, filename }` — figures base64-embedded as data URLs (SVG is deliberately base64-inlined so attacker-controlled matplotlib SVG cannot execute `<script>` on open); a mini Python syntax highlighter (only for `.py/.pyw`); inline dark CSS; escaped everywhere |
| `/api/export/ipynb`        | `{ folder, file, runId?, stdout?, stderr?, figures?: [{url, name}], source? }` | `{ ok, notebook, filename }` — `.py` split on `# %%` / `# %% [markdown]` markers into cells; non-Python → one markdown cell; outputs attach to the last code cell (stream stdout/stderr + `display_data` image/png figures); `nbformat: 4.5`                              |
| `/api/export/folder-ipynb` | `{ folder`*, `sub? }`                                                          | `{ ok, notebook, filename }` — every `.py`/`.md` in the folder (or sub scope) as cells, with a title markdown cell                                                                                                                                                        |

The client-side capability gate is `exportCapabilitiesForKind` (`src/lib/export-events.ts`):
Python → the full set; texty kinds → md/html/txt/json/pdf/copy-md/github; binary kinds →
github only.

## `GET /api/preview` · `GET /api/preview-stream` (SSE) — the live HTML preview

- **preview**: query `folder`* + `file` (relative path) or `entry` (an alias); subpaths
  like `web/styles.css` allowed; double containment (scripts root AND folder dir). **HTML documents** get: a
  relative-asset URL rewrite pass (quoted `src` on
  script/img/video/audio/source/track + `href` on link — external/`data:`/`#` untouched;
  leading `/` = folder-root relative; resolved against the document's dir); an injected
  bootstrap script that opens `EventSource("/api/preview-stream?folder=…")`, reloads on
  `reload` events, and pipes console output + errors to the host via
  `window.parent.postMessage({source: "praxis-preview", …})`; served `text/html;
  charset=utf-8`, `no-store`. **Other extensions** → raw bytes with the MIME map,
  inline disposition. Intentional rewrite gaps (documented): unquoted attributes,
  `url(…)` in inline styles, `srcset`, `<a href>` navigation.
- **preview-stream**: query `folder`* → SSE. A poll loop every **700 ms** computes a
  recursive folder digest (`relPath:mtimeMs:size`, depth ≤8, dot-entries and
  node_modules skipped); the first tick is the baseline; a change emits one
  `{"kind":"reload"}` frame. A `: ping` comment heartbeat every **15 s**; a hard
  lifetime cap of **30 min** (the client reconnects).

## `POST /api/http-proxy` — the server-side fetch relay (security-relevant)

Body `{ url`*, `method? (default GET)`, `headers?: [...] | Record`, `body?, timeoutMs? }`.
The CORS escape for the API-client workbench. **Host policy: ANY http/https host is
allowed** (loopback and external alike; non-http(s) schemes → 400, and redirects into
them are never followed). Method whitelist GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS.
Header hygiene: CR/LF stripped (anti-smuggling), empty keys dropped, the hop-by-hop set (`host, connection, keep-alive, proxy-authenticate, proxy-authorization, te, trailer,
transfer-encoding, upgrade, content-length`) deleted case-insensitively — otherwise
outgoing headers are caller-supplied. Limits: timeout clamped 500 ms–60 s (default 15 s;
504 on abort), response body capped **2 MB** (`truncated`), **max 3 redirects** followed
manually (303 always; 301/302 after body-carrying methods → GET with the body dropped),
`credentials: "omit"` always. → `{ ok, status, statusText, headers, bodyText, truncated,
sizeBytes, timeMs, redirects, finalUrl }`. Errors 400/502/504.

## The AI family (rate class ai, 40/min; 5 MB body guard → 413)

**Shared machinery** (`src/lib/ai.ts` + `src/lib/ai-shared.ts`): the provider comes from
the request body (the client's Settings → AI selection), sanitized (`kind === "openai"`;
baseUrl ≤500 chars; apiKey ≤500; model ≤200; sampling clamped temperature 0–2/.1,
topP 0–1/.05, maxTokens 64–8192/64). **API key resolution order: the inline
`provider.apiKey` first; if empty, the server keyring** `~/.praxis/ai-keys.json` (mode
0600; the client sends an empty key when the user chose server-side storage — the key
never travels to the browser). Endpoint URLs normalize pasted bases to
`/v1/chat/completions`. `AI_REQUEST_LIMITS`: max 50 messages, 8,000 chars/message,
6,000 chars code context, 5 MB body. Errors classify as `auth | rate_limit | network |
timeout | server | bad_request` with a `retryable` flag.

| Route                    | Method     | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|--------------------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/api/ai-chat`           | POST (SSE) | Body `{ messages`*, `context?: {fileName?, code?, folder?, systemPromptOverride?}, contextFiles?: [{path, symbol?, kind?}], provider? }`. Server-side hardening: last 50 messages, each content tail-truncated to 8,000 chars, `context.code` to 6,000; client-sent `system` roles are **dropped** (the server owns the system prompt: grounding block from `contextFiles` — ≤5 distinct files, line-numbered sources ≤60,000 chars — plus the current file/folder/code and the built-in base prompt). Streaming: byte-for-byte forwarding of upstream SSE deltas with a guaranteed trailing `data: [DONE]`; upstream idle timeout 60 s; error frames `{"error", "errorType", "retryable"}`. @-mention files resolve through a 3-pass containment-guarded path match with a binary blocklist. |
| `/api/ai-completion`     | POST       | Body `{ code`*, `cursorOffset?, provider?, suffix?, language? }`. FIM-style framing (code-before-cursor tail-capped 4,000 chars, suffix 2,000); per-language system prompts (python/js/ts/r/shell/julia/matlab); **timeout 15 s**; code fences stripped from the reply → `{ ok, suggestion: string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | null }`. |
| `/api/ai-generate-tests` | POST (SSE) | Body `{ folder`*, `file`*, `provider? }`. System prompt = an expert test engineer; the user prompt carries the source capped at the first 8,000 chars; the first SSE frame carries the suggested filename (`test_<stem>.py`), then upstream deltas verbatim; the route **never writes to disk** — the client saves the final code via `/api/import-py`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/api/ai-keys`           | POST       | The server keyring CRUD: actions `list` → `{ ok, keys: [{endpoint, masked}] }`; `store {baseUrl, apiKey}` → writes `~/.praxis/ai-keys.json` (0600); `delete {baseUrl}`; `probe {baseUrl}`. The raw key is **never returned**; endpoints slug to trimmed-lowercase-no-trailing-slash (≤300 chars).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/api/ai-test`           | POST       | Connectivity test: a trivial ping/pong round trip (thinking disabled), 15 s race → `{ ok, latencyMs, model? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## `GET /api/stats` · `POST /api/collab` (SSE relay)

- **stats** `?runId=` — see [API-EXECUTION-TESTS.md](./API-EXECUTION-TESTS.md#getapistats).
- **collab** — the Collaborate menu backing. **GET** `?room=&uid=&name=&color=` opens the
  SSE stream (identity rides the query string because EventSource cannot POST; room ids
  match `^[a-z0-9-]{3,40}$`; uid ≤64, name ≤40 required, color ≤32 default `#10b981`).
  Wire frames: `{"kind":"hello","user":{...},"peers":[...]}` (the first frame — a roster
  snapshot), `join`, `leave` (announced only when the user's LAST connection drops —
  multi-tab safe), `{"kind":"presence","payload":{...}}` (cursor/selection/follow),
  `{"kind":"op","payload":{...}}` (buffer/terminal), and a `: ping` comment heartbeat
  every **15 s**. **POST** `{room, action: join|leave|presence|op, user, payload?}`
  (presence payloads: cursor `{kind, file ≤256, line, col, selection?}` / selection /
  follow; op payloads: buffer `{file ≤256, content ≤512 KB}` / terminal `{text 1–64 KB}`).
  Registry caps (on `globalThis.__praxis_collab_registry__`): **20 rooms** (LRU evicted), **12 clients per room** (the
  oldest evicted), client TTL **45 s** (3 missed
  heartbeats), empty-room TTL **10 min**. **Guest permission enforcement is NOT here** —
  it is a pure relay; the host session (which knows the permission model) decides
  whether to apply incoming peer ops (`praxis:collab-peer-buffer` /
  `praxis:collab-peer-terminal` events).
