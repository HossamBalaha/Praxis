"use client";

import * as React from "react";
import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    FilePlus2,
    Minus,
    Play,
    Plus,
    RefreshCw,
    Sparkles,
    WandSparkles,
} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {
    REFACTOR_TRANSFORMS,
    type RefactorParams,
    type RefactorRequest,
    type RefactorResponse,
} from "@/lib/refactor-ops";

/**
 * RefactorPalette — a cmdk-style palette for the automated refactor
 * service (/api/refactor). Three steps:
 *
 *   1. SELECT — the top input filters REFACTOR_TRANSFORMS (the shared
 *      registry in lib/refactor-ops, so palette + backend always agree).
 *   2. FORM   — the chosen transform's mini form: symbol (prefilled from
 *      the editor selection via identifierNearSelection), line number
 *      (prefilled from the selection), target module (move_symbol) and
 *      an arg-list editor (change_signature).
 *   3. PREVIEW — posts the CURRENT buffer code, renders the returned
 *      edit descriptions + a compact unified diff (+ green / - red,
 *      unchanged runs collapsed to context ± 3), then Apply hands the
 *      rewritten code + any new files to onApply.
 *
 * Pure helpers (identifierNearSelection, diffLines, compactDiff) are
 * total — never throw, degrade to "" / a fallback view instead.
 */

/** One entry of the shared transform registry (type derived from the
 *  imported constant — never redefined here). */
type TransformMeta = (typeof REFACTOR_TRANSFORMS)[number];

/** One row of the change_signature arg editor: name + optional default. */
interface ArgRow {
    name: string;
    def: string;
}

/** The editor selection this palette prefill from (1-based lines). */
interface Selection {
    startLine: number;
    endLine: number;
    text?: string;
}

/* ─── Pure helpers ─────────────────────────────────────────────────── */

/** Tokens that are never a refactor target — keywords/builtins are
 *  skipped when guessing the symbol near the caret. */
const PY_KEYWORDS = new Set([
    "def", "class", "return", "if", "elif", "else", "for", "while", "break",
    "continue", "import", "from", "as", "with", "try", "except", "finally",
    "raise", "yield", "lambda", "pass", "assert", "del", "global", "nonlocal",
    "async", "await", "in", "is", "not", "and", "or", "None", "True", "False",
    "self", "cls", "print", "len", "range", "int", "float", "str", "bool",
    "list", "dict", "set", "tuple",
]);

/** Best-guess identifier under/near the selection — prefills the symbol
 *  field. Order: the selection text itself (a word under the caret IS
 *  the symbol), a def/class name inside the selected lines, then the
 *  first non-keyword identifier in the range. Total: "" when nothing
 *  symbol-shaped is found. */
function identifierNearSelection(code: string, selection: Selection | null | undefined): string {
    if (!selection) return "";
    const raw = (selection.text ?? "").trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return raw;
    // Clamp the 1-based line range to the document.
    const lines = code.split("\n");
    const start = Math.min(Math.max(1, selection.startLine), Math.max(1, lines.length));
    const end = Math.min(Math.max(start, selection.endLine), lines.length);
    const rangeText = lines.slice(start - 1, end).join("\n");
    const defMatch = /\b(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(rangeText);
    if (defMatch?.[1]) return defMatch[1];
    for (const m of (raw || rangeText).matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        if (!PY_KEYWORDS.has(m[0])) return m[0];
    }
    return "";
}

/** One row of the unified diff. */
interface DiffRow {
    kind: "same" | "add" | "del";
    text: string;
}

/** A collapsed run of unchanged lines (rendered as "N unchanged"). */
interface DiffGap {
    kind: "gap";
    count: number;
}

type DiffSegment = DiffRow | DiffGap;

/** Line-level LCS diff. O(n*m) cells with a flat Uint32Array; files past
 *  the 400k-cell cap fall back to common prefix/suffix + one replace
 *  block (still readable, never explodes on huge buffers). */
function diffLines(before: string, after: string): DiffRow[] {
    const a = before.split("\n");
    const b = after.split("\n");
    if (a.length * b.length > 400_000) {
        let p = 0;
        while (p < a.length && p < b.length && a[p] === b[p]) p++;
        let s = 0;
        while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
        const rows: DiffRow[] = [];
        for (let i = 0; i < p; i++) rows.push({kind: "same", text: a[i]});
        for (let i = p; i < a.length - s; i++) rows.push({kind: "del", text: a[i]});
        for (let j = p; j < b.length - s; j++) rows.push({kind: "add", text: b[j]});
        for (let i = a.length - s; i < a.length; i++) rows.push({kind: "same", text: a[i]});
        return rows;
    }
    const n = a.length;
    const m = b.length;
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * w + j] =
                a[i] === b[j]
                    ? dp[(i + 1) * w + (j + 1)] + 1
                    : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
        }
    }
    const rows: DiffRow[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            rows.push({kind: "same", text: a[i]});
            i++;
            j++;
        } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
            rows.push({kind: "del", text: a[i]});
            i++;
        } else {
            rows.push({kind: "add", text: b[j]});
            j++;
        }
    }
    while (i < n) rows.push({kind: "del", text: a[i++]});
    while (j < m) rows.push({kind: "add", text: b[j++]});
    return rows;
}

