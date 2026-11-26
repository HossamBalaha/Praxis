"use client";

import * as React from "react";
import {GitCompare, Loader2, RotateCw, Sparkles, TriangleAlert, Wrench,} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {getActiveChatProvider, loadSettings} from "@/lib/settings";
import {readPersistedSampling} from "@/lib/ai-shared";
import {
    type DiffHunk,
    diffHunkList,
    matchProjectFilePath,
    type ProjectTreeFolder,
    spliceHunkFix,
    splitDiffFileSections,
} from "@/lib/ai-chat-utils";
import {toast} from "@/hooks/use-toast";

/**
 * ai-review-dialog.tsx — the "AI Code Review" modal.
 *
 * Sends the current unified diff to POST /api/ai-chat (the same SSE
 * proxy the chat sidebar and inline-ai-chat use) with a review prompt
 * that demands STRICT JSON, parses the response defensively and renders
 * one card per comment with a severity badge, the hunk context and an
 * "Apply fix" button.
 *
 * Applying a fix ANCHORS the hunk first: the hunk's file is resolved
 * from the diff's per-file headers (matchProjectFilePath against the
 * /api/folders tree), fetched via /api/file, the hunk's NEW-side lines
 * (context + added — what the working tree now holds) are located in
 * the content (header line anchor, then an exact text search for drift)
 * and the fixed text is SPLICED in place of the hunk's added lines. The
 * spliced whole-file content rides the third `onApplyFix` argument
 * (AiReviewFixPayload.fullContent) so the host can swap the editor
 * buffer through the editor's own edit path (deep-undo preserved — the
 * same route "Apply to file" in the chat sidebar uses). When the hunk
 * cannot be anchored (drift / file not in the tree) the dialog falls
 * back to the legacy append payload + an inline warning, and this
 * component never writes files itself.
 */

// ─── types ──────────────────────────────────────────────────────────

type ReviewSeverity = "bug" | "style" | "test" | "perf" | "security";

interface ReviewComment {
    /** 0-based hunk index (counted from the first @@ header). */
    hunk: number;
    severity: ReviewSeverity;
    title: string;
    detail: string;
    suggestion: string;
}

/** The payload an "Apply fix" hands the host. The first two arguments
 *  of onApplyFix keep the legacy (hunkIndex, fixedCode) shape — hosts
 *  that ignore the third argument behave exactly as before (the fixed
 *  code is appended). The third argument carries the anchored splice:
 *  hosts that read it should swap the editor buffer to fullContent
 *  through the editor's own edit path (CodeViewer.replaceBuffer — the
 *  deep-undo-preserving route the chat sidebar's "Apply to file" uses),
 *  which is what "replace the hunk in place" means end-to-end. */
export interface AiReviewFixPayload {
    /** 0-based hunk index the fix came from. */
    hunkIndex: number;
    /** The AI's replacement for the hunk's ADDED lines (legacy 2nd arg). */
    fixedCode: string;
    /** Repo-relative path of the file the hunk belongs to (from the
     *  diff's per-file headers; null when the diff carried none). */
    path: string | null;
    /** Resolved folder/file slugs + display name — the exact addressing
     *  /api/file (and every editor route) uses; present only when the
     *  path matched a file in the project tree. */
    folderSlug?: string;
    fileSlug?: string;
    fileName?: string;
    /** The WHOLE file content with the fix spliced in place of the hunk's
     *  added lines. Null = the hunk could not be anchored → the host
     *  should fall back to appending fixedCode (the legacy behavior). */
    fullContent: string | null;
    /** 1-based line the anchored replacement starts at (informational —
     *  lets the host scroll there after applying). */
    startLine?: number;
    /** True when the fix could NOT be anchored (drift / unresolved file)
     *  — the dialog shows the inline "appended instead" warning. */
    unanchored: boolean;
}

/** Split a unified diff into hunks at the @@ headers. Pure — exported
 *  for host reuse. Lines before the first @@ header (diff --git /
 *  index / --- / +++) are dropped: hunk indices are 0-based from the
 *  first real hunk, matching the numbers the reviewer is told to emit.
 *  Implemented over splitDiffFileSections (which keeps the per-file
 *  paths) so the flat index and the per-file sections can never drift
 *  apart. */
export function splitDiffHunks(diff: string): DiffHunk[] {
    return diffHunkList(diff);
}

// ─── prompts ─────────────────────────────────────────────────────────

