"use client";

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import {
    ChevronLeft,
    ChevronRight,
    GraduationCap,
    Lightbulb,
    Loader2,
    Pause,
    Play,
    RotateCcw,
    Terminal,
    TriangleAlert,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {configuredInterpreter} from "@/lib/settings";

/**
 * the step-through TUTOR run mode — records one run through
 * POST /api/time-travel, then replays it as a memory-model diagram:
 * a call STACK column, a HEAP column of objects, and reference
 * arrows between them, all in pure SVG (no diagram libraries), with
 * a rule-based plain-language narrator and a terminal pane that
 * accumulates stdout up to the scrubbed step.
 */

/* ── backend contract ─────────────────────────────────────────── */

export type TraceEventKind = "line" | "call" | "return" | "exception";

export interface TimeTravelEvent {
    line: number;
    event: TraceEventKind;
    locals: Record<string, string>;
    func?: string;
}

export interface TimeTravelTrace {
    ok: boolean;
    fileName: string;
    totalEvents: number;
    capped: boolean;
    stdout: Array<{ afterEvent: number; text: string }>;
    events: TimeTravelEvent[];
    error?: string;
}

/** Defensive normalizer — a malformed /api/time-travel body must never
 * crash the panel; unknown shapes degrade to empty events, not NaNs. */
function normalizeTrace(raw: unknown): TimeTravelTrace {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const rawEvents = Array.isArray(obj.events) ? obj.events : [];
    const events: TimeTravelEvent[] = rawEvents.map((e): TimeTravelEvent => {
        const ev = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
        const kind = ev.event;
        const locals: Record<string, string> = {};
        if (typeof ev.locals === "object" && ev.locals !== null) {
            for (const [k, v] of Object.entries(ev.locals as Record<string, unknown>)) {
                locals[k] = typeof v === "string" ? v : String(v);
            }
        }
        return {
            line: typeof ev.line === "number" && Number.isFinite(ev.line) ? Math.max(0, Math.floor(ev.line)) : 0,
            event: kind === "call" || kind === "return" || kind === "exception" ? kind : "line",
            locals,
            func: typeof ev.func === "string" ? ev.func : undefined,
        };
    });
    const rawStdout = Array.isArray(obj.stdout) ? obj.stdout : [];
    const stdout = rawStdout
        .map((d): { afterEvent: number; text: string } | null => {
            if (typeof d === "object" && d !== null) {
                const dd = d as Record<string, unknown>;
                if (typeof dd.text === "string") {
                    return {afterEvent: typeof dd.afterEvent === "number" ? dd.afterEvent : 0, text: dd.text};
                }
            }
            return null;
        })
        .filter((d): d is { afterEvent: number; text: string } => d !== null);
    return {
        ok: obj.ok === true,
        fileName: typeof obj.fileName === "string" ? obj.fileName : "",
        totalEvents: typeof obj.totalEvents === "number" ? obj.totalEvents : events.length,
        capped: obj.capped === true,
        stdout,
        events,
        error: typeof obj.error === "string" ? obj.error : undefined,
    };
}

/* ── shared small helpers (kept local so the panel is standalone) ── */

const EMPTY_EVENTS: TimeTravelEvent[] = [];

function isDunder(name: string): boolean {
    return name.length > 4 && name.startsWith("__") && name.endsWith("__");
}

function visibleLocals(locals: Record<string, string>): Array<[string, string]> {
    return Object.entries(locals).filter(([k]) => !isDunder(k));
}

function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

/** stdout accumulated up to (and including) event `i`. */
function stdoutUpTo(stdout: Array<{ afterEvent: number; text: string }>, i: number): string {
    return stdout
        .filter((d) => d.afterEvent <= i)
        .map((d) => d.text)
        .join("");
}

/* ── stack derivation (pure) ───────────────────────────────────── */

interface DerivedFrame {
    key: string;
    func: string;
    locals: Record<string, string>;
    returning: boolean;
}

/** Frames at step `upto`: calls push, returns pop — but a return at r
 * keeps its frame visible (tinted) AT step r and pops it from r+1 on,
 * so the learner sees the frame "leave" as they scrub past the return. */
function deriveFrames(events: TimeTravelEvent[], upto: number): DerivedFrame[] {
    const frames: DerivedFrame[] = [];
    const pops: number[] = []; // event index whose FOLLOWING event pops the frame
    for (let j = 0; j <= upto && j < events.length; j++) {
        const ev = events[j];
        if (!ev) continue;
        while (pops.length > 0 && pops[0] !== undefined && pops[0] <= j) {
            pops.shift();
            if (frames.length > 0) frames.pop();
        }
        if (ev.event === "call") {
            frames.push({key: `call-${j}`, func: ev.func ?? "<module>", locals: ev.locals, returning: false});
        } else if (ev.event === "return") {
            if (frames.length === 0) {
                frames.push({key: `frame-${j}`, func: ev.func ?? "<module>", locals: ev.locals, returning: true});
            } else {
                const top = frames[frames.length - 1]!;
                top.locals = ev.locals;
                top.returning = true;
                if (ev.func && top.func === "<module>") top.func = ev.func;
            }
            pops.push(j + 1);
        } else {
            // line / exception — execution is in the top frame; a first event
            // without a call (module-level) seeds the frame defensively.
            if (frames.length === 0) {
                frames.push({key: `frame-${j}`, func: ev.func ?? "<module>", locals: ev.locals, returning: false});
            } else {
                const top = frames[frames.length - 1]!;
                top.locals = ev.locals;
                top.returning = false;
                if (ev.func && top.func === "<module>") top.func = ev.func;
            }
        }
    }
    return frames;
}

/* ── minimal repr parsing (pure, unit-testable style) ───────────── */

interface Parsed {
    val: HeapVal;
    repr: string;
}

type HeapVal =
    | { kind: "int" | "float" | "bool" | "none" | "str"; text: string }
    | { kind: "list" | "tuple"; items: Parsed[]; total: number }
    | { kind: "dict"; pairs: Array<{ key: string; value: Parsed }>; total: number }
    | { kind: "other"; text: string };

const PY_ESCAPES: Record<string, string> = {
    "\\": "\\",
    n: "\n",
    t: "\t",
    r: "\r",
    "'": "'",
    '"': '"',
};

function unescapePy(s: string): string {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i]!;
        if (c === "\\" && i + 1 < s.length) {
            const nxt = s[i + 1]!;
            const mapped = PY_ESCAPES[nxt];
            if (mapped !== undefined) {
                out += mapped;
                i++;
                continue;
            }
        }
        out += c;
    }
    return out;
}

