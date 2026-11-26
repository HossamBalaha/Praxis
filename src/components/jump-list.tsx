"use client";

import * as React from "react";
import {Clock, FileCode2, FolderTree, History, Pin, Star,} from "lucide-react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {STORAGE_PREFIX} from "@/lib/config";

/**
 * the Jump list — ONE keyboard-navigable overlay
 * (navbar "Jump…" button / Ctrl+Shift+J) listing pinned tabs,
 * favorites, recent files, recent folders and the last runs — the
 * "where was I?" surface. Reads the same localStorage keys those
 * features already write and delegates navigation to page callbacks.
 */

export interface JumpEntry {
    id: string;
    group: "pinned" | "favorites" | "files" | "folders" | "runs";
    label: string;
    hint?: string;
    icon: React.ReactNode;
    action: () => void;
}

interface JumpListProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Ordered recent files (folderSlug/fileSlug/fileName/folderName). */
    recentFiles: Array<{ folderSlug: string; folderName: string; fileSlug: string; fileName: string; mtime: number }>;
    /** Navigate to a file (same handler the explorer uses). */
    onOpenFile: (folderSlug: string, fileSlug: string) => void;
    /** Select a folder in the explorer. */
    onSelectFolder: (folderSlug: string) => void;
    /** The CURRENT project's folder tree — pins, favorites and line
     * bookmarks are browser-local and SURVIVE project switches, so
     * without this filter the list showed (and jumped to) entries
     * from OTHER projects. Entries that do not
     * resolve inside this tree are simply not listed. */
    projectFolders?: Array<{ slug: string; name: string; files: Array<{ slug: string; name: string }> }>;
}

interface StoredRun {
    id?: string;
    file?: string;
    folder?: string;
    ok?: boolean;
    startedAt?: number;
    durationMs?: number;
}

interface StoredTab {
    id?: string;
    folderSlug?: string;
    fileSlug?: string;
    fileName?: string;
}

const GROUP_LABELS: Record<JumpEntry["group"], string> = {
    pinned: "Pinned tabs",
    favorites: "Favorites",
    files: "Recent files",
    folders: "Recent folders",
    runs: "Last runs",
};

