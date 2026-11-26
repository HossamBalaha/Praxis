"use client";

import * as React from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {Check, Copy, Plus, Scissors, Trash2} from "lucide-react";
import {useToast} from "@/hooks/use-toast";

export interface Snippet {
    name: string;
    content: string;
    tags?: string[];
    createdAt: number;
    updatedAt: number;
}

interface SnippetPaletteProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Optional callback — if provided, selecting a snippet inserts it
     * into the editor (in addition to copying it to the clipboard). */
    onInsert?: (content: string) => void;
}

/**
 * Cmdk-based palette that lists saved snippets. Opened with Ctrl+/.
 *
 * Selecting a snippet:
 *   - copies its content to the clipboard, AND
 *   - if `onInsert` is provided, inserts it into the active editor.
 *
 * Create via the "Create a new snippet…" action (name + content + tags).
 * Delete via the per-row trash button.
 */
export function SnippetPalette({open, onOpenChange, onInsert}: SnippetPaletteProps) {
    const {toast} = useToast();
    const [snippets, setSnippets] = React.useState<Snippet[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [copied, setCopied] = React.useState<string | null>(null);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/snippets");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setSnippets(data.snippets ?? []);
        } catch {
            setSnippets([]);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (open) refresh();
    }, [open, refresh]);

    const handleCopy = async (s: Snippet) => {
        try {
            await navigator.clipboard.writeText(s.content);
            setCopied(s.name);
            setTimeout(() => setCopied(null), 1500);
            // Also insert into the editor when the parent provided a
            // callback. The clipboard copy stays as a fallback so users
            // without an active editor still get the content.
            if (onInsert) {
                onInsert(s.content);
                toast({
                    title: "Snippet inserted",
                    description: `${s.name} — also copied to clipboard.`,
                    variant: "success",
                });
            } else {
                toast({
                    title: "Snippet copied",
                    description: `${s.name} — paste into your script.`,
                    variant: "success",
                });
            }
            onOpenChange(false);
        } catch {
            toast({title: "Copy failed", variant: "destructive"});
        }
    };

    const handleDelete = async (name: string) => {
        try {
            const res = await fetch(`/api/snippets?name=${encodeURIComponent(name)}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            toast({title: "Snippet deleted", description: name, variant: "success"});
            refresh();
        } catch (err) {
            toast({
                title: "Delete failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Snippets"
            description="Reusable code snippets. Select to insert into your script (and copy to clipboard)."
            className="sm:max-w-xl"
        >
            <CommandInput placeholder="Search snippets by name or tag…"/>
            <CommandList className="max-h-[60vh]">
                <CommandEmpty>
                    {loading ? "Loading…" : "No snippets yet. Add one via the action below."}
                </CommandEmpty>

                {snippets.length > 0 && (
                    <CommandGroup heading="Snippets">
                        {snippets.map((s) => (
                            <CommandItem
                                key={s.name}
                                value={`${s.name} ${(s.tags ?? []).join(" ")}`}
                                onSelect={() => handleCopy(s)}
                            >
                                <Scissors className="size-4 text-muted-foreground"/>
                                <span className="flex-1 truncate">{s.name}</span>
                                {s.tags && s.tags.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                    {s.tags.map((t) => `#${t}`).join(" ")}
                  </span>
                                )}
                                {copied === s.name ? (
                                    <Check className="size-3.5 text-emerald-500"/>
                                ) : (
                                    <Copy className="size-3.5 text-muted-foreground"/>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(s.name);
                                    }}
                                    className="ml-1 p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                                    aria-label={`Delete ${s.name}`}
                                >
                                    <Trash2 className="size-3"/>
                                </button>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandSeparator/>

                <CommandGroup heading="Actions">
                    <CommandItem
                        value="create new snippet"
                        onSelect={() => {
                            const name = prompt("Snippet name:");
                            if (!name) return;
                            const content = prompt("Snippet content (Python code):");
                            if (!content) return;
                            // Ask for tags too so the API's tags field is
                            // reachable from the UI.
                            const tagsRaw = prompt("Tags (comma-separated, or blank):") ?? "";
                            const tags = tagsRaw
                                .split(/[,\s]+/)
                                .map((t) => t.trim().toLowerCase())
                                .filter(Boolean);
                            fetch("/api/snippets", {
                                method: "POST",
                                headers: {"Content-Type": "application/json"},
                                body: JSON.stringify({name, content, tags: tags.length > 0 ? tags : undefined}),
                            })
                                .then((res) => {
                                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                    return res.json();
                                })
                                .then(() => {
                                    toast({title: "Snippet saved", description: name, variant: "success"});
                                    refresh();
                                })
                                .catch((err) => {
                                    toast({
                                        title: "Save failed",
                                        description: (err as Error).message,
                                        variant: "destructive",
                                    });
                                });
                        }}
                    >
                        <Plus className="size-4 text-emerald-500"/>
                        <span className="flex-1">Create A New Snippet…</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
