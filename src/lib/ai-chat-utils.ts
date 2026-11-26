/**
 * Pure helpers for the AI Chat sidebar's search + export features.
 * Extracted from ai-chat-sidebar.tsx so the logic is unit-testable
 * without rendering the component (the vitest suite is node-env,
 * no DOM).
 *
 *  - splitOnQuery: case-insensitive substring highlighting for the
 *    in-conversation search box (returns alternating plain / hit
 *    segments; empty query → one plain segment).
 *  - countQueryMatches: how many times the query hits a text — powers
 *    the "N messages · M matches" result chip.
 *  - buildConversationMarkdown: serializes the persisted history into
 *    one Markdown file for the Export button (Blob URL download).
 */

/** One rendered chunk of text — `hit: true` segments are the search
 *  matches (rendered as <mark> by the sidebar). */
export interface QuerySegment {
    text: string;
    hit: boolean;
}

/** Split `text` around case-insensitive occurrences of `query`.
 * An empty/whitespace query returns the whole text as one plain
 * segment. Adjacent hits stay separate segments (each <mark> shows
 * the user exactly where a match started/ended). */
export function splitOnQuery(text: string, query: string): QuerySegment[] {
    if (!text) return [];
    const q = query.trim();
    if (!q) return [{text, hit: false}];
    // indexOf on the lowercased pair — no regex so the query needs no
    // escaping (a user searching for "." or "(" works verbatim).
    const hay = text.toLowerCase();
    const needle = q.toLowerCase();
    const out: QuerySegment[] = [];
    let cursor = 0;
    let idx = hay.indexOf(needle, cursor);
    while (idx !== -1) {
        if (idx > cursor) out.push({text: text.slice(cursor, idx), hit: false});
        out.push({text: text.slice(idx, idx + needle.length), hit: true});
        cursor = idx + needle.length;
        idx = hay.indexOf(needle, cursor);
    }
    if (cursor < text.length) out.push({text: text.slice(cursor), hit: false});
    return out;
}

/** Count case-insensitive occurrences of `query` in `text` (0 for an
 *  empty query — the chip only shows while searching). */
export function countQueryMatches(text: string, query: string): number {
    const q = query.trim();
    if (!q || !text) return 0;
    const hay = text.toLowerCase();
    const needle = q.toLowerCase();
    let count = 0;
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
        count++;
        idx = hay.indexOf(needle, idx + needle.length);
    }
    return count;
}

/** The message shape these helpers consume — the sidebar's ChatMessage
 *  minus the volatile streaming/error flags. */
export interface ConversationEntry {
    role: "user" | "assistant";
    content: string;
}

/** Serialize a conversation to one Markdown document.
 *
 *  Layout: a small header block (exported-at stamp, file/folder
 *  context when known, message count), then one `## You` /
 *  `## Assistant` section per message with the content verbatim.
 *  Message content is raw (it may itself be markdown from the model) —
 *  fencing it would double-escape code blocks the assistant already
 *  sent fenced; verbatim is what "export the conversation" means. */
export function buildConversationMarkdown(
    messages: ConversationEntry[],
    meta: {
        fileName?: string;
        folderName?: string;
        exportedAt?: Date;
    } = {}
): string {
    const stamp =
        meta.exportedAt instanceof Date && !Number.isNaN(meta.exportedAt.getTime())
            ? meta.exportedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC"
            : "";
    const lines: string[] = ["# Praxis AI Chat Export", ""];
    if (stamp) lines.push(`- Exported: ${stamp}`);
    if (meta.folderName) lines.push(`- Folder: ${meta.folderName}`);
    if (meta.fileName) lines.push(`- File: ${meta.fileName}`);
    lines.push(`- Messages: ${messages.length}`);
    lines.push("", "---", "");
    for (const m of messages) {
        lines.push(m.role === "user" ? "## You" : "## Assistant", "");
        lines.push(m.content.trim() || "_(empty)_");
        lines.push("");
    }
    return lines.join("\n");
}

/** File name for the export download — date-stamped so repeated
 *  exports don't silently overwrite each other in ~/Downloads. */
export function conversationExportFileName(date?: Date): string {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    return `praxis-ai-chat-${d.toISOString().slice(0, 10)}.md`;
}

