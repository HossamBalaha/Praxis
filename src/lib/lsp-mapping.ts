/**
 * lsp-mapping.ts — the PURE translators between raw LSP results and the
 * shapes Praxis's UI already speaks.
 *
 * The routes in src/app/api/lsp/** call these after the sidecar answers;
 * every function here is deterministic and side-effect-free (only
 * path/url string math) so the whole translation layer is unit-tested
 * without a server, a process, or a filesystem.
 *
 * What lives here:
 *   - position math: LSP is 0-based; every Praxis surface (wordAt,
 *     jumpToLine, the Diagnostic type) is 1-based
 *   - uriToAbsolutePath / locateScriptPath: pyright answers with
 *     file:// uris; Praxis addresses files by (folderName, fileName)
 *     inside the scripts root — this recovers that pairing, and flags
 *     locations that live OUTSIDE the project (stdlib, site-packages)
 *     so the UI can say "definition is in numpy" instead of jumping
 *     nowhere
 *   - mapHover: LSP hover markdown → { title, body } (the signature
 *     block becomes the title, the docstring the body)
 *   - mapDefinition / mapReferenceLocations: Location and LocationLink
 *     shapes → in-project targets and reference rows
 *   - mapDiagnostics: publishDiagnostics payloads → the app's
 *     Diagnostic shape (severity 1/2/3 → error/warning/info)
 *   - mapRenameEdits: a WorkspaceEdit → the rename-preview dialog's
 *     occurrence rows (exact, line/col-scoped — no word matching)
 *   - applyExactRenames: the dialog's APPLY side — splice exact edits
 *     into a buffer, right-to-left, with overlap rejection
 */

import path from "node:path";

// ── Types the UI consumes ────────────────────────────────────────────

/** The hover card content (the existing tooltip's kind: "lsp"). */
export interface MappedHover {
    title: string;
    body: string | undefined;
}

/** One in-project definition target (F12 jumps here). */
export interface MappedDefinitionTarget {
    folderName: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    /** 1-based line and column of the definition. */
    line: number;
    col: number;
}

/** The /api/lsp/definition response body. */
export interface MappedDefinition {
    targets: MappedDefinitionTarget[];
    /** Locations that pointed outside the scripts root. */
    externalCount: number;
}

/** One reference row (pre-enrichment — names/slugs/snippet added by the route). */
export interface MappedReferenceLocation {
    folderName: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    /** 1-based. */
    line: number;
    col: number;
}

/** One rename occurrence row (the dialog's exact-edit shape). */
export interface MappedRenameOccurrence {
    /** 1-based line of the identifier. */
    line: number;
    /** 1-based column where the identifier starts. */
    col: number;
    /** 1-based column where the identifier ENDS (exclusive). */
    endCol: number;
    /** The line's text (the dialog shows it). */
    snippet: string;
    /** True for the occurrence the caret was on (the declaration site). */
    defSite: boolean;
}

/** One file's rename edits (the dialog's per-file grouping). */
export interface MappedRenameFile {
    folderName: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    isPython: boolean;
    occurrences: MappedRenameOccurrence[];
}

/** The mapped WorkspaceEdit. */
export interface MappedRename {
    files: MappedRenameFile[];
    totalOccurrences: number;
}

// ── Position math ────────────────────────────────────────────────────

/** LSP (0-based) → Praxis (1-based) line. */
export function toOneBasedLine(line: number): number {
    // Shift by one, floored at 1.
    return Math.max(1, line + 1);
}

/** LSP (0-based) → Praxis (1-based) character. */
export function toOneBasedCol(character: number): number {
    // Shift by one, floored at 1.
    return Math.max(1, character + 1);
}

// ── URI → project file resolution ───────────────────────────────────

/**
 * A file:// uri → absolute filesystem path (forward-slash form), or
 * null for anything else (untitled:, https:, malformed input,
 * host-bearing UNC-style uris).
 *
 * Deliberately platform-independent string math — NOT
 * `fileURLToPath`, which changes shape per platform (a drive-less
 * `file:///workspace/…` uri throws on Windows while a host-bearing
 * `file://c` silently becomes a UNC `\\c\`): the whole translation
 * layer must behave identically on every OS the suite runs on.
 */
