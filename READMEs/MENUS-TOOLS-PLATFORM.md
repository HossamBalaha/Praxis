# Menus 10–15: Tools, Git, Collaborate, Focus, Examples, Help

Back to the [features overview](./FEATURES-OVERVIEW.md).

## Tools — "Tools menu — snippets, run history, accessibility, theme"

Content width `w-64`; groups: Code Quality / Export & Share / Utilities / Workbenches /
Compare / Appearance & Access.

| Item                                                                                                                   | Shortcut | Action / Event                                                                                                                       | Condition               |
|------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------|-------------------------|
| *(group)* **Code Quality**                                                                                             |          |                                                                                                                                      |                         |
| Format Current File                                                                                                    | ⌘⇧F      | direct `window.dispatchEvent("praxis:format-current")` (page listens)                                                                | `caps.canFormat`        |
| Lint Current File                                                                                                      | —        | direct `"praxis:lint-current"` (ruff → the Diagnostics tab)                                                                          | `caps.canLint` (python) |
| Run All Tests…                                                                                                         | —        | `onRunAllTests` (pytest, structured report)                                                                                          | —                       |
| Export ▸ *(submenu — rendered only if any export handler is present; each item needs handler + `exportCaps.has(fmt)`)* |          |                                                                                                                                      |                         |
| ↳ Markdown Report…                                                                                                     | —        | `onExportMd`                                                                                                                         | `md` capability         |
| ↳ Jupyter Notebook…                                                                                                    | —        | `onExportIpynb`                                                                                                                      | `ipynb`                 |
| ↳ Standalone HTML…                                                                                                     | —        | `onExportHtml`                                                                                                                       | `html`                  |
| ↳ Plain Text…                                                                                                          | —        | `onExportTxt`                                                                                                                        | `txt`                   |
| ↳ JSON Bundle…                                                                                                         | —        | `onExportJson`                                                                                                                       | `json`                  |
| ↳ PDF (Print)…                                                                                                         | —        | `onExportPdf`                                                                                                                        | `pdf`                   |
| ↳ Session Report (HTML)…                                                                                               | —        | `onExportSessionReport`                                                                                                              | `session`               |
| ↳ LaTeX Report (.tex)…                                                                                                 | —        | `onExportLatex`                                                                                                                      | `latex`                 |
| ↳ reStructuredText (.rst)…                                                                                             | —        | `onExportRst`                                                                                                                        | `rst`                   |
| ↳ Copy As Markdown                                                                                                     | —        | `onCopyAsMarkdown`                                                                                                                   | `copy-md`               |
| ↳ GitHub-Ready Repo (.zip)…                                                                                            | —        | `onExportGithubRepo`                                                                                                                 | `github`                |
| ↳ Compress File To ZIP…                                                                                                | —        | `onCompressFile` (the shared compress dialog)                                                                                        | handler presence        |
| ↳ Compress Folder To ZIP…                                                                                              | —        | `onCompressFolder`                                                                                                                   | handler presence        |
| *(group)* **Utilities**                                                                                                |          |                                                                                                                                      |                         |
| Snippets…                                                                                                              | Ctrl+/   | `onOpenSnippets` (the palette)                                                                                                       | —                       |
| Snippet Manager…                                                                                                       | —        | `onOpenSnippetManager` (CRUD + packs)                                                                                                | —                       |
| Developer Toolbox…                                                                                                     | —        | `onOpenDevToolbox()` (converters/encoders/hashes/UUID/time/color/cron/regex/diff/escape/faker; shared TOOLBOX icon)                  | —                       |
| Jump To…                                                                                                               | ⌘⇧J      | `onOpenJumpList` (the overlay: pinned/favorites/recents/folders/last runs)                                                           | —                       |
| Run History… (+count, "99+")                                                                                           | ⌘⇧H      | `onOpenHistory`                                                                                                                      | —                       |
| Dependency Manager…                                                                                                    | —        | `onOpenDependencyManager`                                                                                                            | —                       |
| Project Dictionary…                                                                                                    | —        | `onOpenProjectDictionary` (`.praxis/spell-ignore.json`)                                                                              | —                       |
| *(group)* **Workbenches**                                                                                              |          |                                                                                                                                      |                         |
| DuckDB Workbench…                                                                                                      | —        | `onOpenDuckdbWorkbench` (SQL over parquet/csv/feather)                                                                               | —                       |
| API Client (.http)…                                                                                                    | —        | `onOpenApiClient` (an untitled in-memory `.http` draft)                                                                              | —                       |
| Hex Editor…                                                                                                            | —        | `onOpenHexEditor`                                                                                                                    | —                       |
| AST Explorer…                                                                                                          | —        | `onOpenAstExplorer`                                                                                                                  | python-only             |
| Bytecode Inspector…                                                                                                    | —        | `onOpenBytecodeInspector`                                                                                                            | python-only             |
| Docstring Studio…                                                                                                      | —        | `onOpenDocstringStudio`                                                                                                              | python-only             |
| Task Runner Panel…                                                                                                     | —        | `onOpenTaskRunner` (npm/Make/justfile/pyproject tasks)                                                                               | —                       |
| Extensions…                                                                                                            | —        | `onOpenExtensions` (sandboxed mini-plugins)                                                                                          | —                       |
| *(group)* **Compare**                                                                                                  |          |                                                                                                                                      |                         |
| Compare Two Files…                                                                                                     | —        | `onOpenCompareFiles` (side-by-side diff)                                                                                             | —                       |
| Cancel Compare                                                                                                         | —        | `onCancelCompare` (page closes all compare dialogs + dispatches `praxis:cancel-compare`)                                             | `compareOpen`           |
| *(group)* **Appearance & Access**                                                                                      |          |                                                                                                                                      |                         |
| Accessibility ▸ *(submenu w-72 — 14 checkbox/plain items)*                                                             |          | each `onToggle*` with `a11yState.*` checked                                                                                          |                         |
| ↳ High-Contrast Mode                                                                                                   | —        | `onToggleHighContrast`                                                                                                               |                         |
| ↳ Large Text Mode (125%)                                                                                               | —        | `onToggleLargeText`                                                                                                                  |                         |
| ↳ Increase Code Font Size                                                                                              | —        | `onToggleFontIncrease`                                                                                                               |                         |
| ↳ Decrease Code Font Size                                                                                              | —        | `onToggleFontDecrease`                                                                                                               |                         |
| ↳ Dyslexia-Friendly Mode                                                                                               | —        | `onToggleDyslexia`                                                                                                                   |                         |
| ↳ Color-Blind Mode (Blue/Orange)                                                                                       | —        | `onToggleColorBlind`                                                                                                                 |                         |
| ↳ Screen Reader Mode                                                                                                   | —        | `onToggleScreenReader`                                                                                                               |                         |
| ↳ Reduce Motion                                                                                                        | —        | `onToggleReduceMotion`                                                                                                               |                         |
| ↳ Enhanced Focus Rings                                                                                                 | —        | `onToggleEnhancedFocus`                                                                                                              |                         |
| ↳ Wrap Tab Navigation                                                                                                  | —        | `onToggleWrapTab`                                                                                                                    |                         |
| ↳ Always Show Shortcut Hints                                                                                           | —        | `onToggleAlwaysShowShortcuts`                                                                                                        |                         |
| ↳ Sticky Cursor Indicator                                                                                              | —        | `onToggleStickyCursor`                                                                                                               |                         |
| ↳ Highlight Current Line                                                                                               | —        | `onToggleHighlightCurrentLine`                                                                                                       |                         |
| ↳ Show Whitespace Characters                                                                                           | —        | `onToggleShowWhitespace`                                                                                                             |                         |
| ↳ Open Full Settings…                                                                                                  | ⌘,       | `onOpenSettings()`                                                                                                                   |                         |
| Interface Theme ▸ *(submenu w-60; trigger: Sun/Moon + active theme label)*                                             |          | dynamic `UI_THEMES.map`: swatch + label + check on active → `onSetUiTheme(t.id)` (writes the setting + flips the next-themes family) |                         |

