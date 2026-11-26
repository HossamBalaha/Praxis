# Keyboard Shortcuts — Part 2: Fixed Keys and Per-Surface Keymaps

Part 1 — [SHORTCUTS.md](./SHORTCUTS.md) — covers the 52 rebindable shortcuts and the
rebinding machinery. This file covers every global fixed key and every surface-specific
keymap. `⌘` = Ctrl OR Cmd; `⌥` = Alt; `⇧` = Shift; `↵` = Enter.

## Global fixed keys

Window-level handlers in `src/app/page.tsx` (not rebindable):

| Combo                                   | Behavior                                                                                                                                                                                                                        |
|-----------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Ctrl+Tab` / `Ctrl+Alt+Tab` / `Cmd+Tab` | Open the **tab switcher overlay**. Plain Ctrl+Tab only reaches the page in fullscreen/PWA installs (the browser reserves it); Ctrl+Alt+Tab is the always-working twin; Shift+Tab at window level never opens it.                |
| `⌘⇧P`                                   | Open the **command palette** (hardcoded, not the `nav.commandPalette` id).                                                                                                                                                      |
| `⌘⇧T`                                   | **Reopen the last closed tab** (a separate effect, deliberately outside the hook to avoid double-fire).                                                                                                                         |
| `⌘P`                                    | Fuzzy **open-file** search dialog (VS Code quick-open; skipped while typing).                                                                                                                                                   |
| `⌘T`                                    | **Go to Symbol in project** (server-side `/api/project-symbols`; skipped while typing).                                                                                                                                         |
| `⌘⇧O`                                   | **Go to Symbol in the current file** (the symbol palette, when a file is selected).                                                                                                                                             |
| `⌘R`                                    | The goto-symbol palette (a global mirror of the viewer's handler; only with `selectedFileSlug`).                                                                                                                                |
| `⌘\``                                   | **Toggle the Terminal panel** (hides the bottom panel if the Terminal tab is frontmost; otherwise re-opens + focuses).                                                                                                          |
| `⇧F11`                                  | Toggle **distraction-free mode**.                                                                                                                                                                                               |
| `F11` (plain)                           | Toggle **browser fullscreen**.                                                                                                                                                                                                  |
| `⌘⇧H`                                   | **Project-wide Find-in-Files dialog** — ⚠ also fires the rebindable `view.toggleHistory` default; see [Observed conflicts](#observed-conflicts).                                                                               |
| `⌘⇧J`                                   | Open the **Jump list** overlay (pinned tabs/favorites/recents/last runs).                                                                                                                                                       |
| `Ctrl+-` / `Ctrl+Shift+-`               | Editor-history **Back / Forward** (not while typing).                                                                                                                                                                           |
| `Alt+←` / `Alt+→`                       | Editor-history **Back / Forward** (not while typing).                                                                                                                                                                           |
| `Alt+1 … Alt+9`                         | Jump to editor tab N (9 = last tab; `e.code`-resolved, fires even in text fields).                                                                                                                                              |
| `⌘↵`                                    | **Run the current script** (isTyping-gated; the stdin Textarea keeps its own local ⌘↵ → run).                                                                                                                                   |
| `⌘.`                                    | **Stop the running script** (acts on the Output-panel run).                                                                                                                                                                     |
| `⌘S`                                    | Save the current file (fires from inside the editor TEXTAREA too).                                                                                                                                                              |
| `⌘⌥S`                                   | Save all open tabs.                                                                                                                                                                                                             |
| `⌘⇧F`                                   | Format the current file (from the TEXTAREA too; while the terminal input is focused the *terminal* owns it — scrollback find).                                                                                                  |
| `⌘⌥F`                                   | Open find-and-replace.                                                                                                                                                                                                          |
| `⌘=` / `⌘-` / `⌘0`                      | Code font zoom in/out/reset (10–20 px) — never isTyping-gated.                                                                                                                                                                  |
| `Ctrl/Cmd+wheel`                        | Code font zoom: native non-passive window wheel listener; ±60 accumulated deltaY = ±1 px. Over an image, the image toolbox stops propagation so the wheel zooms the image instead.                                              |
| `⌘PageDown` / `⌘PageUp`                 | Next / previous editor tab (not isTyping-gated; deliberately overrides the browser combos).                                                                                                                                     |
| Not bound                               | `Ctrl+W` (no close-tab keybinding — close is mouse/context-menu only). `Ctrl+\` (split editor) is *advertised in a tooltip* but has no global handler — split is context-menu only. Theme toggle is menu/button-only by design. |

## Python editor (edit mode)

The textarea `onKeyDown` in `src/components/code-viewer.tsx` (fires before the wrapper;
an IME-composition guard returns early):

| Gesture                                           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `⌘⇧R`                                             | Open the **refactor palette** (organize imports, inline, move symbol, change signature, loop ⇄ comprehension) — dispatches `praxis:open-refactor-palette`.                                                                                                                                                                                                                                                                                  |
| Vim interception                                  | Every non-Ctrl/non-Cmd key is offered to the modal engine first (see [Vim mode](#vim-mode)).                                                                                                                                                                                                                                                                                                                                                |
| `Esc` (signature help shown, no extra carets)     | Dismiss the signature-help popup.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Multi-caret mode (`extraCarets > 0`)              | `Esc` collapses to a single caret; plain arrows/Home/End/PageUp/PageDown collapse + move natively; a plain printable char types/auto-pairs/wraps the selection at EVERY caret; plain `Enter` newlines + auto-indents at every caret; `Backspace`/`Delete` operate at every caret (selection deleted first).                                                                                                                                 |
| Python completion popup                           | `↓`/`↑` cycle items (when > 1); `Tab`/`↵` accept the active suffix; `Esc` close.                                                                                                                                                                                                                                                                                                                                                            |
| `⌘Z`                                              | Undo via the snapshot stacks (a just-added dictionary word is removed first, restoring its zigzag).                                                                                                                                                                                                                                                                                                                                         |
| `⌘⇧Z` / `⌘Y`                                      | Redo.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `⌘⇧↵`                                             | **Run selection** — the selection, else the current line.                                                                                                                                                                                                                                                                                                                                                                                   |
| `⌘/`                                              | **Toggle the `#` comment** on the selected lines.                                                                                                                                                                                                                                                                                                                                                                                           |
| `⇧⌥↓`                                             | **Duplicate the current line** (or each selected line).                                                                                                                                                                                                                                                                                                                                                                                     |
| `⌥\`                                              | Force an **AI completion** fetch on demand.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `⌘I`                                              | Open **inline AI chat** anchored at the caret/selection (streamed; Apply writes in place).                                                                                                                                                                                                                                                                                                                                                  |
| `⌘D`                                              | **Stack the next occurrence** onto the caret set (first press selects the word — the Sublime/VS Code multi-caret); Esc collapses.                                                                                                                                                                                                                                                                                                           |
| `⌘F2` / `F2` / `⇧F2`                              | Toggle / next / previous **bookmark**.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `⌘⇧↑` / `⌘⇧↓`                                     | Swap the line (or selection) up / down.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `⇧↵`                                              | **Run the `# %%` cell** containing the caret — from the *edited* (unsaved) buffer; only intercepts when `# %%` markers exist, otherwise Shift+Enter keeps line-break semantics.                                                                                                                                                                                                                                                             |
| `⌥↵`                                              | **Quick fixes** panel for the current line (`praxis:show-quickfixes`).                                                                                                                                                                                                                                                                                                                                                                      |
| `Esc`                                             | Dismiss the AI suggestion → end the snippet-tabstop session → close the find bar, in that priority order.                                                                                                                                                                                                                                                                                                                                   |
| Typing `(` `[` `{` `"` `'` `` ` `` (no modifiers) | **Auto-pair**: with a selection → wrap it; quotes don't pair mid-word (a preceding `[a-zA-Z0-9_]` types a plain apostrophe); brackets always pair; the caret parks between.                                                                                                                                                                                                                                                                 |
| Typing `)` `]` `}` `"` `'` `` ` ``                | **Smart skip-over**: when the closer is already the next character, just step past it.                                                                                                                                                                                                                                                                                                                                                      |
| `Enter` (no modifiers)                            | **Auto-indent**: copies the current line's leading whitespace, quantized to the configured indent unit (tab or N spaces; off-grid indentation floors to the grid); a trailing `:` adds one extra level.                                                                                                                                                                                                                                     |
| `Tab`                                             | Priority chain: (1) jump the active **snippet tabstop** `$1→$2→…→$0`; (2) **accept the AI ghost-text suggestion**; (3) **snippet expansion** — a trigger word before the caret matches the snippet table → replace with the body, parse `$n` / `${n:default}` tabstops, select the first; (4) **Smart Tab** — multi-line selection or Shift+Tab → indent/dedent every line by one configured unit; (5) bare caret → insert one indent unit. |
| `⌘F` (via the wrapper, both modes)                | Open the in-editor **find bar**.                                                                                                                                                                                                                                                                                                                                                                                                            |

