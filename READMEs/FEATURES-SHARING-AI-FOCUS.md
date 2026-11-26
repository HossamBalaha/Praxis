# Features — Sharing & Export, Building Blocks & Examples, AI, Focus & Ambience

Back to the [feature index](./README-FEATURES.md).

## 📤 Sharing & export

- **Export menu** (11 formats, capability-gated per file kind): Markdown report,
  Jupyter notebook (cell-split, outputs attached to the last code cell), standalone HTML (figures base64-embedded; SVG
  deliberately base64-inlined so matplotlib SVG cannot
  execute scripts), plain text, JSON bundle, PDF via print, session report (HTML), LaTeX
  `.tex`, reStructuredText, Copy-as-Markdown, GitHub-ready repo `.zip` (README/.gitignore/
  requirements injected inside the archive), plus Compress-to-ZIP (on-disk, never
  overwrites), folder zip downloads, batch zip of multi-selections, and Download (any
  file, ascii-folded filenames).
- **Publish Snapshot Link**: the whole workspace packed into the URL hash (`#praxis=`,
  never the query — servers never see it; ≤200 files, ≤256 KB each, ≤1.5 MB total, with
  dictionary dedupe of repeated contents). Opening the link restores the workspace.
- **Screenshots**: the Screenshot Studio — a camera-style three-step composer (pick mode →
  compose → deliver). Modes: window / code (the whole file rendered to one PNG with
  line numbers and an editable caption) / selection (freeze + drag) / selection-text /
  range / editor / bottom / sidebar / dialog / app. Live checkerboard preview, quality
  presets with intent labels (Screen 96 / Sharp 192 / Print 300 / Max 600 DPI), PNG/JPEG/
  WebP with DPI metadata embedded, remembered automation (Ask/Copy/Save/Download).
- **Import**: GitHub URL import, zip upload as a project, drag-drop files, `.ipynb`
  import (cells converted to `# %%` markers), and clipboard/file compare.

## 🧱 Editor building blocks & examples

- **Templates**: 61-entry picker manifest across 8 file kinds (28 Python blocks — from
  `py-function` to `py-test`; 15 Markdown; 8 `.gitignore` presets; text/JSON/YAML/TOML/
  CSV singles), each carrying `{v:}/{f:}/{c:}/{d:}` naming-style tokens resolved to the
  user's configured casing, a `$0` caret marker, live filename validation (Windows reserved
  device names, hidden-file rules, uniqueness), and kind pre-filtering to the current
  file. The 15 starter scripts from `/api/templates` back the File ▸ New flow.
- **Insert blocks**: the editor's Insert button + right-click menu injects the same
  template library inline (selection-replacing, indent-preserving).
- **Snippets**: Ctrl+/ palette insertion, a full CRUD snippet manager with import/export
  packs, and Tab snippet expansion with `$n`/`${n:default}` tabstop navigation — all
  machine-scoped in `~/.praxis-snippets.json`.
- **The examples library**: 3,700 ready-to-run files across 27 language groups — Python
  2,150 exactly (1,000 core across Basics/Statistics/Plotting/Data/Algorithms/Files/Text/
  OOP/Utilities/Project; 800 in the four generated categories — Machine Learning, Medical
  Image Analysis, Imaging & Vision, Calibration & Forecasting; 350 in 14 × 25 categories),
  every other language exactly 50 — validated by the `check:examples` contract test that
  compiles and executes every body. The library loads lazily (~5 MB chunk, off the
  critical path); created file names follow the naming-style settings.
- **Scaffolding**: six blueprints (data-analysis, package-skeleton, ml-experiment,
  report-bundle, cli-tool, fastapi-app) creating folder + starter-file trees.

## 🤖 AI integration

- **Chat sidebar** (2,388 lines): streaming SSE chat with the current file as context (a chip shows the char count and
  truncation state), conversation search, Markdown
  export, `@path ▸ symbol` mentions (up to 5 files, symbol-focus supported), `path:line`
  citations linkified into jumps, KaTeX math, GFM, Retry, Stop, and a connection-lost
  marker. The provider stack is OpenAI-compatible only — 7 quick-add presets (Ollama,
  LM Studio, vLLM, llama.cpp, Z.AI API, OpenRouter, Custom) with Test buttons, and keys
  optionally stored server-side in `~/.praxis/ai-keys.json` (0600) so they never touch
  localStorage.
- **Ghost-text completion**: a debounced (default 1 s) suggestion popup — Tab accepts,
  Esc dismisses, Alt+\ forces a fetch — served by `/api/ai-completion` with FIM-style
  context framing and per-language prompts.
- **Inline AI chat** (Ctrl+I): an anchored card at the selection with preset chips (Explain/Refactor/Add docstring/Add
  type hints/Fix bugs/Write tests), streamed replies,
  a diff preview, and an undoable Apply through the host.
- **File actions**: Explain / Improve current file (routed to the integrated chat first,
  with per-external-endpoint "copies question + opens site" fallbacks), **Generate AI
  Tests** (a streamed pytest file preview written on approval), **Agent Mode** (a
  multi-file edit planner: numbered steps, per-edit word-diff cards with Approve/Reject,
  drift re-checks against the live file, one Ctrl+Z undo group for the whole batch),
  and **AI Code Review** (the git diff sent for hunk-anchored severity-badged comments
  with Apply-fix splicing).
- **Sampling controls** in the composer ("Tuning"): temperature / top_p / max_tokens
  sliders, null = provider defaults. **External Ask-AI endpoints** (Gemini/Claude/ChatGPT
  defaults + custom rows) with a templated question.

## 🧘 Focus & ambience

- **Focus timer**: Pomodoro 25/5, 52/17, Deep Work 90, or custom; auto-chained phases,
  chime + toast + tab-title countdown, ring or bar presentation, compact widget, Zen
  mode (hides sidebar/panels/AI chat for the block, restores after), a floating draggable
  widget with a persisted position, and study statistics (per-day sessions/minutes,
  streaks, all-time totals) with a reset.
- **Ambient sounds**: 105 fully synthesized tracks in 8 categories (rain & water, fire &
  air, nature, places, urban & machines, noise & tones, space & sci-fi, rhythmic &
  tonal) — zero network assets; per-track volume sliders, a master volume, 24 one-click
  quick-blends (Rainy café, Night storm, Airplane focus, Zen drone, …), a draggable
  non-modal mixer panel, and an opt-in coupling that starts the mix with each focus
  block.
- **Breaks**: the short-break phase between blocks, skip-phase, and stop controls from
  the Focus menu; notifications respect the same visibility gating as run-finished
  alerts.
