# API Contracts — Execution, Console, Debug, Profiling, Tests, Terminal, Tasks

Back to [API-CONTRACTS.md](./API-CONTRACTS.md) for the shared conventions. All routes in
this file are rate class **exec (60/min per IP)** except `/api/tasks`, `/api/agent-plan`,
and `/api/stats` (**other**, 600/min).

## Cross-cutting run machinery

- **Run registry** (`src/lib/run-registry.ts`, on `globalThis.__statcomp_run_registry__`
  so it survives dev reloads): `runningChildren: Map<runId, ChildProcess>`,
  `stopRequested: Set<runId>`, `runMeta: Map<runId, {label, kind: run|run-all|debug|test|profile,
  startedAt, pid?, interpreter?}>`, `openStdins: Map<runId, Writable>`,
  `stdinTimeoutResets: Map<runId, () => void>`.
- **Per-run temp dir**: `createRunTmpDir(runId)` → `RUN_TMP_ROOT/<uuid>` where
  `RUN_TMP_ROOT` = env `RUN_TMP_ROOT` ?? `os.tmpdir()/statcomp-runs`; swept with a 24 h
  TTL (sweep throttled to 1 per 10 min plus once at process start; only UUID-shaped names).
- **Interpreter resolution** (`src/lib/python-interpreter.ts`): `findInterpreter()`
  probes `$VIRTUAL_ENV`, `~/.venv`, `~/.virtualenvs/*`, conda, pyenv, uv, system
  python3/python; cached per process; prefers the first env where matplotlib + numpy +
  scipy import. A manual override is accepted only if absolute AND (in the discovered
  list OR passes a Python version probe) — it never pollutes the default cache.
- **argv inline limit** (`src/lib/spawn-limits.ts`): `MAX_INLINE_SCRIPT_BYTES` = 28,000 (win32, CreateProcess 32,767
  cap) / 100,000 (Linux `MAX_ARG_STRLEN`); above it the
  wrapped script is written to `<runTmpDir>/__wrapped_script__.py` and passed as a file
  argument.
- **The Python prelude** (`src/lib/python-prelude.ts`): `wrapScript(source, runTmpDir,
  {traceCoverage, inspectVariables, captureDataframes, scriptPath})` wraps the user source
  so `__file__`/`sys.argv[0]`/tracebacks behave like `python file.py`, execs in a
  `__main__` namespace, and — **via files in the run temp dir, not stdout markers** —
  produces: matplotlib capture (Agg backend, patched `savefig`/`show`/`Animation.save` →
  `figure_NNN.png` + best-effort mpld3 `.html`), DataFrame capture (patched `print` →
  `dataframe_NNN.html` + `dataframes.json`), variable inspection (`variables.json` at
  exit), coverage (`coverage.json` via `sys.settrace`), and discovered `test_*` callables (`tests.json`). Env contract:
  `STATCOMP_RUN_TMP_DIR`, `STATCOMP_RUN_ID`,
  `MPLBACKEND=Agg`, `PYTHONUNBUFFERED=1`, `PYTHONIOENCODING=utf-8`.

## `POST /api/run` (SSE)

Body (all optional unless marked): `folder`*, `file`* (slugs) · `stdin` (appended `\n`) ·
`args: string[]` (→ `sys.argv[1:]`) · `env: Record<string,string>` (merged; keys matching
`LD_/DYLD_` loader vars or `PYTHONHOME`/`PYTHONSTARTUP` **blocked**; non-strings dropped) ·
`traceCoverage` · `inspectVariables` · `captureDataframes` · `runCell: {start, end}`
(1-indexed inclusive slice) · `code` (raw source override — Run Selection/notebook cells;
takes precedence over `runCell`; enables anyKind resolution) · `interpreter` ·
`runTimeoutSeconds` (default 60, clamped 5–600) · `maxOutputBytes` (default 2,000,000,
clamped 10,240–16,000,000, **per stream**) · `interactive` (keeps stdin open; registers in
`openStdins`) · `language` (default `"python"`; non-Python routes through
`resolveLanguageRun` — the 30-kind `RUN_LANGUAGE_BY_KIND` table in
`src/lib/run-languages.ts`).

