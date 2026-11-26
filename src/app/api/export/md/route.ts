import {NextResponse} from "next/server";
import {figureUrl, resolveScriptPath} from "@/lib/scripts";
import {readSourceText} from "@/lib/export-guard";

/**
 * POST /api/export/md
 *
 * Body: { folder, file, runId?, figures?, stdout?, stderr?, source? }
 *
 * Bundles the script's source code + (optional) last-run output + figures
 * into a single Markdown document that can be pasted into Notion / a
 * blog / a Jupyter notebook's Markdown cell.
 *
 * `source` (optional, ≤ 2 MB): the client's LIVE editor buffer — when
 * present it replaces the disk read, so unsaved edits land in the
 * exported report (same source of truth as the .txt/.json exports).
 *
 * Response: { ok, markdown }
 */
export const runtime = "nodejs";

const MAX_INLINE_SOURCE = 2 * 1024 * 1024;

export async function POST(request: Request) {
    const origin = new URL(request.url).origin;
    let body: {
        folder?: string;
        file?: string;
        runId?: string;
        stdout?: string;
        stderr?: string;
        figures?: string[]; // figure file names
        source?: string; // live editor buffer (client-supplied)
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, runId, stdout, stderr, figures, source: inlineSource} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    // anyKind — exports work for every file kind (a Markdown
    // report of a README.md / notes.txt is just as legitimate as of a .py).
    const resolved = await resolveScriptPath(folder, file, {anyKind: true});
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    // Live buffer wins (≤ 2 MB); otherwise read from disk. Binary
    // sources (sheets / parquet / images / databases…) are refused —
    // piping them through utf-8 produced a mojibake fence in the report.
    let source: string | null = null;
    if (typeof inlineSource === "string" && inlineSource.length > 0 && inlineSource.length <= MAX_INLINE_SOURCE) {
        source = inlineSource;
    } else {
        source = await readSourceText(resolved.absPath, resolved.fileName);
    }
    if (source === null) {
        return NextResponse.json(
            {error: `${resolved.fileName} is a binary file — the Markdown report needs a text source. Use Download instead.`},
            {status: 415}
        );
    }

    const parts: string[] = [];
    parts.push(`# ${resolved.fileName}\n`);
    parts.push(`> Folder: **${resolved.folderName}**\n`);
    parts.push(`> Exported: ${new Date().toISOString()}\n\n`);
    // fence language follows the file's extension (python for
    // .py, markdown for .md, …). The map grew the extensions
    // that fell to "text": .jsonl, .toml, .tsv, .sql, .r, .sh and the
    // code-extension family — the exported report now renders with the
    // right highlighting on GitHub / VS Code instead of a plain block.
    const ext = (resolved.fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
    const FENCE_LANGS: Record<string, string> = {
        ".py": "python", ".pyw": "python",
        ".md": "markdown", ".markdown": "markdown", ".mdx": "markdown",
        ".json": "json", ".jsonl": "json",
        ".csv": "csv", ".tsv": "csv",
        ".yaml": "yaml", ".yml": "yaml",
        ".toml": "toml",
        ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".env": "ini",
        ".sql": "sql",
        ".r": "r", ".rmd": "r",
        ".sh": "bash", ".bash": "bash", ".zsh": "bash",
        ".html": "html", ".htm": "html", ".xml": "xml",
        ".css": "css", ".scss": "scss", ".less": "less",
        ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "jsx",
        ".ts": "typescript", ".tsx": "tsx",
        ".ipynb": "json",
        ".java": "java", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp",
        ".m": "matlab", ".rb": "ruby", ".php": "php", ".go": "go", ".lua": "lua",
        ".pl": "perl", ".rs": "rust", ".jl": "julia", ".kt": "kotlin", ".kts": "kotlin",
        ".swift": "swift", ".ps1": "powershell", ".bat": "batch", ".cmd": "batch",
        ".zig": "zig", ".dart": "dart", ".groovy": "groovy", ".scala": "scala",
        ".exs": "elixir", ".hs": "haskell", ".erl": "erlang", ".clj": "clojure",
        ".ml": "ocaml", ".fsx": "fsharp", ".graphql": "graphql",
    };
    const fenceLang = FENCE_LANGS[ext] ?? "text";
    // Dynamic fence: a source that itself contains a triple-backtick
    // fence (any Markdown / README file) would close the block early —
    // grow the fence until it no longer occurs in the source. The SAME
    // growth applies to the stdout/stderr fences below: run output can
    // contain triple backticks too (a fixed ``` fence corrupted reports).
    const fenceRuns = source.match(/`{3,}/g);
    const fence = "`".repeat(fenceRuns ? Math.max(3, ...fenceRuns.map((f) => f.length + 1)) : 3);
    parts.push(`## Source\n\n${fence}${fenceLang}\n${source}\n${fence}\n`);

    const outputFenceRuns = `${stdout ?? ""}\n${stderr ?? ""}`.match(/`{3,}/g);
    const outputFence = "`".repeat(
        outputFenceRuns ? Math.max(3, ...outputFenceRuns.map((f) => f.length + 1)) : 3
    );
    if (stdout?.trim()) {
        parts.push(`## Output\n\n${outputFence}\n${stdout.trimEnd()}\n${outputFence}\n`);
    }
    if (stderr?.trim()) {
        parts.push(`## stderr\n\n${outputFence}\n${stderr.trimEnd()}\n${outputFence}\n`);
    }
    if (runId && figures && figures.length > 0) {
        parts.push(`## Figures\n\n`);
        for (const fig of figures) {
            // Absolute URL (via the request origin) so the markdown renders
            // correctly when pasted into Notion / a blog / a Jupyter markdown cell.
            const absUrl = `${origin}${figureUrl(runId, fig)}`;
            parts.push(`![${fig}](${absUrl})\n`);
        }
    }

    return NextResponse.json({
        ok: true,
        markdown: parts.join("\n"),
        filename: `${resolved.fileName.replace(/\.[^.]+$/, "")}.md`,
    });
}
