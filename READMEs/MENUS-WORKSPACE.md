# Menus 1–6: File, Edit, View, Window, Terminal, Bookmarks

Back to the [features overview](./FEATURES-OVERVIEW.md). Every table below is the complete
item inventory of one menu, read from `src/components/menu-bar.tsx` (4,151 lines). In the
Condition column, "disabled if missing" means the page drops the handler prop (the
disable gate); capability gates use `capabilitiesForKind(selectedFileKind)`.

## File — "File menu — new, save, download, settings"

Content width `w-64`; four groups: New / Open / Save & Download / Settings.

| Item                                                                        | Shortcut | Action / Event                                                          | Condition                   |
|-----------------------------------------------------------------------------|----------|-------------------------------------------------------------------------|-----------------------------|
| *(group)* **New**                                                           |          |                                                                         |                             |
| New Folder…                                                                 | —        | `onNewFolder` → page dispatches `praxis:new-folder` `{detail: {nonce}}` | disabled if handler missing |
| New File…                                                                   | —        | `onNewFile` → `praxis:new-file` `{nonce}`                               | disabled if missing         |
| Upload ZIP As New Project…                                                  | —        | `onUploadZip` (zip → new project dir + project switch)                  | disabled if missing         |
| —                                                                           |          |                                                                         |                             |
| *(group)* **Open**                                                          |          |                                                                         |                             |
| Open Project ▸ (submenu; trigger shows the active project name / "Default") |          |                                                                         |                             |
| ↳ Default (python_scripts/)                                                 | —        | `onSelectProject("")`; check when `!activeProject`                      | —                           |
| ↳ *dynamic* `<projects>.map` — name + `(scriptCount)` + check when active   | —        | `onSelectProject(p.path)`                                               | —                           |
| ↳ *(separator)* + Open Folder…                                              | —        | `onBrowseProjectFolder` (the FolderPickerDialog)                        | disabled if missing         |
| Create New Project…                                                         | —        | `onCreateProject` → `praxis:create-project` `{nonce}`                   | always enabled              |
| Open from GitHub URL…                                                       | —        | `onOpenFromUrl` (repo/subfolder/gist shallow import)                    | disabled if missing         |
| —                                                                           |          |                                                                         |                             |
| *(group)* **Save & Download**                                               |          |                                                                         |                             |
| Save                                                                        | ⌘S       | `onSave`                                                                | disabled if missing         |
| Save All                                                                    | ⌘⌥S      | `onSaveAll`                                                             | disabled if missing         |
| Close All Editors                                                           | —        | `onCloseAllEditors` (the workspace goes blank)                          | disabled if missing         |
| Download Current File…                                                      | —        | `onDownload`                                                            | disabled if missing         |
| Publish Snapshot Link…                                                      | —        | `onPublishSnapshot` (workspace → shareable URL hash)                    | disabled if missing         |
| —                                                                           |          |                                                                         |                             |
| Settings…                                                                   | ⌘,       | `onOpenSettings()`                                                      | disabled if missing         |

## Edit — "Edit menu — undo, redo, cut, copy, paste, find, format"

Content width `w-56`; groups: Undo & Clipboard / Find & Replace / Format & Lines /
Screenshots.