**Wrapper-level keys** (the viewer root `onKeyDown`, both modes unless noted): `⌘Z` in view
mode = the one-shot dictionary-add undo; `⌘R` = `praxis:goto-symbol`; `⇧↵` in view mode
with `# %%` present = run the cell at the view-mode caret line; `F12` = go-to-definition (LSP-first, else the
`praxis:goto-declaration` fallback; skipped when the target is the
find-bar INPUT); `⇧F12` = peek **references**; `⌘⇧B` (target is a textarea/input) =
`praxis:goto-declaration`; `F2` / `⇧F6` (textarea/input target) = `praxis:rename-symbol`
(with caret position + symbol); `⌥F7` (textarea/input) = `praxis:find-usages`; `⌘F` = open
the find bar; `⌘Home`/`⌘End` = jump to file top/bottom (`⇧` extends the selection in edit
mode); plain `Home`/`End` on the scroll container = scroll top/bottom; `⌘↑`/`⌘↓` (no
shift/alt, target ≠ textarea) = scroll ~12 lines without moving the caret; the bookmark
trio when the target is not a textarea/input (view mode); `Esc` on document capture =
close the code-theme picker bar.

## Vim mode

`src/lib/vim-mode.ts` (1,831 lines — the headless modal engine) + the code-viewer wiring.
Toggle: Settings → Editor → "Vim mode". Active **only in edit mode** of the Python editor;
the mode shows in the status bar; gutter numbers follow `:set nu/rnu`.

