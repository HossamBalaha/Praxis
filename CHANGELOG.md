# Changelog

All notable changes to **Praxis** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

## - 2026-11-26

### Added

- **Polyglot Execution Engine**: Browser and desktop IDE supporting **Python** first alongside **29+ languages**
  (JavaScript, TypeScript, MATLAB, R, Bash, Java, C, C++, Ruby, PHP, Go, Lua, Perl, Rust, Julia, Kotlin, Swift,
  PowerShell, Batch, Zig, Dart, Groovy, Scala, Elixir, Haskell, Erlang, Clojure, OCaml, and F#).
- **Interactive Python Scientific Workbenches**: Streaming stdout/stderr output, automatic `matplotlib` figure capture,
  `pandas` DataFrame previews, live variable inspector, line-by-line code coverage, profiling panels, and integrated
  `Ruff` + `mypy` diagnostics.
- **Language Intelligence**: Integrated Pyright LSP sidecar (`READMEs/ARCHITECTURE-PYRIGHT-LSP.md`), Web Worker syntax
  highlighting (`Prism` + `SyntaxHighlighter`), and 7-dictionary spellchecking.
- **Data & Web Workbenches**: Built-in SQLite (read-only by default with gated write mode), DuckDB in-memory SQL runner,
  and CORS-free HTTP API client workbench.
- **Workspace, Git & AI Tools**: Auto-discovered filesystem chapter trees, integrated terminal, local Git workflows,
  offline write queue with F5-proof session restoration, and OpenAI-compatible AI provider integration with local/server
  keyring (`~/.praxis/ai-keys.json`).
- **Accessibility & Internationalization**: WCAG-minded interface with English (`EN`) and Arabic (`AR`) UI localization
  and PWA offline support.
- **Native Desktop Distributions**: Cross-platform desktop packaging via **Electron & `electron-builder`**
  (`electron-main.js`, `bun run desktop:build`), producing single-file portable executables and system installers for
  **Windows** (`.exe`), **Linux** (`.AppImage`, `.deb`), and **macOS** (`.dmg`, `.zip`).
- **CI/CD & Documentation**: Automated GitHub Actions pipelines for CI verification (`.github/workflows/ci.yml`) and
  multi-OS desktop release builds (`.github/workflows/release-desktop.yml`), alongside full architecture and feature
  documentation in `READMEs/`.
