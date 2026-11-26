/**
 * agent-mode.ts — the PURE helpers behind Agent Mode (multi-file AI edits
 * with a step plan and per-file approvals).
 *
 * Three jobs, all DOM-free / Node-free so the SAME module serves:
 *   - the server route (/api/agent-plan): manifest filtering rules +
 *     defensive normalization of the model's JSON reply;
 *   - the dialog (agent-mode-dialog.tsx): drift-verification + splice
 *     logic for the apply pass, plus the browser-side slug encode for
 *     the (folder, file) slug pairs every reader route expects;
 *   - the unit tests (src/lib/__tests__/agent-mode.test.ts).
 *
 * The slug codec mirrors lib/slug-codec.ts's contract (base64url, UTF-8
 * safe, atob/btoa are browser globals AND Node ≥16 globals) — the encode
 * twin of scripts.ts slugify without Node's Buffer.
 */

/* ─── Plan payload types ─────────────────────────────────────────── */

export type AgentEditAction = "modify" | "create";

/** One step of the plan's "what I will do" list. */
export interface AgentPlanStep {
    title: string;
    detail: string;
}

/** One per-file edit the user approves or rejects individually. */
export interface AgentPlanEdit {
    /** Relative path inside the target folder (forward slashes). */
    path: string;
    action: AgentEditAction;
    /** Short human explanation of what this edit changes. */
    description: string;
    /** For "modify": the EXACT current snippet to locate (byte-identical
     *  to the file content). For "create": "" (the file does not exist). */
    original: string;
    /** For "modify": the replacement text. For "create": the FULL new
     *  file content. */
    proposed: string;
}

export interface AgentPlan {
    steps: AgentPlanStep[];
    edits: AgentPlanEdit[];
    notes: string;
}

/** Result of normalizing a raw model reply. */
export interface NormalizedAgentPlan {
    plan: AgentPlan;
    /** How many malformed edits were dropped during normalization ( surfaced
     *  to the user so a suspiciously thin plan is visible). */
    droppedEdits: number;
}

/* ─── Hard caps (shared by route + dialog + tests) ───────────────── */

/** Max steps kept from a plan (the rest are dropped). */
export const AGENT_PLAN_MAX_STEPS = 12;
/** Max edits kept from a plan. */
export const AGENT_PLAN_MAX_EDITS = 20;
/** Max text files listed in the manifest sent to the model. */
export const AGENT_MANIFEST_MAX_FILES = 200;
/** Default manifest cap when the client sends no maxFiles. */
export const AGENT_MANIFEST_DEFAULT_FILES = 60;
/** Max path depth (segments) a manifest entry / edit path may have —
 *  mirrors the explorer walk's FOLDER_WALK_MAX_DEPTH. */
export const AGENT_MANIFEST_MAX_DEPTH = 8;
/** How many file CONTENTS are embedded verbatim to ground the model. */
export const AGENT_GROUNDED_FILE_COUNT = 8;
/** Per-file byte cap for the embedded contents (first N chars). */
export const AGENT_GROUNDED_FILE_MAX_BYTES = 20 * 1024;
/** Extensions whose contents get embedded (the grounding subset). */
export const AGENT_GROUNDED_EXTS: ReadonlySet<string> = new Set([
    ".py", ".js", ".mjs", ".cjs", ".ts", ".md", ".markdown",
]);
/** Max chars of the task text the route accepts. */
export const AGENT_TASK_MAX_CHARS = 2000;
/** Per-field string caps applied during normalization. */
export const AGENT_FIELD_CAPS = {
    stepTitle: 200,
    stepDetail: 1000,
    description: 500,
    notes: 4000,
    original: 50_000,
    proposed: 50_000,
    path: 300,
} as const;

/* ─── Manifest filtering rules ───────────────────────────────────── */

/**
 * Text/code extensions the agent may PLAN against. Binary + archive +
 * media + data formats are excluded BY OMISSION (they can never be
 * spliced as text); unknown extensions are excluded too — the agent
 * only ever sees files the editor can edit as text. This is the
 * client-safe twin of scripts.ts fileKindFromExt's text half (that
 * module imports node:fs, so the dialog cannot import it).
 */
