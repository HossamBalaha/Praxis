#!/usr/bin/env bun
/**
 * Post-build step for `output: "standalone"` — CROSS-PLATFORM.
 *
 * The previous `package.json` build script did this with Unix `cp`:
 *
 *   next build && cp -r .next/static .next/standalone/.next/ \
 *                   && cp -r public .next/standalone/
 *
 * which fails on Windows: the `cp` found on PATH there doesn't
 * implement `-r` ("cp: illegal option -- r"), so `bun run build`
 * exited with code 1 AFTER an otherwise fully successful
 * `next build`. This script performs the same copies with Node's
 * `fs.cpSync` (recursive on every platform), so ONE command works on
 * Windows, macOS and Linux, under bun or node.
 *
 * Copied, relative to the project root:
 *   .next/static    -> .next/standalone/.next/static  (static assets)
 *   public/         -> .next/standalone/public          (served at /)
 *   python_scripts/ -> .next/standalone/python_scripts  (scripts root)
 *
 * NOTE on python_scripts: the build used to trace the WHOLE project
 * into .next/standalone (the 20 "dynamic filesystem access" Turbopack
 * warnings), which pulled python_scripts/ in as a side effect. Those
 * fs calls are now annotated with turbopack ignore comments, so the
 * standalone output is small and intentional — and the scripts root
 * is copied HERE, explicitly, keeping `bun .next/standalone/server.js`
 * self-contained on a plain machine. Deployments that set
 * SCRIPTS_ROOT (e.g. docker-compose) keep working unchanged.
 */
import {cpSync, existsSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nextDir = join(root, ".next");
const standalone = join(nextDir, "standalone");

function fail(message) {
  console.error(`copy-standalone: ${message}`);
  process.exit(1);
}

if (!existsSync(standalone)) {
  fail(
    '.next/standalone/ not found — run `next build` (output: "standalone") first.'
  );
}

// cpSync's recursive mode creates the destination, but the .next dir
// inside standalone must exist before we copy "static" INTO it.
mkdirSync(join(standalone, ".next"), {recursive: true});

/** Copy `from` into `to` (recursive, overwriting), skipping if absent. */
function copyDir(label, from, to) {
  if (!existsSync(from)) {
    console.log(`copy-standalone: skip ${label} (${from} not found)`);
    return;
  }
  cpSync(from, to, {recursive: true, force: true});
  console.log(`copy-standalone: ${label} -> ${to}`);
}

// 1) Static assets — the standalone server serves them from
//    .next/standalone/.next/static.
copyDir(
  ".next/static",
  join(nextDir, "static"),
  join(standalone, ".next", "static")
);

// 1b) Mirror the assets into the NESTED standalone layout. When the
//     build runs from a nested workspace (multiple lockfiles — the
//     sandbox/praxis-work case), Next emits
//     .next/standalone/<...>/server.js and serves static files
//     relative to THAT server.js, so the flat copy above alone leaves
//     the nested server without its chunks. Find every server.js
//     under standalone/ (max depth 4) and mirror static/ + public/ +
//     bin/ next to each.
{
  const {readdir} = await import("node:fs/promises");
  const found = [];
  const walk = async (dir, depth) => {
    if (depth > 4 || !existsSync(dir)) return;
    const entries = await readdir(dir, {withFileTypes: true});
    for (const e of entries) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
      const cd = join(dir, e.name);
      if (existsSync(join(cd, "server.js"))) {
        found.push(cd);
      } else {
        await walk(cd, depth + 1);
      }
    }
  };
  await walk(standalone, 1);
  for (const cd of found) {
    mkdirSync(join(cd, ".next"), {recursive: true});
    copyDir(`.next/static (nested ${cd})`, join(nextDir, "static"), join(cd, ".next", "static"));
    copyDir(`public (nested ${cd})`, join(root, "public"), join(cd, "public"));
    copyDir(`bin (nested ${cd})`, join(root, "bin"), join(cd, "bin"));
  }
}

// 2) public/ — favicon, PWA manifest, screenshots, … served at /.
copyDir("public", join(root, "public"), join(standalone, "public"));

// 2b) bin/ — the VENDORED 7za binary the archive extractor probes
//     first (src/lib/archive-caps.ts). Keeps .7z list + extract
//     working in the standalone build with zero system 7-Zip.
copyDir("bin", join(root, "bin"), join(standalone, "bin"));

// 2c) node-unrar-js — the in-process WASM unrar (RAR listing +
//     extraction without any system binary). It is a
//     serverExternalPackage, so Next's tracer usually includes it,
//     but its unrar.wasm is loaded by path at runtime and must not be
//     missed — copy it explicitly (a few hundred KB).
copyDir(
  "node-unrar-js (WASM unrar)",
  join(root, "node_modules", "node-unrar-js"),
  join(standalone, "node_modules", "node-unrar-js")
);

// 3) The scripts root (python_scripts/ by default; renamable via
//    NEXT_PUBLIC_SCRIPTS_DIR — see src/lib/config.ts). Docker-style
//    deployments point SCRIPTS_ROOT at a mounted folder instead and
//    don't depend on this copy.
const scriptsDirName = process.env.NEXT_PUBLIC_SCRIPTS_DIR || "python_scripts";
copyDir(scriptsDirName, join(root, scriptsDirName), join(standalone, scriptsDirName));

console.log("copy-standalone: done.");
