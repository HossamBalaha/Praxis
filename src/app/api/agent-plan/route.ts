import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import {AI_REQUEST_LIMITS, classifyAiError, createChatCompletion, sanitizeProvider,} from "@/lib/ai";
import {listFolders, resolveScriptPath, restoreActiveProjectRoot} from "@/lib/scripts";
import {
    AGENT_GROUNDED_EXTS,
    AGENT_GROUNDED_FILE_COUNT,
    AGENT_GROUNDED_FILE_MAX_BYTES,
    AGENT_MANIFEST_DEFAULT_FILES,
    AGENT_MANIFEST_MAX_DEPTH,
    AGENT_MANIFEST_MAX_FILES,
    AGENT_TASK_MAX_CHARS,
    isPlannableTextPath,
    manifestPathDepth,
    normalizeAgentPlan,
} from "@/lib/agent-mode";

/**
 * POST /api/agent-plan
 *
 * Body: { task: string, folder: <slug>, maxFiles?: number, provider?: {...} }
 *
 * Agent Mode's planning half: the AI NEVER writes files — it returns a
 * step plan plus per-file edits (an exact original snippet + its
 * replacement, or the full content of a new file), and the client
 * (agent-mode-dialog.tsx) applies the approved ones through
 * /api/file-write after re-verifying each `original` against the LIVE
 * file (drift check).
 *
 * Server-side flow (every building block is REUSED, nothing reimplemented):
 *  - folder resolution + manifest walk: `listFolders()` — the exact walk
 *    /api/folders serves the explorer (restoreActiveProjectRoot cold-start
 *    guard included); the folder slug indexes into its result, so the
 *    entries are inherently inside the scripts root;
 *  - the GROUNDED file reads: `resolveScriptPath(folder, slug,
 *    { anyKind: true })` — the strict per-file scripts-root containment
 *    guard every reading route uses (traversal slugs resolve to null);
 *  - the model call: `createChatCompletion(sanitizeProvider(body.provider), …)`
 *    — the same provider abstraction /api/ai-chat and friends use
 *    (client-selected OpenAI-compatible endpoint + server keyring
 *    fallback; no provider → the shared actionable setup error).
 *
 * The prompt demands STRICT JSON:
 *   { steps: [{ title, detail }],
 *     edits: [{ path, action: "modify" | "create", description,
 *               original, proposed }],
 *     notes: string }
 * and the reply is normalized defensively by normalizeAgentPlan
 * (fence-strip, JSON.parse in try/catch, per-field validation, invalid
 * edits dropped — see lib/agent-mode.ts).
 *
 * Response: { folder, steps, edits, notes, manifestCount, groundedCount,
 * droppedEdits }
 *
 * Errors mirror /api/ai-test's shape — { error, errorType, retryable }
 * with status 400 for bad_request and 500 otherwise — so the client
 * renders the same friendly provider/setup messages.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
    "You are a meticulous multi-file coding agent inside Praxis, a Python-first IDE. " +
    "Given a task and the files of ONE project folder, you produce a short step plan and " +
    "small, surgical, verifiable per-file edits. You always reply with a single STRICT " +
    "JSON object and NOTHING else — no prose, no markdown fences, no commentary outside " +
    "the JSON.";

/** Build the user message: task + manifest + grounded contents + rules. */
function buildUserMessage(opts: {
    task: string;
    manifestLines: string[];
    grounded: Array<{ path: string; content: string }>;
}): string {
    const {task, manifestLines, grounded} = opts;
    const manifestBlock = manifestLines.length
        ? manifestLines.map((l) => `- ${l}`).join("\n")
        : "(no text files found — the folder holds no plannable text content)";
    const groundedBlock = grounded.length
        ? grounded
            .map((g) => `===== FILE: ${g.path} =====\n${g.content}\n===== END FILE =====`)
            .join("\n\n")
        : "(no file contents could be read — plan against the manifest alone and keep edits conservative)";
    return (
        `Task: ${task}\n\n` +
        `File manifest (relative paths inside the target folder, forward slashes):\n${manifestBlock}\n\n` +
        `Full contents of the grounded files:\n${groundedBlock}\n\n` +
        `Reply with ONLY this JSON shape:\n` +
        `{"steps":[{"title":"...","detail":"..."}],` +
        `"edits":[{"path":"relative/path.py","action":"modify" or "create","description":"what this edit does","original":"...","proposed":"..."}],` +
        `"notes":"short summary or caveats"}\n\n` +
        `Rules:\n` +
        `1. "path" must be a RELATIVE path inside the folder (no absolute paths, no "..", only forward slashes). For "modify" use a path from the manifest; for "create" any new relative path inside the folder that does not exist yet.\n` +
        `2. For "modify", copy "original" BYTE-EXACT from the file contents above — including indentation, spacing and blank lines. The client locates it with an exact string match; an "original" that does not appear verbatim in the file will be rejected as drift.\n` +
        `3. Small focused edits: each edit replaces exactly ONE occurrence of its "original". Prefer several small edits over a full-file rewrite. Limit yourself to at most 20 edits.\n` +
        `4. For "create", set "original" to "" and "proposed" to the FULL new file content.\n` +
        `5. Never invent files outside the manifest for "modify", never propose binary paths, and keep "steps" short and actionable (2-6 steps typical).\n`
    );
}

