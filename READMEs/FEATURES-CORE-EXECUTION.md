# Features — Core Browsing, Execution, Editor, Debugging, Navigation, Run Management

Back to the [feature index](./README-FEATURES.md).

## 📚 Core browsing

- **The explorer** (`folder-tree.tsx`, 10,520 lines): the project tree with expand/collapse (persisted), per-file kind
  icons, size/mtime, `# tags:` chips, git status badges, a fuzzy
  filter, favorites (starred files with a fresh-favorite highlight), a Recent Files section,
  and multi-select power operations. Context menus are built from the canonical
  `menuGroupsForKind` spec (`lib/context-menu-spec.ts`) — every language derives its menu by
  removing groups, never reordering, and the same renderer (`context-menu-groups.tsx`)
  serves the explorer, the Python editor, and the FileViewer so the menus cannot drift.
- **File operations**: create/rename/delete/move/copy/paste/duplicate files and folders (a dozen routes), drag-drop
  moves and subfolder drags, multi-select batch zip / export /
  delete, Upload ZIP as project, files-import drag-drop (base64 for binaries), templates,
  examples import, and local-history snapshots taken automatically before every
  destructive operation. Renames enforce `NAME_RE` and 409-on-exists; moves are atomic
  `fs.rename`.
- **Projects**: switch/create/open-anywhere (the server-folder browser navigates the whole
  filesystem with rejection reasons), per-project `.praxis/` overrides (settings,
  appearance, notes, spell dictionary, interpreter pin, run configs), active-project
  pointer persisted atomically, a created-projects registry, and GitHub-URL import (repo/tree-ref/subpath/gist).
- **Hidden files** toggle, per-folder stats, folder compare (A/B diff with same/modified/
  only-in counts), full-text search scoped to a folder or subfolder, and a Data Files
  gallery (type-icon grid + preview pane + downloads) for the folder's data files.

## ▶️ Code execution

- **Run** (`POST /api/run`, SSE): live streaming stdout/stderr, per-run temp dir, the
  Python prelude (matplotlib Agg capture with mpld3 interactive companions, DataFrame HTML
  captures, variable inspection at exit, optional line coverage, `test_*` discovery),
  arguments/env/stdin, run-cell (`# %%` slices), Run Selection (the edited buffer), a hard
  timeout (default 60 s, ≤600) with an honest timeout marker, per-stream output caps (2 MB default, ≤16 MB), and
  interactive stdin (live `input()` answers from the Output
  panel, an EOF button, and timeout re-arming per write).
- **30 more languages** run through their system runtimes (`lib/run-languages.ts`):
  JavaScript/TypeScript (node/tsx/deno), MATLAB (matlab -batch/octave), R, Bash, Java, C,
  C++ (compile-first with streamed diagnostics), Ruby, PHP, Go, Lua, Perl, Rust, Julia,
  Kotlin, Swift, PowerShell, Batch, Zig, Dart, Groovy, Scala, Elixir, Haskell, Erlang,
  Clojure, OCaml, F# — with runtime-status badges in Settings and "install X" hints.
- **Run All** (batch, 50-file cap), **Run Queue** (live registry view with per-run Stop), **Run Configs** (named
  args/env/stdin/interpreter presets per script, starred configs
  travel with the project), **Scheduled Runs** (browser-side interval scheduler — fires
  only while a tab is open, said plainly), **Multi-Python matrix** (one script across
  several interpreters with auto-diffed outputs and feature-compatibility verdicts), and
  a client-side **duration estimator** (median of the last 5 runs, else static analysis of
  heavy imports/sleeps/loops/reads) that warns before long runs.
- **Finish notifications**: browser notification (off / when-tab-hidden / always) plus a
  Web-Audio chime with distinct success/failure chords; notification clicks deep-link to
  the run's output entry.

## 🛠️ Editor & diagnostics

The Python editor (`code-viewer.tsx`, 8,596 lines) — view and edit modes over one buffer:

- **Rendering**: line numbers, word wrap, indent guides, a column ruler (0–120, 1–6 px),
  rainbow brackets + pair guides, whitespace marks, current-line highlight, sticky scroll (the pinned enclosing
  def/class header), typewriter scrolling, a minimap rail (≤8,000 lines), breadcrumbs (module > class > function), Code
  Lens chips per top-level
  symbol, progressive chunked rendering for >800-line files (200-line chunks, one per
  frame, triple-quote-safe boundaries), web-worker Prism highlighting with an LRU cache
  and a main-thread fallback, and a 5,000-line hard render cap with a download fallback.
- **Intelligence**: signature-help popup, an offline completion popup (builtins table +
  buffer symbols + snippets with tabstop expansion + auto-import on accept), squiggly
  diagnostics merged from disk ruff lint + a 700 ms live re-lint of the edit buffer +
  Pyright LSP diagnostics (see
  [ARCHITECTURE-PYRIGHT-LSP.md](./ARCHITECTURE-PYRIGHT-LSP.md)), mypy type inlays and
  revealed-type hovers, hover tooltips, go-to-definition (LSP-first with a text-heuristic
  fallback), peek references (⇧F12), find usages, rename with preview, quick fixes (⌥↵)
  that format/lint, spell check of comments and strings with a click-to-fix popover, and
  refactor flows (the refactor palette + right-click extract function/variable).