## Git — "Git menu — commit, history, branches, diffs"

Content width `w-64`; the trigger shows the amber dirty-count pill ("99+" cap). Groups:
Repository / Compare.

| Item                           | Action / Event                                              | Condition           |
|--------------------------------|-------------------------------------------------------------|---------------------|
| *(group)* **Repository**       |                                                             |                     |
| Commit…                        | `onOpenCommit` (the stage + commit dialog)                  | —                   |
| Commit History…                | `onOpenGitLog`                                              | —                   |
| Branches…                      | `onOpenBranchPicker` (list/create/checkout/delete)          | —                   |
| Stashes…                       | direct `"praxis:git-stash-open"` (the stash dialog listens) | always enabled      |
| View Changes… (+ "N modified") | `onOpenGitDiff` (the Git Diff bottom tab)                   | —                   |
| Review Changes With AI…        | `onOpenAiReview` (hunk-by-hunk inline AI comments)          | `gitDirtyCount > 0` |
| Resolve In Merge Editor…       | `onOpenMergeEditor` (three-way: Ours/Base/Theirs)           | —                   |
| *(group)* **Compare**          |                                                             |                     |
| Compare Two Files…             | same as Tools                                               | —                   |
| Cancel Compare                 | same as Tools                                               | `compareOpen`       |
| Status footer (disabled item)  | "N file(s) with uncommitted changes" / "Working tree clean" | —                   |

## Collaborate

Content width `w-64`; the trigger shows a Users icon + the live "N peers" badge when a
session is active.

