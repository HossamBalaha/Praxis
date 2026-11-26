"use client";

/**
 * multi-python-runner.tsx — the Python Version Matrix Runner.
 *
 * Runs ONE script simultaneously on several registered interpreters and
 * compares: side-by-side output panes, an automatic diff of stdout /
 * stderr / exit codes, and a compatibility verdict line ("uses match
 * statement — fails on 3.9"). Interpreters come from /api/envs (the
 * discovered registry) plus any ad-hoc paths the user adds (persisted
 * per browser). Each run POSTs /api/run with an explicit
 * `interpreter` override and consumes its SSE stream (stdout / stderr
 * / end events), all in parallel.
 */

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Label} from "@/components/ui/label";
import {Skeleton} from "@/components/ui/skeleton";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Check, Columns2, Loader2, Play, Plus, TriangleAlert, X} from "lucide-react";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {useToast} from "@/hooks/use-toast";

const CUSTOM_KEY = `${STORAGE_PREFIX}.matrix.interpreters`;

interface EnvInfo {
    path: string;
    label: string;
    source: string;
    version?: string;
    hasScientificStack?: boolean;
}

interface PaneState {
    env: EnvInfo;
    running: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number | null;
    error: string | null;
}

/** Client-side feature scan → the compatibility verdict. Pure + table
 *  driven: each pattern names the minimum Python that supports it. */
const FEATURE_MINIMUMS: Array<{ re: RegExp; feature: string; min: [number, number] }> = [
    {re: /\bmatch\s+\w+.*:/, feature: "match statement", min: [3, 10]},
    {re: /:=/, feature: "walrus operator", min: [3, 8]},
    {re: /\bf\s"[^"]*\{[^}]*\{/s, feature: "nested f-string braces", min: [3, 12]},
    {re: /\bdataclass\b.*slots|slots\s*=\s*True/, feature: "dataclass slots", min: [3, 10]},
    {re: /\bexcept\*?\s/, feature: "except groups", min: [3, 11]},
    {re: /\bSelf\b/, feature: "typing.Self", min: [3, 11]},
    {re: /\bStrPath\b|\btype\s+\w+\s*=/, feature: "type statement", min: [3, 12]},
];

function parseMinor(version: string | undefined): [number, number] | null {
    if (!version) return null;
    const m = /(\d+)\.(\d+)/.exec(version);
    if (!m) return null;
    return [Number(m[1]), Number(m[2])];
}

function verdictFor(code: string, envs: Array<EnvInfo & { failed: boolean; exitCode: number | null }>): string | null {
    const needed = FEATURE_MINIMUMS.filter((f) => f.re.test(code));
    if (needed.length === 0) return null;
    // The lowest interpreter that FAILED points at the first incompatibility.
    const failed = envs.filter((e) => e.failed || (e.exitCode !== null && e.exitCode !== 0));
    const minors = failed.map((e) => parseMinor(e.version)).filter(Boolean) as Array<[number, number]>;
    if (minors.length === 0) return null;
    const lowest = minors.reduce((a, b) => (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? a : b));
    const features = needed.filter((f) => f.min[0] > lowest[0] || (f.min[0] === lowest[0] && f.min[1] > lowest[1]));
    if (features.length === 0) return null;
    return `uses ${features[0].feature} — fails on Python ${lowest[0]}.${lowest[1]}`;
}