export function JumpList({open, onOpenChange, recentFiles, onOpenFile, onSelectFolder, projectFolders}: JumpListProps) {
    const [pinned, setPinned] = React.useState<StoredTab[]>([]);
    const [favorites, setFavorites] = React.useState<Array<{
        folderSlug: string;
        fileSlug: string;
        fileName: string
    }>>([]);
    const [runs, setRuns] = React.useState<StoredRun[]>([]);

    /** Resolve a target against the CURRENT project's tree — returns
     *  null when the folder/file does not exist here (another
     *  project's entry), or the readable names when it does. */
    const resolveInProject = React.useCallback(
        (folderSlug: string, fileSlug: string): { folderName: string; fileName: string } | null => {
            if (!projectFolders) return {folderName: folderSlug, fileName: fileSlug};
            const folder = projectFolders.find((c) => c.slug === folderSlug);
            const file = folder?.files.find((f) => f.slug === fileSlug);
            if (!folder || !file) return null;
            return {folderName: folder.name, fileName: file.name};
        },
        [projectFolders]
    );

    React.useEffect(() => {
        if (!open) return;
        // Pinned editor tabs — EditorTab[] under <prefix>-pinned-tabs.
        try {
            const rawPinned = window.localStorage.getItem(`${STORAGE_PREFIX}-pinned-tabs`);
            const parsedPinned = rawPinned ? (JSON.parse(rawPinned) as unknown) : [];
            setPinned(Array.isArray(parsedPinned) ? (parsedPinned as StoredTab[]) : []);
        } catch {
            setPinned([]);
        }
        // Favorites — string[] of "folderSlug/fileSlug" keys.
        try {
            const rawFavs = window.localStorage.getItem(`${STORAGE_PREFIX}.favorites`);
            const parsedFavs = rawFavs ? (JSON.parse(rawFavs) as string[]) : [];
            setFavorites(
                parsedFavs.map((key) => {
                    const slash = key.indexOf("/");
                    return {
                        folderSlug: slash > 0 ? key.slice(0, slash) : key,
                        fileSlug: slash > 0 ? key.slice(slash + 1) : "",
                        fileName: key,
                    };
                })
            );
        } catch {
            setFavorites([]);
        }
        // Run history — HistoryEntry[] under <prefix>.run-history.
        try {
            const rawRuns = window.localStorage.getItem(`${STORAGE_PREFIX}.run-history`);
            const parsedRuns = rawRuns ? (JSON.parse(rawRuns) as StoredRun[]) : [];
            setRuns(Array.isArray(parsedRuns) ? parsedRuns.slice(0, 8) : []);
        } catch {
            setRuns([]);
        }
    }, [open]);

    const entries: JumpEntry[] = [];

    for (const p of pinned.slice(0, 8)) {
        const name = p.fileName ?? p.id ?? "tab";
        if (p.folderSlug && p.fileSlug) {
            const resolved = resolveInProject(p.folderSlug, p.fileSlug);
            if (!resolved) continue; // tab pinned in another project
            entries.push({
                id: `pin-${p.id ?? name}`,
                group: "pinned",
                label: resolved.fileName,
                hint: `Pinned tab · ${resolved.folderName}`,
                icon: <Pin className="size-3.5 text-amber-500"/>,
                action: () => onOpenFile(p.folderSlug as string, p.fileSlug as string),
            });
        }
    }

    for (const f of favorites.slice(0, 10)) {
        // Favorites store raw "folderSlug/fileSlug" keys — resolve
        // against the CURRENT project: unreadable keys from another
        // project's stars never list here.
        const resolved = resolveInProject(f.folderSlug, f.fileSlug);
        if (!resolved) continue;
        entries.push({
            id: `fav-${f.folderSlug}/${f.fileSlug}`,
            group: "favorites",
            label: resolved.fileName,
            hint: `Favorite · ${resolved.folderName}`,
            icon: <Star className="size-3.5 text-amber-400"/>,
            action: () => onOpenFile(f.folderSlug, f.fileSlug),
        });
    }

    for (const f of recentFiles.slice(0, 10)) {
        entries.push({
            id: `file-${f.folderSlug}/${f.fileSlug}`,
            group: "files",
            label: f.fileName,
            hint: `${f.folderName} · ${f.mtime ? timeAgo(f.mtime) : ""}`,
            icon: <FileCode2 className="size-3.5 text-emerald-500"/>,
            action: () => onOpenFile(f.folderSlug, f.fileSlug),
        });
    }

    // Folders seen in the recents (deduped, first 5).
    const seenFolders = new Map<string, string>();
    for (const f of recentFiles) {
        if (!seenFolders.has(f.folderSlug)) seenFolders.set(f.folderSlug, f.folderName);
    }
    for (const [slug, name] of [...seenFolders.entries()].slice(0, 5)) {
        entries.push({
            id: `folder-${slug}`,
            group: "folders",
            label: name,
            hint: "Folder",
            icon: <FolderTree className="size-3.5 text-sky-500"/>,
            action: () => onSelectFolder(slug),
        });
    }

    for (const r of runs) {
        const name = r.file ?? "unknown";
        const when = r.startedAt;
        entries.push({
            id: `run-${r.id ?? `${name}-${when ?? 0}`}`,
            group: "runs",
            label: name,
            hint: `${r.ok === false ? "failed" : r.ok === true ? "passed" : "run"}${when ? ` · ${timeAgo(when)}` : ""}`,
            icon: r.ok === false ? <History className="size-3.5 text-red-400"/> :
                <History className="size-3.5 text-muted-foreground"/>,
            action: () => {
                // Runs store DISPLAY names — jump via the recents lookup.
                const match = recentFiles.find(
                    (f) => f.fileName === r.file && (r.folder ? f.folderName === r.folder : true)
                );
                if (match) onOpenFile(match.folderSlug, match.fileSlug);
            },
        });
    }

    const groups: JumpEntry["group"][] = ["pinned", "favorites", "files", "folders", "runs"];

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Jump to a pinned tab, favorite, recent file, folder or run…"/>
            <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                {groups.map((g) => {
                    const items = entries.filter((e) => e.group === g);
                    if (items.length === 0) return null;
                    return (
                        <React.Fragment key={g}>
                            <CommandGroup heading={GROUP_LABELS[g]}>
                                {items.map((e) => (
                                    <CommandItem
                                        key={e.id}
                                        value={`${e.label} ${e.hint ?? ""}`}
                                        onSelect={() => {
                                            e.action();
                                            onOpenChange(false);
                                        }}
                                        className="gap-2"
                                    >
                                        {e.icon}
                                        <span className="flex-1 truncate">{e.label}</span>
                                        {e.hint && <span
                                          className="text-[10px] text-muted-foreground truncate max-w-40">{e.hint}</span>}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            <CommandSeparator/>
                        </React.Fragment>
                    );
                })}
                {entries.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
                        <Clock className="size-3.5"/>
                        Nothing to jump to yet — pin a tab, star a file or run something.
                    </p>
                )}
            </CommandList>
        </CommandDialog>
    );
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}