- **Editing**: auto-pair and skip-over brackets/quotes, Enter auto-indent (colon-aware,
  quantized to the configured indent unit), Tab priority chain (snippet tabstops → AI
  ghost-text accept → snippet expansion → Smart Tab block indent → indent unit),
  multi-caret editing (⌘D next-occurrence stacking + Alt+click carets; every gesture works
  at every caret), the 30-action Lines & Case menu (comment toggle, duplicate, move,
  join/split, surround-with, sort/unique/reverse/shuffle, 8 case conversions,
  trim trailing, fold all), deep undo (30-keystroke pacing snapshots over the format
  stack), Vim mode (registers, marks, macros, counts, motions, operators, text objects,
  the `:` command bar — see [SHORTCUTS-SURFACES.md](./SHORTCUTS-SURFACES.md)), and
  snippet expansion.
- **Save hygiene**: auto-format on save (black/ruff), organize imports on save, trim
  trailing whitespace, final newline, auto-save (inactivity presets + on-blur), and dirty
  guards (confirm-close, tab-switch guard — untitled drafts never block a switch).

## Debugging

- **pdb integration** (`POST /api/debug`, SSE): gutter-click breakpoints (the
  `praxis:breakpoints-changed` event feeds the start POST), a live Diagnostics-tab control
  bar (continue/next/step/return/quit), stopped events carrying the current line, locals (a real `p locals()` capture),
  the bottom-up stack with frame switching, and up to 32
  watch expressions evaluated per stop. Idle cap 5 min, total cap 10 min, 1,000-stop cap.
- **Time-travel debugger**: one recorded trace (`sys.settrace`, file-filtered, 3,000-event
  default) replayed as a scrubbable timeline with per-kind event ticks, locals-at-point
  with per-step diff badges, watchpoint histories, time breakpoints, backward jumps, and
  stdout aligned to events.
- **Tutor view**: the same trace rendered as a memory-model diagram (SVG call STACK
  column, HEAP of objects, reference arrows) with a rule-based plain-language narrator and
  play/step/rewind controls.
- **Coverage**: run-with-coverage paints executed/unexecuted line gutters (statement
  percent + a fail-under verdict), and branch coverage lists unexecuted branch decisions
  as clickable lines.

## 🔍 Navigation & discoverability

- **Go to**: file (⌘P fuzzy), file-in-project (⌘T server-side), line (⌘G), symbol in file (⌘R — the palette over
  `parsePythonSymbols`, doubling as a fold-region navigator),
  symbol in project (server search over every def/class), definition (F12 / Ctrl+click),
  declaration, references.
- **Search**: Ctrl+K script search with an optional full-text mode (AbortController-backed),
  project-wide Find-in-Files with per-hit review, stale-row detection, and a multi-file
  undo group for the whole replace; in-editor find/replace bars with regex, whole-word,
  and case toggles plus an armed replace-all confirm step.
- **Discoverability**: the Jump list overlay (pinned tabs, favorites, recents, folders,
  last runs), Recent Files dialog, bookmarks (editor line bookmarks + favorites, the
  Bookmarks menu's dynamic jump list), the command palette (⌘⇧P, grouped commands with
  recently-used), the TODO panel (TODO/FIXME/XXX/HACK scanner over every text file), and
  the editor Back/Forward history (Alt+←/→, Ctrl+-).

## 📜 Run management

- **Output panel** (3,687 lines): six tabs (Output / Figures / DataFrames / Variables /
  Coverage / Tests), ANSI-colored streaming with auto-scroll and identical-line folding,
  in-output search, a pinned baseline run with diff-against-previous, stdin send/EOF,
  timeout-vs-stop distinction, export to MD/ipynb/HTML, "Explain traceback" with AI,
  one-click pip-install next to a ModuleNotFoundError, and proactive hints (missing data
  files the script itself printed, pip suggestions from its own output).
- **Figures** panel: the persistent gallery accumulating every figure/animation from any
  run (primary, split, background), lightbox with zoom, per-plot download, download-all,
  mpld3 interactive companions, and delete/clear.
- **Run history**: capped entries (default 25) with full stdout/stderr/figures and exact
  rerun context (interpreter, args) — the trophy marks the best run; reruns fire the
  `PRAXIS_RERUN_RUN` event. **Cached output** restores the last result on re-selecting a
  script (TTL 7 days default).
- **Background runs**: runs demoted while another runs land in the dedicated background
  group, each with its own sink and Stop; the run-queue dialog shows every live child (label, kind, ticking duration,
  pid, interpreter, interactive flag, alive state).