- **Interception**: every keydown WITHOUT Ctrl/Cmd is offered to
  `vimRef.handleKey({key, ctrl})` first — `true` = consumed. Ctrl combos (Ctrl+R redo, ⌘S
  save) always pass through to the host. `:` in normal mode opens the ex command bar.
- **Modes**: `normal`, `insert` (the host owns raw typing; the engine diffs the buffer on
  the Esc that exits insert — this powers dot-repeat), `visual` (charwise `v`, linewise
  `V`).
- **Counts**: digits 0–9 build a count (`0` only after a count has started); counts feed
  motions and operators; `G`'s count is a line number.
- **Registers**: `"a–z` (uppercase = append); the unnamed register is the default;
  `y`/`d`/`c` write; `p`/`P` paste after/before; `"` prefix selects a register.
- **Marks**: `m{a-z}` set; `'{a-z}` jump to the line's first non-blank; `` `{a-z} `` jumps
  to the exact character.
- **Macros**: `q{a-z}` record, `@{a-z}` replay (capped at 10,000 keys).
- **Motions**: `h l j k` (+ arrows; Backspace acts as `h`; Home = `^`; End = `$`), `w W b
  B e E`, `0 ^ $`, `G`, `gg` (via the `g` stage), `{ }` (paragraphs), `; ,` (repeat/reverse
  the last `f/F/t/T`), `f{c} F{c} t{c} T{c}` (find char, inclusive), `%` (bracket match
  via `findBracketPair`).