const PLANNABLE_TEXT_EXTS: ReadonlySet<string> = new Set([
    // Python-first
    ".py", ".pyw",
    // Markdown / prose
    ".md", ".markdown", ".mdx", ".txt",
    // Web + config
    ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".tsx",
    ".json", ".jsonl", ".yaml", ".yml", ".toml",
    ".ini", ".cfg", ".conf", ".env", ".html", ".htm", ".css",
    // Registry / engineering languages (editable text kinds)
    ".sh", ".bash", ".zsh", ".sql", ".r", ".rmd", ".rb", ".go",
    ".java", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh",
    ".rs", ".jl", ".lua", ".pl", ".pm", ".php", ".swift", ".kt",
    ".kts", ".ps1", ".bat", ".cmd",
]);

/** True when a relative path is a plannable TEXT file (extension
 *  allowlist — binaries/archives/media never qualify). */
export function isPlannableTextPath(relPath: string): boolean {
    const p = relPath.toLowerCase();
    // Dotfiles with no extension (".gitignore") act as their own ext —
    // the same trick the explorer walk uses. Hidden by the walk anyway.
    const dot = p.lastIndexOf(".");
    const slash = p.lastIndexOf("/");
    const ext = dot > slash ? p.slice(dot) : "";
    return PLANNABLE_TEXT_EXTS.has(ext);
}

/** Path depth in segments ("a/b.py" → 1, "a/b/c.py" → 2). */
export function manifestPathDepth(relPath: string): number {
    return relPath.split("/").filter(Boolean).length - 1;
}

/**
 * Normalize a relative path from an UNTRUSTED source (the model's JSON):
 * trim, POSIX separators only, no traversal, no absolute/trailing-slash
 * forms, no empty or hidden segments, capped length. Returns the cleaned
 * path or null when invalid — the SAME rules lib/scripts sanitizeSubPath
 * and /api/file-write's fileName validation enforce, applied client-side
 * so the dialog never trusts the model's paths either.
 */
export function normalizeRelativePath(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const clean = raw.trim();
    if (!clean || clean.length > AGENT_FIELD_CAPS.path) return null;
    if (
        clean.includes("..") ||
        clean.includes("\\") ||
        clean.startsWith("/") ||
        clean.endsWith("/") ||
        clean.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return null;
    }
    return clean;
}

/* ─── Plan JSON extraction + normalization ────────────────────────── */

/** Clamp/normalize one untrusted string field. */
function capString(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v.length > max ? v.slice(0, max) : v;
}

/**
 * Strip a single markdown fence the model may have added despite the
 * "STRICT JSON only" instruction (same approach as ai-review-dialog's
 * stripCodeFences).
 */
export function stripMarkdownFences(text: string): string {
    const t = text.trim();
    const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(t);
    return (fenced ? fenced[1] : t).trim();
}

/**
 * Extract the first JSON object from a raw model reply: fence-strip,
 * slice from the first "{" to the last "}", JSON.parse defensively.
 * Returns null when no object is recoverable.
 */
