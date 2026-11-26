# Praxis — Keyboard Shortcuts Reference

Part 1 of the keymap: the 52 rebindable shortcuts and the rebinding machinery. Part 2 —
[SHORTCUTS-SURFACES.md](./SHORTCUTS-SURFACES.md) — covers every global fixed key and every
per-surface keymap (Python editor, Vim mode, notebook, terminal, FileViewer, find bars,
tab switcher, tab strip, mouse modifiers, media).

**Notation.** `⌘` in this codebase means **Ctrl OR Cmd** — `matchesKeyCombo()` treats
`e.metaKey || e.ctrlKey` as one "mod" flag, so every binding is cross-platform by
construction. `⌥` = Alt, `⇧` = Shift, `↵` = Enter.

**Source of truth.** `src/lib/shortcuts.ts` (298 lines — `SHORTCUT_GROUPS`,
`loadCustomShortcuts`/`saveCustomShortcuts`, `getEffectiveShortcut`, `matchesShortcut`,
`findShortcutOwner`, `keyEventToCombo`) consumed by the window-level hook
`src/hooks/use-keyboard-shortcuts.ts` and the editor's in-viewer handlers.

## Table of contents

- [The 52 rebindable shortcuts](#the-52-rebindable-shortcuts): [File](#file-3) ·
  [Edit](#edit-10) · [View](#view-11) · [Editor (in-editor gestures)](#editor-in-editor-gestures-16) ·
  [Run](#run-3) · [AI](#ai-1) · [Navigation](#navigation-8)
- [Rebinding mechanics](#rebinding-mechanics)
- Global fixed keys, Python editor keys, Vim mode, notebook, terminal, FileViewer, find
  bars, tab switcher, tab strip, mouse + modifiers, media →
  [SHORTCUTS-SURFACES.md](./SHORTCUTS-SURFACES.md)

## The 52 rebindable shortcuts

### File (3)

| id              | Default | Action                 |
|-----------------|---------|------------------------|
| `file.save`     | `⌘S`    | Save the current file. |
| `file.saveAll`  | `⌘⌥S`   | Save all open tabs.    |
| `file.settings` | `⌘,`    | Open Settings.         |

### Edit (10)

| id                      | Default | Action                                                            |
|-------------------------|---------|-------------------------------------------------------------------|
| `edit.undo`             | `⌘Z`    | Undo.                                                             |
| `edit.redo`             | `⌘⇧Z`   | Redo.                                                             |
| `edit.cut`              | `⌘X`    | Cut.                                                              |
| `edit.copy`             | `⌘C`    | Copy.                                                             |
| `edit.paste`            | `⌘V`    | Paste.                                                            |
| `edit.find`             | `⌘F`    | Find in the current file.                                         |
| `edit.replace`          | `⌘⌥F`   | Replace in the current file.                                      |
| `edit.format`           | `⌘⇧F`   | Format document (black/ruff).                                     |
| `edit.acceptCompletion` | `Tab`   | Accept the AI completion suggestion (when shown) / insert indent. |
| `edit.dismiss`          | `Esc`   | Dismiss the AI suggestion / find bar / dialogs.                   |

### View (11)

| id                       | Default | Action                                            |
|--------------------------|---------|---------------------------------------------------|
| `view.toggleSidebar`     | `⌘B`    | Toggle the file-tree sidebar.                     |
| `view.toggleBottomPanel` | `⌘J`    | Toggle the bottom Output/Diagnostics/Notes panel. |
| `view.toggleAiChat`      | `⌘⇧L`   | Toggle the AI chat assistant sidebar.             |
| `view.searchScripts`     | `⌘K`    | Search scripts.                                   |
| `view.refreshTree`       | `⌘⇧R`   | Refresh the project.                              |
| `view.zoomIn`            | `⌘=`    | Increase the code font size (10–20 px).           |
| `view.zoomOut`           | `⌘-`    | Decrease the code font size.                      |
| `view.zoomReset`         | `⌘0`    | Reset the font size (Ctrl+wheel also zooms).      |
| `view.distractionFree`   | `⇧F11`  | Toggle distraction-free mode.                     |
| `view.fullscreen`        | `F11`   | Toggle browser fullscreen.                        |
| `view.toggleTerminal`    | `⌘\``   | Toggle the integrated Terminal panel.             |

### Editor (in-editor gestures) (16)

Active only with a caret inside the editor.

| id                            | Default | Action                                                                                   |
|-------------------------------|---------|------------------------------------------------------------------------------------------|
| `editor.gotoSymbol`           | `⌘R`    | Goto the symbol palette (jump to def/class/block).                                       |
| `editor.gotoDeclaration`      | `⌘⇧B`   | Go-to-declaration (search the project for `def`/`class <symbol>`).                       |
| `editor.gotoDef`              | `F12`   | Go to definition (the VS Code binding — same action as ⌘⇧B; also Ctrl/Cmd+click a word). |
| `editor.findReferences`       | `⇧F12`  | Find references — the peek-references popup at the caret.                                |
| `editor.findUsages`           | `⌥F7`   | Find usages (every occurrence across the project).                                       |
| `editor.rename`               | `⇧F6`   | Rename refactor (word-boundary replace across files).                                    |
| `editor.quickFix`             | `⌥↵`    | Quick fixes / intention actions.                                                         |
| `editor.selectNextOccurrence` | `⌘D`    | Stack the next occurrence onto the caret set — a true multi-caret; Esc collapses.        |
| `editor.toggleBookmark`       | `⌘F2`   | Toggle a bookmark on the current line.                                                   |
| `editor.nextBookmark`         | `F2`    | Jump to the next bookmark.                                                               |
| `editor.prevBookmark`         | `⇧F2`   | Jump to the previous bookmark.                                                           |
| `editor.swapLineUp`           | `⌘⇧↑`   | Swap the current line up.                                                                |
| `editor.swapLineDown`         | `⌘⇧↓`   | Swap the current line down.                                                              |
| `editor.toggleComment`        | `⌘/`    | Toggle the `#` comment on the selected lines.                                            |
| `editor.duplicateLine`        | `⇧⌥↓`   | Duplicate the current line (or each selected line).                                      |
| `editor.runSelection`         | `⌘⇧↵`   | Run the selected lines in Python (the selection, or the current line).                   |

### Run (3)

| id              | Default | Action                                         |
|-----------------|---------|------------------------------------------------|
| `run.runScript` | `⌘↵`    | Run the current script.                        |
| `run.stop`      | `⌘.`    | Stop the running script.                       |
| `run.runCell`   | `⇧↵`    | Run the `# %%` code cell containing the caret. |

### AI (1)

| id                     | Default | Action                                                     |
|------------------------|---------|------------------------------------------------------------|
| `ai.triggerCompletion` | `⌥\`    | Force an AI code-completion fetch (skip the 1 s debounce). |

### Navigation (8)

| id                        | Default     | Action                                                                                              |
|---------------------------|-------------|-----------------------------------------------------------------------------------------------------|
| `nav.commandPalette`      | `⌘⇧P`       | Open the command palette.                                                                           |
| `view.toggleHistory`      | `⌘⇧H`       | Open run history.                                                                                   |
| `nav.snippets`            | `⌘⇧S`       | Open the snippet palette (⌘/ toggles comments inside the editor).                                   |
| `nav.reopenClosedTab`     | `⌘⇧T`       | Reopen the last closed tab.                                                                         |
| `nav.gotoSymbolInProject` | `⌘T`        | Go to Symbol in project (every def/class across folders).                                           |
| `nav.nextTab`             | `⌘PageDown` | Switch to the next editor tab.                                                                      |
| `nav.prevTab`             | `⌘PageUp`   | Switch to the previous editor tab.                                                                  |
| `nav.tabByIndex`          | `⌥1…⌥9`     | Switch to tab 1–9 (9 = last tab) — a fixed binding resolved via `e.code`; rebinding is not offered. |

**Which of the 52 are truly rebindable in practice.** Rebinding only takes effect for
handlers routed through `matchesShortcut(e, id)`. That set includes `view.searchScripts`,
`view.toggleHistory`, `nav.snippets`, `file.settings`, the sidebar/bottom-panel/AI-chat
toggles, `view.refreshTree`, the zoom trio, `nav.nextTab`/`prevTab`, `file.save`,
`file.saveAll`, `edit.format`, `edit.replace` (all via the hook), plus the editor-gesture
ids routed in the code-viewer/file-viewer (`editor.gotoDef`, `editor.findReferences`,
`editor.gotoDeclaration`, `editor.runSelection`, `editor.toggleComment`,
`editor.duplicateLine`, `ai.triggerCompletion`, `editor.selectNextOccurrence`, the
bookmark trio, the line-swap pair, `run.runCell`, `editor.quickFix`). Ten ids are listed
but hardcoded in their live handlers (`run.runScript`, `run.stop`, `nav.commandPalette`,
`nav.reopenClosedTab`, `nav.gotoSymbolInProject`, `view.toggleTerminal`,
`view.distractionFree`, `view.fullscreen`, `editor.gotoSymbol`, `edit.find`) plus the
native textarea trio (`edit.undo/redo/cut/copy/paste`) — rebinding those changes the
displayed hint but not the behavior. The settings-tab comment records the historical TODO ("handlers still read
hardcoded keys").

## Rebinding mechanics

- **Storage**: localStorage `praxis-custom-shortcuts`
  (`${STORAGE_PREFIX}-custom-shortcuts`), shape `{ [shortcutId]: comboString }` — combo
  strings in *display form* (`⌘⌥⇧` prefixes + a key label; `↵`, `Tab`, `Space`, arrows,
  `⌫`, `⌦`, `Escape`, single uppercase letter, or multi-char like `F12`).
- **API**: `loadCustomShortcuts()` / `saveCustomShortcuts(map)` (try/catch on quota);
  `defaultShortcutKeys(id)`; `getEffectiveShortcut(id)` = custom ?? default — which reads
  localStorage on EVERY call, and `matchesShortcut` calls it per keydown (a per-keystroke
  localStorage read; acknowledged in source as suboptimal for the hot path);
  `matchesShortcut(e, id)` = `matchesKeyCombo(e, getEffectiveShortcut(id))`.
- **`matchesKeyCombo` semantics**: `⌘` matches `metaKey || ctrlKey` (either, not
  distinguished); `⌥` ↔ `altKey`; `⇧` ↔ `shiftKey`; single-char keys compare
  case-insensitively; symbols map through a keyMap.
- **Recording** (Settings → Shortcuts tab, or the row's key chip): click → "Press keys…"
  state; a capture-phase window keydown listener (`{capture: true}`,
  `preventDefault`+`stopPropagation`) records the next combo via `keyEventToCombo` — bare
  modifier presses keep waiting, **Esc cancels**.
- **Conflict detection**: `findShortcutOwner(combo, exceptId, customs)` walks all 52 ids (skipping the rebound id),
  comparing custom-or-default display strings for exact
  equality. On conflict NOTHING is saved; an amber banner shows "`<combo>` is already
  bound to `<ownerAction>`. Nothing was saved — pick a different combination, or rebind
  the other action first." + Dismiss. Scope caveat: only the 52 registered ids — the
  hardcoded globals (⌘⇧P, ⌘T, ⌘`, F11, the terminal's Ctrl+Shift+F, …) are invisible to
  it, so you can rebind onto them and create live conflicts.
- **Saving is live**: a successful recording calls `saveCustomShortcuts` immediately —
  independent of the dialog's Save/Cancel. Rows with a custom binding get an emerald **custom** badge and a per-shortcut
  reset button (RotateCcw) that deletes the entry.
  There is no bulk "clear all customs".
- **Consumption order** (`use-keyboard-shortcuts`): (1) Alt+1–9 tab jump — `e.code`
  resolved, runs BEFORE the mod gate and is never isTyping-gated; (2) the mod gate ignores
  `e.repeat`; (3) `isTyping` (target is INPUT/TEXTAREA/contentEditable) suppresses most
  shortcuts — with deliberate exceptions: the zoom trio and `nav.nextTab/prevTab`, plus
  `file.save`/`edit.format`, which fire from the editor TEXTAREA too.
- **Editor-vs-global resolution**: the code-viewer textarea's `onKeyDown` fires first (React bubbling inner → outer);
  most branches `preventDefault()` + return WITHOUT
  `stopPropagation`, so the wrapper still sees the event — guarded there by
  `e.target !== textareaRef.current` / `!editMode` checks to prevent double-fires. The
  global window hook is separate again; listener registration order decides who reacts.
  The stdin Textarea keeps its own local ⌘↵ → run, so run-from-stdin survives the
  isTyping gate. Known live conflicts are catalogued in
  [SHORTCUTS-SURFACES.md](./SHORTCUTS-SURFACES.md#observed-conflicts) (⌘⇧H opens
  run-history AND Find-in-Files; plain F2 in edit mode can fire bookmark-navigation and
  rename together).