/** Split `body` on `sep` at bracket depth 0, quote-aware. */
function splitTopLevel(body: string, sep: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    let quote: string | null = null;
    for (let i = 0; i < body.length; i++) {
        const c = body[i]!;
        if (quote !== null) {
            if (c === "\\") i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            quote = c;
        } else if (c === "[" || c === "(" || c === "{") {
            depth++;
        } else if (c === "]" || c === ")" || c === "}") {
            depth = Math.max(0, depth - 1);
        } else if (c === sep && depth === 0) {
            out.push(body.slice(start, i));
            start = i + 1;
        }
    }
    out.push(body.slice(start));
    return out
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Parse a python repr minimally: scalars, str, list/tuple, dict.
 * Anything else (or too deeply nested) degrades to "other". */
function parseRepr(raw: string, depth: number): Parsed {
    const s = raw.trim();
    if (s === "True" || s === "False") return {val: {kind: "bool", text: s}, repr: s};
    if (s === "None") return {val: {kind: "none", text: "None"}, repr: s};
    if (/^[+-]?\d+$/.test(s)) return {val: {kind: "int", text: s}, repr: s};
    if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(s) && /[.eE]/.test(s)) {
        return {val: {kind: "float", text: s}, repr: s};
    }
    if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
        return {val: {kind: "str", text: unescapePy(s.slice(1, -1))}, repr: s};
    }
    if (depth < 3) {
        if (s.startsWith("[") && s.endsWith("]")) {
            const items = splitTopLevel(s.slice(1, -1), ",").map((p) => parseRepr(p, depth + 1));
            return {val: {kind: "list", items, total: items.length}, repr: s};
        }
        if (s.startsWith("(") && s.endsWith(")")) {
            const items = splitTopLevel(s.slice(1, -1), ",").map((p) => parseRepr(p, depth + 1));
            return {val: {kind: "tuple", items, total: items.length}, repr: s};
        }
        if (s.startsWith("{") && s.endsWith("}")) {
            const pairs = splitTopLevel(s.slice(1, -1), ",").map((entry): { key: string; value: Parsed } => {
                const parts = splitTopLevel(entry, ":");
                if (parts.length < 2) {
                    return {key: truncate(entry, 10), value: parseRepr(entry, depth + 1)};
                }
                const keyParsed = parseRepr(parts[0]!, depth + 1);
                // dict keys render as inline text: unquote strings, raw otherwise
                const keyText = keyParsed.val.kind === "str" ? keyParsed.val.text : truncate(parts[0]!, 10);
                return {key: keyText, value: parseRepr(parts.slice(1).join(":"), depth + 1)};
            });
            return {val: {kind: "dict", pairs, total: pairs.length}, repr: s};
        }
    }
    return {val: {kind: "other", text: truncate(s, 60)}, repr: s};
}

/* ── memory-model layout (pure) ────────────────────────────────── */
/* viewBox geometry: stack column left, heap in two columns right
 * (col A = objects referenced straight from a stack local, col B =
 * values referenced only through a list slot / dict row). */

const STACK_X = 16;
const STACK_W = 248;
const FRAME_HEADER = 26;
const CHIP_H = 22;
const FRAME_GAP = 12;
const STACK_TOP = 34;
const COL_A_X = 330;
const COL_A_W = 190;
const COL_A_TOP = 34;
const COL_B_X = 544;
const COL_B_W = 112;
const COL_B_TOP = 34;
const VIEW_W = 672;
const MAX_FRAME_LOCALS = 10;
const MAX_LIST_SLOTS = 8;
const MAX_DICT_SLOTS = 6;

const KIND_LABEL: Record<HeapVal["kind"], string> = {
    int: "int",
    float: "float",
    bool: "bool",
    none: "None",
    str: "str",
    list: "list",
    tuple: "tuple",
    dict: "dict",
    other: "object",
};

interface Chip {
    name: string;
    value: string;
    cy: number;
}

interface LaidFrame {
    key: string;
    func: string;
    x: number;
    y: number;
    w: number;
    h: number;
    chips: Chip[];
    moreLocals: number;
    returning: boolean;
    current: boolean;
    empty: boolean;
}

interface SlotRow {
    label: string;
    targetId: string;
    cy: number;
}

interface LaidNode {
    id: string;
    kind: HeapVal["kind"];
    text: string; // main value / repr text
    shape: "circle" | "pill" | "box";
    x: number;
    cx: number;
    y: number;
    w: number;
    r: number;
    shapeH: number; // shape only
    boxH: number; // shape + type-label strip
    labelY: number;
    slots: SlotRow[];
    slotMore: number;
    refs: number;
}

interface LaidEdge {
    d: string;
    ax: number;
    ay: number;
    deg: number;
    emphasis: boolean;
}

interface Diagram {
    width: number;
    height: number;
    frames: LaidFrame[];
    nodes: LaidNode[];
    edges: LaidEdge[];
}

type ScalarVal = Extract<HeapVal, { kind: "int" | "float" | "bool" | "none" | "str" }>;
type ContainerVal = Extract<HeapVal, { kind: "list" | "tuple" | "dict" }>;
type ListLikeVal = Extract<HeapVal, { kind: "list" | "tuple" }>;
type DictVal = Extract<HeapVal, { kind: "dict" }>;