export function extractPlanJson(raw: string): unknown | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const stripped = stripMarkdownFences(raw);
    const source = stripped.indexOf("{") >= 0 ? stripped : raw;
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(source.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * Normalize the model's plan reply into a trustable AgentPlan.
 *
 * - unfenced, fenced and prose-wrapped JSON all recover;
 * - every field is unknown-narrowed + capped; malformed edits are
 *  DROPPED (counted in droppedEdits), never throw;
 * - with `knownPaths` (the manifest's existing files):
 *    - a "modify" whose path is NOT in knownPaths is dropped (nothing
 *      to modify — the model invented the file), and
 *    - a "create" whose path IS in knownPaths is dropped (it exists).
 *
 * Returns null when the reply carries no recoverable JSON object.
 */
export function normalizeAgentPlan(
    raw: string,
    opts?: { knownPaths?: ReadonlySet<string> }
): NormalizedAgentPlan | null {
    const parsed = extractPlanJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const root = parsed as Record<string, unknown>;

    // ── steps ──
    const steps: AgentPlanStep[] = [];
    const stepsRaw = root.steps;
    if (Array.isArray(stepsRaw)) {
        for (const item of stepsRaw) {
            if (!item || typeof item !== "object") continue;
            const s = item as Record<string, unknown>;
            const title = capString(s.title, AGENT_FIELD_CAPS.stepTitle).trim();
            if (!title) continue;
            steps.push({title, detail: capString(s.detail, AGENT_FIELD_CAPS.stepDetail)});
            if (steps.length >= AGENT_PLAN_MAX_STEPS) break;
        }
    }

    // ── edits ──
    const knownPaths = opts?.knownPaths;
    const edits: AgentPlanEdit[] = [];
    let droppedEdits = 0;
    const editsRaw = root.edits;
    if (Array.isArray(editsRaw)) {
        for (const item of editsRaw) {
            if (edits.length >= AGENT_PLAN_MAX_EDITS) {
                // Over the cap — truncated, but counted so the caller can tell
                // the user the plan was cut short.
                droppedEdits++;
                continue;
            }
            if (!item || typeof item !== "object") {
                droppedEdits++;
                continue;
            }
            const e = item as Record<string, unknown>;
            const path = normalizeRelativePath(e.path);
            if (!path) {
                droppedEdits++;
                continue;
            }
            const action: AgentEditAction = e.action === "create" ? "create" : "modify";
            const description = capString(e.description, AGENT_FIELD_CAPS.description);
            let original = capString(e.original, AGENT_FIELD_CAPS.original);
            const proposed = capString(e.proposed, AGENT_FIELD_CAPS.proposed);

            if (action === "create") {
                // A create must target a path that does NOT exist yet, and
                // carries the full file content (original is forced to "").
                original = "";
                if (!proposed) {
                    droppedEdits++;
                    continue;
                }
                if (knownPaths?.has(path)) {
                    droppedEdits++;
                    continue;
                }
            } else {
                // A modify needs a non-empty byte-exact locator + a real target.
                if (!original || knownPaths && !knownPaths.has(path)) {
                    droppedEdits++;
                    continue;
                }
                // A no-op edit (identical before/after) has nothing to approve.
                if (original === proposed) {
                    droppedEdits++;
                    continue;
                }
            }

            const edit: AgentPlanEdit = {path, action, description, original, proposed};
            const dupe = edits.some(
                (prev) => prev.path === edit.path && prev.original === edit.original && prev.action === edit.action
            );
            if (dupe) {
                droppedEdits++;
                continue;
            }
            edits.push(edit);
        }
    }

    const notes = capString(root.notes, AGENT_FIELD_CAPS.notes).trim();
    return {plan: {steps, edits, notes}, droppedEdits};
}

/* ─── Drift verification + splice ────────────────────────────────── */

export type ApplyEditResult =
    | { ok: true; next: string }
    | { ok: false; reason: "drift" };

/**
 * Apply ONE edit to the CURRENT file content (exact-match splice).
 *
 * The `original` snippet must appear VERBATIM in the content — the
 * client re-reads the file right before writing, so any edit made since
 * planning (in the editor or by another tool) makes the snippet miss and
 * the edit is reported as drifted instead of corrupting the file. The
 * FIRST occurrence is replaced (plans are small, focused edits; the
 * prompt forbids catch-all rewrites).
 *
 * Returns { ok: true, next } on success or { ok: false, reason: "drift" }
 * when the snippet cannot be located (which for a modify also covers the
 * degenerate empty-original case — "" is only ever valid for creates,
 * which the caller handles without going through here).
 */
export function applyEdit(
    content: string,
    edit: Pick<AgentPlanEdit, "original" | "proposed">
): ApplyEditResult {
    const {original, proposed} = edit;
    if (!original) return {ok: false, reason: "drift"};
    const idx = content.indexOf(original);
    if (idx < 0) return {ok: false, reason: "drift"};
    return {
        ok: true,
        next: content.slice(0, idx) + proposed + content.slice(idx + original.length),
    };
}

/** Derive the content of a file after ONE edit (create semantics):
 *  the edit's proposed text IS the new file. Exposed for the dialog's
 *  create branch + the tests' create-path coverage. */
export function createFileContent(edit: Pick<AgentPlanEdit, "proposed">): string {
    return edit.proposed;
}

/* ─── Browser-side slug encode (the twin of scripts.ts slugify) ──── */

/**
 * Encode a file/folder NAME or relative path as the lossless base64url
 * slug every /api route expects (byte-identical to
 * Buffer.from(name, "utf-8").toString("base64url") in lib/scripts.ts,
 * without Node's Buffer — btoa + TextEncoder are browser AND Node ≥16
 * globals). The decode twin lives in lib/slug-codec.ts decodeSlug.
 */
export function encodeSlug(name: string): string {
    if (!name) return "";
    const bytes = new TextEncoder().encode(name);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    // base64 → base64url (no padding, URL-safe alphabet).
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ─── Small display helpers ──────────────────────────────────────── */

/** Short human label for the undo group / toasts ("Agent: add logging…"). */
export function planLabel(task: string): string {
    const words = task.trim().split(/\s+/).slice(0, 6).join(" ");
    const label = words.length > 60 ? `${words.slice(0, 60)}…` : words;
    return label || "agent task";
}
