import {NextResponse} from "next/server";
import {deslugify, listFolders} from "@/lib/scripts";

/**
 * POST /api/export/folder-ipynb
 *
 * Body: { folder, sub? }
 *   sub: optional relative subfolder path ("data/raw") — when set,
 *   only files inside that subfolder (and its deeper children) are
 *   exported, and the notebook is named after it. This powers the
 *   Explorer's subfolder right-click "Export subfolder as .ipynb".
 *
 * Combines every .py file in a folder (or subfolder) into a single
 * Jupyter notebook with cell markers. Each script becomes a section
 * of cells. Files in NESTED subfolders are read from their real path
 * (the old version joined only folder.name + file.name and crashed
 * with ENOENT whenever the folder contained subfolder files).
 *
 * Response: { ok, notebook, filename }
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
    let body: { folder?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder: folderSlug, sub} = body;
    if (!folderSlug) {
        return NextResponse.json({error: "Missing 'folder'."}, {status: 400});
    }
    const subPath = (sub ?? "").replace(/^[\/\\]+|[\/\\]+$/g, "");

    const folders = await listFolders();
    const folder = folders.find(
        (c) => c.slug === folderSlug || c.name === deslugify(folderSlug)
    );
    if (!folder) {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }

    type NbCell = {
        cell_type: "markdown" | "code";
        source: string[];
        metadata: Record<string, unknown>;
        outputs?: unknown[];
        execution_count?: number | null;
    };
    const cells: NbCell[] = [];
    // Title cell
    cells.push({
        cell_type: "markdown",
        source: [
            `# ${folder.name}${subPath ? "/" + subPath : ""}\n\nExported from Praxis on ${new Date().toISOString()}.`,
        ],
        metadata: {},
    });

    // Scope to the subfolder when one was given; otherwise the whole
    // folder. Python files become code cells; .md files become markdown
    // cells; everything else is skipped (matching the route's docs).
    const scoped = folder.files.filter((f) => {
        const isPy = /\.py$/i.test(f.name);
        const isMd = /\.md$/i.test(f.name);
        if (!isPy && !isMd) return false;
        if (!subPath) return true;
        return (f.dir ?? "") === subPath || (f.dir ?? "").startsWith(subPath + "/");
    });
    if (scoped.length === 0) {
        return NextResponse.json({
            error: subPath
                ? `No Python or Markdown files inside "${folder.name}/${subPath}".`
                : "No Python or Markdown files in this folder.",
        }, {status: 400});
    }

    for (const file of scoped) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const {getScriptsRoot} = await import("@/lib/scripts");
        const {readSourceText} = await import("@/lib/export-guard");
        const abs = path.join(
            /* turbopackIgnore: true */ getScriptsRoot(),
            folder.name,
            file.dir ?? "",
            file.name
        );
        const source = await readSourceText(/* turbopackIgnore: true */ abs, file.name);
        if (source === null) continue; // binary / unreadable — skip the file

        // Section header
        cells.push({
            cell_type: "markdown",
            source: [`## ${file.dir ? file.dir + "/" : ""}${file.name}`],
            metadata: {},
        });

        // Markdown files land as one markdown cell each.
        if (/\.md$/i.test(file.name)) {
            cells.push({
                cell_type: "markdown",
                source: source.split(/\r?\n/).map((l, i, arr) => (i < arr.length - 1 ? l + "\n" : l)),
                metadata: {},
            });
            continue;
        }

        // Split into cells by # %% markers
        const lines = source.split("\n");
        let current: string[] = [];
        let cellType: "code" | "markdown" = "code";
        const flushCell = () => {
            if (current.length === 0) return; // skip empty cells (consecutive markers)
            cells.push({
                cell_type: cellType,
                source: current.map((l, i) => (i < current.length - 1 ? l + "\n" : l)),
                metadata: {},
                ...(cellType === "code"
                    ? {outputs: [], execution_count: null}
                    : {}),
            });
            current = [];
        };
        for (const line of lines) {
            if (/^\s*#\s*%%(\s+\[markdown\])?/i.test(line)) {
                flushCell();
                cellType = /\[markdown\]/i.test(line) ? "markdown" : "code";
            } else {
                current.push(line);
            }
        }
        flushCell();
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
            language_info: {name: "python", version: "3.x"},
        },
        cells,
    };

    return NextResponse.json({
        ok: true,
        notebook,
        filename: `${folder.name}${subPath ? "-" + subPath.replace(/\//g, "-") : ""}.ipynb`,
    });
}
