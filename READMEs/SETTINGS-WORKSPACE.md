# Settings — Tabs 4–8: Collaboration, Focus, AI, Nav, Accessibility

Back to the [settings index](./SETTINGS-REFERENCE.md). These five tabs cover the
collaborative, focus/ambience, AI, navigation, and accessibility surfaces.

## Tab 4 — Collaboration

The Collaboration tab does **not** edit the settings draft — it edits a separate store,
`src/lib/collab-store.ts` (localStorage `praxis.collab.settings`; the identity half lives in
`praxis.collab.identity`), persisting immediately per change.

| Key (collab-store) | Label                  | Control | Default                                                | Options                                                                                            | Effect                                                                         |
|--------------------|------------------------|---------|--------------------------------------------------------|----------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `displayName`      | Display name           | Input   | `""` → the generated identity name (e.g. "Guest-4821") | free text                                                                                          | What other participants see in the presence bar / session roster.              |
| `cursorColor`      | Cursor color           | Select  | `""` → the identity's generated color                  | 8 swatches: `#059669`, `#2563eb`, `#d97706`, `#dc2626`, `#7c3aed`, `#0891b2`, `#be185d`, `#65a30d` | Your presence color — cursors, avatars, selections.                            |
| `guestPermission`  | Guest permission       | Select  | `"edit"`                                               | read (read-only) / edit                                                                            | What invited guests can do in sessions you host.                               |
| `autoFollow`       | Follow mode by default | Switch  | `true`                                                 | bool                                                                                               | On session start, follow the host's file/scroll position until you click away. |

Footer note: sessions run through the Collaborate menu (Share Workspace / Copy Invite
Link / End Session). Room codes match `^[a-z0-9-]{3,40}$` (`makeRoomCode` generates e.g.
`swift-falcon-42`). Identity is `{id: randomUUID, name: "Guest-NNNN", color}` — "generated
once and reused forever". (The `Settings` schema also carries `collabGuestPermission`
default `"read"` and `collabAutoFollow` default `false` — unwired duplicates; the tab edits
the store.)

## Tab 5 — Focus

12 rows in "Focus sessions", plus the ambient section. Writes go live to
`src/lib/focus-settings.ts` (localStorage `praxis.focus-settings`; the
`praxis:focus-settings-changed` event re-hydrates a running FocusSessions widget). Legacy
fields (`ambientOn`, `ambient`, `long`, `rounds`) are stripped on load. Presets:
`pomodoro` (25/5) · `classic5217` "52/17 rule" (52/17) · `deepwork` "Deep work 90" (90/10) ·
`custom`.

| Key                | Label                                    | Control | Default          | Range/Options                                      | Effect                                                                                                            |
|--------------------|------------------------------------------|---------|------------------|----------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `preset`           | Preset                                   | Select  | `pomodoro`       | Pomodoro 25/5 · 52/17 rule · Deep work 90 · Custom | Applies preset durations; selecting never starts the timer.                                                       |
| `focus`            | Focus block (minutes)                    | Input   | 25 (from preset) | 1–240                                              | Length of one deep-work block.                                                                                    |
| `short`            | Short break (minutes)                    | Input   | 5 (from preset)  | 1–60                                               | Breather between focus blocks.                                                                                    |
| `dailyGoalMin`     | Daily focus goal (minutes)               | Input   | `90`             | 0–720 (0 = off)                                    | Chime + toast the first time today's focus minutes reach the goal.                                                |
| `autoStart`        | Auto-chain next phase                    | Switch  | `true`           | bool                                               | The next phase starts counting automatically when one ends (the first phase is always armed, never auto-started). |
| `sound`            | Chime when a phase ends                  | Switch  | `true`           | bool                                               | A soft two-tone chime synthesized in-browser.                                                                     |
| `notify`           | Toast when a phase ends                  | Switch  | `true`           | bool                                               | A desktop-style toast on each phase transition.                                                                   |
| `tabTitle`         | Countdown in the browser tab title       | Switch  | `true`           | bool                                               | Mirrors the remaining time into the page title while a phase runs.                                                |
| `ringStyle`        | Progress presentation                    | Select  | `ring`           | ring (animated SVG circle) / bar                   | The clock's progress display.                                                                                     |
| `compact`          | Compact widget                           | Switch  | `false`          | bool                                               | Tighter padding, smaller clock for the floating timer.                                                            |
| `zenMode`          | Zen mode                                 | Switch  | `false`          | bool                                               | Hides sidebar/bottom panel/AI chat while a focus block runs; restores on stop/pause/break.                        |
| `ambientWithFocus` | Start ambient sounds with focus sessions | Switch  | `false`          | bool                                               | Opt-in coupling: focus block start turns the ambient mix on.                                                      |