/* ================================================================== */
/*  @-mentions (repo-aware chat context)                               */

/* ================================================================== */

/** One mention chip in the chat composer — what the user picked from the
 *  @ popup. Files carry just the path; symbol picks additionally carry the
 *  symbol's name + kind (a symbol mention resolves to its file + name). */
export interface ChatMention {
    /** Project-relative display path, e.g. "My Folder/utils.py"
     * (root-level files are just "utils.py"). */
    path: string;
    /** Symbol name when the mention picked a symbol from
     * /api/project-symbols. */
    symbol?: string;
    /** Symbol kind ("function" | "class" | "method"). */
    kind?: string;
}

/** Cap on distinct files sent as chat context (the payload's contextFiles
 *  array is capped at this many FILE paths — several symbols in one file
 *  still count as one file). */
export const MENTION_FILE_CAP = 5;

/** Find the still-open "@token" the user is typing — the popup trigger.
 * The token is open only while it runs to the END of the text with no
 * whitespace after the "@": typing "see @util" keeps it open, "see @util
 * and" closed it. Returns the "@" offset + the filter text typed so far,
 * or null when there is no open token. */
export function findActiveMentionQuery(text: string): { at: number; query: string } | null {
    const at = text.lastIndexOf("@");
    if (at < 0) return null;
    const tail = text.slice(at + 1);
    if (/[\s]/.test(tail)) return null;
    return {at, query: tail};
}

/** Reduce the mention chips to the `contextFiles` payload: deduped
 * (same path + same symbol = the same mention) and capped at
 * MENTION_FILE_CAP distinct file paths, in the order the user attached
 * them. Pure — mirrored server-side by lib/ai.ts's sanitizeContextFiles. */
export function buildContextFiles(mentions: readonly ChatMention[]): ChatMention[] {
    const seenPath = new Set<string>();
    const seenKey = new Set<string>();
    const out: ChatMention[] = [];
    for (const m of mentions) {
        const path = m.path.trim();
        if (!path) continue;
        const key = `${path}::${m.symbol ?? ""}`;
        if (seenKey.has(key)) continue;
        if (!seenPath.has(path)) {
            if (seenPath.size >= MENTION_FILE_CAP) break; // file cap reached
            seenPath.add(path);
        }
        seenKey.add(key);
        out.push(m.symbol ? {path, symbol: m.symbol, kind: m.kind} : {path});
    }
    return out;
}

/** Serialize the mention chips into the outgoing user message so the
 * conversation history (and the model) both see the references: each
 * mention becomes "@path" (file) or "@path ▸ symbol" (symbol), appended
 * after the typed text. Idempotent — a message that already carries the
 * exact tag block is returned unchanged (the retry path re-sends stored
 * text that was serialized once already). */
export function serializeMentions(text: string, mentions: readonly ChatMention[]): string {
    const trimmed = text.trim();
    if (mentions.length === 0) return trimmed;
    const joined = mentions
        .map((m) => (m.symbol ? `@${m.path} ▸ ${m.symbol}` : `@${m.path}`))
        .join(" ");
    if (trimmed.includes(joined)) return trimmed;
    return trimmed ? `${trimmed} ${joined}` : joined;
}

/* ================================================================== */
/*  path:line citations in assistant messages                          */

/* ================================================================== */

/** One `path:line` citation detected in an assistant message. */
export interface CodeCitation {
    path: string;
    line: number;
    /** The raw matched text ("utils.py:42") as it appeared in the message. */
    text: string;
}

/** Marker prefix for the markdown hrefs linkifyCitations produces; the
 *  sidebar's link renderer intercepts these and renders the citation chip
 *  (a plain "#fragment" href — react-markdown's default URL transform
 *  passes it through, and the browser never navigates because the click
 *  is handled as a button). */
export const CITATION_HREF_PREFIX = "#praxis-cite/";

