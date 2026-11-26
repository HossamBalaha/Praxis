/**
 * vim-mode.ts — a pure, headless modal-editing engine for the Praxis
 * editor surface. NO React, NO DOM — the engine only ever sees a VimDoc
 * (getText / setText) and key events, so it stays unit-testable in
 * isolation.
 *
 * HOST CONTRACT
 * -------------
 * 1. Route EVERY keydown through handleKey({ key, ctrl }). `true` means
 *    CONSUMED — call preventDefault() and re-render from getState() /
 *    getCursor() / getVisualRange(). `false` means PASS-THROUGH — let the
 *    host/browser act (insert-mode typing, `u` undo, Ctrl+r redo, `:`
 *    command bar, PageUp scrolling...).
 * 2. The doc is SHARED state: in INSERT mode the host applies the typing
 *    itself and should keep the caret current via setCursor() (cheap —
 *    after each input event). The engine diffs the buffer on Esc, so
 *    correctness survives even without setCursor calls.
 * 3. Every logical change is exactly ONE doc.setText(next, ops) call
 *    with a descriptive VimEditOp[] — the host wraps that into a single
 *    deep-undo group (src/lib/deep-undo.ts pacing).
 * 4. `u` and Ctrl+r are reported UN-consumed: the host's own undo stack
 *    stays the single source of truth for history.
 */

import {findBracketPair} from "@/lib/bracket-match";

export interface VimDoc {
    getText(): string;

    setText(next: string, ops: VimEditOp[]): void;
}

export interface VimEditOp {
    start: number;
    end: number;
    text: string;
    kind: "insert" | "delete" | "replace";
}

export type VimMode = "normal" | "insert" | "visual";

export interface VimState {
    mode: VimMode;
    pending: string;
    count: number | null;
    register: string;
    lastFind: { char: string; kind: "f" | "F" | "t" | "T" } | null;
    recording: string | null;
    lastReplay: string | null;
    marks: Record<string, number>;
    message: string | null;
}

export interface VimControllerOptions {
    /** :w hook — called by executeCommand("w"). */
    onSave?: () => void;
    /** :q / :wq hook — the host decides what "close" means. */
    onCloseRequested?: () => void;
    /** Spaces per > / < indent level (the host's tab width). */
    tabWidth?: number;
}

type Op = "d" | "c" | "y" | ">" | "<";

type Stage =
    | ""
    | "g"
    | "m"
    | "mark-line"
    | "mark-exact"
    | "register"
    | "record"
    | "replay"
    | "find-f"
    | "find-F"
    | "find-t"
    | "find-T"
    | "obj-i"
    | "obj-a";

interface MotionResult {
    pos: number;
    /** Operator ranges include the target char when true ($, e, f...). */
    inclusive: boolean;
    /** j / k / G / { / } / 'mark style: operators act on whole lines. */
    linewise: boolean;
    /** w-style motions: operators must not swallow the newline. */
    eolClamp?: boolean;
    /** j / k keep the desired column across lines. */
    keepCol?: boolean;
}

interface RegisterEntry {
    text: string;
    linewise: boolean;
}

type LastChange =
    | { kind: "ops"; anchor: number; ops: VimEditOp[] }
    | { kind: "deleteLines"; n: number }
    | { kind: "changeLines"; n: number; text: string }
    | { kind: "lineAction"; action: "indent" | "outdent"; n: number }
    | { kind: "insertBelow" | "insertAbove"; text: string }
    | { kind: "paste"; text: string; linewise: boolean; after: boolean };

interface InsertSession {
    /** Buffer BEFORE any pre-delete (o's newline, cw's word kill) so the
     *  Esc diff describes the WHOLE change for dot-repeat. */
    preText: string;
    preOffset: number;
    preAnchor: number;
    preOps: VimEditOp[];
    entryKind: "plain" | "o" | "O" | "charChange" | "changeLines";
    lineCount: number;
}

/** Macro replay cap — a runaway macro must never loop forever. */
const MAX_MACRO_KEYS = 10000;

// ─── module-level text primitives (pure) ───────────────────────────────

function clampCursor(text: string, pos: number): number {
    if (text.length === 0) return 0;
    return Math.max(0, Math.min(pos, text.length - 1));
}

function lineStartOf(text: string, pos: number): number {
    const at = Math.max(0, Math.min(pos, text.length));
    let i = at;
    while (i > 0 && text[i - 1] !== "\n") i--;
    return i;
}

function lineEndOf(text: string, pos: number): number {
    let i = Math.max(0, Math.min(pos, text.length));
    while (i < text.length && text[i] !== "\n") i++;
    return i;
}

function firstNonBlankOf(text: string, pos: number): number {
    const ls = lineStartOf(text, pos);
    const eol = lineEndOf(text, ls);
    let i = ls;
    while (i < eol && (text[i] === " " || text[i] === "\t")) i++;
    return i;
}

function lineIndex(text: string, pos: number): number {
    const upto = Math.max(0, Math.min(pos, text.length));
    let n = 0;
    for (let i = 0; i < upto; i++) if (text[i] === "\n") n++;
    return n;
}

function lineStartOfLine(text: string, line: number): number {
    if (line <= 0) return 0;
    let idx = -1;
    for (let l = 0; l < line; l++) {
        idx = text.indexOf("\n", idx + 1);
        if (idx === -1) return text.length;
    }
    return idx + 1;
}

function lastLineIndex(text: string): number {
    return lineIndex(text, text.length);
}

function lineEndOfLine(text: string, line: number): number {
    return lineEndOf(text, lineStartOfLine(text, line));
}

// ─── word / paragraph motions ──────────────────────────────────────────

function charKind(ch: string, big: boolean): "word" | "punct" | "blank" {
    if (ch === "\n" || ch === " " || ch === "\t") return "blank";
    if (big) return "word";
    if (/[A-Za-z0-9_]/.test(ch)) return "word";
    return "punct";
}

function nextWordStart(text: string, pos: number, big: boolean): number {
    const n = text.length;
    if (n === 0) return 0;
    let i = clampCursor(text, pos);
    const k = charKind(text[i], big);
    if (k !== "blank") {
        while (i < n && charKind(text[i], big) === k) i++;
    }
    while (i < n && charKind(text[i], big) === "blank") i++;
    return i;
}

function prevWordStart(text: string, pos: number, big: boolean): number {
    const n = text.length;
    if (n === 0) return 0;
    let i = clampCursor(text, pos);
    const kind = (p: number) => charKind(text[p], big);
    if (kind(i) === "blank") {
        while (i > 0 && kind(i) === "blank") i--;
        const k = kind(i);
        while (i > 0 && kind(i - 1) === k) i--;
        return i;
    }
    const k = kind(i);
    let s = i;
    while (s > 0 && kind(s - 1) === k) s--;
    if (s < i) return s; // moved inside a run -> its start
    // already at the run start -> b continues to the PREVIOUS word
    let j = s;
    while (j > 0 && kind(j - 1) === "blank") j--;
    if (j === 0) return 0;
    const k2 = kind(j - 1);
    let s2 = j - 1;
    while (s2 > 0 && kind(s2 - 1) === k2) s2--;
    return s2;
}

