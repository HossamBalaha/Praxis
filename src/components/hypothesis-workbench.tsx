"use client";

import * as React from "react";
import {
    AlertTriangle,
    ArrowRight,
    ClipboardCopy,
    Crosshair,
    FilePlus2,
    FlaskConical,
    Loader2,
    Play,
    TrendingDown,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {useToast} from "@/hooks/use-toast";

/**
 * HypothesisWorkbench — scaffold + run + shrink-analysis for
 * property-based tests (POST /api/hypothesis-run).
 *
 * (a) TARGET — the file's defs parsed client-side (regex + paren
 *     balancing; pure, total) into a select.
 * (b) SCAFFOLD — a @given(...) property test generated from the
 *     signature (int → st.integers(), float → st.floats(allow_nan=False),
 *     str → st.text(), bool → st.booleans(), list[X] → st.lists(...),
 *     dict[K,V] → st.dictionaries(...), unknown → st.nothing() + TODO),
 *     shown in an EDITABLE textarea with Copy + "Insert into file"
 *     (onInsertTest). Editing resets only when the target's signature
 *     changes (adjust-state-during-render, not an effect).
 * (c) RUN — posts the current file (+ optional single test name) and
 *     renders pass/fail/error badges, the raw statistics block, the
 *     stdout tail and — when failures shrank — the numbered shrink
 *     sequence (original → minimal).
 * (d) PROMOTE — "Promote shrunk case to regression test" builds a
 *     pinned @example(...)/@given(...) regression from the minimal
 *     repr and hands it to onInsertTest.
 *
 * Missing-package failures render an amber hint card with the pip
 * install line + a copy button. Every fetch has skeletons; empty
 * states are centered and padded.
 */

/* ─── Pure Python-source helpers (never throw) ─────────────────────── */

interface ParamInfo {
    name: string;
    annotation: string;
}

interface DefInfo {
    name: string;
    params: ParamInfo[];
    line: number;
}

/** Index of the first TOP-LEVEL occurrence of `ch` (bracket-aware, so
 *  annotations like dict[str, int] do not confuse it). */
function topLevelIndexOf(s: string, ch: string): number {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth--;
        else if (c === ch && depth === 0) return i;
    }
    return -1;
}

/** Split generic-subscript arguments ("str, list[int]") on TOP-LEVEL
 *  commas only — nested brackets stay in one part. */
function splitGenericArgs(s: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        if (ch === "," && depth === 0) {
            parts.push(cur.trim());
            cur = "";
        } else {
            cur += ch;
        }
    }
    if (cur.trim() || parts.length > 0) parts.push(cur.trim());
    return parts;
}

/** Text inside a def's parameter parentheses — the signature may span
 *  lines, so parens are balanced across a bounded window. */
function captureParams(lines: string[], start: number): string | null {
    let text = "";
    for (let i = start; i < Math.min(lines.length, start + 50); i++) {
        text += (i === start ? "" : "\n") + (lines[i] ?? "");
    }
    const open = text.indexOf("(");
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
            depth--;
            if (depth === 0) return text.slice(open + 1, i);
        }
    }
    return null;
}

/** name + annotation from one parameter chunk (defaults stripped at
 *  the top level; self/cls skipped). */
function parseParam(chunk: string): ParamInfo | null {
    let t = chunk.trim();
    if (!t) return null;
    t = t.replace(/^(\*\*|\*)\s*/, "");
    const eq = topLevelIndexOf(t, "=");
    if (eq >= 0) t = t.slice(0, eq).trim();
    const nameM = /^[A-Za-z_][A-Za-z0-9_]*/.exec(t);
    if (!nameM) return null;
    const name = nameM[0];
    if (name === "self" || name === "cls") return null;
    const colon = topLevelIndexOf(t, ":");
    const annotation = colon >= 0 ? t.slice(colon + 1).trim() : "";
    return {name, annotation};
}

/** All top-level (and method) defs with their parameters — enough for
 *  the target select; not a real parser. */