function isListLike(val: ContainerVal): val is ListLikeVal {
    return val.kind !== "dict";
}

function isScalar(val: HeapVal): val is ScalarVal {
    return val.kind !== "list" && val.kind !== "tuple" && val.kind !== "dict" && val.kind !== "other";
}

function isContainer(val: HeapVal): val is ContainerVal {
    return val.kind === "list" || val.kind === "tuple" || val.kind === "dict";
}

function buildDiagram(frames: DerivedFrame[]): Diagram {
    /* pass 1 — lay the stack frames and their local chips */
    const laidFrames: LaidFrame[] = [];
    const chipRefs: Array<{ chip: Chip; id: string; frameIdx: number }> = [];
    const seeds = new Map<string, { val: HeapVal; repr: string }>();
    // scalars dedupe by value (python interns small ints / common strings —
    // one node, many arrows, identity made visible); containers dedupe by
    // repr so the SAME list passed into a call renders as one shared node.
    const register = (val: HeapVal, repr: string): string => {
        const id = isScalar(val) ? `${val.kind}:${val.text}` : `r:${repr}`;
        if (!seeds.has(id)) seeds.set(id, {val, repr});
        return id;
    };

    let fy = STACK_TOP;
    for (let fi = 0; fi < frames.length; fi++) {
        const f = frames[fi]!;
        const entries = visibleLocals(f.locals);
        const shown = entries.slice(0, MAX_FRAME_LOCALS);
        const more = entries.length - shown.length;
        const h =
            FRAME_HEADER + shown.length * CHIP_H + (more > 0 ? 16 : 0) + (entries.length === 0 ? 14 : 0) + 8;
        const chips: Chip[] = shown.map(([name, value], i) => ({
            name,
            value,
            cy: fy + FRAME_HEADER + i * CHIP_H + CHIP_H / 2,
        }));
        for (const chip of chips) {
            const id = register(parseRepr(chip.value, 0).val, chip.value);
            chipRefs.push({chip, id, frameIdx: fi});
        }
        laidFrames.push({
            key: f.key,
            func: f.func,
            x: STACK_X,
            y: fy,
            w: STACK_W,
            h,
            chips,
            moreLocals: more,
            returning: f.returning,
            current: fi === frames.length - 1,
            empty: entries.length === 0,
        });
        fy += h + FRAME_GAP;
    }

    /* pass 2 — expand container nodes: each slot references an element node */
    interface InnerRef {
        containerId: string;
        row: number;
        label: string;
        targetId: string;
    }

    const innerRefs: InnerRef[] = [];
    const colBOrder: string[] = [];
    const colBSeen = new Set<string>();
    const chipIds = new Set(chipRefs.map((r) => r.id));
    const enqueueColB = (id: string) => {
        if (!chipIds.has(id) && !colBSeen.has(id)) {
            colBSeen.add(id);
            colBOrder.push(id);
        }
    };
    for (const [id, seed] of seeds) {
        const val = seed.val;
        if (!isContainer(val)) continue;
        // only containers referenced straight from the stack render slots —
        // nested ones are compact boxes, so their children stay inline text
        if (!chipIds.has(id)) continue;
        if (isListLike(val)) {
            const shown = Math.min(val.items.length, MAX_LIST_SLOTS);
            for (let i = 0; i < shown; i++) {
                const child = val.items[i]!;
                const childId = register(child.val, child.repr);
                enqueueColB(childId);
                innerRefs.push({containerId: id, row: i, label: String(i), targetId: childId});
            }
        } else {
            const shown = Math.min(val.pairs.length, MAX_DICT_SLOTS);
            for (let i = 0; i < shown; i++) {
                const pair = val.pairs[i]!;
                const childId = register(pair.value.val, pair.value.repr);
                enqueueColB(childId);
                innerRefs.push({containerId: id, row: i, label: pair.key, targetId: childId});
            }
        }
    }

    /* pass 3 — column assignment: col A = referenced straight from the stack */
    const colAList = [...chipIds];

    /* pass 4 — order col A by the y of its lowest referencing chip, so the
     * reference arrows fan out in roughly parallel bands instead of crossing */
    const minCy = new Map<string, number>();
    for (const r of chipRefs) {
        const cur = minCy.get(r.id);
        if (cur === undefined || r.chip.cy < cur) minCy.set(r.id, r.chip.cy);
    }
    colAList.sort((a, b) => (minCy.get(a) ?? 0) - (minCy.get(b) ?? 0));

    /* pass 5 — stack both heap columns */
    const laid = new Map<string, LaidNode>();
    const layScalar = (id: string, val: ScalarVal, col: 0 | 1, y: number): LaidNode => {
        if (val.kind === "str") {
            const maxChars = col === 0 ? 24 : 13;
            const text = truncate(val.text, maxChars);
            const w = Math.min(col === 0 ? COL_A_W - 8 : COL_B_W, Math.max(46, 26 + text.length * 6.2));
            const x = (col === 0 ? COL_A_X : COL_B_X) + ((col === 0 ? COL_A_W : COL_B_W) - w) / 2;
            const shapeH = col === 0 ? 26 : 22;
            return {
                id, kind: val.kind, text, shape: "pill",
                x, cx: x + w / 2, y, w, r: 0, shapeH,
                boxH: shapeH + 12, labelY: y + shapeH + 9,
                slots: [], slotMore: 0, refs: 0,
            };
        }
        const r = col === 0 ? 17 : 14;
        const colX = col === 0 ? COL_A_X : COL_B_X;
        const colW = col === 0 ? COL_A_W : COL_B_W;
        const text = truncate(val.text, col === 0 ? 14 : 9);
        return {
            id, kind: val.kind, text, shape: "circle",
            x: colX + (colW - r * 2) / 2, cx: colX + colW / 2, y, w: r * 2, r,
            shapeH: r * 2, boxH: r * 2 + 12, labelY: y + r * 2 + 9,
            slots: [], slotMore: 0, refs: 0,
        };
    };
    const layContainer = (id: string, val: ContainerVal, repr: string, col: 0 | 1, y: number): LaidNode => {
        const kind = val.kind;
        if (col === 1) {
            // nested containers render compact — their own repr in a small box
            return {
                id, kind, text: truncate(repr, 13), shape: "box",
                x: COL_B_X, cx: COL_B_X + COL_B_W / 2, y, w: COL_B_W, r: 0,
                shapeH: 22, boxH: 34, labelY: y + 31,
                slots: [], slotMore: 0, refs: 0,
            };
        }
        const pairs: Array<{ label: string; childId: string }> = [];
        let total = 0;
        if (isListLike(val)) {
            total = val.total;
            const shown = Math.min(val.items.length, MAX_LIST_SLOTS);
            for (let i = 0; i < shown; i++) pairs.push({
                label: String(i),
                childId: register(val.items[i]!.val, val.items[i]!.repr)
            });
        } else {
            total = val.total;
            const shown = Math.min(val.pairs.length, MAX_DICT_SLOTS);
            for (let i = 0; i < shown; i++) pairs.push({
                label: val.pairs[i]!.key,
                childId: register(val.pairs[i]!.value.val, val.pairs[i]!.value.repr)
            });
        }
        const shownRows = pairs.length;
        const slotMore = Math.max(0, total - shownRows);
        const shapeH = 22 + shownRows * 20 + (slotMore > 0 ? 16 : 0) + 6;
        const slots: SlotRow[] = pairs.map((p, i) => ({
            label: p.label,
            targetId: p.childId,
            cy: y + 22 + i * 20 + 10,
        }));
        return {
            id, kind, text: "", shape: "box",
            x: COL_A_X, cx: COL_A_X + COL_A_W / 2, y, w: COL_A_W, r: 0,
            shapeH, boxH: shapeH, labelY: -1,
            slots, slotMore, refs: 0,
        };
    };
    const layOther = (id: string, repr: string, col: 0 | 1, y: number): LaidNode => {
        if (col === 0) {
            return {
                id, kind: "other", text: truncate(repr, 26), shape: "box",
                x: COL_A_X, cx: COL_A_X + COL_A_W / 2, y, w: COL_A_W, r: 0,
                shapeH: 24, boxH: 36, labelY: y + 33,
                slots: [], slotMore: 0, refs: 0,
            };
        }
        return {
            id, kind: "other", text: truncate(repr, 13), shape: "box",
            x: COL_B_X, cx: COL_B_X + COL_B_W / 2, y, w: COL_B_W, r: 0,
            shapeH: 22, boxH: 34, labelY: y + 31,
            slots: [], slotMore: 0, refs: 0,
        };
    };

    let ya = COL_A_TOP;
    for (const id of colAList) {
        const seed = seeds.get(id);
        if (!seed) continue;
        const val = seed.val;
        let n: LaidNode;
        if (isScalar(val)) n = layScalar(id, val, 0, ya);
        else if (isContainer(val)) n = layContainer(id, val, seed.repr, 0, ya);
        else n = layOther(id, seed.repr, 0, ya);
        laid.set(id, n);
        ya += n.boxH + 14;
    }
    let yb = COL_B_TOP;
    for (const id of colBOrder) {
        const seed = seeds.get(id);
        if (!seed) continue;
        const val = seed.val;
        let n: LaidNode;
        if (isScalar(val)) n = layScalar(id, val, 1, yb);
        else if (isContainer(val)) n = layContainer(id, val, seed.repr, 1, yb);
        else n = layOther(id, seed.repr, 1, yb);
        laid.set(id, n);
        yb += n.boxH + 14;
    }

    /* pass 6 — reference edges. Ports fan along the target's left/top edge
     * so several arrows into one shared node stay distinguishable. */
    const incoming = new Map<string, Array<{ x1: number; y1: number; emphasis: boolean; mode: "left" | "top" }>>();
    const pushIncoming = (targetId: string, e: { x1: number; y1: number; emphasis: boolean; mode: "left" | "top" }) => {
        const list = incoming.get(targetId);
        if (list) list.push(e);
        else incoming.set(targetId, [e]);
    };
    for (const r of chipRefs) {
        pushIncoming(r.id, {
            x1: STACK_X + STACK_W + 2,
            y1: r.chip.cy,
            emphasis: r.frameIdx === laidFrames.length - 1,
            mode: "left",
        });
    }
    for (const ir of innerRefs) {
        const container = laid.get(ir.containerId);
        const target = laid.get(ir.targetId);
        if (!container || !target) continue;
        const slot = container.slots[ir.row];
        if (!slot) continue;
        // a slot pointing at a value that is ALSO a stack local (col A)
        // wraps over the node's top edge; col-B targets enter from the left.
        pushIncoming(ir.targetId, {
            x1: container.x + container.w + 2,
            y1: slot.cy,
            emphasis: false,
            mode: chipIds.has(ir.targetId) ? "top" : "left",
        });
    }
    const edges: LaidEdge[] = [];
    const refsCount = new Map<string, number>();
    for (const [targetId, list] of incoming) {
        refsCount.set(targetId, list.length);
        const n = laid.get(targetId);
        if (!n) continue;
        const sorted = [...list].sort((a, b) => a.y1 - b.y1);
        const lefts = sorted.filter((e) => e.mode === "left");
        const tops = sorted.filter((e) => e.mode === "top");
        lefts.forEach((e, i) => {
            const py = n.y + (n.shapeH * (i + 1)) / (lefts.length + 1);
            const x2 = n.x;
            const dx = Math.max(30, Math.abs(x2 - e.x1) * 0.5);
            const c1x = e.x1 + dx;
            const c2x = x2 - dx;
            // control P2 shares the target y → the end tangent is horizontal,
            // so the arrowhead points straight into the left edge.
            edges.push({
                d: `M ${e.x1} ${e.y1} C ${c1x} ${e.y1}, ${c2x} ${py}, ${x2} ${py}`,
                ax: x2,
                ay: py,
                deg: 0,
                emphasis: e.emphasis,
            });
        });
        tops.forEach((e, i) => {
            const px = n.x + (n.w * (i + 1)) / (tops.length + 1);
            const x2 = px;
            const y2 = n.y - 1;
            // end tangent is vertical (pointing down into the top edge)
            edges.push({
                d: `M ${e.x1} ${e.y1} C ${e.x1 + 46} ${e.y1}, ${x2} ${y2 - 46}, ${x2} ${y2}`,
                ax: x2,
                ay: y2,
                deg: 90,
                emphasis: e.emphasis,
            });
        });
    }

    const height = Math.max(fy, ya, yb) + 12;
    return {
        width: VIEW_W,
        height: Math.max(height, 120),
        frames: laidFrames,
        nodes: [...laid.values()].map((n) => ({...n, refs: refsCount.get(n.id) ?? 0})),
        edges,
    };
}

