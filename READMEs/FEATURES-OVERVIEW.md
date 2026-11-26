# Praxis — Features Overview & Menu Reference

Every feature, tool, and menu option in the app, organized surface by surface. This index
summarizes each of the 15 menus and links to the item-by-item tables; the deep
per-category feature reference is [README-FEATURES.md](./README-FEATURES.md), the settings
catalog is [SETTINGS-REFERENCE.md](./SETTINGS-REFERENCE.md), and every keybinding is in
[SHORTCUTS.md](./SHORTCUTS.md).

The menu bar is one Radix `Menubar` (shadcn wrapper over `@radix-ui/react-menubar`): 15
menus, hover-to-switch while open, real arrow-key navigation (←/→ between top-level menus),
submenus up to 3 levels (the Examples cascade), checkbox items with `Check` indicators,
every item carrying a native tooltip, `disabled` items dimmed rather than hidden. Trigger
badges: **Terminal** shows a live session-count pill, **Git** an amber dirty-count pill (capped "99+"), **Collaborate**
a Users icon + live "N peers" badge with a pulsing dot.
Menu labels follow the UI language (English/Arabic). Items communicate with `page.tsx`
through three channels: stable prop callbacks (handler absence is the disable gate),
window `CustomEvent`s with a nonce (so the two FolderTree instances dedupe), and direct
events from inside the bar (`praxis:format-current`, `praxis:lint-current`,
`praxis:git-stash-open`, `praxis:focus-command`, `praxis:ambient-mixer`). Kind gating uses
`capabilitiesForKind(selectedFileKind)` (canRun / canFormat / canLint / canRunInConsole /
canGotoLine / canBookmark) with the capability hint shown in tooltips.

## Table of contents

