import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import {resolveFigurePath, resolveScriptPath,} from "@/lib/scripts";
import {readSourceText} from "@/lib/export-guard";

/**
 * POST /api/export/ipynb
 *
 * Body: { folder, file, runId?, stdout?, stderr?, figures?, cells? }
 *   cells: optional array of { type: "code" | "markdown", source, outputs? }
 *
 * Generates a Jupyter notebook (.ipynb) from the script + its last-run
 * output. Uses the standard `# %%` cell markers (VSCode / Jupyter
 * convention) to split the script into cells. Markdown cells become
 * markdown cells in the notebook; code cells become code cells with
 * the captured stdout as their output.
 *
 * Returns the .ipynb JSON for the client to download.
 */
export const runtime = "nodejs";

interface Cell {
    cell_type: "code" | "markdown";
    source: string[];
    metadata: Record<string, unknown>;
    outputs?: unknown[];
}

function splitCells(source: string): Cell[] {
    const lines = source.split("\n");
    const cells: Cell[] = [];
    let current: string[] = [];
    let currentType: "code" | "markdown" = "code";
    let hasMarker = false;

    const flush = () => {
        if (current.length === 0 && cells.length === 0) return;
        cells.push({
            cell_type: currentType,
            source: current.map((l, i) => (i < current.length - 1 ? l + "\n" : l)),
            metadata: {},
        });
        current = [];
    };

    for (const line of lines) {
        if (/^\s*#\s*%%(\s+\[markdown\])?/i.test(line)) {
            flush();
            hasMarker = true;
            currentType = /\[markdown\]/i.test(line) ? "markdown" : "code";
        } else {
            current.push(line);
        }
    }
    flush();
    if (!hasMarker && cells.length === 0 && lines.length > 0) {
        cells.push({
            cell_type: "code",
            source: lines.map((l, i) => (i < lines.length - 1 ? l + "\n" : l)),
            metadata: {},
        });
    }
    return cells;
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        runId?: string;
        stdout?: string;
        stderr?: string;
        figures?: { url: string; name: string }[];
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
    // anyKind — non-.py sources export as a MARKDOWN cell
    // (never as a python code cell).
    const resolved = await resolveScriptPath(folder, file, {anyKind: true});
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    // Live buffer first (≤ 2 MB, mirrors the .md route): unsaved edits
    // belong in the exported notebook. Binary disk sources are refused
    // (utf-8 pipes produce mojibake cells in the notebook).
    let source: string | null = null;
    if (typeof inlineSource === "string" && inlineSource.length > 0 && inlineSource.length <= 2 * 1024 * 1024) {
        source = inlineSource;
    } else {
        source = await readSourceText(resolved.absPath, resolved.fileName);
    }
    if (source === null) {
        return NextResponse.json(
            {error: `${resolved.fileName} is a binary file — the notebook export needs a text source. Use Download instead.`},
            {status: 415}
        );
    }

    // a NON-.py file exports as a single MARKDOWN cell (its
    // raw contents) — never as fake python code cells.
    const isPython = /\.pyw?$/i.test(resolved.fileName);
    const cells: Cell[] = isPython
        ? splitCells(source)
        : [
            {
                cell_type: "markdown",
                source: source.split("\n").map((l, i, arr) =>
                    i < arr.length - 1 ? l + "\n" : l
                ),
                metadata: {},
            },
        ];
    // Attach output to the last code cell.
    // figures no longer require stdout/stderr to be
    // attached — a plot-only script (no prints) used to lose every
    // figure from the exported notebook, silently. The stream outputs
    // still only appear when they exist.
    const lastCodeCell = [...cells].reverse().find((c) => c.cell_type === "code");
    const wantsOutputs = !!(stdout?.trim() || stderr?.trim() || (figures && figures.length > 0));
    if (lastCodeCell && wantsOutputs) {
        lastCodeCell.outputs = [];
        if (stdout?.trim()) {
            lastCodeCell.outputs.push({
                output_type: "stream",
                name: "stdout",
                text: stdout.split("\n").map((l, i, arr) =>
                    i < arr.length - 1 ? l + "\n" : l
                ),
            });
        }
        if (stderr?.trim()) {
            lastCodeCell.outputs.push({
                output_type: "stream",
                name: "stderr",
                text: stderr.split("\n").map((l, i, arr) =>
                    i < arr.length - 1 ? l + "\n" : l
                ),
            });
        }
        if (figures && figures.length > 0) {
            for (const fig of figures) {
                try {
                    if (!runId) throw new Error("missing runId");
                    // Resolve the figure on disk under RUN_TMP_ROOT/<runId>/<figureName>
                    // and base64-encode the raw PNG bytes (per nbformat spec).
                    const figPath = await resolveFigurePath(runId, fig.name);
                    if (!figPath) throw new Error("figure not found");
                    const data = await fs.readFile(figPath);
                    const b64 = data.toString("base64");
                    lastCodeCell.outputs.push({
                        output_type: "display_data",
                        data: {
                            "image/png": b64,
                        },
                        metadata: {},
                    });
                } catch {
                    // Figure file not available (runId missing, file GC'd, etc.) —
                    // fall back to a plain-text reference so the notebook still opens.
                    lastCodeCell.outputs.push({
                        output_type: "display_data",
                        data: {
                            "text/plain": `[figure: ${fig.url}]`,
                        },
                        metadata: {},
                    });
                }
            }
        }
    }

    const notebook = {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {
            kernelspec: {
                display_name: "Python 3",
                language: "python",
                name: "python3",
            },
            language_info: {
                name: "python",
                version: "3.x",
                mimetype: "text/x-python",
                file_extension: ".py",
                pygments_lexer: "ipython3",
                codemirror_mode: {name: "ipython", version: 3},
            },
        },
        cells,
    };

    return NextResponse.json({
        ok: true,
        notebook,
        filename: `${resolved.fileName.replace(/\.[^.]+$/, "")}.ipynb`,
    });
}
