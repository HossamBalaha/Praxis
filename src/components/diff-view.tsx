"use client";

import * as React from "react";
import {ArrowLeftRight, Check, Columns2, FileCode2, Loader2, Pencil, Save, TriangleAlert, X,} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {type DiffOp, lineDiff, wordDiffSegments, type WordSegment} from "@/lib/word-diff";
// The write-through save path for the top-level editable API — POSTs
// /api/file-write with the route's CORRECT field names ({folder,
// fileName, content}); see the lib for why the previous attempt 400'd.
import {saveDiffFileWrite} from "@/lib/diff-file-save";

/**
 * DiffView (item F22 — "diff as an editor tab").
 *
 * Renders ANY two texts as a full editor-surface side-by-side diff —
 * the tab-surface counterpart of the Compare-Files dialog and the Git
 * Diff panel. Features beyond those two:
 *
 *   - word-level intra-line highlights on changed line PAIRS
 *     (wordDiffSegments — the k-th removed line pairs with the k-th
 *     added line of each change block),
 *   - editable left/right panes ("Edit" swaps the pane to a textarea
 *     with identical metrics; the other pane live-re-diffs against the
 *     draft, debounced) with save-from-diff and a dirty-guard inline
 *     prompt (never window.confirm),
 *   - an "Ignore whitespace" toggle (git-diff -w semantics: lines are
 *     compared whitespace-stripped, rendered raw),
 *   - "Swap sides", "+N −M lines" stats, per-side dirty dots,
 *   - chunked rendering with content-visibility: auto (the
 *     code-viewer pattern) and a 20,000-row render cap.
 *
 * The two panes are separate scroll containers with pixel-synced
 * scrollTop/scrollLeft (rows never wrap — whitespace-pre with a
 * sticky gutter — so every row is exactly LINE_H tall and the sync is
 * exact). While a pane is being edited its textarea scrolls
 * independently (a draft's lines no longer align 1:1 with diff rows).
 *
 * Integration (the host owns the tab plumbing): mount
 * `<DiffView title={…} left={{…}} right={{…}} onDirtyChange={…} />`
 * inside a tab surface that gives it a definite height. Editable +
 * saveable mounts come in two flavors — per-side (left/right objects
 * carrying `editable` + `onSave`) or top-level (`editable` +
 * `onSaveLeft`/`onSaveRight` or the `leftFile`/`rightFile` shorthand
 * that writes through /api/file-write with the correct field names):
 * `<DiffView editable rightFile={{ folder, fileName }} … />`.
 */

/* ── Public API ───────────────────────────────────────────────────── */

export interface DiffViewSide {
    /** Header label for this side (usually "folder/file"). */
    label: string;
    /** Full text content of this side. */
    content: string;
    /** Whether the pane offers inline editing. */
    editable?: boolean;
    /** Persist a save-from-diff. Required for the Save button to enable. */
    onSave?: (content: string) => Promise<void>;
}

/** A write-through target for a side: the /api/file-write contract's
 *  folder + fileName pair (fileName may be a relative path INSIDE the
 *  folder — the route mkdirs the parent and validates traversal). */
export interface DiffViewFileTarget {
    folder: string;
    fileName: string;
}

export interface DiffViewProps {
    /** Tab/surface title shown in the toolbar. */
    title: string;
    left: DiffViewSide;
    right: DiffViewSide;
    /** Bubbles the combined dirty state (either side has unsaved edits). */
    onDirtyChange?: (dirty: boolean) => void;
    /* ── Top-level editable convenience API (read-only stays the DEFAULT
     *  — omit all of these and every pane renders exactly as before).
     *  `editable` flips BOTH panes into edit mode (a side object still
     *  wins with its own explicit `editable`), `onSaveLeft`/`onSaveRight`
     *  attach save handlers to the side that carries none of its own, and
     *  `leftFile`/`rightFile` are shorthand targets that wire a default
     *  onSave POSTing /api/file-write with the CORRECT field names
     *  ({folder, fileName, content}) — the prop-level equivalent of the
     *  per-side API below, so a host can mount the editable variant with
     *  one line: <DiffView editable rightFile={{folder, fileName}} … />. */
    editable?: boolean;
    /** Left-pane save-through (used only when `left.onSave` is absent).
     *  Takes precedence over `leftFile`. */
    onSaveLeft?: (content: string) => Promise<void>;
    /** Right-pane save-through (used only when `right.onSave` is absent).
     *  Takes precedence over `rightFile`. */
    onSaveRight?: (content: string) => Promise<void>;
    /** Left-pane /api/file-write target (used when neither `left.onSave`
     *  nor `onSaveLeft` is provided). */
    leftFile?: DiffViewFileTarget;
    /** Right-pane /api/file-write target (used when neither `right.onSave`
     *  nor `onSaveRight` is provided). */
    rightFile?: DiffViewFileTarget;
}

