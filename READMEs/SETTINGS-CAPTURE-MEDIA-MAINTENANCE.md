# Settings — Tabs 9–13: Capture, Media, Backup, Cache, Advanced

Back to the [settings index](./SETTINGS-REFERENCE.md).

## Tab 9 — Capture

### Python run capture (3 rows)

| Key                 | Label                                 | Default | What it does                                             |
|---------------------|---------------------------------------|---------|----------------------------------------------------------|
| `inspectVariables`  | Inspect variables at exit             | `true`  | The Vars tab with the final `__main__` namespace values. |
| `captureDataframes` | Capture DataFrames (pandas HTML repr) | `true`  | Styled HTML tables in the DataFrames tab.                |
| `traceCoverage`     | Trace code coverage (slower)          | `false` | A line-by-line Coverage tab per run.                     |

Per-run overrides are available through the run-input strip's Capture picker.

### Screenshot capture (7 rows)

Three "Make Default" rows pick `defaultCaptureMode` (default `"window"`):

- **window** — the IDE workspace region rasterized from the live DOM.
- **code** — the whole open file rendered to one PNG.
- **selection** — freeze the IDE and drag a region.

All are internal captures — no OS picker. Then:

| Key                | Label            | Control | Default         | Options                                                                                                                                                                                                                                                                                            | What it does                                                                |
|--------------------|------------------|---------|-----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| `shotTheme`        | Screenshot theme | Select  | `"auto"`        | Auto — follow the app theme + 15 named palettes: One Dark, One Light, Nord, Monokai, Dracula, Gruvbox Dark, Gruvbox Light, Solarized Dark, Solarized Light, GitHub Dark, GitHub Light, Tokyo Night, Rosé Pine, High Contrast Dark, High Contrast Light (legacy `light`→one-light, `dark`→one-dark) | The frame palette the Screenshot Studio renders.                            |
| `shotImageQuality` | Image quality    | Range   | `92`            | 50–100%                                                                                                                                                                                                                                                                                            | JPEG/WebP only; PNG ignores it.                                             |
| `screenshotDpi`    | Storage DPI      | Select  | `300 · default` | 72, 96, 120, 144, 192, 220, 300, 400, 600                                                                                                                                                                                                                                                          | ≈3.1× on-screen pixels at 300; the density is embedded in PNG/JPEG exports. |
| `screenshotFormat` | File extension   | Select  | `.png lossless` | `.png lossless` / `.jpg smaller` / `.webp smallest`                                                                                                                                                                                                                                                | Clipboard pastes are always PNG.                                            |

## Tab 10 — Media

### Slideshow (4 rows)

| Key                        | Label             | Control | Default | Options                            |
|----------------------------|-------------------|---------|---------|------------------------------------|
| `slideshowIntervalSeconds` | Seconds per image | Select  | `3`     | 1, 2, 3, 4, 5, 8, 10, 15, 30, 60 s |
| `slideshowTransition`      | Transition        | Select  | Fade    | None / Fade / Slide                |
| `slideshowLoop`            | Loop              | Switch  | `true`  | —                                  |
| `slideshowAutoStart`       | Auto-start        | Switch  | `false` | —                                  |

### Playback defaults (4 rows)

| Key                        | Label                    | Control | Default | Options                              |
|----------------------------|--------------------------|---------|---------|--------------------------------------|
| `mediaDefaultPlaybackRate` | Playback rate            | Select  | `1`     | 0.25, 0.5, 1, 1.5, 2, 3, 4×          |
| `mediaAutoplay`            | Autoplay                 | Switch  | `false` | browsers may refuse unmuted autoplay |
| `mediaDefaultVolume`       | Default volume           | Range   | `100`   | 0–100, step 5                        |
| `mediaLoopByDefault`       | Loop by default / Repeat | Switch  | `false` | —                                    |

Applied by the media tools on file open; manual changes during playback win. Clamps live in
`src/lib/settings.ts` (`clampMediaPlaybackRate` 0.25–4, `clampMediaVolumePercent` 0–100).

## Tab 11 — Backup

- **Cache management** (destructive, both behind a confirmation dialog): **Clear Output
  Cache** / **Clear Run History**.
- **Backup**: **Export settings** — `GET /api/project-backup` downloads
  `praxis-settings-backup.zip` containing the active project's `.praxis` folder (`settings.json`, `appearance.json`,
  `notes.json`, `spell-ignore.json`); **Import
  settings** — a `.zip` file input → `POST /api/project-backup`, then project settings
  refresh. A busy spinner covers the round trip.