function parseDefs(code: string | undefined): DefInfo[] {
    if (!code) return [];
    const lines = code.split("\n");
    const out: DefInfo[] = [];
    const defRe = /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
    for (let i = 0; i < lines.length; i++) {
        const m = defRe.exec(lines[i] ?? "");
        if (!m?.[1]) continue;
        const sig = captureParams(lines, i);
        const params: ParamInfo[] = [];
        if (sig !== null) {
            let depth = 0;
            let cur = "";
            for (const ch of sig.replace(/\n/g, " ")) {
                if ("([{".includes(ch)) depth++;
                else if (")]}".includes(ch)) depth--;
                if (ch === "," && depth === 0) {
                    const p = parseParam(cur);
                    if (p) params.push(p);
                    cur = "";
                } else {
                    cur += ch;
                }
            }
            const p = parseParam(cur);
            if (p) params.push(p);
        }
        out.push({name: m[1], params, line: i + 1});
    }
    return out;
}

/* ─── Strategy mapping ─────────────────────────────────────────────── */

interface Strategy {
    code: string;
    note?: string;
}

/** Annotation → hypothesis strategy, per the workbench contract:
 *  int/float/str/bool directly, list[X] → st.lists(...), dict[K,V] →
 *  st.dictionaries(...), anything else (or no annotation) →
 *  st.nothing() with a TODO note. Optional[...] is unwrapped first. */
function strategyFor(annotation: string): Strategy {
    const a = annotation.trim();
    if (!a) return {code: "st.nothing()", note: "no annotation — add one for a real strategy"};
    const opt = /^Optional\[(.+)\]$/.exec(a);
    const inner = opt ? (opt[1] ?? "").trim() : a;
    if (inner === "int") return {code: "st.integers()"};
    if (inner === "float") return {code: "st.floats(allow_nan=False)"};
    if (inner === "str") return {code: "st.text()"};
    if (inner === "bool") return {code: "st.booleans()"};
    const lst = /^(?:[Ll]ist)\[(.+)\]$/.exec(inner);
    if (lst) {
        const el = strategyFor((lst[1] ?? "").trim());
        return {code: `st.lists(${el.code})`, note: el.note ? `list of ${el.note}` : undefined};
    }
    if (/^[Ll]ist$/.test(inner)) {
        return {code: "st.lists(st.integers())", note: "bare list — element strategy assumed int"};
    }
    const dct = /^(?:[Dd]ict)\[(.+)\]$/.exec(inner);
    if (dct) {
        const args = splitGenericArgs(dct[1] ?? "");
        if (args.length === 2) {
            const k = strategyFor(args[0] ?? "");
            const v = strategyFor(args[1] ?? "");
            return {code: `st.dictionaries(${k.code}, ${v.code})`, note: k.note ?? v.note};
        }
    }
    if (/^[Dd]ict$/.test(inner)) {
        return {
            code: "st.dictionaries(st.text(), st.integers())",
            note: "bare dict — key/value strategies assumed text/int"
        };
    }
    return {code: "st.nothing()", note: `unsupported annotation: ${a}`};
}

/** Best-effort importable module name from the file slug. */
function moduleFromSlug(fileSlug: string): { name: string; guessed: boolean } {
    const name = fileSlug.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "m$1");
    return {name, guessed: name !== fileSlug};
}

interface Scaffold {
    source: string;
    notes: string[];
    testName: string;
}

