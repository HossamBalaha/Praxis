/**
 * shared spell-check rendering helpers.
 *
 * markSpellWords used to live inside file-viewer.tsx (module scope);
 * the wavy-underline marks are now needed in THREE places — the
 * FileViewer's read view, the FileViewer's EDIT textarea (an overlay
 * that mirrors the textarea's metrics) and the Markdown studio's
 * source editor — so the walker moved here to avoid a circular
 * import (file-viewer → markdown-studio → file-viewer).
 *
 *: clicking a misspelled word used to silently add it
 * to the project dictionary (the word vanished — felt like the
 * underline was just disappearing). Clicking now opens a small
 * OPTIONS popover anchored under the word. Nothing disappears
 * without an explicit choice.
 *
 * Each "did you mean" suggestion row carries THREE explicit
 * buttons: replace-everywhere (swap the misspelling everywhere in
 * the buffer), copy (clipboard) and replace-in-place (swap ONLY the
 * clicked occurrence). Surfaces that cannot replace (no save path
 * wired) omit the onReplace / onReplaceOnce props and those buttons
 * stay hidden.
 *
 * The popover renders through a PORTAL on document.body with
 * position:fixed anchored to the word's viewport rect — the chip
 * wrappers that host these spans (code-viewer's and file-viewer's
 * view-mode spell overlays) are absolutely-positioned one-line-high
 * overflow:hidden boxes, which clipped the old in-flow absolute
 * popover to a ~4px sliver and made "Add to dictionary" unreachable
 * there. A body-level fixed popover escapes ANY overflow container.
 * It also closes on scroll (capture-phase listener) so it can never
 * float stale over scrolled-away text.
 */

import * as React from "react";
import {createPortal} from "react-dom";
import {BookOpen, Copy, Replace as ReplaceIcon} from "lucide-react";
import {loadSettings} from "@/lib/settings";

/** Replace-once icon — a small replace glyph with a locator dot:
 * swap ONLY the clicked occurrence (vs ReplaceIcon's swap-everywhere). */
function ReplaceOnceIcon({className}: { className?: string }) {
    return (
        <span className={`relative inline-flex items-center justify-center ${className ?? ""}`} aria-hidden="true">
      <ReplaceIcon className="size-3"/>
      <span className="absolute -right-0.5 -top-0.5 size-1 rounded-full bg-sky-500"/>
    </span>
    );
}

/** Per-word suggestion cache — the same misspelled word opened in
 * several chips (or re-opened after a scroll-close) hits the API
 * once per session. */
const suggestionCache = new Map<string, string[]>();

/** Escape a word for embedding in a RegExp source. */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Swap every word-boundary occurrence of `word` for `suggestion`,
 * preserving a leading capital ("Helo" → "Hello", "helo" → "hello"). */
export function replaceWordEverywhere(src: string, word: string, suggestion: string): string {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "g");
    const cap = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
    const replacement = cap && suggestion ? suggestion[0].toUpperCase() + suggestion.slice(1) : suggestion;
    return src.replace(re, replacement);
}

/** Open the project dictionary manager from anywhere (the popover's
 * "Project dictionary…" item dispatches this; page.tsx listens and
 * opens the dialog — the same manager as Tools ▸ Project dictionary…). */
export function openProjectDictionary(): void {
    try {
        window.dispatchEvent(new Event("praxis:open-project-dictionary"));
    } catch {
        /* older browsers */
    }
}

/** The wavy underline — an inline SVG CHILD element, not a CSS
 * background-image or text-decoration.
 *
 * Both older paint paths could be left at a STALE screen position
 * while the element scrolls in some Chromium states (the
 * "zigzag line fixed on the screen while the words move up/down"
 * effect). A real DOM child is composited with its parent's layer
 * atomically — layout moves it with the words in every scroll state
 * (view + edit, both viewers, the marked twin, the overlay chips).
 * The wave tiles via an SVG <pattern>, so it keeps its exact 8px
 * period at ANY word width. */
export function WaveUnderline({color}: { color: string }) {
    const pid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
    return (
        <svg
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 w-full"
            style={{height: 3}}
            data-spell-wave="true"
        >
            <defs>
                <pattern id={`w${pid}`} width="8" height="3" patternUnits="userSpaceOnUse">
                    <path d="M0 1.5 Q1 -0.3 2 1.5 T4 1.5 T6 1.5 T8 1.5" fill="none" stroke={color} strokeWidth="1"/>
                </pattern>
            </defs>
            <rect width="100%" height="3" fill={`url(#w${pid})`}/>
        </svg>
    );
}

