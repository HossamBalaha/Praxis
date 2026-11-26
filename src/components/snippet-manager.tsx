"use client";

import * as React from "react";
import {Download, Loader2, Pencil, Plus, Save, Scissors, Trash2, Upload} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * the Snippet Manager — full CRUD over the snippet
 * library the Ctrl+/ palette reads (rename / edit body / tags /
 * delete), plus import/export of a whole pack as a shareable JSON
 * file. Talks to the existing /api/snippets route (GET/POST/DELETE,
 * machine-wide ~/.praxis-snippets.json).
 */

interface Snippet {
    name: string;
    content: string;
    tags?: string[];
    createdAt: number;
}

interface SnippetManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SnippetManager({open, onOpenChange}: SnippetManagerProps) {
    const {toast} = useToast();
    const [snippets, setSnippets] = React.useState<Snippet[]>([]);
    const [loading, setLoading] = React.useState(false);
    /** The snippet being edited + its ORIGINAL name (rename detection). */
    const [editing, setEditing] = React.useState<{ snippet: Snippet; originalName: string } | null>(null);
    const [filter, setFilter] = React.useState("");
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);

    const reload = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/snippets");
            const json = await res.json();
            if (res.ok) setSnippets((json.snippets ?? []) as Snippet[]);
        } catch {
            /* leave the old list */
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (open) void reload();
    }, [open, reload]);

    const save = async (snippet: Snippet, originalName?: string) => {
        try {
            // Renames are a create-under-new-name + delete-of-old pair.
            if (originalName && originalName !== snippet.name) {
                await fetch(`/api/snippets?name=${encodeURIComponent(originalName)}`, {method: "DELETE"});
            }
            const res = await fetch("/api/snippets", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(snippet),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            toast({title: `Saved "${snippet.name}"`, variant: "success"});
            setEditing(null);
            await reload();
        } catch (err) {
            toast({title: "Save failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const remove = async (name: string) => {
        try {
            const res = await fetch(`/api/snippets?name=${encodeURIComponent(name)}`, {method: "DELETE"});
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSnippets((prev) => prev.filter((s) => s.name !== name));
            if (editing?.originalName === name) setEditing(null);
        } catch (err) {
            toast({title: "Delete failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const exportPack = () => {
        const blob = new Blob([JSON.stringify({praxisSnippetPack: snippets}, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "praxis-snippets.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    const importPack = async (file: File) => {
        try {
            const text = await file.text();
            const json = JSON.parse(text) as { praxisSnippetPack?: Snippet[] } | Snippet[];
            const incoming = Array.isArray(json) ? json : (json.praxisSnippetPack ?? []);
            if (!Array.isArray(incoming)) throw new Error("Not a snippet pack.");
            let imported = 0;
            for (const s of incoming) {
                if (!s?.name || typeof s.content !== "string") continue;
                await fetch("/api/snippets", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({name: s.name, content: s.content, tags: s.tags ?? []}),
                });
                imported++;
            }
            toast({title: `Imported ${imported} snippet(s)`, variant: "success"});
            await reload();
        } catch (err) {
            toast({title: "Import failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const visible = snippets.filter(
        (s) =>
            !filter ||
            s.name.toLowerCase().includes(filter.toLowerCase()) ||
            (s.tags ?? []).some((t) => t.toLowerCase().includes(filter.toLowerCase()))
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Scissors className="size-4 text-emerald-500"/>
                        Snippet Manager
                    </DialogTitle>
                    <DialogDescription>
                        The library behind the Ctrl+/ palette — machine-wide, stored in
                        <code className="mx-1 text-[11px]">~/.praxis-snippets.json</code>.
                    </DialogDescription>
                </DialogHeader>

                {editing ? (
                    <div className="space-y-2.5">
                        <div className="flex gap-2">
                            <Input
                                value={editing.snippet.name}
                                onChange={(e) => setEditing({
                                    ...editing,
                                    snippet: {...editing.snippet, name: e.target.value}
                                })}
                                placeholder="Snippet name (type its prefix in the palette to insert)"
                                className="h-8 text-xs"
                            />
                            <Input
                                value={(editing.snippet.tags ?? []).join(", ")}
                                onChange={(e) => setEditing({
                                    ...editing,
                                    snippet: {
                                        ...editing.snippet,
                                        tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                                    }
                                })}
                                placeholder="tags, comma-separated"
                                className="h-8 w-44 text-xs"
                            />
                        </div>
                        <Textarea
                            value={editing.snippet.content}
                            onChange={(e) => setEditing({
                                ...editing,
                                snippet: {...editing.snippet, content: e.target.value}
                            })}
                            className="font-mono text-xs min-h-[180px]"
                            aria-label="Snippet body"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" className="h-8 gap-1.5 text-xs"
                                    onClick={() => void save(editing.snippet, editing.originalName)}>
                                <Save className="size-3"/>
                                Save snippet
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs"
                                    onClick={() => setEditing(null)}>
                                Cancel
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Rename = save under the new name (the old one is deleted automatically).
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Input value={filter} onChange={(e) => setFilter(e.target.value)}
                                   placeholder="Filter by name or tag…" className="h-8 flex-1 min-w-40 text-xs"/>
                            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setEditing({
                                snippet: {
                                    name: "",
                                    content: "",
                                    tags: [],
                                    createdAt: Date.now()
                                }, originalName: ""
                            })}>
                                <Plus className="size-3"/>
                                New
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportPack}
                                    disabled={snippets.length === 0}>
                                <Download className="size-3"/>
                                Export pack
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                                    onClick={() => fileInputRef.current?.click()}>
                                <Upload className="size-3"/>
                                Import pack
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void importPack(f);
                                    e.target.value = "";
                                }}
                            />
                        </div>

                        {loading && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
                                <Loader2 className="size-3.5 animate-spin"/> Loading snippets…
                            </div>
                        )}

                        <div className="rounded-md border divide-y max-h-[50vh] overflow-y-auto">
                            {visible.length === 0 && !loading && (
                                <p className="text-xs text-muted-foreground p-4 text-center">No snippets yet — create
                                    one or import a pack.</p>
                            )}
                            {visible.map((s) => (
                                <div key={s.name} className="flex items-center gap-2 px-2.5 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium truncate">{s.name}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                                            {s.content.split("\n")[0].slice(0, 70) || "(empty)"}
                                        </p>
                                        {(s.tags ?? []).length > 0 && (
                                            <div className="flex gap-1 pt-0.5">
                                                {(s.tags ?? []).slice(0, 5).map((t) => (
                                                    <Badge key={t} variant="secondary"
                                                           className="text-[9px] px-1.5">{t}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                                    <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Edit"
                                            onClick={() => setEditing({snippet: {...s}, originalName: s.name})}>
                                        <Pencil className="size-3.5"/>
                                    </Button>
                                    <Button size="sm" variant="ghost"
                                            className="h-7 px-1.5 text-red-600 dark:text-red-400" title="Delete"
                                            onClick={() => void remove(s.name)}>
                                        <Trash2 className="size-3.5"/>
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <p className={cn("text-[11px] text-muted-foreground")}>
                            {snippets.length} snippet(s) · insert with Ctrl+/ then type the name prefix.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