/** The @given(...) property-test scaffold for one function. */
function buildPropertyTest(fileSlug: string, funcName: string, params: ParamInfo[]): Scaffold {
    const mod = moduleFromSlug(fileSlug);
    const notes: string[] = [];
    if (mod.guessed) {
        notes.push(`import path guessed from the file name (${mod.name}) — fix it if the module lives in a package`);
    }
    const givenParts: string[] = [];
    const callArgs: string[] = [];
    for (const p of params) {
        const s = strategyFor(p.annotation);
        if (s.note) notes.push(`${p.name}: ${s.note}`);
        givenParts.push(`${p.name}=${s.code}`);
        callArgs.push(p.name);
    }
    const testName = `test_${funcName}`;
    const lines: string[] = [
        "from hypothesis import given",
        "import hypothesis.strategies as st",
        "",
        `from ${mod.name} import ${funcName}`,
        "",
        "",
    ];
    if (params.length > 0) {
        lines.push(`@given(${givenParts.join(", ")})`);
    } else {
        notes.push("no parameters — a plain (non-@given) test was scaffolded");
    }
    lines.push(`def ${testName}(${callArgs.join(", ")}):`);
    lines.push(`    # TODO: replace with a real property of ${funcName} (invariant, round-trip, idempotence...)`);
    lines.push(
        `    result = ${funcName}(${callArgs.join(", ")})`
    );
    lines.push("    assert result is not None");
    if (notes.length > 0) {
        lines.push("", "    # Notes:");
        for (const n of notes) lines.push(`    #   - ${n}`);
    }
    return {source: lines.join("\n") + "\n", notes, testName};
}

/** A pinned regression test built from the MINIMAL shrink repr. The
 *  strategies + parameters come from the current scaffold when it
 *  parses; otherwise a TODO template is emitted (valid Python, never
 *  a guess that lies). */
function buildRegressionTest(
    funcName: string,
    fileSlug: string,
    scaffoldSource: string,
    minimalRepr: string
): string {
    const repr = minimalRepr.trim();
    const givenM = /^@given\((.+)\)$/m.exec(scaffoldSource);
    const defM = /^def\s+(?:test_)?[A-Za-z0-9_]+\s*\(([^)]*)\)\s*:/m.exec(scaffoldSource);
    const givenArgs = (givenM?.[1] ?? "").trim();
    const defParams = defM ? (defM[1] ?? "").trim() : null;
    // "add(a=1, b=0)" → "a=1, b=0"; anything else degrades to the TODO form.
    const reprFn = /^[A-Za-z_][A-Za-z0-9_]*\s*\((.*)\)$/.exec(repr);
    const exampleArgs = reprFn ? (reprFn[1] ?? "").trim() : "";
    if (givenArgs && defParams !== null) {
        const callArgs = defParams
            .split(",")
            .map((p) => (p.split("=")[0] ?? "").trim())
            .filter(Boolean);
        return [
            "from hypothesis import example, given",
            "import hypothesis.strategies as st",
            "",
            `from ${moduleFromSlug(fileSlug).name} import ${funcName}`,
            "",
            "",
            exampleArgs
                ? `@example(${exampleArgs})`
                : "@example(...)  # TODO: paste the minimal arguments from below",
            `@given(${givenArgs})`,
            `def test_${funcName}_minimal(${defParams}):`,
            `    # Regression pinned from the minimal failing case: ${repr}`,
            "    # TODO: assert the property that failed here.",
            `    assert ${funcName}(${callArgs.join(", ")}) is not None`,
            "",
        ].join("\n");
    }
    return [
        `# Regression: minimal failing case for ${funcName}`,
        `#   ${repr}`,
        "# TODO: pin with @example(...) above the same @given(...) strategies",
        "#       as the failing property test, then assert the property.",
        `def test_${funcName}_minimal():`,
        `    ...  # reproduce the failure from: ${repr}`,
        "",
    ].join("\n");
}

/* ─── /api/hypothesis-run contract shapes ──────────────────────────── */

interface ShrinkStep {
    step: number;
    repr: string;
    explanation?: string;
}

interface RunSuccess {
    ok: true;
    passed: number;
    failed: number;
    errors: number;
    shrinks: ShrinkStep[];
    statistics?: string;
    stdout: string;
}

interface RunFailure {
    ok: false;
    missing?: string;
    hint?: string;
    error?: string;
}

type RunResponse = RunSuccess | RunFailure;

/* ─── Component ────────────────────────────────────────────────────── */

