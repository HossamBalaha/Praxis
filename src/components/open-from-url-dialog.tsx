"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {STORAGE_PREFIX} from "@/lib/config";
import {AlertCircle, CheckCircle2, Github, History, Loader2, WifiOff,} from "lucide-react";

/**
 * OpenFromUrlDialog — "Import from GitHub…": paste a repository or gist
 * URL and import it into a new workspace folder via POST /api/github-import.
 *
 * ▸ live URL validation with a detection hint (repo / tree-ref / subpath /
 *   gist);
 * ▸ staged progress while the import runs (fetching → unpacking →
 *   importing) plus skeletons for the recent-imports list;
 * ▸ success state: folder name + file count + the "reload from source
 *   later" note (the import persists .praxis/source.json in the folder)
 *   and a Done button that calls onImported;
 * ▸ error card with a dedicated, clean OFFLINE state when the server
 *   reports the network is unreachable;
 * ▸ recent imports (localStorage, 5 max) refill the input on click.
 */

const RECENTS_KEY = `${STORAGE_PREFIX}.github.imports`;
const RECENTS_MAX = 5;

/* ── local types ─────────────────────────────────────────────────── */

interface RecentImport {
    url: string;
    folder: string;
    time: number;
}

interface ImportResult {
    folder: string;
    name: string;
    files: number;
    url: string;
    ref?: string;
}

interface ImportError {
    message: string;
    offline: boolean;
}

type Phase = "idle" | "running" | "done" | "error";
type Stage = "fetching" | "unpacking" | "importing";

const STAGES: Stage[] = ["fetching", "unpacking", "importing"];
const STAGE_LABEL: Record<Stage, string> = {
    fetching: "Fetching…",
    unpacking: "Unpacking…",
    importing: "Importing…",
};
const STAGE_STEP_MS = 2200;

/* ── client-side URL parsing (mirror of the route's parser) ───────── */

interface ParsedUrl {
    kind: "repo" | "gist";
    owner?: string;
    repo?: string;
    gistId?: string;
    ref?: string;
    subpath?: string;
}

function decodeSegment(seg: string): string {
    try {
        return decodeURIComponent(seg);
    } catch {
        return seg;
    }
}

function parseGithubUrlClient(raw: string): ParsedUrl | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let u: URL;
    try {
        u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
        return null;
    }
    const host = u.hostname.toLowerCase();
    if (host === "gist.github.com" || host === "www.gist.github.com") {
        const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
        if (/^[\w-]+$/.test(id)) return {kind: "gist", gistId: id};
        return null;
    }
    if (host !== "github.com" && host !== "www.github.com") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    const owner = decodeSegment(segs[0]);
    const repo = decodeSegment(segs[1]).replace(/\.git$/i, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    let ref: string | undefined;
    let subpath: string | undefined;
    if (segs.length >= 4 && segs[2] === "tree") {
        ref = decodeSegment(segs[3]) || undefined;
        const rest = segs.slice(4).map(decodeSegment);
        if (rest.length) subpath = rest.join("/");
    }
    return {kind: "repo", owner, repo, ref, subpath};
}

/** Decode a folder slug (base64url of the name) — the client-side twin
 *  of scripts.ts deslugify, for showing recent import folder names. */
