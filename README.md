<div align="center">

<img src="./public/android-chrome-512x512.png" alt="Praxis logo" width="128" height="128" />

# Praxis

### The browser & desktop polyglot IDE — Python first, plus JavaScript, TypeScript, MATLAB, R, Bash, Java, C, C++, Ruby, PHP, Go, Lua, Perl, Rust, Julia, Kotlin, Swift, PowerShell, Batch, Zig, Dart, Groovy, Scala, Elixir, Haskell, Erlang, Clojure, OCaml and F#.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![React Compiler](https://img.shields.io/badge/React_Compiler-opt_in-61dafb?logo=react)](https://react.dev/learn/react-compiler)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](./tsconfig.json)
[![Electron](https://shields.io)](#%EF%B8%8F-desktop--installable-app)
[![Languages](https://img.shields.io/badge/Languages-30-8b5cf6)](#-features)
[![Bun](https://img.shields.io/badge/Bun-1.3-f9f1e5?logo=bun)](https://bun.sh/)
[![Vitest](https://img.shields.io/badge/Vitest-3-6e9f18?logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2eab33?logo=playwright)](https://playwright.dev/)
[![Tests](https://img.shields.io/badge/tests-1%2C700%2B-brightgreen)](#-testing)
[![Pyright](https://img.shields.io/badge/LSP-Pyright_sidecar-3776ab?logo=python)](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md)
[![Ruff](https://img.shields.io/badge/lint-Ruff%20%2B%20mypy-261230)](#%EF%B8%8F-editor--diagnostics)
[![ESLint](https://img.shields.io/badge/ESLint-10-4b32c3?logo=eslint)](./eslint.config.mjs)
[![Prism + SyntaxHighlighter](https://img.shields.io/badge/Prism-SyntaxHighlighter-orange?logo=prism)](https://github.com/react-syntax-highlighter/react-syntax-highlighter)
[![Web Worker highlighting](https://img.shields.io/badge/Highlighting-Web_Worker-8b5cf6)](./src/lib/highlight-worker.ts)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-3-3776ab?logo=python)](https://www.python.org/)
[![Git](https://img.shields.io/badge/Git-integrated-f05032?logo=git)](#-collaboration--git)
[![Service Worker](https://img.shields.io/badge/Service_Worker-runtime_cache-4671ea)](./public/sw.js)
[![Offline write queue](https://img.shields.io/badge/Offline-write_queue-f59e0b)](./src/lib/offline-store.ts)
[![Session restore](https://img.shields.io/badge/F5--proof-session_restore-22c55e)](#-performance--resilience)
[![Dictionaries](https://img.shields.io/badge/Spellcheck-7_dictionaries-ef4444)](#%EF%B8%8F-editor--diagnostics)
[![A11y](https://img.shields.io/badge/A11y-WCAG--minded-4b5563)](#-polish--accessibility)
[![i18n](https://img.shields.io/badge/UI-EN%20%2B%20AR%20%F0%9F%94%97-14b8a6)](#-polish--accessibility)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker)](./Dockerfile)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC_BY--NC_4.0-blue?logo=creative-commons)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?logo=github)](./CONTRIBUTING.md)
[![PWA](https://img.shields.io/badge/PWA-installable-purple?logo=pwa)](./public/manifest.json)

</div>

---

## 📖 Table of contents

- [What & why](#-what--why) · [Quick start](#-quick-start-5-minutes) · [Build](#-build-for-production-no-dev-server) · [Desktop & installable app](#%EF%B8%8F-desktop--installable-app) · [First-time user guide](#-first-time-user-guide)
- [Features](#-features) — [Core browsing](#-core-browsing) · [Code execution](#%EF%B8%8F-code-execution) · [Editor & diagnostics](#%EF%B8%8F-editor--diagnostics) · [Debugging](#debugging) · [Navigation](#-navigation--discoverability) · [Run management](#-run-management) · [Sharing & export](#-sharing--export) · [Building blocks & examples](#-editor-building-blocks--examples) · [AI](#-ai-integration) · [Focus & ambience](#-focus--ambience) · [Non-.py power tools](#-non-py-studio--workspace-power-tools) · [Polish & accessibility](#-polish--accessibility) · [Performance](#-performance--resilience) · [Language intelligence](#-language-intelligence-python) · [Collaboration & Git](#-collaboration--git) · [Data & web workbenches](#-data--web-workbenches) · [Extensions & platform](#-extensions--platform)
- [Keyboard shortcuts](#%EF%B8%8F-keyboard-shortcuts) · [Output themes](#-output-themes) · [Settings reference](#%EF%B8%8F-settings-reference) · [API contracts](#-api-contracts) · [Logo](#-logo) · [Project layout](#-project-layout) · [Security](#-security) · [Testing](#-testing) · [Contributing](#-contributing) · [Changelog](./CHANGELOG.md) · [License & citation](#-license--citation) · [Author](#-author)

### The documentation set

The root directory holds only this README and [ARCHITECTURE.md](./ARCHITECTURE.md); every
detailed reference lives in the [`READMEs/`](./READMEs/) folder:

| Document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Scope                                                                                                  |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The load-bearing rules — layer map, layout invariants, state management, quality gates                 |
| [READMEs/ELECTROBUN-GUIDE.md](./READMEs/ELECTROBUN-GUIDE.md)                                                                                                                                                                                                                                                                                                                                                                                                                                             | Native desktop packaging — portable executables, system installers, and cross-platform Electron builds |
| [READMEs/ARCHITECTURE-SPLIT-PANES.md](./READMEs/ARCHITECTURE-SPLIT-PANES.md) · [OVERLAYS](./READMEs/ARCHITECTURE-OVERLAYS.md) · [PYRIGHT-LSP](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md)                                                                                                                                                                                                                                                                                                                     | The three deep architecture sub-contracts                                                              |
| [READMEs/FEATURES-OVERVIEW.md](./READMEs/FEATURES-OVERVIEW.md) + [MENUS-WORKSPACE](./READMEs/MENUS-WORKSPACE.md) · [MENUS-RUN-AI-DATA](./READMEs/MENUS-RUN-AI-DATA.md) · [MENUS-TOOLS-PLATFORM](./READMEs/MENUS-TOOLS-PLATFORM.md)                                                                                                                                                                                                                                                                       | Every feature, tool and menu option — the 15 menus, item by item                                       |
| [READMEs/README-FEATURES.md](./READMEs/README-FEATURES.md) + [FEATURES-CORE-EXECUTION](./READMEs/FEATURES-CORE-EXECUTION.md) · [FEATURES-SHARING-AI-FOCUS](./READMEs/FEATURES-SHARING-AI-FOCUS.md) · [FEATURES-TOOLS-ACCESSIBILITY](./READMEs/FEATURES-TOOLS-ACCESSIBILITY.md) · [FEATURES-LANGUAGE-COLLAB-DATA-EXTENSIONS](./READMEs/FEATURES-LANGUAGE-COLLAB-DATA-EXTENSIONS.md)                                                                                                                       | The deep per-category feature reference                                                                |
| [READMEs/SHORTCUTS.md](./READMEs/SHORTCUTS.md) · [SHORTCUTS-SURFACES](./READMEs/SHORTCUTS-SURFACES.md)                                                                                                                                                                                                                                                                                                                                                                                                   | Every keyboard shortcut and mouse gesture (52 rebindable + all fixed keys)                             |
| [READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md) + [SETTINGS-EDITOR](./READMEs/SETTINGS-EDITOR.md) · [SETTINGS-FORMATTING](./READMEs/SETTINGS-FORMATTING.md) · [SETTINGS-PYTHON](./READMEs/SETTINGS-PYTHON.md) · [SETTINGS-WORKSPACE](./READMEs/SETTINGS-WORKSPACE.md) · [SETTINGS-CAPTURE-MEDIA-MAINTENANCE](./READMEs/SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md) · [SETTINGS-PROJECT-SHORTCUTS](./READMEs/SETTINGS-PROJECT-SHORTCUTS.md) · [README-SETTINGS](./READMEs/README-SETTINGS.md) | Every setting, default and option across the 15 tabs                                                   |
| [READMEs/API-CONTRACTS.md](./READMEs/API-CONTRACTS.md) + [API-FILES-FOLDERS](./READMEs/API-FILES-FOLDERS.md) · [API-EXECUTION-TESTS](./READMEs/API-EXECUTION-TESTS.md) · [API-CODE-INTELLIGENCE](./READMEs/API-CODE-INTELLIGENCE.md) · [API-GIT-PROJECTS-ENV](./READMEs/API-GIT-PROJECTS-ENV.md) · [API-DATA-MEDIA-PLATFORM](./READMEs/API-DATA-MEDIA-PLATFORM.md)                                                                                                                                       | All 127 API routes with methods, params, bodies, responses                                             |
| [READMEs/README-PROJECT-LAYOUT.md](./READMEs/README-PROJECT-LAYOUT.md) · [COMPONENTS-REFERENCE-A-J](./READMEs/COMPONENTS-REFERENCE-A-J.md) · [COMPONENTS-REFERENCE-K-Z](./READMEs/COMPONENTS-REFERENCE-K-Z.md) · [LIB-REFERENCE-A-M](./READMEs/LIB-REFERENCE-A-M.md) · [LIB-REFERENCE-N-Z](./READMEs/LIB-REFERENCE-N-Z.md)                                                                                                                                                                               | The directory tree and the component/module catalogs                                                   |
| [CONTRIBUTING.md](./CONTRIBUTING.md) · [SECURITY.md](./SECURITY.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)                                                                                                                                                                                                                                                                                                                                                                                         | Contribution, security, conduct and desktop guides                                                     |

---

## 🤔 What & why

Praxis is a **local-first IDE that lives in the browser**. The Next.js server sits next to your
code; the browser tab is the whole IDE. There is no database, no account, no cloud — the
workspace is a plain folder on your disk (`python_scripts/` by default, or *any* folder you
open), and every run, lint, format, and rename is a localhost API call.

### What makes it different

- **One binary, thirty languages.** Python gets the full pipeline (SSE-streamed runs, figure
  capture, variable inspection, coverage, pdb + time-travel debugging, Pyright intelligence);
  29 more runtimes are detected and run through their system binaries — each with install
  hints when missing.
- **The deep Python pipeline is real, not simulated.** A per-run prelude captures matplotlib
  figures, DataFrame HTML tables, a variables snapshot, line coverage, and discovered tests —
  streamed live into a tabbed output panel while the script is still running.
- **A language server, properly managed.** Pyright runs as a crash-budgeted, debounce-contract
  sidecar for F12 jump-to-definition, typed hovers, ⇧F12 peek references, project-wide rename
  with preview, and live squiggles — and every feature degrades gracefully to the built-in
  text heuristics when Pyright isn't installed.
  ([READMEs/ARCHITECTURE-PYRIGHT-LSP.md](./READMEs/ARCHITECTURE-PYRIGHT-LSP.md))
- **Engineered like infrastructure.** Strict TypeScript, 1,789 unit tests across 99 files,
  serial Playwright e2e, a lint warning-budget ratchet, a file-size ratchet, and a written
  architecture contract ([ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Local-first but complete.** Offline app-shell + file caching, an offline write queue,
  F5-proof session restore, installable as a PWA, optional Docker deployment.

## 🚀 Quick start (5 minutes)

### 1. Clone & install

```bash
git clone https://github.com/HossamBalaha/Praxis.git
cd Praxis
bun install  # Bun 1.3.14 is the canonical manager (bun.lock is the lockfile).
```

`npm install` works too, but Bun is what the scripts assume. Make sure `python3` is on your
`PATH` (or pick a specific interpreter in Settings → Python — conda, pyenv, uv and venv
environments are discovered automatically).

### 2. Drop your folders under `python_scripts/`

Anything you put there becomes a workspace chapter with its own run history, notes,
tags and environment:

```text
python_scripts/
├── Data & Docs/  # data files, documents, long files (fixtures for edge cases).
├── Getting Started/  # tutorials + the GettingStarted corpus.
├── Languages/  # MATLAB, R, web and language labs.
├── Media/  # a media gallery + playback fixtures.
├── Python Projects/  # real mini-projects.
├── README/  # nested README family.
├── Structure & Edge Cases/  # nested folders, archives, unsupported types.
├── ProjectOverview.md
└── README.md
```

…or **File → Open Project → Open Folder…** to point Praxis at *any* folder on your machine (the server folder browser
navigates the whole filesystem, with reserved-directory
guardrails). Projects can also be created from a GitHub URL or an uploaded ZIP.

#### Every language runs (Python first, the rest through their runtimes)

Python runs through the full prelude pipeline. Every other runnable kind routes through its
detected system runtime — node/tsx (JavaScript, TypeScript), MATLAB `–batch`/Octave, Rscript,
bash, java, gcc/g++ (C, C++), ruby, php, `go run`, lua, perl, rustc, julia, kotlin, swift,
powershell, batch, zig, dart, groovy, scala, elixir, runghc (Haskell), erlang, bb (Clojure),
ocaml, fsharp — with a live runtime panel in Settings → Formatting and "install X" hints
whenever a runtime is missing.

### 3. Start the dev server

```bash
bun run dev
# → http://localhost:3000
```

### 4. (Optional) Customize

Open **Settings** (`Ctrl+,`) — 15 tabs, 158 indexed settings, every default listed in
[READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md). The first ones most
people touch: the interface theme (47 themes), the interpreter, the output theme, the
naming style for generated files, and the top-right quick actions (32 toggles).

### 5. (Optional) Run with Docker

```bash
docker compose up --build
# → http://localhost:3000 — port 3000, ./python_scripts bind-mounted,
#   a named volume for run artifacts, python3 + the scientific stack baked in.
```

## 📦 Build for production (no dev server)

```bash
bun run build  # next build + copy-standalone (assets, public/, bin/, python_scripts/).
bun run start  # NODE_ENV=production bun .next/standalone/server.js.
# → http://localhost:3000
```

Optional: `PRAXIS_REACT_COMPILER=1 bun run build:compiler` for the opt-in React Compiler
pass (needs >4 GB RAM on the two 500 KB+ components). `scripts/copy-standalone.mjs` mirrors
the runtime assets into `.next/standalone/`; `node-unrar-js` is marked
`serverExternalPackages` so its WASM loads from disk.

## 🖥️ Desktop & installable app

Praxis can be installed directly from pre-built desktop binaries or launched locally through multiple paths. For a
comprehensive, step-by-step guide on packaging Praxis into portable executables and system installers, refer to
the [Desktop Application Guide](./READMEs/ELECTROBUN-GUIDE.md).

1. **Pre-built Desktop Releases (Recommended)** — Download single-file portable executables or native system installers from the **GitHub Releases** page (see [CHANGELOG.md](./CHANGELOG.md) for release notes):
    - **Windows**: `Praxis Setup <version>.exe` (installer) or `Praxis <version>.exe` (portable)
    - **macOS**: `Praxis-<version>.dmg` (installer) or `Praxis-<version>-mac.zip` (portable `.app`)
    - **Linux**: `praxis_<version>_amd64.deb` (Debian/Ubuntu installer) or `Praxis-<version>.AppImage` (portable)
2. **`bun run desktop:build`** — Builds the Next.js standalone server, dereferences Windows symlinks, and packages
   native portable and installable desktop builds via **Electron & `electron-builder`** into `dist-desktop/`.
3. **PWA** — Install as an application from any Chromium browser (manifest and service worker ship in `public/`); the
   offline shell and recently opened files continue to function without a network connection.
4. **`bun run desktop` & `bun run desktop:native`** — Local developer wrappers that boot the standalone server in a
   Chrome/Edge `--app` window or a lightweight OS webview (`webview-bun`).

## 🧭 First-time user guide

> **New to Praxis?** A 5-step interactive tutorial appears on first launch.

1. **Pick a script** from the sidebar file tree (click a folder to expand it).
2. **Read the code** — syntax-highlighted (in a Web Worker, so the tab never freezes),
   collapsible; long files open as a hard-clipped preview and expand progressively in
   200-line chunks with a live *Rendering N of M lines…* loader.
3. **Run** with the green **Run** button or `Ctrl+Enter` — output streams live over SSE, and
   Figures / Tables / Vars / Coverage / Tests tabs fill as the prelude captures them.
4. **Press `Ctrl+K`** to search scripts, `Ctrl+Shift+P` for the command palette, `Ctrl+T` for
   project-wide symbols.
5. **Hover a symbol** for its Pyright type; **F12** jumps to a cross-file definition, **Shift+F12** peeks references,
   **Shift+F6** renames project-wide with a preview.

<details>
<summary><b>💡 Tips for beginners</b></summary>

- **Don't see your script?** Click **Refresh** (⟳) in the menu bar, or `Ctrl+Shift+R`.
- **"Could not start Python"?** Install Python 3 on your PATH, or pick a specific interpreter
  in Settings → Python.
- **No figures?** Install `matplotlib`, and check the interpreter in Settings → Python.
- **Output cut off?** The default cap is 2 MB per stream (Settings → Python → Max output).
- **Script takes too long?** Set a run-duration warning threshold in Settings → Python.
- **Need text search inside a file?** `Ctrl+F` opens the find bar (read and edit mode); in
  edit mode the expand arrow reveals Replace.
- **Want auto-save?** Settings → Editor → Auto-save delay (e.g. 2000 ms).

</details>

---

## ✨ Features

Every feature below maps to a real component or route. **Full detail, per category, lives in
[READMEs/README-FEATURES.md](./READMEs/README-FEATURES.md); every menu item in
[READMEs/FEATURES-OVERVIEW.md](./READMEs/FEATURES-OVERVIEW.md).**

### 📚 Core browsing

Virtualized multi-project file tree (fuzzy filter, favorites, git badges, `#tags`, Recent
section) · per-kind renderers for every file type (Markdown, JSON/YAML/TOML, HTML sandbox,
CSV, images, video, audio, PDF, notebooks, SQLite) · archive viewer for ZIP/tar/gz/xz/bz2/
RAR (built-in WASM)/7z (vendored `bin/7za`) · open **any** folder on the machine as the
project · GitHub + ZIP import · per-project `.praxis/` overrides that travel with the folder.

### ▶️ Code execution

SSE-streamed runs (60 s default timeout, 2 MB cap, interactive stdin) · the Python prelude:
live figures, DataFrame tables, variables, coverage, test discovery · 29 more runtimes with
install hints · Run All / Run Queue / Run Configs / Scheduled Runs / Multi-Python matrix /
duration estimator · finish notifications + chime.

### 🛠️ Editor & diagnostics

Line numbers, word wrap, indent guides, column ruler, rainbow brackets, sticky scroll,
breadcrumbs, minimap, Code Lens, Vim mode, multi-caret editing, snippets with tabstops ·
worker-thread highlighting + progressive rendering for huge files · ruff lint (disk + live
buffer), mypy type-checking with inlays, squiggly diagnostics, quick fixes, fix-all,
organize imports · spell check with 7 dictionaries and a project dictionary · F5-proof
session restore · 37-language offline formatter engine (prettier/gofmt/rubocop preferred,
built-in fallback).

### Debugging

Gutter breakpoints + pdb over SSE (locals, stack frames, watches) · time-travel debugger (record once, scrub
stdout/locals/line events backward) · Tutor view (the memory-model
diagram with a plain-language narrator) · line & memory profiling with a flame graph ·
pytest with watch mode, Hypothesis property-based tests, pip-audit scans.

### 🔍 Navigation & discoverability

⌘K script search + full-text mode · ⌘T project symbols · ⌘R file symbols · ⌘P quick-open ·
F12 definition · ⇧F12 peek references · ⌥F7 usages · ⇧F6 rename · Back/Forward history ·
jump list overlay · bookmarks · TODO scanner · command palette · in-editor find/replace
with regex.

### 📜 Run management

Tabbed output panel (Output / Figures / DataFrames / Vars / Coverage / Tests) with
baseline-pin + diff-against-previous · persistent figure gallery · run history with exact
rerun context · cached output on re-select · background runs with their own sinks ·
Run Queue with per-run Stop · offline write queue for saves.

### 📤 Sharing & export

11 export formats (MD / ipynb / HTML / TXT / JSON / PDF-print / session report / LaTeX /
reST / copy-as-MD / GitHub-ready zip) · snapshot links that pack the workspace into the URL
hash · the Screenshot Studio (window/code/region… shots, DPI-aware, PNG/JPEG/WebP) ·
compress-to-ZIP · snapshot / diff / compare tools.

### 🧱 Editor building blocks & examples

61-file templates manifest (8 file kinds) · Insert blocks · snippet library (palette +
manager + packs) · **3,700 ready-to-run examples** across 27 language groups — Python 2,150,
every other language exactly 50 — validated by a contract test that compiles and executes
every body · six project-scaffold blueprints.

### 🤖 AI integration

OpenAI-compatible chat (Ollama/LM Studio/vLLM/llama.cpp/Z.AI/OpenRouter presets, server-side
keyring so keys never touch localStorage) · ghost-text completion · inline ⌘I chat with
diff-apply · Explain/Improve · AI test generation · **Agent Mode** (multi-file edit plans
with per-file approval and drift checks) · AI code review of git diffs · external Ask-AI
endpoints · full sampling controls.

### 🧘 Focus & ambience

Pomodoro / 52-17 / Deep-Work focus timers with auto-chaining, Zen mode, stats and streaks · **105 fully synthesized
ambient tracks** in 8 categories with a mixer and 24 quick-blends ·
study statistics.

### 🧰 Non-.py studio & workspace power tools

Markdown studio (split editor + GFM preview + outline) · notebook view with a persistent
kernel · editable CSV grids with a safe formula engine · pandas sheet save-back · DuckDB +
SQLite workbenches (ER diagrams, ORM export) · API client (`.http`) · JSON inspector with
JSONPath · hex editor · log viewer · PDF toolbar · media studios (image/audio/video/PDF —
609 offline Developer Toolbox tools in all) · dependency manager + env sync · task runner ·
AST explorer · bytecode inspector · docstring studio · transform pipeline · chart preview (39 SVG chart types) ·
scaffold dialog.

### 🌗 Polish & accessibility

47 interface themes · EN + AR (RTL) interface language · high contrast, large text,
dyslexia-friendly, color-blind palettes, reduce motion, screen reader mode, focus rings,
sticky cursor, shortcut hints, wrap Tab navigation — applied pre-paint with no flash ·
drag/float/resize dialogs with persisted geometry · legacy-browser gate.

### ⚡ Performance & resilience

Web-worker tokenization (96-entry LRU + fallback) · progressive 200-line chunk rendering ·
click-time prefetching · `praxis:*` event bus + ref-backed fast state · per-panel error
boundaries (a crashing panel never takes the IDE down) · offline app shell + write queue ·
performance HUD (FPS, keystroke→paint, SSE throughput) · warning-budget and file-size
ratchets.

### 🧠 Language intelligence (Python)

Pyright sidecar (F12 / hovers / ⇧F12 / F2-rename / live diagnostics, crash-budgeted with a
full fallback ladder) · ruff + mypy + docstring coverage · AST explorer · bytecode disasm ·
refactor palette (8 AST transforms) · rename with symbol-aware previews · the persistent
console with magics and a live variable explorer · completions with auto-import ·
signature help.

### 🤝 Collaboration & Git

Live collaboration over an SSE room (peer cursors, presence, follow mode, guest
permissions, invite links) · the full git suite: status badges, stage + commit, history +
patches, branches, stashes, per-file diffs with gutter markers, blame gutter, push/pull/
merge/rebase/clone escape hatch, the editable diff view, AI review, and a merge editor.

### 🕸 Data & web workbenches

Data file gallery + text/binary previews · sheet previews (xlsx/parquet/feather) · editable
grids with column-stat bands · SQLite + DuckDB SQL · chart preview · transform pipeline ·
live HTML preview with a console pipe + device presets · the server fetch relay · run-figure
serving.

### 🧩 Extensions & platform

Permission-scoped, Worker-sandboxed mini-plugins with a manager UI · PWA install ·
Docker/compose/Caddy deployment · optional bearer-token auth + 3-class rate limiting ·
security headers on every route · the standalone build.

---

## ⌨️ Keyboard shortcuts

**52 rebindable** shortcuts (Settings → Shortcuts: click a binding, press keys, conflict
detection included) plus the full fixed keymap per surface — Python editor edit mode, Vim
mode, notebooks, terminal, FileViewer, find bars, the Ctrl+Tab switcher, mouse+modifier
gestures, media keys. **The complete tables: [READMEs/SHORTCUTS.md](./READMEs/SHORTCUTS.md)
and [READMEs/SHORTCUTS-SURFACES.md](./READMEs/SHORTCUTS-SURFACES.md).** The essentials:
`⌘↵` run · `⌘.` stop · `⇧↵` run cell · `⌘⇧↵` run selection · `⌘K` search · `⌘⇧P` palette ·
`⌘T` symbols · `F12` definition · `⇧F12` references · `⌘D` multi-caret · `⌘/` comment ·
`⌘⇧F` format · `⌘G` go-to-line · `Ctrl+Tab` tab switcher · `⌥1…9` tab jumps · `⌘B/⌘J/⌘⇧L`
sidebar/panel/AI-chat.

## 🎨 Output themes

The run-output panel ships **8 themes** — Midnight (default), Daylight, Dracula, Solarized
Dark/Light, Monokai, Matrix, GitHub Dark — each styling the panel, stdout, stderr, error,
warning, info, and diff swatches. Pick per-panel (the output panel's theme dropdown,
persisted in `praxis.output-theme`) or as the default in Settings → Editor. Code highlighting
has its own 24-theme catalogue (`praxis.code-theme`, "Follow global" by default) and the
interface chrome 47 themes — the full catalogues are in
[READMEs/README-SETTINGS.md](./READMEs/README-SETTINGS.md#theme-catalogues).

## ⚙️ Settings reference

**15 tabs, 158 indexed settings** — Editor (67 rows), Formatting (13 global + 3 Python + 37
language blocks), Python (20), Collaboration, Focus (12 + the ambient mixer), AI, Nav (6 + 32 quick actions),
Accessibility (11), Capture (10), Media (8), Backup (3 profiles),
Cache (5), Advanced (15), Project, Shortcuts. Searchable from the dialog's search box; every
row, default, and option is cataloged in
[READMEs/SETTINGS-REFERENCE.md](./READMEs/SETTINGS-REFERENCE.md) and its per-tab files.
Project overrides (`.praxis/settings.json`) travel with the folder.

## 🔌 API contracts

**127 routes** with exact methods, params, bodies, responses, status codes, caps and side
effects — including the key routes `POST /api/run` (the SSE execution contract with the
Python prelude), `GET /api/file` (raw bytes for any file), and `POST /api/archive`
(list/extract/capabilities over zip/tar/gz/xz/bz2/rar/7z). The conventions (slug addressing,
root resolution, traversal guards, auth, rate classes) plus the complete inventory:
[READMEs/API-CONTRACTS.md](./READMEs/API-CONTRACTS.md) and its five group files.

## 🎨 Logo

The logo is `public/logo.svg` (an emerald rounded square with the Praxis mark) plus the
generated favicon family — `favicon.ico`, 16/32/96 px PNGs, apple-touch 180, android-chrome
192/512, and an SVG mask icon. Regenerate them from the source SVG with
`python3 scripts/gen-favicons.py` (cairosvg + Pillow). The browser theme color is
`#059669`; mask-icon tint matches.

## 📁 Project layout

One page, 127 API routes, 150 app components (+ 32 UI primitives), 153 pure lib modules (+91
example-content modules), 2 pure layout engines, 7 hooks, 2 workers, 3 e2e specs, 6 scripts —
and the layered rules that govern them. **The full tree with counts:**
[READMEs/README-PROJECT-LAYOUT.md](./READMEs/README-PROJECT-LAYOUT.md). **The rules:**
[ARCHITECTURE.md](./ARCHITECTURE.md).

## 🔒 Security

A layered, localhost-first posture: the filesystem sandbox (base64url slugs + containment
guards + reserved-name vetting), argv-only spawning, per-run temp dirs with a 24 h sweep,
opt-in bearer token, always-on 3-class rate limiting, hardening headers on every route, a
server keyring for AI keys, and eleven documented trust boundaries (including the
http-proxy SSRF surface). **The complete policy: [SECURITY.md](./SECURITY.md).**

## 🧪 Testing

```bash
bun run typecheck   # tsc --noEmit against strict TypeScript.
bun run lint        # ESLint behind the warning-budget ratchet (.lint-warning-budget = 358).
bun run test:unit  # Vitest — 99 files, 1,789 tests (lib + layout engines).
bun run test:e2e   # Playwright — 3 specs, 19 serial tests, zero retries.
bun run check:examples  # Compiles + executes all 3,700 embedded examples.
bun run check      # The full pipeline, in CI order.
```

Run the same pipeline locally in CI order — `bun run typecheck` → `bun run lint` →
`bun run test:unit`. The GitHub Actions workflow that used to run this pipeline has been
retired with the `.github` folder; **`bun run check` is the canonical gate**. Flakiness is
fixed, not retried — the Playwright config is serial, single-chromium, 120 s timeouts,
zero retries by design.

## 🤝 Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) first — the quick start, the layer
rules, the coding standards (strict TypeScript, the 2,000-line cap, the warning-budget
ratchet, purity discipline), how to add a feature / API route / prelude signal, and the PR
checklist. Community standards: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## 📄 License & citation

**License:** [CC-BY-NC 4.0](./LICENSE) — Creative Commons Attribution-NonCommercial 4.0
International, © 2026 Hossam Magdy Balaha. Commercial use requires separate permission.

**Citation:** the machine-readable metadata lives in [CITATION.cff](./CITATION.cff) — cite via
your tooling's "Citation" dialog or:

```bibtex
@software{Balaha_Praxis,
    author = {Balaha, Hossam Magdy},
    title = {Praxis — Browser and desktop polyglot IDE for Python and 29+ languages},
    year = {2026},
    url = {https://github.com/HossamBalaha/Praxis}
}
```

## 👤 Author

<div align="center">

### Hossam Magdy Balaha

Computer vision · deep learning · medical image analysis — researcher, engineer, and educator.

**Degrees, appointments, publications, and citation metrics change over time — the up-to-date CV is always
at [hossambalaha.github.io](https://hossambalaha.github.io/).**

|                     |                                                            |
|---------------------|------------------------------------------------------------|
| 🌐 **Website / CV** | [hossambalaha.github.io](https://hossambalaha.github.io/)  |
| 📧 **Email**        | [h3ossam@gmail.com](mailto:h3ossam@gmail.com)              |
| 🐙 **GitHub**       | [github.com/hossambalaha](https://github.com/hossambalaha) |

</div>

---

<div align="center">

**⭐ If Praxis helps you, please star the repo — it helps others find it.**

Made with ❤️ by [Hossam Magdy Balaha](https://hossambalaha.github.io/)

</div>
