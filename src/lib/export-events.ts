/**
 * Shared contract for the "praxis:export" window event.
 *
 * The Explorer's right-click Export ▸ submenu and the navbar's
 * Tools ▸ Export menu run the SAME handlers on the page: the tree
 * dispatches this event with the right-clicked file as the explicit
 * target, and the page routes it to the very handler the navbar
 * button uses (with the file's run output, figures and notes when
 * that file is the open one).
 */

/** Every export shape the navbar's Tools ▸ Export offers. */
export type ExportFileKind =
    | "md"
    | "ipynb"
    | "html"
    | "txt"
    | "json"
    | "pdf"
    | "session"
    | "latex"
    | "rst"
    | "copy-md"
    | "github";

export interface FileExportDetail {
    kind: ExportFileKind;
    /** Folder slug owning the exported file (or, for "github", the folder to zip). */
    folder: string;
    /** File slug / relative path (unused for "github"). */
    file?: string;
    /** Display name of the file (used in report titles / toasts). */
    name?: string;
}

export const FILE_EXPORT_EVENT = "praxis:export";

/* ────────────────────────────────────────────────────────────────────
Export availability per FILE KIND.

Before this, every surface (navbar Tools ▸ Export, the Explorer's
right-click Export ▸) offered ALL eleven formats for ANY file —
exporting an.mp4 to a Jupyter notebook or a Markdown report would
run a route that reads the binary as utf-8 text and ships mojibake.
The menus now ask this helper what the right-clicked / open file's
kind can actually take:

• python — the full menu (every format makes sense).
• text-ish files — document exports (md / html / txt / json /
pdf / clipboard Markdown) + the folder-level
GitHub zip. No Jupyter notebook (the exporter
splits `# %%` cell markers — a.py concept)
and no session / LaTeX / RST code reports.
• binary & media — nothing that reads the file as text: only
(image / video / the folder-level GitHub zip (it zips the
audio / pdf / containing folder, never reads the file).
spreadsheet /
other)

"Compress to ZIP…" is separate (it is binary-safe) and stays
available for every file kind. `undefined` (no file open) keeps the
full menu so the navbar items remain reachable and their
"Nothing to export" guard still speaks for itself.
──────────────────────────────────────────────────────────────────── */

// Type-only import — this module is bundled into the client; importing
// a VALUE from the node-backed scripts lib would drag node:fs in.
import type {FileKind} from "@/lib/scripts";

/** Kinds whose bytes are text a report can embed verbatim. */
const TEXTY_FILE_KINDS: readonly FileKind[] = [
    "markdown", "text", "json", "yaml", "toml", "sql", "r", "shell",
    "html", "csv", "ipynb",
];

/** Kinds whose bytes are binary — reading them as utf-8 is mojibake.
 *  "sqlite" added — .db / .sqlite / .sqlite3 / .db3 used to
 *  fall through to the conservative document set, so right-clicking
 *  a database offered Markdown / HTML / TXT exports whose "source"
 *  was raw mojibake bytes. SQLite databases only export through the
 *  workbench (SQL / ER SVG) and the binary-safe compress / zip. */
const BINARY_FILE_KINDS: readonly FileKind[] = [
    "image", "video", "audio", "pdf", "spreadsheet", "other", "sqlite",
];

/** The export kinds that should be OFFERED for a file kind. */
export function exportCapabilitiesForKind(
    kind: FileKind | undefined
): ReadonlySet<ExportFileKind> {
    if (!kind || kind === "python") {
        return new Set<ExportFileKind>([
            "md", "ipynb", "html", "txt", "json", "pdf",
            "session", "latex", "rst", "copy-md", "github",
        ]);
    }
    if (BINARY_FILE_KINDS.includes(kind)) {
        return new Set<ExportFileKind>(["github"]);
    }
    if (TEXTY_FILE_KINDS.includes(kind)) {
        return new Set<ExportFileKind>([
            "md", "html", "txt", "json", "pdf", "copy-md", "github",
        ]);
    }
    // Unknown kind — be conservative and offer the document set.
    return new Set<ExportFileKind>(["md", "html", "txt", "json", "pdf", "copy-md", "github"]);
}