- **Profiles — exactly 3 one-click curated bundles** (a `Partial<Settings>` patch over the
  current draft; non-destructive — keys not mentioned keep their values; saves
  immediately):
    - **Student** (GraduationGrad icon): `aiCompletionEnabled: true`, `autoSaveDelayMs: 1500`,
      `autoSaveOnBlur: true`, `autoFormatOnSave: true`, `confirmCloseUnsavedTab: true`,
      `autoSwitchToDiagnosticsOnError: true`, `autoSwitchToOutputOnRun: true`,
      `runTimeoutSeconds: 60`, `runDurationWarningThreshold: 10`, `confirmRunAll: true`,
      `warnNoPython: true`, `enableScriptNotes: true`, `showSymbolOutline: true`,
      `inlineDiagnostics: true`, `codeFolding: true`, `codeFontSize: 14`.
    - **Pro** (Zap): `aiCompletionEnabled: true`, `inspectVariables: true`,
      `captureDataframes: true`, `runTimeoutSeconds: 300`, `runDurationWarningThreshold: 0`,
      `runNotifyMode: "hidden"`, `historyMaxEntries: 40`, `autoSaveDelayMs: 800`,
      `autoFormatOnSave: true`, `stickyScroll: true`, `showMinimap: true`,
      `showGitDiffGutter: true`, `highlightCurrentLine: true`.
    - **Minimal** (Moon): `aiCompletionEnabled: false`, `inlineDiagnostics: false`,
      `showMinimap: false`, `showSymbolOutline: false`, `showRecentFiles: false`,
      `showGitStatus: false`, `showFolderSize: false`, `showFileSizeInDropdown: false`,
      `showWhitespace: false`, `bottomTabsIconOnly: true`, `autoSwitchToOutputOnRun: false`,
      `autoSwitchToDiagnosticsOnError: false`, `toastDuration: 2500`,
      `actionNotifications: false`, `runNotifyMode: "off"`.
- **Keyboard shortcuts** (static reference): Ctrl+K Search scripts · ⌘⇧H Run history ·
  Ctrl+/ Snippet palette · Ctrl+Enter Run script · Ctrl+, Toggle theme.

## Tab 12 — Cache

| Section       | Key                    | Label                                       | Default           | Range            | What it does                                          |
|---------------|------------------------|---------------------------------------------|-------------------|------------------|-------------------------------------------------------|
| Output cache  | `autoLoadCachedOutput` | Auto-load cached output on script selection | `true`            | —                | Replays the cached output when re-selecting a script. |
| Output cache  | `cacheTtlSeconds`      | Cache TTL (seconds)                         | `604800` (7 days) | 0 = never expire | Cached-output age limit.                              |
| Output cache  | `historyMaxEntries`    | History max entries                         | `25`              | 10–100           | Run-history entries kept.                             |
| Notifications | `actionNotifications`  | Show action notifications                   | `true`            | —                | The action toasts.                                    |
| Notifications | `toastDuration`        | Toast duration (ms)                         | `4000`            | 0 = sticky       | 0 leaves toasts with a "never auto-dismiss" badge.    |

## Tab 13 — Advanced

### Panel & run behavior (7 rows)

| Key                              | Label                               | Default  | Options                      | What it does                                                                                                      |
|----------------------------------|-------------------------------------|----------|------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `defaultBottomTab`               | Default bottom panel tab            | `output` | Output / Diagnostics / Notes | Which tab the bottom panel opens on.                                                                              |
| `autoSwitchToOutputOnRun`        | Auto-switch to Output on run        | `true`   | —                            | Switches the bottom panel when a run starts.                                                                      |
| `autoSwitchToDiagnosticsOnError` | Auto-switch to Diagnostics on error | `false`  | —                            | Switches when lint/typecheck finishes with errors.                                                                |
| `defaultRunMode`                 | Default run mode                    | `normal` | Normal / Coverage            | A legacy `"sandbox"` value displays as Normal (the sandbox was removed; re-add when firejail/bwrap/docker lands). |
| `confirmCloseUnsavedTab`         | Confirm closing unsaved tabs        | `true`   | —                            | The dirty-tab close guard.                                                                                        |
| `autoSaveOnBlur`                 | Auto-save on tab blur               | `false`  | —                            | Saves when the editor loses focus.                                                                                |
| `showCursorPositionInFooter`     | Show cursor position in footer      | `true`   | —                            | The Ln/Col readout.                                                                                               |

### Editor enhancements (7 rows)

| Key                     | Label                      | Default | What it does                                                                                      |
|-------------------------|----------------------------|---------|---------------------------------------------------------------------------------------------------|
| `codeFolding`           | Code folding (view mode)   | `true`  | Chevron collapse of def/class/for/if/while/try/with.                                              |
| `showMinimap`           | Minimap (view mode)        | `false` | The canvas rail.                                                                                  |
| `webWorkerHighlighting` | Syntax highlighting        | `true`  | The real tokenization Worker (`src/lib/highlight-worker.ts`) with the main-thread Prism fallback. |
| `highlightCurrentLine`  | Highlight current line     | `true`  | —                                                                                                 |
| `extensionsEnabled`     | Extensions system          | `true`  | Master toggle; Tools ▸ Extensions manages individuals.                                            |
| `showWhitespace`        | Show whitespace characters | `false` | —                                                                                                 |
| `maxLineLengthHint`     | Max line length hint       | `99`    | 0–1000; 0 = disabled. PEP 8: 79 strict / 99 modern.                                               |

### Sidebar (1 row)

| Key              | Label                                      | Default | What it does                 |
|------------------|--------------------------------------------|---------|------------------------------|
| `showFolderSize` | Show per-folder file-size stats in sidebar | `true`  | The size column in the tree. |

*(There are no proxy / api-token / concurrency rows on this tab — the API token lives in
`praxis.api-token` + the `PRAXIS_ACCESS_TOKEN` env var, and concurrency is runtime-side.)*
