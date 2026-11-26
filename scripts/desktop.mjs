#!/usr/bin/env bun
/* Praxis desktop launcher — run the IDE as a desktop-style app.
 *
 * Boots the production standalone server on a local port and opens a
 * window:
 *   1. `--native`      a REAL native OS window via webview-bun (the OS's
 *                      built-in webview: WebKit on macOS, Edge WebView2 on
 *                      Windows, WebKitGTK on Linux) — `bun add webview-bun`
 *                      to enable; close the window to stop Praxis.
 *   2. default         an app-mode browser window (Chrome/Edge/Chromium
 *                      `--app=...`: own window, own taskbar entry, no
 *                      address bar, no tabs) when a Chromium-family browser
 *                      is found.
 *   3. fallback        the system default browser as a plain tab.
 *
 * Usage:
 *   bun run desktop                # app-mode browser window
 *   bun run desktop -- --native    # native webview window (webview-bun)
 *   bun run desktop -- --port 8321  # pick the port (default 4317)
 *
 * The port can also be set with PRAXIS_DESKTOP_PORT. If the port is busy a
 * random free one is chosen automatically.
 *
 * Single-file binary (optional — needs the build output next to it):
 *   bun build --compile scripts/desktop.mjs --outfile praxis-desktop
 *
 * For a full native wrapper with menus, tray and signed auto-updates see
 * ./READMEs/ELECTROBUN-GUIDE.md (Electrobun path) — this launcher is the "Local
 * server + window" path that works everywhere today.
 */

import {spawn, spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import net from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, ".next", "standalone", "server.js");
const DEFAULT_PORT = 4317;
const TITLE = "Praxis";

/* ── CLI flags ─────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const native = argv.includes("--native");
const portArgIdx = argv.indexOf("--port");
const portArg = portArgIdx >= 0 ? Number(argv[portArgIdx + 1]) : NaN;
const wantedPort =
  (Number.isFinite(portArg) && portArg > 0 && portArg < 65536 && portArg) ||
  (Number(process.env.PRAXIS_DESKTOP_PORT) || DEFAULT_PORT);

const log = (msg) => console.log(`[praxis] ${msg}`);

/* ── Pick a free port ─────────────────────────────────────────── */
function isFree(port) {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  if (await isFree(wantedPort)) return {port: wantedPort, fixed: true};
  const port = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("listening", () => {
      const addr = probe.address();
      probe.close(() => resolve(addr.port));
    });
    probe.once("error", () => resolve(null));
    probe.listen(0, "127.0.0.1");
  });
  // Extremely rare (an ephemeral port failing too): fall back to the
  // wanted port and let the server surface the EADDRINUSE error itself.
  return {port: port ?? wantedPort, fixed: false};
}

/* ── Locate an executable on PATH ─────────────────────────────── */
function which(name) {
  try {
    if (globalThis.Bun?.which) return globalThis.Bun.which(name) ?? null;
  } catch { /* fall through to the shell probe */
  }
  const probe =
    process.platform === "win32"
      ? spawnSync("where", [name], {encoding: "utf-8"})
      : spawnSync("sh", ["-c", `command -v ${name}`], {encoding: "utf-8"});
  const out = (probe.stdout || "").split("\n")[0].trim();
  return out || null;
}

