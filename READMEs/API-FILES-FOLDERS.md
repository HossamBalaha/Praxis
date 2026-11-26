# API Contracts — Files, Folders, Archives, Projects

Back to [API-CONTRACTS.md](./API-CONTRACTS.md) for the shared conventions (slug
addressing, root resolution, traversal guards, auth, rate classes).

## Shared machinery (`src/lib/scripts.ts`, 1,442 lines)

Every route here imports from `@/lib/scripts`. The essentials:

- `getScriptsRoot()` / `getDefaultScriptsRoot()` — active project root → `SCRIPTS_ROOT`
  env → `<cwd>/python_scripts` (with a standalone-`chdir` climb-out).
- `slugify`/`deslugify` — the base64url codec. `resolveScriptPath(folderSlug, fileSlug,
  {anyKind?})` — the sandbox guard: deslug → `.py`-only unless `anyKind` → join under the
  root → `path.relative` containment → `fs.stat` isFile → `{absPath, folderName, fileName}`
  or `null`.
- `sanitizeSubPath(sub)` — rejects `..`, `\`, leading/trailing `/`, dot-prefixed and empty
  segments. `NAME_RE` for files
  `/^[A-Za-z0-9][A-Za-z0-9 _\-.()]{0,200}\.[A-Za-z0-9]+$/`; folders
  `/^[A-Za-z0-9][A-Za-z0-9 _\-]{0,63}$/`; dotfile allowlist `.gitignore`,
  `.gitattributes`, `.dockerignore` only.
- `FORBIDDEN_ROOT_NAMES` (19) + `projectRootRejectionReason()` — project vetting.
- `listFolders()` — the tree walker: depth ≤ 8, skips `node_modules`, `__pycache__`,
  `.venv`, `venv`, `env`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.git`, `.idea`,
  `.vscode`, `dist`, `build`, `.next`, `.turbo`; `.py` metadata from the first 2,048 bytes;
  a 5-second TTL cache invalidated by `invalidateFoldersCache()`.
