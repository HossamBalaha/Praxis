/**
 * pyright-client.ts — the browser-side fetch + validation layer for the
 * /api/lsp/* routes (the same role peek-references.ts plays for
 * full-text search: one module owns the wire contract, everything else
 * consumes typed results).
 *
 * Design rules (matching fetchReferences in peek-references.ts):
 *   - NEVER throws: network failures and malformed payloads collapse
 *     into the caller's fallback value.
 *   - ALWAYS validates shapes before trusting them: a corrupt row must
 *     not crash the hover card or the peek popup.
 *   - Distinguishes "the sidecar is unavailable" (available:false — the
 *     caller falls back to the regex/AST-lite path) from "the sidecar
 *     answered nothing" (available:true, empty result — the honest
 *     answer, no fallback needed).
 */

import type {ReferenceHit} from "@/lib/peek-references";

// ── Shared types ─────────────────────────────────────────────────────

/** The sidecar lifecycle as the client sees it. */
export interface LspStatusInfo {
    state: "stopped" | "starting" | "ready" | "failed" | "unavailable";
    ready: boolean;
    available: boolean;
    reason: string | null;
    serverVersion: string | null;
    generation: number;
}

/** The typed hover card (the tooltip's lsp section). */
export interface LspHoverCard {
    title: string;
    body: string | undefined;
}

/** One F12 definition target (ready for guardedSelectFile + jumpToLine). */
export interface LspDefinitionTarget {
    folderName: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    line: number;
    col: number;
}

/** The definition answer. */
export interface LspDefinitionResult {
    available: boolean;
    targets: LspDefinitionTarget[];
    externalCount: number;
}

/** The app's Diagnostic row (code-viewer-types shape — col optional). */
export interface LspDiagnosticRow {
    line: number;
    col?: number;
    severity: "error" | "warning" | "info";
    message: string;
}

/** One rename occurrence row (the dialog's exact-edit shape). */
export interface LspRenameOccurrence {
    line: number;
    col: number;
    endCol: number;
    snippet: string;
    context: "code" | "comment" | "string" | "text";
    defSite: boolean;
}

/** One file of the rename preview (the dialog's PreviewFile shape). */
export interface LspRenameFile {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    path: string;
    isPython: boolean;
    occurrences: LspRenameOccurrence[];
}

/** The apply-phase rename preview. */
export interface LspRenamePreview {
    name: string;
    files: LspRenameFile[];
    totalOccurrences: number;
}

/** The prepare-phase rename probe. */
export interface LspRenamePrepare {
    supported: boolean;
    placeholder?: string;
    line?: number;
    col?: number;
    endCol?: number;
}

/** The common request arguments (identical across the feature routes). */
export interface LspFeatureArgs {
    folder: string;
    file: string;
    content: string;
    line: number;
    col: number;
    interpreter?: string | null;
    signal?: AbortSignal;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** POST JSON and return the parsed body (null on any failure). */
async function postLspJson(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    try {
        // The request.
        const res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
            signal,
        });
        // Non-OK → the fallback path (the proxy may rate-limit, the server
        // may 400 on a stale slug — none of these are hover-card news).
        if (!res.ok) return null;
        // Parse.
        const data = (await res.json()) as unknown;
        // Trust only objects.
        if (!data || typeof data !== "object") return null;
        return data as Record<string, unknown>;
    } catch {
        // Aborted or network failure.
        return null;
    }
}

/** True when the response says the sidecar answered (vs unavailable). */
function responseAvailable(data: Record<string, unknown> | null): boolean {
    // Absent response = no sidecar answer.
    if (!data) return false;
    // available defaults to true when the field is missing.
    return data.available !== false;
}

// ── Merging (the squiggle overlay consumes one list) ────────────────