/* ── rule-based narrator (pure) ─────────────────────────────────── */

function fmtNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function shortVal(v: string, n = 18): string {
    return truncate(v, n);
}

/** Plain-language description of the current event, driven by the event
 * kind, the source line text and the locals before/after. */
function narrate(
    ev: TimeTravelEvent,
    prev: TimeTravelEvent | undefined,
    srcLine: string | undefined,
    printedNow: string
): string {
    const fn = ev.func && ev.func !== "<module>" ? ev.func : "the module";
    if (ev.event === "call") {
        if (fn === "the module") return "The program starts — the module frame opens.";
        const params = visibleLocals(ev.locals)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${shortVal(v, 10)}`)
            .join(", ");
        return params ? `Calling ${fn} with ${params}.` : `Calling ${fn} with no arguments.`;
    }
    if (ev.event === "return") {
        const ret = ev.locals["__return__"];
        if (ret !== undefined) return `${fn} returns ${shortVal(ret)} — its frame goes away.`;
        return `${fn} finishes — its frame goes away.`;
    }
    if (ev.event === "exception") {
        return `An exception is raised on line ${ev.line} — the run stops there.`;
    }
    const line = (srcLine ?? "").trim();
    const defMatch = /^def\s+([A-Za-z_]\w*)/.exec(line);
    if (defMatch) return `Line ${ev.line} defines the function ${defMatch[1]} — calling it opens a new frame.`;
    const classMatch = /^class\s+([A-Za-z_]\w*)/.exec(line);
    if (classMatch) return `Line ${ev.line} defines the class ${classMatch[1]}.`;
    if (/^print\s*\(/.test(line)) {
        return printedNow
            ? `Line ${ev.line} prints "${shortVal(printedNow.trim(), 22)}" to the terminal below.`
            : `Line ${ev.line} prepares a print — the text lands once the line finishes.`;
    }
    const aug = /^([A-Za-z_]\w*)\s*([+\-*/%]{1,2})=(?!=)/.exec(line);
    if (aug) {
        const name = aug[1]!;
        const op = aug[2]!;
        const to = ev.locals[name];
        const from = prev?.locals?.[name];
        if (to !== undefined && from !== undefined) {
            const a = Number(from);
            const b = Number(to);
            if (Number.isFinite(a) && Number.isFinite(b)) {
                const d = b - a;
                if (op === "+" && d >= 0) return `Line ${ev.line} adds ${fmtNum(d)} to ${name}, so ${name} becomes ${shortVal(to)}.`;
                if (op === "-" && d <= 0) return `Line ${ev.line} subtracts ${fmtNum(-d)} from ${name}, so ${name} becomes ${shortVal(to)}.`;
                if (op === "*") return `Line ${ev.line} multiplies ${name}, so it becomes ${shortVal(to)}.`;
            }
            return `Line ${ev.line} updates ${name} with ${op}=, so it becomes ${shortVal(to)}.`;
        }
        return `Line ${ev.line} runs the ${op}= step on ${name}.`;
    }
    const assign = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(line);
    if (assign) {
        const name = assign[1]!;
        const to = ev.locals[name];
        if (to !== undefined) {
            const existed = prev?.locals?.[name] !== undefined;
            return existed
                ? `Line ${ev.line} sets ${name} to ${shortVal(to)}.`
                : `Line ${ev.line} creates ${name} and sets it to ${shortVal(to)}.`;
        }
        return `Line ${ev.line} assigns to ${name}.`;
    }
    if (/^if\b/.test(line)) return `Line ${ev.line} tests a condition — the indented block runs when it holds.`;
    if (/^while\b/.test(line)) return `Line ${ev.line} checks the loop condition for another lap.`;
    const forMatch = /^for\s+([A-Za-z_]\w*)/.exec(line);
    if (forMatch) {
        const v = ev.locals[forMatch[1]!];
        return v !== undefined
            ? `Line ${ev.line} advances the loop — ${forMatch[1]} is now ${shortVal(v)}.`
            : `Line ${ev.line} starts a for loop.`;
    }
    if (/^return\b/.test(line)) return `Line ${ev.line} gets ready to return from ${fn}.`;
    return `Line ${ev.line} runs inside ${fn}.`;
}

/* ── custom scrollbar styling (matches the app's thin rails) ───── */

const SCROLLBAR =
    " [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent";

/* ── the panel ──────────────────────────────────────────────────── */

export interface TutorViewProps {
    active: boolean;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    code?: string;
    onGoToLine?: (line: number) => void;
}

export function TutorView({active, folderSlug, fileSlug, fileName, code, onGoToLine}: TutorViewProps) {
    const {toast} = useToast();
    const [trace, setTrace] = React.useState<TimeTravelTrace | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [step, setStep] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);

    // a different file must never replay the previous file's recording
    React.useEffect(() => {
        setTrace(null);
        setError(null);
        setStep(0);
        setPlaying(false);
    }, [folderSlug, fileSlug]);

    const events = trace?.events ?? EMPTY_EVENTS;
    const total = events.length;
    const idx = total > 0 ? Math.min(step, total - 1) : 0;
    const ev = total > 0 ? events[idx] : undefined;
    const srcLines = React.useMemo(() => (code ?? "").split(/\r?\n/), [code]);
    const lineText = ev && ev.line >= 1 ? srcLines[ev.line - 1]?.trim() : undefined;

    const frames = React.useMemo(() => deriveFrames(events, idx), [events, idx]);
    const diagram = React.useMemo(() => buildDiagram(frames), [frames]);
    const printedNow = React.useMemo(
        () =>
            (trace?.stdout ?? [])
                .filter((d) => d.afterEvent === idx)
                .map((d) => d.text)
                .join(""),
        [trace, idx]
    );
    const narration = React.useMemo(
        () => (ev ? narrate(ev, idx > 0 ? events[idx - 1] : undefined, lineText, printedNow) : ""),
        [ev, events, idx, lineText, printedNow]
    );
    const stdoutText = React.useMemo(
        () => (trace ? stdoutUpTo(trace.stdout, idx) : ""),
        [trace, idx]
    );

    const record = React.useCallback(async (): Promise<void> => {
        setBusy(true);
        setError(null);
        setPlaying(false);
        try {
            const interpreter = configuredInterpreter();
            const res = await fetch("/api/time-travel", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    ...(code ? {code} : {}),
                    ...(interpreter ? {interpreter} : {}),
                }),
            });
            const json: unknown = await res.json().catch(() => null);
            const normalized = normalizeTrace(json);
            if (!res.ok || !normalized.ok) {
                setError(normalized.error ?? `HTTP ${res.status}`);
                setTrace(null);
                toast({
                    title: "Recording failed",
                    description: normalized.error ?? `The tracer could not record ${fileName} (HTTP ${res.status}).`,
                    variant: "destructive",
                });
            } else {
                setTrace(normalized);
                setStep(0);
                toast({
                    title: "Run recorded",
                    description:
                        normalized.events.length > 0
                            ? `${normalized.events.length} events captured — scrub through them below.`
                            : "The run produced no traceable events.",
                });
            }
        } catch (err) {
            const message = (err as Error).message;
            setError(message);
            setTrace(null);
            toast({title: "Recording failed", description: message, variant: "destructive"});
        } finally {
            setBusy(false);
        }
    }, [folderSlug, fileSlug, code, fileName, toast]);

    // auto-advance at 800ms — a timeout keyed on the current step avoids
    // stale-closure drift and stops cleanly at the last event.
    React.useEffect(() => {
        if (!playing || total < 2) return;
        if (idx >= total - 1) {
            setPlaying(false);
            return;
        }
        const t = window.setTimeout(() => setStep(idx + 1), 800);
        return () => window.clearTimeout(t);
    }, [playing, idx, total]);

    const togglePlay = () => {
        if (total < 2) return;
        if (!playing && idx >= total - 1) setStep(0); // replay from the top
        setPlaying((p) => !p);
    };

    /* ── render ──────────────────────────────────────────────────── */

    const recordButton = (label: string) => (
        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void record()}>
            {busy ? <Loader2 className="size-3 animate-spin"/> : <RotateCcw className="size-3"/>}
            {label}
        </Button>
    );

    let body: React.ReactNode;
    if (busy) {
        body = (
            <div className="flex-1 min-h-0 flex flex-col gap-3 p-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden/>
                    Recording the run — the tracer executes {fileName} and captures every event…
                </div>
                <Skeleton className="h-8 w-2/3 rounded-md"/>
                <Skeleton className="h-48 w-full rounded-md"/>
                <Skeleton className="h-4 w-1/2 rounded"/>
                <Skeleton className="h-16 w-full rounded-md"/>
            </div>
        );
    } else if (error) {
        body = (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="max-w-md rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
                   role="alert">
                    {error}
                </p>
                {recordButton("Try again")}
            </div>
        );
    } else if (!trace) {
        body = (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-muted/60 p-3">
                    <GraduationCap className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden/>
                </div>
                <p className="text-sm font-semibold">Step-through tutor</p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Run once, then scrub every step — see the stack, the heap and the references at any point.
                </p>
                {recordButton("Record a run")}
            </div>
        );
    } else if (total === 0) {
        body = (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    The recording finished with 0 events — nothing traceable executed in this run.
                </p>
                {recordButton("Re-record")}
            </div>
        );
    } else {
        body = (
            <div className="flex-1 min-h-0 flex flex-col gap-2.5 px-4 pb-4">
                {/* current source line — click jumps the editor */}
                {ev &&
                    (onGoToLine ? (
                        <button
                            type="button"
                            onClick={() => onGoToLine(ev.line)}
                            className="group flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/70"
                            aria-label={`Jump to line ${ev.line} in the editor`}
                        >
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                L{ev.line}
              </span>
                            <span className="flex-1 truncate font-mono text-xs text-foreground">
                {lineText || "(source line unavailable)"}
              </span>
                            <span
                                className="text-[9px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                jump
              </span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                L{ev.line}
              </span>
                            <span className="flex-1 truncate font-mono text-xs text-foreground">
                {lineText || "(source line unavailable)"}
              </span>
                        </div>
                    ))}

                {/* memory model — pure SVG */}
                <div
                    className={cn(
                        "flex-1 min-h-[240px] rounded-md border bg-muted/20 p-2 overflow-auto",
                        SCROLLBAR.trim()
                    )}
                >
                    <svg
                        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
                        className="block h-auto w-full min-w-[600px]"
                        role="img"
                        aria-label={`Memory model at step ${idx + 1}: call stack frames on the left, heap objects on the right, reference arrows between them`}
                    >
                        <g className="text-muted-foreground" fill="currentColor">
                            <text x={STACK_X} y={14} fontSize={9} letterSpacing={1.2} fontWeight={600}>
                                CALL STACK
                            </text>
                            <text x={COL_A_X} y={14} fontSize={9} letterSpacing={1.2} fontWeight={600}>
                                HEAP — OBJECTS
                            </text>
                        </g>
                        {/* reference edges under the boxes */}
                        <g className="text-muted-foreground" fill="none">
                            {diagram.edges.map((e, i) => (
                                <g key={`e-${i}`} className={e.emphasis ? "text-foreground" : undefined}>
                                    <path
                                        d={e.d}
                                        stroke="currentColor"
                                        strokeOpacity={e.emphasis ? 0.7 : 0.4}
                                        strokeWidth={e.emphasis ? 1.5 : 1.1}
                                        fill="none"
                                    />
                                    <path
                                        d="M0 0 L-9 4.2 L-9 -4.2 Z"
                                        transform={`translate(${e.ax} ${e.ay}) rotate(${e.deg})`}
                                        fill="currentColor"
                                        fillOpacity={0.8}
                                        stroke="none"
                                    />
                                </g>
                            ))}
                        </g>
                        {/* stack frames — returning frames animate out */}
                        <AnimatePresence initial={false}>
                            {diagram.frames.map((f) => (
                                <motion.g
                                    key={f.key}
                                    initial={{opacity: 0, y: 14}}
                                    animate={{opacity: 1, y: 0}}
                                    exit={{opacity: 0, y: -16, transition: {duration: 0.22}}}
                                    transition={{duration: 0.2}}
                                >
                                    <rect
                                        x={f.x}
                                        y={f.y}
                                        width={f.w}
                                        height={f.h}
                                        rx={8}
                                        className={cn(
                                            f.returning
                                                ? "text-amber-600 dark:text-amber-400"
                                                : f.current
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-foreground"
                                        )}
                                        fill="currentColor"
                                        fillOpacity={f.current || f.returning ? 0.05 : 0.03}
                                        stroke="currentColor"
                                        strokeOpacity={f.current || f.returning ? 0.8 : 0.3}
                                        strokeWidth={f.current || f.returning ? 1.5 : 1}
                                    />
                                    <text
                                        x={f.x + 10}
                                        y={f.y + 16}
                                        fontSize={11}
                                        fontWeight={600}
                                        fill="currentColor"
                                        className={f.current ? "text-foreground" : "text-muted-foreground"}
                                    >
                                        {truncate(f.func, 24)}
                                    </text>
                                    {f.chips.map((c) => (
                                        <g key={c.name}>
                                            <rect
                                                x={f.x + 6}
                                                y={c.cy - 9}
                                                width={f.w - 12}
                                                height={18}
                                                rx={4}
                                                className="text-foreground"
                                                fill="currentColor"
                                                fillOpacity={0.06}
                                                stroke="none"
                                            />
                                            <text x={f.x + 12} y={c.cy + 3.5} fontSize={10} fill="currentColor"
                                                  className="text-foreground">
                                                {truncate(c.name, 15)}
                                            </text>
                                            <text x={f.x + 106} y={c.cy + 3.5} fontSize={9.5} fill="currentColor"
                                                  className="text-muted-foreground font-mono">
                                                {truncate(c.value, 24)}
                                            </text>
                                        </g>
                                    ))}
                                    {f.moreLocals > 0 && (
                                        <text x={f.x + 10} y={f.y + f.h - 6} fontSize={8.5} fill="currentColor"
                                              className="text-muted-foreground">
                                            +{f.moreLocals} more local{f.moreLocals === 1 ? "" : "s"}
                                        </text>
                                    )}
                                    {f.empty && (
                                        <text x={f.x + 10} y={f.y + 26 + 6} fontSize={8.5} fill="currentColor"
                                              className="text-muted-foreground">
                                            (no locals yet)
                                        </text>
                                    )}
                                </motion.g>
                            ))}
                        </AnimatePresence>
                        {/* heap nodes — scalars as circles/pills, containers as boxes */}
                        <AnimatePresence initial={false}>
                            {diagram.nodes.map((n) => (
                                <motion.g
                                    key={n.id}
                                    initial={{opacity: 0}}
                                    animate={{opacity: 1}}
                                    exit={{opacity: 0}}
                                    transition={{duration: 0.18}}
                                >
                                    <g className="text-foreground">
                                        {n.shape === "circle" && (
                                            <>
                                                <circle
                                                    cx={n.cx}
                                                    cy={n.y + n.shapeH / 2}
                                                    r={n.r}
                                                    className="text-foreground"
                                                    stroke="currentColor"
                                                    strokeOpacity={0.5}
                                                    strokeWidth={1.2}
                                                    fill="currentColor"
                                                    fillOpacity={0.05}
                                                />
                                                <text
                                                    x={n.cx}
                                                    y={n.y + n.shapeH / 2 + 3.5}
                                                    textAnchor="middle"
                                                    fontSize={10.5}
                                                    fill="currentColor"
                                                    className="font-mono"
                                                >
                                                    {n.text}
                                                </text>
                                            </>
                                        )}
                                        {n.shape === "pill" && (
                                            <>
                                                <rect
                                                    x={n.x}
                                                    y={n.y}
                                                    width={n.w}
                                                    height={n.shapeH}
                                                    rx={n.shapeH / 2}
                                                    stroke="currentColor"
                                                    strokeOpacity={0.5}
                                                    strokeWidth={1.2}
                                                    fill="currentColor"
                                                    fillOpacity={0.05}
                                                />
                                                <text
                                                    x={n.cx}
                                                    y={n.y + n.shapeH / 2 + 3.5}
                                                    textAnchor="middle"
                                                    fontSize={10}
                                                    fill="currentColor"
                                                    className="font-mono"
                                                >
                                                    {n.text}
                                                </text>
                                            </>
                                        )}
                                        {n.shape === "box" &&
                                            (n.kind === "list" || n.kind === "tuple" || n.kind === "dict" ? (
                                                <>
                                                    <rect
                                                        x={n.x}
                                                        y={n.y}
                                                        width={n.w}
                                                        height={n.shapeH}
                                                        rx={7}
                                                        stroke="currentColor"
                                                        strokeOpacity={0.4}
                                                        strokeWidth={1.1}
                                                        fill="currentColor"
                                                        fillOpacity={0.03}
                                                    />
                                                    <text x={n.x + 8} y={n.y + 13} fontSize={8} letterSpacing={0.8}
                                                          fill="currentColor" className="text-muted-foreground">
                                                        {KIND_LABEL[n.kind]}
                                                        {n.kind !== "dict" && n.slotMore === 0 && n.slots.length > 0 ? ` · ${n.slots.length}` : ""}
                                                    </text>
                                                    {n.slots.map((s) => (
                                                        <text
                                                            key={s.label}
                                                            x={n.x + 10}
                                                            y={s.cy + 3}
                                                            fontSize={9}
                                                            fill="currentColor"
                                                            className="font-mono text-muted-foreground"
                                                        >
                                                            {truncate(s.label, 10)}
                                                        </text>
                                                    ))}
                                                    {n.slotMore > 0 && (
                                                        <text
                                                            x={n.x + 10}
                                                            y={n.y + 22 + n.slots.length * 20 + 10}
                                                            fontSize={8.5}
                                                            fill="currentColor"
                                                            className="text-muted-foreground"
                                                        >
                                                            +{n.slotMore} more
                                                        </text>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <rect
                                                        x={n.x}
                                                        y={n.y}
                                                        width={n.w}
                                                        height={n.shapeH}
                                                        rx={5}
                                                        stroke="currentColor"
                                                        strokeOpacity={0.4}
                                                        strokeWidth={1.1}
                                                        fill="currentColor"
                                                        fillOpacity={0.03}
                                                    />
                                                    <text
                                                        x={n.cx}
                                                        y={n.y + n.shapeH / 2 + 3.5}
                                                        textAnchor="middle"
                                                        fontSize={9}
                                                        fill="currentColor"
                                                        className="font-mono text-muted-foreground"
                                                    >
                                                        {n.text}
                                                    </text>
                                                </>
                                            ))}
                                        {/* subtle type label — the "identity" tag under each node */}
                                        {n.labelY >= 0 && (
                                            <text
                                                x={n.cx}
                                                y={n.labelY}
                                                textAnchor="middle"
                                                fontSize={8}
                                                fill="currentColor"
                                                className="text-muted-foreground"
                                            >
                                                {KIND_LABEL[n.kind]}
                                                {n.refs > 1 ? ` · ${n.refs} refs` : ""}
                                            </text>
                                        )}
                                    </g>
                                </motion.g>
                            ))}
                        </AnimatePresence>
                    </svg>
                </div>

                {/* plain-language narration */}
                <p
                    className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs leading-relaxed text-foreground"
                    aria-live="polite"
                >
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden/>
                    {narration}
                </p>

                {/* stdout accumulated up to the current step */}
                <div className="shrink-0 overflow-hidden rounded-md border bg-muted/30">
                    <div className="flex items-center gap-1.5 border-b bg-muted/50 px-2 py-1">
                        <Terminal className="size-3 text-muted-foreground" aria-hidden/>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Terminal — up to step {idx + 1}
            </span>
                    </div>
                    <pre
                        className={cn(
                            "min-h-[36px] max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed",
                            SCROLLBAR.trim()
                        )}
                        aria-label="Program output accumulated up to the current step"
                    >
            {stdoutText || <span className="text-muted-foreground">no output yet at this step</span>}
          </pre>
                </div>
            </div>
        );
    }

    return (
        <section
            aria-label={`Step-through tutor for ${fileName}`}
            className={cn("flex h-full min-h-0 flex-col", active ? "flex" : "hidden")}
        >
            {/* header row */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                <GraduationCap className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden/>
                <p className="text-sm font-semibold">Step-through tutor</p>
                <Badge variant="secondary" className="max-w-[220px] truncate text-[10px] font-normal" title={fileName}>
                    {fileName}
                </Badge>
                {trace && (
                    <Badge variant="outline" className="text-[10px]">
                        {total} events
                    </Badge>
                )}
                {trace?.capped && (
                    <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                        title={`The tracer stopped after ${trace.totalEvents} events — the tail of the run was not recorded.`}
                    >
                        <TriangleAlert className="size-3" aria-hidden/>
                        capped at {trace.totalEvents} events
                    </Badge>
                )}
                {trace && <div className="ml-auto">{recordButton("Re-record")}</div>}
            </div>

            {/* step scrubber — shown once a recording exists */}
            {trace && total > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label="Previous step"
                            disabled={idx <= 0}
                            onClick={() => setStep(Math.max(0, idx - 1))}
                        >
                            <ChevronLeft className="size-3.5"/>
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={playing ? "Pause auto-advance" : "Play auto-advance"}
                            disabled={total < 2}
                            onClick={togglePlay}
                        >
                            {playing ? <Pause className="size-3.5"/> : <Play className="size-3.5"/>}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label="Next step"
                            disabled={idx >= total - 1}
                            onClick={() => setStep(Math.min(total - 1, idx + 1))}
                        >
                            <ChevronRight className="size-3.5"/>
                        </Button>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={Math.max(0, total - 1)}
                        value={idx}
                        onChange={(e) => setStep(Number(e.target.value))}
                        className="h-6 min-w-[140px] flex-1 cursor-pointer accent-emerald-600"
                        aria-label="Step scrubber — scrub through the recorded run"
                        aria-valuetext={`Step ${idx + 1} of ${total}`}
                    />
                    <span className="whitespace-nowrap font-mono text-xs text-muted-foreground" aria-live="polite">
            Step {idx + 1} / {total}
          </span>
                </div>
            )}

            {body}
        </section>
    );
}
