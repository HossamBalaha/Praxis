import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify,} from "@/lib/scripts";

/**
 * POST /api/import-ipynb
 *
 * Body: { folder, notebook: <.ipynb JSON>, fileName }
 *
 * Imports a Jupyter notebook by converting each cell to a `# %%`-marked
 * Python file and writing it to the target folder folder. Markdown
 * cells become `# %% [markdown]` blocks. The resulting .py file
 * matches the VSCode Python cell convention so it can be re-opened
 * both here and in VSCode / Jupyter.
 *
 * Response: { ok, file: "name.py", slug, path }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotebookCell {
    cell_type: "code" | "markdown" | "raw";
    source: string[] | string;
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        notebook?: { cells?: NotebookCell[] };
        fileName?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, notebook, fileName} = body;
    if (!folder || !notebook || !fileName) {
        return NextResponse.json(
            {error: "Body must include 'folder', 'notebook', and 'fileName'."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json(
            {error: "Invalid folder slug."},
            {status: 400}
        );
    }

    // Convert cells to .py text.
    //
    // Section 6,— the ipynb→py conversion fixes:
    //   - MARKDOWN cells are written as COMMENTS (`# ` per line, blank
    //     lines become `#`): the old code pushed the markdown source
    //     RAW, so `**bold**`, `- list`, `| table |` etc. landed in the
    //     .py as bare Python → SyntaxError on import round-trips. The
    //     `# %% [markdown]` + commented body matches VS Code's own
    //     cell convention (and the app's # %% parser re-reads it).
    //   - RAW cells are no longer silently DROPPED — their content rode
    //     along into nowhere (data loss for notebooks with raw cells).
    //     They export as a `# %% [raw]` block with commented lines so
    //     the text survives; the app's # %% parser treats the tag as a
    //     code cell whose body is pure comments (harmless), and a
    //     Jupyter re-import keeps the text at least in the .py.
    //   - a MISSING/undefined `source` no longer 500s the route.
    //   - the final assembly only strips TRAILING whitespace — a
    //     leading `# %%` marker can never be trimmed away.
    const lines: string[] = [];
    for (const cell of notebook.cells ?? []) {
        const rawSrc = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
        const src = typeof rawSrc === "string" ? rawSrc : "";
        if (cell.cell_type === "markdown") {
            lines.push("# %% [markdown]");
            for (const l of src.split("\n")) {
                // Comment every markdown line; an empty line becomes a bare
                // `#` so the cell body stays a comment block (VS Code's form).
                lines.push(l.trim() === "" ? "#" : `# ${l}`);
            }
            lines.push("");
        } else if (cell.cell_type === "raw") {
            lines.push("# %% [raw]");
            for (const l of src.split("\n")) {
                lines.push(l.trim() === "" ? "#" : `# ${l}`);
            }
            lines.push("");
        } else if (cell.cell_type === "code") {
            lines.push("# %%");
            for (const l of src.split("\n")) {
                lines.push(l);
            }
            lines.push("");
        }
        // unknown cell types are skipped — they have no .py representation.
    }
    const pyContent =
        lines
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/\s+$/, "") + "\n";

    // Strip the .ipynb extension and add .py if missing.
    const pyName = fileName.replace(/\.ipynb$/i, "") + (fileName.toLowerCase().endsWith(".py") ? "" : ".py");
    // Block path traversal in filename.
    if (pyName.includes("/") || pyName.includes("\\") || pyName.includes("..")) {
        return NextResponse.json(
            {error: "Invalid filename."},
            {status: 400}
        );
    }

    const folderDir = path.join(getScriptsRoot(), folderName);
    await fs.mkdir(folderDir, {recursive: true});
    const abs = path.join(folderDir, pyName);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }
    await fs.writeFile(abs, pyContent, "utf-8");

    return NextResponse.json({
        ok: true,
        file: pyName,
        slug: slugify(pyName),
        path: abs,
    });
}
