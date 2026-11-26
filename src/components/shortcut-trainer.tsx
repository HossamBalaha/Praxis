"use client";

/**
 * — the keyboard-shortcut trainer.
 *
 * Two modes over the shared shortcut registry (lib/shortcuts.ts):
 *
 * Browse — searchable, grouped cheat sheet (effective bindings,
 * i.e. custom rebinding is respected).
 * Practice — shows a random action's name, waits for the user to
 * press the combo, and checks it with the same matcher the
 * real shortcut handler uses (matchesKeyCombo). Green on
 * hit, red + the correct keys on miss; streak counter for
 * fun. Esc always exits practice mode.
 */
import * as React from "react";
import {getEffectiveShortcut, keyEventToCombo, matchesKeyCombo, SHORTCUT_GROUPS,} from "@/lib/shortcuts";

interface FlatShortcut {
    group: string;
    id: string;
    keys: string;
    action: string;
}

const FLAT: FlatShortcut[] = SHORTCUT_GROUPS.flatMap((g) =>
    g.items.map((i) => ({
        group: g.group,
        id: i.id,
        keys: getEffectiveShortcut(i.id) ?? i.keys,
        action: i.action,
    }))
);

export function ShortcutTrainer({
                                    open,
                                    onOpenChange,
                                }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const [query, setQuery] = React.useState("");
    const [practice, setPractice] = React.useState(false);
    const [target, setTarget] = React.useState<FlatShortcut | null>(null);
    const [feedback, setFeedback] = React.useState<
        { ok: boolean; text: string } | null
    >(null);
    const [streak, setStreak] = React.useState(0);

    const nextTarget = React.useCallback(() => {
        setFeedback(null);
        setTarget(FLAT[Math.floor(Math.random() * FLAT.length)]);
    }, []);

    React.useEffect(() => {
        if (practice && !target) nextTarget();
        if (!practice) {
            setTarget(null);
            setFeedback(null);
            setStreak(0);
        }
    }, [practice, target, nextTarget]);

    // Practice-mode key listener — attached to window while practicing.
    React.useEffect(() => {
        if (!practice) return;
        const onKey = (e: KeyboardEvent) => {
            // Let the user leave practice mode with Esc.
            if (e.key === "Escape") {
                setPractice(false);
                return;
            }
            const combo = keyEventToCombo(e);
            if (!combo) return;
            // Ignore bare modifier presses.
            if (["Meta", "Ctrl", "Alt", "Shift", "CapsLock"].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            if (target && matchesKeyCombo(e, target.keys)) {
                setStreak((s) => s + 1);
                setFeedback({ok: true, text: `Correct — ${target.keys}`});
                setTimeout(nextTarget, 700);
            } else {
                setStreak(0);
                setFeedback({
                    ok: false,
                    text: `Not quite — that was “${combo}”. The answer is ${target?.keys}`,
                });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [practice, target, nextTarget]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return FLAT;
        return FLAT.filter(
            (s) =>
                s.action.toLowerCase().includes(q) ||
                s.keys.toLowerCase().includes(q) ||
                s.group.toLowerCase().includes(q)
        );
    }, [query]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcut trainer"
            onClick={(e) => {
                if (e.target === e.currentTarget) onOpenChange(false);
            }}
        >
            <div
                className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg border border-border bg-background shadow-xl">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold flex-1">
                        Keyboard shortcuts
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              {FLAT.length} bindings · custom rebindings included
            </span>
                    </h2>
                    <button
                        onClick={() => setPractice((p) => !p)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium border ${
                            practice
                                ? "border-emerald-500 text-emerald-500"
                                : "border-border hover:bg-accent"
                        }`}
                        title="Practice mode — press the combo for the shown action"
                    >
                        {practice ? "✓ Practicing" : "Practice mode"}
                    </button>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                        Close
                    </button>
                </div>

                {practice ? (
                    <div
                        className="flex-1 min-h-[260px] flex flex-col items-center justify-center gap-4 p-6 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Press the shortcut for
                        </p>
                        <p className="text-lg font-semibold px-4">{target?.action}</p>
                        <p className="text-[10px] text-muted-foreground">
                            from the “{target?.group}” group · Esc to exit practice
                        </p>
                        {feedback ? (
                            <p
                                className={`text-sm font-medium ${
                                    feedback.ok ? "text-emerald-500" : "text-red-400"
                                }`}
                            >
                                {feedback.text}
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">waiting for keys…</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            streak: {streak} {streak >= 5 ? "🔥" : ""}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="px-4 pt-3">
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter by action, keys, or group…"
                                className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-4">
                            {SHORTCUT_GROUPS.map((g) => {
                                const items = filtered.filter((s) => s.group === g.group);
                                if (items.length === 0) return null;
                                return (
                                    <div key={g.group}>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                                            {g.group}
                                        </p>
                                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                            {items.map((s) => (
                                                <li
                                                    key={s.id}
                                                    className="flex items-center gap-2 text-xs rounded px-2 py-1 hover:bg-accent/50"
                                                >
                                                    <kbd
                                                        className="shrink-0 min-w-[3.5rem] text-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                                        {s.keys}
                                                    </kbd>
                                                    <span className="truncate">{s.action}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                            {filtered.length === 0 && (
                                <p className="text-center text-xs text-muted-foreground py-6">
                                    No shortcuts match “{query}”.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
