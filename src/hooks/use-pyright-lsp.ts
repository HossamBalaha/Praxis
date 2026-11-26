"use client";

/**
 * use-pyright-lsp.ts — the editor's Pyright LSP session.
 *
 * One hook owns the client half of the sidecar contract for whatever
 * file the editor shows:
 *
 *   - DOCUMENT SYNC: didOpen/didChange POSTs debounced 300 ms with a
 *     1500 ms max-wait (see lsp-debounce) — fast typing produces at
 *     most ~4 posts/second instead of one per keystroke; the server
 *     coalesces those further (~120 ms). didClose fires on switch and
 *     unmount.
 *   - HOVER: requestHover debounces 150 ms (600 ms max-wait); stale
 *     responses are dropped by a sequence number so a slow answer for
 *     line 40 never overwrites the card for line 60.
 *   - DIAGNOSTICS: a 1.5 s poll while the file is open; rows re-render
 *     only when the per-file version changes, and each fresh batch is
 *     also dispatched as a `praxis:lsp-diagnostics` window event for
 *     the Problems panel (the app's cross-component bus).
 *   - FEATURES (F12 / ⇧F12 / F2): immediate, user-initiated calls —
 *     never debounced.
 *   - FALLBACK: when the first sync answers available:false (pyright
 *     not installed), the hook latches "unavailable", cancels every
 *     pending request and stops POSTing — the editor keeps its
 *     regex/AST-lite behavior untouched. A later interpreter change
 *     retries (the latch resets when the interpreter changes, matching
 *     the server's restart semantics).
 */

import * as React from "react";
import {createLspDebouncer} from "@/lib/lsp-debounce";
import {
    fetchLspDefinition,
    fetchLspDiagnostics,
    fetchLspHover,
    fetchLspReferences,
    fetchLspRenameApply,
    fetchLspRenamePrepare,
    type LspDefinitionResult,
    type LspDiagnosticRow,
    type LspHoverCard,
    type LspRenamePrepare,
    type LspRenamePreview,
    postLspDocument,
} from "@/lib/pyright-client";
import type {ReferenceHit} from "@/lib/peek-references";

// ── Tunables (the debouncing contract's client side) ────────────────

/** Quiet period before a document sync post (fast typing coalesces). */
const DOCUMENT_SYNC_DELAY_MS = 300;
/** Hard ceiling: an unsynced buffer never waits longer than this. */
const DOCUMENT_SYNC_MAX_WAIT_MS = 1500;
/** Quiet period before a hover request (mouse wandering coalesces). */
const HOVER_DELAY_MS = 150;
/** Hard ceiling for hover requests under continuous mouse motion. */
const HOVER_MAX_WAIT_MS = 600;
/** Diagnostics poll cadence while a Python file is open. */
const DIAGNOSTICS_POLL_MS = 1500;

/** The client-visible session status. */
export type PyrightLspClientStatus = "off" | "starting" | "ready" | "unavailable";

// ── The hook ─────────────────────────────────────────────────────────

/** The hook's inputs. */
export interface UsePyrightLspOptions {
    /** True only for Python files with a real (folder, file) identity. */
    enabled: boolean;
    folderSlug: string;
    fileSlug: string;
    /** The CURRENT buffer (pass the deferred value in edit mode). */
    content: string;
    /** The configured interpreter (keys / restarts the server instance). */
    interpreter?: string | null;
}

/** The session surface the editor consumes. */
export interface PyrightLspSession {
    /** "off" (not a Python file), "starting", "ready", "unavailable". */
    status: PyrightLspClientStatus;
    /** The latest typed hover (anchored to its request line). */
    hover: { line: number; title: string; body: string | undefined } | null;
    /** The latest pyright diagnostics for this file (already merged by the caller). */
    diagnostics: LspDiagnosticRow[];
    /** Debounced hover request at a 1-based (line, col). */
    requestHover: (line: number, col: number) => void;
    /** Immediate F12 definition lookup. */
    definitionAt: (line: number, col: number) => Promise<LspDefinitionResult | null>;
    /** Immediate ⇧F12 references lookup. */
    referencesAt: (line: number, col: number) => Promise<ReferenceHit[]>;
    /** Immediate F2 prepare probe. */
    renamePrepareAt: (line: number, col: number) => Promise<LspRenamePrepare | null>;
    /** Immediate F2 apply (exact-edit preview). */
    renameApplyAt: (line: number, col: number, newName: string) => Promise<LspRenamePreview | null>;
}