| Menu        | One-line summary                                                                 | Full table                                                                                                                              |
|-------------|----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| File        | "File menu — new, save, download, settings"                                      | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#file--file-menu--new-save-download-settings)                                                  |
| Edit        | "Edit menu — undo, redo, cut, copy, paste, find, format"                         | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#edit--edit-menu--undo-redo-cut-copy-paste-find-format)                                        |
| View        | "View menu — panels, navigation, editor chrome, zoom, refresh"                   | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#view--view-menu--panels-navigation-editor-chrome-zoom-refresh)                                |
| Window      | "Window menu — layout presets, panel visibility, reset"                          | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#window--window-menu--layout-presets-panel-visibility-reset)                                   |
| Terminal    | "Terminal menu — sessions, clear / kill, send selection"                         | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#terminal--terminal-menu--sessions-clear--kill-send-selection)                                 |
| Bookmarks   | "Bookmarks — jump to favorites and editor line bookmarks"                        | [MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md#bookmarks--bookmarks--jump-to-favorites-and-editor-line-bookmarks)                            |
| Run & Go    | "Run & Go menu — execute scripts, stop, debug, and navigate the project"         | [MENUS-RUN-AI-DATA.md](./MENUS-RUN-AI-DATA.md#run--go--run--go-menu--execute-scripts-stop-debug-and-navigate-the-project)               |
| AI          | "AI menu — chat, explain, improve, generate tests"                               | [MENUS-RUN-AI-DATA.md](./MENUS-RUN-AI-DATA.md#ai--ai-menu--chat-explain-improve-generate-tests)                                         |
| Data        | "Data menu — profile, chart preview, transform pipeline, SQL workbench"          | [MENUS-RUN-AI-DATA.md](./MENUS-RUN-AI-DATA.md#data--data-menu--profile-chart-preview-transform-pipeline-sql-workbench)                  |
| Tools       | "Tools menu — snippets, run history, accessibility, theme"                       | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#tools--tools-menu--snippets-run-history-accessibility-theme)                        |
| Git         | "Git menu — commit, history, branches, diffs"                                    | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#git--git-menu--commit-history-branches-diffs)                                       |
| Collaborate | Live-collaboration sessions                                                      | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#collaborate)                                                                        |
| Focus       | "Focus menu — concentration timers, ambient sounds, breaks and study statistics" | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#focus--focus-menu--concentration-timers-ambient-sounds-breaks-and-study-statistics) |
| Examples    | "Examples menu — create ready-to-run example files"                              | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#examples--examples-menu--create-ready-to-run-example-files)                         |
| Help        | "Help menu — shortcuts, trainer, tutorial, install, about, GitHub"               | [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md#help--help-menu--shortcuts-trainer-tutorial-install-about-github)                   |

## The 15 menus, item by item

The full tables live in the three sub-files above (menus 1–6 in
[MENUS-WORKSPACE.md](./MENUS-WORKSPACE.md), 7–9 in [MENUS-RUN-AI-DATA.md](./MENUS-RUN-AI-DATA.md),
10–15 in [MENUS-TOOLS-PLATFORM.md](./MENUS-TOOLS-PLATFORM.md)). Highlights per menu:

- **File** — New (folder, file, Upload ZIP as project), Open (project submenu with the
  dynamic project list + Default, browse, create, GitHub URL), Save/Save All/Close All,
  Download, Publish Snapshot Link, Settings.
- **Edit** — Undo/redo/clipboard (Python-only), Find/Replace/Find-in-Files, Format
  Document/Organize Imports/Auto-Indent, the 30-item Lines & Case cascade, and the three
  screenshot modes.
- **View** — Sidebar/Bottom/Terminal/AI-chat toggles, tabs-on-top, distraction-free,
  fullscreen, the 10-toggle Editor submenu, font zoom, refresh.
- **Window** — the 9 layout presets + Next preset, the split pane/AI chat/zen toggles,
  Reset Layout.
- **Terminal** — new shell / Python REPL sessions, clear, kill active/all, send selection,
  focus.
- **Bookmarks** — the dynamic jump list (favorites + line bookmarks, project-scoped, top
  12), bookmark-this-line, the management dialog.
- **Run & Go** — Run/Stop/Run All/Run with Coverage/Run in Console/Debug with
  Pdb/Tutor View/Record & Replay/Multi-Python/Line & Memory Profile/Run Queue/Scheduled
  Runs/Notify-on-finish, then the navigation group (go to file/project/line/symbol,
  Back/Forward, Recent files, Local file history).
- **AI** — open chat; Explain/Improve current file (with external-endpoint submenus);
  Generate AI Tests; Agent Mode; AI settings.
- **Data** — profile the current data file, Chart Preview, Transform Pipeline, SQL
  Workbench.
- **Tools** — format/lint current file, run all tests, the 11-format Export submenu,
  compress to ZIP, snippets + snippet manager, Developer Toolbox, Jump To, run history,
  dependency manager, project dictionary, the workbenches (DuckDB, API client, hex editor,
  AST explorer, bytecode inspector, docstring studio, task runner, extensions), compare
  tools, the Accessibility submenu, the Interface Theme submenu.
- **Git** — commit, history, branches, stashes, view changes, AI review, merge editor,
  status footer.
- **Collaborate** — share workspace, copy invite link, end session, settings.
- **Focus** — arm a session (4 presets + custom + begin), pause/skip/stop, ambient on/off
    + mixer, show/hide floating timer, focus settings, study statistics.
- **Examples** — the fully dynamic 3-level cascade over the ~5 MB embedded examples
  library (per language → category → subcategory), creating ready-to-run files.
- **Help** — shortcuts reference, shortcut trainer, tutorial, install as app, about the
  author, view on GitHub.

## The menu bar's right-side cluster

After a `flex-1` spacer, one horizontally-pannable strip (`max-w-[50%]`, wheel /
middle-click drag / Shift+wheel pan) holds the quick actions — 13 default-shown plus 19
opt-in extras (Settings → Nav → "Top-right quick actions"; a missing map key = shown,
`false` = hidden, explicit `true` turns on an extra):

- **Default-on** (13): Run (Play + entry-point badge + run-config chip) · Jump (Ctrl+Shift+J) · Screenshot split button
  (camera + chevron dropdown: window… / code… /
  region…, the default from `settings.defaultCaptureMode`) · Toolbox · Layout dropdown (9
  presets + Step to next + Reset) · Terminal toggle (aria-pressed) — divider — Search (Ctrl+K) · AI chat toggle
  (Sparkles, purple when open) · Run history (count badge, "99+")
  · Refresh (spins while refreshing) · Settings (⌘,) · Interface-theme dropdown (47 themes
  with swatches) · Active-project chip (Library icon + project name / "Default").
- **Opt-in extras** (19): command palette (⌘⇧P) · distraction-free (⇧F11) · run queue ·
  scheduler · go-to-file (⌘T) · bookmarks · dependency manager · jump list · project
  symbols · snippets (Ctrl+/) · snippet manager · local history · git log · git diff (violet
  dirty-count badge) · chart preview · SQL workbench · fullscreen (F11) · shortcut trainer ·
  shortcuts reference.

The interpreter/env pill, offline indicator, and focus-timer readout live elsewhere (status
bar / editor surfaces), not in this cluster.

## Feature areas at a glance

The 18 feature areas, each documented in depth in [README-FEATURES.md](./README-FEATURES.md)
and its four sub-files:

| Area                                                                                                              | Sub-file                                                                                     |
|-------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Core browsing · Code execution · Editor & diagnostics · Debugging · Navigation & discoverability · Run management | [FEATURES-CORE-EXECUTION.md](./FEATURES-CORE-EXECUTION.md)                                   |
| Sharing & export · Editor building blocks & examples · AI integration · Focus & ambience                          | [FEATURES-SHARING-AI-FOCUS.md](./FEATURES-SHARING-AI-FOCUS.md)                               |
| Non-.py studio & workspace power tools · Polish & accessibility · Performance & resilience                        | [FEATURES-TOOLS-ACCESSIBILITY.md](./FEATURES-TOOLS-ACCESSIBILITY.md)                         |
| Language intelligence (Python) · Collaboration & Git · Data & web workbenches · Extensions & platform             | [FEATURES-LANGUAGE-COLLAB-DATA-EXTENSIONS.md](./FEATURES-LANGUAGE-COLLAB-DATA-EXTENSIONS.md) |