function wordEndOf(text: string, pos: number, big: boolean): number {
    const n = text.length;
    if (n === 0) return 0;
    let i = clampCursor(text, pos);
    const kind = (p: number) => charKind(text[p], big);
    if (kind(i) === "blank") {
        while (i < n && kind(i) === "blank") i++;
        if (i >= n) return n - 1;
    }
    const k = kind(i);
    let e = i;
    while (e + 1 < n && kind(e + 1) === k) e++;
    if (e > i) return e; // mid-run -> end of THIS word
    // already at the run end -> e goes to the NEXT word's end
    let j = e;
    while (j + 1 < n && kind(j + 1) === "blank") j++;
    if (j + 1 >= n) return e;
    const k2 = kind(j + 1);
    let e2 = j + 1;
    while (e2 + 1 < n && kind(e2 + 1) === k2) e2++;
    return e2;
}

function isBlankLine(text: string, ls: number): boolean {
    const eol = lineEndOf(text, ls);
    for (let i = ls; i < eol; i++) {
        if (text[i] !== " " && text[i] !== "\t") return false;
    }
    return true;
}

function prevParagraphStart(text: string, pos: number): number {
    let ls = lineStartOf(text, pos);
    while (ls > 0) {
        const prevLs = lineStartOf(text, ls - 1);
        if (isBlankLine(text, prevLs)) return prevLs;
        ls = prevLs;
    }
    return 0;
}

function nextParagraphStart(text: string, pos: number): number {
    let ls = lineEndOf(text, pos) + 1;
    while (ls < text.length) {
        if (isBlankLine(text, ls)) return ls;
        ls = lineEndOf(text, ls) + 1;
    }
    return text.length;
}

// ─── edit application ───────────────────────────────────────────────────

/** Ops carry ORIGINAL-text coordinates and never overlap (c's delete+type
 *  is folded into a single replace op), so applying them in DESCENDING
 *  order keeps every offset valid. */
function applyOps(text: string, ops: VimEditOp[]): string {
    let out = text;
    for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        out = out.slice(0, op.start) + op.text + out.slice(op.end);
    }
    return out;
}

/** Net difference between two buffer snapshots as one op (insert-mode
 *  diffing on Esc — the host typed directly into the doc). */
function diffText(pre: string, cur: string): { start: number; end: number; text: string } | null {
    if (pre === cur) return null;
    let p = 0;
    while (p < pre.length && p < cur.length && pre[p] === cur[p]) p++;
    let a = pre.length;
    let b = cur.length;
    while (a > p && b > p && pre[a - 1] === cur[b - 1]) {
        a--;
        b--;
    }
    return {start: p, end: a, text: cur.slice(p, b)};
}

// ─── text objects (iw aw i" a" i' a') ──────────────────────────────────

function objClassOf(ch: string, big: boolean): "word" | "punct" | "blank" | "nl" {
    if (ch === "\n") return "nl";
    if (ch === " " || ch === "\t") return "blank";
    if (big) return "word";
    if (/[A-Za-z0-9_]/.test(ch)) return "word";
    return "punct";
}

function textObjectRange(
    text: string,
    pos: number,
    key: string,
    inner: boolean
): { s: number; e: number } | null {
    if (text.length === 0 || pos >= text.length) return null;
    if (key === "w" || key === "W") {
        const big = key === "W";
        const cls = objClassOf(text[pos], big);
        let s = pos;
        let e = pos + 1;
        while (s > 0 && objClassOf(text[s - 1], big) === cls) s--;
        while (e < text.length && objClassOf(text[e], big) === cls) e++;
        if (!inner) {
            // aw/aW: trailing spaces (never the newline); else leading spaces
            let ne = e;
            while (ne < text.length && (text[ne] === " " || text[ne] === "\t")) ne++;
            if (ne > e) return {s, e: ne};
            let ns = s;
            while (ns > 0 && (text[ns - 1] === " " || text[ns - 1] === "\t")) ns--;
            return {s: ns, e};
        }
        return {s, e};
    }
    if (key === "\"" || key === "'") {
        const q = key;
        const ls = lineStartOf(text, pos);
        const le = lineEndOf(text, pos);
        if (text[pos] === q) {
            const fwd = text.indexOf(q, pos + 1);
            if (fwd !== -1 && fwd < le) return inner ? {s: pos + 1, e: fwd} : {s: pos, e: fwd + 1};
            const bwd = text.lastIndexOf(q, pos - 1);
            if (bwd !== -1 && bwd >= ls) return inner ? {s: bwd + 1, e: pos} : {s: bwd, e: pos + 1};
            return null;
        }
        const open = text.lastIndexOf(q, pos - 1);
        const close = text.indexOf(q, pos);
        if (open >= ls && close < le && close > open) {
            return inner ? {s: open + 1, e: close} : {s: open, e: close + 1};
        }
        // vim parity: di" works from anywhere on the LINE — fall back to the
        // first quoted span on the cursor's line when the caret is outside.
        let i = ls;
        while (i < le) {
            if (text[i] === q) {
                const j = text.indexOf(q, i + 1);
                if (j !== -1 && j < le) return inner ? {s: i + 1, e: j} : {s: i, e: j + 1};
                return null;
            }
            i++;
        }
        return null;
    }
    return null;
}

// ─── macro key encoding (recorded via handleKey) ────────────────────────

function encodeKey(key: string, ctrl: boolean): string {
    if (ctrl) return `C:${key}`;
    if (key.length > 1) return `<${key}>`;
    return key;
}

function decodeKey(enc: string): { key: string; ctrl: boolean } {
    if (enc.startsWith("C:")) return {key: enc.slice(2), ctrl: true};
    if (enc.length > 1 && enc.startsWith("<") && enc.endsWith(">")) {
        return {key: enc.slice(1, -1), ctrl: false};
    }
    return {key: enc, ctrl: false};
}

// ─── the controller ────────────────────────────────────────────────────

export class VimController {
    private doc: VimDoc;
    private onSave?: () => void;
    private onCloseRequested?: () => void;
    private tabWidth: number;

    private mode: VimMode = "normal";
    private cursor = 0;
    private desiredCol: number | null = null;
    private count: number | null = null;
    private opCount: number | null = null;
    private operator: Op | null = null;
    private stage: Stage = "";
    private pendingRegister: { name: string; append: boolean } | null = null;
    private registers: Record<string, RegisterEntry> = {};
    private lastFind: { char: string; kind: "f" | "F" | "t" | "T" } | null = null;
    private recording: string | null = null;
    private macroKeys: string[] = [];
    private macros: Record<string, string[]> = {};
    private lastReplay: string | null = null;
    private marks: Record<string, number> = {};
    private message: string | null = null;
    private visualAnchor: number | null = null;
    private visualLinewise = false;
    private lastVisual: { anchor: number; cursor: number; linewise: boolean } | null = null;
    private insertSession: InsertSession | null = null;
    private cursorSynced = false;
    private lastChange: LastChange | null = null;
    private replaying = false;
    private nu = false;
    private rnu = false;

    constructor(doc: VimDoc, options?: VimControllerOptions) {
        this.doc = doc;
        this.onSave = options?.onSave;
        this.onCloseRequested = options?.onCloseRequested;
        this.tabWidth = options?.tabWidth && options.tabWidth > 0 ? options.tabWidth : 4;
        this.cursor = clampCursor(doc.getText(), 0);
    }

    // ── public host API ──────────────────────────────────────────────────

    handleKey(e: { key: string; ctrl: boolean }): boolean {
        if (typeof e.key !== "string" || e.key.length === 0) return false;
        if (this.replaying) return this.feed(e.key, e.ctrl);
        if (this.recording !== null) {
            // q stops recording — never recorded into the macro itself
            if (!e.ctrl && e.key === "q") {
                this.macros[this.recording] = this.macroKeys;
                this.message = `macro @${this.recording} recorded (${this.macroKeys.length} keys)`;
                this.recording = null;
                this.macroKeys = [];
                return true;
            }
            this.macroKeys.push(encodeKey(e.key, e.ctrl));
        }
        return this.feed(e.key, e.ctrl);
    }