/**
 * Merge pyright's rows into a base diagnostic list (the ruff rows the
 * live-lint path produces). Both sources paint the SAME squiggles, so
 * duplicate findings — an undefined name both tools flag — collapse by
 * (line, message); pyright-only type errors append after the ruff rows
 * (style first, types second, matching the panel's tool grouping).
 */
export function mergeLspDiagnostics(
    base: LspDiagnosticRow[] | undefined,
    lspRows: LspDiagnosticRow[]
): LspDiagnosticRow[] | undefined {
    // Nothing to merge from either side — preserve the undefined
    // semantics ("no lint data at all").
    if (base === undefined && lspRows.length === 0) return undefined;
    // No pyright rows — the base list unchanged (still undefined-aware).
    if (lspRows.length === 0) return base ?? [];
    // The dedupe set of (line, message) keys already shown.
    const seen = new Set<string>();
    for (const row of base ?? []) {
        // Register the base row.
        seen.add(`${row.line}:${row.message}`);
    }
    // The merged list (base first).
    const merged = [...(base ?? [])];
    for (const row of lspRows) {
        // The dedupe key.
        const key = `${row.line}:${row.message}`;
        // A duplicate finding — skip it.
        if (seen.has(key)) continue;
        // Register + append.
        seen.add(key);
        merged.push(row);
    }
    // The merged rows.
    return merged;
}

// ── Status ───────────────────────────────────────────────────────────

/** Fetch the sidecar lifecycle snapshot (never spawns; safe to poll). */
export async function fetchLspStatus(signal?: AbortSignal): Promise<LspStatusInfo | null> {
    try {
        // The cheap GET.
        const res = await fetch("/api/lsp/status", {signal});
        // Failure → null.
        if (!res.ok) return null;
        // Parse.
        const data = (await res.json()) as Record<string, unknown> | null;
        if (!data || typeof data !== "object") return null;
        // The state must be one of the known values.
        const state = data.state;
        if (state !== "stopped" && state !== "starting" && state !== "ready" && state !== "failed" && state !== "unavailable") {
            return null;
        }
        // The validated snapshot.
        return {
            state,
            ready: data.ready === true,
            available: data.available !== false,
            reason: typeof data.reason === "string" ? data.reason : null,
            serverVersion: typeof data.serverVersion === "string" ? data.serverVersion : null,
            generation: Number(data.generation) || 0,
        };
    } catch {
        // Aborted or offline.
        return null;
    }
}

// ── Document sync ────────────────────────────────────────────────────

/** Post a document sync (open/change/close). Returns the availability. */
export async function postLspDocument(
    args: {
        folder: string;
        file: string;
        content?: string;
        close?: boolean;
        interpreter?: string | null;
        signal?: AbortSignal
    }
): Promise<boolean> {
    // The wire body.
    const body: Record<string, unknown> = {folder: args.folder, file: args.file};
    // The buffer text (omitted for close).
    if (args.content !== undefined) body.content = args.content;
    // The close flag.
    if (args.close) body.close = true;
    // The configured interpreter (keys the server instance).
    if (args.interpreter) body.interpreter = args.interpreter;
    // POST it.
    const data = await postLspJson("/api/lsp/document", body, args.signal);
    // Availability (false also on network failure — the fallback answer).
    return responseAvailable(data);
}

// ── Hover ────────────────────────────────────────────────────────────

/** Fetch a typed hover; null when unavailable OR nothing known. */
export async function fetchLspHover(args: LspFeatureArgs): Promise<LspHoverCard | null> {
    // The wire body.
    const data = await postLspJson("/api/lsp/hover", {
        ...args,
        interpreter: args.interpreter || undefined
    }, args.signal);
    // No answer.
    if (!data || !responseAvailable(data)) return null;
    // The hover payload.
    const hover = data.hover;
    // Nothing known here — a legal answer.
    if (!hover || typeof hover !== "object") return null;
    // Narrow.
    const h = hover as { title?: unknown; body?: unknown };
    // A title is required.
    if (typeof h.title !== "string" || !h.title.trim()) return null;
    // The card.
    return {title: h.title, body: typeof h.body === "string" && h.body.trim() ? h.body : undefined};
}