Spawn: `spawn(interpreter, ["-c", wrapped] | [wrappedFile], {cwd: dirname(file), env,
stdio: pipes})`; runId = `randomUUID()`. Timeout: hard `setTimeout` → stderr marker
`\n[praxis] run timed out after N s — the process was killed (hard timeout).\n` → SIGKILL (`timedOut` distinguishes
timeouts from user stops). Interactive runs re-arm the timeout
on every `/api/run-input` write. Output batching: pending stdout/stderr flushed every **250 ms**; over cap →
`truncated: true` + one stderr line, then dropped. Artifact
streaming: the run temp dir is polled every **750 ms**; `figure_NNN.(png|jpg|jpeg|svg|gif|webp)`
and `dataframe_NNN.html` are emitted only once their size is stable across two polls.

**SSE events** (headers: the standard 4):

| Event payload                                                                                                                                                                                     | Meaning                                                                       |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| `{"type":"start","runId","interpreter","folder","file","startedAt"}`                                                                                                                              | run opened                                                                    |
| `{"type":"stdout","text"}` / `{"type":"stderr","text"}`                                                                                                                                           | output chunks                                                                 |
| `{"type":"figure","name","url":"/api/figure/<runId>/<name>","interactiveUrl?"}`                                                                                                                   | a matplotlib artifact (interactiveUrl when an mpld3 `.html` companion exists) |
| `{"type":"dataframe","name","url","dfName","dtype"}`                                                                                                                                              | a DataFrame capture (exit-time events add `shape`)                            |
| `{"type":"end","ok","exitCode","durationMs","truncated","killed","timedOut","interpreter","figures":[names],"variables?","coverage?","dataframes?","tests?","stdoutBytes","stderrBytes","runId"}` | the finale — `ok = !finalKilled && exitCode === 0`; `killed = timeoutKilled   || stopRequested` |
| `{"type":"error","message"}`                                                                                                                                                                      | spawn failure (with install hints)                                            |

Stream ends with `controller.close()` after `end`; client disconnect → SIGKILL + registry
cleanup. Non-Python languages use the same SSE/stop/timeout/cap machinery via
`genericRunStream` (no prelude — no figures/variables/coverage/DataFrames; C/C++ compile
first with diagnostics streamed as stderr; a missing runtime → a friendly SSE error + end).

## `GET /api/run/queue`

No params → `{ ok, runs: [{runId, label, kind, startedAt, durationMs, pid?,
interpreter?, interactive, alive}], count }`, oldest first. **Not a waiting list** — a live
view of the registry; runs whose SSE is attached but whose process exited show
`alive: false` ("finishing") until finalized.

## `POST /api/run-all` (SSE)

Body `folder`*, `sub?` (sanitized). Discovery: every runnable kind in the folder (or the
`sub` scope — `dir === sub` or `dir` startsWith `sub + "/"`). Caps: **50 files** (413),
per-file timeout **60 s** (SIGKILL + the same timeout marker), per-file output **200,000
bytes**. Sequential loop; each file gets its own runId + temp dir (children registered
under both ids; `runMeta` kind `run-all`). Python children always run with
`inspectVariables` + `captureDataframes`. Events: `{"type":"start","batchId","folder",
"folderSlug","sub?","total"}` → per file `{"type":"file-start","file","index","total"}` and
`{"type":"file-end","result": BatchResult}` (`{file, fileSlug, runId, ok, exitCode,
durationMs, stdout, stderr, truncated, killed, timedOut, figures, figureUrls,
stdoutBytes, stderrBytes, interpreter?, language?}`) → `{"type":"end","totalMs",
"passCount","failCount","stopped","results"}`. Stop via `/api/stop` with the batchId.

## `POST /api/run-input` · `POST /api/stop`

- **run-input**: body `{runId, text}` → writes (with `\n`) + re-arms the timeout → `{ok,
  wrote}`; or `{runId, eof: true}` → closes stdin → `{ok, eof: true}`. Errors: 400; **404**
  `"No running process with that runId."`; **409** `"This run was not started in
  interactive mode — its stdin is already closed."`.
- **stop**: body `{runId}` → SIGTERM now, **SIGKILL after 1,500 ms** if still alive; marks
  `stopRequested` so `end.killed` is true even when Python exits 0 through atexit →
  `{ok, runId, signal: "SIGTERM"}` (404 unknown; 500 failure).

## `POST /api/console` — the persistent Python kernel

Session = long-lived `python -u kernel.py` (the kernel source is embedded in
`src/lib/console-kernel.ts`, written once per process). JSON-lines over stdio; all
submissions exec in ONE shared `__console__` namespace, so state persists across
submissions. Sessions live on `globalThis.__praxis_console_registry__`: **max 3
sessions**, idle TTL **20 min**. Kernel magics: `%time %timeit %timeit-lite %who %whos
%reset %history %help %magic %tasks` and cell `%%time %%timeit %%capture`; eval falls back
to exec on SyntaxError; `input()` raises a friendly error. Figures land in
`RUN_TMP_ROOT/<sessionId>` (served by `/api/figure`).