export function HypothesisWorkbench({
                                        folderSlug,
                                        fileSlug,
                                        fileName,
                                        code,
                                        onInsertTest,
                                    }: {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Current buffer source (defs are parsed from it). */
    code?: string;
    /** Hands generated test source to the editor/file. */
    onInsertTest: (testSource: string) => void;
}) {
    const {toast} = useToast();

    const defs = React.useMemo(() => parseDefs(code), [code]);

    /* Target function: the selection, falling back to the first def
     * when it no longer exists (file edited / first mount) — derived,
     * so no effect is needed. */
    const [selectedFn, setSelectedFn] = React.useState("");
    const targetFn =
        selectedFn && defs.some((d) => d.name === selectedFn) ? selectedFn : defs[0]?.name ?? "";

    /* The pristine scaffold DERIVED from the target; `edited` holds the
     * user's textarea copy (null = untouched). Adjusting during render
     * resets it only when the target/signature key changes — typing is
     * never clobbered mid-edit. */
    const draft = React.useMemo(() => {
        if (!targetFn) return null;
        const def = defs.find((d) => d.name === targetFn);
        if (!def) return null;
        return {
            key: `${fileSlug}|${targetFn}|${def.params.map((p) => `${p.name}:${p.annotation}`).join(",")}`,
            ...buildPropertyTest(fileSlug, def.name, def.params),
        };
    }, [defs, targetFn, fileSlug]);
    const [edited, setEdited] = React.useState<string | null>(null);
    const [draftKey, setDraftKey] = React.useState("");
    const nextKey = draft?.key ?? "";
    if (nextKey !== draftKey) {
        // Adjusting state during render (React-sanctioned): a changed target
        // OR the target disappearing resets the editable copy so a reappearing
        // signature never shows stale edits.
        setDraftKey(nextKey);
        setEdited(null);
    }
    const scaffold = edited ?? draft?.source ?? "";

    /* RUN state. */
    const [testName, setTestName] = React.useState("");
    const [running, setRunning] = React.useState(false);
    const [runResult, setRunResult] = React.useState<RunResponse | null>(null);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (running) return;
        setRunning(true);
        setRunResult(null);
        setRunError(null);
        try {
            const body: { folder: string; file: string; code?: string; testName?: string } = {
                folder: folderSlug,
                file: fileSlug,
            };
            if (code && code.trim()) body.code = code;
            if (testName.trim()) body.testName = testName.trim();
            const res = await fetch("/api/hypothesis-run", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            const data = (await res.json().catch(() => null)) as RunResponse | null;
            if (!data) {
                setRunError(`HTTP ${res.status}`);
                return;
            }
            setRunResult(data);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setRunning(false);
        }
    };

    const copy = (label: string, value: string) => {
        void navigator.clipboard?.writeText(value).then(() =>
            toast({title: `${label} copied`, variant: "success"})
        );
    };

    const insertScaffold = () => {
        if (!scaffold.trim()) return;
        onInsertTest(scaffold);
        if (targetFn) setTestName(`test_${targetFn}`);
        toast({
            title: "Property test handed to the editor",
            description: targetFn ? `test_${targetFn}` : undefined,
            variant: "success",
        });
    };

    /** Build a pinned @example(...) regression from the MINIMAL shrunk
     *  case and hand it to the editor. */
    const promote = () => {
        if (!runResult?.ok || runResult.shrinks.length === 0) return;
        const minimal = runResult.shrinks[runResult.shrinks.length - 1];
        const fnFromRepr = /^[A-Za-z_][A-Za-z0-9_]*/.exec(minimal.repr)?.[0];
        const funcName = fnFromRepr ?? targetFn;
        if (!funcName) return;
        onInsertTest(buildRegressionTest(funcName, fileSlug, scaffold, minimal.repr));
        toast({
            title: "Regression test handed to the editor",
            description: `Pinned the minimal case: ${minimal.repr}`,
            variant: "success",
        });
    };

    const stdoutTail = runResult?.ok && runResult.stdout.trim()
        ? runResult.stdout.split("\n").slice(-30).join("\n")
        : "";

    const sectionHeader = (icon: React.ReactNode, title: string, extra?: React.ReactNode) => (
        <header
            className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {icon}
            <span>{title}</span>
            {extra}
        </header>
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* ── caption bar ── */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <FlaskConical className="size-4 shrink-0 text-emerald-500" aria-hidden="true"/>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Hypothesis workbench</p>
                    <p className="truncate text-[10px] text-muted-foreground" title={fileName}>
                        Property tests for {fileName}
                    </p>
                </div>
                <Badge variant="outline" className="ml-auto shrink-0 text-[9px]">
                    {defs.length} def{defs.length === 1 ? "" : "s"}
                </Badge>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {/* ── (a) target function ── */}
                <section className="space-y-2 rounded-md border p-3" aria-label="Target function">
                    {sectionHeader(<Crosshair className="size-3" aria-hidden="true"/>, "Target function")}
                    {defs.length === 0 ? (
                        <p className="px-1 py-2 text-[10px] text-muted-foreground">
                            No function definitions found in {fileName} — add a def to scaffold a property test.
                        </p>
                    ) : (
                        <Select value={targetFn} onValueChange={setSelectedFn}>
                            <SelectTrigger className="h-8 w-full text-xs" aria-label="Target function">
                                <SelectValue placeholder="Pick a function…"/>
                            </SelectTrigger>
                            <SelectContent>
                                {defs.map((d) => (
                                    <SelectItem key={d.name} value={d.name} className="text-xs">
                    <span className="font-mono">
                      {d.name}({d.params.map((p) => p.name).join(", ")})
                    </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </section>

                {/* ── (b) scaffold preview ── */}
                <section className="space-y-2 rounded-md border p-3" aria-label="Property test scaffold">
                    {sectionHeader(
                        <FilePlus2 className="size-3" aria-hidden="true"/>,
                        "Property test scaffold",
                        <span className="ml-auto font-mono text-[9px] normal-case">
              {targetFn ? `@given · ${targetFn}` : ""}
            </span>
                    )}
                    {draft ? (
                        <>
                            <Textarea
                                value={scaffold}
                                onChange={(e) => setEdited(e.target.value)}
                                className="min-h-52 font-mono text-[11px] leading-4"
                                aria-label="Generated property test source (editable)"
                                spellCheck={false}
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => copy("Scaffold", scaffold)}
                                    disabled={!scaffold.trim()}
                                    title="Copy the test source"
                                >
                                    <ClipboardCopy className="size-3.5"/> Copy
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={insertScaffold}
                                    disabled={!scaffold.trim()}
                                    title="Insert the test into the current file"
                                >
                                    <FilePlus2 className="size-3.5"/> Insert into file
                                </Button>
                            </div>
                            {draft.notes.length > 0 && (
                                <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                                    {draft.notes.map((n, i) => (
                                        <li key={i} className="flex gap-1">
                                            <ArrowRight className="mt-1 size-2.5 shrink-0" aria-hidden="true"/>
                                            <span className="break-words">{n}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        <p className="px-1 py-2 text-[10px] text-muted-foreground">
                            Pick a target function above to generate a scaffold.
                        </p>
                    )}
                </section>

                {/* ── (c) run ── */}
                <section className="space-y-2 rounded-md border p-3" aria-label="Run property tests">
                    {sectionHeader(<Play className="size-3" aria-hidden="true"/>, "Run")}
                    <div className="flex items-end gap-1.5">
                        <div className="min-w-0 flex-1 space-y-1">
                            <Label htmlFor="hyp-test-name" className="text-[10px] text-muted-foreground">
                                Test name (optional)
                            </Label>
                            <Input
                                id="hyp-test-name"
                                value={testName}
                                onChange={(e) => setTestName(e.target.value)}
                                placeholder="test_add — empty runs every test in the file"
                                className="h-8 font-mono text-xs"
                                aria-label="Single test name to run"
                                spellCheck={false}
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-8 shrink-0 gap-1.5 text-xs"
                            onClick={() => void run()}
                            disabled={running}
                            title="Run the file's property tests"
                        >
                            {running ? <Loader2 className="size-3.5 animate-spin"/> : <Play className="size-3.5"/>}
                            Run
                        </Button>
                    </div>

                    <div className="space-y-2 pt-1">
                        {running ? (
                            <div className="space-y-1.5" aria-label="Running property tests">
                                <Skeleton className="h-7 w-1/2 rounded"/>
                                <Skeleton className="h-20 w-full rounded"/>
                                <Skeleton className="h-14 w-full rounded"/>
                            </div>
                        ) : runError ? (
                            <div
                                className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true"/>
                                <div className="min-w-0">
                                    <p className="font-medium">The run failed</p>
                                    <p className="break-words">{runError}</p>
                                </div>
                            </div>
                        ) : runResult?.ok ? (
                            <>
                                {/* pass/fail/error badges */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline"
                                           className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                                        passed {runResult.passed}
                                    </Badge>
                                    <Badge variant="outline"
                                           className="border-red-500/40 text-red-600 dark:text-red-400">
                                        failed {runResult.failed}
                                    </Badge>
                                    <Badge variant="outline"
                                           className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                                        errors {runResult.errors}
                                    </Badge>
                                </div>
                                {/* raw statistics block */}
                                {runResult.statistics && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Statistics
                                        </p>
                                        <pre
                                            className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-2 font-mono text-[10px] leading-4">
                      {runResult.statistics}
                    </pre>
                                    </div>
                                )}
                                {/* stdout tail */}
                                {stdoutTail && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            stdout · tail
                                        </p>
                                        <pre
                                            className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-2 font-mono text-[10px] leading-4">
                      {stdoutTail}
                    </pre>
                                    </div>
                                )}
                                {/* (d) shrink sequence + promote */}
                                {runResult.shrinks.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Shrink sequence · original → minimal
                                        </p>
                                        <ol className="space-y-1">
                                            {runResult.shrinks.map((s, i) => (
                                                <li key={s.step}
                                                    className="space-y-0.5 rounded-md border bg-muted/20 px-2 py-1.5">
                                                    <div className="flex items-center gap-1.5">
                            <span className="w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
                              {String(s.step).padStart(2, "0")}
                            </span>
                                                        {i === 0 && (
                                                            <Badge variant="outline"
                                                                   className="shrink-0 px-1 text-[8px]">
                                                                original
                                                            </Badge>
                                                        )}
                                                        {i === runResult.shrinks.length - 1 && (
                                                            <Badge variant="outline"
                                                                   className="shrink-0 px-1 text-[8px] text-red-600 dark:text-red-400">
                                                                minimal
                                                            </Badge>
                                                        )}
                                                        <code className="min-w-0 flex-1 truncate font-mono text-[10px]"
                                                              title={s.repr}>
                                                            {s.repr}
                                                        </code>
                                                    </div>
                                                    {s.explanation && (
                                                        <p className="pl-14 text-[9px] text-muted-foreground">{s.explanation}</p>
                                                    )}
                                                </li>
                                            ))}
                                        </ol>
                                        {runResult.failed > 0 && (
                                            <Button
                                                size="sm"
                                                className="h-7 gap-1.5 text-xs"
                                                onClick={promote}
                                                title="Build a pinned @example(...) regression test from the minimal case and insert it into the file"
                                            >
                                                <TrendingDown className="size-3.5"/> Promote shrunk case to regression
                                                test
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : runResult && !runResult.ok ? (
                            /* failure: missing-package hint card or the raw error */
                            runResult.missing ? (
                                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true"/>
                                        Missing package
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {runResult.hint ?? `The property runner needs the ${runResult.missing} package.`}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <code
                                            className="min-w-0 flex-1 truncate rounded border bg-muted/40 px-2 py-1 font-mono text-[11px]"
                                            title={`pip install ${runResult.missing}`}>
                                            pip install {runResult.missing}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 shrink-0 gap-1 text-xs"
                                            onClick={() => copy("Install line", `pip install ${runResult.missing}`)}
                                        >
                                            <ClipboardCopy className="size-3.5"/> Copy
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true"/>
                                    <div className="min-w-0">
                                        <p className="font-medium">The run failed</p>
                                        <p className="break-words">{runResult.error ?? "Unknown error"}</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            <p className="px-1 py-4 text-center text-[10px] text-muted-foreground">
                                No run yet — scaffold a property test and press Run.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
