"use client";

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import {
    Braces,
    Bug,
    CircleAlert,
    CircleCheck,
    CircleX,
    CornerDownRight,
    Flame,
    Loader2,
    MapPin,
    Play,
    ShieldCheck,
    SkipForward,
    Sparkles,
    Square,
    Stethoscope,
    Table2,
    Trash2,
    Type,
    Undo2,
    Wand2,
    Wrench,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {cn} from "@/lib/utils";
import {formatRequestSettings, loadSettings} from "@/lib/settings";
import {takePendingDebugRun} from "@/lib/pending-console-run";
import {useToast} from "@/hooks/use-toast";
// Flame graph view of the cProfile rows — pure-canvas render of the
// (derived) call tree, mounted beside the pstats table below.
import {FlameGraph} from "@/components/flame-graph";

interface DiagnosticsPanelProps {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Called when a lint or typecheck tool finishes with errors.
     *  Used by the parent to auto-switch to the Diagnostics tab
     *  (Settings → Advanced → autoSwitchToDiagnosticsOnError). */
    onError?: () => void;
    /** "Fix with AI" — sends one diagnostic (with a few lines
     * of context) to the integrated AI chat. The parent owns the AI
     * sidebar and the file content, so it builds the actual prompt. */
    onAiFix?: (diag: {
        line: number;
        col?: number;
        message: string;
        tool: string;
    }) => void;
    /** "AI review all" — one prompt for EVERY diagnostic
     * in the current tool's result (grouped), so the chat returns a
     * single reviewable answer instead of N one-by-one fixes. */
    onAiFixAll?: (diags: Array<{
        line: number;
        col?: number;
        message: string;
        tool: string;
    }>) => void;
    /** profiling heatmap feed. Called when a Profile run
     *  finishes (and with `undefined` when it produces nothing) so the
     *  parent can map pstats `file.py:LINE(...)` locations onto per-line
     *  timing bars in the code viewer. */
    onProfileResult?: (
        lines: Array<{ ncalls: string; tottime: number; cumtime: number; location: string }> | undefined
    ) => void;
    /** Clicked a problem row (severity icon + file + line). The row
     *  already jumps by itself through the app-wide `praxis:goto-line`
     *  window event (page.tsx has a listener — zero wiring needed); this
     *  callback is the explicit prop-based alternative for parents that
     *  want the issue too. Entirely optional. */
    onSelectIssue?: (issue: DiagnosticIssue) => void;
}

/** One clickable problem row — everything the parent needs to open
 *  the file at the exact position. Exported so page.tsx (or any other
 *  host) can consume the same shape it receives. */
export interface DiagnosticIssue {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    line: number;
    col?: number;
    message: string;
    severity: "error" | "warning" | "info";
}

interface LintDiagnostic {
    line: number;
    col: number;
    code: string;
    message: string;
}

interface TypeDiagnostic {
    line: number;
    col: number;
    severity: "error" | "warning" | "note";
    message: string;
}

interface ProfileLine {
    ncalls: string;
    tottime: number;
    cumtime: number;
    location: string;
}

interface TestEntry {
    name: string;
    status: "passed" | "failed" | "skipped" | "error";
    durationMs?: number;
    message?: string;
}

interface Vulnerability {
    name: string;
    version: string;
    fixVersion: string;
    id: string;
    description: string;
}

/** Union of every tool the panel can run. Includes the new `audit` and `debug` tabs. */
type ToolName =
    | "lint"
    | "format"
    | "typecheck"
    | "profile"
    | "test"
    | "audit"
    | "debug";

/** A lint or type diagnostic — both have `line`/`col` so the union is callable for quick-fix. */
type Diagnostic = LintDiagnostic | TypeDiagnostic;

/**
 * Severity buckets used by the filter chips at the top of the panel.
 * Lint diagnostics don't carry a severity field, so we derive one from
 * the ruff/pyflakes code prefix; typecheck diagnostics already have one.
 */
type Severity = "error" | "warning" | "info";

type SeverityFilterState = Record<Severity, boolean>;
/** Per-severity counts — used by the filter chips to show "Error (3)"
 *  etc. Distinct from `SeverityFilterState` (which holds booleans). */
type SeverityCounts = Record<Severity, number>;

/**
 * Derive a severity from a ruff/pyflakes code prefix. Lint diagnostics
 * don't carry an explicit severity field — ruff codes are categorized
 * by their leading letter(s):
 * E (pycodestyle Error) → error
 * F (pyflakes) → error (correctness: unused imports, undefined names)
 * W (pycodestyle Warn) → warning
 * everything else → info (style, imports, docs, naming, etc.)
 */
function lintSeverity(code: string): Severity {
    if (code.startsWith("E") || code.startsWith("F")) return "error";
    if (code.startsWith("W")) return "warning";
    return "info";
}

/** Map a typecheck diagnostic's severity onto the chip buckets. */
function typeSeverity(d: TypeDiagnostic): Severity {
    return d.severity === "note" ? "info" : d.severity;
}

/* ── mypy quick-fix payload computation ──────────────────────────────
 *
 * Pure helpers for the typecheck quick-fixes BEYOND `# type: ignore`:
 *
 * · "Annotate"  — insert `: Any` after a simple-name assignment target
 *   (Incompatible types in assignment / Need type annotation for …),
 *   or `-> Any` after the closing paren of the enclosing `def` when
 *   mypy flags "Returning Any from function …".
 * · "Cast"      — wrap the reported RHS in `cast("<expected>", …)` when
 *   the expected type is machine-extractable from the message.
 *
 * Every helper takes the mypy diagnostic plus the CURRENT file content
 * and returns the complete modified file content — or null when no safe
 * insertion point is computable (ambiguous RHS, multi-line statement,
 * annotated target, …). Null means the fix is simply not offered.
 *
 * Both fixes add the `from typing import Any` / `… import cast` import
 * when missing (naive isort placement, after the module docstring /
 * import block). Exported for unit tests
 * (src/lib/__tests__/type-quickfix.test.ts). */

/** The typecheck quick-fix kinds the panel can apply. */
export type TypeFixKind = "ignore" | "annotate" | "cast";

/** Escape a literal for use inside a RegExp. */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find the index of the single top-level `=` of an assignment line,
 *  or -1. `==`, `!=`, `<=`, `>=`, augmented (`+=`, `//=`, …) and walrus
 *  (`:=`) forms are rejected — none of them can take an annotation;
 *  `=` inside brackets (call kwargs) or strings doesn't count. */
function scanTopLevelEquals(line: string): number {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "#") return -1; // comment — nothing code-like follows
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") {
            depth += 1;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            depth -= 1;
            continue;
        }
        if (ch === "=" && depth === 0) {
            if (line[i + 1] === "=") return -1; // ==
            const prev = i > 0 ? line[i - 1] : "";
            if (prev !== "" && "+-*/%&|^@<>!:".includes(prev)) return -1;
            return i;
        }
    }
    return -1;
}

/** Strip a trailing `# comment` (quote-aware — a `#` inside a string
 *  literal is not a comment). Used to find the real RHS end. */
export function stripTrailingComment(
    code: string
): { code: string; comment: string | null } {
    let quote: string | null = null;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (quote) {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === "#") return {code: code.slice(0, i), comment: code.slice(i)};
    }
    return {code, comment: null};
}

/** A split `target = rhs` assignment line (only when the target is a
 *  simple name — `a.b = …` and `a, b = …` can't take annotations). */
export interface AssignParts {
    /** Indentation + target + trailing space, everything before the `=`. */
    before: string;
    /** Simple-name assignment target, e.g. "x". */
    target: string;
    /** Index of the top-level `=` inside the line. */
    eqIndex: number;
    /** RHS with the trailing comment stripped and end-trimmed. */
    rhs: string;
    /** Trailing comment starting at `#` (no leading whitespace), or null. */
    trailingComment: string | null;
    /** Leading indentation. */
    indent: string;
}

/** Split a single-line `name = rhs` assignment; null when the line is
 *  not that shape (no top-level `=`, non-simple target, empty RHS). */
export function splitTopLevelAssign(line: string): AssignParts | null {
    const eq = scanTopLevelEquals(line);
    if (eq < 0) return null;
    const before = line.slice(0, eq);
    const indent = (/^\s*/.exec(before) ?? [""])[0];
    const target = before.slice(indent.length).replace(/\s+$/, "");
    if (!/^[A-Za-z_]\w*$/.test(target)) return null;
    const rhsRaw = line.slice(eq + 1).replace(/^\s+/, "");
    if (!rhsRaw) return null;
    const {code, comment} = stripTrailingComment(rhsRaw);
    const rhs = code.replace(/\s+$/, "");
    if (!rhs) return null;
    return {before, target, eqIndex: eq, rhs, trailingComment: comment, indent};
}

/** True when the line already imports `name` from typing (line form,
 *  paren multi-line form, or `from typing import *`). */
export function hasTypingImport(content: string, name: string): boolean {
    const esc = escapeRegExp(name);
    if (
        new RegExp(`^\\s*from\\s+typing\\s+import\\s+[^\n(]*\\b${esc}\\b`, "m").test(content)
    ) {
        return true;
    }
    if (new RegExp(`from\\s+typing\\s+import\\s*\\([^)]*\\b${esc}\\b`).test(content)) {
        return true;
    }
    return /^\s*from\s+typing\s+import\s+\*/m.test(content);
}

/** Bracket depth delta of one line (outside string literals) — used to
 *  track multi-line paren imports while scanning the import block. */
function bracketDelta(line: string): number {
    let delta = 0;
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") delta += 1;
        else if (ch === ")" || ch === "]" || ch === "}") delta -= 1;
    }
    return delta;
}

/** Insert `from typing import <name>` when missing. Naive isort
 *  placement: after the shebang/coding cookie/comment header and the
 *  module docstring, appended AFTER the last import of the leading
 *  import block (paren multi-line imports included via bracket-depth
 *  tracking), before the first code line when there are no imports.
 *  Never merges into an existing import — a second
 *  `from typing import …` line is always valid Python. */