/* ── Chromium-family browser for the app-mode window ──────────── */
function findAppBrowser() {
  if (process.platform === "darwin") {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (existsSync(chrome)) return chrome;
    const edge = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    if (existsSync(edge)) return edge;
    return null;
  }
  const candidates =
    process.platform === "win32"
      ? ["chrome", "msedge", "chromium"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
  for (const c of candidates) {
    const p = which(c);
    if (p) return p;
  }
  return null;
}

/* Detached launcher spawn that can NEVER crash this script: ENOENT
 * surfaces as an async 'error' event on the child (not a sync throw),
 * so an error listener is attached before anything else. Returns false
 * only for failures detectable synchronously (missing opener pre-probe). */
function launchDetached(cmd, args) {
  try {
    const child = spawn(cmd, args, {detached: true, stdio: "ignore"});
    child.once("error", () => { /* opener missing / refused — harmless */
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openDefaultBrowser(url) {
  if (process.platform === "win32") {
    return launchDetached("cmd", ["/c", "start", "", url]);
  }
  if (process.platform === "darwin") {
    return launchDetached("open", [url]);
  }
  // Headless machines / minimal distros may ship no xdg-open at all —
  // probe first so the caller can print the manual URL fallback.
  if (!which("xdg-open")) return false;
  return launchDetached("xdg-open", [url]);
}

/* ── Wait until the server answers /api/health ─────────────────── */
async function waitUntilHealthy(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/api/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/* ── Main ──────────────────────────────────────────────────────── */
async function main() {
  if (!existsSync(SERVER)) {
    log("no production build found (.next/standalone/server.js).");
    log("build first:  bun install && bun run build");
    process.exit(1);
  }

  const {port, fixed} = await pickPort();
  if (!fixed) log(`port ${wantedPort} is busy — using ${port} instead.`);
  const url = `http://127.0.0.1:${port}`;

  const runner = process.versions?.bun
    ? {cmd: process.execPath, label: "bun"}
    : {cmd: "node", label: "node"};

  log(`starting the server on ${url} (${runner.label})…`);
  const server = spawn(runner.cmd, [SERVER], {
    cwd: path.dirname(SERVER),
    env: {...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1"},
    stdio: "inherit",
  });

  const shutdown = (code) => {
    try {
      server.kill("SIGTERM");
    } catch { /* already gone */
    }
    setTimeout(() => process.exit(code), 120);
  };
  server.once("exit", (code) => {
    log(`server exited (code ${code}).`);
    process.exit(code ?? 0);
  });
  process.once("SIGINT", () => shutdown(0));
  process.once("SIGTERM", () => shutdown(0));

  const healthy = await waitUntilHealthy(port, 30_000);
  if (!healthy) {
    log("the server did not answer /api/health within 30 s — open the URL manually:");
    log(`  ${url}`);
  }

  /* Window strategy 1 — a real native OS webview via webview-bun. */
  if (native) {
    let mod = null;
    try {
      mod = await import("webview-bun");
    } catch { /* not installed */
    }
    if (!mod?.Webview) {
      log("--native was requested but webview-bun is not installed.");
      log("install it (optional dependency) and try again:");
      log("  bun add webview-bun");
      log("falling back to a browser window.");
    } else {
      const redirect = `<!doctype html><html><head><meta charset="utf-8">` +
        `<meta http-equiv="refresh" content="0; url=${url}">` +
        `<title>${TITLE}</title></head>` +
        `<body style="margin:0;background:#0a0a0a;color:#9ca3af;font-family:system-ui,sans-serif;` +
        `display:flex;align-items:center;justify-content:center;height:100vh">` +
        `Launching ${TITLE}…</body></html>`;
      const w = new mod.Webview();
      if (typeof w.navigate === "function") {
        try {
          w.navigate(url, TITLE);
        } catch {
          w.setHTML(redirect);
        }
      } else {
        w.setHTML(redirect);
      }
      log("native webview window opened — close it to stop Praxis.");
      try {
        w.run();
      } catch (err) {
        log(`native webview failed (${err instanceof Error ? err.message : String(err)}).`);
        log("make sure the OS webview runtime is present (WebView2 on Windows, WebKitGTK on Linux).");
      }
      shutdown(0);
      return;
    }
  }

  /* Window strategy 2 — an app-mode Chromium window. */
  const browser = findAppBrowser();
  if (browser) {
    log("opening an app window (Chromium-family browser, --app mode)…");
    const opened = launchDetached(browser, [`--app=${url}/`, "--window-size=1440,900"]);
    if (!opened) log("the browser could not be launched — open the URL manually.");
  } else {
    log("no Chromium-family browser found — opening the default browser.");
    if (!openDefaultBrowser(`${url}/`)) {
      log("no system opener found (headless machine?) — open this URL manually:");
      log(`  ${url}/`);
    }
  }

  log(`Praxis is running at ${url}`);
  log("press Ctrl+C here to stop it.");
}

main().catch((err) => {
  log(`launcher failed: ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