/** The Pyright session for the currently open document. */
export function usePyrightLsp(options: UsePyrightLspOptions): PyrightLspSession {
    // Destructure the inputs.
    const {enabled, folderSlug, fileSlug, content, interpreter} = options;

    // ── State (only what must paint) ─────────────────────────────────
    // The session status.
    const [status, setStatus] = React.useState<PyrightLspClientStatus>("off");
    // The latest hover card (with its anchor line).
    const [hover, setHover] = React.useState<{ line: number; title: string; body: string | undefined } | null>(null);
    // The latest diagnostics rows.
    const [diagnostics, setDiagnostics] = React.useState<LspDiagnosticRow[]>([]);

    // ── Refs (everything the async paths must read fresh) ────────────
    // The availability latch: true once a sync succeeded; false after an
    // unavailable answer (never re-probed until the interpreter changes).
    const availableRef = React.useRef(false);
    // The buffer mirror (hover requests must send the CURRENT text).
    const contentRef = React.useRef(content);
    // The interpreter mirror (fallback-latch reset detection).
    const interpreterRef = React.useRef(interpreter);
    // The hover sequence number (stale response dropping).
    const hoverSeqRef = React.useRef(0);
    // The last diagnostics version seen (re-render only on change).
    const diagVersionRef = React.useRef(-1);
    // The previous (folder, file) — the close-on-switch source.
    const prevDocRef = React.useRef<{ folder: string; file: string } | null>(null);

    // Keep the mirrors fresh on every render (no effect needed).
    contentRef.current = content;
    interpreterRef.current = interpreter;

    // ── The document-sync debouncer ──────────────────────────────────
    // Created once; its closure reads the refs, so it never goes stale.
    const docSyncDebouncer = React.useMemo(
        () =>
            createLspDebouncer<{ folder: string; file: string; content: string; interpreter: string | null }>({
                delayMs: DOCUMENT_SYNC_DELAY_MS,
                maxWaitMs: DOCUMENT_SYNC_MAX_WAIT_MS,
                onFlush: (payload) => {
                    // The post (fire-and-forget; the response updates the latch).
                    void postLspDocument(payload).then((ok) => {
                        // An unavailable answer latches the fallback (unless the
                        // interpreter changed since the request — retry then).
                        if (!ok && interpreterRef.current === payload.interpreter) {
                            availableRef.current = false;
                            setStatus("unavailable");
                            return;
                        }
                        // Usable (or the interpreter changed → a new attempt is
                        // legitimate) — latch ready.
                        availableRef.current = ok;
                        setStatus(ok ? "ready" : "unavailable");
                    });
                },
            }),
        []
    );

    // ── The hover debouncer ──────────────────────────────────────────
    // Created once; reads the slugs + mirrors at flush time.
    const hoverDebouncer = React.useMemo(
        () =>
            createLspDebouncer<{ line: number; col: number }>({
                delayMs: HOVER_DELAY_MS,
                maxWaitMs: HOVER_MAX_WAIT_MS,
                onFlush: (payload) => {
                    // The fallback path never sends requests.
                    if (!availableRef.current) return;
                    // Claim a sequence number for this request.
                    const seq = ++hoverSeqRef.current;
                    // The request (the current buffer, not a stale one).
                    void fetchLspHover({
                        folder: folderSlug,
                        file: fileSlug,
                        content: contentRef.current,
                        line: payload.line,
                        col: payload.col,
                        interpreter: interpreterRef.current,
                    }).then((card: LspHoverCard | null) => {
                        // A newer hover superseded this one — drop the answer.
                        if (seq !== hoverSeqRef.current) return;
                        // An unavailable answer latches the fallback.
                        if (!card && !availableRef.current) return;
                        // The card (null clears a stale one).
                        setHover(card ? {line: payload.line, title: card.title, body: card.body} : null);
                    });
                },
            }),
        [folderSlug, fileSlug]
    );

    // ── Document lifecycle: open / change / close ────────────────────
    React.useEffect(() => {
        // Not a Python file — everything off.
        if (!enabled || !folderSlug || !fileSlug) {
            // Normalize the status.
            setStatus("off");
            // Drop pending syncs + hovers.
            docSyncDebouncer.cancel();
            hoverDebouncer.cancel();
            // Clear the visible state.
            setHover(null);
            setDiagnostics([]);
            diagVersionRef.current = -1;
            // Forget the previous document.
            prevDocRef.current = null;
            return;
        }

        // A FILE SWITCH: close the previous document on the server.
        const prev = prevDocRef.current;
        if (prev && (prev.folder !== folderSlug || prev.file !== fileSlug)) {
            // Fire-and-forget close (the old uri's diagnostics die with it).
            void postLspDocument({folder: prev.folder, file: prev.file, close: true});
            // Clear the per-file state immediately.
            setHover(null);
            setDiagnostics([]);
            diagVersionRef.current = -1;
        }
        // Remember the current document for the next switch.
        prevDocRef.current = {folder: folderSlug, file: fileSlug};

        // An interpreter CHANGE is handled by the dependency array: the
        // debouncer receives a payload carrying the NEW interpreter, the
        // server restarts against it, and the sync response re-latches the
        // availability below.

        // Entering "starting" until the first sync answers.
        setStatus((s) => (s === "ready" || s === "unavailable" ? s : "starting"));
        // Queue the debounced sync (didOpen on first sight / didChange).
        docSyncDebouncer.push({folder: folderSlug, file: fileSlug, content, interpreter: interpreter ?? null});

        // The cleanup: cancel pending work (the NEXT effect run re-arms).
        return () => {
            docSyncDebouncer.cancel();
            hoverDebouncer.cancel();
        };
    }, [enabled, folderSlug, fileSlug, content, interpreter, docSyncDebouncer, hoverDebouncer]);

    // ── Unmount: close the document on the server ────────────────────
    React.useEffect(() => {
        // Capture the identity for the cleanup.
        const doc = {folder: folderSlug, file: fileSlug};
        return () => {
            // Only close what we opened.
            if (doc.folder && doc.file) {
                // Fire-and-forget close.
                void postLspDocument({folder: doc.folder, file: doc.file, close: true});
            }
        };
    }, [folderSlug, fileSlug]);

    // ── Diagnostics poll (the pull side of live diagnostics) ─────────
    React.useEffect(() => {
        // Only poll while usable.
        if (!enabled || !folderSlug || !fileSlug || status !== "ready") return;
        // The poll timer.
        const timer = setInterval(() => {
            // The pull.
            void fetchLspDiagnostics(folderSlug, fileSlug).then((result) => {
                // No answer — keep the previous rows.
                if (!result) return;
                // An empty batch with version 0 = nothing published yet.
                if (result.version === 0 && result.diagnostics.length === 0) return;
                // Re-render only when the version moved.
                if (result.version === diagVersionRef.current) return;
                // Remember the version.
                diagVersionRef.current = result.version;
                // Store the rows.
                setDiagnostics(result.diagnostics);
                // Relay to the Problems panel through the app's event bus.
                try {
                    window.dispatchEvent(
                        new CustomEvent("praxis:lsp-diagnostics", {
                            detail: {folderSlug, fileSlug, diagnostics: result.diagnostics},
                        })
                    );
                } catch {
                    /* no window — nothing to relay to */
                }
            });
        }, DIAGNOSTICS_POLL_MS);
        // Stop polling when the file changes / unmounts.
        return () => clearInterval(timer);
    }, [enabled, folderSlug, fileSlug, status]);

    // ── The imperative surface ───────────────────────────────────────
    // Debounced hover request.
    const requestHover = React.useCallback(
        (line: number, col: number) => {
            // The fallback path never fires requests.
            if (!availableRef.current) return;
            // Queue the debounced request.
            hoverDebouncer.push({line, col});
        },
        [hoverDebouncer]
    );

    // Immediate F12 definition.
    const definitionAt = React.useCallback(
        async (line: number, col: number): Promise<LspDefinitionResult | null> => {
            // The fallback answer.
            if (!availableRef.current) return null;
            // The direct call.
            return fetchLspDefinition({
                folder: folderSlug,
                file: fileSlug,
                content: contentRef.current,
                line,
                col,
                interpreter: interpreterRef.current,
            });
        },
        [folderSlug, fileSlug]
    );

    // Immediate ⇧F12 references.
    const referencesAt = React.useCallback(
        async (line: number, col: number): Promise<ReferenceHit[]> => {
            // The fallback answer.
            if (!availableRef.current) return [];
            // The direct call.
            return fetchLspReferences({
                folder: folderSlug,
                file: fileSlug,
                content: contentRef.current,
                line,
                col,
                interpreter: interpreterRef.current,
            });
        },
        [folderSlug, fileSlug]
    );

    // Immediate F2 prepare probe.
    const renamePrepareAt = React.useCallback(
        async (line: number, col: number): Promise<LspRenamePrepare | null> => {
            // The fallback answer.
            if (!availableRef.current) return null;
            // The direct call.
            return fetchLspRenamePrepare({
                folder: folderSlug,
                file: fileSlug,
                content: contentRef.current,
                line,
                col,
                interpreter: interpreterRef.current,
            });
        },
        [folderSlug, fileSlug]
    );

    // Immediate F2 apply.
    const renameApplyAt = React.useCallback(
        async (line: number, col: number, newName: string): Promise<LspRenamePreview | null> => {
            // The fallback answer.
            if (!availableRef.current) return null;
            // The direct call.
            return fetchLspRenameApply(
                {
                    folder: folderSlug,
                    file: fileSlug,
                    content: contentRef.current,
                    line,
                    col,
                    interpreter: interpreterRef.current,
                },
                newName
            );
        },
        [folderSlug, fileSlug]
    );

    // The session surface.
    return {status, hover, diagnostics, requestHover, definitionAt, referencesAt, renamePrepareAt, renameApplyAt};
}
