"use client";

import * as React from "react";
import {AlertTriangle, Braces, ChevronDown, ChevronRight, Code2, Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {toast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {JsonPathError, jsonTypeOf, queryJsonPath} from "@/lib/jsonpath";

/**
 * the JSON inspector — a collapsible TREE of the parsed
 * document (toggle back to the raw text view any time), live
 * validation with a jump-to-error-position button, format / minify
 * one-click rewrites, and a JSONPath query box ($.a.b[0], wildcards,
 * [?(@.price > 10)] filters — see lib/jsonpath).
 *
 * Section 6,— EDITABLE LEAF NODES: double-click a
 * string / number / boolean value to edit it in place (Enter or blur
 * commits, Esc cancels); the change rewrites the whole document
 * through onRewrite (the same pipe Format/Minify use). The structure
 * stays IMMUTABLE — arrays/objects are never edited, inserted or
 * deleted; only leaf values change. Every committed edit pushes a
 * {path, before} snapshot; the toolbar's Undo edit button pops one.
 * Editing is disabled for invalid JSON and NDJSON (a rewrite would
 * corrupt the line-delimited layout) and when onRewrite is absent.
 */

interface JsonInspectorProps {
    content: string;
    contentTruncated?: boolean;
    /** The raw text pane (read-only render) — reused for the Text mode. */
    rawView: React.ReactNode;
    /** Format / minify rewrite the BUFFER; when the editor is open the
     *  parent pipes the new text into its textarea, else it saves. */
    onRewrite?: (text: string) => void;
    /** Font scale from the per-kind zoom (applies to the tree). */
    fontScale?: number;
}

interface JsonNode {
    key: string;
    value: unknown;
    depth: number;
    path: string;
}

/** Clone `value` with the given LEAF edits applied.
 *  Arrays/objects are rebuilt (clone-on-write) — the structure is
 *  immutable; only string/number/boolean leaves are replaced. The
 *  path grammar matches the tree walk EXACTLY ($.a.b[0],
 *  $['odd key']). */
function applyLeafEdits(value: unknown, edits: Map<string, unknown>, path: string): unknown {
    const edit = edits.get(path);
    if (edit !== undefined) return edit;
    if (Array.isArray(value)) {
        return value.map((v, i) => applyLeafEdits(v, edits, `${path}[${i}]`));
    }
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const childPath = /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`;
            out[k] = applyLeafEdits(v, edits, childPath);
        }
        return out;
    }
    return value;
}

export function JsonInspector({content, contentTruncated, rawView, onRewrite, fontScale = 1}: JsonInspectorProps) {
    const [mode, setMode] = React.useState<"tree" | "text">("tree");
    const [query, setQuery] = React.useState("");
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
    const [editPath, setEditPath] = React.useState<string | null>(null);
    const [editDraft, setEditDraft] = React.useState<string>("");
    const [edits, setEdits] = React.useState<Map<string, unknown>>(new Map());
    const [undoStack, setUndoStack] = React.useState<Array<{ path: string; before: unknown }>>([]);
    const editInputRef = React.useRef<HTMLInputElement | null>(null);

    const parse = React.useMemo(() => {
        try {
            return {value: JSON.parse(content) as unknown, error: null as string | null, ndjson: false};
        } catch (err) {
            // NDJSON / JSON Lines files (one JSON record per
            // line — e.g. Records.jsonl). Whole-document JSON.parse fails
            // with "unexpected non-whitespace character after JSON data at
            // line 2"; instead, parse every line into an array so the tree,
            // JSONPath search and previews all work.
            const lines = content
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            if (lines.length >= 2) {
                const records: unknown[] = [];
                let allOk = true;
                for (const line of lines) {
                    try {
                        records.push(JSON.parse(line));
                    } catch {
                        // Python's json.dumps emits bare NaN / Infinity — invalid
                        // strict JSON but common in .jsonl exports. Retry with
                        // them coerced to null (the tree shows null).
                        const lenient = line
                            .replace(/(:\s*)NaN\b/g, "$1null")
                            .replace(/(:\s*)-?Infinity\b/g, "$1null");
                        try {
                            records.push(JSON.parse(lenient));
                        } catch {
                            allOk = false;
                            break;
                        }
                    }
                }
                if (allOk) {
                    return {value: records as unknown, error: null as string | null, ndjson: true};
                }
            }
            const msg = (err as Error).message;
            return {value: null, error: msg, ndjson: false};
        }
    }, [content]);

    const matches = React.useMemo(() => {
        if (!query.trim() || parse.error) return null;
        try {
            return {list: queryJsonPath(parse.value, query), error: null as string | null};
        } catch (err) {
            if (err instanceof JsonPathError) return {list: [], error: err.message};
            return {list: [], error: (err as Error).message};
        }
    }, [query, parse]);

    const errorPos = React.useMemo(() => {
        if (!parse.error) return null;
        const m = /position (\d+)/.exec(parse.error);
        return m ? parseInt(m[1], 10) : null;
    }, [parse.error]);

    const errorLine = React.useMemo(() => {
        if (errorPos === null) return null;
        return content.slice(0, errorPos).split("\n").length;
    }, [errorPos, content]);

    const toggle = (path: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const format = (indent: boolean) => {
        if (parse.error || parse.ndjson || !onRewrite) return;
        onRewrite(JSON.stringify(parse.value, null, indent ? 2 : undefined));
    };

    /* A FRESH document (file switch / external rewrite) resets the
      * leaf-edit state — stale path-keyed edits must never bleed into a
      * different document. */
    React.useEffect(() => {
        setEdits(new Map());
        setUndoStack([]);
        setEditPath(null);
        setEditDraft("");
    }, [content]);

    /** The document ACTUALLY rendered — the parsed tree with every
     * committed leaf edit applied (clone-on-write; structure never
     * changes). Same path grammar as the tree walk below. */
    const doc = React.useMemo(
        () => applyLeafEdits(parse.value, edits, "$"),
        [parse.value, edits]
    );

    const canEditLeaves = !parse.error && !parse.ndjson && !!onRewrite;

    /** Open the inline editor on a leaf node (double-click). */
    const beginLeafEdit = (node: JsonNode) => {
        if (!canEditLeaves) return;
        if (node.value === null || typeof node.value === "object") return; // leaves only
        setEditPath(node.path);
        setEditDraft(String(node.value));
        // Focus the freshly-mounted input on the next paint.
        requestAnimationFrame(() => {
            editInputRef.current?.select();
        });
    };

    /** Commit the inline edit: type-checked against the leaf's CURRENT
     * type, applied through the edits map, rewritten via onRewrite,
     * and snapshotted for Undo. */
    const commitLeafEdit = (path: string, current: unknown) => {
        const text = editDraft;
        let next: unknown;
        if (typeof current === "number") {
            const n = Number(text.trim());
            if (!Number.isFinite(n)) {
                toast({
                    title: `${path}: “${text.trim()}” is not a number`,
                    description: "Edit reverted — leaves keep their JSON type.",
                    variant: "destructive"
                });
                setEditPath(null);
                return;
            }
            next = n;
        } else if (typeof current === "boolean") {
            const t = text.trim().toLowerCase();
            if (t !== "true" && t !== "false") {
                toast({
                    title: `${path}: use true or false`,
                    description: "Edit reverted — boolean leaves accept only true/false.",
                    variant: "destructive"
                });
                setEditPath(null);
                return;
            }
            next = t === "true";
        } else {
            next = text; // string leaf — the text IS the value
        }
        setEditPath(null);
        if (next === current) return; // no-op edit
        const before = current;
        setEdits((prev) => {
            const m = new Map(prev);
            m.set(path, next);
            return m;
        });
        setUndoStack((prev) => [...prev, {path, before}]);
        // Rewrite the whole document with the edit applied (the same
        // pipe Format/Minify use; edits stay in the map so the tree keeps
        // showing them until the parent's content round-trips).
        onRewrite?.(JSON.stringify(applyLeafEdits(parse.value, new Map([[path, next]]), "$"), null, 2));
    };

    /** Undo the last committed leaf edit (restore `before`). */
    const undoLeafEdit = () => {
        const snap = undoStack[undoStack.length - 1];
        if (!snap) return;
        setUndoStack((prev) => prev.slice(0, -1));
        setEdits((prev) => {
            const m = new Map(prev);
            // Restoring the ORIGINAL value makes the edit a no-op again —
            // drop it from the map so the raw parse shows through.
            m.delete(snap.path);
            const docNow = applyLeafEdits(parse.value, m, "$");
            onRewrite?.(JSON.stringify(docNow, null, 2));
            return m;
        });
    };

    const highlightPaths = new Set((matches?.list ?? []).map((m) => m.path));

    const rows: JsonNode[] = [];
    const walk = (value: unknown, key: string, depth: number, path: string) => {
        rows.push({key, value, depth, path});
        const isCollapsed = collapsed.has(path);
        if (!isCollapsed && value !== null && typeof value === "object") {
            if (Array.isArray(value)) {
                value.forEach((v, i) => walk(v, `[${i}]`, depth + 1, `${path}[${i}]`));
            } else {
                for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                    const childPath = /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}['${k}']`;
                    walk(v, k, depth + 1, childPath);
                }
            }
        }
    };
    walk(doc, "$", 0, "$");

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Button
                    variant={mode === "tree" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setMode("tree")}
                    title="Collapsible tree of the parsed document"
                >
                    <Braces className="size-3.5"/> Tree
                </Button>
                <Button
                    variant={mode === "text" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setMode("text")}
                    title="Raw JSON text"
                >
                    <Code2 className="size-3.5"/> Text
                </Button>
                <div className="w-px h-5 bg-border mx-1"/>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                        disabled={!!parse.error || parse.ndjson || !onRewrite} onClick={() => format(true)}
                        title={parse.ndjson ? "NDJSON files stay line-delimited (formatting would corrupt the layout)" : "Pretty-print with 2-space indent"}>
                    Format
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                        disabled={!!parse.error || parse.ndjson || !onRewrite} onClick={() => format(false)}
                        title={parse.ndjson ? "NDJSON files stay line-delimited" : "Collapse to one line"}>
                    Minify
                </Button>
                {parse.ndjson && !parse.error && (
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium"
                        title="Newline-delimited JSON — each line is one record; the tree shows them as an array">
            NDJSON · {Array.isArray(parse.value) ? parse.value.length : 0} records
          </span>
                )}
                <div className="flex-1"/>
                <div className="flex items-center gap-1 min-w-44">
                    <Search className="size-3 text-muted-foreground"/>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="$.items[?(@.price > 10)]"
                        className="h-7 text-[11px] font-mono"
                        aria-label="JSONPath query"
                    />
                </div>
            </div>

            {/* Validation banner */}
            {parse.error && (
                <div
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="size-3.5 shrink-0"/>
                    <span className="truncate flex-1">{parse.error}</span>
                    {errorLine !== null && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] shrink-0"
                            onClick={() => {
                                setMode("text");
                                // Scroll the raw view to the error line when mounted.
                                requestAnimationFrame(() => {
                                    const pre = document.getElementById("json-raw-error-target");
                                    pre?.scrollIntoView({block: "center"});
                                });
                            }}
                            title={`Jump to line ${errorLine} in the text view`}
                        >
                            Line {errorLine} →
                        </Button>
                    )}
                </div>
            )}

            {/* Query results */}
            {matches && !matches.error && (
                <div className="px-3 py-1.5 border-b bg-emerald-500/5 text-xs">
                    <p className="text-muted-foreground mb-1">
                        {matches.list.length} match{matches.list.length === 1 ? "" : "es"}
                        {matches.list.length > 0 && " — highlighted in the tree"}
                    </p>
                    {matches.list.length === 0 && (
                        <p className="font-mono text-[11px] text-muted-foreground italic">no results</p>
                    )}
                    {matches.list.slice(0, 3).map((m) => (
                        <p key={m.path} className="font-mono text-[11px] truncate">
                            <span className="text-emerald-600 dark:text-emerald-400">{m.path}</span>
                            <span className="text-muted-foreground"> = {safePreview(m.value)}</span>
                        </p>
                    ))}
                </div>
            )}
            {matches?.error && (
                <div className="px-3 py-1.5 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
                    {matches.error}
                </div>
            )}

            {/* Body */}
            {mode === "text" ? (
                <div className="flex-1 min-h-0 overflow-auto" id="json-raw-error-target">
                    {rawView}
                </div>
            ) : parse.error ? (
                <div className="flex-1 min-h-0 overflow-auto">
                    <p className="p-4 text-xs text-muted-foreground">
                        The document is not valid JSON — the text view is shown with the error above.
                    </p>
                    {rawView}
                </div>
            ) : (
                <div
                    className="flex-1 min-h-0 overflow-auto py-2 font-mono"
                    style={{fontSize: `${12 * fontScale}px`}}
                    role="tree"
                    aria-label="JSON document tree"
                >
                    {(() => {
                        // NOTE: `rows` is filled ONCE by the component-body
                        // walk(doc, "$", 0, "$") — doc is the parsed tree with
                        // every committed leaf edit applied (the document ACTUALLY
                        // rendered). A second walk(parse.value, …) here used to
                        // append the RAW parse's nodes to the same array, so every
                        // node rendered TWICE with duplicate React keys.
                        const visible = rows.filter((r) => {
                            // hide children of collapsed ancestors
                            for (const c of collapsed) {
                                if (r.path.startsWith(c) && r.path !== c) return false;
                            }
                            return true;
                        });
                        return visible.map((node) => {
                            const expandable = node.value !== null && typeof node.value === "object";
                            const isCollapsed = collapsed.has(node.path);
                            const hit = highlightPaths.has(node.path);
                            return (
                                <div
                                    key={node.path}
                                    className={cn(
                                        "flex items-start gap-1 px-2 py-0.5 hover:bg-muted/40",
                                        hit && "bg-emerald-500/15"
                                    )}
                                    style={{paddingLeft: `${node.depth * 16 + 8}px`}}
                                >
                                    {expandable ? (
                                        <button
                                            type="button"
                                            onClick={() => toggle(node.path)}
                                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                                            aria-label={isCollapsed ? "Expand" : "Collapse"}
                                        >
                                            {isCollapsed ? <ChevronRight className="size-3"/> :
                                                <ChevronDown className="size-3"/>}
                                        </button>
                                    ) : (
                                        <span className="w-3 shrink-0"/>
                                    )}
                                    <span
                                        className={cn("shrink-0", node.depth === 0 ? "text-sky-600 dark:text-sky-400 font-semibold" : "text-sky-700 dark:text-sky-300")}>
                    {node.key}:
                  </span>
                                    <span className={cn("truncate", valueClass(node.value))}>
                    {expandable ? (
                        <span className="text-muted-foreground">{jsonTypeOf(node.value)}{isCollapsed ? " …" : ""}</span>
                    ) : (
                        safePreview(node.value)
                    )}
                  </span>
                                </div>
                            );
                        });
                    })()}
                    {contentTruncated && (
                        <p className="px-3 pt-2 text-[10px] text-muted-foreground italic">
                            File truncated at 1 MB — the tree covers the truncated text.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function valueClass(value: unknown): string {
    if (typeof value === "string") return "text-emerald-700 dark:text-emerald-300";
    if (typeof value === "number") return "text-amber-700 dark:text-amber-300";
    if (typeof value === "boolean") return "text-indigo-600 dark:text-indigo-400";
    if (value === null) return "text-muted-foreground italic";
    return "";
}

function safePreview(value: unknown): string {
    if (typeof value === "string") return `"${value.slice(0, 120)}"`;
    if (value === null) return "null";
    return String(value);
}