| Item                                                                 | Shortcut | Action / Event                                                              | Condition                         |
|----------------------------------------------------------------------|----------|-----------------------------------------------------------------------------|-----------------------------------|
| *(group)* **Undo & Clipboard**                                       |          |                                                                             |                                   |
| Undo                                                                 | ⌘Z       | `onUndo` (the editor's imperative stack)                                    | `selectedFileKind === "python"`   |
| Redo                                                                 | ⌘⇧Z      | `onRedo`                                                                    | python-only                       |
| Cut                                                                  | ⌘X       | `onCut`                                                                     | python-only                       |
| Copy                                                                 | ⌘C       | `onCopy`                                                                    | python-only                       |
| Paste                                                                | ⌘V       | `onPaste`                                                                   | python-only                       |
| *(group)* **Find & Replace**                                         |          |                                                                             |                                   |
| Find…                                                                | ⌘F       | `onFind` (the in-editor find bar)                                           | python-only                       |
| Replace…                                                             | ⌘⌥F      | `onReplace`                                                                 | python-only                       |
| Find In Files…                                                       | ⌘⇧H      | `onFindInFiles` (project-wide search/replace)                               | disabled if missing only          |
| *(group)* **Format & Lines**                                         |          |                                                                             |                                   |
| Format Document                                                      | ⌘⇧F      | `onFormat` (black/ruff; HTML beautify; Markdown)                            | `caps.canFormat` (python/md/html) |
| Organize Imports                                                     | —        | `onOrganizeImports` (ruff `--select I --fix`)                               | python-only                       |
| Auto-Indent File                                                     | —        | `onAutoIndent` (re-indent to the configured style)                          | `caps.canFormat`                  |
| Lines & Case ▸ *(submenu — every item via `onEditorAction(action)`)* |          |                                                                             | disabled iff `!onEditorAction`    |
| ↳ Toggle Comment                                                     | ⌘/       | `toggleComment`                                                             |                                   |
| ↳ Duplicate Line                                                     | ⇧⌥↓      | `duplicateLine`                                                             |                                   |
| ↳ Move Line Up                                                       | ⌘⇧↑      | `moveLineUp`                                                                |                                   |
| ↳ Move Line Down                                                     | ⌘⇧↓      | `moveLineDown`                                                              |                                   |
| ↳ Delete Line                                                        | ⌘⌫       | `deleteLines`                                                               |                                   |
| ↳ Join Lines                                                         | —        | `joinLines`                                                                 |                                   |
| ↳ Split Lines                                                        | —        | `splitLines` (split at commas)                                              |                                   |
| ↳ Surround With ▸                                                    | —        | `surroundQuotes` · `surroundParens` · `surroundBrackets` · `surroundBraces` |                                   |
| ↳ Sort Selected Lines                                                | —        | `sortLines`                                                                 |                                   |
| ↳ Unique Lines                                                       | —        | `uniqueLines`                                                               |                                   |
| ↳ Reverse Lines                                                      | —        | `reverseLines`                                                              |                                   |
| ↳ Shuffle Lines                                                      | —        | `shuffleLines`                                                              |                                   |
| ↳ Select All                                                         | ⌘A       | `selectAll`                                                                 |                                   |
| ↳ Copy As Markdown Block                                             | —        | `copyAsMarkdown` (a fenced block)                                           |                                   |
| ↳ UPPERCASE                                                          | —        | `upper`                                                                     |                                   |
| ↳ lowercase                                                          | —        | `lower`                                                                     |                                   |
| ↳ Title Case                                                         | —        | `title`                                                                     |                                   |
| ↳ camelCase                                                          | —        | `camel`                                                                     |                                   |
| ↳ PascalCase                                                         | —        | `pascal`                                                                    |                                   |
| ↳ snake_case                                                         | —        | `snake`                                                                     |                                   |
| ↳ kebab-case                                                         | —        | `kebab`                                                                     |                                   |
| ↳ CONSTANT_CASE                                                      | —        | `constant`                                                                  |                                   |
| ↳ Trim Trailing Whitespace                                           | —        | `trimTrailing`                                                              |                                   |
| ↳ Fold All Blocks                                                    | —        | `foldAll`                                                                   |                                   |
| ↳ Unfold All Blocks                                                  | —        | `unfoldAll`                                                                 |                                   |
| *(group)* **Screenshots**                                            |          |                                                                             |                                   |
| Screenshot: window…                                                  | —        | `onScreenshot("window")` (the Screenshot Studio)                            | disabled if missing               |
| Screenshot: code…                                                    | —        | `onScreenshot("code")` (the whole file → one PNG)                           | disabled if missing               |
| Screenshot: region…                                                  | —        | `onScreenshot("selection")` (a dragged rect)                                | disabled if missing               |

## View — "View menu — panels, navigation, editor chrome, zoom, refresh"

Content width `w-60`; groups: Layout / Editor ▸ / Zoom / Project.

| Item                                       | Shortcut | Action / Event                                                             | Condition                               |
|--------------------------------------------|----------|----------------------------------------------------------------------------|-----------------------------------------|
| *(group)* **Layout**                       |          |                                                                            |                                         |
| Sidebar ☑                                 | ⌘B       | `onToggleSidebar`; checked = `sidebarVisible`                              | —                                       |
| Bottom Panel ☑                            | ⌘J       | `onToggleBottomPanel`; checked = `bottomPanelOpen`                         | —                                       |
| Terminal Panel ☑                          | ⌘`       | `onToggleTerminalPanel`; checked = the frontmost terminal tab + open panel | —                                       |
| Clear Terminal                             | —        | `onTerminalClear`                                                          | disabled if missing                     |
| AI Chat Sidebar ☑                         | ⌘⇧L      | `onToggleAiChat`; checked = `aiChatOpen`                                   | —                                       |
| Tabs On Top Of Bottom Panel ☑             | —        | `onToggleBottomTabsPosition`; checked = `bottomTabsPosition === "top"`     | —                                       |
| Distraction-Free Mode ☑                   | ⇧F11     | `onToggleDistractionFree`; checked = `distractionFree`                     | —                                       |
| Fullscreen (browser)                       | F11      | `onToggleFullscreen` (the Fullscreen API)                                  | —                                       |
| Editor ▸ *(submenu — 10 checkbox toggles)* |          |                                                                            |                                         |
| ↳ Word Wrap                                | —        | `onToggleCodeWordWrap`                                                     | each disabled if its handler is missing |
| ↳ Minimap                                  | —        | `onToggleMinimap`                                                          |                                         |
| ↳ Line Numbers                             | —        | `onToggleLineNumbers`                                                      |                                         |
| ↳ Indent Guides                            | —        | `onToggleIndentGuides`                                                     |                                         |
| ↳ Sticky Scroll                            | —        | `onToggleStickyScroll`                                                     |                                         |
| ↳ Typewriter Scrolling                     | —        | `onToggleTypewriterScroll`                                                 |                                         |
| ↳ Code Folding                             | —        | `onToggleCodeFolding`                                                      |                                         |
| ↳ Whitespace Characters                    | —        | `onToggleShowWhitespace`                                                   |                                         |
| ↳ Highlight Current Line                   | —        | `onToggleHighlightCurrentLine`                                             |                                         |
| ↳ Spell Check                              | —        | `onToggleSpellCheck`                                                       |                                         |
| *(group)* **Zoom**                         |          |                                                                            |                                         |
| Increase Code Font Size                    | ⌘=       | `onIncreaseFontSize`                                                       | —                                       |
| Decrease Code Font Size                    | ⌘-       | `onDecreaseFontSize`                                                       | —                                       |
| Reset Code Font Size                       | ⌘0       | `onResetFontSize`                                                          | —                                       |
| *(group)* **Project**                      |          |                                                                            |                                         |
| Refresh Project                            | ⌘⇧R      | `onRefresh`; the icon spins while `refreshing`                             | disabled while refreshing               |

*(The ruler is deliberately absent from this submenu — it lives only in Settings →
Editor.)*

## Window — "Window menu — layout presets, panel visibility, reset"

Content width `w-64`; groups: Layout Presets / Panels.

| Item                                                                                                                                                    | Shortcut | Action / Event                                                                                          | Condition                   |
|---------------------------------------------------------------------------------------------------------------------------------------------------------|----------|---------------------------------------------------------------------------------------------------------|-----------------------------|
| *(group)* **Layout Presets** — dynamic `LAYOUT_PRESETS.map`                                                                                             |          |                                                                                                         |                             |
| ↳ Editor + Output / Editor + Terminal / Triple split / Zen / Editor + AI Chat / Terminal Focus / Stacked Split / File Browser / Full Studio (9 presets) | —        | `onApplyLayoutPreset(preset.id)`; a check when `layoutPresetId === preset.id`, else the LayoutGrid icon | disabled if handler missing |
| Next Preset                                                                                                                                             | —        | `onCycleLayoutPreset` (the navbar cycler twin)                                                          | —                           |
| *(group)* **Panels**                                                                                                                                    |          |                                                                                                         |                             |
| Editor Split Pane ☑                                                                                                                                    | —        | `onToggleSplitPane`; checked = `splitPaneOpen`                                                          | —                           |
| AI Chat Sidebar ☑                                                                                                                                      | —        | `onToggleAiChat`; checked = `aiChatOpen`                                                                | —                           |
| Zen / Distraction-Free                                                                                                                                  | ⇧F11     | `onToggleDistractionFree`                                                                               | —                           |
| Reset Layout                                                                                                                                            | —        | `onResetLayout` (sidebar + editor + bottom output)                                                      | —                           |

## Terminal — "Terminal menu — sessions, clear / kill, send selection"

Content width `w-64`; the trigger shows the live session-count pill. Every item calls
`onTerminalCommand(cmd)` — the page opens the bottom panel + terminal tab and dispatches
`praxis:terminal-command` `{detail: {command, text?}}` (the terminal panel listens;
`send-selection` carries the editor's selection text pulled via the codeViewer ref).

| Item                       | Command                             | Condition                         |
|----------------------------|-------------------------------------|-----------------------------------|
| *(group)* **Sessions**     |                                     |                                   |
| New Shell Session          | `new-shell`                         | disabled iff `!onTerminalCommand` |
| New Python REPL Session    | `new-python`                        | same                              |
| *(group)* **Manage**       |                                     |                                   |
| Clear Active Session       | `clear`                             | same                              |
| Kill Active Session        | `kill-active`                       | same                              |
| Kill All Sessions          | `kill-all`                          | same (red text)                   |
| Send Selection To Terminal | `send-selection` (+ selection text) | same                              |
| Focus Terminal             | `focus` (⌘`)                        | same                              |

## Bookmarks — "Bookmarks — jump to favorites and editor line bookmarks"

Content width `w-64`, `max-h-[70vh]` scroll.

| Item                                                                                                                                                                                                                                          | Shortcut | Action / Event                                 | Condition                                                                                           |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| *(group)* **Jump To** — dynamic `bookmarkEntries.slice(0, 12)` (favorites ★ first 6 + line bookmarks, project-scoped — entries that don't resolve in the current project's tree are filtered; icon or fallback Bookmark; hint right-aligned) | —        | each entry's `onJump` closure                  | empty state: "No bookmarks yet — star files in the explorer or add line bookmarks from the editor." |
| Bookmark This Line                                                                                                                                                                                                                            | —        | `onAddLineBookmark` (toggle the line bookmark) | `caps.canBookmark` (Python files)                                                                   |
| All Bookmarks…                                                                                                                                                                                                                                | —        | `onOpenBookmarks` (the management dialog)      | disabled if missing                                                                                 |