/** Diff text cap inside the review prompt (spec contract). The head is
 *  kept — the retained hunks keep their 0-based indices. NOTE: the
 *  /api/ai-chat route additionally caps a single message at its own
 *  server-side limit (keeps the tail); that is the route's documented
 *  behavior, not something this dialog can widen. */
const MAX_DIFF_CHARS = 40_000;
/** Defensive cap on parsed comments. */
const MAX_COMMENTS = 30;

const REVIEW_PROMPT = (fileName: string, diff: string): string =>
    `You are a senior code reviewer. Review the following unified diff of ${fileName}. Return STRICT JSON: {"comments":[{"hunk":<0-based hunk index>,"severity":"bug"|"style"|"test"|"perf"|"security","title":"...","detail":"...","suggestion":"..."}]} only — no prose outside JSON.

Unified diff:
${
        diff.length > MAX_DIFF_CHARS
            ? `${diff.slice(0, MAX_DIFF_CHARS)}\n... (diff truncated)`
            : diff
    }`;

const FIX_PROMPT = (
    fileName: string,
    comment: ReviewComment,
    hunk: DiffHunk
): string =>
    `You are a senior code reviewer applying ONE fix to a unified diff of ${fileName}. Rewrite ONLY the ADDED lines (the lines starting with "+", excluding the "+++" header) of the hunk below so the reviewer's concern is resolved. Return ONLY the replacement code as plain text — no markdown fences, no diff markers (+/-), no explanations.

Hunk header: ${hunk.header}
Hunk lines:
${hunk.lines.join("\n")}

Reviewer comment (severity: ${comment.severity}): ${comment.title}
${comment.detail}
${
        comment.suggestion
            ? `Suggestion: ${comment.suggestion}`
            : ""
    }`;

// ─── /api/ai-chat request helper ────────────────────────────────────

/** POST /api/ai-chat and return the full assistant text. Mirrors the
 *  SSE parse loop of inline-ai-chat.tsx (buffer + "\n\n" split + CRLF
 *  normalize + `data:` line extraction; {"error"} events throw;
 *  choices[0].delta.content accumulates; [DONE] terminates). */