export function insertTypingImport(content: string, name: string): string {
    if (hasTypingImport(content, name)) return content;
    const lines = content.split("\n");
    let i = 0;
    if (lines[0]?.startsWith("#!")) i = 1;
    if (i < lines.length && /^#\s*[-*]-\s*coding:/.test(lines[i])) i += 1;
    // Leading comment/blank header (license blocks).
    while (i < lines.length && /^\s*(#.*)?$/.test(lines[i])) i += 1;
    // Module docstring (single- or multi-line).
    if (i < lines.length) {
        const m = /^("""|''')/.exec(lines[i]);
        if (m) {
            const q = m[1];
            if (lines[i].slice(3).includes(q)) {
                i += 1;
            } else {
                i += 1;
                while (i < lines.length && !lines[i].includes(q)) i += 1;
                if (i < lines.length) i += 1;
            }
        }
    }
    // Blank separator right after the header/docstring.
    while (i < lines.length && /^\s*$/.test(lines[i])) i += 1;
    // The leading import block. `depth` tracks multi-line paren imports —
    // an unclosed `from x import (` keeps the continuation lines (up to
    // and including the closing paren line) part of the block.
    let lastImport = -1;
    let depth = 0;
    let j = i;
    while (j < lines.length) {
        const line = lines[j];
        if (depth === 0) {
            if (/^\s*(#.*)?$/.test(line)) {
                j += 1;
                continue;
            }
            if (
                /^\s*(?:from\s+[\w.]+\s+import\b|import\s+[\w.]+)/.test(line)
            ) {
                lastImport = j;
                depth = Math.max(0, bracketDelta(line));
                j += 1;
                continue;
            }
            if (/^\s+/.test(line)) {
                j += 1;
                continue;
            }
            break; // first real code line
        } else {
            // Inside a paren import list — this line (and the closer) belong
            // to the import.
            lastImport = j;
            depth = Math.max(0, depth + bracketDelta(line));
            j += 1;
        }
    }
    const at = lastImport >= 0 ? lastImport + 1 : Math.min(i, lines.length);
    lines.splice(at, 0, `from typing import ${name}`);
    return lines.join("\n");
}

/** Find where a def's parameter list closes (may span lines — defaults
 *  with strings/parens included). Returns the column just after the
 *  closing `)`, or null when it never closes nearby. */
function findSignatureClose(
    lines: string[],
    defIdx: number
): { lineIndex: number; col: number } | null {
    const openParen = lines[defIdx].indexOf("(");
    if (openParen < 0) return null;
    let depth = 0;
    let quote: string | null = null;
    let seenOpen = false;
    const limit = Math.min(lines.length, defIdx + 200);
    for (let i = defIdx; i < limit; i++) {
        for (
            let j = i === defIdx ? openParen : 0;
            j < lines[i].length;
            j++
        ) {
            const ch = lines[i][j];
            if (quote) {
                if (ch === "\\") {
                    j += 1;
                    continue;
                }
                if (ch === quote) quote = null;
                continue;
            }
            if (ch === "'" || ch === '"') {
                quote = ch;
                continue;
            }
            if (ch === "(") {
                depth += 1;
                seenOpen = true;
                continue;
            }
            if (ch === ")") {
                depth -= 1;
                if (seenOpen && depth === 0) return {lineIndex: i, col: j + 1};
            }
        }
    }
    return null;
}

/** Find the `-> Any` insertion point for a "Returning Any from
 *  function" diagnostic: the enclosing def's signature close. The
 *  nearest def ABOVE the statement with a smaller indentation wins
 *  (deeper defs are nested, not enclosing). Null when the signature
 *  already has a `-> …` annotation (or anything is ambiguous). */
function findReturnAnnotationPoint(
    lines: string[],
    stmtIdx: number
): { lineIndex: number; col: number } | null {
    const stmtIndent = (/^\s*/.exec(lines[stmtIdx] ?? "") ?? [""])[0].length;
    for (let i = stmtIdx; i >= 0; i--) {
        const m = /^(\s*)(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/.exec(lines[i]);
        if (!m) continue;
        if (m[1].length >= stmtIndent) continue; // nested def, not enclosing
        const close = findSignatureClose(lines, i);
        if (!close || close.lineIndex > stmtIdx) return null;
        // An explicit `->` already annotates the return — nothing to add.
        const rest = lines[close.lineIndex].slice(close.col).trimStart();
        if (rest.startsWith("->")) return null;
        return close;
    }
    return null;
}

/** Extract the EXPECTED type from a mypy assignment diagnostic, e.g.
 *  `Incompatible types in assignment (expression has type "int",
 *  variable has type "str")` → "str" (newer mypy says `target`). */
export function extractExpectedType(message: string): string | null {
    const m = /expression has type "[^"]+", (?:variable|target|base) has type "([^"]+)"/.exec(
        message
    );
    return m ? m[1] : null;
}

/** Quote a mypy type for use as cast's first argument — always a
 *  string literal so the cast never NameErrors on an unimported
 *  generic (mypy accepts string types there). */
function quoteTypeLiteral(t: string): string {
    return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Brackets balanced and no unterminated string literal. */
function bracketsBalanced(s: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quote) {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") {
            depth -= 1;
            if (depth < 0) return false;
        }
    }
    return depth === 0 && quote === null;
}

/** A top-level `;` (outside quotes/brackets, before any comment)
 *  means multiple statements share the line — ambiguous to rewrite. */
function hasTopLevelSemicolon(line: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "#") return false;
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
        else if (ch === ";" && depth === 0) return true;
    }
    return false;
}

/**
 * "Add type annotation" quick fix — returns the whole modified file
 * content, or null when no safe insertion point exists:
 * · `Returning Any from function …` → `-> Any` after the enclosing
 *   def's closing paren (only when it has no `->` yet);
 * · `Incompatible types in assignment …` / `Need type annotation for …`
 *   → `: Any` right after the simple-name target (only when the line
 *   is a plain `name = …` the target isn't already annotated).
 * Both add `from typing import Any` when missing.
 */
export function computeAnnotationFix(
    diag: { line: number; col: number; message: string },
    content: string
): string | null {
    const lines = content.split("\n");
    const idx = diag.line - 1;
    if (idx < 0 || idx >= lines.length) return null;
    const lineText = lines[idx];

    let edited: string[] | null = null;

    if (/returning any from function/i.test(diag.message)) {
        const insertion = findReturnAnnotationPoint(lines, idx);
        if (!insertion) return null;
        edited = lines.slice();
        edited[insertion.lineIndex] =
            lines[insertion.lineIndex].slice(0, insertion.col) +
            " -> Any" +
            lines[insertion.lineIndex].slice(insertion.col);
    } else if (
        /incompatible types in assignment/i.test(diag.message) ||
        /need type annotation for/i.test(diag.message)
    ) {
        const parts = splitTopLevelAssign(lineText);
        if (!parts) return null;
        if (
            new RegExp(
                `^${escapeRegExp(parts.indent)}${escapeRegExp(parts.target)}\\s*:`
            ).test(lineText)
        ) {
            return null; // target already annotated — replacing is unsafe
        }
        const targetEnd = parts.indent.length + parts.target.length;
        edited = lines.slice();
        edited[idx] =
            lineText.slice(0, targetEnd) + ": Any" + lineText.slice(targetEnd);
    } else {
        return null;
    }

    return insertTypingImport(edited.join("\n"), "Any");
}

/**
 * "Wrap in cast(...)" quick fix — wraps the diagnostic line's RHS in
 * `cast("<expected>", rhs)` when the expected type is
 * machine-extractable from the message AND the RHS boundary is
 * unambiguous (single-line statement, balanced brackets, no line
 * continuation, no top-level `;`, not already a cast). Returns the
 * whole modified file content (with `from typing import cast` added
 * when missing), or null.
 */
export function computeCastFix(
    diag: { line: number; col: number; message: string },
    content: string
): string | null {
    const expected = extractExpectedType(diag.message);
    if (!expected || expected === "Any") return null;
    const lines = content.split("\n");
    const idx = diag.line - 1;
    if (idx < 0 || idx >= lines.length) return null;
    const lineText = lines[idx];
    const parts = splitTopLevelAssign(lineText);
    if (!parts) return null;
    // Ambiguity guards — no fix rather than a wrong rewrite.
    if (/\\\s*$/.test(parts.rhs)) return null; // line continuation
    if (!bracketsBalanced(parts.rhs)) return null; // statement spans lines
    if (hasTopLevelSemicolon(lineText)) return null; // two statements
    if (/^cast\s*\(/.test(parts.rhs)) return null; // already cast
    if (/(^|[\s(])yield\b/.test(parts.rhs)) return null; // not an expression arg

    const head = lineText.slice(0, parts.eqIndex + 1); // `    x =`
    const tail = parts.trailingComment ? `  ${parts.trailingComment}` : "";
    lines[idx] = `${head} cast(${quoteTypeLiteral(expected)}, ${parts.rhs})${tail}`;
    return insertTypingImport(lines.join("\n"), "cast");
}

type ToolState =
    | { status: "idle" }
    | { status: "running" }
    | {
    status: "done";
    ok: boolean;
    linter?: string;
    diagnostics?: LintDiagnostic[];
    typeDiagnostics?: TypeDiagnostic[];
    profileLines?: ProfileLine[];
    pstatsUrl?: string;
    tests?: TestEntry[];
    vulnerabilities?: Vulnerability[];
    raw?: string;
    hint?: string;
    /** Source of the checked file (best-effort fetch after a typecheck
     *  run with diagnostics) — lets the typecheck rows compute the
     * Annotate / Cast quick-fixes' insertion points synchronously.
     * Missing → those fixes simply aren't offered. */
    fileContent?: string;
}
    | { status: "error"; message: string };

/** One frame of the debugger call stack, as delivered by the
 *  `stopped`/`frame` SSE events (bottom-up: index 0 = oldest frame,
 *  last = innermost; `file` is a basename or a synthetic pdb name
 *  like "<string>"). */
export interface DebugStackFrame {
    index: number;
    function: string;
    file: string;
    line: number;
    /** True when pdb's selection sits on this frame. */
    current: boolean;
}

/** One watch expression evaluated at a stop (value OR error text). */
export interface DebugWatchValue {
    expression: string;
    value?: string;
    error?: string;
}

/** Validate an untrusted `stack` event payload; null when malformed. */
function normalizeDebugStack(v: unknown): DebugStackFrame[] | null {
    if (!Array.isArray(v) || v.length === 0) return null;
    const out: DebugStackFrame[] = [];
    for (const f of v) {
        if (!f || typeof f !== "object") return null;
        const o = f as Record<string, unknown>;
        if (
            typeof o.index !== "number" ||
            typeof o.function !== "string" ||
            typeof o.file !== "string" ||
            typeof o.line !== "number"
        ) {
            return null;
        }
        out.push({
            index: o.index,
            function: o.function,
            file: o.file,
            line: o.line,
            current: o.current === true,
        });
    }
    return out;
}

/** Validate an untrusted `watches` event payload; null when malformed. */
function normalizeDebugWatches(v: unknown): DebugWatchValue[] | null {
    if (!Array.isArray(v)) return null;
    return v.map((w) => {
        const o = (w ?? {}) as Record<string, unknown>;
        return {
            expression: typeof o.expression === "string" ? o.expression : "",
            value: typeof o.value === "string" ? o.value : undefined,
            error: typeof o.error === "string" ? o.error : undefined,
        };
    });
}

interface DebugState {
    running: boolean;
    /** True while pdb sits at a stop, waiting for a step command — the
     *  control bar's Continue / Next / Step / Return buttons light up. */
    paused: boolean;
    /** The live session id from the route's `start` event; step commands
     *  POST { sessionId, command } against it. */
    sessionId: string | null;
    /** Line the debugger is stopped at (for the file:line indicator and
     *  the editor's stopped-line highlight). */
    stoppedLine: number | null;
    /** Frame (function) name at the current stop, e.g. "main". */
    stoppedFrame: string | null;
    breakpoints: number[];
    variables: string;
    output: string;
    exitCode: number | null;
    error?: string;
    interpreter?: string;
    /** Call stack at the current stop (bottom-up; optional field on the
     *  stopped/frame events — null when the route couldn't capture one). */
    stack: DebugStackFrame[] | null;
    /** Bottom-up index of pdb's selected frame in `stack`. */
    currentFrame: number | null;
    /** Latest watch values, keyed by expression (from stopped/frame
     *  events and the watch-set POST response). */
    watchValues: DebugWatchValue[] | null;
}

/**
 * A collapsible panel that runs lint / format / typecheck / profile / test
 * / audit / debug tools against the currently-selected script. Each tool
 * gets a tab.
 */
export function DiagnosticsPanel({
                                     folderSlug,
                                     fileSlug,
                                     fileName,
                                     onError,
                                     onAiFix,
                                     onAiFixAll,
                                     onProfileResult,
                                     onSelectIssue,
                                 }: DiagnosticsPanelProps) {
    const [open, setOpen] = React.useState(true);
    const [activeTool, setActiveTool] = React.useState<ToolName>("lint");
    const [state, setState] = React.useState<ToolState>({status: "idle"});
    /** Tracks which diagnostic's Fix button is currently in-flight, so we
     * can show a spinner on exactly that button. Format: `${tool}-${line}-${col}`. */
    const [fixingKey, setFixingKey] = React.useState<string | null>(null);
    /** True while the "Fix all" button is in-flight (calls /api/fix-all). */
    const [fixingAll, setFixingAll] = React.useState(false);
    /** Per-severity visibility toggles for the lint/typecheck lists.
     *  Default: all three on. Reset to all-on when the script changes. */
    const [severityFilters, setSeverityFilters] =
        React.useState<SeverityFilterState>({error: true, warning: true, info: true});
    const {toast} = useToast();

    const [debug, setDebug] = React.useState<DebugState>({
        running: false,
        paused: false,
        sessionId: null,
        stoppedLine: null,
        stoppedFrame: null,
        breakpoints: [],
        variables: "",
        output: "",
        exitCode: null,
        stack: null,
        currentFrame: null,
        watchValues: null,
    });
    const [debugStdin, setDebugStdin] = React.useState("");
    /** Watch expressions for the debug session — they ride the /api/debug
     *  start body AND every stop re-evaluates them; adds/removes mid-session
     *  POST the updated list through the same endpoint's watch shape. */
    const [watchExprs, setWatchExprs] = React.useState<string[]>([]);
    /** AbortController for the in-flight /api/debug SSE request, so we can
     * cancel the session when the user clicks Stop or switches scripts. */
    const debugAbortRef = React.useRef<AbortController | null>(null);
    /** AbortControllers for in-flight lint/typecheck/profile/test/audit
     *  requests (an in-flight tool response for the PREVIOUS
     *  file used to resolve after the switch and overwrite the new
     *  file's panel state — file A's diagnostics displayed under file
     *  B's name, including the auto tab-switch via onError). */
    const toolAbortRef = React.useRef<AbortController | null>(null);
    /** Latest slugs, read AFTER an await to detect a file switch that
     *  happened while a tool request was in flight (closures would keep
     *  the stale call-time values). */
    const latestSlugsRef = React.useRef({folderSlug, fileSlug});
    React.useEffect(() => {
        latestSlugsRef.current = {folderSlug, fileSlug};
    }, [folderSlug, fileSlug]);

    const stopDebug = React.useCallback(() => {
        debugAbortRef.current?.abort();
        debugAbortRef.current = null;
        // Clear the paused markers with the run — the route's disconnect
        // cleanup killed the child, so the step bar must go inert too.
        setDebug((d) => ({
            ...d,
            running: false,
            paused: false,
            stoppedLine: null,
            stoppedFrame: null,
            stack: null,
            currentFrame: null,
            watchValues: null,
        }));
    }, []);

    // Reset when the script changes — both the tool state and any in-flight
    // debug session. We keep the breakpoint list across selections because
    // line numbers tend to be stable; the user can clear them manually.
    React.useEffect(() => {
        // abort any in-flight tool request for the previous
        // file so its response can never land here and be attributed to the
        // newly selected one.
        toolAbortRef.current?.abort();
        toolAbortRef.current = null;
        setState({status: "idle"});
        setFixingAll(false);
        setSeverityFilters({error: true, warning: true, info: true});
        stopDebug();
        setDebug((d) => ({
            ...d,
            running: false,
            paused: false,
            sessionId: null,
            stoppedLine: null,
            stoppedFrame: null,
            variables: "",
            output: "",
            exitCode: null,
            error: undefined,
            stack: null,
            currentFrame: null,
            watchValues: null,
        }));
        // The watch list is per debug session — a different file means a
        // different session, so the watches don't carry over.
        setWatchExprs([]);
        // Same for the editor's stopped-line highlight when the debugged
        // file changes — clear the old marker before the new file's viewer
        // mounts.
        window.dispatchEvent(
            new CustomEvent("praxis:debug-stopped-line", {
                detail: {line: null, folderSlug, fileSlug},
            })
        );
    }, [folderSlug, fileSlug, stopDebug]);

    // Cancel any in-flight debug session on unmount.
    React.useEffect(() => {
        return () => {
            debugAbortRef.current?.abort();
        };
    }, []);

    const runTool = async (tool: ToolName) => {
        // Debug has its own SSE-based runner; route it there.
        if (tool === "debug") {
            await runDebug();
            return;
        }
        setActiveTool(tool);
        setState({status: "running"});
        // capture the file identity at call time and abort
        // any previous request — a response that resolves after the user
        // switched files is discarded instead of overwriting the new file's
        // state.
        const requestFolder = folderSlug;
        const requestFile = fileSlug;
        toolAbortRef.current?.abort();
        const controller = new AbortController();
        toolAbortRef.current = controller;
        try {
            const settings = loadSettings();
            // Type checking power mode (Settings → Python): strictness
            // profile + the dmypy daemon travel with the request; inlays are
            // requested so the response can paint type hints into the
            // editor (relayed below through praxis:type-inlays).
            const typeCheckBody =
                tool === "typecheck" && settings.typeCheckEnabled !== false
                    ? {
                        profile: settings.typeCheckProfile ?? "standard",
                        daemon: settings.typeCheckDaemon !== false,
                        columns: true,
                        inlays: true,
                    }
                    : undefined;
            const res = await fetch(`/api/${tool}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    interpreter: settings.pythonInterpreter || undefined,
                    ...(typeCheckBody ?? {}),
                }),
                signal: controller.signal,
            });
            const data = await res.json();
            if (controller.signal.aborted) return;
            // Relay mypy type inlays (the type-check power mode) to the
            // editor — the page listens and passes them to the CodeViewer.
            // The revealed symbolTypes ride their own event: the hover card
            // shows `name: type` on the reveal_type() call lines.
            if (tool === "typecheck") {
                if (Array.isArray((data as { inlays?: unknown }).inlays)) {
                    window.dispatchEvent(
                        new CustomEvent("praxis:type-inlays", {
                            detail: {
                                inlays: (data as {
                                    inlays?: Array<{
                                        line: number;
                                        col: number;
                                        endCol?: number;
                                        label: string;
                                        kind: "type" | "return"
                                    }>
                                }).inlays
                            },
                        })
                    );
                }
                const symbolTypes = (data as {
                    symbolTypes?: Array<{ line: number; name: string; type: string }>
                }).symbolTypes;
                window.dispatchEvent(
                    new CustomEvent("praxis:type-symbols", {
                        detail: {
                            symbolTypes: Array.isArray(symbolTypes) && symbolTypes.length > 0 ? symbolTypes : [],
                        },
                    })
                );
            }
            if (
                latestSlugsRef.current.folderSlug !== requestFolder ||
                latestSlugsRef.current.fileSlug !== requestFile
            ) {
                // The selection moved on while this request was in flight.
                return;
            }
            if (!res.ok) {
                setState({status: "error", message: data.error ?? `HTTP ${res.status}`});
                return;
            }
            if (tool === "lint") {
                setState({
                    status: "done",
                    ok: data.ok,
                    linter: data.linter,
                    diagnostics: data.diagnostics,
                    hint: data.hint,
                });
                // Fire onError when lint finishes with errors — lets the
                // parent auto-switch to the Diagnostics tab.
                if (!data.ok && data.diagnostics?.length > 0) onError?.();
            } else if (tool === "format") {
                setState({
                    status: "done",
                    ok: data.ok,
                    hint: data.changed
                        ? "Formatted. Code viewer will refresh on next selection."
                        : "Already formatted — no changes.",
                });
            } else if (tool === "typecheck") {
                setState({
                    status: "done",
                    ok: data.ok,
                    typeDiagnostics: data.diagnostics,
                    hint: data.hint,
                });
                // Fire onError when typecheck finishes with errors.
                if (!data.ok && data.diagnostics?.length > 0) onError?.();
                // Pull the file content (best-effort) so the typecheck rows can
                // compute the Annotate / Cast quick-fix insertion points
                // synchronously while rendering. A failed fetch just hides
                // those fixes — the ignore fix keeps working either way.
                if (Array.isArray(data.diagnostics) && data.diagnostics.length > 0) {
                    try {
                        const codeRes = await fetch(
                            `/api/code?folder=${encodeURIComponent(requestFolder)}&file=${encodeURIComponent(requestFile)}`,
                            {signal: controller.signal}
                        );
                        const codeData = await codeRes.json().catch(() => ({}));
                        if (
                            codeRes.ok &&
                            !controller.signal.aborted &&
                            typeof (codeData as { content?: unknown }).content === "string"
                        ) {
                            const fileContent = (codeData as { content: string }).content;
                            // Functional update guards against a file switch or a
                            // re-run landing between the await and this setState.
                            setState((prev) =>
                                prev.status === "done" ? {...prev, fileContent} : prev
                            );
                        }
                    } catch {
                        // Aborted or offline — quick-fixes stay hidden.
                    }
                }
            } else if (tool === "profile") {
                setState({
                    status: "done",
                    ok: data.ok,
                    profileLines: data.lines,
                    raw: data.stdout,
                    pstatsUrl: data.pstatsUrl,
                });
                // feed the parent's per-line timing heatmap. It
                // matches `currentFile.py:LINE(` locations back onto the viewer.
                onProfileResult?.(data.lines);
            } else if (tool === "test") {
                setState({
                    status: "done",
                    ok: data.ok,
                    tests: data.tests,
                    hint: data.hint,
                });
            } else if (tool === "audit") {
                setState({
                    status: "done",
                    ok: data.ok,
                    vulnerabilities: data.vulnerabilities,
                    hint: data.hint,
                });
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            if (
                latestSlugsRef.current.folderSlug !== requestFolder ||
                latestSlugsRef.current.fileSlug !== requestFile
            ) {
                return;
            }
            setState({status: "error", message: (err as Error).message});
        }
    };

    // ── Quick-fix actions ────────────────────────────────
    //
    // For lint: call /api/format (disk mode → black/ruff in-place) then
    //   re-run lint. Only shown when the linter is ruff and the diagnostic
    // code is in the auto-fixable set (E/F/W/I).
    // For typecheck: read the file via /api/code, compute the fix, save via
    //   /api/import-py, then re-run typecheck. Three fix kinds share the
    //   exact same pathway (ONE write → ONE local-history snapshot →
    //   exactly one undo step, same as the ignore fix):
    //   · "ignore"    — append `# type: ignore` to the diagnostic line;
    //   · "annotate"  — insert `: Any` on the assignment target (or `-> Any`
    //                  on the enclosing def for "Returning Any …"), adding
    //                  `from typing import Any` when missing;
    //   · "cast"      — wrap the RHS in `cast("<expected>", …)`, adding
    //                  `from typing import cast` when missing.
    // The Annotate / Cast buttons only appear when the payload computation
    // (computeAnnotationFix / computeCastFix, on the diagnostic's line +
    // the file content the panel fetched after the run) found a safe
    // insertion point — otherwise the fix is simply not offered.
    const handleQuickFix = async (
        diag: Diagnostic,
        tool: "lint" | "typecheck",
        fixKind: TypeFixKind = "ignore"
    ) => {
        const d = diag as { line: number; col: number; message: string };
        const key =
            fixKind === "ignore"
                ? `${tool}-${d.line}-${d.col}`
                : `${tool}-${d.line}-${d.col}-${fixKind}`;
        setFixingKey(key);
        try {
            if (tool === "lint") {
                const settings = loadSettings();
                const res = await fetch("/api/format", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        file: fileSlug,
                        // `content: undefined` selects disk mode — the route formats
                        // the file in place rather than running black on a string.
                        content: undefined,
                        interpreter: settings.pythonInterpreter || undefined,
                        // the live Formatting options ride along so the
                        // quick-fix write honors quotes / blank lines / endings.
                        settings: formatRequestSettings(settings),
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    setState({
                        status: "error",
                        message: data.error ?? `HTTP ${res.status}`,
                    });
                    return;
                }
                await runTool("lint");
            } else {
                // 1. Read the current file content.
                const codeRes = await fetch(
                    `/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                );
                const codeData = await codeRes.json().catch(() => ({}));
                if (!codeRes.ok || typeof codeData.content !== "string") {
                    setState({
                        status: "error",
                        message: codeData.error ?? `HTTP ${codeRes.status}`,
                    });
                    return;
                }
                // 2. Compute the modified content for the requested fix kind.
                //    Computed from the FRESH content (state.fileContent may lag
                //    behind the editor); a failed computation degrades to a
                //    toast instead of a half-applied edit.
                let modified: string;
                if (fixKind === "annotate" || fixKind === "cast") {
                    const computed =
                        fixKind === "annotate"
                            ? computeAnnotationFix(d, codeData.content)
                            : computeCastFix(d, codeData.content);
                    if (typeof computed !== "string") {
                        toast({
                            title: "Quick fix not applicable",
                            description:
                                "No safe insertion point could be computed for this diagnostic.",
                            variant: "warning",
                        });
                        return;
                    }
                    modified = computed;
                } else {
                    // 2'. Insert `  # type: ignore` at the end of the diagnostic
                    //    line. Guard against double-adding if the line already
                    //    has it.
                    const lines = codeData.content.split("\n");
                    const idx = Math.max(0, Math.min(lines.length - 1, d.line - 1));
                    const existing = lines[idx];
                    if (!/#\s*type:\s*ignore\b/.test(existing)) {
                        lines[idx] = `${existing.replace(/\s+$/, "")}  # type: ignore`;
                    }
                    modified = lines.join("\n");
                }
                // 3. Save via /api/import-py. NOTE: this route takes `fileName`
                //    (the human-readable file name), not the slug. ONE POST =
                //    one local-history snapshot = exactly one undo step, the
                //    same integration the ignore fix has always used.
                const saveRes = await fetch("/api/import-py", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        fileName,
                        content: modified,
                    }),
                });
                const saveData = await saveRes.json().catch(() => ({}));
                if (!saveRes.ok || !saveData.ok) {
                    setState({
                        status: "error",
                        message: saveData.error ?? `HTTP ${saveRes.status}`,
                    });
                    return;
                }
                // 4. Re-run typecheck to refresh the diagnostics list — the
                //    run re-fetches the file content, so the Annotate / Cast
                //    availability recomputes for the edited source too.
                await runTool("typecheck");
            }
        } catch (err) {
            setState({status: "error", message: (err as Error).message});
        } finally {
            setFixingKey(null);
        }
    };

    // ── Feature: "Fix all" button ───────────────────────────────────────
    //
    // Runs `ruff check --fix --unsafe-fixes` on the current file via
    // /api/fix-all, then refreshes the lint diagnostics by re-running the
    // lint tool (same mechanism as the per-diagnostic quick-fix). Falls
    // back gracefully when ruff isn't installed — the API returns
    // `{ ok: false, error: "ruff not installed" }` and we surface a
    // helpful toast instead of an HTTP error.
    const handleFixAll = async () => {
        setFixingAll(true);
        setActiveTool("lint");
        setState({status: "running"});
        try {
            const settings = loadSettings();
            const res = await fetch("/api/fix-all", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    interpreter: settings.pythonInterpreter || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                const errMsg = data.error ?? `HTTP ${res.status}`;
                const desc =
                    errMsg === "ruff not installed"
                        ? "Install ruff (`pip install ruff`) to use Fix all."
                        : errMsg;
                setState({status: "error", message: errMsg});
                toast({
                    title: "Fix all failed",
                    description: desc,
                    variant: "destructive",
                });
                return;
            }
            const fixed: number = data.fixed ?? 0;
            const remaining: number = data.remaining?.length ?? 0;
            if (fixed > 0) {
                toast({
                    title: `Fixed ${fixed} ${fixed === 1 ? "issue" : "issues"}`,
                    variant: "success",
                    description:
                        remaining > 0
                            ? `${remaining} remaining.`
                            : "No remaining issues.",
                });
            } else {
                toast({
                    title: "No auto-fixable issues",
                    variant: "warning",
                    description:
                        remaining > 0
                            ? `${remaining} issues can't be auto-fixed by ruff.`
                            : "File is already clean.",
                });
            }
            // Refresh the diagnostics list using the existing lint mechanism.
            await runTool("lint");
        } catch (err) {
            const msg = (err as Error).message;
            setState({status: "error", message: msg});
            toast({
                title: "Fix all failed",
                description: msg,
                variant: "destructive",
            });
        } finally {
            setFixingAll(false);
        }
    };

    /** Toggle a severity filter chip; never lets all three go off (would
     *  leave an empty list with no way back through the chips). */
    const toggleSeverityFilter = React.useCallback((s: Severity) => {
        setSeverityFilters((prev) => {
            const next = {...prev, [s]: !prev[s]};
            const anyOn = next.error || next.warning || next.info;
            return anyOn ? next : prev;
        });
    }, []);

    // ── Debug session — pdb with REAL step control ──────
    //
    // POST /api/debug starts the SSE session: `stdout`/`stderr` append
    // to the output pane; a `stopped` event means pdb is PAUSED at a
    // breakpoint (line + frame + locals shown in the variables pane) and
    // the route WAITS. Step commands then POST { sessionId, command } —
    // continue | next | step | return | quit — and the stream resumes
    // until the next `stopped` or `end`. The editor gutter breakpoints
    // feed the run through the `praxis:breakpoints-changed` listener
    // below (zero page wiring), and every stop broadcasts
    // `praxis:debug-stopped-line` so the code viewer paints the
    // stopped-line highlight.
    //
    // Every `stopped` event ALSO carries (all optional, so older routes
    // and flows keep working): `stack` (bottom-up frames — rendered as
    // the clickable call-stack list; clicking a frame POSTs
    // { sessionId, frame } and the route drives pdb `up`/`down`),
    // `currentFrame` (the selected frame's index) and `watches` (the
    // watch expressions' values in that frame). Frame switches emit a
    // `frame` event with the same refreshed payload — unknown event
    // types are ignored by pre-existing clients by design.
    const runDebug = async () => {
        // Cancel any existing session before starting a new one.
        debugAbortRef.current?.abort();
        const controller = new AbortController();
        debugAbortRef.current = controller;

        setActiveTool("debug");
        setDebug((d) => ({
            ...d,
            running: true,
            paused: false,
            sessionId: null,
            stoppedLine: null,
            stoppedFrame: null,
            variables: "",
            output: "",
            exitCode: null,
            error: undefined,
            stack: null,
            currentFrame: null,
            watchValues: null,
        }));

        try {
            const settings = loadSettings();
            const res = await fetch("/api/debug", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    breakpoints: debug.breakpoints,
                    stdin: debugStdin || undefined,
                    interpreter: settings.pythonInterpreter || undefined,
                    // Watch expressions persist for the session — a fresh run
                    // carries them so the FIRST stop already evaluates them.
                    ...(watchExprs.length > 0 ? {watch: watchExprs} : {}),
                }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                const text = await res.text().catch(() => "");
                setDebug((d) => ({
                    ...d,
                    running: false,
                    error: text || `HTTP ${res.status}`,
                }));
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const flushEvent = (raw: string) => {
                if (!raw.startsWith("data: ")) return;
                let evt: { type: string; [k: string]: unknown };
                try {
                    evt = JSON.parse(raw.slice(6));
                } catch {
                    return; // ignore malformed lines
                }
                switch (evt.type) {
                    case "start":
                        setDebug((d) => ({
                            ...d,
                            interpreter: evt.interpreter as string | undefined,
                            // The session id step commands POST against. A missing id
                            // (older route build) simply leaves the buttons inert —
                            // the stream itself still works.
                            sessionId:
                                typeof evt.sessionId === "string" ? evt.sessionId : null,
                        }));
                        break;
                    case "stdout":
                    case "stderr":
                        setDebug((d) => ({
                            ...d,
                            output: d.output + (evt.text as string),
                        }));
                        break;
                    case "stopped": {
                        // THE STOP — pdb is paused and waiting for a step command.
                        const line = typeof evt.line === "number" ? evt.line : null;
                        const frame = typeof evt.frame === "string" ? evt.frame : null;
                        const stack = normalizeDebugStack(evt.stack);
                        const currentFrame =
                            typeof evt.currentFrame === "number" ? evt.currentFrame : null;
                        const watchValues = normalizeDebugWatches(evt.watches);
                        setDebug((d) => ({
                            ...d,
                            paused: true,
                            stoppedLine: line,
                            stoppedFrame: frame,
                            variables: (evt.locals as string) ?? "",
                            // Optional additions — missing fields keep whatever a
                            // previous stop delivered (older routes never set them).
                            stack: stack ?? d.stack,
                            currentFrame: currentFrame ?? (stack ? stack.length - 1 : d.currentFrame),
                            watchValues: watchValues ?? d.watchValues,
                            output:
                                d.output +
                                `\n[statcomp] stopped at line ${line}${frame ? ` in ${frame}()` : ""}]\n`,
                        }));
                        // Tell the code viewer (any mounted CodeViewer for THIS
                        // file) to paint the stopped-line highlight. page.tsx needs
                        // zero wiring — the viewer listens for this event itself,
                        // and the lead can ALSO pass the explicit
                        // `debugStoppedLine` prop for the same effect.
                        window.dispatchEvent(
                            new CustomEvent("praxis:debug-stopped-line", {
                                detail: {line, frame, folderSlug, fileSlug},
                            })
                        );
                        break;
                    }
                    case "frame": {
                        // A stack-frame selection landed (the debug area's call
                        // stack list). Same payload shape as `stopped`, but for
                        // the newly selected frame — refresh locals/watches/stack
                        // WITHOUT treating it as a new stop (still paused).
                        const line = typeof evt.line === "number" ? evt.line : null;
                        const frame = typeof evt.frame === "string" ? evt.frame : null;
                        const stack = normalizeDebugStack(evt.stack);
                        const currentFrame =
                            typeof evt.currentFrame === "number" ? evt.currentFrame : null;
                        const watchValues = normalizeDebugWatches(evt.watches);
                        const file = typeof evt.file === "string" ? evt.file : "";
                        // Only paint the highlight when the selected frame is in
                        // the debugged file — a stdlib/<string> frame would point
                        // the highlight at an unrelated line, so clear it instead.
                        const inCurrentFile = !file || file === fileName;
                        setDebug((d) => ({
                            ...d,
                            paused: true,
                            stoppedLine: line,
                            stoppedFrame: frame,
                            variables: (evt.locals as string) ?? d.variables,
                            stack: stack ?? d.stack,
                            currentFrame: currentFrame ?? d.currentFrame,
                            watchValues: watchValues ?? d.watchValues,
                            output:
                                d.output +
                                `\n[statcomp] switched to frame ${currentFrame ?? "?"}${frame ? ` (${frame}())` : ""}\n`,
                        }));
                        window.dispatchEvent(
                            new CustomEvent("praxis:debug-stopped-line", {
                                detail: {
                                    line: inCurrentFile ? line : null,
                                    frame,
                                    folderSlug,
                                    fileSlug,
                                },
                            })
                        );
                        break;
                    }
                    case "resumed":
                        // A step command landed — the debugger is executing again.
                        setDebug((d) => ({...d, paused: false}));
                        window.dispatchEvent(
                            new CustomEvent("praxis:debug-stopped-line", {
                                detail: {line: null, folderSlug, fileSlug},
                            })
                        );
                        break;
                    case "error":
                        setDebug((d) => ({...d, error: evt.message as string}));
                        break;
                    case "timeout":
                        setDebug((d) => ({...d, error: evt.message as string}));
                        break;
                    case "end":
                        setDebug((d) => ({
                            ...d,
                            running: false,
                            paused: false,
                            exitCode: (evt.exitCode as number) ?? null,
                        }));
                        window.dispatchEvent(
                            new CustomEvent("praxis:debug-stopped-line", {
                                detail: {line: null, folderSlug, fileSlug},
                            })
                        );
                        break;
                }
            };

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                // SSE messages are separated by a blank line (\n\n).
                let sep: number;
                while ((sep = buffer.indexOf("\n\n")) >= 0) {
                    const raw = buffer.slice(0, sep).trim();
                    buffer = buffer.slice(sep + 2);
                    if (raw) flushEvent(raw);
                }
            }
            // Stream closed — make sure running reflects that.
            setDebug((d) => ({...d, running: false, paused: false}));
        } catch (err) {
            // Aborts are expected when the user clicks Stop or switches scripts.
            if ((err as Error).name === "AbortError") return;
            setDebug((d) => ({
                ...d,
                running: false,
                paused: false,
                error: (err as Error).message,
            }));
        }
    };

    /** Send a pdb step command (continue | next | step | return | quit) to
     *  the PAUSED session. The route only accepts commands while stopped;
     *  a 409 (mid-run) or 404 (gone) surfaces as a toast so a double-click
     *  can never look like a silent no-op. */
    const sendDebugCommand = async (command: "continue" | "next" | "step" | "return" | "quit") => {
        const sid = debug.sessionId;
        if (!sid || !debug.running) return;
        try {
            const res = await fetch("/api/debug", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({sessionId: sid, command}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast({
                    title: "Debugger command not applied",
                    description: (data as { error?: string }).error ?? `HTTP ${res.status}`,
                    variant: "warning",
                });
                // A 404 means the session is gone (timed out / ended) — sync the
                // UI instead of leaving zombie "paused" buttons.
                if (res.status === 404) {
                    setDebug((d) => ({...d, paused: false}));
                }
            }
        } catch (err) {
            setDebug((d) => ({...d, error: (err as Error).message}));
        }
    };

    // ── Watch expressions + call-stack frame selection ───────────────
    // Both ride the SAME /api/debug command POST as the step controls —
    // just different body shapes ({ sessionId, watch: [...] } and
    // { sessionId, frame: <index> }). The watch list lives in component
    // state for the whole debug session; the values arrive on every
    // `stopped`/`frame` event AND — for adds made while paused — in the
    // watch POST's own JSON response (evaluated in the current frame).

    /** Add a watch expression: optimistic row first, then the POST (its
     *  response paints values when the session is paused right now). */
    const addWatch = async (raw: string) => {
        const clean = raw.trim();
        if (!clean || clean.length > 200) return;
        const next = watchExprs.includes(clean)
            ? watchExprs
            : [...watchExprs, clean].slice(-32);
        if (next !== watchExprs) setWatchExprs(next);
        setDebug((d) => ({
            ...d,
            watchValues: [
                ...(d.watchValues ?? []).filter((w) => w.expression !== clean),
                {expression: clean},
            ],
        }));
        const sid = debug.sessionId;
        if (!sid || !debug.running) return; // values arrive at the next stop
        try {
            const res = await fetch("/api/debug", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({sessionId: sid, watch: next}),
            });
            if (!res.ok) return; // non-fatal — the next stop re-evaluates
            const data = await res.json().catch(() => ({}));
            const values = normalizeDebugWatches(
                (data as { values?: unknown }).values
            );
            if (values) setDebug((d) => ({...d, watchValues: values}));
        } catch {
            // Offline — the expressions still apply from the next stop.
        }
    };

    /** Remove a watch expression and push the trimmed list to the route. */
    const removeWatch = (expr: string) => {
        const next = watchExprs.filter((w) => w !== expr);
        setWatchExprs(next);
        setDebug((d) => ({
            ...d,
            watchValues: (d.watchValues ?? []).filter((w) => w.expression !== expr),
        }));
        const sid = debug.sessionId;
        if (sid && debug.running) {
            void fetch("/api/debug", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({sessionId: sid, watch: next}),
            }).catch(() => {
                // Offline — the list applies from the next stop anyway.
            });
        }
    };

    /** Select a call-stack frame (bottom-up index). The route sends pdb
     *  `up`/`down` for the delta and re-emits a `frame` event carrying the
     *  refreshed stack + locals + watches — the client needs no follow-up
     *  work on success. Errors surface as a toast, like the step commands. */
    const selectFrame = async (target: number) => {
        const sid = debug.sessionId;
        if (!sid || !debug.running || !debug.paused || !debug.stack) return;
        if (debug.currentFrame === target) return; // already selected
        try {
            const res = await fetch("/api/debug", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({sessionId: sid, frame: target}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast({
                    title: "Frame switch not applied",
                    description:
                        (data as { error?: string }).error ?? `HTTP ${res.status}`,
                    variant: "warning",
                });
            }
        } catch (err) {
            setDebug((d) => ({...d, error: (err as Error).message}));
        }
    };

    // ── Editor-gutter breakpoints feed the debug runs (zero wiring) ──
    // The code viewer's gutter-click breakpoints dispatch
    // `praxis:breakpoints-changed` (with the file identity); when it's for
    // THIS file, adopt the list. On mount we also REQUEST the current set
    // (`praxis:breakpoints-request`) so gutter breakpoints set before the
    // panel mounted (or set in another tab of the same file) are picked
    // up the moment the panel appears.
    React.useEffect(() => {
        const onBreakpointsChanged = (e: Event) => {
            const d = (e as CustomEvent).detail as
                | { folderSlug?: string; fileSlug?: string; breakpoints?: number[] }
                | undefined;
            if (!d || !Array.isArray(d.breakpoints)) return;
            if (d.folderSlug !== folderSlug || d.fileSlug !== fileSlug) return;
            setDebug((prev) => {
                const next = [...new Set(d.breakpoints)]
                    .filter((n) => Number.isInteger(n) && n > 0)
                    .sort((a, b) => a - b);
                const same =
                    next.length === prev.breakpoints.length &&
                    next.every((n, i) => n === prev.breakpoints[i]);
                return same ? prev : {...prev, breakpoints: next};
            });
        };
        window.addEventListener("praxis:breakpoints-changed", onBreakpointsChanged);
        // Pull once per file identity — the viewer replies with the same
        // breakpoints-changed event the listener above consumes.
        window.dispatchEvent(new CustomEvent("praxis:breakpoints-request"));
        return () =>
            window.removeEventListener("praxis:breakpoints-changed", onBreakpointsChanged);
    }, [folderSlug, fileSlug]);

    // ── "Debug With Pdb" — the Run menu / navbar item. The page now
    // opens the panel + switches to this tab AND queues a durable
    // request (lib/pending-console-run): select the Debug tool and
    // start the session. Works whether the panel was already mounted
    // (event) or JUST mounted because of the click (mount-time drain) —
    // the old flow only flipped the bottom tab, so the first click
    // showed an empty panel on the default (lint) tool.
    React.useEffect(() => {
        const startDebug = () => {
            takePendingDebugRun();
            if (debug.running) return;
            setActiveTool("debug");
            void runDebug();
        };
        window.addEventListener("praxis:debug-run", startDebug);
        return () => window.removeEventListener("praxis:debug-run", startDebug);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debug.running]);
    React.useEffect(() => {
        if (!takePendingDebugRun()) return;
        if (debug.running) return;
        setActiveTool("debug");
        void runDebug();
        // Mount-time drain only — the listener effect above covers the
        // already-mounted lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className="rounded-xl border bg-card/40 backdrop-blur-sm shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Stethoscope className="size-4 shrink-0 text-emerald-500"/>
                    <div className="min-w-0 text-left">
                        <p className="text-sm font-medium truncate">Diagnostics &amp; tools</p>
                        <p className="text-xs text-muted-foreground truncate">
                            Lint · Format · Types · Profile · Test · Audit · Debug · {fileName}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {state.status === "running" && (
                        <Loader2 className="size-3.5 animate-spin text-cyan-500"/>
                    )}
                    {state.status === "done" && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-[10px] gap-1",
                                state.ok
                                    ? "border-emerald-500/40 text-emerald-600"
                                    : "border-red-500/40 text-red-600"
                            )}
                        >
                            {state.ok ? <CircleCheck className="size-3"/> : <CircleX className="size-3"/>}
                            {state.ok ? "clean" : "issues"}
                        </Badge>
                    )}
                </div>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.2}}
                        className="overflow-hidden"
                    >
                        <div className="border-t px-4 py-3">
                            <Tabs
                                value={activeTool}
                                onValueChange={(v) => {
                                    setActiveTool(v as ToolName);
                                    // Switching tabs clears any stale result from a previous
                                    // tab so we don't fall through to the format-result
                                    // catch-all and show, e.g., a green CircleCheck + the
                                    // lint hint under the typecheck tab.
                                    setState({status: "idle"});
                                }}
                            >
                                <div className="flex items-center gap-2 flex-wrap mb-3">
                                    <TabsList>
                                        <TabsTrigger value="lint" className="text-xs gap-1">
                                            <CircleAlert className="size-3"/> Lint
                                        </TabsTrigger>
                                        <TabsTrigger value="typecheck" className="text-xs gap-1">
                                            <Stethoscope className="size-3"/> Types
                                        </TabsTrigger>
                                        <TabsTrigger value="profile" className="text-xs gap-1">
                                            <Play className="size-3"/> Profile
                                        </TabsTrigger>
                                        <TabsTrigger value="test" className="text-xs gap-1">
                                            <CircleCheck className="size-3"/> Tests
                                        </TabsTrigger>
                                        <TabsTrigger value="format" className="text-xs gap-1">
                                            <Play className="size-3"/> Format
                                        </TabsTrigger>
                                        <TabsTrigger value="audit" className="text-xs gap-1">
                                            <ShieldCheck className="size-3"/> Audit
                                        </TabsTrigger>
                                        <TabsTrigger value="debug" className="text-xs gap-1">
                                            <Bug className="size-3"/> Debug
                                        </TabsTrigger>
                                    </TabsList>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => runTool(activeTool)}
                                        disabled={state.status === "running" || debug.running || fixingAll}
                                        className="h-7 gap-1.5 text-xs"
                                    >
                                        {state.status === "running" ? (
                                            <Loader2 className="size-3 animate-spin"/>
                                        ) : (
                                            <Play className="size-3"/>
                                        )}
                                        Run {activeTool}
                                    </Button>
                                    {/* "Fix all" — runs `ruff check --fix --unsafe-fixes` on the
current file via /api/fix-all, then refreshes the lint
diagnostics. Auto-switches to the Lint tab so the user
sees the refreshed list immediately. */}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleFixAll}
                                        disabled={fixingAll || state.status === "running" || debug.running}
                                        title="Run ruff --fix on the current file and refresh diagnostics"
                                        className="h-7 gap-1.5 text-xs"
                                    >
                                        {fixingAll ? (
                                            <Loader2 className="size-3 animate-spin"/>
                                        ) : (
                                            <Wand2 className="size-3"/>
                                        )}
                                        Fix all
                                    </Button>
                                    {/* AI REVIEW of every diagnostic at
once — deterministic quick-fixes can't cover
type errors or logic smells; this sends the whole
grouped list to the chat in ONE prompt. */}
                                    {onAiFixAll && state.status === "done" && (() => {
                                        const diags: Array<{
                                            line: number;
                                            col?: number;
                                            message: string;
                                            tool: string
                                        }> = [];
                                        const toolLabel = state.diagnostics?.length
                                            ? (state.linter ?? "lint")
                                            : state.typeDiagnostics?.length
                                                ? "typecheck"
                                                : "";
                                        for (const d of state.diagnostics ?? []) {
                                            diags.push({
                                                line: d.line,
                                                col: d.col,
                                                message: `[${d.code}] ${d.message}`,
                                                tool: toolLabel || "lint"
                                            });
                                        }
                                        for (const d of state.typeDiagnostics ?? []) {
                                            diags.push({
                                                line: d.line,
                                                col: d.col,
                                                message: `[${d.severity}] ${d.message}`,
                                                tool: "typecheck"
                                            });
                                        }
                                        if (diags.length === 0) return null;
                                        return (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onAiFixAll(diags)}
                                                title={`Send ALL ${diags.length} ${toolLabel || "diagnostics"} to the AI chat as one grouped review (one answer, one diff to apply)`}
                                                className="h-7 gap-1.5 text-xs"
                                            >
                                                <Sparkles className="size-3"/>
                                                AI review all ({diags.length})
                                            </Button>
                                        );
                                    })()}
                                    {/* Bug button — quick-start a pdb debug
                      session regardless of which tab is active. */}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setActiveTool("debug");
                                            void runDebug();
                                        }}
                                        disabled={debug.running}
                                        title="Start a pdb debug session"
                                        className="h-7 gap-1.5 text-xs"
                                    >
                                        {debug.running ? (
                                            <Loader2 className="size-3 animate-spin"/>
                                        ) : (
                                            <Bug className="size-3"/>
                                        )}
                                        Debug
                                    </Button>
                                    {state.status !== "idle" && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setState({status: "idle"})}
                                            className="h-7 gap-1.5 text-xs"
                                        >
                                            <Trash2 className="size-3"/>
                                            Clear
                                        </Button>
                                    )}
                                </div>

                                <TabsContent value="lint" className="mt-0">
                                    <ToolResult
                                        state={state}
                                        kind="lint"
                                        onQuickFix={handleQuickFix}
                                        onAiFix={onAiFix}
                                        fixingKey={fixingKey}
                                        severityFilters={severityFilters}
                                        onToggleFilter={toggleSeverityFilter}
                                        fileContext={{folderSlug, fileSlug, fileName}}
                                        onSelectIssue={onSelectIssue}
                                    />
                                </TabsContent>
                                <TabsContent value="typecheck" className="mt-0">
                                    <ToolResult
                                        state={state}
                                        kind="typecheck"
                                        onQuickFix={handleQuickFix}
                                        onAiFix={onAiFix}
                                        fixingKey={fixingKey}
                                        severityFilters={severityFilters}
                                        onToggleFilter={toggleSeverityFilter}
                                        fileContext={{folderSlug, fileSlug, fileName}}
                                        onSelectIssue={onSelectIssue}
                                    />
                                </TabsContent>
                                <TabsContent value="profile" className="mt-0">
                                    <ToolResult state={state} kind="profile"/>
                                </TabsContent>
                                <TabsContent value="test" className="mt-0">
                                    <ToolResult state={state} kind="test"/>
                                </TabsContent>
                                <TabsContent value="format" className="mt-0">
                                    <ToolResult state={state} kind="format"/>
                                </TabsContent>
                                <TabsContent value="audit" className="mt-0">
                                    <ToolResult state={state} kind="audit"/>
                                </TabsContent>
                                <TabsContent value="debug" className="mt-0">
                                    <DebugPanel
                                        debug={debug}
                                        fileName={fileName}
                                        stdin={debugStdin}
                                        onStdinChange={setDebugStdin}
                                        onAddBreakpoint={(line) =>
                                            setDebug((d) =>
                                                d.breakpoints.includes(line)
                                                    ? d
                                                    : {
                                                        ...d,
                                                        breakpoints: [...d.breakpoints, line].sort(
                                                            (a, b) => a - b
                                                        ),
                                                    }
                                            )
                                        }
                                        onRemoveBreakpoint={(line) =>
                                            setDebug((d) => ({
                                                ...d,
                                                breakpoints: d.breakpoints.filter((l) => l !== line),
                                            }))
                                        }
                                        onRun={runDebug}
                                        onStop={stopDebug}
                                        onCommand={sendDebugCommand}
                                        onSelectFrame={selectFrame}
                                        watchExprs={watchExprs}
                                        onAddWatch={addWatch}
                                        onRemoveWatch={removeWatch}
                                    />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ToolResult({
                        state,
                        kind,
                        onQuickFix,
                        onAiFix,
                        fixingKey,
                        severityFilters,
                        onToggleFilter,
                        fileContext,
                        onSelectIssue,
                    }: {
    state: ToolState;
    kind: Exclude<ToolName, "debug">;
    onQuickFix?: (
        diag: Diagnostic,
        tool: "lint" | "typecheck",
        fixKind?: TypeFixKind
    ) => void;
    /** per-row "Fix with AI" — routes the diagnostic plus a
     * context snippet to the integrated AI chat sidebar. */
    onAiFix?: (diag: { line: number; col?: number; message: string; tool: string }) => void;
    fixingKey?: string | null;
    severityFilters?: SeverityFilterState;
    onToggleFilter?: (s: Severity) => void;
    /** File identity for the row click-to-jump: the app-wide
     *  `praxis:goto-line` event only carries a line, so this context makes
     *  the optional onSelectIssue payload complete. */
    fileContext?: { folderSlug: string; fileSlug: string; fileName: string };
    /** Clicked a problem row → the parent gets the full issue (and the
     *  row ALSO dispatches praxis:goto-line itself, so jumping works with
     *  zero page wiring — page.tsx already listens for that event). */
    onSelectIssue?: (issue: DiagnosticIssue) => void;
}) {
    /** Jump to a diagnostic's line. Nested interactive elements (the
     *  Fix / AI buttons inside a row) call their own handlers — their
     *  click events are filtered out here by the closest("button") test
     *  so a Fix click never ALSO jumps. */
    const jumpToIssue = (d: { line: number; col?: number; message: string }, sev: Severity) => {
        window.dispatchEvent(
            new CustomEvent("praxis:goto-line", {detail: {line: d.line}})
        );
        if (onSelectIssue && fileContext) {
            onSelectIssue({
                folderSlug: fileContext.folderSlug,
                fileSlug: fileContext.fileSlug,
                fileName: fileContext.fileName,
                line: d.line,
                col: d.col,
                message: d.message,
                severity: sev,
            });
        }
    };
    if (state.status === "idle") {
        return (
            <p className="text-xs text-muted-foreground py-4 text-left">
                Click <strong>Run {kind}</strong> to execute.
            </p>
        );
    }
    if (state.status === "running") {
        return (
            // left-aligned (was justify-center) — matches the
            // Output panel's running state; bottom-panel
            // content sits on the left.
            <div className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-cyan-500"/>
                Running {kind}…
            </div>
        );
    }
    if (state.status === "error") {
        return (
            <div className="py-3 text-sm text-red-500 dark:text-red-400 font-mono">
                Error: {state.message}
            </div>
        );
    }

    // ── Lint ──────────────────────────────────────────────────────────
    if (kind === "lint" && state.diagnostics) {
        if (state.diagnostics.length === 0) {
            return (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 py-3 flex items-center gap-2">
                    <CircleCheck className="size-4"/>
                    No lint issues found. {state.hint && <span className="text-muted-foreground">({state.hint})</span>}
                </p>
            );
        }
        // ruff auto-fixes most E/F/W/I rules. The Fix button is
        // only shown when the linter is ruff AND the code is in that set.
        const isRuff = state.linter === "ruff";
        // Decorate each diagnostic with a derived severity so the filter
        // chips can hide/show by category. Lint diagnostics don't carry an
        // explicit severity field — see lintSeverity for the mapping.
        const withSeverity = state.diagnostics.map((d) => ({
            d,
            sev: lintSeverity(d.code),
        }));
        const counts = countBySeverity(withSeverity.map((x) => x.sev));
        const visible = severityFilters
            ? withSeverity.filter((x) => severityFilters[x.sev])
            : withSeverity;
        return (
            <div className="space-y-2">
                {severityFilters && onToggleFilter && (
                    <SeverityFilterChips
                        counts={counts}
                        filters={severityFilters}
                        onToggle={onToggleFilter}
                    />
                )}
                {visible.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-left">
                        All diagnostics hidden by filters — toggle a chip to show them.
                    </p>
                ) : (
                    <ul className="divide-y rounded-md border max-h-64 overflow-auto">
                        {visible.map(({d, sev}, i) => {
                            const fixable = isRuff && /^[EFWI]/.test(d.code);
                            const key = `lint-${d.line}-${d.col}`;
                            const fixing = fixingKey === key;
                            return (
                                <li
                                    key={i}
                                    // ── CLICK-TO-JUMP: the whole row opens the file at the
                                    // diagnostic's line. Nested buttons (Fix / AI) are
                                    // excluded via the closest("button") test so their
                                    // clicks keep their own meaning.
                                    onClick={(e) => {
                                        if ((e.target as HTMLElement).closest("button")) return;
                                        jumpToIssue(d, sev);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            jumpToIssue(d, sev);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Jump to line ${d.line}: ${d.message}`}
                                    title={`Jump to line ${d.line} — ${d.code}: ${d.message}`}
                                    className="px-3 py-2 text-xs flex items-start gap-2 group cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/40 transition-colors"
                                >
                                    {sev === "error" ? (
                                        <CircleX className="size-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden/>
                                    ) : sev === "warning" ? (
                                        <CircleAlert className="size-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden/>
                                    ) : (
                                        <CircleAlert className="size-3.5 text-cyan-500 shrink-0 mt-0.5" aria-hidden/>
                                    )}
                                    <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                                        L{d.line}:{d.col}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
                                        {d.code}
                                    </Badge>
                                    <span className="text-foreground/80 flex-1">{d.message}</span>
                                    {onAiFix && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                onAiFix({
                                                    line: d.line,
                                                    col: d.col,
                                                    message: `${d.code}: ${d.message}`,
                                                    tool: `ruff (lint)`,
                                                })
                                            }
                                            title="Fix with AI — sends this diagnostic plus context to the AI chat"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            <Sparkles className="size-3"/>
                                            AI
                                        </Button>
                                    )}
                                    {fixable && onQuickFix && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onQuickFix(d, "lint")}
                                            disabled={fixing}
                                            title="Auto-fix with ruff (runs /api/format)"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            {fixing ? (
                                                <Loader2 className="size-3 animate-spin"/>
                                            ) : (
                                                <Wrench className="size-3"/>
                                            )}
                                            Fix
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }

    // ── Typecheck ─────────────────────────────────────────────────────
    if (kind === "typecheck" && state.typeDiagnostics) {
        if (state.typeDiagnostics.length === 0) {
            return (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 py-3 flex items-center gap-2">
                    <CircleCheck className="size-4"/>
                    No type errors. {state.hint && <span className="text-muted-foreground">({state.hint})</span>}
                </p>
            );
        }
        const withSeverity = state.typeDiagnostics.map((d) => ({
            d,
            sev: typeSeverity(d),
        }));
        const counts = countBySeverity(withSeverity.map((x) => x.sev));
        const visible = severityFilters
            ? withSeverity.filter((x) => severityFilters[x.sev])
            : withSeverity;
        return (
            <div className="space-y-2">
                {severityFilters && onToggleFilter && (
                    <SeverityFilterChips
                        counts={counts}
                        filters={severityFilters}
                        onToggle={onToggleFilter}
                    />
                )}
                {visible.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-left">
                        All diagnostics hidden by filters — toggle a chip to show them.
                    </p>
                ) : (
                    <ul className="divide-y rounded-md border max-h-64 overflow-auto">
                        {visible.map(({d, sev}, i) => {
                            const key = `typecheck-${d.line}-${d.col}`;
                            const fixing = fixingKey === key;
                            // Annotate / Cast availability is computed from the file
                            // content fetched after the run (state.fileContent) —
                            // null means "no safe insertion point" and the buttons
                            // simply don't render.
                            const annotateFix = state.fileContent
                                ? computeAnnotationFix(d, state.fileContent)
                                : null;
                            const castFix = state.fileContent
                                ? computeCastFix(d, state.fileContent)
                                : null;
                            return (
                                <li
                                    key={i}
                                    // ── CLICK-TO-JUMP (same contract as the lint rows):
                                    // the row opens the file at the diagnostic's line via
                                    // praxis:goto-line; the nested Fix / AI buttons keep
                                    // their own clicks.
                                    onClick={(e) => {
                                        if ((e.target as HTMLElement).closest("button")) return;
                                        jumpToIssue(d, typeSeverity(d));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            jumpToIssue(d, typeSeverity(d));
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Jump to line ${d.line}: ${d.message}`}
                                    title={`Jump to line ${d.line} — ${d.severity}: ${d.message}`}
                                    className="px-3 py-2 text-xs flex items-start gap-2 group cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/40 transition-colors"
                                >
                                    {typeSeverity(d) === "error" ? (
                                        <CircleX className="size-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden/>
                                    ) : typeSeverity(d) === "warning" ? (
                                        <CircleAlert className="size-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden/>
                                    ) : (
                                        <CircleAlert className="size-3.5 text-cyan-500 shrink-0 mt-0.5" aria-hidden/>
                                    )}
                                    <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                                        L{d.line}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] shrink-0",
                                            d.severity === "error" && "text-red-600 border-red-500/40",
                                            d.severity === "warning" && "text-amber-600 border-amber-500/40"
                                        )}
                                    >
                                        {d.severity}
                                    </Badge>
                                    <span className="text-foreground/80 flex-1">{d.message}</span>
                                    {onAiFix && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                onAiFix({
                                                    line: d.line,
                                                    col: d.col,
                                                    message: d.message,
                                                    tool: "mypy (typecheck)",
                                                })
                                            }
                                            title="Fix with AI — sends this diagnostic plus context to the AI chat"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            <Sparkles className="size-3"/>
                                            AI
                                        </Button>
                                    )}
                                    {onQuickFix && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onQuickFix(d, "typecheck")}
                                            disabled={fixing || fixingKey === `${key}-annotate` || fixingKey === `${key}-cast`}
                                            title="Insert # type: ignore on this line"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            {fixing ? (
                                                <Loader2 className="size-3 animate-spin"/>
                                            ) : (
                                                <Wrench className="size-3"/>
                                            )}
                                            Fix
                                        </Button>
                                    )}
                                    {onQuickFix && annotateFix !== null && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onQuickFix(d, "typecheck", "annotate")}
                                            disabled={
                                                fixingKey === `${key}-annotate` || fixingKey === key
                                            }
                                            title="Add a type annotation — ': Any' on the assignment target (or '-> Any' on the enclosing function) with the typing import"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            {fixingKey === `${key}-annotate` ? (
                                                <Loader2 className="size-3 animate-spin"/>
                                            ) : (
                                                <Type className="size-3"/>
                                            )}
                                            Annotate
                                        </Button>
                                    )}
                                    {onQuickFix && castFix !== null && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onQuickFix(d, "typecheck", "cast")}
                                            disabled={fixingKey === `${key}-cast` || fixingKey === key}
                                            title="Wrap the right-hand side in cast(expected, …) with the typing import"
                                            className="h-5 px-1.5 text-[10px] gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                        >
                                            {fixingKey === `${key}-cast` ? (
                                                <Loader2 className="size-3 animate-spin"/>
                                            ) : (
                                                <Braces className="size-3"/>
                                            )}
                                            Cast
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }

    // ── Audit ──────────────────────────────────────────────────────────
    if (kind === "audit") {
        const vulns = state.vulnerabilities ?? [];
        // pip-audit not installed → the API returns ok:false, empty list, and
        // a hint. Show the hint in amber so the user knows how to enable it.
        if (state.hint && !state.ok && vulns.length === 0) {
            return (
                <p className="text-xs text-amber-600 dark:text-amber-400 py-3 flex items-start gap-2">
                    <CircleAlert className="size-4 shrink-0 mt-0.5"/>
                    <span className="whitespace-pre-wrap">{state.hint}</span>
                </p>
            );
        }
        if (vulns.length === 0) {
            return (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 py-3 flex items-center gap-2">
                    <CircleCheck className="size-4"/>
                    No known vulnerabilities.
                </p>
            );
        }
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                    <Badge variant="destructive">{vulns.length} vulnerabilities</Badge>
                </div>
                <ul className="divide-y rounded-md border max-h-64 overflow-auto">
                    {vulns.map((v, i) => {
                        // No fix version → amber "warning" (the maintainer hasn't
                        // shipped a patch). Otherwise red.
                        const isWarning = !v.fixVersion;
                        return (
                            <li
                                key={i}
                                className={cn(
                                    "px-3 py-2 text-xs space-y-1",
                                    isWarning
                                        ? "text-amber-700 dark:text-amber-300"
                                        : "text-red-700 dark:text-red-300"
                                )}
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-mono shrink-0",
                                            isWarning
                                                ? "text-amber-700 border-amber-500/40 dark:text-amber-300"
                                                : "text-red-700 border-red-500/40 dark:text-red-300"
                                        )}
                                    >
                                        {v.id || "UNKNOWN"}
                                    </Badge>
                                    <span className="font-mono font-semibold">{v.name}</span>
                                    <span className="text-muted-foreground">
                    {v.version}
                                        {v.fixVersion && (
                                            <>
                                                {" → fix: "}
                                                <span className="font-mono">{v.fixVersion}</span>
                                            </>
                                        )}
                  </span>
                                </div>
                                {v.description && (
                                    <p className="text-foreground/70 dark:text-foreground/60 leading-snug">
                                        {v.description}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    // ── Profile ───────────────────────────────────────────────────────
    if (kind === "profile" && state.profileLines) {
        if (state.profileLines.length === 0) {
            return <p className="text-xs text-muted-foreground py-3">No profile data.</p>;
        }
        // The table + flame-graph pair lives in its own subcomponent so
        // the view toggle state stays local to the Profile tab.
        return <ProfileResult rows={state.profileLines} pstatsUrl={state.pstatsUrl}/>;
    }

    // ── Test ──────────────────────────────────────────────────────────
    if (kind === "test" && state.tests) {
        if (state.tests.length === 0) {
            return (
                <p className="text-xs text-muted-foreground py-3 flex items-center gap-2">
                    No tests found. {state.hint && <span className="text-muted-foreground">({state.hint})</span>}
                </p>
            );
        }
        const passed = state.tests.filter((t) => t.status === "passed").length;
        const failed = state.tests.filter((t) => t.status === "failed").length;
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{state.tests.length} total</Badge>
                    <Badge className="bg-emerald-500/15 text-emerald-600">{passed} passed</Badge>
                    {failed > 0 && (
                        <Badge variant="destructive">{failed} failed</Badge>
                    )}
                </div>
                <ul className="divide-y rounded-md border max-h-64 overflow-auto">
                    {state.tests.map((t, i) => (
                        <li key={i} className="px-3 py-2 text-xs flex items-start gap-2">
                            {t.status === "passed" ? (
                                <CircleCheck className="size-3.5 text-emerald-500 shrink-0 mt-0.5"/>
                            ) : t.status === "failed" ? (
                                <CircleX className="size-3.5 text-red-500 shrink-0 mt-0.5"/>
                            ) : (
                                <CircleAlert className="size-3.5 text-amber-500 shrink-0 mt-0.5"/>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="font-mono truncate">{t.name}</p>
                                {t.message && (
                                    <pre
                                        className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                    {t.message.slice(0, 500)}
                  </pre>
                                )}
                            </div>
                            {t.durationMs !== undefined && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                  {(t.durationMs / 1000).toFixed(2)}s
                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    // Format result
    return (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 py-3 flex items-center gap-2">
            <CircleCheck className="size-4"/>
            {state.hint ?? "Done."}
        </p>
    );
}

// ── Profile result ────────────────────────────────────────────────────
//
// The cProfile output rendered TWO ways over the same rows: the classic
// pstats table, and a canvas flame graph (frame widths ∝ cumulative
// time; hover for name/file:line/cum/self/calls/%; click a frame to
// zoom; breadcrumb + Reset to zoom out). The view toggle is local state
// so switching views never re-runs the tool — and the rows stay live
// for the parent's onProfileResult heatmap feed either way.
//
// The FlameGraph also accepts a real call tree via its `tree` prop for
// when /api/profile grows one; today it derives a pseudo tree from the
// flat rows (see src/lib/flame-graph-data.ts for the derivation).

interface ProfileResultProps {
    rows: ProfileLine[];
    pstatsUrl?: string;
}

function ProfileResult({rows, pstatsUrl}: ProfileResultProps) {
    const [view, setView] = React.useState<"table" | "flame">("table");
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <Button
                    size="sm"
                    variant={view === "table" ? "secondary" : "ghost"}
                    onClick={() => setView("table")}
                    aria-pressed={view === "table"}
                    className="h-6 px-2 text-xs gap-1"
                >
                    <Table2 className="size-3"/> Table
                </Button>
                <Button
                    size="sm"
                    variant={view === "flame" ? "secondary" : "ghost"}
                    onClick={() => setView("flame")}
                    aria-pressed={view === "flame"}
                    className="h-6 px-2 text-xs gap-1"
                >
                    <Flame className="size-3"/> Flame graph
                </Button>
                <span className="text-[10px] text-muted-foreground">
          {rows.length} functions profiled
        </span>
            </div>

            {view === "table" ? (
                <div className="rounded-md border max-h-64 overflow-auto">
                    <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/40 sticky top-0">
                        <tr>
                            <th className="text-left px-2 py-1">ncalls</th>
                            <th className="text-right px-2 py-1">tottime</th>
                            <th className="text-right px-2 py-1">cumtime</th>
                            <th className="text-left px-2 py-1">function</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((l, i) => (
                            <tr key={i} className="border-t">
                                <td className="px-2 py-1">{l.ncalls}</td>
                                <td className="px-2 py-1 text-right">{l.tottime.toFixed(4)}</td>
                                <td className="px-2 py-1 text-right">{l.cumtime.toFixed(4)}</td>
                                <td className="px-2 py-1 truncate max-w-md">{l.location}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <FlameGraph rows={rows} height={230}/>
            )}

            {pstatsUrl && (
                <a
                    href={pstatsUrl}
                    download
                    className="text-xs text-cyan-600 hover:underline inline-block"
                >
                    Download .pstats
                </a>
            )}
        </div>
    );
}

// ── Severity filter chips ──────────────────────────────────────────────
//
// Three chips at the top of the lint/typecheck lists. Each chip shows the
// severity label and a count badge; clicking toggles whether that severity
// is shown. Off chips are dimmed. The parent (DiagnosticsPanel) guards
// against turning all three off at once.

/** Tally severities into the {error, warning, info} shape the chips need. */
function countBySeverity(sevs: Severity[]): SeverityCounts {
    const counts: SeverityCounts = {error: 0, warning: 0, info: 0};
    for (const s of sevs) counts[s] = (counts[s] ?? 0) + 1;
    return counts;
}

const SEVERITY_CHIP_STYLE: Record<Severity, string> = {
    error: "text-red-600 border-red-500/40 bg-red-500/5",
    warning: "text-amber-600 border-amber-500/40 bg-amber-500/5",
    info: "text-cyan-600 border-cyan-500/40 bg-cyan-500/5",
};

function SeverityFilterChips({
                                 counts,
                                 filters,
                                 onToggle,
                             }: {
    counts: SeverityCounts;
    filters: SeverityFilterState;
    onToggle: (s: Severity) => void;
}) {
    const chips: Array<{ key: Severity; label: string }> = [
        {key: "error", label: "Error"},
        {key: "warning", label: "Warning"},
        {key: "info", label: "Info"},
    ];
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {chips.map(({key, label}) => {
                const active = filters[key];
                const count = counts[key] ?? 0;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onToggle(key)}
                        aria-pressed={active}
                        title={`${active ? "Hide" : "Show"} ${label.toLowerCase()} diagnostics (${count})`}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            active
                                ? SEVERITY_CHIP_STYLE[key]
                                : "bg-transparent text-muted-foreground border-border opacity-60 hover:opacity-100"
                        )}
                    >
                        {label}
                        <span
                            className={cn(
                                "inline-flex items-center justify-center min-w-[1.1rem] h-3.5 px-1 rounded-full text-[9px] font-mono",
                                active
                                    ? "bg-foreground/10 text-foreground"
                                    : "bg-muted text-muted-foreground"
                            )}
                        >
              {count}
            </span>
                    </button>
                );
            })}
        </div>
    );
}

// ── Debug panel ───────────────────────────────────────────
//
// Full pdb cockpit: the breakpoint list (badges + line input, fed by
// the editor gutter's red dots through praxis:breakpoints-changed),
// the STEP CONTROL BAR (Continue / Next / Step / Return / Stop + the
// current file:line indicator — the route PAUSES at every stop and
// these buttons POST { sessionId, command } to advance it), the
// WATCH EXPRESSIONS block (add/remove input + values evaluated at
// every stop), the CALL STACK list (innermost on top; the current
// frame highlighted; clicking a frame POSTs { sessionId, frame } and
// the route drives pdb up/down), stdin for the script's input() calls,
// the locals-at-stop variables pane and the raw pdb output pane.
function DebugPanel({
                        debug,
                        fileName,
                        stdin,
                        onStdinChange,
                        onAddBreakpoint,
                        onRemoveBreakpoint,
                        onRun,
                        onStop,
                        onCommand,
                        onSelectFrame,
                        watchExprs,
                        onAddWatch,
                        onRemoveWatch,
                    }: {
    debug: DebugState;
    /** Debugged file's display name (the file:line indicator). */
    fileName: string;
    stdin: string;
    onStdinChange: (s: string) => void;
    onAddBreakpoint: (line: number) => void;
    onRemoveBreakpoint: (line: number) => void;
    onRun: () => void;
    onStop: () => void;
    /** Advance the paused session: continue | next | step | return | quit. */
    onCommand: (command: "continue" | "next" | "step" | "return" | "quit") => void;
    /** Select a stack frame by its bottom-up index (route drives pdb
     *  up/down; the SSE stream then emits a `frame` event). */
    onSelectFrame: (index: number) => void;
    /** The session's watch expressions (the add/remove source of truth). */
    watchExprs: string[];
    onAddWatch: (expr: string) => void;
    onRemoveWatch: (expr: string) => void;
}) {
    const [bpInput, setBpInput] = React.useState("");
    const [watchInput, setWatchInput] = React.useState("");

    const addBreakpoint = () => {
        const n = parseInt(bpInput, 10);
        if (Number.isFinite(n) && n > 0) {
            onAddBreakpoint(n);
            setBpInput("");
        }
    };

    const addWatch = () => {
        const clean = watchInput.trim();
        if (!clean) return;
        onAddWatch(clean);
        setWatchInput("");
    };

    // Display rows: expression + its latest value/error (values ride the
    // stopped/frame events; a fresh add shows a placeholder until the
    // next evaluation lands).
    const watchRows: DebugWatchValue[] = watchExprs.map((expression) => ({
        expression,
        ...(debug.watchValues?.find((w) => w.expression === expression) ?? {}),
    }));

    return (
        <div className="space-y-3">
            {/* Breakpoints */}
            <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Breakpoints
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    {debug.breakpoints.length === 0 && (
                        <span className="text-[11px] text-muted-foreground italic">
              No breakpoints set — click the gutter left of the line numbers in the editor.
            </span>
                    )}
                    {debug.breakpoints.map((l) => (
                        <Badge
                            key={l}
                            variant="secondary"
                            className="text-[10px] font-mono gap-1 cursor-default"
                        >
                            L{l}
                            <button
                                onClick={() => onRemoveBreakpoint(l)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`Remove breakpoint at line ${l}`}
                            >
                                ×
                            </button>
                        </Badge>
                    ))}
                    <div className="flex items-center gap-1">
                        <Input
                            value={bpInput}
                            onChange={(e) => setBpInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addBreakpoint();
                            }}
                            placeholder="line #"
                            className="h-6 w-20 text-[11px] px-2"
                            type="number"
                            min={1}
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={addBreakpoint}
                            className="h-6 px-2 text-[11px]"
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── pdb step control bar ─────────────────────────────────────
          Continue / Next / Step / Return advance the PAUSED session
          (POST { sessionId, command } — the route holds pdb at every
          stop until one lands); Stop kills the whole session. The
          file:line chip shows exactly where pdb is parked, and the
          buttons disable while the script is mid-run (a command then
          would be rejected by the route with 409 anyway — keeping them
          visually inert prevents pointless clicks). */}
            <div className="flex items-center gap-1 flex-wrap rounded-md border bg-muted/20 px-2 py-1.5">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCommand("continue")}
                    disabled={!debug.paused}
                    title={debug.paused ? "Continue (pdb c) — run to the next breakpoint or program end" : "Continue is active only while the debugger is stopped at a breakpoint"}
                    className="h-6 px-2 text-[11px] gap-1"
                >
                    <Play className="size-3"/>
                    Continue
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCommand("next")}
                    disabled={!debug.paused}
                    title={debug.paused ? "Step over (pdb n) — execute the current line without descending into calls" : "Next is active only while stopped"}
                    className="h-6 px-2 text-[11px] gap-1"
                >
                    <SkipForward className="size-3"/>
                    Next
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCommand("step")}
                    disabled={!debug.paused}
                    title={debug.paused ? "Step into (pdb s) — descend into the next call on the current line" : "Step is active only while stopped"}
                    className="h-6 px-2 text-[11px] gap-1"
                >
                    <CornerDownRight className="size-3"/>
                    Step
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCommand("return")}
                    disabled={!debug.paused}
                    title={debug.paused ? "Step out / finish the current function (pdb r)" : "Return is active only while stopped"}
                    className="h-6 px-2 text-[11px] gap-1"
                >
                    <Undo2 className="size-3"/>
                    Return
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onStop}
                    disabled={!debug.running}
                    title="Stop the session and kill the pdb process"
                    className="h-6 px-2 text-[11px] gap-1 text-red-600 hover:text-red-500"
                >
                    <Square className="size-3"/>
                    Stop
                </Button>
                {/* The file:line indicator — where pdb is parked right now. */}
                <span
                    className={cn(
                        "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono max-w-[50%]",
                        debug.paused
                            ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                    )}
                    role="status"
                    aria-live="polite"
                    title={debug.paused
                        ? `Debugger stopped at ${fileName}:${debug.stoppedLine}${debug.stoppedFrame ? ` in ${debug.stoppedFrame}()` : ""}`
                        : "Debugger position"}
                >
          {debug.paused ? (
              <>
                  <MapPin className="size-3 shrink-0" aria-hidden/>
                  <span className="truncate">
                {fileName}:{debug.stoppedLine ?? "?"}
                      {debug.stoppedFrame ? ` · ${debug.stoppedFrame}()` : ""}
              </span>
              </>
          ) : debug.running ? (
              <>
                  <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden/>
                  <span className="truncate">running…</span>
              </>
          ) : (
              <span className="truncate">idle</span>
          )}
        </span>
            </div>

            {/* ── Watch expressions ───────────────────────────────────────
          Part of the debug controls area: a small add-watch input plus
          the live values. Each expression is re-evaluated by the route
          at EVERY stop (and immediately when added while paused); the
          value renders next to the expression, errors render as the
          error text, and every row has a remove button. */}
            <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Watch expressions
                </p>
                <div className="flex items-center gap-1 mb-1">
                    <Input
                        value={watchInput}
                        onChange={(e) => setWatchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") addWatch();
                        }}
                        placeholder="e.g. x + 1"
                        aria-label="Add a watch expression"
                        className="h-6 min-w-0 flex-1 text-[11px] font-mono px-2"
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={addWatch}
                        className="h-6 px-2 text-[11px]"
                        title="Evaluate this expression at every debugger stop"
                    >
                        Add
                    </Button>
                </div>
                {watchRows.length === 0 && (
                    <span className="text-[11px] text-muted-foreground italic">
            No watches — each expression is re-evaluated at every stop.
          </span>
                )}
                {watchRows.length > 0 && (
                    <ul className="rounded-md border divide-y max-h-32 overflow-auto">
                        {watchRows.map(({expression, value, error}) => (
                            <li
                                key={expression}
                                className="px-2 py-1 text-[11px] font-mono flex items-start gap-1.5"
                            >
                <span className="text-muted-foreground shrink-0">
                  {expression}
                </span>
                                <span className="text-muted-foreground/60 shrink-0">=</span>
                                {error ? (
                                    <span
                                        className="min-w-0 flex-1 break-all text-red-600 dark:text-red-400"
                                        title={error}
                                    >
                    {error}
                  </span>
                                ) : (
                                    <span className="min-w-0 flex-1 break-all" title={value ?? ""}>
                    {value ?? (
                        <span className="italic text-muted-foreground">
                        (evaluates at the next stop)
                      </span>
                    )}
                  </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onRemoveWatch(expression)}
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                    aria-label={`Remove watch ${expression}`}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* ── Call stack ──────────────────────────────────────────────
          One row per frame, innermost first (pdb's `w` prints the
          oldest first — the display reverses it). The CURRENT frame is
          highlighted; clicking another frame POSTs { sessionId, frame }
          and the route drives pdb `up`/`down`, re-captures locals and
          watches, and the SSE stream delivers a `frame` event that
          refreshes this list, the variables pane and the watches. */}
            {debug.stack && debug.stack.length > 0 && (
                <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                        Call stack
                    </p>
                    <ul className="rounded-md border max-h-40 overflow-auto divide-y">
                        {[...debug.stack].reverse().map((f) => {
                            const selected = f.index === debug.currentFrame;
                            return (
                                <li key={f.index}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectFrame(f.index)}
                                        disabled={!debug.paused || selected}
                                        aria-current={selected ? "true" : undefined}
                                        title={
                                            selected
                                                ? `Current frame — ${f.function}() at ${f.file}:${f.line}`
                                                : `Switch to ${f.function}() at ${f.file}:${f.line} (pdb ${f.index < (debug.currentFrame ?? 0) ? "down" : "up"})`
                                        }
                                        className={cn(
                                            "w-full text-left px-2 py-1 text-[11px] font-mono flex items-center gap-2 transition-colors",
                                            selected
                                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                                : "hover:bg-muted/40",
                                            !debug.paused && !selected && "opacity-60 cursor-default"
                                        )}
                                    >
                                        <Badge
                                            variant="outline"
                                            className="text-[9px] shrink-0 px-1 font-mono"
                                        >
                                            #{f.index}
                                        </Badge>
                                        {selected && <MapPin className="size-3 shrink-0" aria-hidden/>}
                                        <span className="shrink-0 truncate">{f.function}()</span>
                                        <span className="ml-auto shrink-0 truncate max-w-[45%] text-muted-foreground">
                      {f.file}:{f.line}
                    </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Session launcher — starts (or re-runs) the pdb session with
          the CURRENT breakpoint list; disabled while one is live. */}
            <div className="flex items-center gap-1 flex-wrap">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onRun}
                    disabled={debug.running}
                    className="h-6 px-2 text-[11px] gap-1"
                    title="Launch (or re-launch) the pdb session with the breakpoints above"
                >
                    {debug.running ? (
                        <Loader2 className="size-3 animate-spin"/>
                    ) : (
                        <Play className="size-3"/>
                    )}
                    {debug.running ? "Running…" : "Continue / Start"}
                </Button>
            </div>

            {/* Stdin input (for the next run) */}
            <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Stdin (sent to script{" "}
                    <code className="font-mono">input()</code> on next run)
                </p>
                <Input
                    value={stdin}
                    onChange={(e) => onStdinChange(e.target.value)}
                    placeholder="e.g. 42"
                    className="h-7 text-[11px] font-mono"
                />
            </div>

            {/* Variables */}
            <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    Variables (locals at the current stop)
                </p>
                <pre
                    className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] font-mono whitespace-pre-wrap break-words min-h-[2.5rem] max-h-32 overflow-auto">
          {debug.variables || (
              <span className="text-muted-foreground italic">
              (no stop yet)
            </span>
          )}
        </pre>
            </div>

            {/* Output (read-only pdb terminal) */}
            <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                    pdb output
                </p>
                <pre
                    className="rounded-md border bg-black/80 text-emerald-300 dark:text-emerald-200 px-2 py-1.5 text-[11px] font-mono whitespace-pre-wrap break-words min-h-[4rem] max-h-64 overflow-auto">
          {debug.output || (
              <span className="text-muted-foreground italic">
              (no output yet — click Continue / Start to launch pdb)
            </span>
          )}
        </pre>
            </div>

            {debug.error && (
                <p className="text-xs text-red-500 dark:text-red-400">
                    Error: {debug.error}
                </p>
            )}
            {!debug.running && debug.exitCode !== null && (
                <p className="text-[11px] text-muted-foreground">
                    Session ended (exit code {debug.exitCode}).
                </p>
            )}
        </div>
    );
}
