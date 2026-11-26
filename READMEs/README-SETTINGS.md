# Praxis — Settings Reference

The prose guide to the 15 settings tabs, plus the theme/language/dictionary catalogues.
The complete row-by-row catalog with every key, default, and option lives in
[SETTINGS-REFERENCE.md](./SETTINGS-REFERENCE.md) and its per-tab files. Open the dialog
with ⌘, (File ▸ Settings…, or the right-edge button).

## The 15 tabs

### 1. Editor (67 searchable settings)

Interface theme (47 UI themes) and modal resizing; the code-viewer group (per-run Capture
picker, sort mode, syntax theme, line numbers, Vim mode, output theme, collapse-by-default,
word wrap, Python format post-passes, indentation style/width, save hygiene — auto-format /
organize imports / trim trailing / final newline, rainbow brackets, Recent files, #tags,
hidden files, recent-files count, bottom-panel tab position/labels, favorite highlight,
warn-when-Python-missing, per-script notes); typography (font size 10–20 px, line height
1.2–2.0, letter spacing, ligatures); the naming-style block for generated identifiers (variables/functions/classes/dict
keys/file names × snake_case/camelCase/PascalCase/
kebab-case/UPPER_SNAKE); editor assistance (symbol outline, inline diagnostics, git diff
gutter, blame gutter, perf HUD, auto-save delay, output panel search/folding/wrap/limit,
drag-drop upload); editor & prose (sticky scroll, hover tooltips, breadcrumbs, indent
guides, typewriter scrolling, Code Lens, the column ruler trio, snippet expansion, spell
check + suggestions + dictionary); data-file table styling (zebra, colored header, colored
numbers, stats band); and watch-tests-on-save.
→ [SETTINGS-EDITOR.md](./SETTINGS-EDITOR.md)

### 2. Formatting (13 global + 3 Python + 37 language blocks)

Global formatter hygiene for all languages (indent width, switch-to-editor delay, final
newline, trim trailing, collapse blank runs + max blank lines, trim leading blanks,
indent style + tab width, prose wrapping + column, line-ending normalization,
fence-skipping hygiene, minified-data expansion, auto-format-on-save); the live
installed-and-detected **language runtimes panel** with a Check again button; the Python
block (quote style, space after commas, boolean casing); and **37 per-language blocks** —
markdown/html/toml/json/css/sql each carry extra options, every block carries indent width

+ format-on-save selects, with runtime dots showing which languages can actually execute.
  → [SETTINGS-FORMATTING.md](./SETTINGS-FORMATTING.md)

### 3. Python (20)

Interpreter discovery (venvs, conda, pyenv, uv, system) with the scientific-stack probe;
Create Venv action; run timeout (5–600 s), interactive stdin, max output bytes, Run-All
confirmation, run-duration warning threshold, finish notifications (mode + failures +
chime volume), auto-run on file change; type checking power mode + strictness profile +
dmypy; profiler mode; docstring style; branch coverage, coverage fail-under, Hypothesis
tests, tutor-view suggestions. → [SETTINGS-PYTHON.md](./SETTINGS-PYTHON.md)

### 4. Collaboration (4)

Display name, cursor color (8 swatches), guest permission (read/edit), follow-mode default
— editing the collab store directly (persisted per change), with a pointer to the
Collaborate menu's session actions. → [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-4--collaboration)

### 5. Focus (12 rows + the ambient mixer)

Presets (Pomodoro 25/5, 52/17 rule, Deep work 90, custom) + focus/short lengths, daily
goal, auto-chain, chime/toast/tab-title signals, ring vs bar, compact widget, Zen mode,
ambient-with-focus; the ambient section with the master switch, master volume, the mixer
launcher, and all 105 synthesized tracks across 8 categories with per-track sliders and 24
quick-blends. → [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-5--focus)

### 6. AI

OpenAI-compatible chat providers (cards with Test buttons, 7 quick-add presets — Ollama,
LM Studio, vLLM, llama.cpp, Z.AI API, OpenRouter, Custom — plus server-side key storage via
`/api/ai-keys`); the integrated assistant rows (completion popup, verify-model, Enter
sends, system prompt, context chars, max messages, completion debounce); sampling lives in
the sidebar's Tuning popover; external Ask-AI endpoints + the question template.
→ [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-6--ai)

### 7. Nav (6 rows + 32 quick-action switches)

Full-text search by default, git status badges, file size / last-run dot in dropdowns,
session restore, footer word count; and the 32 top-right quick-action switches — 13
default-shown, 19 opt-in. → [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-7--nav)

### 8. Accessibility (11)

Interface language (English / العربية); vision & readability (high contrast, large text,
dyslexia-friendly, color-blind palette, reduce motion); interaction & assistive tech (screen reader, enhanced focus
rings, sticky cursor, always-show shortcut hints, wrap Tab
navigation). → [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-8--accessibility)

### 9. Capture (10)

