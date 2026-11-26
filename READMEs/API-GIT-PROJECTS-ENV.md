# API Contracts — Git, Environments, Dependency Management

Back to [API-CONTRACTS.md](./API-CONTRACTS.md) for the shared conventions. Every git/pip
spawn is argv-array (no shell), `stdio` pipes, SIGKILL on timeout. All routes here are
rate class **other (600/min)**. Git failures on the mutation routes return **HTTP 200
with `{ok: false, error}`** (only input-validation paths use 4xx).

## `GET /api/git-status`

No params; timeout 10 s; cwd = the scripts root. Two parallel spawns: `git status
--porcelain=v1 -z` + `git rev-parse --abbrev-ref HEAD` (repo detection = the status exit
code; detached HEAD → `branch: null`; porcelain `-z` parsing handles `R`/`C` rename
fields). → repo: `{ ok: true, isRepo: true, entries: [{path, indexStatus, wtStatus}],
branch }`; non-repo: `{ ok: false, isRepo: false, entries: [], branch: null, hint }`.
Read-only.

## `GET /api/git-log`

- **List mode** (no params): `git log -n 300 --no-color --pretty=format:` with
  `\x1f`-separated fields, `\x1e`-separated records → `{ ok, isRepo, commits: [{sha,
  shortSha, author, authorEmail, timestamp, subject, parents, refs}] }` (newest first,
  fixed cap 300).
- **Detail mode** (`?sha=` 4–64 hex): parallel `git show --name-status` (the record) +
  `git show --format= --unified=3` (the patch) → `{ ok, detail: {sha, shortSha, author,
  authorEmail, committer, timestamp, message, parents, files: [{path, status}], patch},
  patchTruncated }` (patch sliced at 256 KB). Word-diff is client-side (`src/lib/word-diff.ts`); the server serves
  unified diffs only. 404 when show fails.

## `POST /api/git-commit`

