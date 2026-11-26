"use client";

/**
 * Interactive first-launch tutorial.
 *
 * A tiny, dependency-free 5-step walkthrough that fires the first time
 * a user opens the app (gated by a localStorage flag). Each step dims
 * the page, highlights a target element (looked up by a CSS selector),
 * and shows a card with a title, description, and Next/Skip buttons.
 *
 * The implementation is intentionally minimal — no animations, no
 * arrow-curve math, no scroll-spying. When a target element can't be
 * found (e.g. the output panel is hidden because no run has happened
 * yet) we still show the card centered on screen so the user isn't
 * stuck on a blank overlay.
 */

import * as React from "react";
import {STORAGE_PREFIX} from "@/lib/config";
import {Button} from "@/components/ui/button";
import {ArrowRight, ChevronRight, Sparkles, X} from "lucide-react";

const TUTORIAL_DONE_KEY = `${STORAGE_PREFIX}.tutorial-done`;

interface TutorialStep {
    /** CSS selector for the element to highlight. Empty = centered card. */
    selector?: string;
    title: string;
    description: string;
    /** Approximate placement of the card relative to the highlighted area. */
    placement: "below" | "above" | "right" | "center";
}

const STEPS: TutorialStep[] = [
    {
        selector: '[data-tutorial="sidebar"]',
        title: "Welcome to Praxis!",
        description:
            "Pick a folder from the sidebar on the left — folders are the top-level directories under the project root. Click any file to load it.",
        placement: "right",
    },
    {
        selector: '[data-tutorial="code-viewer"]',
        title: "Read the code",
        description:
            "The code viewer shows your script with syntax highlighting. Click \"Show full code\" to expand long files, or Edit to make changes inline.",
        placement: "below",
    },
    {
        selector: '[data-tutorial="run-button"]',
        title: "Run your script",
        description:
            "Click the green Run button (or press Ctrl+Enter) to execute the script. While a run is in flight the button turns into a red Stop.",
        placement: "below",
    },
    {
        selector: '[data-tutorial="output-panel"]',
        title: "View output",
        description:
            "The output panel below shows streaming stdout/stderr, captured figures, and (optionally) inspected variables from your script.",
        placement: "above",
    },
    {
        selector: "",
        title: "You're all set!",
        description:
            "Press Ctrl+K to search, Ctrl+Shift+P for the command palette, or Ctrl+/ for snippets. Enjoy!",
        placement: "center",
    },
];

/**
 * Compute the bounding rect of the target element for the current step.
 * Returns null if the element can't be found or has zero area. Re-runs
 * on step change, window resize, and window scroll so the highlight
 * tracks the target as the layout shifts.
 */
function useTargetRect(selector: string | undefined): DOMRect | null {
    const [rect, setRect] = React.useState<DOMRect | null>(null);

    React.useEffect(() => {
        if (!selector) {
            setRect(null);
            return;
        }
        const recompute = () => {
            const el = document.querySelector<HTMLElement>(selector);
            if (!el) {
                setRect((prev) => (prev === null ? prev : null));
                return;
            }
            const r = el.getBoundingClientRect();
            // Treat zero-area elements (e.g. display:none) as "not found"
            // so the card falls back to the centered layout.
            if (r.width === 0 && r.height === 0) {
                setRect((prev) => (prev === null ? prev : null));
                return;
            }
            // Only setState if the rect's values actually changed — avoids
            // a busy-loop where the MutationObserver fires on every DOM
            // mutation (including the tutorial's own overlay updates),
            // each causing a re-render + DOM change + another observer fire.
            setRect((prev) => {
                if (
                    prev &&
                    prev.top === r.top &&
                    prev.left === r.left &&
                    prev.width === r.width &&
                    prev.height === r.height
                ) {
                    return prev; // identity check → no re-render
                }
                return r;
            });
        };
        recompute();
        // Recompute on resize / scroll. Slight churn but the tutorial is
        // short-lived and the cost is one getBoundingClientRect call.
        window.addEventListener("resize", recompute);
        window.addEventListener("scroll", recompute, true);
        // Watch for the target element being lazy-mounted (or unmounted)
        // via a MutationObserver on document.body. Replaces the previous
        // 500ms setInterval polling — fires only when the DOM actually
        // changes, so it's both more responsive and more efficient.
        const observer = new MutationObserver(() => recompute());
        observer.observe(document.body, {childList: true, subtree: true});
        return () => {
            window.removeEventListener("resize", recompute);
            window.removeEventListener("scroll", recompute, true);
            observer.disconnect();
        };
    }, [selector]);

    return rect;
}

/** Persist the "tutorial done" flag so we never show it again. */
function markTutorialDone() {
    try {
        window.localStorage.setItem(TUTORIAL_DONE_KEY, "1");
    } catch {
        /* quota / private mode — ignore */
    }
}

