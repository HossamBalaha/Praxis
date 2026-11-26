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
import {
    Braces,
    Code2,
    CornerDownRight,
    FileStack,
    FunctionSquare,
    GitBranch,
    Hash,
    Repeat,
    ShieldQuestion,
} from "lucide-react";
import type {PythonSymbol} from "@/lib/python-symbols";
import {formatSymbol} from "@/lib/python-symbols";

interface SymbolPaletteProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Symbols parsed from the current file (typically from parsePythonSymbols). */
    symbols: PythonSymbol[];
    /** Display name of the file the symbols belong to — shown in the placeholder. */
    fileName?: string;
    /**
     * Called when the user picks a symbol. The parent typically wires
     * this to `CodeViewer.jumpToLine(sym.line)`.
     */
    onSelect: (sym: PythonSymbol) => void;
}

/**
 * Goto Symbol palette (Ctrl+R). A cmdk-powered dialog that lists every
 * class, function/method, and block-level statement parsed from the
 * current file, grouped by type. Selecting a row fires `onSelect(sym)`
 * — the parent is responsible for the actual jump (calling
 * `CodeViewer.jumpToLine(sym.line)` and closing the palette).
 *
 * Block-level statements (for / while / if / try / with / else / …)
 * are surfaced so the palette doubles as a foldable-region navigator.
 */
export function SymbolPalette({
                                  open,
                                  onOpenChange,
                                  symbols,
                                  fileName,
                                  onSelect,
                              }: SymbolPaletteProps) {
    // Group symbols once per render. Memoising on `symbols` keeps this
    // cheap even though the parent re-parses on every keystroke.
    const {classes, functions, blocks} = React.useMemo(() => {
        const classes: PythonSymbol[] = [];
        const functions: PythonSymbol[] = [];
        const blocks: PythonSymbol[] = [];
        for (const s of symbols) {
            if (s.type === "class") classes.push(s);
            else if (s.type === "function" || s.type === "method") functions.push(s);
            else blocks.push(s);
        }
        return {classes, functions, blocks};
    }, [symbols]);

    const handleSelect = React.useCallback(
        (sym: PythonSymbol) => {
            onSelect(sym);
            onOpenChange(false);
        },
        [onSelect, onOpenChange]
    );

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Goto Symbol"
            description="Jump to a class, function, or block in the current file."
            className="sm:max-w-xl"
        >
            <CommandInput
                placeholder={
                    fileName
                        ? `Search symbols in ${fileName}…`
                        : "Search symbols… (Ctrl+R)"
                }
            />
            <CommandList className="max-h-[60vh]">
                <CommandEmpty>
                    {symbols.length === 0
                        ? "No symbols parsed from this file."
                        : "No matching symbols."}
                </CommandEmpty>

                {classes.length > 0 && (
                    <CommandGroup heading="Classes">
                        {classes.map((s, idx) => (
                            <CommandItem
                                key={`cls-${s.line}-${idx}`}
                                value={`class ${s.name}`}
                                onSelect={() => handleSelect(s)}
                            >
                                <Braces className="size-4 text-amber-500"/>
                                <span className="flex-1 truncate font-mono text-sm">
                  {formatSymbol(s)}
                </span>
                                {s.docstring && (
                                    <span className="text-[10px] text-muted-foreground truncate ml-2 max-w-[40%]">
                    {s.docstring}
                  </span>
                                )}
                                <LineBadge line={s.line}/>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {functions.length > 0 && (
                    <CommandGroup heading="Functions & Methods">
                        {functions.map((s, idx) => (
                            <CommandItem
                                key={`fn-${s.line}-${idx}`}
                                value={`${s.type} ${s.name} ${s.args ?? ""}`}
                                onSelect={() => handleSelect(s)}
                            >
                                <FunctionSquare
                                    className={
                                        s.type === "method"
                                            ? "size-4 text-sky-500"
                                            : "size-4 text-blue-500"
                                    }
                                />
                                <span className="flex-1 truncate font-mono text-sm">
                  {formatSymbol(s)}
                </span>
                                {s.docstring && (
                                    <span className="text-[10px] text-muted-foreground truncate ml-2 max-w-[40%]">
                    {s.docstring}
                  </span>
                                )}
                                <LineBadge line={s.line}/>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {blocks.length > 0 && (
                    <>
                        {(classes.length > 0 || functions.length > 0) && <CommandSeparator/>}
                        <CommandGroup heading="Blocks">
                            {blocks.map((s, idx) => (
                                <CommandItem
                                    key={`blk-${s.line}-${idx}`}
                                    value={s.name}
                                    onSelect={() => handleSelect(s)}
                                >
                                    <BlockIcon type={s.type}/>
                                    <span className="flex-1 truncate font-mono text-sm">
                    {s.name}
                  </span>
                                    <LineBadge line={s.line}/>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}

                {symbols.length === 0 && (
                    <>
                        <CommandSeparator/>
                        <CommandGroup heading="Hint">
                            <div className="px-2 py-3 text-xs text-muted-foreground">
                                Open a Python file to populate the symbol list.
                            </div>
                        </CommandGroup>
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
}

/* ------------------------------------------------------------------ */

/** Pick the right lucide icon for a block-level symbol type. */
function BlockIcon({type}: { type: PythonSymbol["type"] }) {
    switch (type) {
        case "loop":
            return <Repeat className="size-4 text-emerald-500"/>;
        case "conditional":
            return <GitBranch className="size-4 text-purple-500"/>;
        case "try":
            return <ShieldQuestion className="size-4 text-orange-500"/>;
        case "with":
            return <FileStack className="size-4 text-cyan-500"/>;
        case "else":
        case "except":
        case "finally":
            return <CornerDownRight className="size-4 text-muted-foreground"/>;
        default:
            return <Code2 className="size-4 text-muted-foreground"/>;
    }
}

/** Right-aligned "L42" badge shown on every symbol row. */
function LineBadge({line}: { line: number }) {
    return (
        <span className="text-[10px] text-muted-foreground font-mono shrink-0 flex items-center gap-0.5 ml-2">
      <Hash className="size-3"/>
            {line}
    </span>
    );
}
