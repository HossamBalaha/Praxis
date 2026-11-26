# Desktop Application Guide: Electron & electron-builder

This guide provides a comprehensive, end-to-end overview of how **Praxis** is packaged into native portable and
installable desktop applications across Windows, Linux, and macOS using **Electron** and **electron-builder**.

---

## Why Electron & electron-builder?

Packaging a full-stack Next.js application (which requires a live Node/Bun runtime, dynamic API routes, static asset
serving, and external Python/binary execution) requires an architecture that bundles the server alongside a desktop
webview without manual user configuration.

* **Zero Rust or C++ Toolchain Overhead**: Unlike Tauri, which requires installing and compiling hundreds of Rust crates
  and configuring external sidecar binaries, Electron runs natively on JavaScript and Node.js.
* **True Single-File Portable Executables**: `electron-builder` natively supports single-file portable packaging
  (`portable` on Windows, `AppImage` on Linux, and `zip` on macOS) as well as standard system installers (`nsis`, `deb`,
  and `dmg`).
* **Self-Contained Server Execution**: The desktop wrapper embeds Next.js's standalone server output directly inside the
  application resources, eliminating the need for end users to install Bun, Node.js, or `node_modules`.

---

## Project Architecture & File Paths

All desktop packaging files are integrated directly into the repository root and scripts directory:

* **`electron-main.js`**: The primary Electron main-process entry point. When the desktop application launches, this
  script verifies that static assets are positioned inside the standalone directory, boots the embedded Next.js
  standalone server on `127.0.0.1:3000`, polls the local port until the server is ready, and opens a native
  `BrowserWindow` with the application menu bar hidden.
* **`next.config.ts`**: Configured with `output: "standalone"` so Next.js traces only the minimal runtime dependencies
  required for production and generates a self-contained server at `.next/standalone/server.js`.
* **`scripts/copy-standalone.mjs`**: Executed automatically during `bun run build`. It copies `.next/static`, `public/`,
  `bin/`, `node-unrar-js` WASM binaries, and `python_scripts/` into `.next/standalone/` so all backend features remain
  functional when packaged.
* **`scripts/dereference-standalone.js`**: A pre-packaging sanitization script that scans `.next/standalone/` for
  symbolic links (such as those created by Next.js inside `.next/standalone/.next/node_modules`) and replaces them with
  physical directory copies. This prevents permission failures on Windows machines during packaging and extraction.
* **`public/android-chrome-512x512.png`**: Serves as the high-resolution application icon across Windows executables,
  Linux AppImages, macOS app bundles, and the running desktop window title bar.
* **`package.json`**: Defines the `"main"` entry point (`electron-main.js`), the `"desktop:build"` orchestration script,
  and the `"build"` configuration block for `electron-builder` (with `"asar": false` so the embedded Next.js server and
  Python scripts can read files normally from disk).
* **`.github/workflows/release-desktop.yml`**: Automates cloud builds across Windows, Ubuntu Linux, and macOS runners
  whenever a release tag (`v*`) is pushed or a manual workflow dispatch is triggered.

---

## Step-by-Step Build Workflow

### 1. Prerequisites (Windows 11 Developers)

Before running a local desktop build on Windows 11, ensure **Developer Mode** is enabled in Windows Settings (**System →
For developers → Developer Mode**). `electron-builder` extracts platform tools and handles file links during packaging
that Windows otherwise blocks without administrator elevation.

### 2. Local Build Execution

Running `bun run desktop:build` executes three sequential stages:

1. **Next.js Production & Standalone Build (`bun run build`)**: Compiles the Next.js application into `.next/standalone`
   and triggers `scripts/copy-standalone.mjs` to bundle `public/`, `bin/`, and `python_scripts/`.
2. **Symlink Dereferencing (`bun scripts/dereference-standalone.js`)**: Converts any symbolic links inside
   `.next/standalone` into real files and folders so `electron-builder` can pack them cleanly without `EPERM` errors.
3. **Desktop Packaging (`bunx electron-builder`)**: Bundles `electron-main.js` and `.next/standalone/**/*` with the
   Electron runtime and outputs the final artifacts into `dist-desktop/`.

### 3. Build Outputs (`dist-desktop/`)

Depending on the target platform, `electron-builder` generates both portable and installable distributions:

* **Windows**: `Praxis <version>.exe` (single-file portable executable) and `Praxis Setup <version>.exe` (NSIS installer
  with Start Menu and Desktop shortcuts).
* **Linux**: `Praxis-<version>.AppImage` (portable executable) and `praxis_<version>_amd64.deb` (Debian/Ubuntu package).
* **macOS**: `Praxis-<version>-mac.zip` (portable `.app` archive) and `Praxis-<version>.dmg` (disk image installer).

