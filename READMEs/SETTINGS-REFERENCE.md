# Praxis — Settings Reference (Complete Catalog)

Praxis ships a 15-tab settings dialog (`src/components/settings-dialog.tsx`, 6,413 lines;
tab data bound to `DEFAULT_SETTINGS` in `src/lib/settings.ts`). This index explains the
storage model and the shared machinery, and links to the per-tab catalogs. The prose guide
with the theme/language/dictionary catalogues is
[README-SETTINGS.md](./README-SETTINGS.md).

**The dialog.** `sm:max-w-7xl`, a flex column: header with a search box → the 15-tab strip (single-row, horizontally
pannable, middle-mouse pan + Shift+wheel) with a per-section jump
bar (DOM-driven, scroll-spy) → the scrollable content → a pinned footer with **Reset To
Defaults**, **Cancel**, and **Save**. The heavy body only mounts while the dialog is open (plus a 220 ms exit-animation
hold). `initialTab` opens a specific tab (e.g. the AI menu's
"AI settings…" opens the AI tab); the default tab is Cache. Saving broadcasts
`praxis:settings-saved` so settings-reactive readers refresh without a reload, then mirrors
the draft into the active project's `.praxis/settings.json` (AI provider keys stay
browser-local).

**The 15 tabs**, in order:

| #  | Tab                                                    | Catalog                                                                                           |
|----|--------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| 1  | Editor (67 rows)                                       | [SETTINGS-EDITOR.md](./SETTINGS-EDITOR.md)                                                        |
| 2  | Formatting (13 global + 3 Python + 37 language blocks) | [SETTINGS-FORMATTING.md](./SETTINGS-FORMATTING.md)                                                |
| 3  | Python (20 rows)                                       | [SETTINGS-PYTHON.md](./SETTINGS-PYTHON.md)                                                        |
| 4  | Collaboration (4 rows)                                 | [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-4--collaboration)                             |
| 5  | Focus (12 rows + ambient mixer)                        | [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-5--focus)                                     |
| 6  | AI                                                     | [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-6--ai)                                        |
| 7  | Nav (6 rows + 32 quick actions)                        | [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-7--nav)                                       |
| 8  | Accessibility (11 rows)                                | [SETTINGS-WORKSPACE.md](./SETTINGS-WORKSPACE.md#tab-8--accessibility)                             |
| 9  | Capture (10 rows)                                      | [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-9--capture)   |
| 10 | Media (8 rows)                                         | [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-10--media)    |
| 11 | Backup (actions + 3 profiles)                          | [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-11--backup)   |
| 12 | Cache (5 rows)                                         | [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-12--cache)    |
| 13 | Advanced (15 rows)                                     | [SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md#tab-13--advanced) |
| 14 | Project                                                | [SETTINGS-PROJECT-SHORTCUTS.md](./SETTINGS-PROJECT-SHORTCUTS.md#tab-14--project)                  |
| 15 | Shortcuts (dynamic)                                    | [SETTINGS-PROJECT-SHORTCUTS.md](./SETTINGS-PROJECT-SHORTCUTS.md#tab-15--shortcuts)                |

---

## Storage model

- **Browser settings** live in localStorage under `praxis.settings` (`SETTINGS_KEY` =
  `${STORAGE_PREFIX}.settings`; `STORAGE_PREFIX` is the slug of `APP_NAME` — `"Praxis"` →
  `"praxis"` — overridable via `NEXT_PUBLIC_STORAGE_PREFIX` / `NEXT_PUBLIC_APP_NAME`).
- `loadSettings()` (`src/lib/settings.ts`): a module-level cached read; SSR returns
  `DEFAULT_SETTINGS`; the parsed JSON is cleaned on every load (stale built-in `"zai"` AI
  providers stripped, dangling `aiChatProviderId` cleared) and merged as
  `{ ...DEFAULT_SETTINGS, ...parsed }` — new settings keys pick up their defaults, unknown
  keys survive. `saveSettings(next)` writes and refreshes the cache (quota errors
  swallowed). An inline bootstrap script in `src/app/layout.tsx` reads the key BEFORE paint
  to apply theme/a11y/RTL attributes with zero flash.
- **Project overrides** live in `<project-root>/.praxis/settings.json`. On dialog open the
  draft is `mergeProjectSettings(loadSettings(), projectOverrides)` — shallow merge for
  plain values and arrays (project pins win), **per-key merge** for the map-shaped keys (`MAP_SETTINGS_KEYS`:
  `topRightQuickActions`, `formatLangIndent`, `formatLangAutoSave`)
  so a shipped empty project map can never reset browser choices. The dialog's header badge
  shows the override source (project / created / browser-local). `GET/POST/DELETE
  /api/project-settings` reads/writes the file atomically (temp + `fs.rename`, with a
  direct-write fallback for Windows EBUSY/EPERM); GET seeds a missing file with
  `DEFAULT_SETTINGS` (unless `?seed=0`, sent after "Clear project settings" so the server
  never resurrects a deleted file) and ensures the sibling `.praxis/` files (`notes.json` `{}`, `appearance.json`,
  `spell-ignore.json` `[]`). A POST carrying
  `pythonInterpreter` resets the server's interpreter cache.
- **Search**: a 158-entry index (`SETTINGS_INDEX` — key, label, hint, tab, rowId) powers
  the dialog's search box; matches filter by label OR hint substring (case-insensitive),
  replace the tabbed view with a flat results list showing the current value, and jump on
  click (switch tab, double-RAF `scrollIntoView`, a 2-second highlight ring on
  `#setting-row-<rowId|key>`).
- **Dialog-local stores**: the Collaboration tab edits `praxis.collab.settings`
  (`src/lib/collab-store.ts`) and the Focus tab edits `praxis.focus-settings`
  (`src/lib/focus-settings.ts`, event `praxis:focus-settings-changed`) — both persist
  immediately per change, not through the draft/Save flow.

## Schema keys without a dialog row

`DEFAULT_SETTINGS` keys that no dialog row edits (they are either dead, legacy, or driven
by other UI):

| Key                                               | Default  | Status                                                                                                       |
|---------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------|
| `explorerViewMode`                                | `"tree"` | Dead schema key — referenced nowhere else in `src/`.                                                         |
| `logFollowTail`                                   | `false`  | Dead schema key — no consumer.                                                                               |
| `markdownStudioDefault`                           | `true`   | Has a static "Built-in — no toggle needed" row (the Markdown studio is always the edit side of `.md`).       |
| `collabGuestPermission`                           | `"read"` | Unwired duplicate — the Collaboration tab edits the collab-store's own `guestPermission` (default `"edit"`). |
| `collabAutoFollow`                                | `false`  | Unwired duplicate — the Collaboration tab edits the collab-store's own `autoFollow` (default `true`).        |
| `formatSqlUppercaseKeywords`                      | `false`  | Legacy boolean read only as a fallback by the SQL keyword-case select.                                       |
| `language` / `logFollowTail` / `explorerViewMode` | —        | Also missing from the 158-entry search index (`language` does have a row on the Nav tab but no index entry). |

Every other `DEFAULT_SETTINGS` key has a row in one of the per-tab catalogs. The same
information, tab by tab: [Editor](./SETTINGS-EDITOR.md) · [Formatting](./SETTINGS-FORMATTING.md) ·
[Python](./SETTINGS-PYTHON.md) · [Tabs 4–8](./SETTINGS-WORKSPACE.md) ·
[Tabs 9–13](./SETTINGS-CAPTURE-MEDIA-MAINTENANCE.md) ·
[Tabs 14–15](./SETTINGS-PROJECT-SHORTCUTS.md).