/** Collapse unchanged runs to ± `context` lines around each change so
 *  the preview stays scannable on long files. */
function compactDiff(rows: DiffRow[], context = 3): DiffSegment[] {
    const keep = new Array<boolean>(rows.length).fill(false);
    rows.forEach((row, idx) => {
        if (row.kind === "same") return;
        for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) {
            keep[k] = true;
        }
    });
    const out: DiffSegment[] = [];
    let gap = 0;
    const flush = () => {
        if (gap > 0) out.push({kind: "gap", count: gap});
        gap = 0;
    };
    for (let i = 0; i < rows.length; i++) {
        if (keep[i]) {
            flush();
            out.push(rows[i]);
        } else {
            gap++;
        }
    }
    flush();
    return out;
}

/* ─── Component ────────────────────────────────────────────────────── */

export function RefactorPalette({
                                    open,
                                    onOpenChange,
                                    folderSlug,
                                    fileSlug,
                                    fileName,
                                    code,
                                    selection,
                                    onApply,
                                    initialTransform,
                                }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    code: string;
    selection?: Selection | null;
    onApply: (
        newCode: string,
        extraFiles: Array<{ path: string; content: string }>,
        description: string
    ) => void;
    /** The transform id the context menu asked for (e.g.
     *  "inline_variable") — when set, the palette skips the select step
     *  and opens THAT transform's form directly, so the per-transform
     * right-click entries actually land on their transform instead of
     *  the generic list. */
    initialTransform?: string | null;
}) {
    const {toast} = useToast();
    /** select → transform list; form → mini form; preview → POST result. */
    const [mode, setMode] = React.useState<"select" | "form" | "preview">("select");
    const [chosen, setChosen] = React.useState<TransformMeta | null>(null);
    const [symbol, setSymbol] = React.useState("");
    const [line, setLine] = React.useState("");
    const [target, setTarget] = React.useState("");
    const [argRows, setArgRows] = React.useState<ArgRow[]>([{name: "", def: ""}]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<RefactorResponse | null>(null);

    /** Symbol guessed from the current selection (memo — drives the
     *  "current symbol" chip + the form prefill). */
    const currentSymbol = React.useMemo(
        () => identifierNearSelection(code, selection),
        [code, selection]
    );

    /* Fresh slate every time the palette opens — stale form state from
     * a previous refactor must never bleed into a new one. (Symbol/line
     * prefill happens in begin() at CLICK time so a mid-session
     * selection change never resets a form the user is typing into.)
     * When the caller NAMED a transform (the per-transform context-menu
     * entries dispatch detail.transform), skip the list and open that
     * transform's form directly. */
    React.useEffect(() => {
        if (!open) return;
        setMode("select");
        setChosen(null);
        setSymbol("");
        setLine("");
        setTarget("");
        setArgRows([{name: "", def: ""}]);
        setError(null);
        setResult(null);
        setLoading(false);
        const wanted = initialTransform
            ? REFACTOR_TRANSFORMS.find((t) => t.id === initialTransform)
            : undefined;
        if (wanted) begin(wanted);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialTransform]);

    /** Selecting a transform opens its form, prefilled from selection;
     *  the arg editor starts at one empty row every time. */
    const begin = (t: TransformMeta) => {
        setChosen(t);
        setSymbol(identifierNearSelection(code, selection));
        setLine(selection ? String(selection.startLine) : "");
        setArgRows([{name: "", def: ""}]);
        setError(null);
        setResult(null);
        setMode("form");
    };

    const argRow = (i: number, key: keyof ArgRow, value: string) => {
        setArgRows((prev) => prev.map((row, idx) => (idx === i ? {...row, [key]: value} : row)));
    };

    /** Params for the POST — only the fields the transform declared
     *  (typed by the shared RefactorParams contract). */
    const buildParams = (): RefactorParams => {
        const params: RefactorParams = {};
        const lineNo = Number.parseInt(line, 10);
        if (Number.isFinite(lineNo) && lineNo > 0) params.line = lineNo;
        if (chosen?.needsSymbol) params.name = symbol.trim();
        if (chosen?.needsTarget) params.target = target.trim();
        if (chosen?.needsArgs) {
            params.newArgs = argRows
                .filter((r) => r.name.trim())
                .map((r) =>
                    r.def.trim()
                        ? {name: r.name.trim(), default: r.def.trim()}
                        : {name: r.name.trim()}
                );
        }
        return params;
    };

    const symbolMissing = Boolean(chosen?.needsSymbol) && !symbol.trim();

    /** POST /api/refactor with the CURRENT buffer and render the preview. */
    const preview = async () => {
        if (!chosen || symbolMissing) return;
        setLoading(true);
        setError(null);
        setResult(null);
        setMode("preview");
        try {
            const body: RefactorRequest = {
                folder: folderSlug,
                file: fileSlug,
                code,
                transform: chosen.id,
                params: buildParams(),
            };
            const res = await fetch("/api/refactor", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            const data = (await res.json()) as RefactorResponse;
            if (!res.ok) {
                setError(`HTTP ${res.status}`);
                return;
            }
            if (!data.ok) {
                setError(data.error);
                return;
            }
            setResult(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    /** Hand the rewritten code (+ new files) to the editor and close. */
    const apply = () => {
        if (!chosen || !result?.ok) return;
        const edits = result.edits;
        const newFiles = result.newFiles ?? [];
        const description = edits.map((e) => e.description).join("; ") || chosen.label;
        onApply(result.code, newFiles, description);
        toast({
            title: "Refactor applied",
            description: edits[0]?.description ?? chosen.label,
            variant: "success",
        });
        onOpenChange(false);
    };

    /** The compact unified diff of the main file (only meaningful once a
     *  successful preview returned). */
    const segments = React.useMemo(() => {
        if (!result?.ok) return null;
        if (result.code === code) return [];
        return compactDiff(diffLines(code, result.code));
    }, [result, code]);

    const lineRangeLabel = selection
        ? `L${selection.startLine}${selection.endLine !== selection.startLine ? `–${selection.endLine}` : ""}`
        : "no selection";

    /* The select step reuses the cmdk primitives directly (Dialog →
     * Command), so the form/preview steps are plain inputs OUTSIDE the
     * cmdk root — cmdk's key handling never fights the mini form. */
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] gap-0 overflow-y-hidden p-0 flex flex-col">
                <DialogHeader className="sr-only">
                    <DialogTitle>Refactor</DialogTitle>
                    <DialogDescription>
                        Pick a refactor for {fileName}, preview the diff, then apply it.
                    </DialogDescription>
                </DialogHeader>

                {mode === "select" ? (
                    <Command>
                        <CommandInput placeholder="Search refactors…" className="text-xs"/>
                        <CommandList className="max-h-[55vh]">
                            <CommandEmpty>No matching refactors.</CommandEmpty>
                            <CommandGroup heading={`Refactors · ${fileName}`}>
                                {REFACTOR_TRANSFORMS.map((t) => (
                                    <CommandItem
                                        key={t.id}
                                        value={`${t.id} ${t.label} ${t.hint}`}
                                        onSelect={() => begin(t)}
                                        className="items-start py-2"
                                    >
                                        <WandSparkles className="size-4 shrink-0 mt-0.5"/>
                                        <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm">{t.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{t.hint}</span>
                    </span>
                                        <span className="shrink-0 flex items-center gap-1">
                      {t.needsSymbol && <Badge variant="outline" className="text-[9px] px-1.5">sym</Badge>}
                                            {t.needsTarget &&
                                              <Badge variant="outline" className="text-[9px] px-1.5">tgt</Badge>}
                                            {t.needsArgs &&
                                              <Badge variant="outline" className="text-[9px] px-1.5">args</Badge>}
                    </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                        {/* current-symbol hint chip */}
                        <div className="border-t px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Sparkles className="size-3 shrink-0" aria-hidden="true"/>
                            <span className="shrink-0">{lineRangeLabel}</span>
                            <span
                                className="truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-foreground/80"
                                title="Identifier detected under/near the selection — prefills the symbol field"
                            >
                {currentSymbol || "no symbol detected"}
              </span>
                        </div>
                    </Command>
                ) : mode === "form" && chosen ? (
                    <div className="flex flex-col min-h-0 flex-1">
                        {/* form header — back to the transform list */}
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setMode("select")}
                                aria-label="Back to the refactor list"
                            >
                                <ChevronLeft className="size-3.5"/> All refactors
                            </Button>
                            <span className="truncate text-sm font-medium">{chosen.label}</span>
                            <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground"
                                  title={fileName}>
                {fileName}
              </span>
                        </div>

                        <div className="min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-xs">
                            {chosen.needsSymbol && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="rf-symbol" className="text-xs">Symbol name</Label>
                                    <Input
                                        id="rf-symbol"
                                        value={symbol}
                                        onChange={(e) => setSymbol(e.target.value)}
                                        placeholder="e.g. process_batch"
                                        className="h-8 font-mono text-xs"
                                        spellCheck={false}
                                        aria-label="Symbol name to refactor"
                                    />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="rf-line" className="text-xs">Line number</Label>
                                <Input
                                    id="rf-line"
                                    value={line}
                                    onChange={(e) => setLine(e.target.value.replace(/[^0-9]/g, ""))}
                                    placeholder="1"
                                    inputMode="numeric"
                                    className="h-8 font-mono text-xs"
                                    spellCheck={false}
                                    aria-label="Anchor line for the refactor"
                                />
                            </div>
                            {chosen.needsTarget && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="rf-target" className="text-xs">Target module</Label>
                                    <Input
                                        id="rf-target"
                                        value={target}
                                        onChange={(e) => setTarget(e.target.value)}
                                        placeholder="e.g. text_utils"
                                        className="h-8 font-mono text-xs"
                                        spellCheck={false}
                                        aria-label="Module the symbol moves to"
                                    />
                                </div>
                            )}
                            {chosen.needsArgs && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs">New argument list</Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        Name + optional default, in the new call order.
                                    </p>
                                    <div className="space-y-1.5">
                                        {argRows.map((row, i) => (
                                            <div key={i} className="flex items-center gap-1.5">
                                                <Input
                                                    value={row.name}
                                                    onChange={(e) => argRow(i, "name", e.target.value)}
                                                    placeholder={`arg ${i + 1} name`}
                                                    className="h-8 flex-1 font-mono text-xs"
                                                    spellCheck={false}
                                                    aria-label={`Argument ${i + 1} name`}
                                                />
                                                <Input
                                                    value={row.def}
                                                    onChange={(e) => argRow(i, "def", e.target.value)}
                                                    placeholder="default (optional)"
                                                    className="h-8 flex-1 font-mono text-xs"
                                                    spellCheck={false}
                                                    aria-label={`Argument ${i + 1} default value`}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-7 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                                                    onClick={() => setArgRows((prev) => prev.filter((_, idx) => idx !== i))}
                                                    disabled={argRows.length <= 1}
                                                    aria-label={`Remove argument row ${i + 1}`}
                                                >
                                                    <Minus className="size-3.5"/>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 text-xs"
                                        onClick={() => setArgRows((prev) => [...prev, {name: "", def: ""}])}
                                        aria-label="Add an argument row"
                                    >
                                        <Plus className="size-3.5"/> Add argument
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="border-t px-4 py-3 flex items-center gap-2">
                            <Button
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => void preview()}
                                disabled={loading || symbolMissing}
                                title={symbolMissing ? "A symbol name is required for this refactor" : "Preview the refactor on the current buffer"}
                            >
                                <Play className="size-3.5"/> Preview refactor
                            </Button>
                            {symbolMissing && (
                                <span
                                    className="text-[10px] text-amber-600 dark:text-amber-400">symbol name required</span>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Preview step ── */
                    <div className="flex flex-col min-h-0 flex-1">
                        <div className="flex items-center gap-2 border-b px-3 py-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setMode(chosen ? "form" : "select")}
                                aria-label="Back to the refactor form"
                            >
                                <ChevronLeft className="size-3.5"/> Form
                            </Button>
                            <span className="truncate text-sm font-medium">
                {chosen ? `Preview · ${chosen.label}` : "Preview"}
              </span>
                            <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground"
                                  title={fileName}>
                {fileName}
              </span>
                        </div>

                        <div className="min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-xs">
                            {loading ? (
                                /* Skeleton while the refactor service runs. */
                                <div className="space-y-2" aria-label="Loading refactor preview">
                                    <Skeleton className="h-5 w-2/3 rounded"/>
                                    <Skeleton className="h-16 w-full rounded"/>
                                    <Skeleton className="h-16 w-full rounded"/>
                                    <Skeleton className="h-4 w-1/3 rounded"/>
                                </div>
                            ) : error ? (
                                <div
                                    className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true"/>
                                    <div className="min-w-0">
                                        <p className="font-medium">The refactor failed</p>
                                        <p className="break-words">{error}</p>
                                    </div>
                                </div>
                            ) : result?.ok ? (
                                <>
                                    {/* edits the service will make */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                            Edits · {(result.edits ?? []).length}
                                        </p>
                                        {result.edits && result.edits.length > 0 ? (
                                            <ul className="space-y-1">
                                                {result.edits.map((e, i) => (
                                                    <li key={i} className="flex items-start gap-1.5">
                                                        <Check
                                                            className="size-3 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                                            aria-hidden="true"/>
                                                        <span className="break-words">{e.description}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-muted-foreground">No textual edits reported.</p>
                                        )}
                                    </div>

                                    {/* unified before/after diff of the main file */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                            Diff · {fileName}
                                        </p>
                                        {segments && segments.length > 0 ? (
                                            <div
                                                className="max-h-64 overflow-auto rounded-md border font-mono text-[11px] leading-5"
                                                role="table" aria-label="Unified diff of the refactor">
                                                {segments.map((seg, i) =>
                                                        seg.kind === "gap" ? (
                                                            <div key={i}
                                                                 className="bg-muted/30 px-3 py-0.5 text-center text-[10px] text-muted-foreground select-none">
                                                                ⋯ {seg.count} unchanged line{seg.count === 1 ? "" : "s"}
                                                            </div>
                                                        ) : (
                                                            <div
                                                                key={i}
                                                                className={cn(
                                                                    "flex gap-0",
                                                                    seg.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                                                                    seg.kind === "del" && "bg-red-500/10 text-red-700 dark:text-red-300",
                                                                    seg.kind === "same" && "text-muted-foreground"
                                                                )}
                                                            >
                              <span className="w-5 shrink-0 select-none text-center opacity-60" aria-hidden="true">
                                {seg.kind === "add" ? "+" : seg.kind === "del" ? "-" : ""}
                              </span>
                                                                <span
                                                                    className="min-w-0 flex-1 whitespace-pre-wrap break-all">{seg.text || " "}</span>
                                                            </div>
                                                        )
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-muted-foreground">
                                                {segments ? "The main file is unchanged." : "No rewritten code was returned."}
                                            </p>
                                        )}
                                    </div>

                                    {/* files the refactor creates */}
                                    {result.newFiles && result.newFiles.length > 0 && (
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                                New files · {result.newFiles.length}
                                            </p>
                                            <div className="space-y-1.5">
                                                {result.newFiles.map((f) => (
                                                    <Collapsible key={f.path}>
                                                        <CollapsibleTrigger
                                                            className="flex w-full items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-left text-[11px] hover:bg-accent/50">
                                                            <ChevronRight
                                                                className="size-3 shrink-0 text-muted-foreground"
                                                                aria-hidden="true"/>
                                                            <FilePlus2
                                                                className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                                                                aria-hidden="true"/>
                                                            <span className="truncate font-mono">{f.path}</span>
                                                            <span
                                                                className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                {f.content.split("\n").length} lines
                              </span>
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent>
                              <pre
                                  className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-all">
                                {f.content}
                              </pre>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="text-muted-foreground">No preview yet — go back to the form and press
                                    Preview.</p>
                            )}
                        </div>

                        {!loading && result?.ok && (
                            <div className="border-t px-4 py-3 flex items-center gap-2">
                                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={apply}>
                                    <Check className="size-3.5"/> Apply refactor
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    onClick={() => void preview()}
                                    aria-label="Re-run the preview"
                                >
                                    <RefreshCw className="size-3.5"/> Refresh preview
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