// ── Definition ───────────────────────────────────────────────────────

/** Fetch the definition targets for F12. */
export async function fetchLspDefinition(args: LspFeatureArgs): Promise<LspDefinitionResult> {
    // The wire body.
    const data = await postLspJson("/api/lsp/definition", {
        ...args,
        interpreter: args.interpreter || undefined
    }, args.signal);
    // Unavailable / failed → the empty-but-unavailable answer.
    if (!data || !responseAvailable(data)) return {available: false, targets: [], externalCount: 0};
    // The targets array.
    const raw = Array.isArray(data.targets) ? data.targets : [];
    // The mapped targets.
    const targets: LspDefinitionTarget[] = [];
    for (const t of raw) {
        // Row validation.
        if (!t || typeof t !== "object") continue;
        const r = t as Record<string, unknown>;
        const line = Number(r.line);
        const col = Number(r.col);
        if (
            typeof r.folderSlug !== "string" ||
            typeof r.fileSlug !== "string" ||
            !Number.isFinite(line) ||
            line < 1 ||
            !Number.isFinite(col) ||
            col < 1
        ) {
            continue;
        }
        // The validated target.
        targets.push({
            folderName: typeof r.folderName === "string" ? r.folderName : "",
            fileName: typeof r.fileName === "string" ? r.fileName : "",
            folderSlug: r.folderSlug,
            fileSlug: r.fileSlug,
            line,
            col,
        });
    }
    // The answer.
    return {available: true, targets, externalCount: Number(data.externalCount) || 0};
}

// ── References ───────────────────────────────────────────────────────

/** Fetch semantic references for ⇧F12 (the ReferenceHit shape). */
export async function fetchLspReferences(args: LspFeatureArgs): Promise<ReferenceHit[]> {
    // The wire body.
    const data = await postLspJson("/api/lsp/references", {
        ...args,
        interpreter: args.interpreter || undefined
    }, args.signal);
    // No answer.
    if (!data || !responseAvailable(data)) return [];
    // The hits array.
    const raw = Array.isArray(data.hits) ? data.hits : [];
    // The validated hits.
    const hits: ReferenceHit[] = [];
    for (const h of raw) {
        // Row validation (same rules as fetchReferences).
        if (!h || typeof h !== "object") continue;
        const r = h as Record<string, unknown>;
        const line = Number(r.line);
        if (typeof r.folderSlug !== "string" || typeof r.fileSlug !== "string" || !Number.isFinite(line) || line < 1) continue;
        hits.push({
            folder: typeof r.folder === "string" ? r.folder : "",
            folderSlug: r.folderSlug,
            file: typeof r.file === "string" ? r.file : "",
            fileSlug: r.fileSlug,
            line,
            snippet: typeof r.snippet === "string" ? r.snippet : "",
        });
    }
    // Done.
    return hits;
}

// ── Rename ───────────────────────────────────────────────────────────

/** Phase 1: probe whether the position is renameable. */
export async function fetchLspRenamePrepare(args: LspFeatureArgs): Promise<LspRenamePrepare | null> {
    // The wire body.
    const data = await postLspJson("/api/lsp/rename", {
        ...args,
        interpreter: args.interpreter || undefined
    }, args.signal);
    // No answer.
    if (!data || !responseAvailable(data)) return null;
    // The probe.
    if (data.supported !== true) return {supported: false};
    // The placeholder is required for a supported rename.
    if (typeof data.placeholder !== "string" || !data.placeholder) return {supported: false};
    // The supported probe with its extent.
    return {
        supported: true,
        placeholder: data.placeholder,
        line: Number(data.line) || 1,
        col: Number(data.col) || 1,
        endCol: Number(data.endCol) || 1,
    };
}

