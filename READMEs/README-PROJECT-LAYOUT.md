# Praxis — Project Layout

The repository tree with counts (what lives where, and what is allowed to live there —
the rules are in [ARCHITECTURE.md](../ARCHITECTURE.md) §1). The catalogs of what each
file does: [COMPONENTS-REFERENCE-A-J.md](./COMPONENTS-REFERENCE-A-J.md) ·
[COMPONENTS-REFERENCE-K-Z.md](./COMPONENTS-REFERENCE-K-Z.md) ·
[LIB-REFERENCE-A-M.md](./LIB-REFERENCE-A-M.md) · [LIB-REFERENCE-N-Z.md](./LIB-REFERENCE-N-Z.md).

```text
praxis/
├── README.md  # Orientation, quick start, the documentation index (root docs: only this + ARCHITECTURE.md).
├── ARCHITECTURE.md  # The load-bearing rules (layer map, invariants, state, quality gates).
├── READMEs/  # Every detailed reference document (menus, settings, shortcuts, API, features, catalogs, policies).
├── package.json  # Bun-first scripts: dev/build/start/desktop/lint/typecheck/test/check.
├── bun.lock  # The single lockfile (Bun is the canonical package manager).
├── tsconfig.json  # strict: true, noImplicitAny: false, @/* → src/*.
├── eslint.config.mjs  # The max-lines budget ledger (2,000 default; 14 grandfathered monoliths).
├── .lint-warning-budget  # 358 — the warning ratchet (down only).
├── next.config.ts  # standalone output, security headers, serverExternalPackages.
├── playwright.config.ts  # serial, single-chromium, 120 s, 0 retries, dev|prod webServer.
├── tailwind.config.ts / postcss.config.mjs / components.json
├── Dockerfile  # oven/bun:1-debian + python3 + the scientific stack.
├── docker-compose.yml  # port 3000, bind-mounted python_scripts/, named run volume.
├── Caddyfile  # reverse proxy on :81 with XTransformPort routing.
├── CITATION.cff / LICENSE
│
├── src/
│   ├── app/  # THE single page.
│   │   ├── layout.tsx  # metadata, fonts, theme provider, the pre-paint bootstrap scripts.
│   │   ├── page.tsx  # 15,672 lines — the orchestrator monolith (53 dynamic imports).
│   │   ├── globals.css  # the 47 data-theme blocks + design tokens.
│   │   └── api/  # 127 route.ts files across 110 folders — the ONLY fs/child_process/network layer.
│   │       ├── run/ (+queue), run-all, run-input, stop  # execution.
│   │       ├── console/ (+variable), debug, time-travel  # kernels, pdb, traces.
│   │       ├── profile, line-profile, hypothesis-run, test/ (+collect)  # tests & profiling.
│   │       ├── term/ (+stream), tasks, watch, watch-dir  # terminal & watching.
│   │       ├── file, code, file-{create,write,delete,rename,duplicate,copy,move,stats}, files-import  # file ops.
│   │       ├── folders, folder-{create,delete,rename,move,stats,zip,lint,compare,list}, open-folder  # folder ops.
│   │       ├── archive, batch-zip, compress, upload-zip, download  # zip family.
│   │       ├── github-import, import-ipynb, import-py, resolve-path
│   │       ├── projects/ (+create), project-{settings,appearance,backup}  # projects.
│   │       ├── local-history/ (list+save+restore+diff)  # snapshots.
│   │       ├── lint, typecheck, format, fix-all, ast, disasm  # code intelligence.
│   │       ├── rename-preview, refactor, spell, docstring-coverage
│   │       ├── full-text-search, project-symbols, snippets, templates, notes, todos
│   │       ├── lsp/ (7 routes)  # the Pyright sidecar HTTP.
│   │       ├── git-{status,log,commit,branch,diff,diff-content,blame,command}  # git suite.
│   │       ├── envs, create-venv, env-sync, install-deps, pip-{install,list}, python-check, runtime-check
│   │       ├── data-file, data-sheet, data-sheet-write, duckdb-query, sqlite-query  # data workbenches.
│   │       ├── export/ (md, html, ipynb, folder-ipynb), figure/[runId]/[figureName]
│   │       ├── preview, preview-stream, http-proxy  # live web preview + relay.
│   │       ├── ai-chat, ai-completion, ai-generate-tests, ai-keys, ai-test, agent-plan  # AI.
│   │       ├── media-trim, screenshot-save, pdf-info, bytes, convert, validate-config, audit
│   │       ├── collab, stats, health  # platform.
│   │       └── local-history/list/route-helpers.ts  # the one non-route helper.
│   ├── components/  # 150 app components (134 direct + 15 toolbox/ + 1 settings/).
│   │   ├── code-viewer*.tsx  # the Python editor family (monolith + 8 extracted siblings).
│   │   ├── file-viewer.tsx  # the every-other-language viewer (7,729 lines).
│   │   ├── folder-tree.tsx  # the explorer monolith (10,520 lines).
│   │   ├── menu-bar.tsx  # the 15 menus + right-side quick actions (4,151 lines).
│   │   ├── settings-dialog.tsx  # the 15-tab settings dialog (6,413 lines).
│   │   ├── output-panel.tsx, diagnostics-panel.tsx, tests-panel.tsx, ...  # the bottom dock.
│   │   ├── toolbox/  # 15 files — the Developer Toolbox tabs + studios.
│   │   ├── settings/  # extracted tab modules (focus-tab.tsx).
│   │   └── ui/  # 32 shadcn/Radix primitives (incl. the custom floating/resizable dialogs).
│   ├── lib/  # 153 pure modules + the content corpora.
│   │   ├── examples-data/  # 91 content modules — the 3,700-example library.
│   │   ├── __tests__/  # 97 test files + fixtures/mock-langserver.mjs.
│   │   └── *.ts  # the pure logic (see the lib references).
│   ├── layout/  # split-pane-engine.ts + code-overlay-engine.ts (+ 2 test files).
│   ├── hooks/  # 7 React hooks.
│   ├── data/  # templates-manifest.json (61 entries).
│   ├── fonts/  # self-hosted font files.
│   └── proxy.ts  # the API guard: opt-in bearer auth + 3-class rate limiting.
│
├── public/  # manifest + icons + sw.js + dict/ (7 dictionaries) + robots + sitemap.
├── python_scripts/  # the default sample workspace (see below).
├── e2e/  # 3 Playwright specs / 19 tests.
├── scripts/  # 6 build/dev scripts (lint-with-budget, copy-standalone, desktop, check-examples, gen-favicons, test-sql-orm).
└── bin/  # the vendored 7za binary (RAR/7z support).
```

### `python_scripts/` — the default sample workspace

The bundled sample project that ships with the repo (and the default scripts root until
you open another project): `Data & Docs` (data files, documents, long files),
`Getting Started`, `Languages` (MATLAB/R/web/language labs), `Media` (a media gallery +
playback), `Python Projects`, `README` (a nested README family), `Structure & Edge
Cases` (nested folders, archives, unsupported types), plus `README.md` and
`ProjectOverview.md`. It doubles as the fixture corpus for the folder-tree edge cases (nested paths, names with spaces,
deep structures).

### Where things are NOT

There is no `middleware.ts` (Next 16 uses `src/proxy.ts`), no `.github/` (the CI workflow
was retired — `bun run check` is the canonical gate), no `prisma/` or database (the echo
scripts in package.json confirm), and no `tests/` folder (unit tests live beside their
modules in `src/lib/__tests__/` and `src/layout/__tests__/`; e2e lives in `e2e/`).