export function MultiPythonRunner({
                                      open,
                                      onOpenChange,
                                      folderSlug,
                                      fileSlug,
                                      fileName,
                                      code,
                                      defaultInterpreter,
                                  }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** The LIVE edit buffer (unsaved edits compare too). */
    code?: string;
    defaultInterpreter?: string;
}) {
    const {toast} = useToast();
    const [envs, setEnvs] = React.useState<EnvInfo[] | null>(null);
    const [custom, setCustom] = React.useState<string[]>([]);
    const [customInput, setCustomInput] = React.useState("");
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [panes, setPanes] = React.useState<PaneState[]>([]);
    const [running, setRunning] = React.useState(false);
    const abortRef = React.useRef<AbortController | null>(null);

    // Load the discovered registry + persisted custom paths on open.
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setEnvs(null);
        void (async () => {
            try {
                const res = await fetch("/api/envs");
                const json = (await res.json()) as { envs?: EnvInfo[]; error?: string };
                if (cancelled) return;
                if (!res.ok || !json.envs) throw new Error(json.error ?? `HTTP ${res.status}`);
                setEnvs(json.envs);
                setSelected(new Set(json.envs.slice(0, 3).map((e) => e.path)));
            } catch (err) {
                if (!cancelled) setEnvs([]);
                if (!cancelled) toast({
                    title: "Could not list interpreters",
                    description: (err as Error).message,
                    variant: "destructive"
                });
            }
            try {
                const raw = window.localStorage.getItem(CUSTOM_KEY);
                if (raw) setCustom(JSON.parse(raw) as string[]);
            } catch { /* corrupted — start empty */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, toast]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
        } catch { /* storage */
        }
    }, [custom]);

    const toggle = (path: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const addCustom = () => {
        const p = customInput.trim();
        if (!p) return;
        setCustom((prev) => (prev.includes(p) ? prev : [...prev, p]));
        setSelected((prev) => new Set(prev).add(p));
        setCustomInput("");
    };

    const allEnvInfos: EnvInfo[] = React.useMemo(() => {
        const list = envs ?? [];
        const customInfos = custom
            .filter((p) => !list.some((e) => e.path === p))
            .map((p) => ({path: p, label: p.split("/").pop() ?? p, source: "custom"}));
        return [...list, ...customInfos];
    }, [envs, custom]);

    // ── the parallel matrix run ──
    const runMatrix = async () => {
        const chosen = allEnvInfos.filter((e) => selected.has(e.path));
        if (chosen.length === 0) {
            toast({title: "Pick at least one interpreter"});
            return;
        }
        if (running) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setPanes(chosen.map((env) => ({
            env,
            running: true,
            stdout: "",
            stderr: "",
            exitCode: null,
            durationMs: null,
            error: null
        })));
        const source = code ?? "";
        await Promise.all(
            chosen.map((env, idx) =>
                (async () => {
                    const patch = (p: Partial<PaneState>) =>
                        setPanes((prev) => prev.map((pane, i) => (i === idx ? {...pane, ...p} : pane)));
                    try {
                        const res = await fetch("/api/run", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                folder: folderSlug,
                                file: fileSlug,
                                code: source,
                                interpreter: env.path,
                                timeoutMs: 20000,
                                interactive: false,
                            }),
                            signal: controller.signal,
                        });
                        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
                        const reader = res.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = "";
                        patch({running: true});
                        for (; ;) {
                            const {done, value} = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, {stream: true});
                            let sep: number;
                            while ((sep = buffer.indexOf("\n\n")) >= 0) {
                                const raw = buffer.slice(0, sep).trim();
                                buffer = buffer.slice(sep + 2);
                                if (!raw.startsWith("data:")) continue;
                                try {
                                    const evt = JSON.parse(raw.slice(5).trim()) as {
                                        type: string;
                                        text?: string;
                                        exitCode?: number;
                                        durationMs?: number;
                                        ok?: boolean;
                                        message?: string;
                                    };
                                    if (evt.type === "stdout") setPanes((prev) => prev.map((pane, i) => (i === idx ? {
                                        ...pane,
                                        stdout: pane.stdout + (evt.text ?? "")
                                    } : pane)));
                                    if (evt.type === "stderr") setPanes((prev) => prev.map((pane, i) => (i === idx ? {
                                        ...pane,
                                        stderr: pane.stderr + (evt.text ?? "")
                                    } : pane)));
                                    if (evt.type === "end") patch({
                                        running: false,
                                        exitCode: evt.exitCode ?? (evt.ok ? 0 : 1),
                                        durationMs: evt.durationMs ?? null
                                    });
                                    if (evt.type === "error") patch({
                                        running: false,
                                        error: evt.message ?? "run failed",
                                        exitCode: null
                                    });
                                } catch { /* partial JSON — next chunk completes it */
                                }
                            }
                        }
                    } catch (err) {
                        if ((err as Error).name === "AbortError") return;
                        patch({running: false, error: (err as Error).message});
                    }
                })()
            )
        );
        setRunning(false);
        abortRef.current = null;
    };

    const stopMatrix = () => {
        try {
            abortRef.current?.abort();
        } catch { /* already gone */
        }
        setRunning(false);
    };

    const verdict = React.useMemo(() => {
        if (panes.length < 2) return null;
        return verdictFor(code ?? "", panes.map((p) => ({...p.env, failed: !!p.error, exitCode: p.exitCode})));
    }, [panes, code]);

    const outputsDiffer = React.useMemo(() => {
        if (panes.length < 2) return false;
        const first = panes[0].stdout;
        return panes.some((p) => p.stdout !== first);
    }, [panes]);

    const label = (e: EnvInfo) => e.version ? `${e.label} (${e.version})` : e.label;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Columns2 className="size-4 text-cyan-500"/>
                        Run on multiple Pythons — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        Run the script on several registered interpreters at once and compare side-by-side
                        outputs, exit codes and compatibility.
                    </DialogDescription>
                </DialogHeader>

                {/* Interpreter registry */}
                <div className="space-y-2">
                    <Label className="text-xs">Interpreters</Label>
                    {envs === null ? (
                        <div className="space-y-1.5">
                            <Skeleton className="h-6 w-full rounded"/>
                            <Skeleton className="h-6 w-3/4 rounded"/>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {allEnvInfos.map((e) => {
                                const on = selected.has(e.path);
                                return (
                                    <button
                                        key={e.path}
                                        type="button"
                                        onClick={() => toggle(e.path)}
                                        title={`${e.path} — ${e.source}`}
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                                            on
                                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        {on && <Check className="size-3"/>}
                                        {label(e)}
                                    </button>
                                );
                            })}
                            <div className="inline-flex items-center gap-1">
                                <Input
                                    value={customInput}
                                    onChange={(e) => setCustomInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addCustom();
                                        }
                                    }}
                                    placeholder="/usr/bin/pythonX"
                                    aria-label="Add a custom interpreter path"
                                    className="h-7 w-40 text-xs font-mono"
                                    spellCheck={false}
                                />
                                <Button variant="ghost" size="icon" className="size-7" onClick={addCustom}
                                        aria-label="Add interpreter" title="Add this interpreter path to the registry">
                                    <Plus className="size-3.5"/>
                                </Button>
                            </div>
                            {custom.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setCustom([])}
                                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                                    title="Clear the custom paths (the discovered registry stays)"
                                >
                                    <X className="size-3"/> clear custom
                                </button>
                            )}
                        </div>
                    )}
                    {defaultInterpreter && (
                        <p className="text-[10px] text-muted-foreground">
                            Note: the default configured interpreter ({defaultInterpreter}) is only used for
                            normal runs — the matrix always spawns the selected paths explicitly.
                        </p>
                    )}
                </div>

                {/* Run controls */}
                <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => void runMatrix()}
                            disabled={running || selected.size === 0}>
                        {running ? <Loader2 className="size-3.5 animate-spin"/> : <Play className="size-3.5"/>}
                        Run on {selected.size} interpreter{selected.size === 1 ? "" : "s"}
                    </Button>
                    {running && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={stopMatrix}>
                            <X className="size-3.5"/> Stop all
                        </Button>
                    )}
                    {outputsDiffer && <Badge variant="outline"
                                             className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-300 gap-1"><TriangleAlert
                      className="size-3"/> outputs differ</Badge>}
                    {verdict && <Badge variant="outline"
                                       className="text-[10px] border-red-500/40 text-red-600 dark:text-red-300 gap-1"><TriangleAlert
                      className="size-3"/> {verdict}</Badge>}
                </div>

                {/* Side-by-side panes */}
                <div className="flex-1 min-h-0 overflow-x-auto">
                    {panes.length === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center gap-1.5 py-10 px-6 text-xs text-muted-foreground text-center">
                            <Columns2 className="size-5 opacity-40"/>
                            Pick two or more interpreters above and press Run — the outputs, exit codes and a
                            compatibility verdict will line up side by side here.
                        </div>
                    ) : (
                        <div className="grid gap-2 min-w-full"
                             style={{gridTemplateColumns: `repeat(${Math.min(panes.length, 3)}, minmax(260px, 1fr))`}}>
                            {panes.map((pane, i) => (
                                <div key={i} className="rounded-md border overflow-hidden flex flex-col min-h-[140px]">
                                    <div
                                        className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5 text-[10px]">
                                        <span className="font-medium truncate">{label(pane.env)}</span>
                                        {pane.running && <Loader2 className="size-3 animate-spin text-emerald-500"/>}
                                        {!pane.running && pane.exitCode !== null && (
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "ml-auto text-[9px] px-1.5",
                                                    pane.exitCode === 0 ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-300" : "border-red-500/40 text-red-600 dark:text-red-300"
                                                )}
                                            >
                                                exit {pane.exitCode}
                                            </Badge>
                                        )}
                                        {!pane.running && pane.durationMs !== null && (
                                            <span
                                                className="ml-auto text-[9px] text-muted-foreground">{pane.durationMs} ms</span>
                                        )}
                                    </div>
                                    {pane.error ? (
                                        <div
                                            className="px-3 py-2 text-[11px] text-red-600 dark:text-red-300 break-words">{pane.error}</div>
                                    ) : (
                                        <pre
                                            className="flex-1 min-h-0 max-h-56 overflow-auto px-2.5 py-2 text-[10px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                      {pane.stderr && <span className="text-red-600 dark:text-red-300">{pane.stderr}</span>}
                                            {pane.stdout || (!pane.running &&
                                              <span className="text-muted-foreground">(no output)</span>)}
                                            {pane.running && <span className="text-muted-foreground">running…</span>}
                    </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default MultiPythonRunner;