### The ambient mixer

Two rows — **Ambient sounds** (master switch; with an empty mix, enabling starts gentle
rain; toasts "Ambient sounds unavailable" if WebAudio is blocked) and **Master volume**
(range 0–100, applies live) — plus the "Open ambient mixer…" button (dispatches
`praxis:ambient-mixer` → the floating, draggable, non-modal mixer panel). Below them, a
two-column grid of **all 105 synthesized tracks** grouped into 8 categories, each with an
on/off switch (on = volume 45) + a 0–100 slider + a percent readout and a per-category
"n/m on" counter.

- **Categories**: Rain & Water (14 tracks), Fire & Air (12), Nature (14), Places (17),
  Urban & Machines (10), Noise & Tones (12), Space & Sci-Fi (8), Rhythmic & Tonal (15).
- **24 one-click quick-blends** (clicking replaces the whole mix): Rainy café · Deep
  forest · Night storm · Cozy fire · Airplane focus · Zen drone · Midnight train · Study
  room · Laundromat Sunday · Monsoon market · Snowed-in cabin · Library hush · Harbor
  morning · Deep space bridge · Iron workshop · Ocean temple · Lo-fi desk · Night savanna ·
  Metro commute · Server basement · Rainy rooftop · Cave of pools · Alpine dawn ·
  Mothership meditation.
- **Engine** (`src/lib/ambient.ts`, 2,409 lines): a module-level WebAudio singleton, state
  in localStorage `praxis.ambient` (`{on, master 0–100, vols: Record<trackId, 0–100>}`),
  pub/sub + a `useAmbientState` React hook. All 105 tracks are fully synthesized — zero
  network assets. The mixer's position persists in `praxis.ambient-mixer-pos`.
- **Focus stats** persist in `praxis.focus-stats`:
  `{days: Record<"YYYY-MM-DD", {sessions, minutes}>, streak, totalSessions, totalMinutes}`
  (streak = consecutive days with ≥ 1 block); "Statistics reset" clears history. The
  widget position persists in `praxis.focus-pos`.

## Tab 6 — AI

### Chat model providers (OpenAI-compatible only)

An active-provider select ("Use for chat & completions" — `aiChatProviderId`; falls back to
the first enabled provider; an empty list shows "No enabled providers") plus provider
cards. The provider list defaults to `[]` — the built-in Z.AI SDK provider was REMOVED,
and stale `kind: "zai"` entries are filtered at load. Each card: **enabled** Switch, name
Input, "OpenAI-compatible" badge, a **Test** button (pings the endpoint, reports
`OK — <ms>ms · <model>` or `Failed: …` inline), Remove (the active id falls back to the
next enabled or `""`), and the fields **Base URL** (`baseUrl`, placeholder
`http://localhost:11434/v1`), **Model** (`model`, placeholder `llama3.2`), **API key**
(`apiKey`, placeholder `sk-… (empty = no Authorization header)`) plus a **"Store on
server"** button (POST `/api/ai-keys` → `~/.praxis/ai-keys.json`, mode 0600; clears the
browser copy).

**7 quick-add presets**:

| Preset     | Pre-filled name   | Base URL                       | Model      |
|------------|-------------------|--------------------------------|------------|
| Ollama     | Ollama (local)    | `http://localhost:11434/v1`    | `llama3.2` |
| LM Studio  | LM Studio (local) | `http://localhost:1234/v1`     | (empty)    |
| vLLM       | vLLM (local)      | `http://localhost:8000/v1`     | (empty)    |
| llama.cpp  | llama.cpp (local) | `http://localhost:8080/v1`     | (empty)    |
| Z.AI API   | Z.AI (GLM)        | `https://api.z.ai/api/paas/v4` | `glm-4.6`  |
| OpenRouter | OpenRouter        | `https://openrouter.ai/api/v1` | (empty)    |
| Custom     | Custom endpoint   | `http://`                      | (empty)    |

### Integrated AI assistant

| Key                      | Label                                 | Control          | Default                                                    | Range               | Effect                                                                                                                |
|--------------------------|---------------------------------------|------------------|------------------------------------------------------------|---------------------|-----------------------------------------------------------------------------------------------------------------------|
| `aiCompletionEnabled`    | AI code completion (suggestion popup) | Switch           | `false`                                                    | bool                | Debounced ghost-text popup; Tab accepts, Esc dismisses, Alt+\ forces a fetch; routes through the selected provider.   |
| `aiChatVerifyModel`      | Verify the model before chatting      | Switch           | `true`                                                     | bool                | On sidebar open, pings the provider with a trivial message; failure disables the composer and shows the setup helper. |
| `aiChatEnterToSend`      | Enter sends the message               | Switch           | `true`                                                     | bool                | ON: Enter sends / Shift+Enter newline. OFF: Enter newline / Ctrl+Cmd+Enter sends.                                     |
| `aiChatSystemPrompt`     | AI Chat system prompt                 | Textarea + Reset | `""` (built-in default: a helpful Python coding assistant) | free text           | Biases the assistant; empty = built-in default.                                                                       |
| `aiChatContextChars`     | AI Chat context chars                 | Input            | `6000`                                                     | 500–20000 (clamped) | Max chars of the current file sent as context; the server truncates to the tail.                                      |
| `aiChatMaxMessages`      | AI Chat max messages                  | Input            | `50`                                                       | 5–100 (clamped)     | Max history messages sent; older dropped server-side.                                                                 |
| `aiCompletionDebounceMs` | AI completion debounce (ms)           | Input            | `1000`                                                     | 0–5000, step 100    | Keystroke → fetch delay; 0 = no debounce.                                                                             |

The **sampling controls are NOT on this tab** — they live in the AI chat sidebar's composer (the "Tuning" popover,
`ai-sampling-controls.tsx`): temperature 0–2 (step 0.1), top_p 0–1 (step 0.05), max_tokens 64–8192 (step 64), per
`SAMPLING_BOUNDS` in `src/lib/ai-shared.ts`
(server-sanitized); `null` = provider defaults (nothing sent); UI seed values 0.7 / 1 / 2048;
Reset returns to null.

### External AI endpoints (the "Ask AI" button)

`aiEndpoints` (default: **Gemini** `https://gemini.google.com/app` · **Claude**
`https://claude.ai/new` · **ChatGPT** `https://chat.openai.com/` — all enabled) — dynamic
rows of Switch + name Input + URL Input + remove; an **Add AI endpoint** button appends
`{name: "Custom", url: "https://", enabled: true}`. Ask AI copies the question to the
clipboard and opens the site in a new tab. The **AI question template**
(`aiQuestionTemplate`) is a textarea with the variables `{script_name} {source_code}
{output} {error_or_success} {question}`; the default template assembles the script name,
the outcome, the output, the source, and the question.

## Tab 7 — Nav

### Navigation (6 rows)