/* ── Tunables ─────────────────────────────────────────────────────── */

/** Rows per content-visibility chunk (code-viewer uses the same 200). */
const CHUNK_ROWS = 200;
/** Hard render cap — beyond this the diff is truncated with a warning. */
const MAX_RENDER_ROWS = 20_000;
/** Exact row height: h-5 / leading-5 at text-xs. */
const LINE_H = 20;
/** How long after a keystroke the live diff re-runs while editing. */
const EDIT_DIFF_DEBOUNCE_MS = 350;
/** The app-wide monospace token (code-viewer uses the same). */
const MONO_FONT = "var(--font-jb-mono), monospace";

/* ── Aligned rows (the render model) ──────────────────────────────── */

/** One visual row across both panes. `pair` rows are the k-th remove
 *  + k-th add of a change block — they carry the intra-line word
 *  segments for both sides. */
interface AlignedRow {
    kind: "equal" | "pair" | "remove" | "add";
    /** 1-based line number on the left side (null = filler row). */
    leftLine: number | null;
    rightLine: number | null;
    /** Raw line text (null = this pane shows a filler row). */
    leftText: string | null;
    rightText: string | null;
    /** Word-level spans for pair rows, else null. */
    leftSegs: WordSegment[] | null;
    rightSegs: WordSegment[] | null;
}

/** Pair up each change block's removes/adds (GitHub-split behavior):
 *  the k-th removed line pairs with the k-th added line; leftovers
 *  render as unpaired remove/add rows. */
function buildAlignedRows(
    ops: DiffOp[],
    aLines: readonly string[],
    bLines: readonly string[]
): AlignedRow[] {
    const rows: AlignedRow[] = [];
    let i = 0;
    while (i < ops.length) {
        const op = ops[i];
        if (op.type === "equal") {
            rows.push({
                kind: "equal",
                leftLine: op.aIndex + 1,
                rightLine: op.bIndex + 1,
                leftText: aLines[op.aIndex],
                rightText: bLines[op.bIndex],
                leftSegs: null,
                rightSegs: null,
            });
            i++;
            continue;
        }
        // A maximal run of non-equal ops = one change block.
        const removes: number[] = [];
        const adds: number[] = [];
        while (i < ops.length && ops[i].type !== "equal") {
            const o = ops[i];
            if (o.type === "remove") removes.push(o.aIndex);
            else adds.push(o.bIndex);
            i++;
        }
        const paired = Math.min(removes.length, adds.length);
        for (let k = 0; k < paired; k++) {
            const lt = aLines[removes[k]];
            const rt = bLines[adds[k]];
            rows.push({
                kind: "pair",
                leftLine: removes[k] + 1,
                rightLine: adds[k] + 1,
                leftText: lt,
                rightText: rt,
                leftSegs: wordDiffSegments(lt, rt),
                rightSegs: wordDiffSegments(rt, lt),
            });
        }
        for (let k = paired; k < removes.length; k++) {
            rows.push({
                kind: "remove",
                leftLine: removes[k] + 1,
                rightLine: null,
                leftText: aLines[removes[k]],
                rightText: null,
                leftSegs: null,
                rightSegs: null,
            });
        }
        for (let k = paired; k < adds.length; k++) {
            rows.push({
                kind: "add",
                leftLine: null,
                rightLine: adds[k] + 1,
                leftText: null,
                rightText: bLines[adds[k]],
                leftSegs: null,
                rightSegs: null,
            });
        }
    }
    return rows;
}