Body `{ message`* (non-empty after trim)`, files`*: string[] (repo-root-relative paths
exactly as porcelain printed them — no containment to the scripts root; the repo may be
larger)`. Flow: paths → `:/<path>` pathspecs → `git add -- :/p1 :/p2 …` → `git commit -m
<message> -- :/p1 :/p2 …` (message as ONE argv element). → `{ ok, message: "Committed N
file(s)", commit: <sha>|null }` (sha parsed from the stdout bracket form). 400 for empty
message/files or invalid paths; 500 for git failures; "nothing to commit" → 400 soft.

## `POST /api/git-branch`

Body `{ action: list|switch|create|delete, name?, base? }` (branch names validated: ≤200
chars, not HEAD/`.lock`/leading `.`/`..`/trailing `/` or `.`/`@{`/`//`,
`/^[A-Za-z0-9][A-Za-z0-9._/-]*$/`). Timeout 30 s.

- **list** → `{ ok, isRepo, branches: [{name, shortSha}], current }` (detached → null).
- **switch** → `git switch <name>` — git itself refuses when local modifications would be
  overwritten (the verbatim stderr is returned; 400).
- **create** → `git switch -c <name> [<base>]` — creates AND switches.
- **delete** → refuses the current branch (400), then `git branch -d` (never `-D`);
  unmerged → 400 with a force-delete hint.

## `GET /api/git-diff` · `GET /api/git-diff-content`

- **git-diff** (one project file): query `folder`* + `file`* (`.py`-only via
  `resolveScriptPath`). `git --no-optional-locks diff --no-color HEAD -- <absPath>` (10 s;
  cached on `globalThis.__diffCache`, 50 files, mtime+size keyed) → `{ ok, isRepo, diff
  (raw unified), addedLines: number[], removedLines, modifiedLines, relPath }` — the
  parser classifies `+`/`-` runs into added/removed/modified line numbers for the gutter
  markers. Exit 128 → the not-a-repo shape with a hint.
- **git-diff-content** (any repo file, raw): query `path`* (repo-relative),
  `untracked=1`, `scope: all|unstaged|staged` (all → `diff HEAD --`, unstaged →
  index↔worktree, staged → `--cached`); untracked → `git diff --no-index -- /dev/null
  <absPath>` after `git rev-parse --show-toplevel` → `{ ok, isRepo, diff, binary,
  relPath }` (the client parses it for the side-by-side/merge views).

## `POST /api/git-blame`

Body `{ folder`*, `file`* (anyKind) }`. Repo root resolved with cwd = the file's
directory (so a folder that is its own repo nested inside the scripts root works);
`git blame --line-porcelain -w -M -C [-L 1,5000] -- <rel>` (15 s; `MAX_BLAME_LINES`
5,000, `truncated` beyond) → `{ ok, lines: [{commit, author, authorTime, summary, line}],
truncated? }`; not-tracked → `{ ok: false, error: "File is not tracked by git yet." }`.
Run grouping, the 24-entry client cache, and relative ages live in
`src/lib/blame-data.ts`.

## `POST /api/git-command` — the escape hatch

Body `action` + per-action fields. A **strict allow-list** (unknown → 400 listing them):
`push | pull | fetch | stashPush | stashPop | stashList | stashShow | stashApply |
stashDrop | merge | rebase | abort | clone | revert | stage | unstage | discard |
stageHunk | unstageHunk | blame | resolveActive`. Timeout 120 s; output cap 60,000 chars;
patch cap 256 KB. Read-only actions (`stashList`, `stashShow`, `resolveActive`, `blame`)
run unserialized; **every other action is serialized through a global promise chain**
(index-write protection). Exact argv highlights: `push` → `git push`; `pull` → `git pull
[--rebase]`; `fetch` → `git fetch --all --prune`; stashes → `git stash push [-m
<msg>] / pop|apply|drop [stash@{N}] / list [format] / show -p stash@{N}`; `merge` →
`git merge --no-edit <branch>` (failure carries a `conflict` flag); `rebase` → `git
rebase <branch>` (failure always `conflict: true`); `abort` → `git merge --abort` or
`git rebase --abort`; `clone` → `git clone <url> <dir>` in the scripts root (URL scheme

+ charset validated, no shell metacharacters; dir must not exist); `revert` → `git
revert --no-edit <sha>`; `stage`/`discard` → `git add -- :/p…` / `git checkout -- :/p…`
  (**discard is destructive** — the UI confirms); `stageHunk`/`unstageHunk` → `git apply
