# Security Policy

Praxis is a localhost-first, single-user self-hosted IDE. The security posture is layered:
a strict filesystem sandbox, argv-only process spawning, opt-in bearer auth, always-on
rate limiting, hardening headers on every route, and honest documentation of every
deliberate trust decision. This policy is written from the code — file names are given so
you can verify each claim.

## Supported versions

| Version                  | Supported                                        |
|--------------------------|--------------------------------------------------|
| `main` (this repository) | Yes — security fixes land on main.               |
| Tagged releases          | Best effort; upgrade to main for security fixes. |

## Reporting a vulnerability

Report privately via the repository's security contact (GitHub security advisories) or
the author's email in [CITATION.cff](CITATION.cff). Do not open public issues for
exploitable findings. Include the route/file involved and a minimal reproduction; a fix
plus a regression test is the expected outcome.

## Known security considerations

Every item below is a **documented, deliberate** boundary of a localhost-first tool — read
them before exposing Praxis beyond localhost.

### 1. Arbitrary Python execution

`POST /api/run` (and the console, terminal, debug, tests, profiling family) executes code
by design. Guards: per-IP rate limiting (the exec class — `/api/run*`, `/api/console*`,
`/api/term*`, `/api/debug`, `/api/profile*`, `/api/test*`, `/api/stop`, `/api/watch*` — **60/min**), per-run hard
timeouts (60 s default, ≤600 s, re-armed per stdin write), the
per-run temp dir with a 24 h TTL sweep, output caps, and a blocklist of dangerous env
vars (`LD_*`/`DYLD_*` loaders, `PYTHONHOME`, `PYTHONSTARTUP`) on the merged `env` body.
Spawning is **argv-array only, `shell: false`** everywhere — no injection through
filenames or arguments is possible. `e2e/smoke.spec.ts` pins the negative cases (stdin rejection for unknown runs).

### 2. Filesystem read/write inside `python_scripts`