/* ── Row rendering ────────────────────────────────────────────────── */

const REMOVED_STYLE = {
    bg: "bg-red-500/10",
    text: "text-red-700 dark:text-red-300",
    sign: "−",
    signCls: "text-red-600 dark:text-red-400",
} as const;

const ADDED_STYLE = {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    sign: "+",
    signCls: "text-emerald-600 dark:text-emerald-400",
} as const;

const NEUTRAL_STYLE = {
    bg: "bg-background",
    text: "",
    sign: "",
    signCls: "text-muted-foreground/40",
} as const;

/** One row in ONE pane (the pane's side of an AlignedRow). The gutter
 *  spans are sticky so they survive horizontal scrolling; they carry
 *  an opaque background so scrolled content never bleeds through. */
function RowLine({row, side}: { row: AlignedRow; side: "left" | "right" }) {
    const isLeft = side === "left";
    const text = isLeft ? row.leftText : row.rightText;
    const lineNo = isLeft ? row.leftLine : row.rightLine;
    const segs = isLeft ? row.leftSegs : row.rightSegs;

    // Filler: this pane's empty half of a pure add/remove row.
    if (text === null) {
        return (
            <div className="flex h-5 shrink-0 bg-muted/30">
                <span className="h-5 w-10 shrink-0 border-r border-border/40"/>
                <span className="h-5 w-4 shrink-0"/>
            </div>
        );
    }

    const st =
        row.kind === "equal"
            ? NEUTRAL_STYLE
            : isLeft
                ? REMOVED_STYLE
                : ADDED_STYLE;

    return (
        <div className={cn("flex h-5 shrink-0 text-xs leading-5", st.bg, st.text)}>
      <span
          className="sticky left-0 z-[1] w-10 shrink-0 select-none border-r border-border/40 bg-background pr-1.5 text-right tabular-nums text-muted-foreground/70">
        {lineNo ?? ""}
      </span>
            <span className={cn("sticky left-10 z-[1] w-4 shrink-0 select-none bg-background text-center", st.signCls)}>
        {st.sign}
      </span>
            <pre className="flex-1 whitespace-pre px-2">
        {segs && segs.length > 0
            ? segs.map((seg, si) =>
                seg.changed ? (
                    <span
                        key={si}
                        className={cn("rounded-[2px]", isLeft ? "bg-red-500/30" : "bg-emerald-500/30")}
                    >
                  {seg.text}
                </span>
                ) : (
                    <span key={si}>{seg.text}</span>
                )
            )
            : text}
      </pre>
        </div>
    );
}

/** All rows of one pane, split into CHUNK_ROWS chunks with
 *  content-visibility: auto + an exact intrinsic-size placeholder
 *  (rows are fixed LINE_H tall, so the estimate is exact and the
 *  scrollbar never re-adjusts — the code-viewer pattern). Memoized:
 *  rows identity only changes when the diff itself changes. */
const PaneRows = React.memo(function PaneRows({
                                                  rows,
                                                  side,
                                              }: {
    rows: AlignedRow[];
    side: "left" | "right";
}) {
    const chunks: AlignedRow[][] = [];
    for (let start = 0; start < rows.length; start += CHUNK_ROWS) {
        chunks.push(rows.slice(start, start + CHUNK_ROWS));
    }
    return (
        <>
            {chunks.map((chunk, ci) => (
                <div
                    key={ci}
                    style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: `auto ${chunk.length * LINE_H}px`,
                    }}
                >
                    {chunk.map((row, ri) => (
                        <RowLine key={ci * CHUNK_ROWS + ri} row={row} side={side}/>
                    ))}
                </div>
            ))}
        </>
    );
});

/* ── Per-side state bundle ────────────────────────────────────────── */

interface SideSlot {
    /** ORIGINAL side identity (never changes — swap only flips display). */
    key: "left" | "right";
    data: DiffViewSide;
    editing: boolean;
    draft: string | null;
    dirty: boolean;
    saving: boolean;
    setDraft: React.Dispatch<React.SetStateAction<string | null>>;
}