export function Tutorial() {
    // mounted guard so SSR doesn't try to touch localStorage / DOM.
    const [mounted, setMounted] = React.useState(false);
    const [done, setDone] = React.useState(true);
    const [step, setStep] = React.useState(0);

    React.useEffect(() => {
        setMounted(true);
        try {
            const flag = window.localStorage.getItem(TUTORIAL_DONE_KEY);
            setDone(flag === "1");
        } catch {
            // localStorage blocked — treat as already done so the user
            // isn't bombarded with the overlay every page load.
            setDone(true);
        }
    }, []);

    // Listen for the "praxis:show-tutorial" custom event so the Help
    // menu (and any other trigger) can re-show the tutorial without a
    // full page reload. The event clears the "done" flag and resets the
    // step counter so the walkthrough starts from the beginning.
    React.useEffect(() => {
        const showTutorial = () => {
            setStep(0);
            setDone(false);
        };
        window.addEventListener("praxis:show-tutorial", showTutorial);
        return () => window.removeEventListener("praxis:show-tutorial", showTutorial);
    }, []);

    // Don't render anything until we've mounted and confirmed the user
    // hasn't dismissed the tutorial before.
    if (!mounted || done) return null;

    return <TutorialOverlay
        step={step}
        onStep={setStep}
        onClose={() => {
            markTutorialDone();
            setDone(true);
        }}
    />;
}

function TutorialOverlay({
                             step,
                             onStep,
                             onClose,
                         }: {
    step: number;
    onStep: (n: number) => void;
    onClose: () => void;
}) {
    const current = STEPS[step] ?? STEPS[STEPS.length - 1];
    const rect = useTargetRect(current.selector);
    const isLast = step === STEPS.length - 1;

    const handleNext = () => {
        if (isLast) {
            markTutorialDone();
            onClose();
        } else {
            onStep(step + 1);
        }
    };

    const handleSkip = () => {
        markTutorialDone();
        onClose();
    };

    // Card position: based on the target rect + the step's preferred
    // placement. If the target wasn't found, center the card on screen.
    const cardStyle: React.CSSProperties = React.useMemo(() => {
        if (!rect) {
            return {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
            };
        }
        const gap = 16;
        const cardWidth = 360;
        switch (current.placement) {
            case "below":
                return {
                    top: Math.min(rect.bottom + gap, window.innerHeight - 220),
                    left: Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12)),
                };
            case "above":
                return {
                    top: Math.max(12, rect.top - 180),
                    left: Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12)),
                };
            case "right":
                return {
                    top: Math.max(12, Math.min(rect.top, window.innerHeight - 220)),
                    left: Math.min(rect.right + gap, window.innerWidth - cardWidth - 12),
                };
            case "center":
            default:
                return {
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                };
        }
    }, [rect, current.placement]);

    return (
        <div
            className="fixed inset-0 z-[200]"
            role="dialog"
            aria-modal="true"
            aria-label="Tutorial"
        >
            {/* Semi-transparent backdrop — also serves as the click-to-skip
          target. When a target rect is present, the highlight box
          below draws a 9999px box-shadow that re-dims the area around
          the target on top of this, producing a clean spotlight. */}
            <div className="absolute inset-0 bg-black/60" onClick={handleSkip}/>

            {/* Highlight box around the target element. The huge box-shadow
          creates the spotlight cutout (re-darkens everything except
          the target). Skipped if the target couldn't be found. */}
            {rect && (
                <div
                    className="absolute rounded-md ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                    style={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        pointerEvents: "none",
                    }}
                />
            )}

            {/* Arrow from the card toward the target (best-effort, only for
the right-placement step so the user sees where to look). */}
            {rect && current.placement === "right" && (
                <ArrowRight
                    className="absolute size-5 text-emerald-400"
                    style={{
                        left: rect.right + 4,
                        top: rect.top + rect.height / 2 - 10,
                        transform: "scaleX(-1)",
                        pointerEvents: "none",
                    }}
                />
            )}

            {/* The card itself. */}
            <div
                className="absolute w-[360px] max-w-[calc(100vw-1.5rem)] rounded-lg border bg-popover text-popover-foreground shadow-2xl"
                style={cardStyle}
            >
                {/* Header strip */}
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-muted/40 rounded-t-lg">
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="size-4 shrink-0 text-emerald-500"/>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tutorial · Step {step + 1} of {STEPS.length}
            </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleSkip}
                        aria-label="Skip tutorial"
                        title="Skip tutorial"
                        className="size-6 flex items-center justify-center rounded hover:bg-accent shrink-0"
                    >
                        <X className="size-3.5"/>
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-2">
                    <h3 className="text-sm font-semibold">{current.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {current.description}
                    </p>
                </div>

                {/* Footer with step dots + Next/Skip */}
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t bg-muted/30 rounded-b-lg">
                    <div className="flex items-center gap-1">
                        {STEPS.map((_, i) => (
                            <span
                                key={i}
                                className={
                                    "size-1.5 rounded-full " +
                                    (i === step
                                        ? "bg-emerald-500"
                                        : i < step
                                            ? "bg-emerald-500/40"
                                            : "bg-muted-foreground/30")
                                }
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isLast && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={handleSkip}
                            >
                                Skip
                            </Button>
                        )}
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={handleNext}
                        >
                            {isLast ? "Get started" : "Next"}
                            <ChevronRight className="size-3.5"/>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