| Action      | Body                                                                          | Response                                                                                                                                                                                                                                                                                                                                                            |
|-------------|-------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `start`     | `{action, cwd?\|folder?, interpreter?}`                                       | `{ok, id, interpreter}`                                                                                                                                                                                                                                                                                                                                             |
| `restart`   | `{action, id?, cwd?\|folder?, interpreter?}`                                  | kills the old, `{ok, id, interpreter, restarted: true}`                                                                                                                                                                                                                                                                                                             |
| `status`    | `{action, id}`                                                                | `{ok, alive}`                                                                                                                                                                                                                                                                                                                                                       |
| `stop`      | `{action, id}`                                                                | `{ok}`                                                                                                                                                                                                                                                                                                                                                              |
| `interrupt` | `{action, id}`                                                                | SIGINT → `{ok, interrupted: busy}` (410 when ended)                                                                                                                                                                                                                                                                                                                 |
| `inspect`   | `{action, id\|session, expr?, deep?}`                                         | `{ok, vars: [...]}` or `{ok, var: {..., children?}}` (`deep` clamped to 0–5, ≤20 children; 409 busy; 410 dead)                                                                                                                                                                                                                                                      |
| `tasks`     | `{action, id\|session}`                                                       | `{ok, tasks: [{id, name, state, awaiting?, stack?}]}`                                                                                                                                                                                                                                                                                                               |
| `exec`      | `{action, id, code, mode?: eval\|exec, timeoutSeconds?}` (default 60 s, ≤600) | **SSE**: `start`/`stdout`/`stderr`/`figure`/`end {ok, error, died, figures, variables, runId, submission}` + a minimal terminator `{"type":"end","ok"}`. The watchdog kills the whole session at timeout (`[console] submission exceeded N s — the session was killed`). Client disconnect **detaches only** — the kernel keeps running (persistence is the point). |
| unknown     |                                                                               | 400 `"Unknown action. Use start                                                                                                                                                                                                                                                                                                                                     | exec | inspect | tasks | interrupt | restart | status | stop."` |

## `POST /api/console/variable` — the variable grid bridge

Body `{id | session, expr`* (a guarded dotted/index path — never executed code),
`rowCap?` (clamp 1–2,000, default 2,000), `colCap?` (clamp 1–100, default 100)`}`. One
kernel round-trip (`mode: griddata`) → `{ ok, kind, columns, rows, totalRows, totalCols,
expr, rowCap, colCap }` where kind ∈ dataframe / series / matrix / array / dict-of-lists /
dict / list-of-dicts / list-of-lists / list. Errors: 400; 409 busy; 410 dead; **422**
kernel error / not table-like; **413** payload > 4,000,000 chars; 500 watchdog kill.

## `POST /api/debug` — pdb over SSE

Two POST shapes: **start** `{folder, file, breakpoints?: number[] (positive ints),
stdin?, interpreter?, watch?: string[]}` opens the SSE session (`sessionId` =
randomUUID; spawns `<interpreter> -u -m pdb <absPath>`); **control** `{sessionId, command:
"continue"|"next"|"step"|"return"|"quit"}` or `{sessionId, frame}` (bottom-up stack index)
or `{sessionId, watch: [...]}` (JSON, 200/400/404 `"Unknown or finished debug
session."`/409 not stopped or mid-capture).

SSE events: `start {sessionId, interpreter, folder, file, breakpoints}` · `stdout`/
`stderr` (raw pdb + script output) · `stopped {sessionId, line, frame, file, locals,
stack?: [{index, function, file, line, current}], currentFrame?, watches?:
[{expression, value?|error?}]}` — the drive loop parks at every stop (does NOT
auto-continue); `p locals()`, `w`, and the watches are captured per stop; Windows pdb
path-lowercasing is undone via `realpathSync.native` (cache ≤1,024) · `frame` (after a
frame-selection POST) · `resumed {sessionId, command}` · `timeout` · `error` · `end
{exitCode, killed}`. Caps: idle **5 min** (auto-quit), total **10 min**, **MAX_STOPS 1000**, pending-output tail ≤
1,000,000 chars, watches ≤ 32 entries × 200
chars (strings only, newlines flattened, deduped). Client editor breakpoints travel as
the start POST's `breakpoints` array (the editor dispatches
`praxis:breakpoints-changed`; the Diagnostics panel forwards).