/**
 * Match a file-path token immediately followed by `:<digits>`.
 *
 * The path must contain a dot-separated ALPHA extension on its last
 * segment ("utils.py", "pkg/sub/mod.js") — that rejects IP addresses /
 * host:port pairs like "127.0.0.1:8080" (numeric "extension") and
 * "localhost:8080" (no dot) while accepting real file references.
 * ONE space is allowed per directory segment (Praxis folders are
 * display names like "My Folder"), never inside the basename. Case-
 * insensitive ("UTILS.PY:42" matches).
 */
const CITATION_RE =
    /((?:[A-Za-z0-9_.\-]+(?: [A-Za-z0-9_.\-]+)?\/)*[A-Za-z0-9_\-]+\.[A-Za-z][A-Za-z0-9]{0,7}):(\d{1,6})(?!\d)/g;

/**
 * Ranges of the markdown source that are CODE (fenced blocks and inline
 * backtick spans). Citation detection/rewriting must never touch them —
 * turning "utils.py:42" inside a code sample into a link would corrupt
 * the sample. Offsets are into the original string; fenced ranges
 * include their ```/~~~ marker lines, inline ranges exclude the
 * backticks themselves.
 */
export function codeSpanRanges(md: string): Array<{ kind: "fence" | "inline"; start: number; end: number }> {
    const out: Array<{ kind: "fence" | "inline"; start: number; end: number }> = [];
    const lines = md.split("\n");
    let offset = 0;
    let fenceStart = -1;
    let fenceChar = ""; // "`" or "~" — the opening fence's marker char
    for (const line of lines) {
        const lineStart = offset;
        offset += line.length + 1; // +1 for the "\n" (harmless past the end)
        if (fenceStart >= 0) {
            // A closing fence is a bare marker run of the SAME character
            // (```python opens, ``` closes — the info string lives only on
            // the opening line).
            const t = line.trim();
            if (t.length >= 3 && (t.replace(/`+/g, "") === "" || t.replace(/~+/g, "") === "") && t[0] === fenceChar) {
                out.push({kind: "fence", start: fenceStart, end: lineStart + line.length});
                fenceStart = -1;
                fenceChar = "";
            }
            continue;
        }
        const openFence = /^\s*(`{3,}|~{3,})/.exec(line);
        if (openFence) {
            fenceStart = lineStart;
            fenceChar = (openFence[1] ?? "")[0] ?? "`";
            continue;
        }
        // Inline `code` spans on this prose line.
        let inInline = false;
        let inlineStart = 0;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === "`") {
                if (!inInline) {
                    inInline = true;
                    inlineStart = lineStart + i + 1; // after the opening backtick
                } else {
                    out.push({kind: "inline", start: inlineStart, end: lineStart + i});
                    inInline = false;
                }
            }
        }
    }
    return out;
}

/** True when [start, end) overlaps any code range. */
function inCodeRange(ranges: Array<{ start: number; end: number }>, start: number, end: number): boolean {
    return ranges.some((r) => start < r.end && end > r.start);
}

/**
 * Detect every `path:line` citation in an assistant message's PROSE
 * (code fences / inline code are skipped — see codeSpanRanges).
 * Pure — pinned by the vitest suite; the sidebar's rendering path goes
 * through linkifyCitations, which shares this scanner.
 */
export function extractCitations(md: string): CodeCitation[] {
    if (!md) return [];
    const code = codeSpanRanges(md);
    const out: CodeCitation[] = [];
    CITATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITATION_RE.exec(md)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (inCodeRange(code, start, end)) continue;
        const line = Number(m[2]);
        if (!Number.isFinite(line) || line < 1) continue;
        out.push({path: m[1], line, text: m[0]});
    }
    return out;
}

/**
 * Rewrite the markdown so every prose citation becomes a markdown link
 * `[path:line](#praxis-cite/<encoded>)`. Code fences and inline code are
 * left byte-identical. The sidebar's custom link renderer intercepts
 * hrefs carrying CITATION_HREF_PREFIX and renders a clickable chip that
 * dispatches "praxis:open-file-line" — nothing else in the message
 * changes. Pure.
 */
