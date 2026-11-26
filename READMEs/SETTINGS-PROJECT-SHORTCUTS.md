# Settings — Tabs 14–15: Project and Shortcuts

Back to the [settings index](./SETTINGS-REFERENCE.md).

## Tab 14 — Project

**Project settings** targets `<project-root>/.praxis/settings.json`, which overrides
browser-local settings while that project is active (PyCharm-`.idea`-style):

- **Save As Project Settings** — captures the current draft into the project file (disabled without the
  `onSaveProjectSettings` callback).
- **Clear All Project Settings** — destructive styling; disabled when there are no
  overrides.
- Explanatory text: the dialog's main **Save** button also mirrors settings into
  `.praxis/settings.json` (AI provider keys stay browser-local); the file is created on
  first project open and loaded on later opens.

**Active overrides (N)** — the dynamic list of every key present in `projectOverrides`:
each row shows the key name (mono) + a `project` badge + the formatted value + a **Reset To Global** button (per key,
`onResetProjectKey`). The empty state explains how to
capture settings into the project.

Map-shaped settings (`topRightQuickActions`, `formatLangIndent`, `formatLangAutoSave`)
merge per-key with browser locals in `mergeProjectSettings` — project pins win, browser
entries fill the rest, an empty project map leaves the browser's choices untouched.

*(Note: there is no dynamic project-list / create / switch / remove UI on this tab, no
`.praxis/appearance.json` editor, and no project-dictionary editor — those live in the File
menu's project submenu, the Projects API, and the Tools ▸ Project Dictionary dialog
respectively. `appearance.json` and `spell-ignore.json` appear in the Backup tab's zip
description.)*

## Tab 15 — Shortcuts

The dynamic rebind table — it renders `SHORTCUT_GROUPS` from `src/lib/shortcuts.ts`: **7
groups, 52 rebindable shortcuts**. Full tables, per-surface keymaps, and the rebinding
mechanics live in [SHORTCUTS.md](./SHORTCUTS.md); the group summary:

| Group                       | Count | Items (id — default)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|-----------------------------|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| File                        | 3     | `file.save` ⌘S · `file.saveAll` ⌘⌥S · `file.settings` ⌘,                                                                                                                                                                                                                                                                                                                                                                                              |
| Edit                        | 10    | `edit.undo` ⌘Z · `edit.redo` ⌘⇧Z · `edit.cut` ⌘X · `edit.copy` ⌘C · `edit.paste` ⌘V · `edit.find` ⌘F · `edit.replace` ⌘⌥F · `edit.format` ⌘⇧F · `edit.acceptCompletion` Tab · `edit.dismiss` Esc                                                                                                                                                                                                                                                      |
| View                        | 11    | `view.toggleSidebar` ⌘B · `view.toggleBottomPanel` ⌘J · `view.toggleAiChat` ⌘⇧L · `view.searchScripts` ⌘K · `view.refreshTree` ⌘⇧R · `view.zoomIn` ⌘= · `view.zoomOut` ⌘- · `view.zoomReset` ⌘0 · `view.distractionFree` ⇧F11 · `view.fullscreen` F11 · `view.toggleTerminal` ⌘`                                                                                                                                                                      |
| Editor (in-editor gestures) | 16    | `editor.gotoSymbol` ⌘R · `editor.gotoDeclaration` ⌘⇧B · `editor.gotoDef` F12 · `editor.findReferences` ⇧F12 · `editor.findUsages` ⌥F7 · `editor.rename` ⇧F6 · `editor.quickFix` ⌥↵ · `editor.selectNextOccurrence` ⌘D · `editor.toggleBookmark` ⌘F2 · `editor.nextBookmark` F2 · `editor.prevBookmark` ⇧F2 · `editor.swapLineUp` ⌘⇧↑ · `editor.swapLineDown` ⌘⇧↓ · `editor.toggleComment` ⌘/ · `editor.duplicateLine` ⇧⌥↓ · `editor.runSelection` ⌘⇧↵ |
| Run                         | 3     | `run.runScript` ⌘↵ · `run.stop` ⌘. · `run.runCell` ⇧↵                                                                                                                                                                                                                                                                                                                                                                                                 |
| AI                          | 1     | `ai.triggerCompletion` ⌥\                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Navigation                  | 8     | `nav.commandPalette` ⌘⇧P · `view.toggleHistory` ⌘⇧H · `nav.snippets` ⌘⇧S · `nav.reopenClosedTab` ⌘⇧T · `nav.gotoSymbolInProject` ⌘T · `nav.nextTab` ⌘PageDown · `nav.prevTab` ⌘PageUp · `nav.tabByIndex` ⌥1…⌥9 (fixed binding via `e.code`; rebinding not offered)                                                                                                                                                                                    |

Click a binding chip → "Press keys…" recording state; the next non-modifier combo is
captured (capture-phase listener, `preventDefault` + `stopPropagation`; bare modifiers keep
waiting; **Esc cancels**). Conflicts against the other 51 ids show an amber banner and save
nothing. Saved bindings persist immediately to localStorage `praxis-custom-shortcuts` as
`{[id]: keys}` — rebinding is live and independent of the dialog's Save/Cancel. Rows with a
custom binding get an emerald **custom** badge and a per-row reset button (RotateCcw).
