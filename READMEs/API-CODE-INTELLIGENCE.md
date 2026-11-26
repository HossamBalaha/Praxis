# API Contracts — Code Intelligence

Back to [API-CONTRACTS.md](./API-CONTRACTS.md) for the shared conventions. Rate class **other (600/min)** for everything
here. The 7 `/api/lsp/*` routes are documented in
[ARCHITECTURE-PYRIGHT-LSP.md](./ARCHITECTURE-PYRIGHT-LSP.md#route-table).

## `POST /api/lint`

Body `{ folder`* (slug)`, file`* (slug)`, interpreter?, content? }`. Lint one Python file (ruff preferred, pyflakes
fallback) — or, with `content`, the **unsaved buffer** (piped
to `ruff check --stdin-filename <absPath> ... -`; pyflakes has no stdin mode → empty
result).

Invocation chain (first success wins): standalone `ruff check
--output-format=concise --no-cache <absPath>` (binary probed once per process) →
`<interpreter> -m ruff check ...` → `<interpreter> -m pyflakes <absPath>` (only when
stderr says "No module named ruff"). Timeout 30 s. Concise lines parse to
`{line, col, code, message}` (fixable `[*]` prefixes stripped; pyflakes rows get
`code: "PYF"`; **no severity field** — clients apply the `/^(E9|F7|F8)/` heuristic).
Cache: `globalThis.__lintCache`, 50 files, mtime+size validated, disk mode only.
Response: `{ ok, linter: ruff|pyflakes|none, diagnostics, raw }`; `linter: "none"`
adds `hint: "Install ruff (pip install ruff) for linting."`. 400/404 as usual.

## `POST /api/typecheck`

Body `{ folder`*, `file`*, `interpreter?, profile?: loose|standard|strict (default
standard), columns?: boolean (default true), inlays?: boolean (default false), daemon?:
boolean (default false) }`. Runs mypy: base flags `--no-error-summary
--no-color-output` (+ `--show-column-numbers` when `columns`); loose adds
`--ignore-missing-imports`, strict adds `--strict`; `daemon` tries
`mypy.dmypy run` first and silently falls back to plain `mypy`. Timeout 120 s. Response
`{ ok, diagnostics: [{line, col, severity: error|warning|note, message}], raw, profile,
daemon, inlays?: [{line, col, endCol?, label, kind: type|return}], symbolTypes?:
[{name, line, type}] }` — inlays parse `Revealed type is "..."` notes. mypy missing → 200
with empty diagnostics + `hint: "Install mypy (pip install mypy) for type checking."`.

## `POST /api/format`

Body `{ folder, file, content?, interpreter?, settings? (the FormatPostSettings block,
merged over defaults), mode?: "organize", organizeImports? }`. Three Python modes:
notebook-cell (`content`, no slugs — ruff/black on stdin), in-memory (`content` +
slugs — `ruff format --stdin-filename <absPath> -` so pyproject resolves, else black
stdin, else the built-in), disk (in-place `ruff format`, read-back, post-processors,
write-back). **Organize-imports mode** (Python only): `ruff check --select I --fix
[--stdin-filename <f>]` — ruff absent → **503**; output verbatim, no post-passes.

Non-Python kinds dispatch to the real binaries first (`formatterToolForKind`):
**go → gofmt; ruby → rubocop; javascript/typescript/json/css/html/markdown/yaml →
prettier** (probed 60 s TTL, 4 s probe timeout, 30 s format timeout; Windows `.cmd`
retried via `%ComSpec%`; source over stdin), falling back to the built-in offline
engine `formatAnySource` (the same 37 kinds). Unknown kind → 400. Response:
`{ ok, formatted, content (mirror), changed, formatter: ruff|black|builtin|gofmt|
rubocop|prettier|<bin>, fallback? }`; every successful path runs
`applyFormatPostProcessors` with the traveling settings (quote style, trim, collapse,
line endings, per-language options). Disk mode rewrites the file in place.

## `POST /api/fix-all`

Body `{ folder`*, `file`*, `interpreter? }`. Two `<interpreter> -m ruff check` passes —
before-count, then `check --fix --unsafe-fixes` (rewrites the file on disk) — → `{ ok,
fixed: <before − remaining>, remaining: Diagnostic[] }`. ruff absent → 200
`{ ok: false, error: "ruff not installed" }`. Timeout 30 s.

## `GET /api/ast` · `GET /api/disasm`

- **ast**: query `folder`*, `file`*, `code?` (buffer ≤1 MB, staged to a temp file — never
  inline argv), `interpreter?`. Runs a fixed Python snippet (`ast.parse` + end
  positions, Python 3.8+) → `{ ok, fileName, nodes: AstNode[], truncated }` where
  `AstNode = {kind, label, line, col, endLine, endCol, depth, attrs, children}`. Caps:
  20,000 nodes, 1 MB code, 10 MB output, 60 s. Parse errors return HTTP 200
  `{ ok: false, error }` (rendered inline); 400/404/500/504 otherwise.
- **disasm**: query `folder`*, `file`*, `symbol?` (disassemble only that function's code
  object), `code?`, `compareCode?` (a second source → a bytecode diff), `interpreter?`.
  `compile` + `dis.get_instructions` → `{ ok, fileName, source: [{line, text}],
  bytecode: [{offset, line, opname, arg}], diff?: [{offset, opname, arg, changed,
  before?}], truncated? }`. Caps: 1 MB per source, 10 MB output, 5,000 bytecode rows,
  20,000 source rows, 60 s.

## `GET /api/rename-preview` · `POST /api/refactor`

- **rename-preview**: query `name`* (`/^[A-Za-z_][A-Za-z0-9_]*$/`). A server-side
  whole-project scan using the SAME pure matcher as the client apply (`findSymbolOccurrences`, whole-word,
  comment/string/def-site classification) — so the
  preview equals the apply set. Caps: 400 files, 400 occurrences/file (`truncated`),
  2 MB/file. → `{ ok, name, files: [{folder, folderSlug, file, fileSlug, path, isPython,
  occurrences: [{line, col, start, end, snippet, context, defSite}]}], totalOccurrences,
  truncated }`.
- **refactor**: body `{ folder`*, `file`*, `code?` (≤1 MB), `transform`*, `params?
  (JSON ≤64 KB)`, interpreter? }`. The palette (from `src/lib/refactor-ops.ts`):
  `organize_imports` · `inline_variable` (needsSymbol) · `inline_function` (needsSymbol)
  · `move_symbol` (needsSymbol+needsTarget) · `change_signature` (needsArgs) ·
  `loop_to_comprehension` · `comprehension_to_loop` · `convert_loop` (alias). Params:
  `{ name?, line? (1-based, nearest match), target?, newArgs?: [{name, default?}],
  importsStyle? }`. A fixed Python engine (stdlib `ast` + `ast.unparse`, Python 3.9+)
  rewrites the source; output is compile-guarded. → success `{ ok, code, edits:
  [{description}], newFiles?: [{path, content}] }` (move_symbol's new module + rewritten
  siblings); failure `{ ok: false, error }` (HTTP 200 for unknown transform / safety
  refusals). No disk writes — the client applies the returned code. 400/404/500/504.

## `GET+POST /api/spell`

- **GET** → `{ ok, ignored: [{word, addedAt}], dicts: [...] }` (the `public/dict/*.txt`
  basenames: english, spanish, french, german, italian, portuguese, russian).
- **POST actions**:
    - `check` — body `{ text`* (≤300,000 chars, else 413)`, kind?: "markdown" (strips
    fenced/inline code, URLs, link targets, `$…$` math), dict?: "auto"|explicit,
    hint?: file-language hint }` → `{ ok, dict, misspelled: [{word, line, col}],
    ignoredCount }`. Auto-detection is a stopword fingerprint (~30 words/language with
      fractional weights); Cyrillic-majority → Russian; ambiguous → English.
    - `suggest` — `{ word, limit? (1–8, default 3), dict? }` → `{ ok, dict, suggestions }`
      (bounded Levenshtein ≤2, distance-1 tier first).
    - `ignore` / `remove` / `clear` — the project dictionary CRUD at
      `<scriptsRoot>/.praxis/spell-ignore.json` (legacy bare arrays read with
      `addedAt: null`; every POST restores the active-project pointer first).
- Tokenizer: letter runs + internal apostrophes; skips digit-bearing tokens,
  MixedCase/camelCase, ALL-CAPS ≤5 chars; handles possessives and elisions (`l'homme`).

## `GET /api/docstring-coverage`

Query `folder`* (slug), `interpreter?`. One Python invocation (60 s) walking every `.py`
recursively (dot-dirs/node_modules/`__pycache__` pruned): "documented" = a public
function/method/class (no leading `_`; dunders and lambdas skipped) with a non-empty
docstring. Caps: 500 files, 500 missing. → `{ ok, files: [{file, total, documented, pct,
missing: [{name, kind, line}], error?}], overall: {total, documented, pct} }`.

## `GET /api/full-text-search` · `GET /api/project-symbols`

- **full-text-search**: query `q`* (lowercased), `limit?` (default 50, clamp 1–100),
  `folder?` (slug scope), `sub?` (sanitized). Case-insensitive substring match over
  every text file; nested files resolve through the path-encoded slug. Hit shape (the
  `ReferenceHit` shared with the LSP): `{ folder, folderSlug, file, fileSlug, line,
  snippet }` (2–3 lines of context) → `{ query, hits, folderScope?, subScope? }`.
- **project-symbols**: query `query?` (default ""), `limit?` (default 120, clamp 1–300).
  Walks every folder, reads each file fresh (≤1 MB), parses with the regex
  `parsePythonSymbols`, returns function/class/method symbols matching the (insensitive)
  query → `{ ok, total, symbols: [{folder, folderName, file, fileSlug, name, type,
  line, args?, docstring?}] }`.

## `GET/POST/DELETE /api/snippets` · `GET /api/templates`

- **snippets** — storage `~/.praxis-snippets.json` (machine-scoped; atomic tmp+rename
  writes): GET `{ snippets: [{name, content, tags?, createdAt, updatedAt}] }`; POST
  `{ name`*, `content`*, `tags? }` upserts by exact name → `{ ok, snippet }`; DELETE
  `?name=` → `{ ok, deleted }`.
- **templates** — the static in-route array: `{ templates: [{id, name, description,
  content}] }` — 15 starter scripts (empty, plotting, data-analysis, unit-test, cells,
  cli, dataclass, async, sqlite, logging, decorators, generators, retry, typing, files).
  The richer template-picker manifest (61 entries across 8 file kinds, from
  `src/data/templates-manifest.json`) feeds the dialog client-side.

## `GET/POST /api/notes` · `GET /api/todos`

- **notes** — per-script notes at `<scriptsRoot>/.praxis/notes.json`
  (`Record<"folder/file", string>`, atomic writes; the client mirrors to localStorage for
  instant loads): GET `?folder=&file=` → `{ notes, folder, file }`; POST `{ folder, file,
  notes`* (≤100,000 chars, else 413)`, }` — an empty string deletes the key.
- **todos** — no params. Scans every folder's TEXT files (kinds image/video/audio/pdf/
  csv/spreadsheet/sqlite/ipynb/other skipped) for `/\b(TODO|FIXME|XXX|HACK)\b[:\s]*(.*)/`
  → `{ ok, total, todos: [{folder, folderName, file, fileSlug, line, tag, text
  (≤200 chars), kind}] }` (≤1 MB/file, ≤500 results). Read-only.

## `POST /api/validate-config` · `GET+PATCH /api/bytes` · `POST /api/convert` · `POST /api/audit`

- **validate-config**: body `{ content`* (≤1,000,000 chars)`, format: yaml|toml|ini|json }`
  — runs the real parser in a fixed Python snippet (PyYAML / tomllib / configparser
  strict / json) → `{ ok, issues: [{message, line?}] }`. Timeout 10 s.
- **bytes** (the hex editor): GET `?folder=&file=&offset?&length?` (chunk ≤64 KB, whole
  file ≤50 MB) → `{ ok, bytes (base64), offset, totalSize, fileName }`; PATCH
  `{ folder, file, offset`*`, bytes`* (base64 ≤64 KB, round-trip-validated) }` — a
  read-modify-write splice → `{ ok, written }`. All responses `Cache-Control: no-store`.
- **convert**: body `{ content`* (≤2,000,000 chars)`, from: json|yaml|csv|toml, to: same
  set }` — fixed Python conversion (csv→list-of-dicts; `csv→csv` refused) → `{ ok,
  output }`. Timeout 15 s.
- **audit**: body `{ folder`*, `interpreter? }` — dependency vulnerability audit via
  `pip-audit --format json` (per-folder venv python preferred, then the configured
  interpreter; 60 s) → `{ ok, vulnerabilities: [{name, version, fixVersion, id,
  description}], count, interpreter, fromVenv, tried, raw? }`; pip-audit missing → 200
  `{ ok: false, ..., hint: "pip-audit is not installed..." }`.