export function linkifyCitations(md: string): string {
    if (!md) return md;
    const code = codeSpanRanges(md);
    let out = "";
    let cursor = 0;
    CITATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITATION_RE.exec(md)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (inCodeRange(code, start, end)) continue;
        const line = Number(m[2]);
        if (!Number.isFinite(line) || line < 1) continue;
        out += md.slice(cursor, start);
        out += `[${m[0]}](${CITATION_HREF_PREFIX}${encodeURIComponent(m[0])})`;
        cursor = end;
    }
    out += md.slice(cursor);
    return out;
}

/** Parse a citation href produced by linkifyCitations back into its
 *  { path, line } — null for any other href. */
export function parseCitationHref(href: string): { path: string; line: number } | null {
    if (!href.startsWith(CITATION_HREF_PREFIX)) return null;
    const payload = decodeURIComponent(href.slice(CITATION_HREF_PREFIX.length));
    const split = payload.lastIndexOf(":");
    if (split <= 0) return null;
    const line = Number(payload.slice(split + 1));
    if (!Number.isFinite(line) || line < 1) return null;
    return {path: payload.slice(0, split), line};
}

/* ================================================================== */
/*  Project file-tree flattening + git-path matching                   */

/* ================================================================== */

/** The minimal /api/folders tree shape the helpers below consume (a
 *  picked subset of FolderInfo/FileInfo — the same fields the sidebar's
 *  @ popup and the review dialog's file fetch need). */
export interface ProjectTreeFolder {
    /** Folder display name (the synthetic root entry uses the scripts
     *  root's basename). */
    name: string;
    /** Folder slug (the synthetic root entry's slug deslugifies to "."). */
    slug: string;
    /** True for the synthetic project-root entry. */
    isRoot?: boolean;
    files: Array<{
        /** Display basename, e.g. "Brier Score.py". */
        name: string;
        /** Lossless base64url slug encoding the RELATIVE path inside the folder. */
        slug: string;
        /** Relative path incl. filename (POSIX; equals name for folder-root files). */
        path?: string;
        /** File modification time, ms since epoch (optional — the Recent
         *  group is derived from it). */
        mtime?: number;
    }>;
}

/** One flattened file entry for the @ popup / path resolution. */
export interface ProjectFileEntry {
    /** Project-relative display path ("My Folder/sub/utils.py"). */
    path: string;
    /** File basename. */
    name: string;
    folderName: string;
    folderSlug: string;
    fileSlug: string;
    /** mtime in ms when /api/folders reported one (drives the "Recent"
     *  group in the @ popup). */
    mtime?: number;
}

/** Flatten a /api/folders tree into a project-relative file list (the
 *  same list the sidebar's @ popup ranks). The synthetic root entry's
 *  files keep their plain relative path; folder files are prefixed with
 *  the folder name. Pure. */
export function flattenProjectFiles(folders: readonly ProjectTreeFolder[]): ProjectFileEntry[] {
    const out: ProjectFileEntry[] = [];
    for (const folder of folders) {
        for (const file of folder.files ?? []) {
            const rel = file.path ?? file.name;
            const full = folder.isRoot ? rel : `${folder.name}/${rel}`;
            out.push({
                path: full,
                name: file.name,
                folderName: folder.name,
                folderSlug: folder.slug,
                fileSlug: file.slug,
                ...(typeof file.mtime === "number" ? {mtime: file.mtime} : {}),
            });
        }
    }
    return out;
}

/** Match a reference path (a git repo-relative path from a diff header,
 *  or a "folderName/file.py" display path built from a symbol entry)
 *  against the project tree. Three passes, most-exact first:
 *
 *   1. full  — the tree path equals the reference verbatim;
 *   2. suffix — the tree path ends with "/<ref>" or the ref ends with
 *      "/<treePath>" (the git repo root can sit ABOVE the scripts root,
 *      so diff paths may carry a prefix the tree does not have);
 *   3. basename — the first ref segment matches the folder name and the
 *      last segment matches the file basename (symbol entries only know
 *      the basename, which may be a nested file).
 *
 * Returns the resolved (folderSlug, fileSlug, fileName) — the exact
 * addressing /api/file and /api/code use — or null when nothing matches.
 * Pure; used by the chat sidebar's symbol mentions and the review
 * dialog's fix application. */