- **Operators**: `d c y > <` — doubled (`dd`, `yy`, `cc`, `>>`, `<<`) = linewise over count
  lines; operator + motion; operator + `i`/`a` text objects.
- **Text objects**: `iw/aw`, `iW/aW`, `i"`/`a"`, `i'`/`a'` (quoted-string objects work
  from anywhere on the line — vim parity fallback). No bracket/paragraph objects.
- **Normal-mode commands**: `i a I A o O` (insert entries); `x X s S D C Y`; `p P`; `~`
  (case toggle); `.` (repeat last change); `v V`; `u` returns false (the HOST's undo stack
  owns it); `:` (the host command bar). Unrecognized keys reset the count.
- **Visual mode**: `v` toggles/exits, `V` linewise, `o` swaps ends, `d x D` delete, `y Y`
  yank, `c s C` change, `~` case toggle, `> <` indent/outdent lines, `i a` extend by text
  object, `gv` reselects the last visual, `p` passes through (not implemented), Esc exits.
- **Ex command bar** (rendered at the editor bottom; `Esc` closes, `↵` executes):
  `:w`/`:write` (save hook) · `:q`/`:q!`/`:quit` (close-tab hook) · `:wq`/`:x` ·
  `:noh`/`:nohl`/`:nohlsearch` (clear the message) · `:set
  [nu|number|nonu|nonumber|rnu|relativenumber|nornu|norelativenumber]` (gutter
  absolute/relative numbers) · `:%s/old/new/[g]` — plain-string substitution over the whole
  document (`\/` and `\\` escapes honored; `g` = all occurrences per line; any delimiter).
  An unknown command toasts the supported set.

## Notebook view (`.ipynb`)

**Command mode** (a cell card is focused — not a textarea/button/input inside it):

| Key                                   | Behavior                                                        |
|---------------------------------------|-----------------------------------------------------------------|
| `a`                                   | Insert a code cell above.                                       |
| `b`                                   | Insert a code cell below.                                       |
| `d d` (two `d` presses within 400 ms) | Delete the cell.                                                |
| `j` / `↓`                             | Focus the next cell (skipping insert zones).                    |
| `k` / `↑`                             | Focus the previous cell.                                        |
| `↵`                                   | Begin editing the cell (same as double-clicking the cell body). |

**Edit mode** (the cell's textarea): plain `↵` = newline + auto-indent (code cells: a
trailing `:` adds one configured unit); `⇧↵` = **run cell + advance** (inserts a new code
cell below when it was the last — works with or without ⌘); `⌘↵` = **run cell in place**;
`Esc` = end edit (commit the draft); `Tab` = insert an indent unit (multi-line selection
or Shift+Tab → block indent/dedent); `⌘Z` = undo via the per-cell snapshot stack (falls
through to native typing undo when empty); `⌘⇧Z`/`⌘Y` = redo; `⌘⇧F` = format the cell
source (black/ruff; undoable, toast confirms). Cell-type change: click the type chip (cycles code → markdown → raw; no
dedicated key). Run-all is a toolbar action (and a
command-palette entry) — no dedicated notebook key.

## Terminal panel

The terminal input line:

| Key                 | Behavior                                                                                                                                                                                                                                                                  |
|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `↵`                 | Submit the line.                                                                                                                                                                                                                                                          |
| `↑` / `↓`           | History previous / next (the draft line is stashed; past-end restores it).                                                                                                                                                                                                |
| `Ctrl+R`            | Reverse-i-search (draft stashed). Inside search: `↵` submits the match (or exits when none), `Esc` exits + restores the draft, `Ctrl+R` cycles older matches, `↑`/`↓` ignored, other keys edit the query.                                                                 |
| `Ctrl+C`            | A real SIGINT to the session's process group via `/api/term` (fires when the line is non-empty, the session is Python, or a command is believed running; an idle empty prompt just clears the line with a `^C` echo). The Python REPL surfaces it as `KeyboardInterrupt`. |
| `Ctrl+D`            | The EOF byte `\x04` (only when the input is empty — exits the Python REPL; `^D` echo).                                                                                                                                                                                    |
| `Ctrl+L`            | Clear screen (client + server backlog).                                                                                                                                                                                                                                   |
| `Ctrl+A` / `Ctrl+E` | Caret to line start / end (readline emulation).                                                                                                                                                                                                                           |
| `Ctrl+U`            | Kill from line start to the caret.                                                                                                                                                                                                                                        |
| `Ctrl+K`            | Kill from the caret to line end.                                                                                                                                                                                                                                          |
| `Ctrl+W`            | Kill the word before the caret.                                                                                                                                                                                                                                           |
| `Ctrl+Shift+F`      | Open the scrollback find bar (the terminal owns the combo while its input is focused).                                                                                                                                                                                    |

Scrollback find bar: `Esc` close (focus returns to the input); `↵` next match; `⇧↵`
previous; `F3` next; a match counter `n / total`. No Tab-completion is implemented (line
discipline emulation only). Clicking anywhere in the terminal focuses the input line;
session tabs click-to-switch, × to kill.

## FileViewer editor (non-Python text kinds)

md/text/json/yaml/toml/sql/r/shell (`src/components/file-viewer.tsx`):

