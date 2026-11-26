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
import {Clock, FileCode2, PanelLeft, Play, Sparkles, Terminal,} from "lucide-react";
import {STORAGE_PREFIX} from "@/lib/config";

export interface CommandAction {
    id: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    action: () => void;
    /** Section grouping. */
    group: "Run" | "File" | "View" | "Tools" | "AI";
    /** Optional keyboard shortcut shown on the right. */
    shortcut?: string;
}

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    actions: CommandAction[];
}

const RECENT_COMMANDS_KEY = `${STORAGE_PREFIX}.recent-commands`;
const MAX_RECENT = 5;

/** Load the list of recently-invoked command IDs (newest first). */
function loadRecentCommands(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(RECENT_COMMANDS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            return parsed.slice(0, MAX_RECENT);
        }
    } catch {
        /* ignore */
    }
    return [];
}

/** Persist a command ID at the top of the recent list (deduped). */
function pushRecentCommand(id: string): void {
    if (typeof window === "undefined") return;
    try {
        const prev = loadRecentCommands().filter((x) => x !== id);
        const next = [id, ...prev].slice(0, MAX_RECENT);
        window.localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
}

/**
 * VSCode-style command palette (Ctrl+Shift+P). Lists ALL actions
 * available in the IDE, filterable by name. Reuses the cmdk-based
 * CommandDialog primitive.
 *
 * Includes a "Recently used" section at the top that tracks the last
 * 5 invoked commands (persisted to localStorage).
 */
export function CommandPalette({open, onOpenChange, actions}: CommandPaletteProps) {
    const [recentIds, setRecentIds] = React.useState<string[]>([]);

    // Load recent commands when the palette opens. Deferred via a
    // microtask so the setState doesn't fire synchronously in the effect
    // body (which trips the react-hooks/set-state-in-effect rule).
    React.useEffect(() => {
        if (!open) return;
        void Promise.resolve().then(() => setRecentIds(loadRecentCommands()));
    }, [open]);

    // Group actions by their `group` field.
    const grouped = React.useMemo(() => {
        const groups: Record<string, CommandAction[]> = {};
        for (const a of actions) {
            if (!groups[a.group]) groups[a.group] = [];
            groups[a.group].push(a);
        }
        return groups;
    }, [actions]);

    // Build the "Recently used" list by filtering actions by the stored
    // recent IDs (in order). Actions that no longer exist (e.g. were
    // conditional and the condition changed) are skipped.
    const recentActions = React.useMemo(() => {
        if (recentIds.length === 0) return [];
        const byId = new Map(actions.map((a) => [a.id, a]));
        return recentIds
            .map((id) => byId.get(id))
            .filter((a): a is CommandAction => Boolean(a));
    }, [recentIds, actions]);

    const groupOrder: CommandAction["group"][] = ["Run", "File", "View", "Tools", "AI"];
    const groupIcons: Record<string, React.ReactNode> = {
        Run: <Play className="size-3.5"/>,
        File: <FileCode2 className="size-3.5"/>,
        View: <PanelLeft className="size-3.5"/>,
        Tools: <Terminal className="size-3.5"/>,
        AI: <Sparkles className="size-3.5"/>,
    };

    /** Track an invocation + close the palette. */
    const handleSelect = (a: CommandAction) => {
        pushRecentCommand(a.id);
        a.action();
        onOpenChange(false);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Command Palette"
            description="Type to search for commands. Run any action by selecting it."
            className="sm:max-w-xl"
        >
            <CommandInput placeholder="Type a command name…"/>
            <CommandList className="max-h-[60vh]">
                <CommandEmpty>No matching commands.</CommandEmpty>
                {/* Recently used — top of the list for quick re-invocation. */}
                {recentActions.length > 0 && (
                    <>
                        <CommandGroup heading="Recently used">
                            {recentActions.map((a) => (
                                <CommandItem
                                    key={`recent-${a.id}`}
                                    value={`${a.label} ${a.hint ?? ""} recently used`}
                                    onSelect={() => handleSelect(a)}
                                >
                                    <span className="shrink-0"><Clock className="size-3.5"/></span>
                                    <span className="flex-1 truncate">{a.label}</span>
                                    {a.shortcut && (
                                        <kbd className="text-[10px] text-muted-foreground font-mono">
                                            {a.shortcut}
                                        </kbd>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator/>
                    </>
                )}
                {groupOrder.map((groupName) => {
                    const items = grouped[groupName];
                    if (!items || items.length === 0) return null;
                    return (
                        <React.Fragment key={groupName}>
                            <CommandGroup heading={groupName}>
                                {items.map((a) => (
                                    <CommandItem
                                        key={a.id}
                                        value={`${a.label} ${a.hint ?? ""} ${groupName}`}
                                        onSelect={() => handleSelect(a)}
                                    >
                                        <span className="shrink-0">{a.icon}</span>
                                        <span className="flex-1 truncate">{a.label}</span>
                                        {a.shortcut && (
                                            <kbd className="text-[10px] text-muted-foreground font-mono">
                                                {a.shortcut}
                                            </kbd>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            <CommandSeparator/>
                        </React.Fragment>
                    );
                })}
            </CommandList>
        </CommandDialog>
    );
}