export function matchProjectFilePath(
    refPath: string,
    folders: readonly ProjectTreeFolder[]
): { folderSlug: string; fileSlug: string; fileName: string; displayPath: string } | null {
    const clean = refPath.trim().replace(/\\/g, "/");
    if (!clean) return null;
    const segs = clean.split("/").filter((s) => s.length > 0);
    const base = segs[segs.length - 1] ?? "";
    const first = segs.length >= 2 ? segs[0] ?? "" : "";
    for (const mode of ["full", "suffix", "basename"] as const) {
        for (const folder of folders) {
            for (const file of folder.files ?? []) {
                const rel = file.path ?? file.name;
                const full = folder.isRoot ? rel : `${folder.name}/${rel}`;
                let hit = false;
                if (mode === "full") hit = full === clean;
                else if (mode === "suffix")
                    hit = full.endsWith(`/${clean}`) || clean.endsWith(`/${full}`) || (folder.isRoot === true && rel === clean);
                else
                    hit =
                        segs.length >= 2 &&
                        first.toLowerCase() === folder.name.toLowerCase() &&
                        base === file.name;
                if (hit) {
                    return {folderSlug: folder.slug, fileSlug: file.slug, fileName: file.name, displayPath: full};
                }
            }
        }
    }
    return null;
}

/* ================================================================== */
/*  Unified-diff anchoring (AI review "apply fix in place")            */

/* ================================================================== */

/** One hunk of a unified diff — the header line plus its body lines
 *  (each body line keeps its single +/-/space prefix). */
export interface DiffHunk {
    header: string;
    lines: string[];
}

/** One file's section of a (possibly multi-file) unified diff. */
export interface DiffFileSection {
    /** Repo-relative path from the `+++ b/<path>` header (`+++ /dev/null` →
     *  the path from `diff --git a/<path> b/<path>`); "unknown" when the
     *  diff carried no file header at all. */
    path: string;
    hunks: DiffHunk[];
}

/** Parse a concatenated multi-file unified diff into per-file sections.
 *  File paths come from the `+++ b/<path>` headers; when a file has no
 *  +++ header (untracked files diff against /dev/null) the path falls
 *  back to the `diff --git a/<path> b/<path>` line. The cumulative hunk
 *  order matches the flat hunk indexing the reviewer prompt specifies
 *  (0-based from the first @@ across the WHOLE concatenated diff), so
 *  comment.hunk maps to sections/flat hunks identically. Pure. */
export function splitDiffFileSections(diff: string): DiffFileSection[] {
    const sections: DiffFileSection[] = [];
    let currentPath = "";
    let current: DiffHunk | null = null;
    for (const rawLine of diff.split("\n")) {
        if (rawLine.startsWith("@@")) {
            if (!currentPath) currentPath = "unknown";
            let section = sections.find((s) => s.path === currentPath && currentPath !== "unknown");
            if (!section) {
                section = {path: currentPath, hunks: []};
                sections.push(section);
            }
            current = {header: rawLine, lines: []};
            section.hunks.push(current);
            continue;
        }
        // File-identifying headers come BEFORE the hunk body checks: a
        // concatenated multi-file diff repeats them BETWEEN files, and they
        // must close the previous file's last hunk (not leak into its
        // lines) while retargeting the path the next hunks belong to.
        const plus = /^\+\+\+\s+b\/(.+)$/.exec(rawLine);
        if (plus) {
            current = null;
            currentPath = plus[1] ?? "";
            continue;
        }
        const gitLine = /^diff --git a\/(.+?) b\/(.+)$/.exec(rawLine);
        if (gitLine) {
            current = null;
            currentPath = gitLine[2] ?? gitLine[1] ?? "";
            continue;
        }
        if (current) {
            current.lines.push(rawLine);
            continue;
        }
        // Other pre-hunk metadata (index / new file mode / --- a/…) is
        // consumed silently — only the file-identifying headers matter.
    }
    // The trailing "" produced by the final "\n" of a concatenated diff
    // can add a phantom empty line to the last hunk — strip it (it came
    // from the join, not the diff).
    for (const s of sections) {
        for (const h of s.hunks) {
            while (h.lines.length > 0 && h.lines[h.lines.length - 1] === "") h.lines.pop();
        }
    }
    return sections;
}