export async function POST(request: Request) {
    // ── Body-size guard (mirror of the other AI routes). ──
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
        Number.isFinite(contentLength) &&
        contentLength > AI_REQUEST_LIMITS.maxBodyBytes
    ) {
        return NextResponse.json({error: "Request body too large."}, {status: 413});
    }

    let body: { task?: string; folder?: string; maxFiles?: number; provider?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const task = typeof body.task === "string" ? body.task.trim().slice(0, AGENT_TASK_MAX_CHARS) : "";
    if (!task) {
        return NextResponse.json(
            {error: "Body must include a non-empty 'task' string."},
            {status: 400}
        );
    }
    const folderSlug = typeof body.folder === "string" ? body.folder : "";
    if (!folderSlug) {
        return NextResponse.json(
            {error: "Body must include a 'folder' slug."},
            {status: 400}
        );
    }
    // Manifest cap: clamp the client's maxFiles into [5, MAX] with the
    // documented default (the manifest itself is already bounded by the
    // walk's own depth cap of AGENT_MANIFEST_MAX_DEPTH).
    const maxFilesRaw = Number(body.maxFiles);
    const manifestLimit =
        Number.isFinite(maxFilesRaw) && maxFilesRaw > 0
            ? Math.min(AGENT_MANIFEST_MAX_FILES, Math.max(5, Math.floor(maxFilesRaw)))
            : AGENT_MANIFEST_DEFAULT_FILES;

    // ── Folder resolution + manifest: REUSE the /api/folders walk. ──
    // restoreActiveProjectRoot first — the same cold-start guard
    // /api/folders applies so a custom project root is in place before
    // the tree is scanned. The slug indexes listFolders' result, so the
    // entry (and every file path in it) is inherently inside the scripts
    // root; no second hand-rolled guard is needed for the manifest.
    await restoreActiveProjectRoot();
    const folders = await listFolders();
    const target = folders.find((f) => f.slug === folderSlug) ?? null;
    if (!target) {
        return NextResponse.json(
            {error: "Folder not found in the active project."},
            {status: 404}
        );
    }

    // Manifest: the folder's text files (binaries/archives/media are
    // filtered out by extension — isPlannableTextPath), depth- and
    // count-capped, in the walk's alphabetical path order.
    const manifestFiles = target.files
        .map((f) => ({path: f.path ?? f.name, ext: f.ext ?? "", size: f.size ?? 0, slug: f.slug}))
        .filter(
            (f) => isPlannableTextPath(f.path) && manifestPathDepth(f.path) <= AGENT_MANIFEST_MAX_DEPTH
        )
        .slice(0, manifestLimit);
    const manifestLines = manifestFiles.map(
        (f) => `${f.path} (${f.ext || "?"} file, ${f.size} bytes)`
    );
    const knownPaths = new Set(manifestFiles.map((f) => f.path));

    // ── Grounded subset: the first N code/prose files ≤ 20 KB each,
    //    read through the SAME strict per-file guard the reading routes
    //    use (resolveScriptPath re-deslugifies + re-verifies containment
    //    + existence; a traversal slug resolves to null and is skipped).
    const grounded: Array<{ path: string; content: string }> = [];
    for (const f of manifestFiles) {
        if (grounded.length >= AGENT_GROUNDED_FILE_COUNT) break;
        if (!AGENT_GROUNDED_EXTS.has(f.ext) || f.size > AGENT_GROUNDED_FILE_MAX_BYTES) continue;
        const resolved = await resolveScriptPath(folderSlug, f.slug, {anyKind: true});
        if (!resolved) continue;
        try {
            const raw = await fs.readFile(resolved.absPath, "utf-8");
            const content =
                raw.length > AGENT_GROUNDED_FILE_MAX_BYTES
                    ? `${raw.slice(0, AGENT_GROUNDED_FILE_MAX_BYTES)}\n... (truncated — original file was ${raw.length.toLocaleString()} chars)`
                    : raw;
            grounded.push({path: f.path, content});
        } catch {
            /* vanished between the walk and the read — skip it */
        }
    }

    // ── The model call: the SAME provider abstraction as every other AI
    //    route. No provider → createChatCompletion throws the shared
    //    actionable setup error, classified below like /api/ai-test does.
    try {
        const provider = sanitizeProvider(body.provider);
        const completion = (await createChatCompletion(provider, {
            messages: [
                {role: "system", content: SYSTEM_PROMPT},
                {role: "user", content: buildUserMessage({task, manifestLines, grounded})},
            ],
            thinkingDisabled: true,
        })) as { choices?: Array<{ message?: { content?: string } }> } | null;

        const raw = completion?.choices?.[0]?.message?.content ?? "";
        const normalized = normalizeAgentPlan(raw, {knownPaths});
        if (
            !normalized ||
            (normalized.plan.steps.length === 0 && normalized.plan.edits.length === 0)
        ) {
            return NextResponse.json(
                {
                    error:
                        "The AI did not return a usable plan (no valid JSON with steps or edits) — rephrase the task and retry.",
                    errorType: "server",
                    retryable: true,
                },
                {status: 500}
            );
        }

        const plan = normalized.plan;
        return NextResponse.json({
            folder: target.name,
            steps: plan.steps,
            edits: plan.edits,
            notes: plan.notes,
            manifestCount: manifestFiles.length,
            groundedCount: grounded.length,
            droppedEdits: normalized.droppedEdits,
        });
    } catch (err) {
        const ce = classifyAiError(err);
        return NextResponse.json(
            {error: ce.message, errorType: ce.type, retryable: ce.retryable},
            {status: ce.type === "bad_request" ? 400 : 500}
        );
    }
}