---

## Automated Cloud Builds (GitHub Actions)

Because native dependencies (such as `sharp` and `node-unrar-js`) are compiled per operating system, cross-platform
builds must run on their respective native OS runners.

* **Workflow Location**: `.github/workflows/release-desktop.yml`
* **Trigger Conditions**: Runs manually via the **Actions** tab (`workflow_dispatch`) or automatically whenever a Git
  tag matching `v*` (e.g., `v0.1.0`) is pushed.
* **Dynamic Versioning**: The workflow reads the `"version"` field directly from `package.json` using Bun and appends it
  to the uploaded artifact names (`Praxis-<version>-win`, `Praxis-<version>-linux`, and `Praxis-<version>-mac`).
* **Release Publishing**: When triggered by a `v*` tag, the workflow automatically creates or updates the corresponding
  GitHub Release and attaches all Windows, Linux, and macOS binaries.

---

## Frequently Asked Questions (Q&A)

### Why does the portable `.exe` take 10–25 seconds to open on the first launch?

A portable `.exe` (~200 MB) is a self-extracting compressed archive. When double-clicked, Windows unpacks the Electron
runtime and `.next/standalone` folder into the system's temporary directory (`%TEMP%`), and Windows Defender scans the
extracted files before `electron-main.js` starts the Next.js server. By contrast, the installable version
(`Praxis Setup <version>.exe`) extracts files once during installation and launches almost immediately afterward.

### Why did I get an `EPERM: operation not permitted, symlink` error on Windows 11?

Next.js generates symbolic links inside `.next/standalone/.next/node_modules` during standalone builds. Windows
restricts symlink creation by default unless **Developer Mode** is turned on in Windows 11 Settings. Running
`scripts/dereference-standalone.js` prior to `electron-builder` also resolves this issue by replacing symlinks with
standard copies.

### Why is `"asar": false` required in `package.json`?

By default, `electron-builder` packs application files into a single read-only `.asar` archive. However, Next.js's
standalone server, WASM modules (`node-unrar-js`), and external scripts (`python_scripts/` and `bin/`) expect standard
filesystem paths when spawning child processes or resolving modules. Setting `"asar": false` preserves the real
directory structure inside the packaged resources while still bundling everything into a single portable `.exe` or
installer.

### What happens if port `3000` is already in use when opening the desktop app?

`electron-main.js` starts the embedded server on `127.0.0.1:3000`. If a local development server (`bun run dev` or
`bun run start`) is already occupying port `3000`, the embedded server cannot bind to that port and the desktop window
may connect to the existing dev server instead. Always stop local terminal servers before testing the packaged desktop
executable.

### Why does Windows File Explorer still show the old default icon after rebuilding?

Windows Explorer aggressively caches executable icons by file path and name. If you rebuild after updating
`public/android-chrome-512x512.png`, move the generated `.exe` to a different folder, rename it, or restart Windows
Explorer via Task Manager to view the updated icon.

### Can I build the Linux and macOS versions directly from Windows 11?

No. While `electron-builder` can package Windows targets locally on Windows 11, native Node modules installed via
`bun install` on Windows contain Windows-specific binaries (`.node` and `.dll`). Linux (`.AppImage`, `.deb`) and macOS
(`.zip`, `.dmg`) builds must be executed on native Linux and macOS environments via
`.github/workflows/release-desktop.yml`.

### Does running the GitHub Actions desktop workflow consume paid credits?

* **Public Repositories**: GitHub Actions is **100% free with unlimited minutes** across Windows, Linux, and macOS
  runners.
* **Private Repositories**: Builds deduct from your account's 2,000 free monthly minutes (with 1× billing for Linux, 2×
  for Windows, and 10× for macOS). Configuring the workflow to trigger only on `v*` tags and manual dispatches prevents
  routine commits from consuming your monthly quota.

---

## Alternative Packaging Approaches (Reference)

While **Electron & electron-builder** is the active production pipeline for Praxis due to its zero-Rust setup and native
single-file packaging, two lightweight alternatives exist for specific deployment scenarios:

1. **Electrobun (`desktop/electrobun`)**: A Bun-native desktop shell that uses the OS system webview (WebView2 on
   Windows) and bundles into a ~30 MB archive without Chromium overhead.
2. **Bun Single-File Compiler (`bun build --compile`)**: Compiles a minimal TypeScript launcher and Next.js standalone
   server into a ~60 MB executable that opens the interface in Microsoft Edge or Chrome's standalone `--app` window mode
   rather than a custom Electron window.