- `saveLocalHistorySnapshot` — the shared pre-write snapshot writer (see
  [Local history](#local-history)).

## `GET /api/file`

Raw bytes of any file in the project. Query `folder`*, `file`* (slugs; the file slug may
encode a nested relative path). Success: raw bytes with `Content-Type` from the per-ext
MIME map (fallback `application/octet-stream`), `Content-Disposition: inline;
filename="<urlencoded>"`, and `Cache-Control: public, max-age=3600` for media extensions
(png/jpg/jpeg/gif/webp/svg/bmp/ico/avif/mp4/webm/ogg/ogv/mov/mkv/mp3/wav/flac/m4a/aac/opus/
pdf/woff/woff2/ttf/otf/eot) else `no-store`. This is the endpoint behind the viewer's
`<img>/<video>/<iframe>` tags — no `ok` envelope. Errors: 400 missing params / invalid
slug / `"Path traversal blocked."` / `"Not a file."`; 404 `"File not found."`.

## `GET /api/code`

One Python file's source, JSON. Query `folder`*, `file`* (`.py`-only via
`resolveScriptPath`). Success: `{ folder, file, size, content, language: "python" }`
(size = utf-8 byte length). Served from a `globalThis.__codeRouteCache` LRU (max 50 files,
hit requires identical `mtimeMs` + `size`). Errors: 400 missing params; 404
`"File not found inside python_scripts/."`; 500 read failure.

## `POST /api/file-create`

Body `folder`*, `fileName`*, `content?`, `sub?` (depth-capped at 4 segments). Creates the
target dir recursively, writes `content` (or the per-ext `DEFAULT_CONTENT` — `.py` gets
`# -*- coding: utf-8 -*-\n\n`, `.md` gets `# \n`, etc.). Success: `{ ok, name, slug,
folder, dir, path }` (slug encodes `sub/name`). Errors: 400 traversal/invalid
sub/hidden-file/NAME_RE; 409 exists; 500 write.

## `POST /api/file-write`

Body `folder`*, `fileName`* (relative path ok), `content`*. mkdir parent; **pre-write
local-history snapshot** via the shared helper; write. Success: `{ ok, file, size }`.
Errors: 400 (traversal/hidden basename); 500.

## `POST /api/file-delete` · `POST /api/file-rename` · `POST /api/file-duplicate`

- **delete**: body `folder`*, `file`* → `fs.unlink` → `{ ok, deleted, slug, folder }`
  (empty folders are left behind). 400/404/500.
- **rename**: body `folder`*, `file`*, `newName`* (NAME_RE) — stays within the source
  directory; 409 `"A file named ... already exists in this folder."`; `fs.rename` →
  `{ ok, oldName, newName, oldSlug, newSlug }` (slug keeps the directory part).
- **duplicate**: body `folder`*, `file`* → `<stem> (N).<ext>` counter up to 999 (500 →
  error), `fs.copyFile` into the source's own directory → `{ ok, originalName, newName,
  originalSlug, newSlug }`.

## `POST /api/file-copy` · `POST /api/file-move`

Body `fromFolder`*, `file`*, `toFolder`*, `toSub?`, `newName?`, `overwrite?` (default
false). Copy uses `fs.copyFile`; move uses `fs.rename` (atomic same-volume; overwrite →
`fs.rm(force)` first). Both mkdir the destination, validate `toSub` via `sanitizeSubPath`
and the target via NAME_RE, and return `{ ok, oldName, newName, oldFolder, newFolder,
newSub?, oldSlug, newSlug, oldFolderSlug, newFolderSlug, overwritten }`. Errors:
400/404/409 (unless overwrite)/500.

## `POST /api/file-stats` · `POST /api/folder-stats`

- **file-stats**: body `folder`*, `file`* (any kind) → full read; `isBinary` = NUL byte in
  the first 8,192 bytes (`HEAD_LIMIT`); `sha256` = first 16 hex chars; `lineCount` =
  `text.split("\n").length`; `wordCount` = `\S+` matches; `charCount` = length → `{ ok,
  size, mtime, birthtime, extension, lineCount, wordCount, charCount, sha256, isBinary }`.
- **folder-stats**: body `folder`*, `sub?` — root scope = non-recursive; `sub` scope =
  recursive walk depth ≤ 6. `README_CANDIDATES = ["README.md", "folder.md", "chapter.md",
  "README.MD", "CHAPTER.md"]`; `dataFileCount = fileCount − pythonFileCount −
  (hasReadme ? 1 : 0)` → `{ ok, folderName, sub?, fileCount, pythonFileCount,
  dataFileCount, totalSize, mtime, birthtime, hasReadme, readmeFile, largestFile:
  {name,size}|null, newestFile: {name,mtime}|null }`.

## `POST /api/files-import`

Drag-drop import. Body `folder`*, `sub?`, `files`: `[{ name*, content*, encoding?:
"utf-8"|"base64" }]`*, `overwrite?` (default false) → `{ ok, imported: [{name, slug, path,
overwritten}], skipped: [{name, reason}] }` (reason ∈ "invalid filename", "exists", "path
traversal blocked.", "write failed: …"). The name regex adds Latin-1 accented letters;
base64 encoding carries binaries.

## `GET /api/folders`

The whole tree (no `ok` envelope, never 4xx/5xx). Query `hidden=1` shows dot-dirs and
dot-files. Awaits `restoreActiveProjectRoot()`, then serves from the 5 s cache. Shape:

```json
{
  "folders": [
    {
      "name": "Data & Docs",
      "slug": "<base64url>",
      "isRoot": true,
      "files": [{ "name", "slug", "size", "description?", "tags?", "mtime?", "kind?", "ext?", "dir?", "path?" }],
      "dirs": ["Nested Folders/LevelOne"],
      "isEmpty": false,
      "tags": ["demo"],
      "dataFiles": [{ "name", "size", "ext", "mtime?", "dir?", "path?", "slug?" }]
    }
  ]
}
```

The first entry is the synthetic project-root entry (`slug = slugify(".")`, `isRoot: true`).
`DATA_FILE_EXTS` gates `dataFiles` (csv, tsv, json, jsonl, parquet, feather, xlsx, xls, db,
sqlite, h5, hdf5, png, jpg, jpeg, gif, webp, svg, txt, md, yaml, yml, toml, pkl, npz, npy).

## Folder CRUD

- **`POST /api/folder-create`** — body `name`* (folder regex, 1–64 chars), `folder?`,
  `sub?` (≤3 segments) → `{ ok, name, slug, folder?, dir }`. 400/409 exists/500.
- **`POST /api/folder-delete`** — body `folder`*, `sub?` → `fs.rm recursive force` →
  `{ ok, deleted }` (`deleted` = `folder` or `folder/sub`; the scripts root itself is
  refused: `"Cannot delete the scripts root itself."`). 400/404/500.
- **`POST /api/folder-rename`** — body `folder`*, `newName`*, `sub?` → in-place nested
  rename → `{ ok, oldName, newName, oldSlug, newSlug, dir }` (the folder slug is
  unchanged — `newSlug === slugify(oldName)`).
- **`POST /api/folder-move`** — body `fromFolder`*, `dir`* (relative subfolder path),
  `toFolder`*, `toSub?` — basename kept at the destination; rejects moving a folder into
  itself/descendants (400), same-place (400), and name collisions (409, no silent merge)
  → `{ ok, name, fromFolder, toFolder, toSub }`.
- **`POST /api/folder-compare`** — compare two folder trees (diff lists per side; feeds
  the folder-compare dialog).
- **`POST /api/folder-lint`** — body `folder`*, `interpreter?`, `sub?` → ONE ruff/pyflakes
  spawn for the whole folder (60 s) → `{ ok, linter, files: [{file, issues: [{line, col,
  code, message}]}], totals: {files, filesWithIssues, issues, byRule}, generatedAt }`.

## `GET /api/folder-list` · `POST /api/open-folder` · `GET /api/resolve-path`

- **folder-list** — the in-app project *picker*: query `path` (absolute anywhere, or
  relative to the projects parent; default = the start path) → `{ root, rootName, path,
  relPath, parent, isDefault, isAppDir, rejection, startPath, hasPy, scriptCount, created,
  crumbs: [{name, path, isStart}], dirs: [{name, path, hasPy, scriptCount, created}] }`.
  Hides dot-dirs and `FORBIDDEN_ROOT_NAMES`. 404 unreadable dir.
- **open-folder** — the OS *reveal*: body `folder`*, `file?`, `sub?` (≤4 segments) →
  `explorer [path]` / `explorer /select,<file>` (win32), `open -R` (darwin), `xdg-open`
  (Linux) → `{ ok, command, path, folder, file?, platform }` (or 500 with the failed
  command).
- **resolve-path** — read-only "Copy absolute path": query `folder`*, `file?`, `sub?` →
  `{ absPath, root, exists, isFile }`.

## The zip family

All builders use `buildZip`/`ZipInput` (`src/lib/zip.ts`) with
`ZIP_LIMITS = { maxEntryBytes: 512 MB, maxTotalBytes: 2 GB, maxEntries: 20,000 }`.

| Route             | Verb             | Input                                                                                                    | Output                                                                                                                                                                                | Notes                                                                                                                                                                               |
|-------------------|------------------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/api/folder-zip` | GET              | `folder`*, `sub?`, `scaffold=github`                                                                     | zip stream, `attachment; filename="<safeName>.zip"`, `no-store`                                                                                                                       | recursive sorted walk; `scaffold=github` injects README.md/.gitignore/requirements.txt only inside the archive; 413 over limits.                                                    |
| `/api/batch-zip`  | POST             | `entries: [{folder*, file*}]`                                                                            | zip stream, `praxis-selection-<N>-files.zip`, `X-Praxis-Entries: <N>`                                                                                                                 | dedupes by relative path; skips missing.                                                                                                                                            |
| `/api/compress`   | POST             | `kind: file\|folder`, `folder`*, `sub?`, `file?`, `zipName?` (≤120), `destMode: same\|path`, `destPath?` | **writes the zip ON DISK** → `{ ok, path, name, sizeBytes, entryCount }`                                                                                                              | "same" = the file's folder / the folder's parent; "path" = any absolute dir except app-code dirs (the scripts root is allowed); never overwrites (`name (2).zip` … `(Date.now())`). |
| `/api/upload-zip` | POST (multipart) | field `file`* ≤ 200 MB, `projectName?` (project mode), `folder`+`sub` (folder mode)                      | project mode: `{ ok, projectName, path, scriptCount, active, extractor, extractorNote? }`; folder mode: `{ ok, folder, folderName, importedFiles (≤200), extractor, extractorNote? }` | system `unzip -o` then the pure-JS extractor; a single wrapper folder is promoted; project mode registers + switches the active project. 409 when the destination exists.           |
| `/api/download`   | GET              | `folder`*, `file`* (anyKind)                                                                             | attachment stream (per-ext DOWNLOAD_MIME map, ascii-folded + `filename*=UTF-8''` names)                                                                                               | no size cap.                                                                                                                                                                        |