## `POST /api/time-travel` · `POST /api/profile` · `POST /api/line-profile`

- **time-travel**: body `{folder, file, code?, interpreter?, maxEvents?}` (default 3,000,
  hard cap 50,000). One `python -u -c <recorder>` child (60 s → 408): a stdout
  `_Capture` object + a `sys.settrace` tracer filtered to the target file; events
  `{line, event: line|call|return|exception, locals: {name: repr ≤80 chars}}` (first 64
  names, underscore-prefixed skipped); each stdout write becomes a delta
  `{afterEvent, text}` → `{ ok, error?, fileName, totalEvents, capped, stdout:
  [{afterEvent, text}], events }`. An infra failure returns `ok: false` bare; a script
  exception returns `ok: false` **with the full trace** (that is the interesting part).
- **profile**: body `{folder, file, stdin?, interpreter?}` — cProfile around the exec,
  `pstats` dumped into the run tmp dir + top-40 `print_stats` parsed by regex → `{ ok,
  lines: [{ncalls, tottime, percall_tot, cumtime, percall_cum, location}],
  stdout, stderr, pstatsUrl?, durationMs }`. Timeout 120 s.
- **line-profile**: body `{folder, file, code?, mode?: line|memory|both (default line),
  interpreter?}` (60 s → 408). Line mode credits `perf_counter` deltas to the last
  executed line → `{ ok, lines: Record<lineNo, µs>, slowest: [{line, us, text}] (top 15),
  totalUs }`; memory mode uses tracemalloc snapshots grouped by the deepest user-file
  frame (enclosing function derived from the script's own AST) → `memory: [{func, bytes,
  count}] (top 20)`.

## `POST /api/test` · `POST /api/test/collect` · `POST /api/hypothesis-run`

- **test**: body `{interpreter?, folder?, file?, nodeid?, nodeids?}` — discovery via
  `src/lib/test-scope.ts` (`test_*.py`/`*_test.py`). Runs `python -m pytest <targets> -v
  --tb=line -p no:cacheprovider`; per-file timeout **60 s** (timed-out entries flip to
  failed), overall cap **8 min**, max **400** entries, ≤40 nodeids (each validated against
  the discovered scope — a foreign id → 400). No pytest → the file executes directly as
  one whole-file test → `{ ok, total, passed, failed, errors, skipped, durationMs,
  usedPytest, files: [...], tests: [{name: "file.py::test_id", status, message? ≤300
  chars, folder?, file?, line?}], raw? }`.
- **test/collect**: body `{interpreter?, folder?, file?}` — one `pytest --collect-only -q`
  run (45 s, ≤600 entries) → `{ ok, available, collectedAt, durationMs, count, files,
  tests: [{name, nodeid, folder, folderName, file, fileSlug}], error? }`
  (`available: false` when pytest is missing — the client skips silently).
- **hypothesis-run**: body `{folder, file, code?, testName?, interpreter?}` — probes
  `import hypothesis` (15 s; missing → `{ok: false, missing: "hypothesis", hint: "pip
  install hypothesis"}`), runs `-m pytest <target> --hypothesis-show-statistics -q -p
  no:cacheprovider [-k testName]` (120 s → 408) → `{ ok, passed, failed, errors, shrinks:
  [{step, repr, explanation?}] (every "Falsifying example"/"Failing test case" block),
  statistics?: string, stdout (≤200,000 chars) }`.

## `POST /api/watch` · `POST /api/watch-dir` (SSE)

- **watch** (one file): body `{folder, file}`. Events: `{"type":"watching"}` immediately;
  `{"type":"changed","folder","file"}` **debounced 500 ms** (`change` and `rename`;
  renames re-arm the watcher for inode replacement); `{"type":"error","message"}`;
  `{"type":"timeout"}` after **5 minutes**, then the stream closes.
- **watch-dir** (the project tree): no body. `fs.watch(getScriptsRoot(), {recursive:
  true})` (fallback: per-subdirectory watchers when the platform lacks recursive). Events:
  `watching` → `changed` **debounced 800 ms** → `timeout` after **10 minutes** (the client
  reconnects). Every watcher callback also calls `invalidateFoldersCache()` so the next
  `/api/folders` is fresh.

## `POST /api/term` · `GET /api/term/stream?id=` — the terminal

**No PTY by design** — the client renders its own prompt line, keeping the feature
dependency-free and working under both the Node and Bun standalone servers (same local
trust level as `/api/run`). Registry: max **4 sessions**, TTL **30 min**, backlog capped **200,000 chars** (FIFO trim).

| Action | Body                                                  | Response                                                                                                                                                                                                                                                                                    |
|--------|-------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| start  | `{action?: "start", kind: "shell"\|"python", cwd?}`   | `{ok, id, kind, cwd, shell}` — shell: `cmd.exe /Q` (win, label "cmd") or `$SHELL`/`/bin/sh`; python: `<interpreter> -i`. POSIX children spawn **detached** (own process group); shell sessions get `trap 'true' INT` on stdin so group Ctrl+C kills the foreground child but not the shell. |
| write  | `{action: "write", id, input}`                        | `{ok}` — client-side echo (no pty echo). 404/409/400/500.                                                                                                                                                                                                                                   |
| clear  | `{action: "clear", id}`                               | `{ok}` — wipes the server backlog so the SSE replay matches the cleared scrollback (Ctrl+L).                                                                                                                                                                                                |
| signal | `{action: "signal", id, signal: "SIGINT"\|"SIGTERM"}` | `{ok, signal}` — **group-wide** `process.kill(-pid, sig)` (real Ctrl+C semantics: shell + foreground child both signaled, the session survives).                                                                                                                                            |
| kill   | `{action: "kill", id}`                                | `{ok}` (SIGTERM to the group).                                                                                                                                                                                                                                                              |
| exec   | `{action: "exec", cmd, cwd?}`                         | one-shot SSE: `{"out"}` chunks (stdout+stderr merged), `{"error"}`, `{"exit": code, durationMs}` — `cmd /c` / `sh -c`, detached POSIX, hard cap **12 min**.                                                                                                                                 |
| list   | `{action: "list"}`                                    | `{sessions: [{id, kind, cwd, shell, closed, exitCode, createdAt}]}` — session-restore validation.                                                                                                                                                                                           |

**`GET /api/term/stream?id=`** attaches an SSE reader: replays the backlog as `{"out"}`
events, then live chunks; `{"exit": code}` final; **comment heartbeat every 20 s** so
proxies don't idle; disconnect/re-attach any time (the kernel keeps running). 404 unknown
id.

## `GET+POST /api/tasks` — the task runner panel

- **GET `?folder=`** — scans the folder root + 2 nested levels (max 120 dirs, skipping
  `node_modules .git .venv venv __pycache__ dist build .next .tox .mypy_cache
  .pytest_cache target out coverage .praxis`) for: `package.json` scripts (source
  "npm"), Makefile column-0 targets (source "make"), justfile recipes (source "just"),
  pyproject `[project.scripts]` (source "package") + `[tool.praxis.tasks]` flat entries (source "pyproject") → `{ ok, tasks: [{id: "<source>:<name>[@<rel>]", name, source,
  command, cwd?}], roots: {hasPackage, hasMake, hasJust, hasPyproject} }` (max 300 tasks).
- **POST `{folder, command` (≤8,000 chars)`, cwd?}`** → SSE `{"kind":"out","text"}` chunks
    + final `{"kind":"exit","code"}`; caps: **300 s** timeout (killed with a marker line), **2 MB** streamed output (at
      cap: a marker line + SIGKILL of the group).

## `POST /api/agent-plan`

Body `{task`* (trimmed ≤2,000 chars)`, folder`* (slug), `maxFiles?` (clamp 5–200, default
60), `provider?}`; body-size guard 5 MB (413). Resolves the folder, builds the plannable
manifest (text files, depth ≤8, capped), grounds the model with the first **8** files
(`.py .js .mjs .cjs .ts .md .markdown`, ≤20 KB each, containment-guarded), calls the
shared chat-completion layer with a strict-JSON system prompt, and normalizes the plan (≤12 steps, ≤20 edits; per-field
caps) → `{ folder, steps: [{title, detail}], edits:
[{path, action: modify|create, description, original, proposed}], notes, manifestCount,
groundedCount, droppedEdits }`. The AI never writes files — the client applies approved
edits via `/api/file-write` after drift-checking `original`.

## `GET /api/health` · `GET /api/stats`

- **health** (token-exempt, never rate-limited): `{ ok: true, scriptsRootReadable:
  boolean, uptimeSec: number }`.
- **stats** `?runId=`: Linux-only `/proc/<pid>/stat` telemetry for a running child →
  `{ ok, cpuPercent (0.1 precision, 100 Hz ticks vs the last sample), rssMb (pages ×
  4,096), pid, running, hint? }`; non-Linux → zeros with a hint.