Python run capture (inspect variables, capture DataFrames, trace coverage); screenshot
capture — the default mode (window / code / selection), theme (auto + 15 palettes), image
quality 50–100%, storage DPI (72–600), format (png/jpg/webp).
→ [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-9--capture)

### 10. Media (8)

Slideshow (interval, transition, loop, auto-start) + playback defaults (rate 0.25–4×,
autoplay, default volume,
loop). → [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-10--media)

### 11. Backup (actions + 3 profiles)

Clear output cache / run history (both confirmed); Export/Import the project's `.praxis`
settings zip; and the Student / Pro / Minimal one-click profile bundles.
→ [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-11--backup)

### 12. Cache (5)

Auto-load cached output, cache TTL (7 days default), history max entries, action
notifications, toast
duration. → [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-12--cache)

### 13. Advanced (15)

Panel & run behavior (default bottom tab, auto-switch on run/error, run mode, close
confirmations, auto-save on blur, cursor position in footer); editor enhancements (code
folding, minimap, worker highlighting, current-line highlight, extensions, whitespace,
max-line-length hint); the sidebar folder-size stat.
→ [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-13--advanced)

### 14. Project

Save-as / clear project overrides, and the dynamic active-overrides list with per-key Reset
To Global — the `.praxis/settings.json` surface that travels with the project.
→ [SETTINGS-PROJECT-SHORTCUTS.md](./SETTINGS-PROJECT-SHORTCUTS.md#tab-14--project)

### 15. Shortcuts

The dynamic rebind table for the 52 registered shortcuts, with conflict detection and
per-row reset. → [SETTINGS-PROJECT-SHORTCUTS.md](./SETTINGS-PROJECT-SHORTCUTS.md#tab-15--shortcuts)

## Theme catalogues

Three independent theme families:

- **Interface UI themes** (`uiTheme`, 47 ids — 20 light + 27 dark; the menu-bar dropdown
  and Settings → Editor): light family — Praxis Light, VS Code Light, GitHub Light, One
  Light, Quiet Light, Nord Light, Material Lighter, Ayu Light, Everforest Light, Catppuccin
  Latte, Solarized Light, Gruvbox Light, Paper Sepia, High Contrast Light, Alabaster,
  Tomorrow, Horizon Light, Rosé Pine Dawn, Winter Is Coming (Light), Blueprint; dark
  family — Praxis Dark, One Dark, VS Code Dark+, Monokai, Dracula, Nord, Gruvbox Dark,
  Solarized Dark, Tokyo Night, Rosé Pine, GitHub Dark, Catppuccin Mocha, Catppuccin
  Frappé, Ayu Dark, Everforest Dark, Kanagawa Wave, Moonlight, Shades of Purple, Vesper,
  Synthwave '84, High Contrast Dark, Night Owl, Material Ocean, Arc Dark, Rosé Pine Moon,
  Panda Syntax, Terminal Green.
- **Code syntax themes** (`codeSyntaxTheme`, 24 — `praxis.code-theme` storage): Follow
  global (default), One Dark, One Light, Dracula, VS Code Dark+, Nord, Night Owl, Material
  Oceanic, Material Dark, Material Light, Gruvbox Dark, Gruvbox Light, Tomorrow, Twilight,
  Atom Dark, GitHub Colors, Solarized Light, Duotone Dark, Duotone Light, Duotone Sea,
  Duotone Space, Duotone Forest, Duotone Earth, A11y Dark. Resolution order: explicit local
  pick → the settings default (unless "follow") → follow the global interface theme.
- **Output themes** (`defaultOutputTheme`, 8 — `praxis.output-theme` storage): Midnight (#0d1117, default), Daylight,
  Dracula, Solarized Dark, Solarized Light, Monokai, Matrix (black/emerald), GitHub Dark — each styles
  panel/swatch/stdout/stderr/error/warning/info/
  diff.

## UI language

`language` (localStorage `praxis.language`): **English** (`en`, default) and **العربية (Arabic)** (`ar`). Arabic flips
the shell to RTL and translates the 15 menu names, the 7
bottom-panel tabs, Run/Stop/Save buttons, "Explorer", and the AI-chat chrome (title,
placeholder, send/stop/clear/search/export/tuning) plus the Ask-AI labels. Scaffold scope:
dialogs/settings/tooltips stay English; missing keys fall back to English.

## Spell-check dictionaries

`spellLanguage` (sent to `POST /api/spell` as `dict`): **auto** (per-file language
detection via stopword fingerprints) plus 7 pinned dictionaries shipped in `public/dict/`:
english, spanish, french, german, italian, portuguese, russian. Companion settings on the
Editor tab: `spellCheck` (on by default), `spellSuggestions`, `spellSuggestionCount`
(1–8). Misspelled words get wavy underlines in markdown/text files; the click popover
offers near-matches and "add to project dictionary" (`.praxis/spell-ignore.json`).