async function requestAiChatText(
    userContent: string,
    signal: AbortSignal
): Promise<string> {
    // Resolve the active chat provider at SEND time (Settings → AI →
    // Chat model providers) + the sidebar's persisted tuning knobs.
    const chatProvider = getActiveChatProvider(loadSettings());
    const sampling = readPersistedSampling();

    const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            messages: [{role: "user" as const, content: userContent}],
            ...(chatProvider
                ? {
                    provider: {
                        kind: chatProvider.kind,
                        baseUrl: chatProvider.baseUrl,
                        apiKey: chatProvider.apiKey,
                        model: chatProvider.model,
                        ...(sampling ? {sampling} : {}),
                    },
                }
                : {}),
        }),
        signal,
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed with status ${res.status}`);
    }
    if (!res.body) {
        throw new Error("The AI service returned no response stream.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let text = "";

    const applyEvent = (data: string): boolean => {
        if (data === "[DONE]") return true; // stream done
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            return false; // ignore non-JSON chunk
        }
        if (parsed && typeof parsed === "object" && "error" in parsed) {
            const errMsg = (parsed as { error?: unknown }).error;
            throw new Error(
                typeof errMsg === "string"
                    ? errMsg
                    : "The AI service returned an error."
            );
        }
        const delta: string =
            (parsed as { choices?: Array<{ delta?: { content?: string } }> })
                ?.choices?.[0]?.delta?.content ?? "";
        if (delta) text += delta;
        return false;
    };

    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, {stream: true});
        let sepIdx: number;
        while ((sepIdx = sseBuffer.indexOf("\n\n")) >= 0) {
            const rawEvent = sseBuffer.slice(0, sepIdx);
            sseBuffer = sseBuffer.slice(sepIdx + 2);
            if (!rawEvent) continue;
            // Normalize CRLF → LF and extract `data:` lines.
            const lines = rawEvent.replace(/\r\n/g, "\n").split("\n");
            const dataLines = lines
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length === 0) continue;
            if (applyEvent(dataLines.join("\n"))) return text;
        }
    }

    // Flush a final partial event some SDKs/proxies leave without a
    // trailing blank line.
    const tail = sseBuffer.trim();
    if (tail) {
        const lines = tail.replace(/\r\n/g, "\n").split("\n");
        const dataLines = lines
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).replace(/^ /, ""));
        if (dataLines.length > 0) applyEvent(dataLines.join("\n"));
    }
    return text;
}

// ─── defensive parsing ──────────────────────────────────────────────

/** Unknown-narrow one severity; unrecognized values fall back to the
 *  neutral "style" bucket so the comment still renders. */
function narrowSeverity(v: unknown): ReviewSeverity {
    return v === "bug" || v === "style" || v === "test" || v === "perf" || v === "security"
        ? v
        : "style";
}

function capString(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v.length > max ? `${v.slice(0, max)}…` : v;
}

/** Extract the first {...} block, JSON.parse, unknown-narrow every
 *  field and cap the list at MAX_COMMENTS. Returns null when no JSON
 *  object is recoverable (rendered as the error state); an empty array
 *  is a valid "reviewer found nothing" answer. */
function parseReviewComments(raw: string): ReviewComment[] | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const commentsRaw = (parsed as { comments?: unknown }).comments;
    if (!Array.isArray(commentsRaw)) return null;
    const out: ReviewComment[] = [];
    for (const item of commentsRaw) {
        if (!item || typeof item !== "object") continue;
        const c = item as Record<string, unknown>;
        const hunk =
            typeof c.hunk === "number"
                ? c.hunk
                : typeof c.hunk === "string" && c.hunk.trim() !== ""
                    ? Number(c.hunk)
                    : Number.NaN;
        if (!Number.isInteger(hunk) || hunk < 0) continue;
        const title = capString(c.title, 200);
        const detail = capString(c.detail, 2000);
        const suggestion = capString(c.suggestion, 4000);
        if (!title && !detail) continue; // nothing displayable
        out.push({
            hunk,
            severity: narrowSeverity(c.severity),
            title,
            detail,
            suggestion,
        });
        if (out.length >= MAX_COMMENTS) break;
    }
    return out;
}

/** Strip a single markdown fence the model may have added despite the
 *  "no fences" instruction. */
function stripCodeFences(text: string): string {
    const t = text.trim();
    const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(t);
    return (fenced ? fenced[1] : t).trim();
}

// ─── severity badge styles ───────────────────────────────────────────

const SEVERITY_STYLES: Record<ReviewSeverity, string> = {
    bug: "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
    // security renders as the red-outline variant of the badge.
    security: "border-red-500/40 text-red-600 dark:text-red-400",
    style: "border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400",
    test: "border-transparent bg-violet-500/15 text-violet-600 dark:text-violet-400",
    perf: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

/** First context lines shown next to the hunk chip (header + the first
 *  non-empty hunk line, one-line truncated). */
function hunkPreview(hunk: DiffHunk): string {
    const first = hunk.lines.find((l) => l.trim().length > 0) ?? "";
    return `${hunk.header}  ${first}`.trim();
}

// ─── component ──────────────────────────────────────────────────────

export interface AiReviewDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    /** File the diff belongs to (header display + prompts). */
    fileName: string;
    /** Unified diff text of the pending change. */
    diff: string;
    /** Host hook — receives the AI's replacement for the hunk's ADDED
     *  lines plus (as the third argument) the anchored splice payload:
     *  fullContent = the whole file with the fix replacing the hunk's
     *  added lines in place (swap the editor buffer with it, ideally
     *  through CodeViewer.replaceBuffer so deep-undo keeps working);
     *  fullContent = null → anchor drift, append fixedCode instead (the
     *  legacy behavior — hosts that ignore the third argument always
     *  get exactly that). This dialog never writes files itself. */
    onApplyFix: (
        hunkIndex: number,
        fixedHunkCode: string,
        fix?: AiReviewFixPayload
    ) => void;
}

export function AiReviewDialog({
                                   open,
                                   onOpenChange,
                                   fileName,
                                   diff,
                                   onApplyFix,
                               }: AiReviewDialogProps) {
    type Status = "idle" | "streaming" | "done" | "error";
    const [status, setStatus] = React.useState<Status>("idle");
    const [comments, setComments] = React.useState<ReviewComment[]>([]);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    /** Hunk index of the fix request currently in flight (null = none). */
    const [fixing, setFixing] = React.useState<number | null>(null);
    /** Hunk indices whose fix could NOT be anchored (drift) — each card
     *  shows the inline "appended instead" warning until the next re-run. */
    const [unanchored, setUnanchored] = React.useState<Record<number, boolean>>({});

    const reviewAbortRef = React.useRef<AbortController | null>(null);
    const fixAbortRef = React.useRef<AbortController | null>(null);
    /** /api/folders tree cache (fetched once on the first Apply fix — the
     *  path→folder/file resolution needs it; matchProjectFilePath is the
     *  pure matcher). */
    const treeRef = React.useRef<ProjectTreeFolder[] | null>(null);

    const hunks = React.useMemo(() => splitDiffHunks(diff), [diff]);
    /** Per-file sections of the (possibly multi-file) diff — each hunk
     *  knows which file it belongs to via the `+++ b/<path>` headers. */
    const sections = React.useMemo(() => splitDiffFileSections(diff), [diff]);

    /** (section path, hunk) for a flat 0-based hunk index — the same
     *  indexing the reviewer prompt specifies (across ALL files). */
    const locateHunk = React.useCallback(
        (hunkIndex: number): { path: string | null; hunk: DiffHunk | null } => {
            let i = 0;
            for (const section of sections) {
                for (const hunk of section.hunks) {
                    if (i === hunkIndex) return {path: section.path, hunk};
                    i++;
                }
            }
            return {path: null, hunk: null};
        },
        [sections]
    );

    /** Fetch (and cache) the explorer's folder tree — the /api/folders
     *  route the sidebar's @ popup and the explorer both read. */
    const fetchProjectTree = React.useCallback(async (): Promise<ProjectTreeFolder[]> => {
        if (treeRef.current) return treeRef.current;
        try {
            const res = await fetch("/api/folders");
            const data = (await res.json()) as { folders?: ProjectTreeFolder[] };
            if (res.ok && Array.isArray(data.folders)) {
                treeRef.current = data.folders;
                return data.folders;
            }
        } catch {
            /* tree unavailable — path resolution fails → unanchored */
        }
        return [];
    }, []);

    /** Fetch one file's current text via /api/file (the raw-text route
     *  FileViewer / page.tsx use — works for every file kind). */
    const fetchFileContent = React.useCallback(
        async (folderSlug: string, fileSlug: string): Promise<string | null> => {
            try {
                const res = await fetch(
                    `/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                );
                if (!res.ok) return null;
                return await res.text();
            } catch {
                return null;
            }
        },
        []
    );

    /** Anchor the fix: resolve the hunk's file, fetch its current content
     *  and splice the fixed text in place of the hunk's ADDED lines
     *  (spliceHunkFix — header line anchor first, exact text search as the
     *  drift fallback). Returns the payload for onApplyFix; fullContent
     *  null = unanchored (the host appends fixedCode instead). */
    const buildFixPayload = React.useCallback(
        async (
            hunkIndex: number,
            fixedCode: string,
            hunk: DiffHunk,
            path: string | null
        ): Promise<AiReviewFixPayload> => {
            const unanchored: AiReviewFixPayload = {
                hunkIndex,
                fixedCode,
                path,
                fullContent: null,
                unanchored: true,
            };
            if (!path || path === "unknown") return unanchored;
            const tree = await fetchProjectTree();
            if (tree.length === 0) return unanchored;
            const match = matchProjectFilePath(path, tree);
            if (!match) return unanchored;
            const content = await fetchFileContent(match.folderSlug, match.fileSlug);
            if (content == null) return unanchored;
            const spliced = spliceHunkFix(content, hunk, fixedCode);
            if (spliced == null) return unanchored;
            return {
                hunkIndex,
                fixedCode,
                path,
                folderSlug: match.folderSlug,
                fileSlug: match.fileSlug,
                fileName: match.fileName,
                fullContent: spliced.content,
                startLine: spliced.startLine,
                unanchored: false,
            };
        },
        [fetchProjectTree, fetchFileContent]
    );

    const runReview = React.useCallback(async (): Promise<void> => {
        reviewAbortRef.current?.abort();
        const controller = new AbortController();
        reviewAbortRef.current = controller;
        setStatus("streaming");
        setComments([]);
        setErrorMsg(null);
        // a fresh review invalidates the per-hunk anchor warnings.
        setUnanchored({});
        try {
            const text = await requestAiChatText(
                REVIEW_PROMPT(fileName, diff),
                controller.signal
            );
            const parsed = parseReviewComments(text);
            if (parsed === null) {
                throw new Error("The AI response was not valid JSON — re-run the review.");
            }
            setComments(parsed);
            setStatus("done");
        } catch (err) {
            // Superseded by a re-run, or the dialog closed — no error surface.
            if (err instanceof DOMException && err.name === "AbortError") return;
            setErrorMsg(
                err instanceof Error ? err.message : "The AI review failed."
            );
            setStatus("error");
        } finally {
            if (reviewAbortRef.current === controller) reviewAbortRef.current = null;
        }
    }, [fileName, diff]);

    // On open (when the diff is non-empty) run the review; abort both
    // in-flight streams on close/unmount so nothing keeps burning tokens
    // while the dialog is hidden.
    React.useEffect(() => {
        if (!open || !diff.trim()) return;
        void runReview();
        return () => {
            reviewAbortRef.current?.abort();
            reviewAbortRef.current = null;
            fixAbortRef.current?.abort();
            fixAbortRef.current = null;
        };
    }, [open, diff, fileName, runReview]);

    const applyFix = React.useCallback(
        async (comment: ReviewComment): Promise<void> => {
            if (status === "streaming" || fixing !== null) return;
            const hunk = hunks[comment.hunk];
            if (!hunk) {
                toast({
                    title: "Apply fix failed",
                    description: `Hunk #${comment.hunk} was not found in the diff.`,
                    variant: "destructive",
                });
                return;
            }
            fixAbortRef.current?.abort();
            const controller = new AbortController();
            fixAbortRef.current = controller;
            setFixing(comment.hunk);
            try {
                const text = await requestAiChatText(
                    FIX_PROMPT(fileName, comment, hunk),
                    controller.signal
                );
                const code = stripCodeFences(text);
                if (!code) throw new Error("The AI returned an empty fix.");
                // Anchor the hunk in its file and splice the fixed text in place
                // of the ADDED lines. buildFixPayload resolves the hunk's file
                // (per-file diff headers → /api/folders tree → /api/file), then
                // spliceHunkFix replaces the added lines; any failure along the
                // way degrades to the unanchored payload (legacy append).
                const {path} = locateHunk(comment.hunk);
                const fix = await buildFixPayload(comment.hunk, code, hunk, path);
                onApplyFix(comment.hunk, code, fix);
                if (fix.fullContent != null) {
                    toast({
                        title: "Fix applied in place",
                        description: `Hunk #${comment.hunk} anchored at ${fix.path ?? "the file"}:${fix.startLine ?? "?"} — the fixed hunk replaces the added lines.`,
                        variant: "success",
                    });
                } else {
                    // Drift — the legacy append path; the card shows the warning.
                    setUnanchored((prev) => ({...prev, [comment.hunk]: true}));
                    toast({
                        title: "Fix sent — not anchored",
                        description: "Could not anchor this fix in the file — appended instead.",
                        variant: "warning",
                    });
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                toast({
                    title: "Apply fix failed",
                    description:
                        err instanceof Error ? err.message : "The AI fix request failed.",
                    variant: "destructive",
                });
            } finally {
                setFixing(null);
                if (fixAbortRef.current === controller) fixAbortRef.current = null;
            }
        },
        [status, fixing, hunks, fileName, onApplyFix, locateHunk, buildFixPayload]
    );

    const busy = status === "streaming" || fixing !== null;

    const body = !diff.trim() ? (
        // Empty diff → centered empty state.
        <div className="flex min-h-40 items-center justify-center p-6">
            <div className="max-w-sm rounded-lg border bg-background p-6 text-center shadow-sm">
                <GitCompare className="mx-auto size-6 text-muted-foreground"/>
                <p className="mt-3 text-xs text-muted-foreground">
                    No changes to review — the diff is empty.
                </p>
            </div>
        </div>
    ) : status === "streaming" || status === "idle" ? (
        // Streaming "reviewing…" skeleton list.
        <div className="space-y-2 p-1" aria-label="Reviewing the diff">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin"/>
                Reviewing the diff…
            </div>
            {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-14"/>
                        <Skeleton className="h-4 w-32"/>
                    </div>
                    <Skeleton className="h-3 w-full"/>
                    <Skeleton className="h-3 w-2/3"/>
                </div>
            ))}
        </div>
    ) : status === "error" ? (
        // Error card with retry.
        <div className="p-1">
            <div
                className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
                <TriangleAlert className="size-6 text-red-500"/>
                <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                <Button size="sm" variant="outline" onClick={() => void runReview()}>
                    <RotateCw className="size-3.5"/>
                    Retry
                </Button>
            </div>
        </div>
    ) : comments.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center p-6">
            <div className="max-w-sm rounded-lg border bg-background p-6 text-center shadow-sm">
                <GitCompare className="mx-auto size-6 text-muted-foreground"/>
                <p className="mt-3 text-xs text-muted-foreground">
                    No comments — the reviewer found nothing to flag in this diff.
                </p>
            </div>
        </div>
    ) : (
        comments.map((comment, i) => {
            const hunk = hunks[comment.hunk] ?? null;
            const cardFixing = fixing === comment.hunk;
            const filePath = locateHunk(comment.hunk).path;
            return (
                <article
                    key={`${comment.hunk}-${i}`}
                    className="space-y-2 rounded-lg border p-3"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn("shrink-0 capitalize", SEVERITY_STYLES[comment.severity])}
                        >
                            {comment.severity}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {comment.title || "(untitled)"}
            </span>
                    </div>
                    {comment.detail && (
                        <p className="break-words whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {comment.detail}
                        </p>
                    )}
                    {comment.suggestion && (
                        <div className="rounded-md bg-muted/40 p-2">
                            <p className="break-words whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
                                {comment.suggestion}
                            </p>
                        </div>
                    )}
                    {unanchored[comment.hunk] && (
                        <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                            <TriangleAlert className="size-3.5 shrink-0" aria-hidden/>
                            Could not anchor this fix — appended instead.
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge
                            variant="outline"
                            className="shrink-0 font-mono text-[10px] text-muted-foreground"
                        >
                            Hunk #{comment.hunk}
                        </Badge>
                        {filePath && filePath !== "unknown" && (
                            <span
                                className="shrink-0 max-w-[45%] truncate font-mono text-[10px] text-muted-foreground"
                                title={`Hunk #${comment.hunk} belongs to ${filePath}`}
                            >
                {filePath}
              </span>
                        )}
                        {hunk && (
                            <pre
                                className="min-w-0 flex-1 truncate rounded bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                                title={hunkPreview(hunk)}
                                aria-label={`Hunk ${comment.hunk} context`}
                            >
                {hunkPreview(hunk)}
              </pre>
                        )}
                        <Button
                            size="sm"
                            variant="default"
                            onClick={() => void applyFix(comment)}
                            disabled={busy}
                            className="ml-auto shrink-0 gap-1.5 text-xs"
                            aria-label={`Apply AI fix to hunk ${comment.hunk}`}
                            title="Ask the AI for the fixed hunk, anchor it in the file, and hand the spliced result to the host"
                        >
                            {cardFixing ? (
                                <Loader2 className="size-3.5 animate-spin"/>
                            ) : (
                                <Wrench className="size-3.5"/>
                            )}
                            {cardFixing ? "Fixing…" : "Apply fix"}
                        </Button>
                    </div>
                </article>
            );
        })
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                        <Sparkles className="size-4 shrink-0 text-amber-500" aria-hidden/>
                        <span className="truncate">AI Code Review</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
              {fileName}
            </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
              {status === "done" && (
                  <Badge variant="secondary" className="text-[10px]">
                      {comments.length}{' '}
                      {comments.length === 1 ? "comment" : "comments"}
                  </Badge>
              )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void runReview()}
                                disabled={!diff.trim() || busy}
                                className="gap-1.5 text-xs"
                                aria-label="Re-run the AI review"
                                title="Re-run the AI review"
                            >
                {status === "streaming" ? (
                    <Loader2 className="size-3.5 animate-spin"/>
                ) : (
                    <RotateCw className="size-3.5"/>
                )}
                                Re-run
              </Button>
            </span>
                    </DialogTitle>
                    <DialogDescription>
                        {!diff.trim()
                            ? "Nothing to review — the diff is empty."
                            : status === "streaming"
                                ? "Streaming the review from the AI provider…"
                                : `${hunks.length} ${
                                    hunks.length === 1 ? "hunk" : "hunks"
                                } in the diff — comments map to hunk indices.`}
                    </DialogDescription>
                </DialogHeader>

                <div
                    className="flex-1 min-h-0 space-y-2 overflow-y-auto px-1 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent">
                    {body}
                </div>
            </DialogContent>
        </Dialog>
    );
}