/* ── DiffView ─────────────────────────────────────────────────────── */

export function DiffView({
                             title,
                             left: leftProp,
                             right: rightProp,
                             onDirtyChange,
                             editable,
                             onSaveLeft,
                             onSaveRight,
                             leftFile,
                             rightFile,
                         }: DiffViewProps) {
    /* ── Top-level editable API → effective sides. The per-side objects
     *  stay the single source of truth; the top-level props are SUGAR
     *  that fills the gaps, so every existing mount (per-side props or
     *  plain read-only) is untouched:
     *    editable:  side.editable ?? editable   (explicit side value wins)
     *    onSave:    side.onSave ?? onSave{Side} ?? fileWriteSaver(file)
     *  The file-target savers close over the target identity inside the
     *  memo below, so the Edit/Save buttons keep stable props and don't
     *  re-mount on unrelated re-renders. */
    const left: DiffViewSide = React.useMemo(
        () => ({
            ...leftProp,
            editable: leftProp.editable ?? editable,
            onSave:
                leftProp.onSave ??
                onSaveLeft ??
                (leftFile
                    ? async (content: string) => {
                        // void-returning wrapper — DiffViewSide.onSave's contract;
                        // failures still throw for the inline error row.
                        await saveDiffFileWrite(leftFile.folder, leftFile.fileName, content);
                    }
                    : undefined),
        }),
        [leftProp, editable, onSaveLeft, leftFile]
    );
    const right: DiffViewSide = React.useMemo(
        () => ({
            ...rightProp,
            editable: rightProp.editable ?? editable,
            onSave:
                rightProp.onSave ??
                onSaveRight ??
                (rightFile
                    ? async (content: string) => {
                        await saveDiffFileWrite(rightFile.folder, rightFile.fileName, content);
                    }
                    : undefined),
        }),
        [rightProp, editable, onSaveRight, rightFile]
    );
    /* View-level state */
    const [swapped, setSwapped] = React.useState(false);
    const [ignoreWs, setIgnoreWs] = React.useState(false);

    /* Per-side edit state — keyed by ORIGINAL side so Swap never
     * detaches a draft from its side. */
    const [editLeft, setEditLeft] = React.useState<string | null>(null);
    const [editRight, setEditRight] = React.useState<string | null>(null);
    const [debouncedLeft, setDebouncedLeft] = React.useState<string | null>(null);
    const [debouncedRight, setDebouncedRight] = React.useState<string | null>(null);
    /** Last successfully saved content per side — overrides the prop
     *  until the host's content catches up (the host may never
     *  re-render after onSave). */
    const [committedLeft, setCommittedLeft] = React.useState<string | null>(null);
    const [committedRight, setCommittedRight] = React.useState<string | null>(null);
    const [savingSide, setSavingSide] = React.useState<"left" | "right" | null>(null);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    /** Dirty-guard prompt for leaving edit mode (inline row, not
     *  window.confirm). */
    const [pendingExit, setPendingExit] = React.useState<"left" | "right" | null>(null);

    const baselineLeft = committedLeft ?? left.content;
    const baselineRight = committedRight ?? right.content;
    const dirtyLeft = editLeft !== null && editLeft !== baselineLeft;
    const dirtyRight = editRight !== null && editRight !== baselineRight;
    const dirty = dirtyLeft || dirtyRight;

    /* The diff lags the textarea by one debounce so typing stays smooth;
     * the edited pane itself renders the live draft. */
    React.useEffect(() => {
        if (editLeft === null) {
            setDebouncedLeft(null);
            return;
        }
        const t = setTimeout(() => setDebouncedLeft(editLeft), EDIT_DIFF_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [editLeft]);

    React.useEffect(() => {
        if (editRight === null) {
            setDebouncedRight(null);
            return;
        }
        const t = setTimeout(() => setDebouncedRight(editRight), EDIT_DIFF_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [editRight]);

    /* Adopt host content refreshes unless there are unsaved edits (the
     * user's draft wins over an external change). */
    React.useEffect(() => {
        if (editLeft === null || editLeft === left.content) setCommittedLeft(null);
    }, [left.content, editLeft]);

    React.useEffect(() => {
        if (editRight === null || editRight === right.content) setCommittedRight(null);
    }, [right.content, editRight]);

    /* Bubble the dirty state (fire only on actual changes). */
    const lastDirtyRef = React.useRef<boolean | null>(null);
    React.useEffect(() => {
        if (lastDirtyRef.current !== dirty) {
            lastDirtyRef.current = dirty;
            onDirtyChange?.(dirty);
        }
    }, [dirty, onDirtyChange]);

    /* ── Diff computation ── */
    const diffContentLeft = debouncedLeft ?? baselineLeft;
    const diffContentRight = debouncedRight ?? baselineRight;

    const leftLines = React.useMemo(() => diffContentLeft.split("\n"), [diffContentLeft]);
    const rightLines = React.useMemo(() => diffContentRight.split("\n"), [diffContentRight]);

    /* "Ignore whitespace" = git diff -w: lines compare equal with ALL
     * whitespace removed, but render raw (the ops carry indices into the
     * ORIGINAL lines, which is what makes that possible). */
    const normLeft = React.useMemo(
        () => (ignoreWs ? leftLines.map((l) => l.replace(/\s+/g, "")) : leftLines),
        [leftLines, ignoreWs]
    );
    const normRight = React.useMemo(
        () => (ignoreWs ? rightLines.map((l) => l.replace(/\s+/g, "")) : rightLines),
        [rightLines, ignoreWs]
    );

    const ops = React.useMemo(() => lineDiff(normLeft, normRight), [normLeft, normRight]);

    const rows = React.useMemo(
        () => buildAlignedRows(ops, leftLines, rightLines),
        [ops, leftLines, rightLines]
    );

    const cappedRows = React.useMemo(
        () => (rows.length > MAX_RENDER_ROWS ? rows.slice(0, MAX_RENDER_ROWS) : rows),
        [rows]
    );

    const addedCount = React.useMemo(
        () => ops.reduce((n, o) => (o.type === "add" ? n + 1 : n), 0),
        [ops]
    );
    const removedCount = React.useMemo(
        () => ops.reduce((n, o) => (o.type === "remove" ? n + 1 : n), 0),
        [ops]
    );
    const identical = addedCount === 0 && removedCount === 0;

    /* ── Edit / save actions ── */

    const enterEdit = (side: "left" | "right") => {
        setSaveError(null);
        if (side === "left") {
            setEditLeft(baselineLeft);
            setDebouncedLeft(baselineLeft);
        } else {
            setEditRight(baselineRight);
            setDebouncedRight(baselineRight);
        }
    };

    const exitEdit = (side: "left" | "right") => {
        if (side === "left") {
            setEditLeft(null);
            setDebouncedLeft(null);
        } else {
            setEditRight(null);
            setDebouncedRight(null);
        }
    };

    /** Leave edit mode — with a dirty guard (inline prompt) when the
     *  draft differs from the saved baseline. */
    const requestExitEdit = (side: "left" | "right") => {
        if (side === "left" ? dirtyLeft : dirtyRight) setPendingExit(side);
        else exitEdit(side);
    };

    const saveSide = async (side: "left" | "right", close: boolean) => {
        const draft = side === "left" ? editLeft : editRight;
        const handler = side === "left" ? left.onSave : right.onSave;
        if (draft === null || !handler) return;
        setSaveError(null);
        setSavingSide(side);
        try {
            await handler(draft);
            if (side === "left") setCommittedLeft(draft);
            else setCommittedRight(draft);
            if (close) {
                exitEdit(side);
                setPendingExit(null);
            }
        } catch (err) {
            // Stay in edit mode with the draft intact; surface inline.
            setSaveError(err instanceof Error ? err.message : "Save failed.");
            setPendingExit(null);
        } finally {
            setSavingSide(null);
        }
    };

    const discardSide = (side: "left" | "right") => {
        exitEdit(side);
        setPendingExit(null);
    };

    const handleTextareaKeyDown = (
        e: React.KeyboardEvent<HTMLTextAreaElement>,
        side: "left" | "right"
    ) => {
        if (e.key === "Escape") {
            // Escape leaves edit mode first — never let it bubble up to a
            // host handler (e.g. "close tab") while a textarea is focused.
            e.preventDefault();
            e.stopPropagation();
            requestExitEdit(side);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            e.stopPropagation();
            void saveSide(side, false);
        }
    };

    /* ── Synced scrolling (view mode only — a draft's lines no longer
     *    align 1:1 with the other pane's diff rows while editing). ── */
    const leftPaneRef = React.useRef<HTMLDivElement | null>(null);
    const rightPaneRef = React.useRef<HTMLDivElement | null>(null);
    const syncLockRef = React.useRef(0);
    const editingAny = editLeft !== null || editRight !== null;

    const handleScroll = (pos: "left" | "right") => {
        if (editingAny) return;
        const src = pos === "left" ? leftPaneRef.current : rightPaneRef.current;
        const dst = pos === "left" ? rightPaneRef.current : leftPaneRef.current;
        if (!src || !dst || syncLockRef.current) return;
        syncLockRef.current = 1;
        dst.scrollTop = src.scrollTop;
        dst.scrollLeft = src.scrollLeft;
        // Release on the next frame — the programmatic set fires the
        // other pane's onScroll, which must not re-enter.
        requestAnimationFrame(() => {
            syncLockRef.current = 0;
        });
    };

    /* ── Display slots (Swap flips positions, not identities) ── */
    const slotFor = (side: "left" | "right"): SideSlot =>
        side === "left"
            ? {
                key: "left",
                data: left,
                editing: editLeft !== null,
                draft: editLeft,
                dirty: dirtyLeft,
                saving: savingSide === "left",
                setDraft: setEditLeft,
            }
            : {
                key: "right",
                data: right,
                editing: editRight !== null,
                draft: editRight,
                dirty: dirtyRight,
                saving: savingSide === "right",
                setDraft: setEditRight,
            };

    const leftPosSlot = slotFor(swapped ? "right" : "left");
    const rightPosSlot = slotFor(swapped ? "left" : "right");

    /* ── Render helpers ── */

    const renderHeader = (slot: SideSlot, pos: "left" | "right") => (
        <div className="flex min-w-0 items-center gap-1.5 px-2 py-1">
      <span
          className={cn(
              "size-1.5 shrink-0 rounded-full",
              slot.dirty ? "bg-amber-500" : "bg-transparent"
          )}
          title={slot.dirty ? "Unsaved changes" : undefined}
      />
            <FileCode2
                className={cn("size-3.5 shrink-0", pos === "left" ? "text-amber-500" : "text-sky-500")}
            />
            <span className="truncate text-xs font-medium" title={slot.data.label}>
        {slot.data.label || "—"}
      </span>
            <span className="flex-1"/>
            {slot.data.editable && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={slot.saving}
                    onClick={() => (slot.editing ? requestExitEdit(slot.key) : enterEdit(slot.key))}
                    title={slot.editing ? "Finish editing (Esc)" : "Edit this side in place"}
                >
                    {slot.editing ? <Check className="size-3"/> : <Pencil className="size-3"/>}
                    {slot.editing ? "Done" : "Edit"}
                </Button>
            )}
            {slot.data.editable && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={!slot.dirty || slot.saving || !slot.data.onSave}
                    onClick={() => void saveSide(slot.key, false)}
                    title="Save this side (Ctrl+S while editing)"
                >
                    {slot.saving ? <Loader2 className="size-3 animate-spin"/> : <Save className="size-3"/>}
                    Save
                </Button>
            )}
        </div>
    );

    const renderPane = (
        slot: SideSlot,
        ref: React.RefObject<HTMLDivElement | null>,
        pos: "left" | "right"
    ) => (
        <div
            ref={ref}
            onScroll={() => handleScroll(pos)}
            className={cn(
                "relative min-w-0 flex-1 overflow-auto",
                slot.editing && "overflow-hidden"
            )}
            style={{fontFamily: MONO_FONT}}
        >
            {slot.editing ? (
                <textarea
                    value={slot.draft ?? ""}
                    onChange={(e) => slot.setDraft(e.target.value)}
                    onKeyDown={(e) => handleTextareaKeyDown(e, slot.key)}
                    autoFocus
                    spellCheck={false}
                    wrap="off"
                    aria-label={`Edit the ${slot.data.label || slot.key} side`}
                    className="block h-full w-full resize-none bg-background px-2 py-0 text-xs text-foreground outline-none"
                    style={{fontFamily: MONO_FONT, fontSize: "12px", lineHeight: `${LINE_H}px`}}
                />
            ) : (
                <PaneRows rows={cappedRows} side={slot.key}/>
            )}
        </div>
    );

    /* ── Render ── */

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border bg-background">
            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
                <Columns2 className="size-4 shrink-0 text-muted-foreground"/>
                <span className="max-w-[36%] truncate text-sm font-medium" title={title}>
          {title}
        </span>
                {identical ? (
                    <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">
            No differences
          </span>
                ) : (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              +{addedCount}
            </span>
            <span className="font-medium text-red-600 dark:text-red-400">−{removedCount}</span>
            <span className="text-muted-foreground">lines</span>
          </span>
                )}
                <span className="flex-1"/>
                <label
                    className="flex shrink-0 select-none items-center gap-1.5 text-xs text-muted-foreground"
                    title="Compare lines with all whitespace removed (like git diff -w)"
                >
                    <Switch checked={ignoreWs} onCheckedChange={setIgnoreWs} className="scale-90"/>
                    Ignore whitespace
                </label>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    onClick={() => setSwapped((v) => !v)}
                    title="Swap the two sides"
                    aria-label="Swap sides"
                >
                    <ArrowLeftRight className="size-3.5"/>
                    Swap
                </Button>
            </div>

            {/* Inline save error */}
            {saveError && (
                <div
                    className="flex shrink-0 items-center gap-2 border-b bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
                    <TriangleAlert className="size-3.5 shrink-0"/>
                    <span className="min-w-0 flex-1 truncate" title={saveError}>
            Save failed: {saveError}
          </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 shrink-0"
                        onClick={() => setSaveError(null)}
                        aria-label="Dismiss the save error"
                    >
                        <X className="size-3"/>
                    </Button>
                </div>
            )}

            {/* Dirty-guard prompt (Esc / Done with unsaved changes) */}
            {pendingExit && (
                <div
                    className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs">
                    <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"/>
                    <span className="min-w-0 truncate">
            Unsaved changes on the{" "}
                        {(pendingExit === "left" ? left : right).label || pendingExit} side.
          </span>
                    {(pendingExit === "left" ? left : right).onSave && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            disabled={savingSide !== null}
                            onClick={() => void saveSide(pendingExit, true)}
                        >
                            {savingSide === pendingExit ? (
                                <Loader2 className="size-3 animate-spin"/>
                            ) : (
                                <Save className="size-3"/>
                            )}
                            Save
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => discardSide(pendingExit)}
                    >
                        Discard
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setPendingExit(null)}
                    >
                        Keep editing
                    </Button>
                </div>
            )}

            {/* Per-side headers */}
            <div className="grid shrink-0 grid-cols-2 divide-x border-b bg-muted/40">
                {renderHeader(leftPosSlot, "left")}
                {renderHeader(rightPosSlot, "right")}
            </div>

            {/* Side-by-side panes */}
            <div className="flex min-h-0 flex-1 divide-x">
                {renderPane(leftPosSlot, leftPaneRef, "left")}
                {renderPane(rightPosSlot, rightPaneRef, "right")}
            </div>

            {/* Truncation warning */}
            {rows.length > MAX_RENDER_ROWS && (
                <div
                    className="flex shrink-0 items-center gap-2 border-t bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-3.5 shrink-0"/>
                    <span>
            Diff truncated — showing the first {MAX_RENDER_ROWS.toLocaleString()} of{" "}
                        {rows.length.toLocaleString()} rows.
          </span>
                </div>
            )}
        </div>
    );
}