## `/api/archive`

Body `action: "list" | "extract" | "capabilities"`, `folder`*, `file`* (slug with relative
path), `dest?: "here" | "subfolder"`, `subfolderName?` (≤80 chars, sanitized).

- **Formats, capability-gated** (`src/lib/archive-caps.ts`, probed once per process):
  `.zip` always (pure-JS central-directory parser + extraction); `.tar/.tar.gz/.tgz/
  .tar.bz2/.tbz2/.tar.xz/.txz` via system `tar` (`-tvf`/`-xf -C`, explicit argv); single-file
  `.gz` always (node:zlib `gunzipSync`); single-file `.xz`/`.bz2` via `xz -dc`/`bzip2 -dc`
  (when probed); `.rar` via the built-in WASM `node-unrar-js`, else `unrar` (flavor-aware:
  free `-t`/`-x -f`, rarlab `lb -y`/`x -o+ -y`), else 7-Zip with the RAR codec; `.7z` via
  the vendored `bin/7za` (probed first), then `7z`/`7za`/`7zr`, else `bsdtar`.
- **Caps**: inline archive ≤ **512 MB** (413); listings capped at **500** entries (`truncated`); extraction bounded by
  `ZIP_LIMITS` (413).
- **`capabilities`** → `{ ok, capabilities }` (no file needed).
- **`list`** → `{ ok, kind: zip|rar|tar|7z, entries: [{name, size, isDir}] (≤500,
  `__MACOSX/` and `.DS_Store` filtered), totalEntries, truncated }`.