    getState(): VimState {
        return {
            mode: this.mode,
            pending: this.pendingDisplay(),
            count: this.count,
            register: this.pendingRegister ? `"${this.pendingRegister.name}` : `""`,
            lastFind: this.lastFind ? {char: this.lastFind.char, kind: this.lastFind.kind} : null,
            recording: this.recording,
            lastReplay: this.lastReplay,
            marks: {...this.marks},
            message: this.message,
        };
    }

    getCursor(): number {
        return clampCursor(this.doc.getText(), this.cursor);
    }

    /** Host keeps the caret current while it owns insert-mode typing. */
    setCursor(offset: number): void {
        this.cursor = clampCursor(this.doc.getText(), offset);
        if (this.mode === "insert") this.cursorSynced = true;
    }

    getVisualRange(): { start: number; end: number; linewise: boolean } | null {
        if (this.mode !== "visual" || this.visualAnchor === null) return null;
        const text = this.doc.getText();
        const a = Math.min(this.visualAnchor, this.cursor);
        const b = Math.max(this.visualAnchor, this.cursor);
        if (this.visualLinewise) {
            return {
                start: lineStartOf(text, a),
                end: Math.min(lineEndOf(text, b) + 1, text.length),
                linewise: true,
            };
        }
        return {start: a, end: Math.min(b + 1, text.length), linewise: false};
    }

    wantsRelativeNumbers(): boolean {
        return this.rnu;
    }

    /** Whether the host gutter should render numbers at all. */
    wantsLineNumbers(): boolean {
        return this.nu || this.rnu;
    }

    getNumberMode(): "absolute" | "relative" | "hybrid" {
        if (this.nu && this.rnu) return "hybrid";
        if (this.rnu) return "relative";
        return "absolute";
    }

    /** The number to render for a line. The SECOND argument is the
     *  cursor's line index (the reference for relative numbering). */
    visibleLineNumberFor(line: number, cursorLine: number): number {
        if (this.getNumberMode() === "absolute") return line + 1;
        if (line === cursorLine) return line + 1; // hybrid keeps the current line absolute
        return Math.abs(line - cursorLine);
    }

    executeCommand(cmd: string): boolean {
        const raw = cmd.trim();
        const c = raw.startsWith(":") ? raw.slice(1).trim() : raw;
        if (!c) return false;
        if (c === "w" || c === "write") {
            if (this.onSave) {
                this.onSave();
                this.message = "written";
            } else {
                this.message = "no save hook";
            }
            return true;
        }
        if (c === "q" || c === "q!" || c === "quit") {
            if (this.onCloseRequested) {
                this.onCloseRequested();
                this.message = "closing";
            } else {
                this.message = "no close hook";
            }
            return true;
        }
        if (c === "wq" || c === "x") {
            if (this.onSave) this.onSave();
            if (this.onCloseRequested) this.onCloseRequested();
            this.message = "written";
            return true;
        }
        if (c === "noh" || c === "nohl" || c === "nohlsearch") {
            this.message = null;
            return true;
        }
        if (c === "set" || c.startsWith("set ")) {
            this.applySet(c);
            return true;
        }
        if (c.startsWith("%s")) {
            return this.substitute(c);
        }
        return false;
    }

    // ── internal dispatch ────────────────────────────────────────────────

    private feed(key: string, ctrl: boolean): boolean {
        if (ctrl) return false; // Ctrl combos belong to the host (Ctrl+r redo...)
        if (key === "Escape") {
            if (this.mode === "insert") {
                this.exitInsert();
                return true;
            }
            if (this.mode === "visual") {
                this.exitVisual();
                return true;
            }
            const had = this.hasPending();
            this.cancelPending();
            return had;
        }
        if (key.length !== 1) {
            // named keys: arrows / Home / End act as motions; the rest passes through
            this.stage = "";
            if (this.mode === "insert") return false;
            const res = this.runMotion(key);
            if (res) {
                if (!res.keepCol) this.desiredCol = null;
                this.cursor = clampCursor(this.doc.getText(), res.pos);
                return true;
            }
            return false;
        }
        if (this.mode === "insert") {
            if (this.replaying) {
                this.selfInsert(key);
                return true;
            }
            return false; // host owns raw typing
        }
        if (this.resolveStage(key)) return true;
        if (/^[0-9]$/.test(key)) {
            if (!(key === "0" && this.count === null)) {
                this.count = (this.count ?? 0) * 10 + Number(key);
                return true;
            }
        }
        if (this.mode === "visual") return this.feedVisual(key);
        if (this.operator !== null) return this.feedOperator(key);
        return this.feedNormalCommand(key);
    }

    /** Single-char arguments to g / m / ' / ` / " / q / @ / f{c} / i / a. */
    private resolveStage(key: string): boolean {
        const st = this.stage;
        if (st === "") return false;
        this.stage = "";
        switch (st) {
            case "g": {
                if (key === "v") {
                    this.reselectVisual();
                    return true;
                }
                if (key === "g") {
                    const raw = this.count;
                    this.count = null;
                    this.opCount = null;
                    const text = this.doc.getText();
                    const last = lastLineIndex(text);
                    const line = raw !== null ? Math.max(0, Math.min(raw - 1, last)) : 0;
                    const res: MotionResult = {
                        pos: firstNonBlankOf(text, lineStartOfLine(text, line)),
                        inclusive: false,
                        linewise: true,
                    };
                    if (this.operator) {
                        const op = this.operator;
                        this.operator = null;
                        this.execOperatorMotion(op, res);
                    } else {
                        this.desiredCol = null;
                        this.cursor = clampCursor(text, res.pos);
                    }
                    return true;
                }
                return true; // g + unknown: cancelled
            }
            case "m": {
                if (/^[a-z]$/.test(key)) {
                    this.marks[key] = this.cursor;
                    this.message = `mark ${key} set`;
                }
                return true;
            }
            case "mark-line":
            case "mark-exact": {
                const text = this.doc.getText();
                const target = this.marks[key];
                if (!/^[a-z]$/.test(key) || target === undefined) {
                    this.message = "mark not set";
                    this.operator = null;
                    this.opCount = null;
                    return true;
                }
                const res: MotionResult =
                    st === "mark-line"
                        ? {pos: firstNonBlankOf(text, target), inclusive: false, linewise: true}
                        : {pos: clampCursor(text, target), inclusive: false, linewise: false};
                if (this.operator) {
                    const op = this.operator;
                    this.operator = null;
                    this.execOperatorMotion(op, res);
                } else {
                    this.desiredCol = null;
                    this.cursor = clampCursor(text, res.pos);
                }
                return true;
            }
            case "register": {
                if (/^[a-zA-Z]$/.test(key)) {
                    this.pendingRegister = {name: key.toLowerCase(), append: key !== key.toLowerCase()};
                }
                return true;
            }
            case "record": {
                if (/^[a-z]$/.test(key)) {
                    this.recording = key;
                    this.macroKeys = [];
                    this.message = `recording @${key}`;
                }
                return true;
            }
            case "replay": {
                if (/^[a-z]$/.test(key)) this.replayMacro(key);
                return true;
            }
            case "find-f":
            case "find-F":
            case "find-t":
            case "find-T": {
                const kind = st.slice(5) as "f" | "F" | "t" | "T";
                const n = this.motionTimes();
                let pos = this.cursor;
                let found = false;
                for (let i = 0; i < Math.max(1, n); i++) {
                    const p = this.doFind(kind, key, false);
                    if (p === null) break;
                    pos = p;
                    found = true;
                }
                if (found) {
                    this.lastFind = {char: key, kind};
                    const res: MotionResult = {pos, inclusive: true, linewise: false};
                    if (this.operator) {
                        const op = this.operator;
                        this.operator = null;
                        this.execOperatorMotion(op, res);
                    } else {
                        this.desiredCol = null;
                        this.cursor = clampCursor(this.doc.getText(), pos);
                    }
                }
                return true;
            }
            case "obj-i":
            case "obj-a": {
                const inner = st === "obj-i";
                const text = this.doc.getText();
                const range = textObjectRange(text, this.cursor, key, inner);
                if (!range) {
                    this.operator = null;
                    this.opCount = null;
                    return true;
                }
                if (this.mode === "visual") {
                    this.visualAnchor = range.s;
                    this.cursor = clampCursor(text, Math.max(range.s, range.e - 1));
                    return true;
                }
                const op = this.operator;
                this.operator = null;
                this.opCount = null;
                if (op === "y") {
                    this.setRegister(text.slice(range.s, range.e), false);
                    this.cursor = clampCursor(text, range.s);
                } else if (op === "d") {
                    this.deleteChars(range.s, range.e);
                } else if (op === "c") {
                    this.changeRange(range.s, range.e);
                } else if (op) {
                    this.indentLinesAt(
                        lineIndex(text, range.s),
                        lineIndex(text, Math.max(range.s, range.e - 1)) - lineIndex(text, range.s) + 1,
                        op === ">"
                    );
                }
                return true;
            }
            default:
                return true;
        }
    }