/** Phase 2: fetch the exact-edit rename preview. */
export async function fetchLspRenameApply(args: LspFeatureArgs, newName: string): Promise<LspRenamePreview | null> {
    // The wire body (mode apply).
    const data = await postLspJson("/api/lsp/rename", {
        ...args,
        mode: "apply",
        newName,
        interpreter: args.interpreter || undefined
    }, args.signal);
    // No answer / not supported.
    if (!data || !responseAvailable(data) || data.supported !== true) return null;
    // The files array.
    const raw = Array.isArray(data.files) ? data.files : [];
    // The validated files.
    const files: LspRenameFile[] = [];
    for (const f of raw) {
        // Row validation.
        if (!f || typeof f !== "object") continue;
        const r = f as Record<string, unknown>;
        if (typeof r.folderSlug !== "string" || typeof r.fileSlug !== "string" || typeof r.path !== "string") continue;
        // The occurrences.
        const occs: LspRenameOccurrence[] = [];
        for (const o of Array.isArray(r.occurrences) ? r.occurrences : []) {
            // Row validation.
            if (!o || typeof o !== "object") continue;
            const or_ = o as Record<string, unknown>;
            const line = Number(or_.line);
            const col = Number(or_.col);
            const endCol = Number(or_.endCol);
            if (!Number.isFinite(line) || line < 1 || !Number.isFinite(col) || col < 1 || !Number.isFinite(endCol) || endCol < col) continue;
            // The occurrence (context is always "code" for LSP edits).
            occs.push({
                line,
                col,
                endCol,
                snippet: typeof or_.snippet === "string" ? or_.snippet : "",
                context: "code",
                defSite: or_.defSite === true,
            });
        }
        // Only files with rows.
        if (occs.length === 0) continue;
        // The file group.
        files.push({
            folder: typeof r.folder === "string" ? r.folder : "",
            folderSlug: r.folderSlug,
            file: typeof r.file === "string" ? r.file : "",
            fileSlug: r.fileSlug,
            path: r.path,
            isPython: r.isPython !== false,
            occurrences: occs,
        });
    }
    // Nothing usable.
    if (files.length === 0) return null;
    // The preview.
    return {name: newName, files, totalOccurrences: Number(data.totalOccurrences) || 0};
}

// ── Diagnostics ──────────────────────────────────────────────────────

/** Pull the current diagnostics for one file (the poll side). */
export async function fetchLspDiagnostics(
    folder: string,
    file: string,
    signal?: AbortSignal
): Promise<{ diagnostics: LspDiagnosticRow[]; version: number } | null> {
    try {
        // The GET.
        const res = await fetch(`/api/lsp/diagnostics?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`, {signal});
        // Failure → null (keep the previous diagnostics).
        if (!res.ok) return null;
        // Parse.
        const data = (await res.json()) as Record<string, unknown> | null;
        if (!data || typeof data !== "object") return null;
        // The diagnostics array.
        const raw = Array.isArray(data.diagnostics) ? data.diagnostics : [];
        // The validated rows.
        const diagnostics: LspDiagnosticRow[] = [];
        for (const d of raw) {
            // Row validation.
            if (!d || typeof d !== "object") continue;
            const r = d as Record<string, unknown>;
            const line = Number(r.line);
            if (!Number.isFinite(line) || line < 1) continue;
            if (typeof r.message !== "string" || !r.message) continue;
            // The severity bucket.
            const severity = r.severity === "error" || r.severity === "warning" ? r.severity : "info";
            // The col when present.
            const colNum = Number(r.col);
            // The row.
            diagnostics.push({
                line,
                col: Number.isFinite(colNum) && colNum >= 1 ? colNum : undefined,
                severity,
                message: r.message
            });
        }
        // The answer.
        return {diagnostics, version: Number(data.version) || 0};
    } catch {
        // Aborted or offline — keep the previous rows.
        return null;
    }
}