export interface SpellIssueMarkArgs {
    words: Set<string>;
    onIgnore: (word: string) => void;
}

/** One misspelled word + its popover. The span keeps the wavy
 * underline; the click that used to auto-ignore now toggles the
 * popover below. Exported — the FileViewer's view-mode overlay
 * (CodeViewSurface) reuses the exact same word chip + popover.
 *
 * Popover placement: portaled to document.body, position:fixed from
 * the trigger's getBoundingClientRect (viewport coords). Flips
 * above the word when the menu would overflow the viewport bottom;
 * left is clamped so a word near the right edge keeps the w-64 menu
 * on screen. */
export function SpellWordSpan({
                                  word,
                                  onIgnore,
                                  onReplace,
                                  onReplaceOnce,
                              }: {
    word: string;
    onIgnore: (word: string) => void;
    /** Replace-everywhere — swaps every word-boundary occurrence of
     *  `word` for the picked suggestion in the buffer behind this
     *  view. Omitted → the per-suggestion Replace button stays
     *  hidden. */
    onReplace?: (word: string, suggestion: string) => void;
    /** Replace-in-place — swaps ONLY the occurrence this chip marks
     *  (the one the user clicked) for the picked suggestion. Omitted
     *  → the per-row "replace in place" button stays hidden. */
    onReplaceOnce?: (word: string, suggestion: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [note, setNote] = React.useState<string | null>(null);
    // Fixing suggestions ("did you mean…") — fetched lazily when the
    // popover opens, honoring the spellSuggestions /
    // spellSuggestionCount settings. Null = not loaded yet; [] = none.
    const [suggestions, setSuggestions] = React.useState<string[] | null>(null);
    const wrapRef = React.useRef<HTMLSpanElement | null>(null);
    // The portaled menu (lives on document.body, NOT inside wrapRef).
    const menuRef = React.useRef<HTMLSpanElement | null>(null);
    // Viewport-space placement for the fixed popover. Null = closed /
    // not yet placed — the menu only renders once placed, so it never
    // flashes at a stale position.
    const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

    const close = React.useCallback(() => {
        setOpen(false);
        setPos(null);
    }, []);

    const toggle = React.useCallback(() => {
        if (open) {
            close();
            return;
        }
        // Anchor below the word in viewport coords (fixed positioning).
        // The layout effect below re-clamps/flips once the menu mounts.
        const r = wrapRef.current?.getBoundingClientRect();
        if (r) setPos({top: r.bottom + 4, left: r.left});
        setOpen(true);
        // Suggestions — lazy, cached, gated by the settings.
        setSuggestions(null);
        try {
            const s = loadSettings();
            if (s.spellSuggestions) {
                const limit = Math.max(1, Math.min(8, s.spellSuggestionCount || 3));
                const cached = suggestionCache.get(word.toLowerCase());
                if (cached) {
                    setSuggestions(cached);
                } else {
                    void fetch("/api/spell", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({action: "suggest", word, limit, dict: loadSettings().spellLanguage}),
                    })
                        .then((r) => (r.ok ? r.json() : {suggestions: []}))
                        .then((data: { suggestions?: string[] }) => {
                            const list = Array.isArray(data.suggestions) ? data.suggestions.slice(0, limit) : [];
                            suggestionCache.set(word.toLowerCase(), list);
                            setSuggestions(list);
                        })
                        .catch(() => setSuggestions([]));
                }
            } else {
                setSuggestions([]);
            }
        } catch {
            setSuggestions([]);
        }
    }, [open, close, word]);

    // Place the menu if the toggle couldn't read a rect yet. Runs
    // pre-paint, so there is no visible jump.
    React.useLayoutEffect(() => {
        if (!open || pos) return;
        const r = wrapRef.current?.getBoundingClientRect();
        if (r) setPos({top: r.bottom + 4, left: r.left});
    }, [open, pos]);

    // Re-clamp after the menu mounts (and when the copy-note changes
    // its height): flip above the word when the menu would overflow
    // the viewport bottom; clamp left so the w-64 (~256px) menu stays
    // on screen for words near the right edge.
    React.useLayoutEffect(() => {
        if (!open || !pos || !menuRef.current) return;
        const menu = menuRef.current;
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r) return;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const MARGIN = 8;
        const GAP = 4;
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        let top = r.bottom + GAP;
        if (top + h > vh - MARGIN) {
            // Flip above (trigger top − menu height); if even that
            // overflows (tiny viewport), pin to the bottom margin.
            top = Math.max(MARGIN, r.top - GAP - h);
        }
        const left = Math.min(
            Math.max(MARGIN, r.left),
            Math.max(MARGIN, vw - w - MARGIN)
        );
        setPos((prev) =>
            prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5
                ? prev
                : {top, left}
        );
    }, [open, pos, note]);

    // Close on any outside click / Esc while open, and on ANY scroll
    // (capture phase — the code container's scroll doesn't bubble, but
    // a capturing window listener still sees it) so the fixed popover
    // never floats stale over scrolled-away text. The outside-click
    // check includes menuRef: the menu is portaled to document.body,
    // so wrapRef.contains() alone would treat clicks INSIDE the menu
    // as outside and close it before the menuitem's click could fire.
    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node | null;
            if (!t) return;
            if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
            close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        const onScroll = () => close();
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open, close]);

    const copyText = (text: string, message: string) => {
        void navigator.clipboard?.writeText(text).then(() => {
            setNote(message);
            window.setTimeout(() => setNote(null), 2200);
        });
    };

    const doReplace = (s: string) => {
        close();
        onReplace?.(word, s);
    };

    const doReplaceOnce = (s: string) => {
        close();
        onReplaceOnce?.(word, s);
    };

    // The popover content — rendered into a document.body portal (see
    // header). position:fixed + viewport coords means NO ancestor's
    // overflow:hidden (the one-line chip wrappers) can clip it.
    const menu = open && pos ? (
        <span
            ref={menuRef}
            role="menu"
            aria-label={`Options for the misspelled word "${word}"`}
            className="fixed z-50 flex w-64 flex-col gap-0.5 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            onClick={(e) => e.stopPropagation()}
            style={{position: "fixed", top: `${pos.top}px`, left: `${pos.left}px`}}
        >
      <span className="block break-words px-2 py-1 text-[10px] font-medium text-muted-foreground">
        &ldquo;{word}&rdquo; — not in the dictionary
      </span>
            {/* Fixing suggestions — "did you mean …" near-matches from the
          dictionary, best-first. Every row carries THREE explicit
          buttons: REPLACE-EVERYWHERE, COPY (clipboard) and
          REPLACE-IN-PLACE (swap only the clicked occurrence); the row
          itself runs the primary replace when the host wired one.
          Gated by Settings → Editor → spell suggestions. */}
            {suggestions !== null && suggestions.length > 0 && (
                <>
          <span
              className="block px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Did you mean
          </span>
                    {suggestions.map((s) => (
                        <span
                            key={s}
                            role="menuitem"
                            tabIndex={0}
                            className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent"
                            title={onReplace ? `Replace every “${word}” in this file with “${s}”` : `Copy “${s}”`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onReplace) doReplace(s);
                                else copyText(s, `“${s}” copied`);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.stopPropagation();
                                    if (onReplace) doReplace(s);
                                    else copyText(s, `“${s}” copied`);
                                }
                            }}
                        >
              <span aria-hidden className="text-emerald-500 shrink-0">↷</span>
              <span className="flex-1 truncate">{s}</span>
                            {/* Button 1 — REPLACE every occurrence in this file. */}
                            {onReplace && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Replace every “${word}” with “${s}” in this file`}
                                    title={`Replace every “${word}” in this file with “${s}”`}
                                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        doReplace(s);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            doReplace(s);
                                        }
                                    }}
                                >
                  <ReplaceIcon className="size-3" aria-hidden="true"/>
                </span>
                            )}
                            {/* Button 2 — COPY the suggestion to the clipboard. */}
                            <span
                                role="button"
                                tabIndex={0}
                                aria-label={`Copy the suggestion “${s}” to the clipboard`}
                                title={`Copy “${s}” to the clipboard`}
                                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copyText(s, `“${s}” copied — paste it over “${word}”`);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        copyText(s, `“${s}” copied — paste it over “${word}”`);
                                    }
                                }}
                            >
                <Copy className="size-3" aria-hidden="true"/>
              </span>
                            {/* Button 3 — REPLACE IN PLACE: only the clicked
                  occurrence becomes the suggestion. */}
                            {onReplaceOnce && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Replace only this “${word}” with “${s}”`}
                                    title={`Replace in place — only this “${word}” becomes “${s}”`}
                                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-sky-600 hover:bg-sky-500/15 dark:text-sky-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        doReplaceOnce(s);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            doReplaceOnce(s);
                                        }
                                    }}
                                >
                  <ReplaceOnceIcon className="size-3"/>
                </span>
                            )}
            </span>
                    ))}
                </>
            )}
            {suggestions === null && (
                <span className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
          <span className="inline-block size-2.5 animate-spin rounded-full border border-current border-t-transparent"
                aria-hidden/>
          Looking for fixes…
        </span>
            )}
            <span
                role="menuitem"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                onClick={(e) => {
                    e.stopPropagation();
                    close();
                    onIgnore(word);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        close();
                        onIgnore(word);
                    }
                }}
            >
        <span aria-hidden className="text-emerald-500">+</span>
        Add to project dictionary
      </span>
            {/* The dictionary MANAGER — the same dialog as Tools ▸ Project
          dictionary…, one click away from the word that needed it. */}
            <span
                role="menuitem"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                title="Open the project dictionary manager — every ignored word, when it was added, add / remove / clear"
                onClick={(e) => {
                    e.stopPropagation();
                    close();
                    openProjectDictionary();
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        close();
                        openProjectDictionary();
                    }
                }}
            >
        <BookOpen className="size-3 text-emerald-500" aria-hidden="true"/>
        <span className="flex-1">Project dictionary…</span>
        <span className="text-[9px] text-muted-foreground">Tools ▸</span>
      </span>
      <span
          role="menuitem"
          tabIndex={0}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
          onClick={(e) => {
              e.stopPropagation();
              copyText(word, `"${word}" copied`);
          }}
          onKeyDown={(e) => {
              if (e.key === "Enter") copyText(word, `"${word}" copied`);
          }}
      >
        <Copy className="size-3 text-muted-foreground" aria-hidden="true"/>
        <span className="flex-1">Copy the word</span>
      </span>
      <span
          role="menuitem"
          tabIndex={0}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          onClick={(e) => {
              e.stopPropagation();
              close();
          }}
          onKeyDown={(e) => {
              if (e.key === "Enter") close();
          }}
      >
        <span aria-hidden>×</span>
        Dismiss
      </span>
            {note && (
                <span className="block px-2 pb-1 pt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
          {note}
        </span>
            )}
    </span>
    ) : null;

    return (
        <span
            ref={wrapRef}
            className="spell-miss relative inline-block"
            title={`"${word}" is not in the dictionary — click for options`}
        >
      <span
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              toggle();
          }}
          onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
              }
          }}
      >
        {word}
      </span>
            {/* The wavy line — a real DOM child (see WaveUnderline), glued
          to the word through every scroll/paint state. */}
            <WaveUnderline color="#ef4444"/>
            {menu && typeof document !== "undefined"
                ? createPortal(menu, document.body)
                : null}
    </span>
    );
}