- **`extract`** → zip: `{ ok, kind: "zip", path, count }`; rar/7z/tar: `{ ok, kind, path }`;
  single-file gz/xz/bz2 (any action): `{ ok, kind: gz|xz|bz2, path, size }`. Destination
  containment is re-checked after extraction.
- Unsupported format → **415** `{ ok: false, unsupported: true, error, }` with the
  supported-formats sentence; not an archive → 400 `"Not a compressed archive."`
  (`ARCHIVE_RE = /\.(zip|tar|tgz|gz|bz2|xz|7z|rar|tar\.gz|tar\.bz2|tar\.xz|tbz2|txz)$/i`).
  No streaming — the archive is buffered whole (≤512 MB).

## `POST /api/github-import` (POST + GET)

POST body `{ url`*, `mode?` (advisory), `ref?`, `subpath?`, `into? }` → imports a GitHub
repo (via the codeload zip; refs resolved heads → tags → HEAD) or a gist (API + raw_url
refetch for truncated content) → `{ ok, folder (slug), name, files, url, ref? }`. Caps:
`MAX_ZIP_BYTES` 100 MB, `MAX_FILES` 5,000, `API_TIMEOUT_MS` 15 s, `ARCHIVE_TIMEOUT_MS`
60 s; offline → 502 `{ok: false, offline: true, error}`; failure cleans up partial
imports. Writes `<folder>/.praxis/source.json`. GET `?folder=` → `{ ok, hasSource, source? }`.

## `POST /api/import-ipynb` · `POST /api/import-py`

- **import-ipynb**: body `folder`*, `notebook`* (`{cells: [{cell_type, source}]}`),
  `fileName`* → converts cells to `# %%` / `# %% [markdown]` / `# %% [raw]` `.py` (markdown
  and raw commented out) → `{ ok, file, slug, path }`.