| Key                           | Label                                      | Default | Effect                                                 |
|-------------------------------|--------------------------------------------|---------|--------------------------------------------------------|
| `fullTextSearchByDefault`     | Full-text search by default in palette     | `false` | Include full-text search in the Ctrl+K search palette. |
| `showGitStatus`               | Show git status badges (requires git repo) | `true`  | Git status badges in dropdowns.                        |
| `showFileSizeInDropdown`      | Show file size in dropdown                 | `true`  | File size in the script dropdown.                      |
| `showLastRunStatusInDropdown` | Show last-run status dot in dropdown       | `false` | Last-run status dot in the dropdown.                   |
| `sessionRestore`              | Restore the session on reload              | `true`  | Reopen tabs + caret position after reload/restart.     |
| `showWordCountInFooter`       | Word count in the footer                   | `true`  | Words · characters · reading time next to Ln/Col.      |

### 32 quick-action switches (map `topRightQuickActions`)

The map's default is `{}` — a missing key means the **default-shown** set renders; `false`
hides; only explicit `true` turns on an opt-in extra.

**13 default-shown**: `run` (Run button + entry-point badge) · `jump` (Ctrl+Shift+J
jump-to-anything) · `screenshot` (the camera dropdown: window/code/region) · `toolbox`
(Developer Toolbox) · `layout` (the preset picker) · `terminal` (Ctrl+`) · `search` (Ctrl+K)
· `ai` (the AI chat sidebar) · `history` (⌘⇧H + count badge) · `refresh` (⌘⇧R) ·
`settings` (⌘,) · `theme` (the interface-theme dropdown) · `project` (the active-project
chip).

**19 opt-in extras** (render nothing until explicit `true`): `palette` (⌘⇧P command
palette) · `distractionFree` (⇧F11) · `runQueue` (the queued-runs dialog) · `scheduler`
(cron scheduled runs) · `goToFile` (⌘T) · `bookmarks` (favorites + line bookmarks) ·
`dependencyManager` (the pip package browser) · `jumpList` (symbols + outline places) ·
`projectSymbols` (project-wide symbol search) · `snippets` (Ctrl+/ snippet inserter) ·
`snippetManager` (the snippet library CRUD + import/export) · `localHistory` (per-file save
snapshots + rollback) · `gitLog` (commit history) · `gitDiff` (the Git Diff tab + modified
count badge) · `chartPreview` (chart from the current CSV X/Y) · `sqlWorkbench` (the
SQLite workbench on .db files) · `fullscreen` (F11) · `shortcutTrainer` (practice
shortcuts) · `shortcuts` (the full shortcuts reference dialog).

## Tab 8 — Accessibility

**Language (1 row)**: `language` — Interface language — Select — default `"en"` —
English / العربية (Arabic). Translates the menu-bar chrome and flips the shell to RTL (scaffold scope:
dialogs/settings/tooltips stay English); mirrors localStorage
`praxis.language`; applied via `setChromeLanguage`.

**Vision & readability (5 rows)**: `highContrastMode` (High contrast mode, def `false` —
stronger borders/text contrast) · `largeTextMode` (Large text mode, `false` — +25% base UI
text) · `dyslexiaFriendlyMode` (Dyslexia-friendly mode, `false` — wider letter spacing, the
Atkinson Hyperlegible stack) · `colorBlindMode` (Color-blind friendly palette, `false` —
red/green → blue/orange) · `reduceMotion` (Reduce motion, `false` — disables
animations/transitions).

**Interaction & assistive tech (5 rows)**: `screenReaderMode` (Screen reader mode, `false` —
extra ARIA labels, simplified landmarks) · `enhancedFocusIndicators` (Enhanced focus
indicators, `false` — thicker focus rings) · `stickyCursorIndicator` (Sticky cursor
indicator, `false` — a visible caret marker while scrolling away) ·
`alwaysShowShortcutHints` (Always show shortcut hints, `false` — keyboard hints shown
permanently) · `wrapTabNavigation` (Wrap Tab navigation, `false` — Tab/Shift+Tab cycle
instead of escaping to the browser chrome).

All apply instantly via page-level `data-*` attributes (applied pre-paint by the inline
bootstrap script in `layout.tsx` so there is no flash); they stack freely; the same
switches live in the Tools ▸ Accessibility submenu.
