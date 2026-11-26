"use client";

import * as React from "react";
import {CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,} from "@/components/ui/command";
import {Braces, FunctionSquare, Loader2} from "lucide-react";

interface ProjectSymbol {
    folder: string;
    folderName: string;
    file: string;
    fileSlug: string;
    name: string;
    type: string;
    line: number;
    args?: string;
    docstring?: string;
}

interface SymbolSearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called with the target file + 1-indexed line when a symbol is picked. */
    onSelect: (folderSlug: string, fileSlug: string, line: number) => void;
}

/**
 * Go to Symbol in Project (⌘T — VS Code's "Go to Symbol in
 * Workspace…"). A cmdk dialog over /api/project-symbols: every def /
 * class / method across every folder, filtered server-side with a
 * 250 ms debounce. Enter (or click) opens the file and jumps to the
 * symbol's line.
 */
export function SymbolSearchDialog({
                                       open,
                                       onOpenChange,
                                       onSelect,
                                   }: SymbolSearchDialogProps) {
    const [query, setQuery] = React.useState("");
    const [symbols, setSymbols] = React.useState<ProjectSymbol[]>([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setQuery("");
            setSymbols([]);
            setTotal(0);
        }
    }, [open]);

    // Debounced server search with abort — mirrors SearchDialog's FTS
    // flow: stale requests are really cancelled.
    const abortRef = React.useRef<AbortController | null>(null);
    React.useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (!q) {
            abortRef.current?.abort();
            abortRef.current = null;
            setSymbols([]);
            setTotal(0);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const t = setTimeout(async () => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const res = await fetch(
                    `/api/project-symbols?query=${encodeURIComponent(q)}&limit=120`,
                    {signal: controller.signal}
                );
                const data = await res.json();
                if (!cancelled) {
                    setSymbols(data.symbols ?? []);
                    setTotal(data.total ?? 0);
                }
            } catch (err) {
                if (
                    !cancelled &&
                    !(err instanceof DOMException && err.name === "AbortError")
                ) {
                    setSymbols([]);
                    setTotal(0);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, [query, open]);

    const iconFor = (type: string) =>
        type === "class" ? (
            <Braces className="size-4 text-amber-500 shrink-0 mt-0.5"/>
        ) : (
            <FunctionSquare className="size-4 text-sky-500 shrink-0 mt-0.5"/>
        );

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Go to Symbol in project"
            description="Search every def / class / method across all folders."
            className="sm:max-w-xl"
            // The server already filtered — disable cmdk's client filter so
            // results whose display text lacks the raw query stay visible.
            shouldFilter={false}
            showCloseButton={false}
        >
            <CommandInput
                placeholder="Search symbols across the project…"
                onValueChange={setQuery}
            />
            <CommandList className="max-h-[60vh]">
                <CommandEmpty>
                    {loading ? "Searching…" : "No symbols match."}
                </CommandEmpty>
                <div className="p-2">
                    {loading && (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin"/>
                            Searching symbols…
                        </div>
                    )}
                    {!loading && !query.trim() && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                            Type to search every def / class / method in the project…
                        </div>
                    )}
                    {!loading && query.trim() && symbols.length === 0 && (
                        <div
                            className="px-3 py-2 text-xs text-muted-foreground"
                            role="status"
                            aria-live="polite"
                        >
                            No symbols match &ldquo;{query}&rdquo;.
                        </div>
                    )}
                    {symbols.length > 0 && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-2">
                            Symbols{" "}
                            {total > symbols.length
                                ? `(${symbols.length} of ${total})`
                                : `(${symbols.length})`}
                        </p>
                    )}
                    {symbols.map((s, i) => (
                        <CommandItem
                            key={`${s.folder}/${s.fileSlug}/${s.line}/${i}`}
                            value={`${s.name} ${s.file} ${s.folderName} L${s.line}`}
                            onSelect={() => {
                                onSelect(s.folder, s.fileSlug, s.line);
                                onOpenChange(false);
                            }}
                            className="flex items-start gap-2 cursor-pointer"
                        >
                            {iconFor(s.type)}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium font-mono">
                    {s.type === "class" ? `class ${s.name}` : `${s.name}(${s.args ?? ""})`}
                  </span>
                                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    L{s.line}
                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                    {s.folderName} › {s.file}
                                    {s.docstring ? ` — ${s.docstring}` : ""}
                                </div>
                            </div>
                        </CommandItem>
                    ))}
                </div>
            </CommandList>
        </CommandDialog>
    );
}