[--reverse] --cached -` with the patch on stdin; `unstage` → a fallback chain
  `git restore --staged` → `git reset HEAD` → `git rm --cached --ignore-unmatch`.

## `GET /api/envs` · `POST /api/create-venv` · `GET /api/python-check` · `GET /api/runtime-check`

- **envs** (no params): `discoverEnvs()` probes `$VIRTUAL_ENV`, `~/.venv`,
  `~/.virtualenvs/*`, `conda env list --json`, `~/.pyenv/versions/*`, `uv python list`,
  PATH python3/python — each candidate X_OK-checked and version-probed (5 s), with the
  matplotlib+numpy+scipy import probe → `{ envs: [{path, label, source: venv|conda|
  pyenv|uv|system|manual, version?, hasScientificStack}] }` (stack-first sort).
  Process-lifetime cache; `resetInterpreterCache()` on settings changes.
- **create-venv**: body `{ folder`* (slug)`, interpreter? }` (120 s) → creates
  `<process.cwd()>/.venv/<folderName>/` via `<interpreter> -m venv` → `{ ok, venvPath,
  venvPython, existed }` (a "no module named venv" stderr returns a python3-venv install
  hint). The interpreter *pin* is a separate mechanism: `/api/env-sync` action `pin`.
- **python-check**: query `?interpreter=` (hint) → `<interpreter> --version` (4 s) →
  `{ ok, interpreter, version? }` or `{ ok: false, error }` — proves the binary runs.
- **runtime-check**: query `?fresh=1` (clears the 60 s cache) → 33 runtime probes (node, typescript, matlab, r, bash,
  java, c, cpp, ruby, php, go, lua, perl, rust,
  julia, kotlin, swift, powershell, batch, zig, dart, groovy, scala, elixir, haskell,
  erlang, clojure, ocaml, fsharp — flavored: typescript tries tsx → node-strip-types →
  node → deno; matlab falls back to octave; powershell prefers pwsh) → `{ ok, runtimes:
  [{id, label, languages, ok, version, command, installHint}], fresh }`.

## `GET+POST /api/env-sync`

- **GET** `?folder=&interpreter=`: `pip list --format json` (importlib.metadata
  fallback) + declared deps from `requirements.txt` AND `pyproject.toml` (PEP 621
  `dependencies` + poetry `[tool.poetry.dependencies]`), PEP 503-normalized comparison →
  `{ ok, interpreter, pinned?, declared: [{name, spec?, source}], installed:
  [{name, version}], missing, extra, lockfilePresent }`.
- **POST** `{ folder`*, `action: freeze|sync|lock|pin`, `pin?, target?, package?,
  interpreter? }`:
    - **freeze** → `pip freeze` into `<folder>/requirements.txt` (header
      `# Frozen by Praxis env-sync on <date>`; `target: "pyproject"` splices
      `[project] dependencies` instead).
    - **lock** → the same lines into `<folder>/requirements.lock`.
    - **pin** → writes `<folder>/.praxis/interpreter.json` `{"path": <absolute>}` (validated).
    - **sync** → installs only the MISSING declared deps (per-target `--dry-run` probe at
      60 s, then install at 240 s; 300 s overall deadline); extras are report-only, never
      removed. → `{ ok, results: [{name, action, ok, note?}], wrote? }`.

## `POST /api/install-deps` (SSE) · `POST /api/pip-install` · `GET+POST /api/pip-list`

- **install-deps**: body `{ folder`* }` — resolves the folder's `requirements.txt`
  (Pipfile/environment.yml/pyproject are rejected with "Only requirements.txt is
  supported."), then `<interpreter> -m pip install -r <reqPath>` streamed as SSE
  (`start`/`stdout`/`stderr`/`end`; 5-minute timeout; 2 MB output cap).
- **pip-install**: body `{ package`* (name or name==version spec; never a leading dash)`,
  interpreter? }` (3 min) → `{ ok, exitCode (synthesized 0/1), durationMs, output
  (≤8,000 chars), interpreter, package }`.
- **pip-list**: GET `?interpreter=` → `{ ok, interpreter, packages: [{name, version}],
  pipAvailable, method: pip|importlib.metadata, requirements?, pyproject?, declared,
  manifests }`; POST actions: `outdated` (network probe), `upgrade`/`uninstall`
  (per-package), `install` (600 s), `upgrade-all`, `pin` (pip freeze → the scripts
  root's requirements.txt), `pin-package` (plan-merged pin with backup-restore
  verification on failure).

## `POST /api/screenshot-save` · `GET /api/pdf-info` · `POST /api/media-trim`

- **screenshot-save**: body `{ path`* (project-relative), `dataUrl`* }` — extension must
  be png/jpg/jpeg/webp/svg; the dataURL prefix must match the extension; base64 decoded
  with magic-byte verification (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `RIFF…WEBP`;
  SVG must start `<?xml|<svg` and is rejected when it contains `<script`, `javascript:`,
  or `on<attr>=` — SVG executes scripts when opened); written atomically (tmp+rename)
  into the active project → `{ ok, path, relPath }`.
- **pdf-info**: query `folder`*, `file`* (`.pdf`) — poppler `pdftoppm -png -r 48 -f 1 -l
  60` thumbnails + `pdftotext -layout` text, each run capped 30 s → `{ ok, tools:
  {pdftoppm, pdftotext}, pages: [data URLs], textPages }` (missing tools report `false`
  so the client hides that portion).
- **media-trim**: body `{ folder`*, `file`*, `startSec`*, `endSec`* (finite,
  `0 ≤ start < end`, window ≤12 h) }` — ffmpeg `-c copy` first, re-encode retry
  (libx264/veryfast/crf 23 + per-ext audio codec) on failure; 120 s per attempt;
  output `<base>.trimmed.<ext>` next to the source → `{ ok, file, bytes, seconds }`;
  ffmpeg missing → **501** with install hints.