/** Flat hunk list (index = the 0-based hunk index the review comments
 *  carry) — splitDiffFileSections with the file grouping dropped. */
export function diffHunkList(diff: string): DiffHunk[] {
    return splitDiffFileSections(diff).flatMap((s) => s.hunks);
}

/** The lines of a hunk as they exist in the CURRENT working-tree file:
 *  context lines (' ' prefix) + added lines ('+' prefix), prefixes
 *  stripped, in diff order. Removed ('-') lines are the OLD side and are
 *  not in the file; "\ No newline at end of file" markers are skipped. */
export function hunkNewSideLines(hunk: DiffHunk): string[] {
    const out: string[] = [];
    for (const raw of hunk.lines) {
        const tag = raw[0] ?? "";
        if (tag === "+") out.push(raw.slice(1));
        else if (tag === " ") out.push(raw.length <= 1 ? "" : raw.slice(1));
        // '-', '\' and empty lines are not part of the file's new side.
    }
    return out;
}

/** Parse the new-file start line (1-based) from a hunk header
 *  `@@ -a,b +c,d @@` → c. Returns null for malformed headers or c = 0
 *  (a deleted file's `+0,0` — there is no new side to anchor to). */
export function hunkNewStartLine(hunk: DiffHunk): number | null {
    const m = /^@@+\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/.exec(hunk.header);
    if (!m) return null;
    const c = Number(m[2]);
    return Number.isFinite(c) && c > 0 ? c : null;
}

/** Splice `fixedText` into `content` in place of the hunk's ADDED lines.
 *
 * The replacement block is the hunk's context lines with the fixed lines
 * taking the position of the FIRST added line (the other added lines are
 * dropped). The block is located by the hunk header's new-file start
 * line when the file still matches there, otherwise by an exact
 * line-aligned text search (drift tolerance). Returns the new file
 * content + the 1-based line the replacement starts at, or null when the
 * hunk's new side cannot be found in the file at all (drift → the caller
 * falls back to appending the fix). Pure. */
export function spliceHunkFix(
    content: string,
    hunk: DiffHunk,
    fixedText: string
): { content: string; startLine: number } | null {
    const newSide = hunkNewSideLines(hunk);
    if (newSide.length === 0) return null;
    const fixedLines = fixedText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");

    const replacement: string[] = [];
    let inserted = false;
    for (const raw of hunk.lines) {
        const tag = raw[0] ?? "";
        if (tag === "+") {
            if (!inserted) {
                replacement.push(...fixedLines);
                inserted = true;
            }
        } else if (tag === " ") {
            replacement.push(raw.length <= 1 ? "" : raw.slice(1));
        }
    }
    if (!inserted) replacement.push(...fixedLines); // pure-deletion hunk

    const hadTrailing = content.endsWith("\n");
    const fileLines = (hadTrailing ? content.slice(0, -1) : content).split("\n");
    const needle = newSide.join("\n");

    // 1) Header line anchor — where git says the new side starts.
    const anchor = hunkNewStartLine(hunk);
    if (
        anchor != null &&
        anchor >= 1 &&
        anchor - 1 + newSide.length <= fileLines.length &&
        fileLines.slice(anchor - 1, anchor - 1 + newSide.length).join("\n") === needle
    ) {
        return {
            content: rebuild(fileLines, anchor - 1, newSide.length, replacement, hadTrailing),
            startLine: anchor,
        };
    }

    // 2) Exact text search (drift — the file moved since the diff).
    for (let i = 0; i + newSide.length <= fileLines.length; i++) {
        if (fileLines.slice(i, i + newSide.length).join("\n") === needle) {
            return {
                content: rebuild(fileLines, i, newSide.length, replacement, hadTrailing),
                startLine: i + 1,
            };
        }
    }
    return null;
}

/** Rebuild the file with lines [start, start+count) replaced. */
function rebuild(
    fileLines: string[],
    start: number,
    count: number,
    replacement: string[],
    hadTrailing: boolean
): string {
    const out = [...fileLines.slice(0, start), ...replacement, ...fileLines.slice(start + count)];
    let s = out.join("\n");
    if (hadTrailing) s += "\n";
    return s;
}