Every per-file route resolves through `resolveScriptPath(folderSlug, fileSlug)` in
`src/lib/scripts.ts`: slugs are base64url-decoded, the path is rebuilt inside
`getScriptsRoot()`, and `path.relative` containment rejects `..`/absolute escapes; a
`fs.stat` isFile check follows. Sub-paths pass `sanitizeSubPath` (no `..`, no `\`, no
leading/trailing `/`, no dot-prefixed segments); renames match `NAME_RE`; project
switching is vetted by `projectRootRejectionReason()` + `FORBIDDEN_ROOT_NAMES` (19
reserved names, drive roots, the app's own directory, dot-folders). The deliberate
exposures: the active project can be ANY directory you pick (that is the feature), and
`/api/compress` may write an archive to any absolute directory you browse to. Within a
git repo, `/api/git-commit` accepts repo-root-relative paths beyond the scripts root (the repo may be larger than the
project folder).

### 3. Per-run temp directory

Each run gets `RUN_TMP_ROOT/<uuid>` (default `os.tmpdir()/statcomp-runs`, override with
the `RUN_TMP_ROOT` env) holding figures, DataFrame captures, variables/coverage JSON,
and pstats. `/api/figure/[runId]/[figureName]` guards it: `runId` must match
`/^[A-Za-z0-9_-]+$/`, the name may contain no `/`, `\`, or `..`, plus `path.relative`
containment — 404 otherwise. The sweep (24 h TTL, throttled to one per 10 minutes,
UUID-shaped names only) removes leftovers.

### 4. Subprocess spawning

All spawns are argv arrays with `stdio` pipes, SIGKILL on timeout, `windowsHide: true`,
never a shell; Windows `.cmd` shims are retried through `%ComSpec%` explicitly. The
Python prelude runs as `-c`-wrapped code or a temp file (never on the command line above
the platform argv cap — `spawn-limits.ts`: 28,000 bytes win32 / 100,000 elsewhere). The
Pyright sidecar spawns with `processId` in the handshake (it self-terminates if the
server dies) and exit/SIGINT/SIGTERM hooks SIGKILL the singleton child. The venv audit
route resolves a per-folder venv python under the app's own `.venv/` (closing an
arbitrary-binary-execution hole) before falling back to the configured interpreter.

### 5. localStorage

All per-browser state (settings, sessions, run history, AI provider configs with keys)
lives in localStorage under `praxis.*` keys — readable by any XSS. Mitigations: the
CSP, the strict input handling, and the **server keyring** option for AI keys (`~/.praxis/ai-keys.json`, mode 0600 —
keys never travel to the browser; the UI sees
masked values only). The optional access token itself is stored client-side in
`praxis.api-token` and attached by a one-time `window.fetch` patch (`src/lib/api-auth.tsx`).

### 6. Optional access token (off by default)

Set `PRAXIS_ACCESS_TOKEN` and every `/api/*` route except `/api/health` requires
`Authorization: Bearer <token>` (constant-time-ish compare — length check + XOR
accumulate, no short-circuit). Missing/wrong token → 401 `{error, tokenRequired: true}` +
`WWW-Authenticate: Bearer`, which the client surfaces as a paste-token dialog. Off by
default because localhost-first; **required** before exposing the port beyond localhost
or through the Caddy reverse proxy.

### 7. Rate limiting (in-memory, single instance)

`src/proxy.ts` (Next 16's middleware replacement, matcher `/api/:path*`) applies
sliding-window per-IP limits: exec 60/min, ai 40/min, other 600/min — env-overridable
(`PRAXIS_RATE_LIMIT_EXEC/_AI/_OTHER`, 0 disables). Buckets are in-memory per process:
accurate for a single self-hosted instance, NOT a distributed deployment. Breach → 429
`{rateLimited: true}` + `Retry-After`.

### 8. Security headers

`next.config.ts` sets them on `/:path*`: a CSP (`default-src 'self'; script-src 'self'
'unsafe-eval' 'unsafe-inline'; …; object-src 'none'; frame-ancestors 'self'` — the
deliberate relaxations: `unsafe-eval` for the sandbox tooling, `unsafe-inline` for the
inline bootstrap scripts; AI calls stay `'self'` because they are proxied through
`/api/ai-*`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` (camera/microphone/geolocation/
payment/usb all `()`), `X-DNS-Prefetch-Control: off`, and HSTS. `e2e/smoke.spec.ts`
asserts the headers are actually present.

### 9. AI provider keys — browser or server keyring

Providers are OpenAI-compatible endpoints configured client-side. Keys resolve in this
order: the inline (browser-held) key first; if empty, the **server keyring**
`~/.praxis/ai-keys.json` (0600, endpoint-slug slots; `PRAXIS_KEYRING_DIR` override) —
the client sends an empty key when the user chose server-side storage. Raw keys are
never returned by any keyring action. The keyring is single-user/localhost-first; the
bearer token protects `/api/ai-keys` on a LAN.

### 10. Terminal is not a PTY (by design)

The integrated terminal spawns real shell/Python children (detached process groups on
POSIX, `trap 'true' INT` pre-fed to shells so group Ctrl+C kills the foreground child
but not the shell) — no PTY is involved, which keeps the feature dependency-free and
working under both the Node and Bun standalone servers. Same local trust level as
`/api/run`. Backlogs are capped (200,000 chars) and sessions TTL'd (30 min, max 4).

### 11. The http-proxy relay (widest surface)

`POST /api/http-proxy` fetches ANY http/https URL with caller-supplied headers (minus
the hop-by-hop set, CR/LF-stripped), a 60 s timeout, a 2 MB body cap, at most 3 manual
redirects, and `credentials: "omit"`. It exists so the API-client workbench has no CORS
problems on localhost — if you expose Praxis behind the optional token, this route is
your SSRF surface; scope it at your reverse proxy if that matters.

### 12. Workbench asymmetries worth knowing

`/api/sqlite-query` opens SQLite read-only at the C level (`file:…?mode=ro`) unless the
UI-gated `write: true` toggle is sent; `/api/duckdb-query` executes SQL verbatim on an
in-memory connection with **no read-only enforcement** (user SQL rides stdin, never
argv). `screenshot-save` re-encodes and magic-byte-verifies images and rejects SVGs
containing scripts/`javascript:`/`on<attr>=` (SVG executes on open). `export/html`
base64-inlines SVG figures so attacker-controlled matplotlib SVG cannot execute.
`archive` extraction applies the same traversal/entry/size caps as zip everywhere.

### 13. Packaged desktop runtime (`electron-main.js`)

When distributed as a desktop build via Electron and `electron-builder`, `electron-main.js`
binds the embedded Next.js standalone server strictly to the loopback interface (`127.0.0.1:3000`) rather than
`0.0.0.0`, keeping the server unreachable from external
network interfaces. The desktop `BrowserWindow` runs with `nodeIntegration: false` and
`contextIsolation: true` so renderer code has zero direct access to Electron or Node.js
primitives outside the documented `/api/*` security boundaries above. Note that portable
builds extract their resources into the user's temporary directory (`%TEMP%` / `/tmp`) at
runtime, and official CI release binaries are currently unsigned (triggering standard
Windows SmartScreen or macOS Gatekeeper prompts on first run).

## Hardening recommendations

1. Keep the port on localhost unless you need LAN access.
2. If you expose it: set `PRAXIS_ACCESS_TOKEN` (and prefer HTTPS at your proxy — the
   bundled Caddyfile is a plain `:81` reverse proxy with no TLS).
3. Lower the rate classes (`PRAXIS_RATE_LIMIT_*`) for shared machines.
4. Put AI keys in the server keyring, not the browser.
5. Mount `python_scripts` (or your project root) from a disk you can afford to write
   to; the sandbox contains writes to the active project root, compress destinations,
   `~/.praxis/`, and run temp dirs.
6. Pin the image to a specific build when deploying with Docker.

## Where the boundaries are testable

- `e2e/smoke.spec.ts` — "security headers present" and "interactive stdin API rejects
  unknown runs".
- `src/lib/__tests__` — the slug/traversal guard, `sanitizeSubPath`, `NAME_RE`,
  `projectRootRejectionReason`, the JSON-RPC decoder caps, and the agent-plan drift
  checks all have unit tests; the folders cache and atomic pointer writes are exercised
  by the projects tests.
- `scripts/lint-with-budget.mjs` + `eslint.config.mjs` keep the ratchet honest — a
  warning-count or file-size regression fails `bun run check`.