| Item                       | Action / Event                                                                 | Condition                     |
|----------------------------|--------------------------------------------------------------------------------|-------------------------------|
| *(group)* **Live session** |                                                                                |                               |
| Share Workspace…           | `onCollabShareWorkspace` (an SSE room; guest cursors/presence/follow)          | disabled while `collabActive` |
| Copy Invite Link           | `onCollabCopyInvite` (clipboard)                                               | requires `collabActive`       |
| End Session                | `onCollabEndSession` (disconnect the guests)                                   | requires `collabActive`       |
| Collaboration Settings…    | `onOpenSettings("collaboration")` (display name/cursor color/guest permission) | —                             |

## Focus — "Focus menu — concentration timers, ambient sounds, breaks and study statistics"

Content width `w-64`; every item sits in a styled `Tip` tooltip (250 ms). The timer
commands are `praxis:focus-command` CustomEvents `{detail: {command, preset?}}` handled by
the FocusSessions widget.

| Item                                               | Badge kbd | Event detail                                                                                         | Condition |
|----------------------------------------------------|-----------|------------------------------------------------------------------------------------------------------|-----------|
| *(group)* **Arm A Session (Starts On Your Click)** |           |                                                                                                      |           |
| Pomodoro 25/5                                      | 25m       | `{command: "start", preset: "pomodoro"}`                                                             | —         |
| 52 / 17 Rule                                       | 52m       | `{…, preset: "classic5217"}`                                                                         | —         |
| Deep Work 90                                       | 90m       | `{…, preset: "deepwork"}`                                                                            | —         |
| Custom Session                                     | —         | `{…, preset: "custom"}`                                                                              | —         |
| Start Countdown                                    | —         | `{command: "begin"}`                                                                                 | —         |
| *(group)* **Session Control**                      |           |                                                                                                      |           |
| Start · Pause · Resume                             | —         | `{command: "pause-resume"}`                                                                          | —         |
| Skip Phase                                         | —         | `{command: "skip"}`                                                                                  | —         |
| Stop Session                                       | —         | `{command: "stop"}`                                                                                  | —         |
| *(group)* **Ambient Sounds (No Timer Needed)**     |           |                                                                                                      |           |
| Ambient Sounds On/Off ☑ (+ "N in mix")            | —         | `toggleAmbient()` via the shared engine (toasts "Ambient sounds unavailable" if WebAudio is blocked) | —         |
| Ambient Mixer… (+ "N on")                          | —         | direct `"praxis:ambient-mixer"` (the mixer dialog)                                                   | —         |
| *(group)* **Timer & Statistics**                   |           |                                                                                                      |           |
| Show / Hide Floating Timer                         | —         | `{command: "show"}` / `{command: "hide"}`                                                            | —         |
| Focus Settings…                                    | —         | `{command: "settings"}`                                                                              | —         |
| Study Statistics…                                  | —         | `{command: "stats"}`                                                                                 | —         |

## Examples — "Examples menu — create ready-to-run example files"

Content width `w-72`; fully **dynamic** cascade fed by the lazy `useExamples()` chunk (the
~5 MB embedded examples library). Structure: one submenu per **language** (label + total
example count) → submenu per **category** (label + count) → optional **subcategory** level;
single-category languages (R, SQL, JSON, YAML, Shell) skip the category level. Leaf lists
are 3–28 items; subcontents are `max-h` + `overflow-y-auto` (440/420/380 px).

The leaf `ExampleMenuItem` shows the language icon (python FileCode2 emerald, markdown
FileText sky, text FileText muted, r FileCode2 blue, sql Database indigo, shell Terminal
teal, yaml Braces amber, matlab SquareSigma orange, "Web Design" Palette fuchsia else
CodeXml cyan, `.gitignore` FileMinus red, `.csv` Table amber, else Braces) and calls
`onCreateExample(ex.id)` — disabled if the handler is missing; it creates the ready-made
file into the selected/first folder, and names follow Settings → Editor → naming style.
The footer hint item states it: "Created in the selected folder · names follow your naming
style."

## Help — "Help menu — shortcuts, trainer, tutorial, install, about, GitHub"

Content width `w-56`; groups: Getting Started / About.

| Item                          | Action / Event                                                                                         | Condition                                                                          |
|-------------------------------|--------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| *(group)* **Getting Started** |                                                                                                        |                                                                                    |
| Keyboard Shortcuts…           | `onShowShortcuts` (the ShortcutsDialog reference; custom rebinds shown with a "custom" badge)          | —                                                                                  |
| Shortcut Trainer…             | `onOpenShortcutTrainer` (browse + practice)                                                            | —                                                                                  |
| Show Tutorial…                | `onOpenTutorial` (the 5-step walkthrough)                                                              | —                                                                                  |
| Install As App…               | `onInstallApp` (the PWA prompt)                                                                        | handler passed only when an install offer is pending (Chromium, not yet installed) |
| *(group)* **About**           |                                                                                                        |                                                                                    |
| About The Author…             | local `AboutAuthorDialog` (the Hossam Magdy Balaha profile; Website/GitHub/Scholar/Email-copy buttons) | —                                                                                  |
| View On GitHub                | `window.open("https://github.com/HossamBalaha/Praxis")`                                                | —                                                                                  |
