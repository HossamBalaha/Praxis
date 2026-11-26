"use client";

import * as React from "react";
import {Bot, CheckCheck, CircleAlert, FileCode2, Loader2, RotateCw, TriangleAlert, XCircle,} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {Skeleton} from "@/components/ui/skeleton";
import {Textarea} from "@/components/ui/textarea";
import {cn} from "@/lib/utils";
import {getActiveChatProvider, loadSettings} from "@/lib/settings";
import {readPersistedSampling} from "@/lib/ai-shared";
import {useToast} from "@/hooks/use-toast";
import {FileDiffPreview} from "@/components/file-diff-preview";
import {decodeSlug} from "@/lib/slug-codec";
import {
    type AgentEditAction,
    type AgentPlanEdit,
    type AgentPlanStep,
    applyEdit,
    encodeSlug,
    planLabel,
} from "@/lib/agent-mode";
import {armMultiFileUndoHotkey} from "@/lib/multi-file-undo-hotkey";
import {type MultiFileUndoEntry, pushMultiFileUndoGroup} from "@/lib/multi-file-undo";

/**
 * agent-mode-dialog.tsx — "Agent Mode": multi-file AI edits with a step
 * plan and per-file approvals.
 *
 * Flow:
 *   1. the user types a task ("add logging to every API route") and hits
 *      "Plan changes" — POST /api/agent-plan (folder + provider payload,
 *      the SAME provider resolution the ai-review-dialog uses) returns
 *      { steps, edits, notes };
 *   2. steps render as a numbered list; every edit renders as a card
 *      with an action badge, a read-only word-level diff
 *      (FileDiffPreview — the light per-file preview component) and an
 *      Approve/Reject toggle (default Approved) + Approve all / Reject
 *      all;
 *   3. "Apply N change(s)":
 *        - reads the CURRENT content of every approved edit's file
 *          (GET /api/code for .py — the same folder/file slug params the
 *          other readers use; /api/file for the other text kinds);
 *        - verifies each `original` still matches EXACTLY (applyEdit's
 *          drift check — a snippet that moved/changed marks the card
 *          "drifted — file changed since planning" and is skipped);
 *        - for "create" the file must NOT exist yet (an existing file
 *          marks the card skipped);
 *        - pushes ONE multi-file undo group covering every file of this
 *          apply BEFORE the first write (single Ctrl+Z restores the
 *          whole batch), then writes sequentially through
 *          POST /api/file-write exactly like the rename/find-replace
 *          flows;
 *        - fires "praxis:refresh-folders" + "praxis:agent-applied",
 *          toasts the applied/skipped summary and calls onApplied so
 *          the host can refresh.
 *
 * Cancel closes at any point; "Re-plan" re-runs the planner on the
 * current task text.
 */

/* ─── types ────────────────────────────────────────────────────────── */

/** What /api/agent-plan replies with (already normalized server-side). */
interface AgentPlanResponse {
    folder?: string;
    steps?: AgentPlanStep[];
    edits?: AgentPlanEdit[];
    notes?: string;
    droppedEdits?: number;
}

interface LoadedPlan {
    steps: AgentPlanStep[];
    edits: AgentPlanEdit[];
    notes: string;
    droppedEdits: number;
}

export interface AgentApplySummary {
    /** Approved edits that landed on disk. */
    applied: number;
    /** Approved edits skipped (drift / file-exists / write failure). */
    skipped: number;
    /** Subset of applied that created new files. */
    created: number;
}

export interface AgentModeDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    /** Target folder SLUG (the explorer's current folder; the root
     *  folder's "." sentinel rides the same slug machinery). */
    folder: string;
    /** Host hook after an apply pass (also covered by the
     *  "praxis:agent-applied" window event for hosts that prefer events). */
    onApplied?: (summary: AgentApplySummary) => void;
}

/** Per-edit outcome of the apply pass (rendered as a status chip). */
type EditStatus = "applied" | "drift" | "exists" | "error";

/* ─── helpers ──────────────────────────────────────────────────────── */