    private feedNormalCommand(key: string): boolean {
        const text = this.doc.getText();
        this.cursor = clampCursor(text, this.cursor);
        const res = this.runMotion(key);
        if (res) {
            if (!res.keepCol) this.desiredCol = null;
            this.cursor = clampCursor(text, res.pos);
            return true;
        }
        const takeCount = (): number => {
            const v = this.count ?? 1;
            this.count = null;
            return v;
        };
        switch (key) {
            case "i":
                this.enterInsert(this.cursor);
                return true;
            case "a":
                this.enterInsert(Math.min(this.cursor + 1, lineEndOf(text, this.cursor)));
                return true;
            case "I":
                this.enterInsert(firstNonBlankOf(text, this.cursor));
                return true;
            case "A":
                this.enterInsert(lineEndOf(text, this.cursor));
                return true;
            case "o": {
                const eol = lineEndOf(text, this.cursor);
                this.enterInsert(Math.min(eol + 1, text.length), {
                    preOps: [{start: eol, end: eol, text: "\n", kind: "insert"}],
                    entryKind: "o",
                });
                return true;
            }
            case "O": {
                const ls = lineStartOf(text, this.cursor);
                this.enterInsert(Math.min(ls + 1, text.length), {
                    preOps: [{start: ls, end: ls, text: "\n", kind: "insert"}],
                    entryKind: "O",
                });
                return true;
            }
            case "v":
                this.enterVisual(false);
                return true;
            case "V":
                this.enterVisual(true);
                return true;
            case "x": {
                const eol = lineEndOf(text, this.cursor);
                this.deleteChars(this.cursor, Math.min(this.cursor + takeCount(), eol));
                return true;
            }
            case "X": {
                const ls = lineStartOf(text, this.cursor);
                this.deleteChars(Math.max(ls, this.cursor - takeCount()), this.cursor);
                return true;
            }
            case "s": {
                const eol = lineEndOf(text, this.cursor);
                this.changeRange(this.cursor, Math.min(this.cursor + takeCount(), eol));
                return true;
            }
            case "S":
                this.runOperatorLines("c", lineIndex(text, this.cursor), takeCount());
                return true;
            case "D":
                this.deleteChars(this.cursor, lineEndOf(text, this.cursor));
                return true;
            case "C":
                this.changeRange(this.cursor, lineEndOf(text, this.cursor));
                return true;
            case "Y":
                this.runOperatorLines("y", lineIndex(text, this.cursor), takeCount());
                return true;
            case "p":
                this.doPaste(true);
                return true;
            case "P":
                this.doPaste(false);
                return true;
            case "~":
                this.toggleCaseRange(this.cursor, Math.min(this.cursor + takeCount(), lineEndOf(text, this.cursor)));
                return true;
            case ".":
                this.applyLastChange(takeCount());
                return true;
            case "d":
            case "c":
            case "y":
            case ">":
            case "<":
                this.operator = key;
                this.opCount = this.count;
                this.count = null;
                return true;
            case "q":
                this.stage = "record";
                return true;
            case "@":
                this.stage = "replay";
                return true;
            case "m":
                this.stage = "m";
                return true;
            case "'":
                this.stage = "mark-line";
                return true;
            case "`":
                this.stage = "mark-exact";
                return true;
            case '"':
                this.stage = "register";
                return true;
            case "g":
                this.stage = "g";
                return true;
            case "f":
            case "F":
            case "t":
            case "T":
                this.stage = `find-${key}`;
                return true;
            case ":":
                return false; // the host's command bar
            case "u":
                return false; // the host's undo
            default:
                this.count = null;
                return false;
        }
    }

    private feedOperator(key: string): boolean {
        const op = this.operator;
        if (op === null) return false;
        if (key === op) {
            // doubled operator: linewise over N lines
            this.operator = null;
            const n = this.motionTimes();
            const text = this.doc.getText();
            this.runOperatorLines(op, lineIndex(text, this.cursor), n);
            return true;
        }
        if (key === "i" || key === "a") {
            this.stage = key === "i" ? "obj-i" : "obj-a";
            return true;
        }
        if (key === "f" || key === "F" || key === "t" || key === "T") {
            this.stage = `find-${key}`;
            return true;
        }
        if (key === "'") {
            this.stage = "mark-line";
            return true;
        }
        if (key === "`") {
            this.stage = "mark-exact";
            return true;
        }
        const res = this.runMotion(key);
        this.operator = null;
        if (!res) {
            this.opCount = null;
            return true; // unrecognized after an operator: cancel (consumed)
        }
        this.execOperatorMotion(op, res);
        return true;
    }

    private feedVisual(key: string): boolean {
        const text = this.doc.getText();
        this.cursor = clampCursor(text, this.cursor);
        switch (key) {
            case "v":
                if (this.visualLinewise) {
                    this.visualLinewise = false;
                } else {
                    this.exitVisual();
                }
                return true;
            case "V":
                this.visualLinewise = !this.visualLinewise;
                return true;
            case "o": {
                const a = this.visualAnchor;
                if (a !== null) {
                    this.visualAnchor = this.cursor;
                    this.cursor = a;
                    this.desiredCol = null;
                }
                return true;
            }
            case "d":
            case "x":
            case "D":
                this.visualDelete();
                return true;
            case "y":
                this.visualYank(false);
                return true;
            case "Y":
                this.visualYank(true);
                return true;
            case "c":
            case "s":
            case "C":
                this.visualChange();
                return true;
            case "~": {
                const sel = this.visualSelection();
                if (sel) this.toggleCaseRange(sel.s, sel.e);
                return true;
            }
            case ">":
            case "<": {
                const sel = this.visualSelection();
                if (sel) {
                    const cur = this.doc.getText();
                    this.indentLinesAt(lineIndex(cur, sel.s), sel.lineCount, key === ">");
                }
                this.exitVisual();
                return true;
            }
            case "i":
            case "a":
                this.stage = key === "i" ? "obj-i" : "obj-a";
                return true;
            case "g":
                this.stage = "g";
                return true;
            case "p":
                return false; // visual paste not implemented — pass through
            default: {
                const res = this.runMotion(key);
                if (res) {
                    if (!res.keepCol) this.desiredCol = null;
                    this.cursor = clampCursor(text, res.pos);
                    return true;
                }
                this.count = null;
                return false;
            }
        }
    }

