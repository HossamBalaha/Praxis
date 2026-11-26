/**
 * editor-lsp-actions.ts — the LSP-first orchestration behind the
 * editor's three navigation gestures (F12, ⇧F12, F2), kept OUT of
 * code-viewer.tsx so the 8.6k-line viewer stays at its line budget and
 * the decision ladder itself is unit-testable.
 *
 * The ladder for every gesture is the same:
 *
 *   1. Is the sidecar usable?    (available latch, set by use-pyright-lsp)
 *   2. Is there a POSITION?      (a caret / click cell — view mode has
 *                                 no real caret, so it stashes the last
 *                                 click or hovered word)
 *   3. Ask the sidecar.          (immediate — user-initiated, never debounced)
 *   4. On a real answer → act.   (jump / fill the popup / open the dialog)
 *   5. On no answer → fall back. (the pre-LSP text-search heuristics —
 *                                 return false and the caller runs them)
 *
 * The functions never touch React or the DOM; callers pass callbacks.
 */

import type {LspDefinitionResult} from "@/lib/pyright-client";
import type {ReferenceHit} from "@/lib/peek-references";

/** The minimal session surface these actions need (implemented by use-pyright-lsp). */
export interface LspActionSession {
    definitionAt: (line: number, col: number) => Promise<LspDefinitionResult | null>;
    referencesAt: (line: number, col: number) => Promise<ReferenceHit[]>;
}

/** The callbacks gotoDefinitionViaLsp drives on success. */
export interface GotoDefinitionCallbacks {
    /** Jump to an in-project target (the page's guardedSelectFile + jumpToLine). */
    onJump: (target: { folderSlug: string; fileSlug: string; line: number }) => void;
    /** The definition lives outside the project (stdlib / site-packages). */
    onExternal: (count: number) => void;
}

/**
 * F12 go-to-definition, LSP-first. Returns TRUE when the gesture was
 * fully handled (the caller must NOT run its fallback); FALSE when the
 * caller should fall back to its text-search path.
 */
export async function gotoDefinitionViaLsp(
    session: LspActionSession | null,
    position: { line: number; col: number } | null,
    callbacks: GotoDefinitionCallbacks
): Promise<boolean> {
    // No session (pyright unavailable) — the fallback owns this.
    if (!session) return false;
    // No position to ask about — the fallback owns this.
    if (!position || position.line < 1 || position.col < 1) return false;
    // Ask the sidecar (immediate — the user pressed a key).
    const result = await session.definitionAt(position.line, position.col);
    // No answer (unavailable / timeout) — the fallback owns this.
    if (!result || !result.available) return false;
    // In-project targets — jump to the FIRST (pyright orders them by
    // relevance; additional overloads are rare in user code).
    if (result.targets.length > 0) {
        // The chosen target.
        const target = result.targets[0]!;
        // Hand the jump to the caller.
        callbacks.onJump({folderSlug: target.folderSlug, fileSlug: target.fileSlug, line: target.line});
        // Fully handled.
        return true;
    }
    // External-only (the definition is in an installed package).
    if (result.externalCount > 0) {
        // Report it (the caller toasts "definition is in <package>").
        callbacks.onExternal(result.externalCount);
        // Fully handled — text search would only find same-name red herrings.
        return true;
    }
    // The sidecar answered "no definition found" — let the fallback try
    // its heuristic (dynamic patterns pyright cannot resolve).
    return false;
}

/**
 * ⇧F12 peek references, LSP-first. Returns the hits when the sidecar
 * answered with at least one (the popup shows them verbatim — the SAME
 * ReferenceHit shape the text search produces), or null when the caller
 * should fall back to the text-search popup.
 */
export async function referencesViaLsp(
    session: LspActionSession | null,
    position: { line: number; col: number } | null
): Promise<ReferenceHit[] | null> {
    // No session — the fallback owns this.
    if (!session) return null;
    // No position — the fallback owns this.
    if (!position || position.line < 1 || position.col < 1) return null;
    // Ask the sidecar.
    const hits = await session.referencesAt(position.line, position.col);
    // No hits — the fallback owns this.
    if (hits.length === 0) return null;
    // The semantic hits.
    return hits;
}
