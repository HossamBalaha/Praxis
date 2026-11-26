"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {BookOpen, Clock, Loader2, Plus, RefreshCw, Trash2, X} from "lucide-react";

/**
 * ProjectDictionaryDialog — the manager for the PROJECT DICTIONARY
 * (`.praxis/spell-ignore.json`): the words added through the spell
 * popover's "Add to project dictionary" action.
 *
 * ▸ lists every ignored word with WHEN it was added (relative age +
 *   the exact date/time tooltip) and a per-word ✕ (remove);
 * ▸ an input + Add button appends new words directly (stamped with
 *   the add time);
 * ▸ Clear all empties the dictionary in one go;
 * ▸ the refresh button re-reads the file (edits made outside the
 *   app — or in another tab — show up on demand).
 *
 * Every mutation goes through /api/spell (ignore / remove / clear)
 * and the refreshed list comes back in the response, so the dialog
 * never keeps a stale copy. A window event (`praxis:spell-dictionary`)
 * broadcasts after every change so open viewers can re-check their
 * buffers with the updated dictionary.
 */

/** One dictionary entry — the word plus when it was added (null for
 * words carried over from the legacy bare-string list). */
interface DictWord {
    word: string;
    addedAt: string | null;
}

/** "2 min ago"-style age for the add timestamp. Falls back to
 * "unknown" for legacy entries with no timestamp. */