export function uriToAbsolutePath(uri: string): string | null {
    // Only file: uris are navigable.
    if (!uri.startsWith("file:")) return null;
    // The remainder after the scheme.
    const rest = uri.slice("file:".length);
    // Where the path component begins (after the authority).
    let pathStart: number;
    // A navigable file uri carries an authority (file://…).
    if (rest.startsWith("//")) {
        // Everything after the leading //.
        const after = rest.slice(2);
        // The authority runs to the first path/query/fragment separator.
        const cut = after.search(/[/?#]/);
        // The host (empty for the usual file:///… uris).
        const authority = cut === -1 ? after : after.slice(0, cut);
        // A host-bearing (UNC-style) uri never maps to a local project
        // file — the scripts root is always a local path.
        if (authority !== "" && authority.toLowerCase() !== "localhost") return null;
        // The path starts at the separator (or the uri is exhausted).
        pathStart = cut === -1 ? rest.length : 2 + cut;
    } else if (rest.startsWith("/")) {
        // A single-slash file uri (file:/…) has an empty authority.
        pathStart = 0;
    } else {
        // No path component at all.
        return null;
    }
    // The path component (query and fragment are not file paths).
    let rawPath = rest.slice(pathStart);
    const fragment = rawPath.search(/[?#]/);
    if (fragment !== -1) rawPath = rawPath.slice(0, fragment);
    // Strict percent-decoding — a truncated escape (file://%2) throws
    // and is treated as malformed, not navigable.
    let decoded: string;
    try {
        decoded = decodeURIComponent(rawPath);
    } catch {
        return null;
    }
    // A file path must be absolute.
    if (!decoded.startsWith("/")) return null;
    // Fold a drive-letter uri (file:///G:/x, file:///G%3A/x) to the
    // Windows form G:/x so it compares against a Windows scripts root.
    const drive = /^\/[A-Za-z]:(?=\/|$)/.exec(decoded);
    // The candidate absolute path (drive form drops the leading slash).
    const candidate = drive ? drive[0]!.slice(1) + decoded.slice(drive[0].length) : decoded;
    // Normalize POSIX-style (collapse separators, resolve . and ..) —
    // never platform-dependent — and re-assert absoluteness.
    const normalized = path.posix
        .normalize(candidate)
        .replace(/\/{2,}/g, "/")
        .replace(/^[A-Za-z]:$/, (m) => m + "/");
    // The normalized result must stay an absolute path (POSIX or drive).
    if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) return null;
    // The decoded absolute path.
    return normalized;
}

/** The result of locating an absolute path inside the scripts root. */
export interface LocatedScriptPath {
    folderName: string;
    /** Forward-slash relative path inside the folder (may be nested). */
    fileName: string;
}

/**
 * Recover the (folderName, fileName) pairing for an absolute path
 * inside the scripts root, or null when the path is outside it (or is
 * the root / a folder itself). Pure: the root is a parameter.
 *
 * Deliberately POSIX-style on every platform: both sides are folded
 * to forward slashes first, so a Windows root (G:\…), its
 * pathToFileURL round-trip (G:/…) and POSIX roots all compare
 * identically — `path.relative`/`path.sep` would flip semantics
 * between platforms and break the suite on Windows.
 */
export function locateScriptPath(absPath: string, scriptsRoot: string): LocatedScriptPath | null {
    // Fold both sides to forward-slash form (\ is a separator on
    // Windows and illegal in POSIX names).
    const root = scriptsRoot.replace(/\\/g, "/");
    const abs = absPath.replace(/\\/g, "/");
    // The forward-slash relative path, POSIX-style (resolves . and ..
    // segments on both sides first).
    const rel = path.posix.relative(root, abs);
    // Escaped the root (or a different drive) — outside the project.
    if (!rel || rel === ".." || rel.startsWith("../") || path.posix.isAbsolute(rel)) return null;
    // Split into segments (forward separators on every platform).
    const segments = rel.split("/");
    // A file lives at folder/file…; a bare folder is not a file.
    if (segments.length < 2) return null;
    // The folder is the first segment, the file the rest.
    return {
        folderName: segments[0]!,
        fileName: segments.slice(1).join("/"),
    };
}

// ── Raw LSP shapes (loosely typed — the server is the source) ───────

/** The minimal LSP Location shape pyright returns. */
export interface RawLocation {
    uri?: string;
    range?: { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } };
    /** LocationLink variants carry the target in targetUri/targetRange. */
    targetUri?: string;
    targetRange?: RawLocation["range"];
}

/** OneTextEdit from a WorkspaceEdit. */
export interface RawTextEdit {
    range?: { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } };
    newText?: string;
}

// ── Hover ────────────────────────────────────────────────────────────

/**
 * Map an LSP hover result to the hover-card content. Understands all
 * three historical content shapes (MarkupContent, MarkedString,
 * MarkedString[]) because pyright emits MarkupContent but the fallback
 * path may meet other servers.
 */
export function mapHover(raw: unknown): MappedHover | null {
    // A null result is a legal "nothing known here".
    if (!raw || typeof raw !== "object") return null;
    // Narrow the result.
    const hover = raw as { contents?: unknown };
    // No contents — nothing to show.
    if (hover.contents === undefined || hover.contents === null) return null;
    // Normalize the three content shapes to one markdown string.
    let markdown = "";
    // MarkupContent: { kind, value }.
    if (typeof hover.contents === "object" && !Array.isArray(hover.contents)) {
        // The value field.
        const value = (hover.contents as { value?: unknown }).value;
        // A string value is the markdown.
        if (typeof value === "string") markdown = value;
    } else if (typeof hover.contents === "string") {
        // A bare MarkedString.
        markdown = hover.contents;
    } else if (Array.isArray(hover.contents)) {
        // MarkedString[] — join the string parts and code blocks.
        const parts: string[] = [];
        for (const part of hover.contents) {
            // A plain string part.
            if (typeof part === "string") {
                parts.push(part);
            } else if (part && typeof part === "object") {
                // A { language, value } code block.
                const v = (part as { value?: unknown }).value;
                if (typeof v === "string") parts.push("```python\n" + v + "\n```");
            }
        }
        markdown = parts.join("\n\n");
    }
    // Nothing usable.
    if (!markdown.trim()) return null;
    // Extract the first fenced code block as the title (pyright puts the
    // signature there) and everything after a `---` rule as the body.
    const fence = /```[a-zA-Z]*\n([\s\S]*?)```/.exec(markdown);
    // The signature inside the fence (trimmed, single line).
    const title = (fence ? fence[1] : markdown).trim().split("\n")[0]!.trim();
    // No title → nothing to anchor the card on.
    if (!title) return null;
    // The body: text after the fence (a --- rule separates signature
    // from docstring in pyright's markdown).
    let body: string | undefined;
    if (fence) {
        // Everything after the closing fence.
        const rest = markdown.slice(fence.index! + fence[0].length);
        // Strip a leading --- separator and trim.
        const cleaned = rest.replace(/^\s*---+\s*/, "").trim();
        // Keep it only when non-empty.
        if (cleaned) body = cleaned;
    }
    // The mapped card.
    return {title, body};
}

// ── Definition ──────────────────────────────────────────────────────

/**
 * Map a definition result (Location | Location[] | LocationLink[] —
 * pyright picks based on client capabilities) to in-project targets
 * plus a count of external locations.
 */
export function mapDefinition(
    raw: unknown,
    scriptsRoot: string,
    slugifyName: (name: string) => string
): MappedDefinition {
    // Normalize to an array of locations.
    const locations: RawLocation[] = Array.isArray(raw) ? (raw as RawLocation[]) : raw ? [raw as RawLocation] : [];
    // The in-project targets.
    const targets: MappedDefinitionTarget[] = [];
    // Count of locations outside the project.
    let externalCount = 0;
    // Map each location.
    for (const loc of locations) {
        // LocationLink carries the target in targetUri/targetRange.
        const uri = loc.targetUri ?? loc.uri;
        const range = loc.targetRange ?? loc.range;
        // No uri — skip.
        if (!uri) continue;
        // To a filesystem path.
        const absPath = uriToAbsolutePath(uri);
        // Not a file uri — counts as external.
        if (!absPath) {
            externalCount += 1;
            continue;
        }
        // Locate inside the project.
        const located = locateScriptPath(absPath, scriptsRoot);
        // Outside the scripts root (stdlib / site-packages).
        if (!located) {
            externalCount += 1;
            continue;
        }
        // The 1-based position (default line 1 col 1 when the range is absent).
        const line = toOneBasedLine(range?.start?.line ?? 0);
        const col = toOneBasedCol(range?.start?.character ?? 0);
        // The navigable target.
        targets.push({
            folderName: located.folderName,
            fileName: located.fileName,
            folderSlug: slugifyName(located.folderName),
            fileSlug: slugifyName(located.fileName),
            line,
            col,
        });
    }
    // The mapped result.
    return {targets, externalCount};
}

// ── References ──────────────────────────────────────────────────────

/**
 * Map a references result (Location[]) to reference rows. External
 * locations are DROPPED (the peek popup only navigates inside the
 * project); snippets are added by the route (it owns the filesystem).
 */
export function mapReferenceLocations(
    raw: unknown,
    scriptsRoot: string,
    slugifyName: (name: string) => string
): MappedReferenceLocation[] {
    // Normalize to an array.
    const locations: RawLocation[] = Array.isArray(raw) ? (raw as RawLocation[]) : [];
    // The mapped rows.
    const rows: MappedReferenceLocation[] = [];
    // Map each location.
    for (const loc of locations) {
        // The uri must exist.
        if (!loc.uri) continue;
        // To a filesystem path.
        const absPath = uriToAbsolutePath(loc.uri);
        // Skip non-file uris.
        if (!absPath) continue;
        // Locate inside the project.
        const located = locateScriptPath(absPath, scriptsRoot);
        // Skip external locations.
        if (!located) continue;
        // The 1-based position.
        const line = toOneBasedLine(loc.range?.start?.line ?? 0);
        const col = toOneBasedCol(loc.range?.start?.character ?? 0);
        // The row.
        rows.push({
            folderName: located.folderName,
            fileName: located.fileName,
            folderSlug: slugifyName(located.folderName),
            fileSlug: slugifyName(located.fileName),
            line,
            col,
        });
    }
    // Done.
    return rows;
}

// ── Diagnostics ─────────────────────────────────────────────────────

/** The app's Diagnostic shape (code-viewer-types). */
export interface MappedDiagnostic {
    line: number;
    col: number | undefined;
    severity: "error" | "warning" | "info";
    message: string;
}

/** LSP severity (1=error, 2=warning, 3=info, 4=hint) → the app bucket. */
export function severityFromLsp(severity: number | undefined): "error" | "warning" | "info" {
    // Error.
    if (severity === 1) return "error";
    // Warning.
    if (severity === 2) return "warning";
    // Info + hint + absent → info.
    return "info";
}

/**
 * Map raw published diagnostics to the app's Diagnostic shape. The
 * message is prefixed with the rule code (matching the ruff rows the
 * squiggle overlay already renders, e.g. "F821 · undefined name").
 */
export function mapDiagnostics(
    raw: Array<{
        range?: { start?: { line?: number; character?: number } };
        severity?: number;
        code?: string | number;
        message?: string
    }>
): MappedDiagnostic[] {
    // The mapped rows.
    const out: MappedDiagnostic[] = [];
    // Map each diagnostic.
    for (const d of raw) {
        // Skip rows without a message.
        if (typeof d.message !== "string" || !d.message.trim()) continue;
        // The 1-based position.
        const line = toOneBasedLine(d.range?.start?.line ?? 0);
        const character = d.range?.start?.character;
        // The col only when the server reported one.
        const col = typeof character === "number" ? toOneBasedCol(character) : undefined;
        // The code prefix when present.
        const code = d.code !== undefined && d.code !== null ? String(d.code) : undefined;
        // The composed message.
        const message = code ? `${code} · ${d.message}` : d.message;
        // The mapped row.
        out.push({line, col, severity: severityFromLsp(d.severity), message});
    }
    // Done.
    return out;
}

// ── Rename ──────────────────────────────────────────────────────────

/** The mapped prepareRename result. */
export interface MappedPrepareRename {
    placeholder: string;
    /** The identifier's extent (1-based, endCol exclusive). */
    line: number;
    col: number;
    endCol: number;
}

/** Map a prepareRename result (null → the rename is not permitted). */
export function mapPrepareRename(raw: unknown): MappedPrepareRename | null {
    // A null result means "cannot rename here".
    if (!raw || typeof raw !== "object") return null;
    // Narrow.
    const prep = raw as { range?: RawLocation["range"]; placeholder?: unknown };
    // The placeholder (the current name).
    const placeholder = typeof prep.placeholder === "string" ? prep.placeholder : "";
    // No placeholder — treat as not renameable.
    if (!placeholder) return null;
    // The extent.
    const line = toOneBasedLine(prep.range?.start?.line ?? 0);
    const col = toOneBasedCol(prep.range?.start?.character ?? 0);
    const endCol = toOneBasedCol(prep.range?.end?.character ?? col);
    // The mapped result.
    return {placeholder, line, col, endCol};
}

/**
 * Map a rename WorkspaceEdit to the preview dialog's exact-edit rows.
 * `caret` marks the declaration site (the occurrence the caret was on
 * shows as the def row). `snippetAt` supplies each row's line text
 * (the route passes an async file-reading lookup; tests pass a map).
 */
export async function mapRenameEdits(
    raw: unknown,
    scriptsRoot: string,
    slugifyName: (name: string) => string,
    caret: { fileName: string; line: number },
    snippetAt: (folderName: string, fileName: string, line: number) => string | Promise<string>
): Promise<MappedRename | null> {
    // Narrow the WorkspaceEdit.
    const edit = raw as { changes?: Record<string, RawTextEdit[]>; documentChanges?: unknown } | null;
    // The per-uri edits (pyright uses `changes`; documentChanges with
    // RenameFile operations are not supported for preview).
    const changes = edit?.changes;
    // No changes — nothing to preview.
    if (!changes || typeof changes !== "object") return null;
    // The per-file groups.
    const files: MappedRenameFile[] = [];
    // Total occurrence count.
    let totalOccurrences = 0;
    // Process each uri.
    for (const [uri, edits] of Object.entries(changes)) {
        // Skip empty edit sets.
        if (!Array.isArray(edits) || edits.length === 0) continue;
        // To a filesystem path.
        const absPath = uriToAbsolutePath(uri);
        // Skip non-file uris.
        if (!absPath) continue;
        // Locate inside the project.
        const located = locateScriptPath(absPath, scriptsRoot);
        // Skip external files.
        if (!located) continue;
        // The rows for this file.
        const occurrences: MappedRenameOccurrence[] = [];
        // Map each edit.
        for (const e of edits) {
            // The extent (1-based).
            const line = toOneBasedLine(e.range?.start?.line ?? 0);
            const col = toOneBasedCol(e.range?.start?.character ?? 0);
            const endCol = toOneBasedCol(e.range?.end?.character ?? col);
            // The line's text for the preview row (may be a promise).
            const snippet = await snippetAt(located.folderName, located.fileName, line);
            // The declaration-site flag (the caret's own occurrence).
            const defSite = located.fileName === caret.fileName && line === caret.line;
            // The row.
            occurrences.push({line, col, endCol, snippet, defSite});
        }
        // Only files with surviving rows.
        if (occurrences.length === 0) continue;
        // Accumulate.
        totalOccurrences += occurrences.length;
        // The file group.
        files.push({
            folderName: located.folderName,
            fileName: located.fileName,
            folderSlug: slugifyName(located.folderName),
            fileSlug: slugifyName(located.fileName),
            isPython: located.fileName.toLowerCase().endsWith(".py"),
            occurrences,
        });
    }
    // Nothing mappable.
    if (files.length === 0) return null;
    // The mapped preview.
    return {files, totalOccurrences};
}

/** One exact edit for applyExactRenames (1-based line/col, endCol exclusive). */
export interface ExactRenameEdit {
    line: number;
    col: number;
    endCol: number;
    newText: string;
}

/**
 * Splice exact (line, col, endCol) edits into a document — the APPLY
 * side of the LSP rename preview. Edits are applied bottom-up so
 * earlier offsets stay valid; overlapping or out-of-range edits are
 * REJECTED (the whole apply fails) because a partial rename is worse
 * than no rename. Returns the new content, or null when rejected.
 */
export function applyExactRenames(content: string, edits: ExactRenameEdit[]): string | null {
    // Nothing to do — the identity.
    if (edits.length === 0) return content;
    // Split into lines ONCE (the app's line convention).
    const lines = content.split("\n");
    // Sort edits by (line, col) DESCENDING so splicing never disturges
    // the offsets of edits still to come.
    const ordered = [...edits].sort((a, b) => (b.line - a.line) || (b.col - a.col));
    // The previously applied edit (for overlap detection).
    let prev: ExactRenameEdit | null = null;
    // Apply each edit.
    for (const edit of ordered) {
        // Bounds: the line must exist.
        if (edit.line < 1 || edit.line > lines.length) return null;
        // The target line.
        const line = lines[edit.line - 1]!;
        // Bounds: the columns must sit inside the line.
        if (edit.col < 1 || edit.endCol < edit.col || edit.endCol > line.length + 1) return null;
        // Overlap: on the same line, this edit must start at or after the
        // previous edit's start (descending order guarantees that) AND
        // must not extend into it.
        if (prev && prev.line === edit.line && edit.endCol > prev.col) return null;
        // Splice: before + newText + after.
        lines[edit.line - 1] = line.slice(0, edit.col - 1) + edit.newText + line.slice(edit.endCol - 1);
        // Remember for the overlap check.
        prev = edit;
    }
    // Rejoin (the app's newline convention).
    return lines.join("\n");
}
