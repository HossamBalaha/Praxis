"use client";

/**
 * the notebook view, redesigned like modern IDE notebooks
 * (VS Code / JupyterLab).
 *
 * What changed vs the View:
 * ▸ MODERN CELL CHROME: the old LEFT hover icon rail is
 * GONE. Each cell is a rounded card with
 * – a slim left gutter showing the CELL INDEX (muted, tabular),
 * – a hover / focus action toolbar at the cell's top-right with
 * real 28px ghost buttons + tooltips: edit · run · run
 * above/below · move up/down · insert above/below · duplicate
 * · delete (with a confirm dialog),
 * – "insert cell" hover zones BETWEEN cells (hairline + ⊕) as
 * the primary add-cell affordance (header +Code/+Markdown
 * buttons remain),
 * – a 2px left accent bar for execution status (emerald while
 * running, red on error, transparent otherwise).
 * ▸ PERSISTENT KERNEL — cells execute through /api/console (the
 * Console kernel), so `x = 1` in one cell IS visible in the next.
 * The kernel starts lazily on the first Run, with the notebook's
 * folder as cwd, and its status shows in the toolbar
 * (idle / busy / restarting / dead + interrupt & restart buttons).
 * This also FIXES the old HTTP 404 (cells used to POST /api/run,
 * which rejects non-.py files like.ipynb).
 * ▸ Execution counters `In [n]`, per-cell outputs (stdout / stderr /
 * figures / duration), stored outputs rendered until a cell is
 * re-run.
 * ▸ Run All (sequential, kernel-based), Run Above / Run Below —
 * also per cell in the hover toolbar.
 * ▸ Jupyter command-mode keys on a focused cell — a insert above ·
 * b insert below · dd delete · j/k + arrows move focus (skipping
 * the insert zones) · Enter edits — plus per-cell output collapse
 * (chevron in the output header) and a visible focus ring.
 * ▸ Shift+Enter runs + advances (creates a trailing cell when run
 * from the last one); Ctrl/Cmd+Enter runs in place.
 * ▸ Markdown cells RENDER (react-markdown + KaTeX) instead of
 * showing raw source; code cells are syntax-highlighted.
 * ▸ Dirty tracking — the Save button is enabled only when cells
 * diverge from the file on disk.
 */
import * as React from "react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ArrowDownToLine,
    ArrowUpToLine,
    Ban,
    Braces,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    ChevronUp,
    CircleCheck,
    CircleX,
    ClipboardCopy,
    Copy,
    Eraser,
    FileCode2,
    ListPlus,
    ListTree,
    Loader2,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Save,
    SquareSlash,
    Trash2,
    Type,
    Wand2,
    X,
} from "lucide-react";
import {cn} from "@/lib/utils";
import {useTheme} from "next-themes";
import {SyntaxHighlighter} from "@/lib/highlighter";
import {oneDark, oneLight} from "react-syntax-highlighter/dist/esm/styles/prism";
import {MarkdownGithub} from "@/components/markdown-github";
import {useLazyKatexPlugin} from "@/lib/lazy-katex";
import {configuredInterpreter, formatRequestSettings, loadSettings} from "@/lib/settings";
// per-cell Auto-format / Auto-indent — code cells get the
// SAME engines as the .py editor (block re-indent + the save-time
// post passes); markdown cells get the md formatter / re-indenter.
import {getIndentSettings, reindentPython} from "@/lib/indent";
import {formatMarkdown, reindentMarkdown} from "@/lib/md-format";
import {applyFormatPostProcessors} from "@/lib/format-post";

interface NotebookCell {
    cell_type: string;
    source: string[] | string;
    outputs?: unknown[];
    metadata?: Record<string, unknown>;

    [k: string]: unknown;
}

/** Live execution state for one cell (by cell id). */
type CellRun = {
    status: "queued" | "running" | "done" | "error";
    stdout: string;
    stderr: string;
    figures: string[];
    durationMs: number | null;
};

type KernelStatus = "off" | "starting" | "idle" | "busy" | "dead";

const uid = () => Math.random().toString(36).slice(2, 10);

/* ================================================================== */
/* Section 6,— ipynb output persistence helpers */

/* ================================================================== */

/** Split text into ipynb's source-line array form — every line except
 *  the last keeps its trailing \n (the nbformat convention). */
function toIpynbLines(text: string): string[] {
    return text.split("\n").map((l, i, arr) => (i < arr.length - 1 ? l + "\n" : l));
}

/** Base64 of an ArrayBuffer, CHUNKED — String.fromCharCode with the
 *  whole buffer at once throws for multi-MB figures (spread limit). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let out = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(out);
}

/** One run figure URL → the best-fitting ipynb output object. PNG /
 *  JPEG / GIF embed as base64 display_data (self-contained file,
 *  exactly what Jupyter does); SVG embeds as text; anything else
 *  (mp4, html captures…) degrades to a text/plain reference like the
 *  export-ipynb route's fallback. Best-effort: a dead URL (session
 *  GC'd) → null (the figure is simply not persisted). */
async function figureToIpynbOutput(url: string): Promise<unknown | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        const name = decodeURIComponent(url.split("/").pop() ?? "figure");
        if (ct.startsWith("image/png") || ct.startsWith("image/jpeg") || ct.startsWith("image/gif")) {
            const mime = ct.split(";")[0].trim();
            const b64 = arrayBufferToBase64(await res.arrayBuffer());
            return {
                output_type: "display_data",
                data: {[mime]: b64},
                metadata: {"image/png": {filename: name} as Record<string, unknown>},
            };
        }
        if (ct.startsWith("image/svg+xml")) {
            const svg = await res.text();
            return {
                output_type: "display_data",
                data: {"image/svg+xml": svg},
                metadata: {},
            };
        }
        return {
            output_type: "display_data",
            data: {"text/plain": `[figure: ${name}]`},
            metadata: {},
        };
    } catch {
        return null;
    }
}

/** One cell's kernel run → the ipynb `outputs` array: stdout/stderr
 *  streams, embedded figures, and (for failed runs) an error output
 *  carrying the traceback (Jupyter marks failures as `error`, not a
 *  plain stderr stream). */
async function runToOutputs(run: CellRun): Promise<unknown[]> {
    const outputs: unknown[] = [];
    if (run.status === "error") {
        const tb = run.stderr.trim();
        const firstLine = tb.split("\n")[0] ?? "";
        outputs.push({
            output_type: "error",
            // The kernel protocol gives us the traceback TEXT only — a
            // parsed name/value is best-effort from its first line.
            ename: firstLine.split(":")[0]?.trim() || "Error",
            evalue: firstLine.includes(":") ? firstLine.slice(firstLine.indexOf(":") + 1).trim() : firstLine,
            traceback: toIpynbLines(tb),
        });
    } else {
        if (run.stdout.trim()) {
            outputs.push({output_type: "stream", name: "stdout", text: toIpynbLines(run.stdout)});
        }
        if (run.stderr.trim()) {
            // Warnings / kernel notes on an otherwise-successful run stay
            // a stderr stream (exactly what Jupyter records).
            outputs.push({output_type: "stream", name: "stderr", text: toIpynbLines(run.stderr)});
        }
    }
    for (const url of run.figures) {
        const out = await figureToIpynbOutput(url);
        if (out) outputs.push(out);
    }
    return outputs;
}

/** Parse + normalize cells into the editable model. */
function parseCells(content: string): NotebookCell[] {
    try {
        const nb = JSON.parse(content);
        return Array.isArray(nb?.cells) ? (nb.cells as NotebookCell[]) : [];
    } catch {
        return [];
    }
}

/** — format ONE cell's source (Auto-format / Auto-indent in
 *  the cell toolbar + ⌘⇧F while editing a cell).
 *  code cells      → reindentPython (block levels recomputed) + the
 *                    format-post passes (if/elif parentheses, final
 *                    newline policy) — exactly the .py editor path;
 *  markdown cells   → formatMarkdown (tables aligned, fences frozen) /
 *                    reindentMarkdown for the indent-only twin;
 *  raw cells        → untouched (their whitespace IS the content).
 *  Cells never gain a forced trailing newline (ipynb stores lines).
 *
 * CODE cells format through the REAL
 *  black pipeline — the exact /api/format in-memory path the .py
 *  editor's Format Document uses (black when installed, the built-in
 *  offline formatter otherwise, both + the format-post passes). The
 *  offline reindentPython twin stays the fallback when the request
 *  fails (offline / server hiccup), so the buttons ALWAYS do
 *  something. Async now — every caller awaits. */
function formatCellSourceOffline(cellType: string, src: string, mode: "format" | "indent"): string {
    const s = loadSettings();
    if (cellType === "code") {
        const out = reindentPython(src, getIndentSettings(s));
        if (mode === "indent") return out.replace(/\n+$/, "").replace(/\s+$/, "");
        return applyFormatPostProcessors(out.replace(/\n+$/, ""), s, "cell.py").replace(/\n+$/, "");
    }
    if (cellType === "markdown") {
        const opts = {
            indentWidth: s.formatIndentWidth || 2,
            formatTables: s.formatMarkdownTables !== false,
            finalNewline: false,
            bulletChar: s.formatMarkdownBulletChar ?? "-",
        };
        return mode === "format" ? formatMarkdown(src, opts) : reindentMarkdown(src, opts);
    }
    return src;
}