function addedAtLabel(at: string | null): string {
    if (!at) return "added earlier";
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return "added earlier";
    const diff = Date.now() - t;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
    if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)} d ago`;
    return `${new Date(t).toLocaleDateString()} added`;
}

/** Full locale date-time for the tooltip. */
function addedAtFull(at: string | null): string | null {
    if (!at) return null;
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleString();
}

export function ProjectDictionaryDialog({
                                            open,
                                            onOpenChange,
                                            praxisDir,
                                        }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Absolute path of the active project's .praxis folder (for the header caption). */
    praxisDir?: string | null;
}) {
    const {toast} = useToast();
    const [words, setWords] = React.useState<DictWord[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [newWord, setNewWord] = React.useState("");
    const [busyWord, setBusyWord] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState("");

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/spell", {cache: "no-store"});
            const data = (await res.json()) as {
                ok?: boolean;
                ignored?: Array<{ word: string; addedAt?: string | null } | string>;
            };
            const list: DictWord[] = Array.isArray(data.ignored)
                ? data.ignored.map((e) =>
                    typeof e === "string"
                        ? {word: e, addedAt: null}
                        : {word: e.word, addedAt: e.addedAt ?? null}
                )
                : [];
            setWords(list);
        } catch {
            toast({title: "Could not load the project dictionary", variant: "destructive"});
        } finally {
            setLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        if (open) {
            setFilter("");
            setNewWord("");
            void load();
        }
    }, [open, load]);

    /* Re-open while ALREADY open: the popover's "Project dictionary…"
     * item dispatches the same open event no matter the dialog's state —
     * when the dialog is already showing, the page's open(true) is a
     * no-op state write and the mount effect above never re-fires. This
     * listener reloads the list in that case, so a word added a moment
     * ago is never hidden behind a stale "empty" view. */
    React.useEffect(() => {
        if (!open) return;
        const onOpenAgain = () => void load();
        window.addEventListener("praxis:open-project-dictionary", onOpenAgain);
        return () => window.removeEventListener("praxis:open-project-dictionary", onOpenAgain);
    }, [open, load]);

    const broadcast = () => {
        try {
            window.dispatchEvent(new Event("praxis:spell-dictionary"));
        } catch {
            /* older browsers */
        }
    };

    const applyList = (ignored: Array<{ word: string; addedAt?: string | null } | string> | undefined) => {
        const list: DictWord[] = Array.isArray(ignored)
            ? ignored.map((e) =>
                typeof e === "string"
                    ? {word: e, addedAt: null}
                    : {word: e.word, addedAt: e.addedAt ?? null}
            )
            : [];
        setWords(list);
    };

    const addWord = async (raw: string) => {
        const word = raw.trim();
        if (!word) return;
        setBusyWord(word);
        try {
            const res = await fetch("/api/spell", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "ignore", word}),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                ignored?: Array<{ word: string; addedAt?: string | null } | string>;
                error?: string
            };
            if (!res.ok || !data.ok) throw new Error(data.error ?? "HTTP error");
            applyList(data.ignored);
            setNewWord("");
            broadcast();
        } catch (err) {
            toast({title: "Could not add the word", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusyWord(null);
        }
    };

    const removeWord = async (word: string) => {
        setBusyWord(word);
        try {
            const res = await fetch("/api/spell", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "remove", word}),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                ignored?: Array<{ word: string; addedAt?: string | null } | string>;
                error?: string
            };
            if (!res.ok || !data.ok) throw new Error(data.error ?? "HTTP error");
            applyList(data.ignored);
            broadcast();
        } catch (err) {
            toast({title: "Could not remove the word", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusyWord(null);
        }
    };

    const clearAll = async () => {
        setBusyWord("__clear__");
        try {
            const res = await fetch("/api/spell", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "clear"}),
            });
            const data = (await res.json()) as { ok?: boolean };
            if (!res.ok || !data.ok) throw new Error("HTTP error");
            setWords([]);
            broadcast();
            toast({title: "Project dictionary cleared"});
        } catch (err) {
            toast({
                title: "Could not clear the dictionary",
                description: (err as Error).message,
                variant: "destructive"
            });
        } finally {
            setBusyWord(null);
        }
    };

    const shown = React.useMemo(() => {
        const q = filter.trim().toLowerCase();
        const list = q ? words.filter((w) => w.word.toLowerCase().includes(q)) : words;
        // Newest first when the add time is known; untimed (legacy) words
        // keep alphabetical order at the end.
        return [...list].sort((a, b) => {
            const ta = a.addedAt ? Date.parse(a.addedAt) : Number.NEGATIVE_INFINITY;
            const tb = b.addedAt ? Date.parse(b.addedAt) : Number.NEGATIVE_INFINITY;
            if (ta !== tb) return tb - ta;
            return a.word.toLowerCase().localeCompare(b.word.toLowerCase());
        });
    }, [words, filter]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="size-4 text-emerald-500"/>
                        Project dictionary
                    </DialogTitle>
                    <DialogDescription>
                        {words.length === 0
                            ? "Words you add from a spell-check popover land here."
                            : `${words.length} word${words.length === 1 ? "" : "s"} that spell-check skips.`}{" "}
                        {praxisDir ? <>Stored in <span
                            className="font-mono text-[10px]">{praxisDir}/spell-ignore.json</span>.</> : "Stored in .praxis/spell-ignore.json in the project."}
                    </DialogDescription>
                </DialogHeader>

                {/* add-row */}
                <div className="flex items-center gap-2">
                    <Input
                        value={newWord}
                        onChange={(e) => setNewWord(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void addWord(newWord);
                            }
                        }}
                        placeholder="Add a word…"
                        aria-label="Add a word to the project dictionary"
                        className="h-8 text-xs"
                        spellCheck={false}
                    />
                    <Button
                        size="sm"
                        className="h-8 text-xs shrink-0 gap-1"
                        disabled={!newWord.trim() || busyWord === newWord.trim()}
                        onClick={() => void addWord(newWord)}
                        title="Append the word to the project dictionary (stamped with the add time)"
                    >
                        {busyWord === newWord.trim() && newWord.trim() ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <Plus className="size-3.5"/>
                        )}
                        Add
                    </Button>
                </div>

                {/* filter + refresh + clear */}
                <div className="flex items-center gap-2">
                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter words…"
                        aria-label="Filter the dictionary"
                        className="h-8 text-xs flex-1"
                        spellCheck={false}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0 gap-1"
                        onClick={() => void load()}
                        disabled={loading}
                        title="Re-read .praxis/spell-ignore.json from disk"
                    >
                        {loading ? <Loader2 className="size-3.5 animate-spin"/> : <RefreshCw className="size-3.5"/>}
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0 gap-1 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => void clearAll()}
                        disabled={words.length === 0 || busyWord === "__clear__"}
                        title="Remove every word from the project dictionary"
                    >
                        {busyWord === "__clear__" ? <Loader2 className="size-3.5 animate-spin"/> :
                            <Trash2 className="size-3.5"/>}
                        Clear all
                    </Button>
                </div>

                {/* word list — newest first, each row carries the ADD TIMESTAMP.
            Airy padding everywhere (px-4 py-2 rows, centered empty /
            loading states with side padding) so no text ever sits
            against the panel border or the dialog edges. */}
                <div className="flex-1 min-h-0 overflow-y-auto rounded-md border" aria-label="Dictionary words">
                    {loading && words.length === 0 ? (
                        <div
                            className="flex items-center justify-center gap-2 py-12 px-8 text-xs text-muted-foreground text-center">
                            <Loader2 className="size-4 animate-spin shrink-0"/> <span>Loading the dictionary…</span>
                        </div>
                    ) : shown.length === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-xs text-muted-foreground text-center max-w-[34rem] mx-auto">
                            <BookOpen className="size-5 opacity-40"/>
                            {filter.trim()
                                ? `No word matches “${filter.trim()}”.`
                                : "The dictionary is empty — click a wavy-underlined word in any file and choose “Add to project dictionary”."}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border/60">
                            {shown.map((w) => {
                                const full = addedAtFull(w.addedAt);
                                return (
                                    <li key={w.word} className="flex items-center gap-2 px-4 py-2">
                                        <span className="flex-1 font-mono text-xs break-all">{w.word}</span>
                                        <span
                                            className="shrink-0 inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                                            title={full ? `Added ${full}` : "Carried over from before timestamps were recorded"}
                                        >
                      <Clock className="size-2.5" aria-hidden="true"/>
                                            {addedAtLabel(w.addedAt)}
                    </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                                            onClick={() => void removeWord(w.word)}
                                            disabled={busyWord === w.word}
                                            title={`Remove “${w.word}” from the dictionary`}
                                            aria-label={`Remove ${w.word} from the dictionary`}
                                        >
                                            {busyWord === w.word ? <Loader2 className="size-3.5 animate-spin"/> :
                                                <X className="size-3.5"/>}
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <DialogFooter className="text-[10px] text-muted-foreground">
                    The base 240k-word English dictionary ships with the app; this list only holds the PROJECT&apos;s
                    extra words.
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