/**
 * Read one file's CURRENT text right before the apply pass.
 * .py files ride GET /api/code (JSON { content }) with the same
 * folder/file slug params every other reader uses; other text kinds
 * ride GET /api/file (raw bytes → text, the project-search pattern).
 * Returns null when the file cannot be read or does not exist — the
 * apply treats that as "missing" (creates proceed, modifies fail).
 */
async function fetchCurrentContent(
    folderSlug: string,
    fileSlug: string,
    relPath: string
): Promise<string | null> {
    const url = (route: string) =>
        `/api/${route}?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
    try {
        if (relPath.toLowerCase().endsWith(".py")) {
            const res = await fetch(url("code"));
            if (res.ok) {
                const data = (await res.json().catch(() => null)) as { content?: string } | null;
                if (data && typeof data.content === "string") return data.content;
            }
            // fall through to /api/file when /api/code missed — the .py file
            // vanished or the plan's path slipped a non-py extension through.
        }
        const res = await fetch(url("file"));
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

/** Badge classes per action (mirrors ai-review-dialog's severity styles). */
const ACTION_STYLES: Record<AgentEditAction, string> = {
    modify: "border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400",
    create: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const STATUS_META: Record<EditStatus, { label: string; className: string }> = {
    applied: {
        label: "applied",
        className: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    drift: {
        label: "drifted — file changed since planning",
        className: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    exists: {
        label: "skipped — file already exists",
        className: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    error: {
        label: "failed — check the toast",
        className: "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
    },
};

/* ─── component ─────────────────────────────────────────────────────── */

export function AgentModeDialog({
                                    open,
                                    onOpenChange,
                                    folder,
                                    onApplied,
                                }: AgentModeDialogProps) {
    const {toast} = useToast();

    const [task, setTask] = React.useState("");
    const [planning, setPlanning] = React.useState(false);
    const [plan, setPlan] = React.useState<LoadedPlan | null>(null);
    const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
    /** Indices of APPROVED edits (default: every edit approved). */
    const [approved, setApproved] = React.useState<Set<number>>(new Set());
    /** Per-edit outcome once an apply pass has run. */
    const [statuses, setStatuses] = React.useState<Record<number, EditStatus>>({});
    const [applying, setApplying] = React.useState(false);
    const [result, setResult] = React.useState<AgentApplySummary | null>(null);

    const planAbortRef = React.useRef<AbortController | null>(null);

    const folderName = React.useMemo(() => decodeSlug(folder), [folder]);
    const approvedCount = plan ? plan.edits.filter((_, i) => approved.has(i)).length : 0;
    const busy = planning || applying;

    // Fresh planning session on every open — the previous plan's snippets
    // are stale by definition. Abort the in-flight plan fetch on close
    // (the ai-review-dialog pattern) so nothing burns tokens while
    // hidden. The task TEXT survives a close/reopen for convenience.
    React.useEffect(() => {
        if (open) {
            setPlan(null);
            setResult(null);
            setStatuses({});
            setApproved(new Set());
            setErrorMsg(null);
        } else {
            planAbortRef.current?.abort();
            planAbortRef.current = null;
        }
    }, [open]);

    /* ── Planning: POST /api/agent-plan with the active chat provider. ── */

    const runPlan = React.useCallback(async (): Promise<void> => {
        if (!folder || planning || applying || !task.trim()) return;
        planAbortRef.current?.abort();
        const controller = new AbortController();
        planAbortRef.current = controller;
        setPlanning(true);
        setErrorMsg(null);
        setResult(null);
        setStatuses({});
        try {
            // Resolve the active chat provider at SEND time (Settings → AI)
            // + the sidebar's persisted sampling knobs — the exact payload
            // shape ai-review-dialog sends to /api/ai-chat.
            const chatProvider = getActiveChatProvider(loadSettings());
            const sampling = readPersistedSampling();

            const res = await fetch("/api/agent-plan", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    task: task.trim(),
                    folder,
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
                signal: controller.signal,
            });
            const data = (await res.json().catch(() => null)) as
                | (AgentPlanResponse & { error?: unknown })
                | null;
            if (!res.ok || (data && typeof data.error === "string" && data.error)) {
                throw new Error(
                    data && typeof data.error === "string" && data.error
                        ? data.error
                        : `Request failed with status ${res.status}`
                );
            }
            const steps = Array.isArray(data?.steps) ? (data as AgentPlanResponse).steps! : [];
            const edits = Array.isArray(data?.edits) ? (data as AgentPlanResponse).edits! : [];
            if (steps.length === 0 && edits.length === 0) {
                throw new Error("The AI returned an empty plan — rephrase the task and retry.");
            }
            setPlan({
                steps,
                edits,
                notes: typeof data?.notes === "string" ? data.notes : "",
                droppedEdits: typeof data?.droppedEdits === "number" ? data.droppedEdits : 0,
            });
            // Default: every edit approved (the spec's "default Approved").
            setApproved(new Set(edits.map((_, i) => i)));
        } catch (err) {
            // Superseded by a re-run, or the dialog closed — no error surface.
            if (err instanceof DOMException && err.name === "AbortError") return;
            setErrorMsg(
                err instanceof Error ? err.message : "The agent plan request failed."
            );
        } finally {
            setPlanning(false);
            if (planAbortRef.current === controller) planAbortRef.current = null;
        }
    }, [folder, planning, applying, task]);

    /* ── Apply: read → drift-verify → ONE undo group → write. ────────── */

    const handleApply = React.useCallback(async (): Promise<void> => {
        if (!plan || applying || planning) return;
        const indices = plan.edits.map((_, i) => i).filter((i) => approved.has(i));
        if (indices.length === 0) return;
        setApplying(true);
        setErrorMsg(null);
        const results: Record<number, EditStatus> = {};
        try {
            // Group the approved edits by target path (plan order preserved
            // within a file — later edits apply to earlier edits' output).
            const groups = new Map<string, number[]>();
            for (const i of indices) {
                const p = plan.edits[i].path;
                const list = groups.get(p);
                if (list) list.push(i);
                else groups.set(p, [i]);
            }

            // ── Pass 1: read the live content + drift-verify + splice. ──
            // `current === null` means unreadable OR missing: creates then
            // proceed against "" (before === "" is the undo entry for a
            // created file), modifies mark themselves as failed.
            const writes: Array<{ path: string; before: string; after: string }> = [];
            for (const [path, idxs] of groups) {
                const fileSlug = encodeSlug(path);
                const current = await fetchCurrentContent(folder, fileSlug, path);
                // content accumulates the file's post-edit state ("" for a file
                // that does not exist yet — the create branch fills it in).
                let content = current ?? "";
                let changed = false;
                for (const i of idxs) {
                    const edit = plan.edits[i];
                    if (edit.action === "create") {
                        if (current !== null) {
                            // The plan's new file already exists — never clobber it.
                            results[i] = "exists";
                            continue;
                        }
                        content = edit.proposed;
                        changed = true;
                        results[i] = "applied";
                        continue;
                    }
                    if (current === null) {
                        results[i] = "error";
                        continue;
                    }
                    const r = applyEdit(content, edit);
                    if (r.ok) {
                        content = r.next;
                        changed = true;
                        results[i] = "applied";
                    } else {
                        // The snippet moved or changed since planning — skip this
                        // edit, never blind-write a stale replacement.
                        results[i] = "drift";
                    }
                }
                if (changed) {
                    writes.push({path, before: current ?? "", after: content});
                }
            }

            // ── ONE multi-file undo group BEFORE the first write — every
            // file this apply touches, pre-edit content captured in the read
            // pass, so a single Ctrl+Z restores the whole batch (the entry
            // shape mirrors the rename-preview / project-search call sites).
            const undoEntries: MultiFileUndoEntry[] = writes.map((w) => ({
                folderSlug: folder,
                fileSlug: encodeSlug(w.path),
                fileName: w.path,
                preContent: w.before,
            }));
            if (undoEntries.length > 0) {
                pushMultiFileUndoGroup({
                    label: `Agent: ${planLabel(task)}`,
                    entries: undoEntries,
                });
                armMultiFileUndoHotkey();
            }

            // ── Pass 2: sequential writes (the watcher-friendly pattern the
            // other multi-file flows use — no write stampede on the folder
            // cache). POST /api/file-write with { folder, fileName, content },
            // fileName being the RELATIVE path the route validates.
            const failedPaths = new Set<string>();
            for (const w of writes) {
                const res = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder, fileName: w.path, content: w.after}),
                });
                if (!res.ok) failedPaths.add(w.path);
            }
            // A failed write demotes that file's edits to "error" so the cards
            // and the summary stay honest.
            for (const i of indices) {
                if (results[i] === "applied" && failedPaths.has(plan.edits[i].path)) {
                    results[i] = "error";
                }
            }
            setStatuses(results);

            const applied = indices.filter((i) => results[i] === "applied").length;
            const created = indices.filter(
                (i) => results[i] === "applied" && plan.edits[i].action === "create"
            ).length;
            const skipped = indices.length - applied;
            const writtenFiles = writes.filter((w) => !failedPaths.has(w.path));
            setResult({applied, skipped, created});

            if (applied > 0) {
                // The page already listens for this one (explorer refresh); the
                // agent-specific event is the grep-able hook for hosts.
                window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
                window.dispatchEvent(
                    new CustomEvent("praxis:agent-applied", {
                        detail: {
                            applied,
                            skipped,
                            created,
                            files: writtenFiles.map((w) => w.path),
                        },
                    })
                );
            }
            toast({
                title: applied > 0 ? "Agent changes applied" : "No agent changes applied",
                description:
                    `Applied ${applied} of ${indices.length} change${
                        indices.length === 1 ? "" : "s"
                    } in ${writtenFiles.length} file${writtenFiles.length === 1 ? "" : "s"}.` +
                    (undoEntries.length > 0 && failedPaths.size === 0
                        ? " Ctrl+Z restores every touched file."
                        : "") +
                    (skipped > 0
                        ? ` ${skipped} change${skipped === 1 ? "" : "s"} skipped (drifted, existing or failed — see the cards).`
                        : "") +
                    (failedPaths.size > 0
                        ? ` ${failedPaths.size} write${failedPaths.size === 1 ? "" : "s"} failed (${[
                            ...failedPaths,
                        ]
                            .slice(0, 5)
                            .join(", ")}${failedPaths.size > 5 ? ", …" : ""}) — check them manually.`
                        : ""),
                variant: skipped > 0 || failedPaths.size > 0 ? "warning" : "success",
            });
            onApplied?.({applied, skipped, created});
        } catch (err) {
            toast({
                title: "Agent apply failed",
                description:
                    err instanceof Error ? err.message : "The apply pass failed unexpectedly.",
                variant: "destructive",
            });
        } finally {
            setApplying(false);
        }
    }, [plan, applying, planning, approved, folder, task, onApplied, toast]);

    /* ── Approval toggles. ─────────────────────────────────────────────── */

    const toggleEdit = React.useCallback(
        (i: number) => {
            setApproved((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
            });
        },
        []
    );

    const approveAll = React.useCallback(() => {
        if (!plan) return;
        setApproved(new Set(plan.edits.map((_, i) => i)));
    }, [plan]);

    const rejectAll = React.useCallback(() => {
        setApproved(new Set());
    }, []);

    /* ── Render helpers. ─────────────────────────────────────────────── */

    const renderEditCard = (edit: AgentPlanEdit, i: number) => {
        const isApproved = approved.has(i);
        const status = statuses[i];
        const statusMeta = status ? STATUS_META[status] : null;
        return (
            <article
                key={`${edit.path}-${i}`}
                className={cn("space-y-2 rounded-lg border p-3", !isApproved && "opacity-60")}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant="outline"
                        className={cn("shrink-0 capitalize", ACTION_STYLES[edit.action])}
                    >
                        {edit.action}
                    </Badge>
                    <span
                        className="min-w-0 flex-1 truncate font-mono text-xs font-medium"
                        title={edit.path}
                    >
            {edit.path}
          </span>
                    {statusMeta && (
                        <Badge variant="outline" className={cn("shrink-0", statusMeta.className)}>
                            {statusMeta.label}
                        </Badge>
                    )}
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                            checked={isApproved}
                            onCheckedChange={() => toggleEdit(i)}
                            disabled={busy || status !== undefined}
                            aria-label={`Approve changes to ${edit.path}`}
                        />
                        {isApproved ? "Approved" : "Rejected"}
                    </label>
                </div>
                {edit.description && (
                    <p className="break-words text-xs leading-relaxed text-muted-foreground">
                        {edit.description}
                    </p>
                )}
                <div className="overflow-hidden rounded-md border">
                    <FileDiffPreview
                        oldContent={edit.original}
                        newContent={edit.proposed}
                        className="max-h-64 overflow-y-auto"
                    />
                </div>
                {status === "drift" && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <CircleAlert className="size-3.5 shrink-0" aria-hidden/>
                        Drifted — the file changed since planning, so the planned snippet no
                        longer matches. Re-plan to pick it up again.
                    </p>
                )}
            </article>
        );
    };

    /* ─── The task block is always on top; the plan grows below it. ── */
    const body = (
        <>
            {/* 1. Task + target folder + Plan changes. */}
            <div className="space-y-2">
                <Textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    disabled={busy}
                    rows={3}
                    aria-label="Agent task"
                    placeholder='Describe a multi-file task, e.g. "add logging to every API route" or "migrate these tests to fixtures"'
                    onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            void runPlan();
                        }
                    }}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <FileCode2 className="size-3.5 shrink-0" aria-hidden/>
                    <span className="min-w-0 flex-1 truncate">
            Target folder:{" "}
                        <span className="font-medium text-foreground">
              {folderName || folder || "(none)"}
            </span>{" "}
                        — only files inside it can be changed.
          </span>
                    <Button
                        size="sm"
                        variant={plan ? "outline" : "default"}
                        onClick={() => void runPlan()}
                        disabled={busy || !folder || !task.trim()}
                        className="shrink-0 gap-1.5 text-xs"
                        aria-label={plan ? "Re-run the planner" : "Plan changes"}
                        title="Ask the AI for a step plan and per-file edits (Ctrl+Enter)"
                    >
                        {planning ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <Bot className="size-3.5"/>
                        )}
                        {planning ? "Planning…" : plan ? "Re-plan" : "Plan changes"}
                    </Button>
                </div>
            </div>

            {/* 2. Planning skeleton. */}
            {planning && (
                <div className="space-y-2" aria-label="Building the plan">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin"/>
                        Reading the folder and asking the AI for a plan…
                    </div>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-2 rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-14"/>
                                <Skeleton className="h-4 w-40"/>
                            </div>
                            <Skeleton className="h-3 w-full"/>
                            <Skeleton className="h-3 w-2/3"/>
                        </div>
                    ))}
                </div>
            )}

            {/* 3. Error card with retry (the provider/setup messages come back
             in the same { error, errorType, retryable } shape the other
             AI routes use). */}
            {errorMsg && (
                <div
                    className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
                    <TriangleAlert className="size-6 text-red-500"/>
                    <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                    <Button size="sm" variant="outline" onClick={() => void runPlan()}>
                        <RotateCw className="size-3.5"/>
                        Retry
                    </Button>
                </div>
            )}

            {/* 4. The plan: steps, notes, approval toolbar, edit cards. */}
            {plan && !planning && (
                <div className="space-y-3">
                    {plan.steps.length > 0 && (
                        <section className="space-y-1.5" aria-label="Planned steps">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Steps
                            </h3>
                            <ol className="space-y-1.5">
                                {plan.steps.map((s, i) => (
                                    <li key={i} className="flex items-start gap-2 rounded-md border p-2">
                    <span
                        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium leading-snug">{s.title}</p>
                                            {s.detail && (
                                                <p className="mt-0.5 break-words whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                                    {s.detail}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {(plan.notes || plan.droppedEdits > 0) && (
                        <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
                            {plan.notes && <span className="whitespace-pre-wrap">{plan.notes}</span>}
                            {plan.droppedEdits > 0 && (
                                <span className="block pt-1">
                  {plan.droppedEdits} malformed edit
                                    {plan.droppedEdits === 1 ? " was" : "s were"} dropped while parsing the
                  AI reply.
                </span>
                            )}
                        </p>
                    )}

                    {plan.edits.length > 0 ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    File changes
                                </h3>
                                <Badge variant="secondary" className="text-[10px]">
                                    {approvedCount} of {plan.edits.length} approved
                                </Badge>
                                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                      variant="ghost"
                      size="sm"
                      onClick={approveAll}
                      disabled={busy}
                      className="gap-1.5 text-xs"
                      aria-label="Approve every edit"
                  >
                    <CheckCheck className="size-3.5"/>
                    Approve all
                  </Button>
                  <Button
                      variant="ghost"
                      size="sm"
                      onClick={rejectAll}
                      disabled={busy}
                      className="gap-1.5 text-xs"
                      aria-label="Reject every edit"
                  >
                    <XCircle className="size-3.5"/>
                    Reject all
                  </Button>
                </span>
                            </div>
                            <div className="space-y-2">
                                {plan.edits.map((edit, i) => renderEditCard(edit, i))}
                            </div>
                        </>
                    ) : (
                        <div className="flex min-h-24 items-center justify-center rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">
                                The plan has no file edits — rephrase the task or re-plan.
                            </p>
                        </div>
                    )}

                    {/* 5. Result summary (after an apply pass). */}
                    {result && (
                        <div
                            className={cn(
                                "rounded-lg border p-3",
                                result.applied > 0
                                    ? "border-emerald-500/30 bg-emerald-500/5"
                                    : "border-amber-500/30 bg-amber-500/5"
                            )}
                            aria-label="Apply summary"
                        >
                            <p className="text-xs font-medium">
                                Applied {result.applied} change{result.applied === 1 ? "" : "s"}
                                {result.created > 0
                                    ? ` (${result.created} new file${result.created === 1 ? "" : "s"})`
                                    : ""}
                                {result.skipped > 0
                                    ? `, skipped ${result.skipped}`
                                    : ""}
                                .
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {result.applied > 0
                                    ? "One Ctrl+Z restores every touched file to its pre-agent content."
                                    : "Nothing was written — re-plan to pick up the current file contents."}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                        <Bot className="size-4 shrink-0 text-violet-500" aria-hidden/>
                        <span className="truncate">Agent Mode</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
              {folderName || folder || "no folder"}
            </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
              {plan && (
                  <Badge variant="secondary" className="text-[10px]">
                      {plan.edits.length} {plan.edits.length === 1 ? "change" : "changes"}
                  </Badge>
              )}
            </span>
                    </DialogTitle>
                    <DialogDescription>
                        {plan
                            ? "Review the steps, approve or reject each file change, then apply them as one undoable batch."
                            : "Describe a multi-file task — the AI returns a step plan plus per-file diffs you approve individually."}
                    </DialogDescription>
                </DialogHeader>

                <div
                    className="flex-1 min-h-0 space-y-3 overflow-y-auto px-1 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent">
                    {body}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
                        {result ? "Close" : "Cancel"}
                    </Button>
                    {plan && !result && (
                        <Button
                            onClick={() => void handleApply()}
                            disabled={busy || approvedCount === 0}
                            className="gap-1.5"
                            aria-label={`Apply ${approvedCount} approved change${approvedCount === 1 ? "" : "s"}`}
                        >
                            {applying ? (
                                <Loader2 className="size-3.5 animate-spin"/>
                            ) : (
                                <CheckCheck className="size-3.5"/>
                            )}
                            {applying
                                ? "Applying…"
                                : `Apply ${approvedCount} change${approvedCount === 1 ? "" : "s"}`}
                        </Button>
                    )}
                    {result && (
                        <Button
                            variant="default"
                            onClick={() => void runPlan()}
                            disabled={busy || !task.trim()}
                            className="gap-1.5"
                        >
                            {planning ? <Loader2 className="size-3.5 animate-spin"/> : <RotateCw className="size-3.5"/>}
                            Plan again
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
