"use client";

/**
 * use-live-lint-diagnostics.ts — the edit-mode ruff re-lint, extracted
 * from code-viewer.tsx in Phase 3 so the live-diagnostics machinery
 * (ruff + pyright) lives in ONE place outside the 8.6k-line viewer.
 *
 * The problem it solves (unchanged since the original effect): the
 * disk-based `diagnostics` prop goes STALE the moment the buffer edits
 * ("the zigzag is not updated but moves to the next line"). While in
 * edit mode we re-lint the BUFFER (debounced 700 ms) through
 * /api/lint's `content` mode; the returned list then replaces the
 * stale prop for squiggles, the hover tooltip and the header count.
 * null = "no live result yet" → the caller falls back to the disk
 * diagnostics.
 *
 * The pyright half of live diagnostics lives in use-pyright-lsp.ts;
 * the viewer merges both through mergeLspDiagnostics.
 */

import * as React from "react";
import type {Diagnostic} from "@/components/code-viewer-types";

/** The debounce for the buffer re-lint (unchanged from the viewer). */
const LIVE_LINT_DEBOUNCE_MS = 700;

/** The hook's inputs (all fields the original effect read). */
export interface UseLiveLintDiagnosticsOptions {
    /** Only edit mode re-lints the buffer. */
    editMode: boolean;
    /** The disk-based prop — undefined means "no lint data at all". */
    diagnostics: Diagnostic[] | undefined;
    folderSlug: string;
    fileSlug: string;
    /** The CURRENT edit buffer. */
    editContent: string;
    /** The configured interpreter — the disk lint uses it; without it
     *  the live lint falls back to auto-detection, which on machines
     *  where only the SELECTED env has ruff returns `linter: "none"` +
     *  EMPTY diagnostics, and that empty list would REPLACE the visible
     *  disk zigzags (the original zigzag-disappearance bug). */
    pythonInterpreter?: string | null;
}

/**
 * Re-lint the edit buffer through /api/lint's content mode. Returns
 * the live rows (null until the first result arrives).
 */
export function useLiveLintDiagnostics(options: UseLiveLintDiagnosticsOptions): Diagnostic[] | null {
    // Destructure the inputs.
    const {editMode, diagnostics, folderSlug, fileSlug, editContent, pythonInterpreter} = options;

    // The live rows (null = no live result yet).
    const [liveDiagnostics, setLiveDiagnostics] = React.useState<Diagnostic[] | null>(null);
    // The pending debounce timer.
    const liveLintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // The request sequence (a newer edit always wins).
    const liveLintSeqRef = React.useRef(0);

    React.useEffect(() => {
        // Not in edit mode / no lint data / no file identity — no live lint.
        if (!editMode || diagnostics === undefined || !folderSlug || !fileSlug) {
            // Reset to "no live result".
            setLiveDiagnostics(null);
            return;
        }
        // Cancel any pending re-lint (a newer edit supersedes it).
        if (liveLintTimerRef.current) clearTimeout(liveLintTimerRef.current);
        // Claim this round's sequence number.
        const seq = ++liveLintSeqRef.current;
        // The buffer to lint.
        const content = editContent;
        // The debounced re-lint.
        liveLintTimerRef.current = setTimeout(async () => {
            try {
                // The content-mode lint with the CONFIGURED interpreter.
                const res = await fetch("/api/lint", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        file: fileSlug,
                        content,
                        interpreter: pythonInterpreter || undefined
                    }),
                });
                // Transport failure — keep the fallback.
                if (!res.ok) return;
                // Parse the result.
                const data = await res.json();
                // A newer edit won the race — drop this answer.
                if (seq !== liveLintSeqRef.current) return;
                // A "none" live result means NO LINTER in that environment —
                // nothing was checked. Treating it as data would blank the
                // disk diagnostics (the zigzag-disappearance bug); keep the
                // disk fallback instead.
                if (data.linter === "none") {
                    setLiveDiagnostics(null);
                    return;
                }
                // Map the rows to the app's Diagnostic shape.
                const diags: Diagnostic[] = (data.diagnostics ?? []).map(
                    (d: { line: number; col?: number; code?: string; message: string }) => ({
                        line: d.line,
                        col: d.col,
                        // ruff severity heuristic: fatal families (E9 syntax, F7/F8
                        // runtime errors) render red; the rest amber.
                        severity: /^(E9|F7|F8)/.test(d.code ?? "") ? "error" : "warning",
                        message: d.code ? `${d.code} · ${d.message}` : d.message,
                    })
                );
                // Publish the live rows.
                setLiveDiagnostics(diags);
            } catch {
                /* linter unreachable — keep the fallback diagnostics */
            }
        }, LIVE_LINT_DEBOUNCE_MS);
        // Cancel the pending timer when the inputs change / unmount.
        return () => {
            if (liveLintTimerRef.current) clearTimeout(liveLintTimerRef.current);
        };
    }, [editMode, editContent, folderSlug, fileSlug, diagnostics, pythonInterpreter]);

    // The live rows (or null).
    return liveDiagnostics;
}