| Gesture                               | Behavior                                                                                                                                                                                                                                           |
|---------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Ctrl+Z`                              | Undo — dictionary-add undo first, then the format/indent snapshot stack; falls through to native typing undo when the stack is empty.                                                                                                              |
| `Ctrl+Shift+Z` / `Ctrl+Y`             | Redo (snapshot stack).                                                                                                                                                                                                                             |
| `Ctrl/Cmd+D`                          | Stack the next occurrence — routed through the rebindable `editor.selectNextOccurrence` (same id as the Python editor) → multi-caret.                                                                                                              |
| Completion popup                      | `↓`/`↑` cycle; `Tab`/`↵` insert the suffix; `Esc` close (all IME-guarded).                                                                                                                                                                         |
| Multi-caret                           | `Esc` collapse; plain arrows/Home/End/PageUp/Down collapse; per-caret typing (openers wrap selections), `↵` (+auto-indent), `Backspace`/`Delete`; plain `Tab` inserts a unit at every caret; `Shift+Tab` collapses to a single caret then dedents. |
| Auto-pair                             | Openers `( [ { " ' \`` insert a pair / wrap the selection; typing a closer that is already the next char steps over.                                                                                                                               |
| `↵` (no modifiers)                    | Newline + copy leading whitespace; **YAML**: a `key:` line additionally opens one indent level (IME-guarded).                                                                                                                                      |
| `Tab` / `Shift+Tab`                   | Insert the configured indent unit / dedent; a multi-line selection → Smart Tab block indent/dedent.                                                                                                                                                |
| Card root `Ctrl+Z` (view mode)        | Undo a dictionary-add.                                                                                                                                                                                                                             |
| Find bar (`Ctrl+F` / Navigate ▸ Find) | `↵` next / `⇧↵` previous match; `Esc` close; **Aa** / **\|w\|** / **.\*** toggle case / whole-word / regex.                                                                                                                                        |
| Replace row (edit mode)               | `↵` = replace the current match + advance; `⇧↵` = arm the replace-ALL confirm step (count shown, then "Replace all" runs); `Esc` close. Replace-all/replace-next are undoable via Ctrl+Z.                                                          |

`⌘⇧F` globally formats whichever editor is open (the page's format handler falls back to
dispatching `praxis:file-viewer-format` for non-Python files).

## Find & replace bars

Shared contract (both viewers): `↵` next match, `⇧↵` previous match, `Esc` close. The
Python editor's bar adds regex/whole-word/case toggles and a replace row with the
armed replace-all confirm step (above). The read-mode find bar (`read-mode-find-bar.tsx`) follows the same trio for
read-mode surfaces.

## Tab switcher overlay (Ctrl+Tab)

| Gesture                       | Behavior                                                                                                                                                                                                                     |
|-------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Ctrl+Tab` (to open)          | Opens the overlay — window-level keydown owned by `useTabSwitcherKeys`; plain Ctrl+Tab only reaches the page in fullscreen/PWA; `Ctrl+Alt+Tab` always works; `Cmd+Tab` on macOS where not OS-reserved. Skipped while typing. |
| `Tab` / `Shift+Tab` (open)    | Highlight next / previous row (wraps; doubles as the focus trap).                                                                                                                                                            |
| `↓`/`→` / `↑`/`←` (open)      | Same next/previous.                                                                                                                                                                                                          |
| `↵` (open)                    | Commit the highlighted row.                                                                                                                                                                                                  |
| Release `Ctrl` / `Cmd` (open) | **Commit on modifier release** — the VS Code gesture (keyup on the overlay root).                                                                                                                                            |
| `Esc` / backdrop click (open) | Cancel (no switch).                                                                                                                                                                                                          |
| Type anything (open)          | Seeds a fuzzy filter box (collapses the MRU list to matching tabs, best match first).                                                                                                                                        |
| Mouse hover (open)            | Moves the highlight; a click commits.                                                                                                                                                                                        |
| Window blur (open)            | Safety close (a lost keyup must not strand the modal).                                                                                                                                                                       |

The MRU list is snapshotted at open time (cycling must not reorder history); the initial
highlight is the entry AFTER the active tab. Footer hint: "Tab next · Shift+Tab back ·
Enter or release Ctrl to open · Esc cancels".

## Editor tabs strip

Mouse gestures (`src/components/editor-tabs.tsx`): plain click = select + activate (clears
any multi-selection); `Ctrl/Cmd+click` = toggle the tab into a **multi-selection** (for
split panes; click order tracked); `Shift+click` = range-select from the last clicked tab; **middle-click**
(`e.button === 1`) = close the tab (VS Code convention; pinned tabs
exempt); drag = **reorder** via HTML5 DnD with an emerald drop indicator (pinned tabs are
locked left — not draggable, not drop targets); wheel / middle-click drag / Shift+wheel =
pan the overflowing strip. Per-tab hover buttons: pin (pinned tabs have no close button)
and close (×). Right-click **context menu**: Open · Pin/Unpin tab · Reveal In Explorer · **Split ▸** (Split editor right
"Ctrl+\", Split editor down; a multi-selection → one pane
per selected tab; Clear selection) · **Close ▸** (this tab / others / all).

Keyboard: each tab is `role="button" tabIndex={0}` — `↵`/`Space` selects. Per-tab run
status dot (green ✓ / red ✗) and dirty dot (amber). (The Alt+N and drag behaviors are
global, above.)

## Mouse + modifier behaviors

| Surface                      | Gesture → behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Code viewer (view mode)      | `Ctrl/Cmd+click` on a word → go-to-definition · a click in the left breakpoint strip (Python files, when the gutter is reserved, ≤ `VIEW_GUTTER_BREAKPOINT_PX`) → toggle a breakpoint on that line · a click moves the view-mode "caret" (bookmarks/F2/Ln readout track it) · double-click → native word select + pins the line highlight · triple-click → native line select.                                                                                      |
| Code viewer (edit textarea)  | `Alt+click` → **add an extra caret** (multi-cursor) · `Ctrl/Cmd+click` on a word (collapsed selection) → go-to-definition · right-click → context menu (the selection is stashed and restored).                                                                                                                                                                                                                                                                     |
| Folder tree rows             | `Ctrl/Cmd+click` → toggle multi-select (the first click seeds with the current file) · `Shift+click` → range select from the anchor (works across folders in flat/kind/details views) · plain click → select + open, reset the selection, become the new anchor.                                                                                                                                                                                                    |
| Folder tree keys             | `Delete`/`Backspace` delete (multi → count confirm) · `Ctrl+C`/`Ctrl+X` copy/cut · `Ctrl+V` paste into the focused file's folder · `F2` rename.                                                                                                                                                                                                                                                                                                                     |
| Editor tabs                  | `Ctrl/Cmd+click` multi-select · `Shift+click` range · middle-click close · drag reorder · wheel pan.                                                                                                                                                                                                                                                                                                                                                                |
| Global                       | `Ctrl/Cmd+wheel` → code font zoom (±1 px per 60 delta units).                                                                                                                                                                                                                                                                                                                                                                                                       |
| Image toolbox viewport       | Plain wheel and `Ctrl+wheel` → zoom 0.1–8× anchored on the cursor (exponential in delta; `stopPropagation` keeps the global font zoomer out); `Shift+wheel` = the native scroll escape hatch · a plain left-drag = pan (zoom > 1) and starts the crop rectangle (Shift/Alt-held drags never crop) · double-click = reset zoom to 100% (Shift+double-click leaves it alone for precise crop clicking) · the crop button/toolbar zoom anchors at the viewport center. |
| Top-right quick-action strip | wheel / middle-click drag / Shift+wheel pan horizontally.                                                                                                                                                                                                                                                                                                                                                                                                           |

## Media, figures and special surfaces

**Video player** (`media-tools.tsx`, container-focused): `Space` play/pause · `←`/`→`
seek −5 s/+5 s (`⇧` = ±10 s) · `↑`/`↓` volume +0.05/−0.05 · `M` mute · `L` loop · toolbar
speed presets 0.5–2× and A/B loop arming.

**Audio player** (`audio-tools.tsx`): the identical set — `Space`, `←`/`→` (±5 s,
`⇧` ±10 s), `↑`/`↓`, `M`, `L`.

**Plots panel lightbox** (`plots-panel.tsx`, window keydown while open): `Esc` close ·
`←`/`→` previous/next plot · `+`/`=` zoom in ×1.5 (max 6×) · `-` zoom out (min 0.25×) ·
`0` reset zoom + pan. Videos inside the viewer keep native controls; zoom applies to
images only.

## Observed conflicts

Exact facts from the code (relevant when choosing custom bindings):

1. **`⌘⇧H` double-fire**: the rebindable `view.toggleHistory` (hook) and the page's
   hardcoded project Find-in-Files both fire on Ctrl/Cmd+Shift+H when not typing — the
   run-history drawer AND the Find-in-Files dialog open together.
2. **`F2` in edit mode**: the textarea handler fires next-bookmark AND the event bubbles
   to the wrapper, whose rename branch matches plain F2 without a `!shiftKey` guard — so
   plain F2 (and ⇧F2) can fire bookmark-navigation + rename simultaneously in edit mode.
3. The ten hardcoded consumers listed in
   [SHORTCUTS.md](./SHORTCUTS.md#the-52-rebindable-shortcuts) display rebindable hints but
   do not consume custom bindings.
4. Conflict detection is display-string-exact and only scans the 52 ids — rebinding onto a
   hardcoded global combo (⌘⇧P, ⌘T, ⌘`, F11…) is accepted silently.
5. Alt+1–9 fires even while typing (deliberate — `e.code`-resolved to defeat macOS
   Alt-glyph spoofing).
6. `⇧⌥↑` is deliberately NOT bound to duplicate-up (swap-up already owns ⌘⇧↑ — "keep one
   key").