function deslugName(slug: string): string {
    try {
        const binary = window.atob(slug.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        return slug;
    }
}

/** "2 min ago"-style age for the recent list. */
function relativeTime(at: number): string {
    if (!Number.isFinite(at) || at <= 0) return "";
    const diff = Date.now() - at;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
    if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)} d ago`;
    return new Date(at).toLocaleDateString();
}

/* ── the dialog ──────────────────────────────────────────────────── */

export function OpenFromUrlDialog({
                                      open,
                                      onOpenChange,
                                      onImported,
                                  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported?: (folderSlug: string, fileCount: number) => void;
}) {
    const {toast} = useToast();
    const [url, setUrl] = React.useState("");
    const [phase, setPhase] = React.useState<Phase>("idle");
    const [stage, setStage] = React.useState<Stage>("fetching");
    const [runId, setRunId] = React.useState(0);
    const [result, setResult] = React.useState<ImportResult | null>(null);
    const [error, setError] = React.useState<ImportError | null>(null);
    const [recents, setRecents] = React.useState<RecentImport[] | null>(null);

    // Reset + hydrate the recent list whenever the dialog opens.
    React.useEffect(() => {
        if (!open) return;
        setUrl("");
        setPhase("idle");
        setResult(null);
        setError(null);
        setRecents(null); // skeleton while localStorage hydrates (SSR-safe)
        const t = window.setTimeout(() => {
            try {
                const raw = window.localStorage.getItem(RECENTS_KEY);
                const parsed: unknown = raw ? JSON.parse(raw) : [];
                if (Array.isArray(parsed)) {
                    const list = parsed
                        .filter(
                            (r): r is RecentImport =>
                                typeof r === "object" &&
                                r !== null &&
                                typeof (r as RecentImport).url === "string" &&
                                typeof (r as RecentImport).folder === "string"
                        )
                        .map((r) => ({
                            url: r.url,
                            folder: r.folder,
                            time: typeof r.time === "number" ? r.time : 0,
                        }))
                        .slice(0, RECENTS_MAX);
                    setRecents(list);
                    return;
                }
                setRecents([]);
            } catch {
                setRecents([]); // corrupt — start fresh
            }
        }, 0);
        return () => window.clearTimeout(t);
    }, [open]);

    // Stage progression while the import POST is in flight (the server does
    // the real work in one request; the labels advance on a timer).
    React.useEffect(() => {
        if (phase !== "running") return;
        setStage("fetching");
        let i = 0;
        const timer = window.setInterval(() => {
            i = Math.min(i + 1, STAGES.length - 1);
            setStage(STAGES[i]);
        }, STAGE_STEP_MS);
        return () => window.clearInterval(timer);
    }, [phase, runId]);

    const parsed = React.useMemo(() => parseGithubUrlClient(url), [url]);

    const hint = parsed
        ? parsed.kind === "gist"
            ? `Gist ${parsed.gistId} — its files will be written into a new folder.`
            : `Repository ${parsed.owner}/${parsed.repo}${
                parsed.ref ? ` — ref ${parsed.ref}` : " — default branch"
            }${parsed.subpath ? ` — subpath ${parsed.subpath}` : ""}.`
        : url.trim()
            ? "Not a GitHub repository or gist URL yet."
            : "";

    const pushRecent = (entry: RecentImport) => {
        setRecents((prev) => {
            const next = [entry, ...(prev ?? [])]
                // Newest occurrence of a URL wins; order stays recency-first.
                .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
                .slice(0, RECENTS_MAX);
            try {
                window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
            } catch {
                /* quota — keep them for this session only */
            }
            return next;
        });
    };

    const doImport = async () => {
        if (!parsed || phase === "running") return;
        setRunId((n) => n + 1);
        setPhase("running");
        setError(null);
        setResult(null);
        try {
            const res = await fetch("/api/github-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    url: url.trim(),
                    mode: parsed.kind,
                    ref: parsed.kind === "repo" ? parsed.ref : undefined,
                    subpath: parsed.subpath,
                }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                folder?: string;
                name?: string;
                files?: number;
                url?: string;
                ref?: string;
                error?: string;
                offline?: boolean;
            };
            if (!res.ok || !data.ok || !data.folder) {
                throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), {
                    offline: data.offline === true,
                });
            }
            const done: ImportResult = {
                folder: data.folder,
                name: typeof data.name === "string" && data.name ? data.name : data.folder,
                files: typeof data.files === "number" ? data.files : 0,
                url: typeof data.url === "string" ? data.url : url.trim(),
                ref: typeof data.ref === "string" ? data.ref : undefined,
            };
            setResult(done);
            setPhase("done");
            pushRecent({url: url.trim(), folder: done.folder, time: Date.now()});
            toast({
                title: `Imported into ${done.name}`,
                description: `${done.files} file${done.files === 1 ? "" : "s"} from GitHub.`,
            });
        } catch (err) {
            const e = err as Error & { offline?: boolean };
            setError({message: e.message, offline: e.offline === true});
            setPhase("error");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Github className="size-4"/>
                        Import from GitHub
                    </DialogTitle>
                    <DialogDescription>
                        Fetch a public repository archive (or a gist) into a new folder in
                        the workspace.
                    </DialogDescription>
                </DialogHeader>

                {phase !== "done" && (
                    <>
                        {/* URL input + live detection hint */}
                        <div className="flex flex-col gap-1.5">
                            <Input
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && parsed && phase !== "running") {
                                        e.preventDefault();
                                        void doImport();
                                    }
                                }}
                                placeholder="https://github.com/owner/repo"
                                aria-label="GitHub repository or gist URL"
                                className="h-9 text-xs"
                                spellCheck={false}
                                disabled={phase === "running"}
                            />
                            {hint && (
                                <p className="px-1 text-[11px] text-muted-foreground" aria-live="polite">
                                    {hint}
                                </p>
                            )}
                            {parsed?.subpath && (
                                <p className="px-1 text-[11px] text-muted-foreground">
                                    Import only the subpath{" "}
                                    <span className="font-mono">{parsed.subpath}</span> — the rest of
                                    the repository is skipped.
                                </p>
                            )}
                        </div>

                        {/* Import button with staged progress */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                className="h-9 gap-1.5 text-xs"
                                disabled={!parsed || phase === "running"}
                                onClick={() => void doImport()}
                            >
                                {phase === "running" ? (
                                    <>
                                        <Loader2 className="size-3.5 animate-spin"/>
                                        {STAGE_LABEL[stage]}
                                    </>
                                ) : (
                                    <>
                                        <Github className="size-3.5"/>
                                        Import
                                    </>
                                )}
                            </Button>
                            {phase === "running" && (
                                <span className="text-[11px] text-muted-foreground">
                  Large archives can take a moment…
                </span>
                            )}
                        </div>

                        {/* error card — offline gets its own clean state */}
                        {phase === "error" && error && (
                            <div className="text-xs" role="alert">
                                {error.offline ? (
                                    <div
                                        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                        <WifiOff className="size-4 shrink-0 translate-y-0.5"/>
                                        <div className="flex flex-col gap-0.5">
                                            <p className="font-medium">
                                                GitHub unreachable — check your network.
                                            </p>
                                            <p className="break-words text-amber-800/80 dark:text-amber-300/80">
                                                {error.message}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                                        <AlertCircle className="size-4 shrink-0 translate-y-0.5"/>
                                        <p className="break-words">{error.message}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* recent imports */}
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                Recent imports
                            </p>
                            {recents === null ? (
                                <div className="flex flex-col gap-1.5" aria-label="Loading recent imports">
                                    {[0, 1].map((i) => (
                                        <Skeleton key={i} className="h-8 w-full"/>
                                    ))}
                                </div>
                            ) : recents.length === 0 ? (
                                <p className="px-1 text-[11px] text-muted-foreground">
                                    Imports you make appear here for quick re-use.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1">
                                    {recents.map((r) => (
                                        <li key={r.url}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-accent"
                                                onClick={() => {
                                                    setUrl(r.url);
                                                    setPhase("idle");
                                                    setError(null);
                                                }}
                                                title={`Use ${r.url} again`}
                                                aria-label={`Fill the URL field with ${r.url}`}
                                            >
                                                <History className="size-3 shrink-0 text-muted-foreground"/>
                                                <span
                                                    className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                          {r.url}
                        </span>
                                                <span className="shrink-0 text-muted-foreground">
                          {relativeTime(r.time)}
                        </span>
                                                <span className="max-w-24 shrink-0 truncate">
                          {deslugName(r.folder)}
                        </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </>
                )}

                {/* success state */}
                {phase === "done" && result && (
                    <div
                        className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-50 px-4 py-4 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                        role="status"
                    >
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="size-4 shrink-0 translate-y-0.5"/>
                            <div className="flex flex-col gap-1">
                                <p className="font-medium">
                                    Imported into <span className="font-mono">{result.name}</span>
                                </p>
                                <p className="break-all text-emerald-800/80 dark:text-emerald-300/80">
                                    {result.files} file{result.files === 1 ? "" : "s"}
                                    {result.ref ? ` from ${result.ref}` : ""} — {result.url}
                                </p>
                            </div>
                        </div>
                        <p className="text-[11px] text-emerald-800/70 dark:text-emerald-300/70">
                            Reload from source later: the folder keeps a{" "}
                            <span className="font-mono">.praxis/source.json</span> note of
                            where it came from.
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => onImported?.(result.folder, result.files)}
                            >
                                Done
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                    setPhase("idle");
                                    setResult(null);
                                }}
                            >
                                Import another…
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter className="text-[10px] text-muted-foreground">
                    Shallow import — file contents only, no git history. Archives are
                    capped at 100 MB / 5000 files.
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
