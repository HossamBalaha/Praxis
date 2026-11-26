# Features — Language Intelligence, Collaboration & Git, Data & Web Workbenches, Extensions & Platform

Back to the [feature index](./README-FEATURES.md).

## 🧠 Language intelligence (Python)

- **The Pyright sidecar** provides cross-file F12 definition jumps, typed hovers,
  project-wide F2 rename with preview, and live diagnostics — debounced on both sides of
  the wire (300 ms/1,500 ms typing sync, 150 ms/600 ms hover, 1,500 ms poll, 120 ms
  server coalesce) with user gestures never debounced, a 3-restart crash budget, and a
  full fallback ladder to the pre-LSP text heuristics and the AST-lite symbol parser.
  Full contract: [ARCHITECTURE-PYRIGHT-LSP.md](./ARCHITECTURE-PYRIGHT-LSP.md).
- **Ruff linting** on disk and (700 ms debounced) on the live buffer; **mypy type
  checking** with three strictness profiles and an optional dmypy daemon; quick fixes,
  fix-all (unsafe fixes included), and organize-imports; **docstring coverage** reports;
  the AST explorer; the bytecode inspector with compare mode; and the refactor palette (8 AST transforms: organize
  imports, inline variable/function, move symbol, change
  signature, loop ⇄ comprehension).
- **The persistent console** keeps one Python kernel alive across tab switches with
  namespace persistence, magics (`%time %timeit %who %whos %reset %history %help %tasks`
  and `%%time %%timeit %%capture`), a live variable explorer (kind chips, drill-down
  breadcrumbs, pinned watches, async-task tree), DataFrame grid opens, and an interrupt.
- **Debugging and tracing**: pdb integration with breakpoint gutters and watch
  expressions, the time-travel debugger, Tutor view, line & memory profiling with a
  flame graph, pytest runs with watch mode (gutter marks + footer badge), Hypothesis
  property-based tests with shrink analysis and regression promotion, and pip-audit
  vulnerability scanning.

## 🤝 Collaboration & Git

- **Live collaboration** (the Collaborate menu): an SSE room relay with presence (peer
  cursors, avatars, selections), follow mode, guest permission (read/edit — enforced by
  the host when applying peer buffers), copyable invite links (`?collab=<room>` — rooms
  match `^[a-z0-9-]{3,40}$`), a draggable session bar with a live peer count, and
  identity (name/color) persisted per browser. Caps: 20 rooms (LRU), 12 peers per room,
  45 s client TTL.
- **Git suite**: status badges (the explorer + menu-bar dirty count), the commit dialog (stage + commit), commit history
  with patches, branches (list/create/checkout/delete
  with unmerged protection), stashes (push/pop/list/show/apply/drop), view-changes per
  file with gutter markers, the blame gutter (author + age per commit run, hover
  details), pull/push/fetch/merge/rebase/abort/clone/revert escape hatch, the diff view (side-by-side, word-level
  highlights, editable-and-saveable panes, ignore-whitespace,
  swap sides), the AI code review, and the merge editor for conflict markers.

## 🕸 Data & web workbenches

- **Data files**: the Data File Browser gallery (grid + preview pane + downloads),
  text previews (200,000-char cap) with binary dataURLs for images, tabular previews for
  xlsx/xls/parquet/feather (1,000 rows × 200 cols, sheet selection, install cards for
  missing readers), editable CSV grids with formulas, and save-back for text and binary
  sheet formats (with pre-save local-history snapshots).
- **SQL**: the SQLite workbench (schema, ER diagram, saved queries, ORM export,
  read-only-by-default with a write toggle, 15 s query cap) and the DuckDB workbench (analytical files, schema
  inference, 60 s cap, history of 8).
- **Charts & transforms**: chart preview with 39 SVG chart types + matplotlib snippet
  generation, the column-stats band (min/max/mean/unique/missing with a filter click),
  and the 7-step transform pipeline (filter/sort/select/rename/group/pivot/join) with a
  live preview and save-back.
- **Web preview**: the live HTML preview (a sandboxed iframe of the folder's entry
  document with a relative-asset rewriter, a bootstrap script that pipes `console.*`
  and errors to the host via postMessage, device/zoom presets, and a 700 ms digest
  watcher emitting reloads) plus the server-side fetch relay (`/api/http-proxy`) that
  backs the API-client workbench.
- **Figures**: run-artifact serving (`/api/figure/<runId>/<name>`) with immutable
  caching, the plots gallery, and inline console figures.

## 🧩 Extensions & platform

- **Extensions**: manifest-declared, permission-scoped (commands / statusbar / notify /
  clipboard / editor.insertText / storage), Worker-sandboxed mini-plugins — a manager
  dialog with permission chips, per-command run buttons, a live status-bar preview, and
  enabled-state persistence (64 KB per-extension storage bag). Every host RPC is
  permission-checked; a dead host bridge rejects after 10 s.
- **PWA**: installable app (manifest + icons + a standalone display), an
  install-as-app prompt surfaced in Help, a service worker with an app-shell precache
  and the offline file cache, and dev-mode cache purging so stale workers never mask
  fixes.
- **Deployment**: Docker (bun + the Python scientific stack baked in), docker-compose (bind-mounted `python_scripts/`, a
  named run-artifacts volume, `SCRIPTS_ROOT` pinned),
  a Caddy reverse-proxy config, standalone Next output, and the desktop paths (PWA /
  `bun run desktop` webview / `bun run desktop:native` / Electron & `electron-builder` via `electron-main.js` and
  `bun run desktop:build` for Windows, Linux, and macOS portable executables & installers — see
  [DESKTOP.md](./ELECTROBUN-GUIDE.md)).
- **Quality platform**: strict TypeScript (gated by `bun run typecheck`), the ESLint
  warning-budget ratchet, the file-size budget ledger, 99 unit-test files / 1,789 tests,
  19 serial E2E tests, and the examples corpus contract — see
  [ARCHITECTURE.md](../ARCHITECTURE.md).