    // ── motions ───────────────────────────────────────────────────────────

    private motionTimes(): number {
        // "3dw" and "d3w" must agree: operator count x motion count.
        const n = (this.opCount ?? 1) * (this.count ?? 1);
        this.count = null;
        this.opCount = null;
        return n;
    }

    private runMotion(key: string): MotionResult | null {
        const text = this.doc.getText();
        const cursor = clampCursor(text, this.cursor);
        switch (key) {
            case "h":
            case "ArrowLeft":
            case "Backspace": {
                const n = this.motionTimes();
                const ls = lineStartOf(text, cursor);
                return {pos: Math.max(ls, cursor - n), inclusive: false, linewise: false};
            }
            case "l":
            case "ArrowRight": {
                const n = this.motionTimes();
                const ls = lineStartOf(text, cursor);
                const eol = lineEndOf(text, cursor);
                const pos = eol > ls ? Math.min(cursor + n, eol - 1) : cursor;
                return {pos, inclusive: false, linewise: false};
            }
            case "j":
            case "ArrowDown":
            case "k":
            case "ArrowUp": {
                const n = this.motionTimes();
                const dir = key === "j" || key === "ArrowDown" ? 1 : -1;
                if (this.desiredCol === null) this.desiredCol = cursor - lineStartOf(text, cursor);
                const col = this.desiredCol;
                const targetLine = Math.max(0, Math.min(lineIndex(text, cursor) + dir * n, lastLineIndex(text)));
                const tls = lineStartOfLine(text, targetLine);
                const content = lineEndOf(text, tls) - tls;
                const pos = content === 0 ? tls : tls + Math.min(col, content - 1);
                return {pos, inclusive: false, linewise: true, keepCol: true};
            }
            case "w":
            case "W": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n; i++) p = nextWordStart(text, p, key === "W");
                return {pos: clampCursor(text, p), inclusive: false, linewise: false, eolClamp: true};
            }
            case "b":
            case "B": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n; i++) p = prevWordStart(text, p, key === "B");
                return {pos: clampCursor(text, p), inclusive: false, linewise: false};
            }
            case "e":
            case "E": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n; i++) p = wordEndOf(text, p, key === "E");
                return {pos: clampCursor(text, p), inclusive: true, linewise: false};
            }
            case "0":
                return {pos: lineStartOf(text, cursor), inclusive: false, linewise: false};
            case "^":
            case "Home":
                return {pos: firstNonBlankOf(text, cursor), inclusive: false, linewise: false};
            case "$":
            case "End": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n - 1; i++) {
                    const eol = lineEndOf(text, p);
                    if (eol >= text.length) break;
                    p = eol + 1;
                }
                const ls = lineStartOf(text, p);
                return {pos: Math.max(ls, lineEndOf(text, p) - 1), inclusive: true, linewise: false};
            }
            case "G": {
                // G's count is a LINE NUMBER, not a multiplier
                const raw = this.count;
                this.count = null;
                this.opCount = null;
                const last = lastLineIndex(text);
                const line = raw !== null ? Math.max(0, Math.min(raw - 1, last)) : last;
                return {pos: firstNonBlankOf(text, lineStartOfLine(text, line)), inclusive: false, linewise: true};
            }
            case "{": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n; i++) p = prevParagraphStart(text, p);
                return {pos: clampCursor(text, p), inclusive: false, linewise: true};
            }
            case "}": {
                const n = this.motionTimes();
                let p = cursor;
                for (let i = 0; i < n; i++) p = nextParagraphStart(text, p);
                return {pos: clampCursor(text, p), inclusive: false, linewise: true};
            }
            case ";":
            case ",": {
                if (!this.lastFind) return null;
                const n = this.motionTimes();
                let p = cursor;
                let found = false;
                for (let i = 0; i < Math.max(1, n); i++) {
                    const q = this.doFind(this.lastFind.kind, this.lastFind.char, key === ",");
                    if (q === null) break;
                    p = q;
                    found = true;
                }
                if (!found) return {pos: cursor, inclusive: false, linewise: false};
                return {pos: p, inclusive: true, linewise: false};
            }
            case "%": {
                const pair = findBracketPair(text, cursor);
                if (!pair) return null;
                const dOpen = Math.abs(cursor - pair.openOffset);
                const dClose = Math.abs(cursor - pair.closeOffset);
                const target = dOpen <= dClose ? pair.closeOffset : pair.openOffset;
                return {pos: target, inclusive: true, linewise: false};
            }
            default:
                return null;
        }
    }

    private doFind(kind: "f" | "F" | "t" | "T", char: string, reverse: boolean): number | null {
        const text = this.doc.getText();
        const cursor = clampCursor(text, this.cursor);
        let k: "f" | "F" | "t" | "T" = kind;
        if (reverse) {
            if (kind === "f") k = "F";
            else if (kind === "F") k = "f";
            else if (kind === "t") k = "T";
            else k = "t";
        }
        const ls = lineStartOf(text, cursor);
        const eol = lineEndOf(text, cursor);
        if (k === "f" || k === "t") {
            for (let i = cursor + 1; i < eol; i++) {
                if (text[i] === char) return k === "f" ? i : i - 1;
            }
        } else {
            for (let i = cursor - 1; i >= ls; i--) {
                if (text[i] === char) return k === "F" ? i : i + 1;
            }
        }
        return null;
    }

    // ── operator execution ────────────────────────────────────────────────

    private execOperatorMotion(op: Op, res: MotionResult): void {
        const text = this.doc.getText();
        if (res.linewise) {
            const la = lineIndex(text, this.cursor);
            const lb = lineIndex(text, res.pos);
            this.runOperatorLines(op, Math.min(la, lb), Math.abs(lb - la) + 1);
            return;
        }
        const s = Math.min(this.cursor, res.pos);
        let e = Math.max(this.cursor, res.pos);
        if (res.inclusive) e += 1;
        if (res.eolClamp && res.pos > this.cursor) e = Math.min(e, lineEndOf(text, this.cursor));
        this.runOperatorRange(op, s, e);
    }

    private runOperatorRange(op: Op, s: number, e: number): void {
        const text = this.doc.getText();
        const start = Math.max(0, Math.min(s, text.length));
        const end = Math.max(start, Math.min(e, text.length));
        if (op === "y") {
            this.setRegister(text.slice(start, end), false);
            this.cursor = clampCursor(text, start);
            return;
        }
        if (op === "d") {
            this.deleteChars(start, end);
            return;
        }
        if (op === "c") {
            this.changeRange(start, end);
            return;
        }
        this.indentLinesAt(
            lineIndex(text, start),
            lineIndex(text, Math.max(start, end - 1)) - lineIndex(text, start) + 1,
            op === ">"
        );
    }

    private runOperatorLines(op: Op, fromLine: number, nLines: number): void {
        const text = this.doc.getText();
        const last = lastLineIndex(text);
        const from = Math.max(0, Math.min(fromLine, last));
        const to = Math.min(from + Math.max(1, nLines) - 1, last);
        const ls = lineStartOfLine(text, from);
        const le = lineEndOfLine(text, to);
        if (op === "y") {
            this.setRegister(text.slice(ls, Math.min(le + 1, text.length)), true);
            this.cursor = firstNonBlankOf(text, ls);
            return;
        }
        if (op === "d") {
            this.deleteLinesAt(from, to - from + 1);
            return;
        }
        if (op === "c") {
            // content-only delete: the final newline survives as the new empty line
            const removed = text.slice(ls, le);
            this.setRegister(le < text.length ? removed + "\n" : removed, true);
            this.enterInsert(ls, {
                preOps: [{start: ls, end: le, text: "", kind: "delete"}],
                entryKind: "changeLines",
                lineCount: to - from + 1,
                preAnchor: this.cursor,
            });
            return;
        }
        this.indentLinesAt(from, to - from + 1, op === ">");
    }

    // ── primitive edits ────────────────────────────────────────────────────

    private deleteChars(s: number, e: number): void {
        const text = this.doc.getText();
        const start = Math.max(0, Math.min(s, text.length));
        const end = Math.max(start, Math.min(e, text.length));
        if (end <= start) return;
        this.setRegister(text.slice(start, end), false);
        const ops: VimEditOp[] = [{start, end, text: "", kind: "delete"}];
        const next = applyOps(text, ops);
        this.doc.setText(next, ops);
        this.cursor = clampCursor(next, start);
        this.lastChange = {kind: "ops", anchor: start, ops};
    }

    private changeRange(s: number, e: number): void {
        const text = this.doc.getText();
        const start = Math.max(0, Math.min(s, text.length));
        const end = Math.max(start, Math.min(e, text.length));
        const removed = text.slice(start, end);
        this.setRegister(removed, false);
        this.enterInsert(start, {
            preOps: [{start, end, text: "", kind: "delete"}],
            entryKind: "charChange",
            preAnchor: this.cursor,
        });
    }

    private deleteLinesAt(fromLine: number, n: number): void {
        const text = this.doc.getText();
        const last = lastLineIndex(text);
        const from = Math.max(0, Math.min(fromLine, last));
        const to = Math.min(from + Math.max(1, n) - 1, last);
        const ls = lineStartOfLine(text, from);
        const end = Math.min(lineEndOfLine(text, to) + 1, text.length);
        this.setRegister(text.slice(ls, end), true);
        const ops: VimEditOp[] = [{start: ls, end, text: "", kind: "delete"}];
        const next = applyOps(text, ops);
        this.doc.setText(next, ops);
        this.cursor =
            next.length > 0 ? firstNonBlankOf(next, Math.min(ls, next.length - 1)) : 0;
        this.lastChange = {kind: "deleteLines", n: to - from + 1};
    }

    private indentLinesAt(fromLine: number, n: number, indent: boolean): void {
        const text = this.doc.getText();
        const last = lastLineIndex(text);
        const from = Math.max(0, Math.min(fromLine, last));
        const to = Math.min(from + Math.max(1, n) - 1, last);
        const ops: VimEditOp[] = [];
        for (let line = from; line <= to; line++) {
            const ls = lineStartOfLine(text, line);
            const le = lineEndOf(text, ls);
            if (indent) {
                if (ls < le) {
                    ops.push({start: ls, end: ls, text: " ".repeat(this.tabWidth), kind: "insert"});
                }
            } else {
                let cut = 0;
                while (cut < this.tabWidth && ls + cut < le && text[ls + cut] === " ") cut++;
                if (cut > 0) ops.push({start: ls, end: ls + cut, text: "", kind: "delete"});
            }
        }
        if (ops.length === 0) return;
        const next = applyOps(text, ops);
        this.doc.setText(next, ops);
        const firstLs = lineStartOfLine(text, from);
        this.cursor =
            next.length > 0 ? firstNonBlankOf(next, Math.min(firstLs, next.length - 1)) : 0;
        this.lastChange = {kind: "lineAction", action: indent ? "indent" : "outdent", n: to - from + 1};
    }

    private toggleCaseRange(s: number, e: number): void {
        const text = this.doc.getText();
        const start = Math.max(0, Math.min(s, text.length));
        const end = Math.max(start, Math.min(e, text.length));
        const ops: VimEditOp[] = [];
        for (let i = start; i < end && i < text.length; i++) {
            const ch = text[i];
            if (/[a-z]/.test(ch)) ops.push({start: i, end: i + 1, text: ch.toUpperCase(), kind: "replace"});
            else if (/[A-Z]/.test(ch)) ops.push({start: i, end: i + 1, text: ch.toLowerCase(), kind: "replace"});
        }
        if (ops.length === 0) {
            this.cursor = clampCursor(text, end);
            return;
        }
        const next = applyOps(text, ops);
        this.doc.setText(next, ops);
        this.cursor = clampCursor(next, end);
        this.lastChange = {kind: "ops", anchor: start, ops};
    }

    private doPaste(after: boolean): void {
        const n = this.count ?? 1;
        this.count = null;
        const entry = this.readRegister();
        if (!entry || !entry.text) {
            this.message = "empty register";
            return;
        }
        this.doPasteRaw(entry, after, n);
    }

    private doPasteRaw(entry: RegisterEntry, after: boolean, times: number): void {
        const text = this.doc.getText();
        const cursor = clampCursor(text, this.cursor);
        let ops: VimEditOp[];
        let nextCursor: number;
        if (entry.linewise) {
            const body = entry.text.endsWith("\n") ? entry.text : entry.text + "\n";
            let payload = body.repeat(Math.max(1, times));
            let insertAt: number;
            if (after) {
                const eol = lineEndOf(text, cursor);
                if (eol < text.length) {
                    insertAt = eol + 1; // below the current line
                } else {
                    insertAt = text.length;
                    payload = "\n" + payload; // last line had no newline of its own
                }
            } else {
                insertAt = lineStartOf(text, cursor); // above the current line
            }
            ops = [{start: insertAt, end: insertAt, text: payload, kind: "insert"}];
            const next = applyOps(text, ops);
            this.doc.setText(next, ops);
            nextCursor =
                next.length > 0 ? firstNonBlankOf(next, Math.min(insertAt, next.length - 1)) : 0;
            this.cursor = nextCursor;
        } else {
            const payload = entry.text.repeat(Math.max(1, times));
            const insertAt = after ? Math.min(cursor + 1, text.length) : cursor;
            ops = [{start: insertAt, end: insertAt, text: payload, kind: "insert"}];
            const next = applyOps(text, ops);
            this.doc.setText(next, ops);
            nextCursor = payload.length > 0 ? insertAt + payload.length - 1 : insertAt;
            this.cursor = clampCursor(next, nextCursor);
        }
        this.lastChange = {kind: "paste", text: entry.text, linewise: entry.linewise, after};
    }

    // ── registers ─────────────────────────────────────────────────────────

    private setRegister(text: string, linewise: boolean): void {
        const sel = this.pendingRegister;
        this.pendingRegister = null;
        const name = sel?.name ?? "";
        if (name) {
            if (sel?.append) {
                const cur = this.registers[name];
                this.registers[name] = cur ? {text: cur.text + text, linewise: cur.linewise} : {text, linewise};
            } else {
                this.registers[name] = {text, linewise};
            }
        }
        this.registers[""] = {text, linewise};
    }

    private readRegister(): RegisterEntry | null {
        const sel = this.pendingRegister;
        this.pendingRegister = null;
        const name = sel?.name ?? "";
        return this.registers[name] ?? this.registers[""] ?? null;
    }

    // ── insert mode ───────────────────────────────────────────────────────

    private enterInsert(
        pos: number,
        opts: {
            preOps?: VimEditOp[];
            entryKind?: InsertSession["entryKind"];
            lineCount?: number;
            preAnchor?: number;
        } = {}
    ): void {
        const before = this.doc.getText();
        const preOps = opts.preOps ?? [];
        if (preOps.length > 0) {
            const next = applyOps(before, preOps);
            this.doc.setText(next, preOps);
        }
        this.insertSession = {
            preText: before,
            preOffset: pos,
            preAnchor: opts.preAnchor ?? this.cursor,
            preOps,
            entryKind: opts.entryKind ?? "plain",
            lineCount: opts.lineCount ?? 1,
        };
        this.mode = "insert";
        this.cursor = clampCursor(this.doc.getText(), pos);
        this.cursorSynced = false;
        this.clearKeys();
    }

    private exitInsert(): void {
        const session = this.insertSession;
        this.mode = "normal";
        this.insertSession = null;
        const wasSynced = this.cursorSynced;
        this.cursorSynced = false;
        if (!session) {
            this.clearKeys();
            return;
        }
        const text = this.doc.getText();
        const d = diffText(session.preText, text);
        let cursor: number;
        if (d) {
            cursor = d.text.length > 0 ? d.start + d.text.length - 1 : d.start;
        } else if (wasSynced) {
            cursor = clampCursor(text, this.cursor);
        } else {
            cursor = session.preOffset;
        }
        this.cursor = clampCursor(text, cursor);
        const insText = d ? d.text : "";
        switch (session.entryKind) {
            case "o":
                this.lastChange = {kind: "insertBelow", text: insText};
                break;
            case "O":
                this.lastChange = {kind: "insertAbove", text: insText};
                break;
            case "changeLines":
                this.lastChange = {kind: "changeLines", n: session.lineCount, text: insText};
                break;
            case "charChange": {
                // fold the pre-delete and the typed text into ONE replace op
                const del = session.preOps[0];
                const start = del ? del.start : session.preOffset;
                const end = del ? Math.max(del.end, start) : start;
                const kind: VimEditOp["kind"] = end > start ? (insText ? "replace" : "delete") : "insert";
                this.lastChange = {kind: "ops", anchor: session.preAnchor, ops: [{start, end, text: insText, kind}]};
                break;
            }
            default:
                if (d) {
                    const kind: VimEditOp["kind"] = d.end > d.start ? (d.text ? "replace" : "delete") : "insert";
                    this.lastChange = {
                        kind: "ops",
                        anchor: session.preOffset,
                        ops: [{start: d.start, end: d.end, text: d.text, kind}],
                    };
                }
                break;
        }
        this.clearKeys();
    }

    /** Only used during macro replay — live typing is the host's job. */
    private selfInsert(key: string): void {
        const text = this.doc.getText();
        const cursor = clampCursor(text, this.cursor);
        const op: VimEditOp = {start: cursor, end: cursor, text: key, kind: "insert"};
        const next = applyOps(text, [op]);
        this.doc.setText(next, [op]);
        this.cursor = clampCursor(next, cursor + 1);
    }

    // ── visual mode ──────────────────────────────────────────────────────

    private enterVisual(linewise: boolean): void {
        this.mode = "visual";
        this.visualLinewise = linewise;
        this.visualAnchor = clampCursor(this.doc.getText(), this.cursor);
        this.clearKeys();
    }

    private exitVisual(): void {
        if (this.mode === "visual" && this.visualAnchor !== null) {
            this.lastVisual = {anchor: this.visualAnchor, cursor: this.cursor, linewise: this.visualLinewise};
        }
        this.mode = "normal";
        this.visualAnchor = null;
        this.clearKeys();
    }

    private reselectVisual(): void {
        if (!this.lastVisual) {
            this.message = "no previous selection";
            return;
        }
        this.mode = "visual";
        this.visualLinewise = this.lastVisual.linewise;
        this.visualAnchor = this.lastVisual.anchor;
        this.cursor = clampCursor(this.doc.getText(), this.lastVisual.cursor);
        this.clearKeys();
    }

    private visualSelection(): { s: number; e: number; linewise: boolean; lineCount: number } | null {
        if (this.mode !== "visual" || this.visualAnchor === null) return null;
        const text = this.doc.getText();
        const a = Math.min(this.visualAnchor, this.cursor);
        const b = Math.max(this.visualAnchor, this.cursor);
        if (this.visualLinewise) {
            const la = lineIndex(text, a);
            const lb = lineIndex(text, b);
            return {
                s: lineStartOfLine(text, la),
                e: Math.min(lineEndOfLine(text, lb) + 1, text.length),
                linewise: true,
                lineCount: lb - la + 1,
            };
        }
        return {s: a, e: Math.min(b + 1, text.length), linewise: false, lineCount: 1};
    }

    private visualDelete(): void {
        const sel = this.visualSelection();
        if (!sel) {
            this.exitVisual();
            return;
        }
        if (sel.linewise) {
            const text = this.doc.getText();
            this.exitVisual();
            this.deleteLinesAt(lineIndex(text, sel.s), sel.lineCount);
        } else {
            this.exitVisual();
            this.deleteChars(sel.s, sel.e);
        }
    }

    private visualYank(forceLinewise: boolean): void {
        const sel = this.visualSelection();
        if (!sel) {
            this.exitVisual();
            return;
        }
        const text = this.doc.getText();
        if (forceLinewise || sel.linewise) {
            const la = lineIndex(text, sel.s);
            const lb = lineIndex(text, Math.max(sel.s, sel.e - 1));
            this.setRegister(text.slice(lineStartOfLine(text, la), Math.min(lineEndOfLine(text, lb) + 1, text.length)), true);
            this.cursor = firstNonBlankOf(text, lineStartOfLine(text, la));
        } else {
            this.setRegister(text.slice(sel.s, sel.e), false);
            this.cursor = clampCursor(text, sel.s);
        }
        this.exitVisual();
        this.message = "yanked";
    }

    private visualChange(): void {
        const sel = this.visualSelection();
        if (!sel) {
            this.exitVisual();
            return;
        }
        if (sel.linewise) {
            const text = this.doc.getText();
            this.exitVisual();
            this.runOperatorLines("c", lineIndex(text, sel.s), sel.lineCount);
        } else {
            const s = sel.s;
            const e = sel.e;
            this.exitVisual();
            this.changeRange(s, e);
        }
    }

    // ── dot repeat ───────────────────────────────────────────────────────

    private applyLastChange(times: number): void {
        for (let t = 0; t < Math.max(1, times); t++) {
            const ch = this.lastChange;
            if (!ch) break;
            switch (ch.kind) {
                case "ops": {
                    const text = this.doc.getText();
                    const shift = clampCursor(text, this.cursor) - ch.anchor;
                    const ops: VimEditOp[] = [];
                    for (const o of ch.ops) {
                        const start = Math.max(0, Math.min(o.start + shift, text.length));
                        const end = Math.max(start, Math.min(o.end + shift, text.length));
                        if (end > start || o.text.length > 0) {
                            ops.push({start, end, text: o.text, kind: o.kind});
                        }
                    }
                    if (ops.length === 0) break;
                    const next = applyOps(text, ops);
                    this.doc.setText(next, ops);
                    const last = ops[ops.length - 1];
                    this.cursor = clampCursor(
                        next,
                        last.text.length > 0 ? last.start + last.text.length - 1 : last.start
                    );
                    break;
                }
                case "deleteLines": {
                    const text = this.doc.getText();
                    this.deleteLinesAt(lineIndex(text, this.cursor), ch.n);
                    break;
                }
                case "changeLines":
                    this.replayChangeLines(ch.n, ch.text);
                    break;
                case "lineAction": {
                    const text = this.doc.getText();
                    this.indentLinesAt(lineIndex(text, this.cursor), ch.n, ch.action === "indent");
                    break;
                }
                case "insertBelow":
                case "insertAbove":
                    this.replayInsert(ch.kind, ch.text);
                    break;
                case "paste": {
                    const entry: RegisterEntry = {text: ch.text, linewise: ch.linewise};
                    this.doPasteRaw(entry, ch.after, 1);
                    break;
                }
            }
        }
        this.count = null;
    }

    private replayChangeLines(n: number, insertText: string): void {
        const cur = this.doc.getText();
        const line = lineIndex(cur, this.cursor);
        const ls = lineStartOfLine(cur, line);
        const le = lineEndOfLine(cur, Math.min(line + n - 1, lastLineIndex(cur)));
        const ops: VimEditOp[] = [{start: ls, end: le, text: insertText, kind: "replace"}];
        const next = applyOps(cur, ops);
        this.doc.setText(next, ops);
        this.cursor = clampCursor(next, insertText.length > 0 ? ls + insertText.length - 1 : ls);
    }

    private replayInsert(kind: "insertBelow" | "insertAbove", insertText: string): void {
        const cur = this.doc.getText();
        const insertAt =
            kind === "insertBelow" ? lineEndOf(cur, this.cursor) : lineStartOf(cur, this.cursor);
        const ops: VimEditOp[] = [{start: insertAt, end: insertAt, text: insertText, kind: "insert"}];
        const next = applyOps(cur, ops);
        this.doc.setText(next, ops);
        this.cursor = clampCursor(next, insertText.length > 0 ? insertAt + insertText.length - 1 : insertAt);
    }

    // ── macros ────────────────────────────────────────────────────────────

    private replayMacro(reg: string): void {
        const keys = this.macros[reg];
        if (!keys || keys.length === 0) {
            this.message = `no macro @${reg}`;
            return;
        }
        const was = this.replaying;
        this.replaying = true;
        let applied = 0;
        for (const enc of keys) {
            if (applied++ >= MAX_MACRO_KEYS) {
                this.message = "macro replay capped at 10000 keys";
                break;
            }
            const ev = decodeKey(enc);
            this.feed(ev.key, ev.ctrl);
        }
        this.replaying = was;
        this.lastReplay = reg;
        this.message = `replayed @${reg}`;
    }

    // ── :set / :substitute ───────────────────────────────────────────────

    private applySet(c: string): void {
        const args = c.slice(3).trim().split(/\s+/).filter(Boolean);
        if (args.length === 0) {
            this.message = `nu=${this.nu} rnu=${this.rnu}`;
            return;
        }
        for (const a of args) {
            switch (a) {
                case "nu":
                case "number":
                    this.nu = true;
                    break;
                case "nonu":
                case "nonumber":
                    this.nu = false;
                    break;
                case "rnu":
                case "relativenumber":
                    this.rnu = true;
                    break;
                case "nornu":
                case "norelativenumber":
                    this.rnu = false;
                    break;
                default:
                    this.message = `unknown option ${a}`;
            }
        }
    }

    /** :%s/old/new/[g] — plain-string substitution over the whole doc. */
    private substitute(c: string): boolean {
        const m = /^%s([\s\S])([\s\S]*)$/.exec(c);
        if (!m) return false;
        const delim = m[1];
        const rest = m[2];
        const parts: string[] = [];
        let cur = "";
        for (let i = 0; i < rest.length; i++) {
            const ch = rest[i];
            if (ch === "\\" && i + 1 < rest.length) {
                cur += rest[i + 1]; // \/ and \\ honored — everything else passes raw
                i++;
                continue;
            }
            if (ch === delim) {
                parts.push(cur);
                cur = "";
                continue;
            }
            cur += ch;
        }
        parts.push(cur);
        if (parts.length < 2) return false;
        const old = parts[0];
        const replacement = parts[1];
        const flags = parts.slice(2).join("");
        if (!old) {
            this.message = "empty pattern";
            return true;
        }
        const global = flags.includes("g");
        const text = this.doc.getText();
        const ops: VimEditOp[] = [];
        let count = 0;
        let ls = 0;
        while (ls <= text.length) {
            const nl = text.indexOf("\n", ls);
            const le = nl === -1 ? text.length : nl;
            if (le > ls) {
                const lineText = text.slice(ls, le);
                if (lineText.includes(old)) {
                    let nextLine = lineText;
                    if (global) {
                        nextLine = lineText.split(old).join(replacement);
                        count += lineText.split(old).length - 1;
                    } else {
                        const idx = lineText.indexOf(old);
                        nextLine = lineText.slice(0, idx) + replacement + lineText.slice(idx + old.length);
                        count += 1;
                    }
                    if (nextLine !== lineText) {
                        ops.push({start: ls, end: le, text: nextLine, kind: "replace"});
                    }
                }
            }
            if (nl === -1) break;
            ls = nl + 1;
        }
        if (ops.length > 0) {
            const next = applyOps(text, ops);
            this.doc.setText(next, ops); // ONE setText for the whole logical change
        }
        this.message = `${count} substitution${count === 1 ? "" : "s"}`;
        return true;
    }

    // ── small helpers ─────────────────────────────────────────────────────

    private clearKeys(): void {
        this.count = null;
        this.opCount = null;
        this.operator = null;
        this.stage = "";
    }

    private cancelPending(): void {
        this.clearKeys();
        this.pendingRegister = null;
    }

    private hasPending(): boolean {
        return (
            this.count !== null ||
            this.opCount !== null ||
            this.operator !== null ||
            this.stage !== "" ||
            this.pendingRegister !== null
        );
    }

    private pendingDisplay(): string {
        let p = "";
        if (this.pendingRegister) p += `"${this.pendingRegister.name}`;
        if (this.count !== null) p += String(this.count);
        if (this.operator) p += this.operator;
        if (this.stage) {
            if (this.stage.startsWith("find-")) p += this.stage.slice(5);
            else if (this.stage === "obj-i") p += "i";
            else if (this.stage === "obj-a") p += "a";
            else if (this.stage === "mark-line" || this.stage === "mark-exact") p += "'";
            else p += this.stage;
        }
        return p;
    }
}

/** `NORMAL 3"" recording @a 3 substitutions` style one-liner for the host's
 *  status bar. */
export function createVimStatusLine(state: VimState): string {
    const mode = state.mode.toUpperCase();
    const count = state.count !== null ? String(state.count) : "";
    const head = `${mode} ${count}${state.register}`.replace(/\s+/g, " ").trim();
    const tail: string[] = [];
    if (state.pending) tail.push(state.pending);
    if (state.recording) tail.push(`recording @${state.recording}`);
    if (state.lastReplay) tail.push(`last @${state.lastReplay}`);
    if (state.message) tail.push(state.message);
    return [head, ...tail].filter(Boolean).join("  ");
}