/**
 * Wrap every occurrence of a misspelled word inside a text node with a
 * clickable .spell-miss span (wavy red underline; click = options
 * popover — add to dictionary / copy / replace / dismiss). Strings are
 * split on word boundaries; React elements pass through untouched.
 */
export function markSpellWords(
    children: React.ReactNode,
    words: Set<string>,
    onIgnore: (word: string) => void,
    onReplace?: (word: string, suggestion: string) => void,
    onReplaceOnce?: (word: string, suggestion: string) => void
): React.ReactNode {
    if (words.size === 0 || children == null || children === false) return children;
    const walk = (node: React.ReactNode): React.ReactNode => {
        if (typeof node === "string") {
            if (!node.trim()) return node;
            const re = new RegExp(`\\b(${[...words].map(escapeRegExp).join("|")})\\b`, "g");
            const out: React.ReactNode[] = [];
            let last = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(node)) !== null) {
                if (m.index > last) out.push(node.slice(last, m.index));
                const hit = m[1];
                out.push(
                    <SpellWordSpan
                        key={`sw-${out.length}`}
                        word={hit}
                        onIgnore={onIgnore}
                        onReplace={onReplace}
                        onReplaceOnce={onReplaceOnce}
                    />
                );
                last = m.index + hit.length;
            }
            if (last < node.length) out.push(node.slice(last));
            return out.length > 0 ? out : node;
        }
        if (Array.isArray(node)) {
            return node.map((child, i) => {
                const marked = walk(child);
                if (Array.isArray(marked) && !React.isValidElement(child)) {
                    return <React.Fragment key={i}>{marked}</React.Fragment>;
                }
                return marked;
            });
        }
        return node;
    };
    return walk(children);
}
