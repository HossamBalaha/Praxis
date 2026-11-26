# Features — Non-.py Studios, Polish & Accessibility, Performance & Resilience

Back to the [feature index](./README-FEATURES.md).

## 🧰 Non-.py studio & workspace power tools

- **Markdown studio**: split editor | preview with synced proportional scrolling, an
  outline sidebar, layered code editing (Prism backdrop behind a transparent textarea),
  list continuation, format (⌘⇧F), and the classic preview rendering GitHub-grade GFM —
  bordered tables, alert callouts, task lists, mermaid diagrams, KaTeX math, heading
  anchors. Front-matter splits into a metadata card.
- **Notebook view**: `.ipynb` editing with cell cards (hover toolbar: edit/run/move/
  insert/duplicate/delete), insert zones, execution status bars, **a persistent kernel**
  (state survives across cells — `x=1` is visible in the next cell), `In [n]` counters,
  per-cell outputs with figures, Run All / Above / Below, and Jupyter command-mode keys.
- **Data grid**: editable CSV/TSV grids (typed cells preserved, formula bar with a safe
  spreadsheet evaluator — A1 refs, ranges, SUM/AVG/MIN/MAX, `#DIV/0!`-style errors,
  cycle detection), pandas-backed xlsx/parquet/feather sheets with save-back through
  `/api/data-sheet-write` (a pre-save local-history snapshot makes restores work), a
  truncation guard that disables Save on truncated previews, and zebra/colored-header/
  colored-number styling with per-column stats bands (missing-badge click filters).
- **Workbenches**: DuckDB SQL (over parquet/csv/feather, schema inference, 8-entry query
  history), SQLite SQL (schema tree + ER diagram + saved queries + SQLAlchemy/Django/
  Prisma model export; read-only by default with a write toggle), the API client (`.http` request builder with
  `{{variable}}` environments, history, collections,
  response inspection — routed through the server relay so CORS never applies), and the
  JSON inspector (tree + JSONPath query + editable leaves + format/minify).
- **Media studios**: the video player (frame stepping, grab-frame, trim, A/B loop, speed
  presets), the audio player (a big Web-Audio waveform with click-to-seek and Alt/Shift
  A–B loop points, live level meter, peak/RMS readouts, trim/export), the image toolbox (loupe magnifier with
  HEX/RGB/HSL copy, crop, gallery, zoom presets), the hex editor (64 KB chunks, in-place byte patching with a debounced
  group-writer and undo, pattern
  search), the log viewer (level-colored, filterable, virtualized, follow mode), and the
  PDF toolbar (thumbnails, page-mapped full-text search, text extraction — degrades
  honestly when poppler is missing).
- **Developer Toolbox**: 609 offline tools across 20 categories (≥30 each) — converters,
  encoders, text, generators, hash & crypto (WebCrypto + a pure-TypeScript MD5), color,
  time (a real cron parser), reference, math (a Pratt-style evaluator), validators,
  text analysis, QR generation, plus the studios: Image Studio (30+ ops with full-
  resolution exports), Image→Text (OCR, ASCII art, palette, EXIF), Video Studio (MediaRecorder re-encode pipeline),
  Audio Studio (OfflineAudioContext + WAV export),
  and PDF Studio (30+ pdf-lib operations). Every output flows through the shared
  Output Delivery dialog (Copy / Download / Save-into-project with overwrite
  confirmation) — never a silent download.
- **More workspace tools**: AST explorer (tree ↔ source sync), bytecode inspector (with
  a diff mode), docstring studio (generate + coverage report), the transform pipeline (7-step chained CSV transforms
  with live preview), chart preview (39 pure-SVG chart
  types with generated matplotlib snippets), dependency manager (installed/outdated/
  update/remove/pin across both manifests), env sync (declared vs installed, freeze/
  lock/pin), task runner (npm/Make/just/pyproject tasks with output channels), run
  history/queue/scheduler, local history, compare tools (files, clipboard, folders),
  and the merge editor (three-way conflict resolution with Accept Ours/Theirs/Both).

## 🌗 Polish & accessibility

- **Accessibility** (Settings → Accessibility + the Tools submenu): high contrast, large
  text (+25%), dyslexia-friendly (Atkinson Hyperlegible stack), color-blind palette (blue/orange), reduce motion, screen
  reader mode, enhanced focus rings, sticky cursor,
  always-show shortcut hints, wrap Tab navigation — all applied pre-paint via `data-*`
  attributes (no flash), stackable, mirrored in the layout bootstrap script.
- **i18n**: English + Arabic (العربية) with full RTL shell flip; the menu chrome, bottom
  tabs, buttons, and AI-chat strings translate, with English fallbacks.
- **Themes**: 47 interface themes (20 light + 27 dark), 24 code syntax themes (follow-
  global default), 8 output themes, and 16 screenshot palettes — all live-switchable.
- **Toasts** with a configurable duration, action notifications, a performance HUD (opt-in), an offline indicator, and
  browser-tab title mirroring (focus countdown,
  unread counts). Modal dialogs are draggable/floatable and resizable with persisted
  geometry; the legacy-browser gate (IE/EdgeHTML/Chrome<90/Safari<14/Firefox<90/Opera<
  Presto plus a capability probe) shows a full-screen notice with install links.

## ⚡ Performance & resilience

- **Worker highlighting + progressive rendering**: tokenization off the main thread with
  a 96-entry LRU and a `workerBroken` fallback; >800-line files render in 200-line
  chunks per animation frame; a 5,000-line render cap. See
  [ARCHITECTURE-OVERLAYS.md](./ARCHITECTURE-OVERLAYS.md).
- **Click-time prefetch**: file content fetches start before the React commit, so open
  time is max(render, RTT); prefetched entries are invalidated on save.
- **Session restore**: tabs, split panes, dirty buffers (12-file LRU, 256 KB, 3-day TTL),
  terminal and console sessions, and layout geometry survive F5; saves are debounced with
  a `beforeunload` flush and a quota retry without buffers. See
  [ARCHITECTURE.md](../ARCHITECTURE.md) §3.5.
- **Offline support**: a service worker (app-shell precache + a network-first runtime
  cache for `/api/code` and `/api/file` — recently-opened files readable offline) plus
  a 40-entry localStorage write queue that replays on reconnect with per-entry retries,
  a cross-tab flush lock, and a footer chip (Offline — N queued / Syncing / Synced).
- **Resilience**: per-panel error boundaries (a crashing panel shows a compact card and
  a reload-this-panel remount — the rest of the IDE and the editor buffers survive),
  an app-wide error boundary with Try-again, self-healing split layouts, honest
  truncation notes everywhere (output, blame, listings, previews), and a lint-warning
  budget ratchet that only moves down. The Perf HUD (FPS, keystroke→paint, long tasks,
  SSE bytes/s, per-panel render counts, heap) instruments the hot paths via a zero-cost
  hub that runs only while subscribed.