- **import-py**: body `folder`*, `fileName`* (`.py` forced), `content`* → **pre-write
  local-history snapshot** when overwriting → `{ ok, file, slug, path }`.

## Local history

Layout (`local-history/list/route-helpers.ts`): `os.tmpdir()/praxis-local-history/
sha1(scriptsRoot).slice(0,12)/<folderSlug>/<fileSlug>/<epoch-ms>.txt` (+ optional
`<id>.label` sidecar ≤80 chars; a legacy 16-char-hash sibling dir is also read).
`saveLocalHistorySnapshot` is best-effort, prunes to the newest **50** per file, and is
called by `/api/file-write`, `/api/import-py`, the manual save route, and the periodic
scheduler (`src/lib/local-history-scheduler.ts` — 5-minute fallback interval, ≤200
files/pass, ≤2 MB/file). Every local-history route arms the scheduler lazily.

| Route                        | Method | Params                                    | Response                                                                                |
|------------------------------|--------|-------------------------------------------|-----------------------------------------------------------------------------------------|
| `/api/local-history/list`    | GET    | `folder`*, `file`*                        | `{ ok, snapshots: [{id, ts, size, label?}] }` sorted desc, pruned to 50                 |
| `/api/local-history/save`    | POST   | `{folder, file, content, label?}`         | `{ ok, id, scheduler: {armed, running, lastPassAt, lastWritten, lastError, schedule} }` |
| `/api/local-history/restore` | GET    | `folder`*, `file`*, `id`* (`/^\d{13,}$/`) | `{ ok, content }` — read-only; the client applies it                                    |
| `/api/local-history/diff`    | GET    | `folder`*, `file`*, `id`*                 | `{ ok, diff }` — naive line diff (snapshot vs current; missing current → diff vs `""`)  |

## Projects & project settings

- **`GET /api/projects`** — restores the pointer, scans the projects parent (subdirs with
  ≥1 `.py`, skipping dot-dirs/forbidden names/the default root), merges the registry →
  `{ projects: [{name, path, scriptCount}], active }` (`active` `""` when the default).
- **`POST /api/projects`** — body `{ path }`: `""`/`"default"`/the default root → reset
  `{ok, projectPath: "", projectName: "python_scripts"}`; otherwise validated (`projectRootRejectionReason` → 400; not
  exists → 404; not a dir → 400), registered,
  and activated → `{ ok, projectPath, projectName }`.
- **`POST /api/projects/create`** — body `{ name`* (1–64 chars, reserved names rejected)`,
  `parentDir?` (absolute, must be the direct parent) } → `fs.mkdir` (empty project, no
  seeded files), registry + auto-switch → `{ ok, projectPath, projectName }`. 409 when
  the target exists.
- **`GET/POST/DELETE /api/project-settings`** — the `.praxis/settings.json` surface.
  GET `?seed=0` opts out of auto-seeding; a missing/unparseable file is server-seeded
  with `DEFAULT_SETTINGS` (atomic write) and returns `{ok: true, settings, seeded: true,
  praxisDir}`; sibling `.praxis/{notes.json "{}", appearance.json, spell-ignore.json
  "[]"}` are ensured, never overwritten. POST `{ settings }` (a POST carrying
  `pythonInterpreter` resets the interpreter cache); DELETE unlinks (and prunes an empty
  `.praxis/`).
- **`GET/POST/DELETE /api/project-appearance`** — `<scriptsRoot>/.praxis/appearance.json`
  (the explorer's per-folder/file visual customizations). GET → `{ok: true, appearance}`
  or `{ok: false}`; POST `{ appearance }` atomic-writes; DELETE unlinks.
- **`GET/POST /api/project-backup`** — GET streams `praxis-settings-backup.zip`
  (`.praxis/` minus `active-project.json`/`projects.json`/`*.tmp`, files ≤8 MB; 404 when
  nothing to export); POST imports a multipart `.zip` (≤2 GB): entries filtered (dirs/`__MACOSX/`/`.DS_Store`/
  `Thumbs.db`/app-level configs/non-`.json`/unsafe names/
  duplicates), each JSON-parsed **before** any write (one bad entry → 400, nothing
  imported) → `{ ok, restored: [...] }`.