/** the BLACK-pipeline format for one CODE cell — POST
 *  /api/format with the bare `content` (the new notebook-cell mode;
 *  no folder/file needed) and run the post-processors, falling back
 *  to the offline twin on ANY failure. Markdown / raw cells use the
 *  offline path directly. */
async function formatCellSource(cellType: string, src: string, mode: "format" | "indent"): Promise<string> {
    if (cellType !== "code" || mode === "indent") {
        return formatCellSourceOffline(cellType, src, mode);
    }
    try {
        const s = loadSettings();
        const res = await fetch("/api/format", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                content: src,
                interpreter: s.pythonInterpreter || undefined,
                // the live Formatting options (quotes, blank lines,
                // line endings…) — secrets stripped.
                settings: formatRequestSettings(s),
            }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && typeof data.formatted === "string") {
            // The ROUTE ran the post passes on the same settings; this client
            // twin is belt-and-braces for older servers (idempotent).
            const out = applyFormatPostProcessors(data.formatted, s, "cell.py");
            // ipynb stores lines — no forced trailing newline.
            return out.replace(/\n+$/, "");
        }
    } catch {
        /* offline / non-JSON — the offline twin below still formats */
    }
    return formatCellSourceOffline(cellType, src, mode);
}

/** Render stored ipynb outputs (shown until a cell is re-run). */
function StoredOutputs({outputs}: { outputs: unknown[] }) {
    const parts: React.ReactNode[] = [];
    outputs.forEach((o, i) => {
        const out = o as {
            output_type?: string;
            text?: string | string[];
            name?: string;
            data?: Record<string, string | string[]>;
            ename?: string;
            evalue?: string;
            traceback?: string[];
        };
        if (!out || typeof out !== "object") return;
        if (out.output_type === "stream") {
            const text = Array.isArray(out.text) ? out.text.join("") : (out.text ?? "");
            if (text.trim())
                parts.push(
                    <pre
                        key={i}
                        className={cn(
                            "px-3 py-2 text-[11px] font-mono whitespace-pre-wrap border-t border-border",
                            out.name === "stderr" && "text-red-500"
                        )}
                    >
            {text}
          </pre>
                );
        } else if (out.output_type === "error") {
            const tb = (out.traceback ?? []).join("\n").replace(/\u001b\[[0-9;]*m/g, "");
            parts.push(
                <pre key={i}
                     className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap text-red-500 border-t border-border">
          {out.ename}: {out.evalue}
                    {tb ? `\n${tb}` : ""}
        </pre>
            );
        } else if (out.output_type === "execute_result" || out.output_type === "display_data") {
            const data = out.data ?? {};
            const plain = data["text/plain"];
            const text = Array.isArray(plain) ? plain.join("") : (plain ?? "");
            const html = data["text/html"];
            // Embedded figures base64 image/png (what our own
            // save writes and what every Jupyter produces) and inline SVG
            // render as <img> — the round-trip of a run's figure is VISIBLE,
            // not a wall of base64 text.
            const png = data["image/png"];
            const pngText = Array.isArray(png) ? png.join("") : (png ?? "");
            const svg = data["image/svg+xml"];
            const svgText = Array.isArray(svg) ? svg.join("") : (svg ?? "");
            if (pngText) {
                parts.push(
                    <img
                        key={i}
                        src={`data:image/png;base64,${pngText}`}
                        alt="Cell figure output"
                        className="max-h-80 mx-auto block border-t border-border"
                    />
                );
            } else if (svgText) {
                parts.push(
                    <img
                        key={i}
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`}
                        alt="Cell figure output"
                        className="max-h-80 mx-auto block border-t border-border"
                    />
                );
            } else if (html) {
                parts.push(
                    <div
                        key={i}
                        className="px-3 py-2 border-t border-border text-xs overflow-auto"
                        dangerouslySetInnerHTML={{__html: Array.isArray(html) ? html.join("") : html}}
                    />
                );
            } else if (text.trim()) {
                parts.push(
                    <pre key={i} className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap border-t border-border">
            {text}
          </pre>
                );
            }
        }
    });
    if (parts.length === 0) return null;
    return <div className="mt-1.5 rounded-md border border-border bg-background overflow-hidden">{parts}</div>;
}

export function NotebookView({
                                 content,
                                 folderSlug,
                                 fileSlug,
                                 onSaveEdit,
                                 onDirtyChange,
                             }: {
    content: string;
    folderSlug: string;
    fileSlug: string;
    onSaveEdit?: (
        content: string,
        identity?: { folderSlug?: string; fileSlug?: string }
    ) => Promise<void>;
    /** the notebook reports its own unsaved state
     * upward — per-cell edits used to be invisible to the page's dirty
     * guard, so switching files never asked "Save / Discard" for
     *.ipynb. */
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === "dark";
    useLazyKatexPlugin();
    // toasts for the new cell actions (copy source, …).
    const {toast} = useToast();

    const [cells, setCells] = React.useState<NotebookCell[]>(() => parseCells(content));
    const [cellIds, setCellIds] = React.useState<string[]>([]);
    // PER-CELL edit state
    // moving to edit another cell cancels the other one? all edits
    // should remain until I decide to cancel or save; don't close the
    // cell editing until I close it"): the old model held ONE edited
    // cell (editId) + ONE draft string — opening cell B necessarily
    // CLOSED cell A's editor. The redesign keeps a SET of open cell
    // editors + a per-cell draft map: every edited cell stays open with
    // its own buffer; only that cell's explicit Done / Cancel / Esc
    // (or Shift+Enter / Ctrl+Enter run) closes it. Save commits every
    // open draft, so nothing is ever lost implicitly.
    const [editIds, setEditIds] = React.useState<string[]>([]);
    const [drafts, setDrafts] = React.useState<Record<string, string>>({});
    // While the user is typing, the edit-mode Prism backdrop swaps for a
    // plain <pre> with identical metrics (re-tokenizing per keystroke is
    // a perf trap); the colors return ~160 ms after the typing pause.
    const [cellDraftHot, setCellDraftHot] = React.useState(true);
    React.useEffect(() => {
        if (editIds.length === 0) return;
        setCellDraftHot(false);
        const t = setTimeout(() => setCellDraftHot(true), 160);
        return () => clearTimeout(t);
    }, [editIds, drafts]);
    const [runs, setRuns] = React.useState<Record<string, CellRun>>({});
    const [execCounts, setExecCounts] = React.useState<Record<string, number>>({});
    const [saving, setSaving] = React.useState(false);
    const [savedNote, setSavedNote] = React.useState<string | null>(null);
    const [dirty, setDirty] = React.useState(false);
    const [kernel, setKernel] = React.useState<KernelStatus>("off");
    const [kernelNote, setKernelNote] = React.useState<string | null>(null);
    /* per-cell output collapse (Jupyter-style) + the
      * double-d timer for the DD delete shortcut. */
    const [collapsedOuts, setCollapsedOuts] = React.useState<Set<string>>(new Set());
    const ddRef = React.useRef(0);
    /* toolbar Delete asks for confirmation via this state
      * (the index of the cell pending deletion, null = closed). The dd
      * command-mode shortcut still deletes instantly, like Jupyter. */
    const [deleteTarget, setDeleteTarget] = React.useState<number | null>(null);

    const sessionIdRef = React.useRef<string | null>(null);
    const busyRef = React.useRef(false);
    /** Kernel-wide execution counter (ref: Run All increments it across
     *  awaits without stale-closure drift). */
    const counterRef = React.useRef(0);
    /** Run-all abort flag (Interrupt sets it; ref so the loop sees it). */
    const abortRef = React.useRef(false);

    // Parse on content change (file switch / external change).
    React.useEffect(() => {
        const parsed = parseCells(content);
        const ids = parsed.map(() => uid());
        setCells(parsed);
        setCellIds(ids);
        setRuns({});
        /* REHYDRATE the persisted execution_counts: the save path writes
         * each code cell's In[n] into the .ipynb, but these used to be
         * dropped on load — a reopened notebook showed blank In [ ] badges
         * and restarted numbering at 1. Seed execCounts from every code
         * cell's stored execution_count (null/undefined stay blank) and
         * park counterRef at the highest persisted count, so the next run
         * (counterRef.current += 1 in runCellById) continues the sequence
         * at max+1 instead of resetting to 1. */
        const restored: Record<string, number> = {};
        let maxExec = 0;
        parsed.forEach((c, i) => {
            const ec = (c as NotebookCell & { execution_count?: unknown }).execution_count;
            if (typeof ec === "number" && Number.isFinite(ec) && ec > 0) {
                restored[ids[i]] = ec;
                if (ec > maxExec) maxExec = ec;
            }
        });
        setExecCounts(restored);
        counterRef.current = maxExec;
        setEditIds([]);
        setDrafts({});
        setDirty(false);
    }, [content]);

    const srcOf = (c: NotebookCell): string =>
        Array.isArray(c.source) ? c.source.join("") : (c.source ?? "");

    const touch = () => setDirty(true);

    // report the unsaved state upward (drives the tab dirty
    // dot + the Save / Discard switch guard on the page).
    React.useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const setCellSource = (id: string, source: string) => {
        setCells((prev) =>
            prev.map((c, i) =>
                cellIds[i] === id
                    ? {...c, source: source.split("\n").map((l, n, arr) => (n < arr.length - 1 ? l + "\n" : l))}
                    : c
            )
        );
        touch();
    };

    /** Begin editing a cell — OPENS its editor WITHOUT touching any
     *  other cell (the whole point of the per-cell model: editing cell
     *  B must never close cell A's editor or drop its draft). The
     *  draft seeds from the cell's committed source ONLY when the cell
     *  is not already open — re-entry (double-click on an open cell)
     *  keeps the live draft. Used by every edit entry point: the Edit
     *  pencil, double-click, command-mode Enter, insertCell and the
     *  format/indent cell actions. */
    const beginEditCell = (id: string, source?: string) => {
        setEditIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setDrafts((prev) => (id in prev ? prev : {...prev, [id]: source ?? ""}));
        touch();
    };
    /** Write one cell's draft (keeps the editor open). */
    const setDraftFor = (id: string, text: string) => {
        setDrafts((prev) => ({...prev, [id]: text}));
        touch();
    };
    /** Close ONE cell's editor — commit=true keeps its draft (Done /
     * Shift+Enter / Ctrl+Enter / Save), commit=false discards it back
     * to the committed source (Cancel / Esc — the only paths that
     * ever drop an edit, both explicit user decisions). */
    const endEditCell = (id: string, commit: boolean) => {
        const d = drafts[id];
        if (commit && d !== undefined) setCellSource(id, d);
        setDrafts((prev) => {
            const next = {...prev};
            delete next[id];
            return next;
        });
        setEditIds((prev) => prev.filter((x) => x !== id));
    };
    /** Close EVERY open cell editor at once — commit=true applies all
     *  drafts ("Done all"), commit=false discards every draft back to
     *  the committed sources ("Cancel all"). The per-cell model can
     *  leave many editors open at once; this is the bulk lever that
     *  closes them all in one action (one setCells write, no per-cell
     *  cascade). */
    const endEditAllCells = (commit: boolean) => {
        if (editIds.length === 0) return;
        if (commit) {
            const openDrafts = new Map(Object.entries(drafts));
            setCells((prevCells) =>
                prevCells.map((c, i) => {
                    const id = cellIds[i];
                    const d = openDrafts.get(id);
                    if (d === undefined) return c;
                    return {
                        ...c,
                        source: d.split("\n").map((l, n, arr) => (n < arr.length - 1 ? l + "\n" : l)),
                    };
                })
            );
            if (editIds.some((id) => openDrafts.has(id))) touch();
        }
        setDrafts({});
        setEditIds([]);
    };

    // ─── Undo / redo for PROGRAMMATIC cell rewrites ────────────────
    // Auto-format / Auto-indent — and the Tab / Enter typing aids —
    // replace the draft (or the committed cell source) in one value
    // write, and a programmatic value write destroys the browser's
    // native textarea undo. A small snapshot stack serves Ctrl+Z inside
    // the cell editor ({cellId, before, selection} entries); popping
    // restores the previous source into the RIGHT target (the draft
    // while editing, the committed cell otherwise) AND the caret. Every
    // programmatic rewrite (format, indent, Tab-indent, Enter-indent)
    // pushes a snapshot first, so Ctrl+Z always has something to pop —
    // once the stack is empty the event falls through to the native
    // typing undo. A redo stack mirrors it (Ctrl+Y / Ctrl+Shift+Z).
    interface CellEditSnapshot {
        cellId: string;
        before: string;
        selStart: number;
        selEnd: number;
    }

    const cellUndoRef = React.useRef<CellEditSnapshot[]>([]);
    const cellRedoRef = React.useRef<CellEditSnapshot[]>([]);
    const cellEditorRef = React.useRef<HTMLTextAreaElement | null>(null);
    const currentCellText = (cellId: string): string => {
        if (cellId in drafts) return drafts[cellId];
        const idx = cellIds.indexOf(cellId);
        if (idx < 0) return "";
        const src = cells[idx].source;
        return Array.isArray(src) ? src.join("") : (src ?? "");
    };
    const pushCellUndo = (cellId: string, before: string) => {
        const ta = cellEditorRef.current;
        cellUndoRef.current.push({
            cellId,
            before,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        if (cellUndoRef.current.length > 40) cellUndoRef.current.shift();
        // A fresh edit invalidates the redo chain.
        cellRedoRef.current = [];
    };
    const applyCellSnapshot = (snap: CellEditSnapshot) => {
        if (snap.cellId in drafts) {
            setDraftFor(snap.cellId, snap.before);
        } else {
            setCellSource(snap.cellId, snap.before);
        }
        if (snap.cellId in drafts) {
            requestAnimationFrame(() => {
                const ta = cellEditorRef.current;
                if (ta) ta.setSelectionRange(snap.selStart, snap.selEnd);
            });
        }
    };
    const popCellUndo = (): boolean => {
        const snap = cellUndoRef.current.pop();
        if (!snap) return false;
        const ta = cellEditorRef.current;
        cellRedoRef.current.push({
            cellId: snap.cellId,
            before: currentCellText(snap.cellId),
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        applyCellSnapshot(snap);
        return true;
    };
    const popCellRedo = (): boolean => {
        const snap = cellRedoRef.current.pop();
        if (!snap) return false;
        const ta = cellEditorRef.current;
        cellUndoRef.current.push({
            cellId: snap.cellId,
            before: currentCellText(snap.cellId),
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        applyCellSnapshot(snap);
        return true;
    };

    // ── Kernel management ────────────────────────────────────────────

    const ensureKernel = React.useCallback(
        async (restart: boolean): Promise<string | null> => {
            try {
                const res = await fetch("/api/console", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        action: restart ? "restart" : "start",
                        id: sessionIdRef.current ?? undefined,
                        folder: folderSlug,
                        interpreter: configuredInterpreter(),
                    }),
                });
                const data = (await res.json()) as { ok: boolean; id?: string; error?: string };
                if (!data.ok || !data.id) {
                    setKernel("dead");
                    setKernelNote(data.error ?? "Kernel could not be started.");
                    return null;
                }
                sessionIdRef.current = data.id;
                setKernel("idle");
                setKernelNote(null);
                return data.id;
            } catch (err) {
                setKernel("dead");
                setKernelNote((err as Error).message);
                return null;
            }
        },
        [folderSlug]
    );

    const interruptKernel = async () => {
        const sid = sessionIdRef.current;
        if (!sid) return;
        abortRef.current = true;
        try {
            await fetch("/api/console", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "interrupt", id: sid}),
            });
        } catch {
            /* ignore */
        }
    };

    // ── Cell execution (persistent kernel, one at a time) ────────────

    const execInKernel = React.useCallback(
        async (id: string, code: string): Promise<CellRun> => {
            let sid = sessionIdRef.current;
            if (!sid || kernel === "dead") {
                sid = await ensureKernel(true);
                if (!sid) {
                    return {
                        status: "error",
                        stdout: "",
                        stderr: "The kernel could not be started.",
                        figures: [],
                        durationMs: null
                    };
                }
            }
            const started = performance.now();
            const run: CellRun = {status: "running", stdout: "", stderr: "", figures: [], durationMs: null};
            setRuns((prev) => ({...prev, [id]: {...run}}));
            try {
                const res = await fetch("/api/console", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "exec", id: sid, code, mode: "eval"}),
                });
                if (!res.ok || !res.body) {
                    const data = (await res.json().catch(() => null)) as { error?: string; dead?: boolean } | null;
                    if (data?.dead) {
                        sessionIdRef.current = null;
                        setKernel("dead");
                    }
                    return {
                        status: "error",
                        stdout: "",
                        stderr: data?.error ?? `HTTP ${res.status}`,
                        figures: [],
                        durationMs: Math.round(performance.now() - started),
                    };
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let stdout = "";
                let stderr = "";
                const figures: string[] = [];
                let ok: boolean | null = null;
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() ?? "";
                    for (const part of parts) {
                        for (const line of part.split("\n")) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const evt = JSON.parse(line.slice(6));
                                if (evt.type === "stdout") stdout += evt.text ?? "";
                                else if (evt.type === "stderr") stderr += evt.text ?? "";
                                else if (evt.type === "figure" && evt.url) figures.push(evt.url as string);
                                else if (evt.type === "end") {
                                    ok = !!evt.ok;
                                    if (evt.error) stderr += `\n${evt.error}`;
                                    if (evt.died) {
                                        sessionIdRef.current = null;
                                        setKernel("dead");
                                    }
                                }
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                    setRuns((prev) => ({
                        ...prev,
                        [id]: {status: "running", stdout, stderr, figures: [...figures], durationMs: null},
                    }));
                }
                setKernel(sessionIdRef.current ? "idle" : "dead");
                return {
                    status: ok === false ? "error" : "done",
                    stdout,
                    stderr,
                    figures,
                    durationMs: Math.round(performance.now() - started),
                };
            } catch (err) {
                setKernel(sessionIdRef.current ? "idle" : "dead");
                return {
                    status: "error",
                    stdout: "",
                    stderr: (err as Error).message,
                    figures: [],
                    durationMs: Math.round(performance.now() - started),
                };
            }
        },
        [ensureKernel, kernel]
    );

    const runCellById = React.useCallback(
        async (id: string) => {
            const idx = cellIds.indexOf(id);
            const cell = cells[idx];
            if (!cell || cell.cell_type !== "code") return;
            // The OPEN DRAFT wins when the cell is being edited (Jupyter
            // semantics: Run executes what the editor shows — the per-cell
            // model keeps the editor open, so its buffer is the truth).
            const source = id in drafts ? drafts[id] : srcOf(cell);
            if (!source.trim()) return;
            if (busyRef.current) return; // kernel runs one submission at a time
            busyRef.current = true;
            setKernel("busy");
            counterRef.current += 1;
            const n = counterRef.current;
            setExecCounts((prev) => ({...prev, [id]: n}));
            const result = await execInKernel(id, source);
            setRuns((prev) => ({...prev, [id]: result}));
            //
            // for notebooks): a completed run leaves OUTPUTS that exist only
            // in this component — the .ipynb on disk still has the old
            // ones. Jupyter marks the notebook dirty on run for exactly
            // this reason; the switch guard now sees it too.
            touch();
            busyRef.current = false;
        },
        [cellIds, cells, drafts, execInKernel]
    );

    /** the cell-type union grew a THIRD member — `raw`
     * (Jupyter's raw NBConvert cells: verbatim content, not run, not
     * rendered as markdown — the "more options of cells"). */
    const insertCell = (afterIdx: number, type: "code" | "markdown" | "raw") => {
        const id = uid();
        const cell: NotebookCell = {cell_type: type, source: "", metadata: {}, outputs: []};
        setCells((prev) => {
            const next = [...prev];
            next.splice(afterIdx + 1, 0, cell);
            return next;
        });
        setCellIds((prev) => {
            const next = [...prev];
            next.splice(afterIdx + 1, 0, id);
            return next;
        });
        touch();
        // Enter edit mode on the new cell — the draft of the cell the
        // user is leaving is COMMITTED first (beginEditCell), never
        // silently dropped.
        beginEditCell(id, "");
    };

    const deleteCell = (idx: number) => {
        const id = cellIds[idx];
        setCells((prev) => prev.filter((_, i) => i !== idx));
        setCellIds((prev) => prev.filter((x) => x !== id));
        setRuns((prev) => {
            const n = {...prev};
            delete n[id];
            return n;
        });
        if (editIds.includes(id)) {
            setEditIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const n = {...prev};
                delete n[id];
                return n;
            });
        }
        touch();
    };

    const moveCell = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= cells.length) return;
        const swap = <T, >(arr: T[]): T[] => {
            const n = [...arr];
            const tmp = n[idx];
            n[idx] = n[target];
            n[target] = tmp;
            return n;
        };
        setCells(swap);
        setCellIds(swap);
        touch();
    };

    /** copy a cell (source/outputs/metadata) right below itself. */
    const duplicateCell = (idx: number) => {
        const cell = cells[idx];
        if (!cell) return;
        const newId = uid();
        const clone: NotebookCell = {
            ...cell,
            source: Array.isArray(cell.source) ? [...cell.source] : cell.source,
            outputs: Array.isArray(cell.outputs) ? [...cell.outputs] : cell.outputs,
            metadata: cell.metadata ? {...cell.metadata} : {},
        };
        setCells((prev) => {
            const next = [...prev];
            next.splice(idx + 1, 0, clone);
            return next;
        });
        setCellIds((prev) => {
            const next = [...prev];
            next.splice(idx + 1, 0, newId);
            return next;
        });
        touch();
    };

    /** cycle code → markdown → raw → code (the type chip
     *  still cycles with ONE click). */
    const toggleCellType = (idx: number) => {
        setCells((prev) =>
            prev.map((c, i) => {
                if (i !== idx) return c;
                const next =
                    c.cell_type === "code" ? "markdown" : c.cell_type === "markdown" ? "raw" : "code";
                return {...c, cell_type: next, outputs: []};
            })
        );
        touch();
    };

    /** move a cell to the very top / bottom of the notebook. */
    const moveCellToEnd = (idx: number, to: "top" | "bottom") => {
        if (to === "top" && idx === 0) return;
        if (to === "bottom" && idx === cells.length - 1) return;
        setCells((prev) => {
            const next = [...prev];
            const [cell] = next.splice(idx, 1);
            next.splice(to === "top" ? 0 : next.length, 0, cell);
            return next;
        });
        setCellIds((prev) => {
            const next = [...prev];
            const [id] = next.splice(idx, 1);
            next.splice(to === "top" ? 0 : next.length, 0, id);
            return next;
        });
        touch();
    };

    /** clear this cell's outputs (kernel run AND any stored
     *  outputs imported from the .ipynb). */
    const clearCellOutputs = (idx: number) => {
        const id = cellIds[idx];
        setCells((prev) => prev.map((c, i) => (i === idx ? {...c, outputs: []} : c)));
        if (id) {
            setRuns((prev) => {
                const n = {...prev};
                delete n[id];
                return n;
            });
            setExecCounts((prev) => {
                const n = {...prev};
                delete n[id];
                return n;
            });
        }
        touch();
    };

    const runAll = async (fromIdx = 0, uptoIdx = cells.length - 1) => {
        abortRef.current = false;
        for (let i = fromIdx; i <= uptoIdx && i < cells.length; i++) {
            if (abortRef.current) break;
            if (cells[i].cell_type !== "code") continue;
            const id = cellIds[i];
            if (!srcOf(cells[i]).trim()) continue;
            await runCellById(id);
        }
    };

    const save = async () => {
        if (!onSaveEdit) return;
        setSaving(true);
        try {
            // SAVE COMMITS EVERY OPEN CELL DRAFT (the per-cell edit model:
            // open editors are the live work — "all edits should
            // remain until I decide to cancel or save" — so Save folds
            // each open draft into its cell BEFORE the .ipynb is built;
            // only an explicit per-cell Cancel ever discards).
            const withDrafts = cells.map((c, i) => {
                const cid = cellIds[i];
                if (cid && cid in drafts) return {...c, source: drafts[cid]};
                return c;
            });
            //
            // cells does not work as py files"): SAVE-TIME parity with the
            // .py editor — `autoFormatOnSave` now runs the REAL black
            // pipeline over every CODE cell before the .ipynb is written
            // (exactly what handleSaveEdit does for a .py buffer), and the
            // offline formatter covers MARKDOWN cells when
            // `formatAutoSaveAll` is on (the non-Python auto-save toggle).
            // Per-cell Ctrl+Z snapshots are NOT pushed — this is a save-time
            // normalize, and the .py path does not undo-format saves either.
            let cellsToWrite = withDrafts;
            try {
                const s = loadSettings();
                const wantsCodeFmt = s.autoFormatOnSave === true;
                const wantsMdFmt = s.formatAutoSaveAll === true;
                if (wantsCodeFmt || wantsMdFmt) {
                    // maps over withDrafts, not `cells` — the old map
                    // silently DROPPED every open cell draft whenever
                    // auto-format-on-save was enabled (save folded the drafts
                    // into withDrafts first, then the formatter re-read the
                    // pre-draft `cells`).
                    cellsToWrite = await Promise.all(
                        withDrafts.map(async (c) => {
                            const src = srcOf(c);
                            if (c.cell_type === "code" && wantsCodeFmt && src.trim()) {
                                const out = await formatCellSource("code", src, "format");
                                return {...c, source: out.replace(/\n+$/, "")};
                            }
                            if (c.cell_type === "markdown" && wantsMdFmt && src.trim()) {
                                const out = formatCellSourceOffline("markdown", src, "format");
                                return {...c, source: out.replace(/\n+$/, "")};
                            }
                            return c;
                        })
                    );
                }
            } catch {
                /* offline / non-JSON — save the cells as they are */
            }
            // ── Section 6,— persist RUN OUTPUTS + execution_count:
            // the .ipynb on disk gets what the kernel actually produced
            // (stdout/stderr streams, figures EMBEDDED as display_data,
            // failed runs as error outputs) plus the In[n] counter, so a
            // closed-and-reopened notebook shows its outputs and In[]s
            // exactly like Jupyter. Cells without a fresh run keep the
            // outputs/counter the file already carried.
            const cellsWithOutputs = await Promise.all(
                cellsToWrite.map(async (c, i) => {
                    if (c.cell_type !== "code") {
                        // markdown/raw cells carry neither outputs nor counters.
                        const rest: Record<string, unknown> = {...c};
                        delete rest.outputs;
                        delete rest.execution_count;
                        return rest;
                    }
                    const id = cellIds[i];
                    const run = id ? runs[id] : undefined;
                    const exec = id ? execCounts[id] : undefined;
                    const prevCount = (c as NotebookCell & { execution_count?: unknown }).execution_count;
                    const outputs =
                        run && (run.status === "done" || run.status === "error")
                            ? await runToOutputs(run)
                            : Array.isArray(c.outputs)
                                ? c.outputs
                                : [];
                    return {
                        ...c,
                        execution_count:
                            typeof exec === "number"
                                ? exec
                                : typeof prevCount === "number"
                                    ? prevCount
                                    : null,
                        outputs,
                    };
                })
            );
            const nb = {...JSON.parse(content), cells: cellsWithOutputs};
            await onSaveEdit(JSON.stringify(nb, null, 2) + "\n", {folderSlug, fileSlug});
            setDirty(false);
            setSavedNote("saved");
            setTimeout(() => setSavedNote(null), 1800);
        } finally {
            setSaving(false);
        }
    };

    // external save bridge — the page's dirty-switch guard
    // asks the open viewer to flush (praxis:file-viewer-save), the
    // FileViewer forwards it here as praxis:notebook-save, and we
    // answer with praxis:notebook-saved once the cells are written.
    React.useEffect(() => {
        if (!onSaveEdit) return;
        const onSaveRequest = () => {
            void (async () => {
                try {
                    if (dirty) {
                        await save();
                    }
                } finally {
                    window.dispatchEvent(new Event("praxis:notebook-saved"));
                }
            })();
        };
        window.addEventListener("praxis:notebook-save", onSaveRequest);
        return () => window.removeEventListener("praxis:notebook-save", onSaveRequest);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSaveEdit, dirty, content, cells, folderSlug, fileSlug]);

    const kernelDot =
        kernel === "busy"
            ? "bg-amber-500 animate-pulse"
            : kernel === "idle"
                ? "bg-emerald-500"
                : kernel === "starting"
                    ? "bg-sky-500 animate-pulse"
                    : kernel === "dead"
                        ? "bg-red-500"
                        : "bg-muted-foreground/40";
    const kernelLabel =
        kernel === "off"
            ? "Kernel: not started"
            : kernel === "starting"
                ? "Kernel: starting…"
                : kernel === "idle"
                    ? "Kernel: idle"
                    : kernel === "busy"
                        ? "Kernel: busy"
                        : "Kernel: dead";

    const codeCells = cells.filter((c) => c.cell_type === "code").length;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30 sticky top-0 z-10">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
              title="The notebook kernel is a persistent Python process — cells share state until you restart it">
          <span className={cn("size-2 rounded-full", kernelDot)}/>
            {kernelLabel}
        </span>
                <span className="text-[10px] text-muted-foreground/70">
          {cells.length} cells ({codeCells} code)
        </span>

                <span className="flex-1"/>

                {kernelNote && (
                    <span className="text-[10px] text-red-500 truncate max-w-40" title={kernelNote}>
            {kernelNote}
          </span>
                )}
                {savedNote && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{savedNote}</span>}
                {dirty && !savedNote &&
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">unsaved changes</span>}

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void runAll()}
                    title="Run every code cell top-to-bottom (Shift+Enter pace, one kernel)"
                >
                    <ListPlus className="size-3.5"/> Run all
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                        setKernel("starting");
                        void ensureKernel(true).then(() => {
                            setExecCounts({});
                            counterRef.current = 0;
                        });
                    }}
                    title="Restart the kernel — all variables are lost, execution counters reset"
                >
                    <RefreshCw className="size-3.5"/> Restart
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void interruptKernel()}
                    disabled={kernel !== "busy"}
                    title="Interrupt the running cell (Ctrl+C to the kernel)"
                >
                    <Ban className="size-3.5"/> Interrupt
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => insertCell(cells.length - 1, "code")}
                    title="Append a new code cell"
                >
                    <Braces className="size-3.5"/> + Code
                </Button>
                {/* "keep the main important directly in
            front and secondary ones in menus" — the + Markdown / + Raw
            appends moved into this dropdown instead of stacking three
            buttons in the toolbar. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            title="Append a different cell type — markdown or raw (verbatim, an nbconvert target)"
                        >
                            <ChevronDown className="size-3.5"/> More
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Append a cell</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => insertCell(cells.length - 1, "markdown")}
                                          className="gap-2 cursor-pointer">
                            <Type className="size-3.5"/> Markdown cell
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => insertCell(cells.length - 1, "raw")}
                                          className="gap-2 cursor-pointer">
                            <FileCode2 className="size-3.5"/> Raw cell
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {editIds.length > 0 && (
                    /* "cancel all / done all" — the bulk levers for the per-cell
                       edit model: every open editor closes in one click, applying
                       or discarding ALL drafts at once. */
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => endEditAllCells(true)}
                            title="Apply EVERY open cell edit at once and close all editors (each cell's Done in one click)"
                        >
                            <CircleCheck className="size-3.5"/> Done all ({editIds.length})
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => endEditAllCells(false)}
                            title="Discard EVERY open cell edit at once and close all editors"
                        >
                            <X className="size-3.5"/> Cancel all
                        </Button>
                    </>
                )}
                {onSaveEdit && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => void save()}
                        disabled={saving || !dirty}
                        title={dirty ? "Write the edited cells back to the .ipynb file" : "No changes to save"}
                    >
                        {saving ? <Loader2 className="size-3 animate-spin"/> : <Save className="size-3"/>}
                        Save notebook
                    </Button>
                )}
            </div>

            {/* ── Cells ───────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {cells.length === 0 && (
                    <div className="py-12 text-center space-y-3">
                        <p className="text-xs text-muted-foreground">
                            This notebook has no cells (or its JSON could not be parsed).
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                                    onClick={() => insertCell(-1, "code")}>
                                <Braces className="size-3.5"/> Add a code cell
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                                    onClick={() => insertCell(-1, "markdown")}>
                                <Type className="size-3.5"/> Add a markdown cell
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                                    onClick={() => insertCell(-1, "raw")}>
                                <FileCode2 className="size-3.5"/> Add a raw cell
                            </Button>
                        </div>
                    </div>
                )}

                <div className="px-2 py-2 sm:px-4 sm:py-3">
                    {cells.map((cell, i) => {
                        const id = cellIds[i];
                        const source = srcOf(cell);
                        const run = id ? runs[id] : undefined;
                        const execN = id ? execCounts[id] : undefined;
                        const isCode = cell.cell_type === "code";
                        const editing = editIds.includes(id);
                        // per-cell draft — a LOCAL read of the open buffer so the whole
                        // body below reads `draft` naturally (each open cell carries
                        // its OWN buffer; switching cells never rewrites it).
                        const draft = drafts[id] ?? "";
                        return (
                            <React.Fragment key={id ?? i}>
                                {/* Insert zone above this cell — hairline + ⊕ on hover */}
                                <InsertZone label={`Insert a code cell above cell ${i + 1}`}
                                            onInsert={() => insertCell(i - 1, "code")}/>

                                {/* ── Cell card ─────────────────────────────────────── */}
                                <div
                                    data-cell="true"
                                    className={cn(
                                        "group relative flex rounded-lg border border-border/70 bg-card outline-none transition-colors",
                                        "hover:border-border focus-within:border-ring/60",
                                        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                                    )}
                                    tabIndex={0}
                                    onDoubleClick={(e) => {
                                        if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
                                        beginEditCell(id, source);
                                    }}
                                    onKeyDown={(e) => {
                                        /* Jupyter COMMAND-MODE shortcuts — active
                                                            * when the cell itself (not a textarea / button inside
                                                            * it) has focus: a insert above · b insert below · dd
                                                            * delete · j / ↓ and k / ↑ move focus (skipping the
                                                            * insert zones) · Enter edits. */
                                        if (editing) return;
                                        const t = e.target as HTMLElement;
                                        if (t.closest("textarea, button, input, a, select")) return;
                                        const k = e.key.toLowerCase();
                                        if (k === "a") {
                                            e.preventDefault();
                                            insertCell(i - 1, "code");
                                        } else if (k === "b") {
                                            e.preventDefault();
                                            insertCell(i, "code");
                                        } else if (k === "d") {
                                            const now = Date.now();
                                            if (now - ddRef.current < 400) {
                                                e.preventDefault();
                                                ddRef.current = 0;
                                                deleteCell(i);
                                            } else {
                                                ddRef.current = now;
                                            }
                                        } else if (k === "j" || e.key === "ArrowDown") {
                                            e.preventDefault();
                                            focusCellSibling(e.currentTarget, 1);
                                        } else if (k === "k" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            focusCellSibling(e.currentTarget, -1);
                                        } else if (e.key === "Enter") {
                                            e.preventDefault();
                                            beginEditCell(id, source);
                                        }
                                    }}
                                >
                                    {/* Execution-status accent bar (2px left edge) */}
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "absolute inset-y-0 left-0 w-0.5 rounded-l-lg",
                                            run?.status === "running"
                                                ? "bg-emerald-500 animate-pulse"
                                                : run?.status === "error"
                                                    ? "bg-red-500"
                                                    : "bg-transparent"
                                        )}
                                    />

                                    {/* Cell-index gutter (replaces the old icon-rail column) */}
                                    <div
                                        className="hidden sm:flex w-10 shrink-0 select-none items-start justify-center border-r border-border/40 pt-3 text-[10px] font-mono tabular-nums text-muted-foreground/60"
                                        title={`Cell ${i + 1} of ${cells.length}`}
                                    >
                                        {i + 1}
                                    </div>

                                    {/* Cell body */}
                                    <div className="min-w-0 flex-1 px-3 py-2.5">
                                        {/* Header row: In [n] · type chip · hover/focus action toolbar */}
                                        <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-1.5">
                                            {isCode ? (
                                                <span
                                                    className="text-[10px] font-mono tabular-nums text-orange-500 shrink-0"
                                                    title="Execution counter (kernel-wide)">
                          In [{execN ?? " "}]
                        </span>
                                            ) : (
                                                <Badge/>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => toggleCellType(i)}
                                                className={cn(
                                                    "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
                                                    isCode
                                                        ? "text-orange-600 dark:text-orange-400 bg-orange-500/10"
                                                        : cell.cell_type === "raw"
                                                            ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
                                                            : "text-sky-600 dark:text-sky-400 bg-sky-500/10"
                                                )}
                                                title={`Cycle this cell's type: code → markdown → raw (currently ${isCode ? "code" : cell.cell_type === "raw" ? "raw" : "markdown"})`}
                                            >
                                                {isCode ? "code" : cell.cell_type === "raw" ? "raw" : "markdown"}
                                            </button>
                                            <span className="flex-1"/>

                                            {/* Hover / focus action toolbar ( — replaces the old left icon rail) */}
                                            <div
                                                className={cn(
                                                    "flex flex-wrap items-center gap-0.5 rounded-md border border-border/60 bg-background/95 p-0.5 shadow-xs backdrop-blur-sm",
                                                    "pointer-events-none opacity-0 transition-opacity duration-150",
                                                    "group-hover:pointer-events-auto group-hover:opacity-100",
                                                    "group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                                                )}
                                            >
                                                {!editing && (
                                                    <CellAction
                                                        label="Edit this cell (or double-click / Enter)"
                                                        onClick={() => {
                                                            beginEditCell(id, source);
                                                        }}
                                                    >
                                                        <Pencil className="size-3.5"/>
                                                    </CellAction>
                                                )}
                                                {isCode && (
                                                    <CellAction
                                                        label="Run cell (Ctrl+↵ — Shift+↵ runs and advances)"
                                                        onClick={() => void runCellById(id)}
                                                        disabled={run?.status === "running"}
                                                    >
                                                        {run?.status === "running" ? (
                                                            <Loader2 className="size-3.5 animate-spin"/>
                                                        ) : (
                                                            <Play className="size-3.5"/>
                                                        )}
                                                    </CellAction>
                                                )}
                                                {/* Both live
in the per-cell hover toolbar — format works
on the DRAFT while editing, on the cell's
source otherwise (raw cells stay verbatim). */}
                                                {(isCode || cell.cell_type === "markdown") && (
                                                    <>
                                                        <CellAction
                                                            label="Auto-format this cell (code cells: the REAL black pipeline — the exact path .py files format through · markdown: tables + spacing) — switches to the editor with the formatted text; Ctrl+Z undoes"
                                                            onClick={() => {
                                                                if (editing) {
                                                                    pushCellUndo(id, draft);
                                                                    void formatCellSource(cell.cell_type, draft, "format").then((out) =>
                                                                        setDraftFor(id, out)
                                                                    );
                                                                    return;
                                                                }
                                                                void formatCellSource(cell.cell_type, source, "format").then((out) => {
                                                                    if (out === source) {
                                                                        toast({
                                                                            title: "Cell already formatted",
                                                                            description: `Cell ${i + 1} needs no changes.`
                                                                        });
                                                                        return;
                                                                    }
                                                                    // Switch to the EDITOR with the formatted
                                                                    // text (undoable snapshot first) — the
                                                                    // click never rewrites the committed cell
                                                                    // silently; Done/Discard decides.
                                                                    pushCellUndo(id, source);
                                                                    beginEditCell(id, out);
                                                                    toast({
                                                                        title: "Formatted in the editor — Ctrl+Z undoes",
                                                                        description: "Done keeps the formatted cell, Cancel discards it; Save notebook writes to disk.",
                                                                    });
                                                                });
                                                            }}
                                                        >
                                                            <Wand2 className="size-3.5"/>
                                                        </CellAction>
                                                        <CellAction
                                                            label="Auto-indent this cell only (re-indents to the configured indentation — content untouched); switches to the editor; Ctrl+Z undoes"
                                                            onClick={() => {
                                                                if (editing) {
                                                                    pushCellUndo(id, draft);
                                                                    const out = formatCellSourceOffline(cell.cell_type, draft, "indent");
                                                                    setDraftFor(id, out);
                                                                    return;
                                                                }
                                                                const out = formatCellSourceOffline(cell.cell_type, source, "indent");
                                                                if (out === source) {
                                                                    toast({
                                                                        title: "Cell already indented",
                                                                        description: `Cell ${i + 1} needs no changes.`
                                                                    });
                                                                    return;
                                                                }
                                                                pushCellUndo(id, source);
                                                                beginEditCell(id, out);
                                                                toast({
                                                                    title: "Re-indented in the editor — Ctrl+Z undoes",
                                                                    description: "Done keeps the re-indented cell, Cancel discards it; Save notebook writes to disk.",
                                                                });
                                                            }}
                                                        >
                                                            <ListTree className="size-3.5"/>
                                                        </CellAction>
                                                    </>
                                                )}
                                                <ToolbarDivider/>
                                                <CellAction label="Move cell up" onClick={() => moveCell(i, -1)}
                                                            disabled={i === 0}>
                                                    <ChevronUp className="size-3.5"/>
                                                </CellAction>
                                                <CellAction label="Move cell down" onClick={() => moveCell(i, 1)}
                                                            disabled={i === cells.length - 1}>
                                                    <ChevronDown className="size-3.5"/>
                                                </CellAction>
                                                <CellAction label="Delete cell (asks for confirmation)" danger
                                                            onClick={() => setDeleteTarget(i)}>
                                                    <Trash2 className="size-3.5"/>
                                                </CellAction>
                                                {/* "keep the main important
directly in front of the user and secondary
ones in menus/dropdowns" — run-above/below,
move-to-edges, the six insert twins, copy /
clear / duplicate now live in this ⋯ menu
instead of a 16-button strip. */}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            type="button"
                                                            aria-label={`More cell ${i + 1} actions`}
                                                            title="Secondary actions — run above/below, move to edge, insert any cell type, copy / clear / duplicate"
                                                            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                                        >
                                                            <MoreHorizontal className="size-3.5"/>
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-60">
                                                        {/* The secondary actions grouped into SUBMENUS
                                (Run ▸ / Move ▸ / Insert ▸ / Cell ▸) — the
                                old flat label-sectioned list read as one
                                long menu. */}
                                                        {isCode && (
                                                            <DropdownMenuSub>
                                                                <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                                        title="Run the cells above or below this one">
                                                                    <ArrowDownToLine className="size-3.5"/>
                                                                    <span className="flex-1">Run</span>
                                                                </DropdownMenuSubTrigger>
                                                                <DropdownMenuSubContent className="w-52">
                                                                    <DropdownMenuItem
                                                                        onClick={() => void runAll(0, i - 1)}
                                                                        disabled={i === 0}
                                                                        className="gap-2 cursor-pointer">
                                                                        <ArrowUpToLine className="size-3.5"/> Run all
                                                                        above
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        onClick={() => void runAll(i, cells.length - 1)}
                                                                        className="gap-2 cursor-pointer">
                                                                        <ArrowDownToLine className="size-3.5"/> Run
                                                                        this &amp; below
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuSub>
                                                        )}
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                                    title="Move this cell to the top or bottom of the notebook">
                                                                <ChevronsUp className="size-3.5"/>
                                                                <span className="flex-1">Move</span>
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent className="w-52">
                                                                <DropdownMenuItem
                                                                    onClick={() => moveCellToEnd(i, "top")}
                                                                    disabled={i === 0} className="gap-2 cursor-pointer">
                                                                    <ChevronsUp className="size-3.5"/> Move to top
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => moveCellToEnd(i, "bottom")}
                                                                    disabled={i === cells.length - 1}
                                                                    className="gap-2 cursor-pointer">
                                                                    <ChevronsDown className="size-3.5"/> Move to bottom
                                                                </DropdownMenuItem>
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                                    title="Insert a new cell above or below this one">
                                                                <Plus className="size-3.5"/>
                                                                <span className="flex-1">Insert</span>
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent className="w-56">
                                                                <DropdownMenuItem
                                                                    onClick={() => insertCell(i - 1, "code")}
                                                                    className="gap-2 cursor-pointer">
                                                                    <Plus className="size-3.5"/> Code cell above
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => insertCell(i, "code")}
                                                                                  className="gap-2 cursor-pointer">
                                                                    <Plus className="size-3.5"/> Code cell below
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => insertCell(i - 1, "markdown")}
                                                                    className="gap-2 cursor-pointer">
                                                                    <Type className="size-3.5"/> Markdown above
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => insertCell(i, "markdown")}
                                                                    className="gap-2 cursor-pointer">
                                                                    <Type className="size-3.5"/> Markdown below
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => insertCell(i - 1, "raw")}
                                                                    className="gap-2 cursor-pointer">
                                                                    <FileCode2 className="size-3.5"/> Raw above
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => insertCell(i, "raw")}
                                                                                  className="gap-2 cursor-pointer">
                                                                    <FileCode2 className="size-3.5"/> Raw below
                                                                </DropdownMenuItem>
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                                                    title="Duplicate, copy or clear this cell">
                                                                <Copy className="size-3.5"/>
                                                                <span className="flex-1">Cell</span>
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent className="w-56">
                                                                <DropdownMenuItem onClick={() => duplicateCell(i)}
                                                                                  className="gap-2 cursor-pointer">
                                                                    <Copy className="size-3.5"/> Duplicate
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        void navigator.clipboard?.writeText(source).then(() => {
                                                                            toast({
                                                                                title: "Cell source copied",
                                                                                description: `${source.length.toLocaleString()} characters`
                                                                            });
                                                                        });
                                                                    }}
                                                                    className="gap-2 cursor-pointer"
                                                                >
                                                                    <ClipboardCopy className="size-3.5"/> Copy source
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => clearCellOutputs(i)}
                                                                    disabled={!run && !(Array.isArray(cell.outputs) && cell.outputs.length > 0)}
                                                                    className="gap-2 cursor-pointer"
                                                                >
                                                                    <Eraser className="size-3.5"/> Clear outputs
                                                                </DropdownMenuItem>
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>

                                        {/* Edit-mode action bar (Done / Cancel + key hints) */}
                                        {editing && (
                                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-[11px] gap-1"
                                                    onClick={() => {
                                                        endEditCell(id, true);
                                                    }}
                                                    title="Apply this cell's edit (remember to Save notebook)"
                                                >
                                                    <CircleCheck className="size-3.5"/> Done
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-[11px] gap-1"
                                                    onClick={() => endEditCell(id, false)}
                                                    title="Discard this cell's edit"
                                                >
                                                    <X className="size-3.5"/> Cancel
                                                </Button>
                                                <span className="text-[10px] text-muted-foreground/70">
                          Shift+Enter runs + advances · Ctrl+Enter runs in place · Esc cancels · ⌘⇧F auto-formats the cell · Ctrl+Z undoes a format
                        </span>
                                            </div>
                                        )}

                                        {/* Source — EDIT mode: a syntax-highlighted
                        backdrop (python for code cells, markdown for
                        markdown cells) behind a transparent-text
                        textarea, the same layered technique the file
                        editors use. While typing the backdrop is a
                        plain <pre> with identical metrics; the colors
                        return ~160 ms after the typing pause. Raw
                        cells keep the plain opaque textarea (no
                        grammar). */}
                                        {editing ? (
                                            (() => {
                                                const editLang = isCode ? "python" : cell.cell_type === "markdown" ? "markdown" : undefined;
                                                const editPlain = !cellDraftHot || draft.length > 40_000 || editLang === undefined;
                                                return (
                                                    <div
                                                        className="relative w-full rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                                                        {editLang && (
                                                            <div aria-hidden="true"
                                                                 className="pointer-events-none absolute inset-0 overflow-hidden">
                                                                {editPlain ? (
                                                                    <pre
                                                                        style={{
                                                                            margin: 0,
                                                                            background: "transparent",
                                                                            color: isDark ? "#abb2bf" : "#383a42",
                                                                            padding: "0.5rem 0.75rem",
                                                                            fontSize: "12px",
                                                                            lineHeight: 1.5,
                                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                                            whiteSpace: "pre-wrap",
                                                                            overflowWrap: "anywhere",
                                                                        } as React.CSSProperties}
                                                                    >{draft}</pre>
                                                                ) : (
                                                                    <SyntaxHighlighter
                                                                        language={editLang}
                                                                        style={isDark ? oneDark : oneLight}
                                                                        wrapLongLines
                                                                        customStyle={{
                                                                            margin: 0,
                                                                            background: "transparent",
                                                                            padding: "0.5rem 0.75rem",
                                                                            fontSize: "12px",
                                                                            lineHeight: 1.5,
                                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                                        }}
                                                                        codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                                                    >{draft}</SyntaxHighlighter>
                                                                )}
                                                            </div>
                                                        )}
                                                        <textarea
                                                            ref={cellEditorRef}
                                                            value={draft}
                                                            onChange={(e) => setDraftFor(id, e.target.value)}
                                                            rows={Math.max(3, draft.split("\n").length)}
                                                            spellCheck={false}
                                                            className={cn(
                                                                "relative w-full px-3 py-2 font-mono text-xs outline-none resize-none",
                                                                editLang ? "bg-transparent text-transparent" : "bg-background text-foreground"
                                                            )}
                                                            style={{
                                                                fontSize: "12px",
                                                                lineHeight: 1.5,
                                                                fontFamily: "var(--font-jb-mono), monospace",
                                                                caretColor: isDark ? "#abb2bf" : "#383a42",
                                                            } as React.CSSProperties}
                                                            onKeyDown={(e) => {
                                                                const mod = e.metaKey || e.ctrlKey;
                                                                // ── Undo/redo for PROGRAMMATIC rewrites —
                                                                //    the snapshot stack serves Ctrl+Z
                                                                //    first; once empty the event falls
                                                                //    through to the browser's native
                                                                //    typing undo. Ctrl+Y / Ctrl+Shift+Z
                                                                //    redo.
                                                                if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
                                                                    if (e.shiftKey) {
                                                                        if (cellRedoRef.current.length > 0) {
                                                                            e.preventDefault();
                                                                            popCellRedo();
                                                                        }
                                                                        return;
                                                                    }
                                                                    if (cellUndoRef.current.length > 0) {
                                                                        e.preventDefault();
                                                                        popCellUndo();
                                                                    }
                                                                    return;
                                                                }
                                                                if (mod && !e.altKey && (e.key === "y" || e.key === "Y")) {
                                                                    if (cellRedoRef.current.length > 0) {
                                                                        e.preventDefault();
                                                                        popCellRedo();
                                                                    }
                                                                    return;
                                                                }
                                                                if (mod && e.shiftKey && (e.key === "f" || e.key === "F")) {
                                                                    e.preventDefault();
                                                                    pushCellUndo(id, draft);
                                                                    void formatCellSource(cell.cell_type, draft, "format").then((out) => {
                                                                        setDraftFor(id, out);
                                                                        toast({
                                                                            title: "Cell formatted — Ctrl+Z undoes",
                                                                            description: "The draft now holds the formatted source — Done keeps it."
                                                                        });
                                                                    });
                                                                    return;
                                                                }
                                                                if (e.key === "Tab") {
                                                                    e.preventDefault();
                                                                    pushCellUndo(id, draft);
                                                                    const el = e.currentTarget;
                                                                    const s = el.selectionStart;
                                                                    const selEnd = el.selectionEnd;
                                                                    const cfg = getIndentSettings(loadSettings());
                                                                    const unit = cfg.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, cfg.width)));
                                                                    const multiline =
                                                                        draft.slice(s, selEnd).includes("\n") ||
                                                                        draft.slice(0, s).lastIndexOf("\n") !== draft.slice(0, selEnd).lastIndexOf("\n");
                                                                    if (multiline || e.shiftKey) {
                                                                        const firstLineStart = draft.slice(0, s).lastIndexOf("\n") + 1;
                                                                        const block = draft.slice(firstLineStart, selEnd);
                                                                        const blockLines = block.split("\n");
                                                                        const changed = e.shiftKey
                                                                            ? blockLines.map((ln) => {
                                                                                if (ln.startsWith("\t")) return ln.slice(1);
                                                                                let removed = 0;
                                                                                let k = 0;
                                                                                while (k < ln.length && ln[k] === " " && removed < unit.length) {
                                                                                    removed++;
                                                                                    k++;
                                                                                }
                                                                                return ln.slice(removed);
                                                                            })
                                                                            : blockLines.map((ln) => unit + ln);
                                                                        const newBlock = changed.join("\n");
                                                                        setDraftFor(id, draft.slice(0, firstLineStart) + newBlock + draft.slice(selEnd));
                                                                        const lengthDiff = newBlock.length - block.length;
                                                                        requestAnimationFrame(() => {
                                                                            el.selectionStart = firstLineStart;
                                                                            el.selectionEnd = selEnd + lengthDiff;
                                                                        });
                                                                        return;
                                                                    }
                                                                    const next = draft.slice(0, s) + unit + draft.slice(selEnd);
                                                                    setDraftFor(id, next);
                                                                    requestAnimationFrame(() => {
                                                                        el.selectionStart = el.selectionEnd = s + unit.length;
                                                                    });
                                                                } else if (e.key === "Enter" && !e.shiftKey && !mod && !e.altKey) {
                                                                    e.preventDefault();
                                                                    pushCellUndo(id, draft);
                                                                    const el = e.currentTarget;
                                                                    const s = el.selectionStart;
                                                                    const selEnd = el.selectionEnd;
                                                                    const before = draft.slice(0, s);
                                                                    const lineStart = before.lastIndexOf("\n") + 1;
                                                                    const currentLine = draft.slice(lineStart, s);
                                                                    const indentMatch = currentLine.match(/^[ \t]*/);
                                                                    let indent = indentMatch ? indentMatch[0] : "";
                                                                    const cfg = getIndentSettings(loadSettings());
                                                                    const unit = cfg.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, cfg.width)));
                                                                    // Code cells: a trailing `:` opens a block.
                                                                    if (isCode && currentLine.trimEnd().endsWith(":")) indent += unit;
                                                                    const insert = "\n" + indent;
                                                                    setDraftFor(id, draft.slice(0, s) + insert + draft.slice(selEnd));
                                                                    requestAnimationFrame(() => {
                                                                        el.selectionStart = el.selectionEnd = s + insert.length;
                                                                    });
                                                                } else if (e.key === "Enter" && e.shiftKey) {
                                                                    // Shift+Enter runs + advances (with or
                                                                    // without Ctrl/Cmd — the with-mod twin
                                                                    // used to be swallowed by the run-in-place
                                                                    // branch below).
                                                                    e.preventDefault();
                                                                    endEditCell(id, true);
                                                                    void runCellById(id).then(() => {
                                                                        if (i === cells.length - 1) insertCell(i, "code");
                                                                    });
                                                                } else if (mod && e.key === "Enter") {
                                                                    // Ctrl/Cmd+Enter runs in place.
                                                                    e.preventDefault();
                                                                    endEditCell(id, true);
                                                                    void runCellById(id);
                                                                } else if (e.key === "Escape") {
                                                                    e.preventDefault();
                                                                    endEditCell(id, false);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            })()
                                        ) : isCode ? (
                                            source.trim() ? (
                                                <CellSourceCode source={source} isDark={isDark}/>
                                            ) : (
                                                <p className="text-[11px] italic text-muted-foreground px-1 py-2">(empty
                                                    cell — click to edit)</p>
                                            )
                                        ) : cell.cell_type === "raw" ? (
                                            /* raw cells render verbatim (no execution,
                                                                    no markdown rendering) — monospace block with the
                                                                    NBConvert hint. */
                                            source.trim() ? (
                                                <pre
                                                    className="px-1 py-1 font-mono text-xs whitespace-pre-wrap text-violet-700 dark:text-violet-300"
                                                    title="Raw cell — content passes verbatim to nbconvert (not executed)">
                          {source}
                        </pre>
                                            ) : (
                                                <p className="text-[11px] italic text-muted-foreground px-1 py-2">(empty
                                                    raw cell — click to edit)</p>
                                            )
                                        ) : source.trim() ? (
                                            <CellSourceMarkdown source={source}/>
                                        ) : (
                                            <p className="text-[11px] italic text-muted-foreground px-1 py-2">(empty
                                                markdown cell — click to edit)</p>
                                        )}

                                        {/* Outputs */}
                                        {run ? (
                                            <div
                                                className="mt-1.5 rounded-md border border-border bg-background overflow-hidden">
                                                <div
                                                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] border-b border-border bg-muted/30">
                                                    <button
                                                        type="button"
                                                        className="p-0.5 rounded hover:bg-muted shrink-0"
                                                        onClick={() =>
                                                            setCollapsedOuts((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(id)) next.delete(id);
                                                                else next.add(id);
                                                                return next;
                                                            })
                                                        }
                                                        title={collapsedOuts.has(id) ? "Show this cell's output" : "Collapse this cell's output"}
                                                    >
                                                        {collapsedOuts.has(id) ? <ChevronRight className="size-3"/> :
                                                            <ChevronDown className="size-3"/>}
                                                    </button>
                                                    {run.status === "running" ? (
                                                        <Loader2 className="size-3 animate-spin text-amber-500"/>
                                                    ) : run.status === "error" ? (
                                                        <CircleX className="size-3 text-red-500"/>
                                                    ) : run.status === "queued" ? (
                                                        <Loader2 className="size-3 animate-spin text-muted-foreground"/>
                                                    ) : (
                                                        <CircleCheck className="size-3 text-emerald-500"/>
                                                    )}
                                                    {run.status === "running"
                                                        ? "running…"
                                                        : run.status === "error"
                                                            ? "failed"
                                                            : run.status === "queued"
                                                                ? "queued"
                                                                : "OK"}
                                                    {run.durationMs !== null && (
                                                        <span
                                                            className="text-muted-foreground tabular-nums">{(run.durationMs / 1000).toFixed(2)}s</span>
                                                    )}
                                                    <span className="flex-1"/>
                                                    {(run.stdout || run.stderr || run.figures.length > 0) && (
                                                        <span className="text-muted-foreground tabular-nums">
                              {collapsedOuts.has(id) ? `${run.figures.length} fig · ${run.stdout.length + run.stderr.length} chars` : ""}
                            </span>
                                                    )}
                                                </div>
                                                {!collapsedOuts.has(id) && (
                                                    <>
                                                        {(run.stdout || run.stderr) && (
                                                            <pre
                                                                className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap max-h-56 overflow-auto">
                                {run.stdout}
                                                                {run.stderr &&
                                                                  <span className="text-red-500">{run.stderr}</span>}
                              </pre>
                                                        )}
                                                        {run.figures.map((url) => (
                                                            <img
                                                                key={url}
                                                                src={url}
                                                                alt="Cell figure"
                                                                className="max-h-80 mx-auto block border-t border-border"
                                                            />
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            Array.isArray(cell.outputs) &&
                                            cell.outputs.length > 0 &&
                                            <StoredOutputs outputs={cell.outputs as unknown[]}/>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}

                    {/* Trailing insert zone (hover for ⊕) */}
                    {cells.length > 0 && (
                        <InsertZone label="Append a new code cell"
                                    onInsert={() => insertCell(cells.length - 1, "code")}/>
                    )}

                    {/* Append affordance at the end */}
                    {cells.length > 0 && (
                        <div className="flex items-center justify-center gap-2 py-3">
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                                    onClick={() => insertCell(cells.length - 1, "code")}>
                                <Braces className="size-3.5"/> + Code
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                                    onClick={() => insertCell(cells.length - 1, "markdown")}>
                                <Type className="size-3.5"/> + Markdown
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete-cell confirmation ( — toolbar 🗑 asks first) */}
            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this cell?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget !== null && cells[deleteTarget]
                                ? `Cell ${deleteTarget + 1} (${cells[deleteTarget].cell_type === "markdown" ? "markdown" : "code"}) will be removed from the notebook. Nothing is written to disk until you press Save notebook.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                if (deleteTarget !== null) deleteCell(deleteTarget);
                                setDeleteTarget(null);
                            }}
                        >
                            Delete cell
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/** Small inline marker used for markdown cells. */
function Badge() {
    return (
        <span className="text-[10px] text-sky-500 shrink-0 select-none" aria-hidden>
      <SquareSlash className="size-3"/>
    </span>
    );
}

/** Thin vertical divider between cell-toolbar button groups. */
function ToolbarDivider() {
    return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border"/>;
}

/** Memoized per-cell source renders — the expensive parts of an
 *  IDLE cell (Prism tokenization for code, the markdown pipeline
 *  for prose) are keyed on (source, isDark) alone, so editing one
 *  cell's draft, running another cell, or collapsing an output
 *  never re-tokenizes the untouched cells' sources. */
const CellSourceCode = React.memo(function CellSourceCode({
                                                              source,
                                                              isDark,
                                                          }: {
    source: string;
    isDark: boolean;
}) {
    return (
        <div className="rounded-md border border-border overflow-hidden">
            <SyntaxHighlighter
                language="python"
                style={isDark ? oneDark : oneLight}
                wrapLongLines
                customStyle={{
                    margin: 0,
                    background: isDark ? "#282c34" : "#fafafa",
                    fontSize: "12px",
                    padding: "0.6rem 0.8rem",
                    fontFamily: "var(--font-jb-mono), monospace",
                }}
                codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
            >
                {source}
            </SyntaxHighlighter>
        </div>
    );
});

const CellSourceMarkdown = React.memo(function CellSourceMarkdown({source}: { source: string }) {
    return (
        <div className="max-w-none px-1 py-1 text-sm">
            <MarkdownGithub>{source}</MarkdownGithub>
        </div>
    );
});

/** One 28px ghost button with a tooltip — the cell action toolbar. */
function CellAction({
                        label,
                        onClick,
                        disabled,
                        danger,
                        children,
                    }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "size-7 rounded-md p-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        danger && "text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    )}
                    onClick={onClick}
                    disabled={disabled}
                    aria-label={label}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="px-2 py-1 text-[10px]">
                {label}
            </TooltipContent>
        </Tooltip>
    );
}

/** Hairline + centered ⊕ that appears on hover — the modern
 * "insert a cell here" affordance between two cells. */
function InsertZone({label, onInsert}: { label: string; onInsert: () => void }) {
    return (
        <div className="group/insert relative h-6 shrink-0">
            <span
                className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-border opacity-0 transition-opacity duration-150 group-hover/insert:opacity-100"/>
            <button
                type="button"
                onClick={onInsert}
                aria-label={label}
                title={label}
                className="absolute left-1/2 top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-xs transition-opacity duration-150 hover:bg-muted hover:text-foreground group-hover/insert:opacity-100"
            >
                <Plus className="size-3.5"/>
            </button>
        </div>
    );
}

/** Move DOM focus to the next/previous CELL card in document order,
 * skipping the insert zones rendered between them (j / k / arrow
 * command-mode navigation). Returns true when a cell was focused. */
function focusCellSibling(from: HTMLElement, dir: 1 | -1): boolean {
    let sib = dir === 1 ? from.nextElementSibling : from.previousElementSibling;
    while (sib) {
        if ((sib as HTMLElement).dataset.cell === "true") {
            (sib as HTMLElement).focus();
            return true;
        }
        sib = dir === 1 ? sib.nextElementSibling : sib.previousElementSibling;
    }
    return false;
}
