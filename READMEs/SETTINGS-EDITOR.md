# Settings — Tab 1: Editor (67 rows)

Back to the [settings index](./SETTINGS-REFERENCE.md). The Editor tab is organized into
eight sections with sub-headers; rows marked *(static)* have no control. Every default
below is read from `DEFAULT_SETTINGS` in `src/lib/settings.ts`.

## Interface

| Key               | Label           | Control       | Default   | Range/Options                                                                          | What it does                                                                                                                                |
|-------------------|-----------------|---------------|-----------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `uiTheme`         | Interface theme | Select (w-52) | `"light"` | 47 UI themes (20 light + 27 dark — [catalogue](./README-SETTINGS.md#theme-catalogues)) | App-wide chrome look (menus/panels/dialogs); applied live, restored on cancel; the same picker exists on the menu bar's right-side cluster. |
| `modalResizeMode` | Modal resizing  | Select        | `"free"`  | free / ratio                                                                           | How resizable dialogs resize: Free = independent edges; Ratio = proportional corner drags.                                                  |

## Code viewer

| Key                                 | Label                                       | Control         | Default          | Range/Options                                                   | What it does                                                                                                                      |
|-------------------------------------|---------------------------------------------|-----------------|------------------|-----------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `showPerRunFlags`                   | Show the per-run Capture picker             | Switch          | `true`           | —                                                               | Per-run Capture picker (Vars · Frames · Coverage + Stdin/Args/Env) in the run-input strip below the editor tabs.                  |
| `defaultSortMode`                   | Default sort mode                           | Select          | `"alpha"`        | alpha / mtime                                                   | File sorting: alphabetical or modification time.                                                                                  |
| `codeSyntaxTheme`                   | Code syntax theme                           | Select          | `"follow"`       | 24 options ([catalogue](./README-SETTINGS.md#theme-catalogues)) | The code viewer's Prism highlighting theme; "Follow global" tracks the interface theme.                                           |
| `showLineNumbers`                   | Show line numbers                           | Switch          | `true`           | —                                                               | Line numbers in the code viewer.                                                                                                  |
| `vimMode`                           | Vim mode                                    | Switch          | `false`          | —                                                               | Modal editing (normal/insert/visual, counts, operators, registers, marks, macros, `:commands`); the mode shows in the status bar. |
| `defaultOutputTheme`                | Default output theme                        | Select          | `"midnight"`     | 8 options ([catalogue](./README-SETTINGS.md#theme-catalogues))  | The output panel theme.                                                                                                           |
| `codeCollapsedByDefault`            | Collapsed by default                        | Switch          | `true`           | —                                                               | The code viewer opens collapsed ("Show less" clip) when a script is selected.                                                     |
| `codeWordWrap`                      | Word wrap                                   | Switch          | `false`          | —                                                               | Word wrap in the code viewer.                                                                                                     |
| `formatPostIfParentheses`           | Formatting: parenthesize if/elif conditions | Switch          | `true`           | —                                                               | Post-pass on Format Document/Selection/auto-format: `if x > 3:` → `if (x > 3):`.                                                  |
| `formatPostFinalNewline`            | Formatting: final newline                   | Switch          | `true`           | —                                                               | Guarantees exactly one trailing newline after formatting.                                                                         |
| `indentStyle` + `editorIndentWidth` | Indentation                                 | Select + Select | `"spaces"` + `2` | spaces / tab; width 2/4/8 (width disabled when Tab)             | Drives the editor Tab key, Enter auto-indent, Insert blocks, and generated examples.                                              |
| `autoFormatOnSave`                  | Auto-format on save (black)                 | Switch          | `false`          | —                                                               | Runs black before writing Python files.                                                                                           |
| `organizeImportsOnSave`             | Organize imports on save (ruff)             | Switch          | `false`          | —                                                               | ruff `--select I --fix` import pass before the format pass; requires ruff, no fallback.                                           |
| `trimTrailingOnSave`                | Trim trailing whitespace on save            | Switch          | `false`          | —                                                               | Strips end-of-line whitespace on every write.                                                                                     |
| `finalNewlineOnSave`                | Final newline on save                       | Switch          | `false`          | —                                                               | Exactly one `\n` at end-of-file on every save.                                                                                    |
| `rainbowBrackets`                   | Rainbow brackets + pair guides              | Switch          | `false`          | —                                                               | Bracket coloring by depth plus pair guides, in view and edit mode.                                                                |
| `showRecentFiles`                   | Show the Recent files section               | Switch          | `true`           | —                                                               | Recently modified files pinned at the top of the explorer.                                                                        |
| `explorerShowTags`                  | Show #tags in the explorer                  | Switch          | `true`           | —                                                               | `# tags:` chips on folder headers and per-file rows.                                                                              |
| `explorerShowHidden`                | Show hidden files                           | Switch          | `false`          | —                                                               | Dot-files and `.praxis/` in the tree (the explorer's eye-toggle twin).                                                            |
| `recentFilesCount`                  | Recent files count                          | Select          | `5`              | 3 / 5 / 8 / 10 / 15 / 20 (disabled unless `showRecentFiles`)    | Entries kept in the Recent section.                                                                                               |
| `bottomTabsPosition`                | Bottom panel tabs position                  | Select          | `"left"`         | top / left                                                      | Output/Diagnostics/Notes strip layout (left = vertical rail).                                                                     |
| `bottomTabsIconOnly`                | Bottom panel tab labels                     | Select          | `"icon+name"`    | icon+name / icons only                                          | Tab strip text versus icons.                                                                                                      |
| `favHighlightSeconds`               | New-favorite highlight (seconds)            | Number input    | `10`             | 0–300 (clamped); 0 = no highlight                               | How long a fresh favorite keeps its ring + bold name.                                                                             |
| `warnNoPython`                      | Warn when Python is missing                 | Switch          | `true`           | —                                                               | Startup toast when no interpreter is found.                                                                                       |
| `enableScriptNotes`                 | Enable per-script notes                     | Switch          | `true`           | —                                                               | Per-script notes (localStorage-backed).                                                                                           |

*(Sub-headers inside Code viewer: "Format document", "Indentation & save hygiene",
"Explorer & panel layout".)*

## Typography

| Key                 | Label                    | Control         | Default | Range/Options       | What it does                                              |
|---------------------|--------------------------|-----------------|---------|---------------------|-----------------------------------------------------------|
| `codeFontSize`      | Code font size (px)      | Number input    | `13`    | 10–20 (NaN-guarded) | Code font size; ruler and overlay measurements follow it. |
| `codeLineHeight`    | Line height              | Slider + number | `1.6`   | 1.2–2.0, step 0.05  | Vertical code spacing.                                    |
| `codeLetterSpacing` | Letter spacing (px)      | Slider + number | `0`     | −0.5–2, step 0.1    | Glyph spacing; 0 = font default.                          |
| `codeLigatures`     | Font ligatures (≠ ≤ ≥ →) | Switch          | `true`  | —                   | JetBrains Mono contextual ligatures.                      |

## Naming style (applies to Examples, templates and new files)

Five selects, each with the same options and a live example: snake_case `process_data` ·
camelCase `processData` · PascalCase `ProcessData` · kebab-case `process-data` ·
UPPER_SNAKE `PROCESS_DATA`.

| Key                    | Label                   | Default      | Applies to                                   |
|------------------------|-------------------------|--------------|----------------------------------------------|
| `namingStyleVariables` | Variables               | `camelCase`  | Insert-block and example variable names.     |
| `namingStyleFunctions` | Functions               | `PascalCase` | Generated function/method names.             |
| `namingStyleClasses`   | Classes                 | `PascalCase` | Generated class names.                       |
| `namingStyleDictKeys`  | Dict keys / JSON fields | `camelCase`  | Generated dict keys / JSON fields.           |
| `namingStyleFiles`     | File names              | `PascalCase` | Names of files created by the Examples menu. |

## Editor assistance & files

| Key                   | Label                                                   | Control                    | Default | Range/Options                    | What it does                                                                           |
|-----------------------|---------------------------------------------------------|----------------------------|---------|----------------------------------|----------------------------------------------------------------------------------------|
| `showSymbolOutline`   | Show symbol outline (functions/classes)                 | Switch                     | `true`  | —                                | The Go-to-symbol/outline dropdown.                                                     |
| `inlineDiagnostics`   | Inline diagnostics (squiggly underlines from ruff/mypy) | Switch                     | `true`  | —                                | Inline squiggles.                                                                      |
| `showGitDiffGutter`   | Show git diff gutter markers                            | Switch                     | `true`  | —                                | Git diff gutter in the editor.                                                         |
| `showBlameGutter`     | Show the git blame gutter                               | Switch                     | `false` | —                                | Author + age per line group; hover shows the commit.                                   |
| `showPerfHud`         | Show the performance HUD                                | Switch                     | `false` | —                                | FPS / keystroke-to-paint / SSE / render-count overlay.                                 |
| `autoSaveDelayMs`     | Auto-save delay (ms)                                    | Segmented presets + number | `0`     | presets Off/1s/5s/30s; input ≥ 0 | Inactivity auto-save; 0 = disabled.                                                    |
| `outputSearchEnabled` | Show search/filter in output panel                      | Switch                     | `true`  | —                                | The output panel's search box.                                                         |
| `collapsibleOutput`   | Auto-fold runs of identical output lines                | Switch                     | `true`  | —                                | Identical-line folding.                                                                |
| `outputWordWrap`      | Output word wrap                                        | Switch                     | `true`  | —                                | Soft wraps (a right-click toggle overrides locally).                                   |
| `outputBufferLimit`   | Output render limit (lines)                             | Number input               | `10000` | ≥ 0; 0 = no limit                | Max rendered stdout/stderr lines (display only; copy/export always get the full text). |
| `dragDropUpload`      | Enable drag-drop file upload (.py / .ipynb)             | Switch                     | `true`  | —                                | Page-wide drag-drop import.                                                            |

*(Sub-header "Output panel".)*

## Editor & prose

| Key                     | Label                                       | Control                                    | Default         | Range/Options                                                                | What it does                                                          |
|-------------------------|---------------------------------------------|--------------------------------------------|-----------------|------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| `stickyScroll`          | Sticky scroll (headers pin while scrolling) | Switch                                     | `true`          | —                                                                            | Innermost def/class header pinned at top (VS Code style).             |
| `hoverSymbolTooltips`   | Symbol hover tooltips                       | Switch                                     | `false`         | —                                                                            | Floating diagnostic/docstring card on Python line hover (view mode).  |
| `showBreadcrumbs`       | Symbol-path breadcrumbs                     | Switch                                     | `true`          | —                                                                            | module > class > function bar above the editor.                       |
| `indentGuides`          | Indent guides                               | Switch                                     | `true`          | —                                                                            | Vertical lines per indent level.                                      |
| `typewriterScroll`      | Typewriter scrolling                        | Switch                                     | `false`         | —                                                                            | Keeps the caret vertically centered while typing.                     |
| `markdownStudioDefault` | Markdown studio for editing                 | *(static — "Built-in — no toggle needed")* | `true` (schema) | —                                                                            | The edit side of `.md` is always the split studio.                    |
| `codeLens`              | Code Lens                                   | Switch                                     | `true`          | —                                                                            | ▶ Run · Usages · Rename · Tests chips at each top-level def/class.    |
| `tabSnippetExpansion`   | Tab expands snippets                        | Switch                                     | `true`          | —                                                                            | Tab after a trigger word inserts the snippet body.                    |
| `spellCheck`            | Spell check markdown & text files           | Switch                                     | `true`          | —                                                                            | Wavy-red misspellings; click one to add it to the project dictionary. |
| `spellSuggestions`      | Show fixing suggestions                     | Switch                                     | `true`          | —                                                                            | Near-matches in the misspelled-word popover.                          |
| `spellSuggestionCount`  | Suggestions shown                           | Number input                               | `3`             | 1–8 (disabled unless `spellSuggestions`)                                     | Popover suggestion count.                                             |
| `spellLanguage`         | Dictionary                                  | Select                                     | `"auto"`        | auto + 7 pinned ([catalogue](./README-SETTINGS.md#spell-check-dictionaries)) | The dictionary sent as `dict` to `/api/spell`.                        |

## Column ruler

| Key                    | Label            | Control      | Default                 | Range/Options                                | What it does                                                                |
|------------------------|------------------|--------------|-------------------------|----------------------------------------------|-----------------------------------------------------------------------------|
| `rulerColumn` (master) | Ruler            | Switch       | on (`rulerColumn = 80`) | —                                            | Master switch: off parks the column into `rulerLastColumn`; on restores it. |
| `rulerColumn`          | Column ruler     | Number input | `80`                    | 0–120 (0 = off); >0 writes `rulerLastColumn` | The faint vertical guide column (all code files, view + edit).              |
| `rulerLineWidth`       | Ruler line width | Number input | `1`                     | 1–6 px                                       | Ruler thickness.                                                            |

## Data file tables

| Key                       | Label                  | Default | What it does                                                                    |
|---------------------------|------------------------|---------|---------------------------------------------------------------------------------|
| `dataTableZebra`          | Zebra rows             | `true`  | Alternating row shading in the CSV/Excel/parquet viewers.                       |
| `dataTableColoredHeader`  | Colored header         | `true`  | Emerald sticky header band.                                                     |
| `dataTableColoredNumbers` | Colored numbers        | `true`  | Negatives red / positives green, right-aligned, booleans blue, NaN gray-italic. |
| `dataTableStatsBand`      | Column statistics band | `true`  | Per-column min/max/mean/unique/missing badges; the missing badge filters rows.  |

## Testing

| Key               | Label               | Default | What it does                                                                                                          |
|-------------------|---------------------|---------|-----------------------------------------------------------------------------------------------------------------------|
| `testWatchOnSave` | Watch tests on save | `false` | The Tests panel re-runs affected test files per saved `.py` (800 ms debounce); feeds gutter marks + the footer badge. |

**Total: 67 rows** (one static no-control row: Markdown studio).
