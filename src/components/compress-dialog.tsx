"use client";

import * as React from "react";
import {Archive, ArrowUp, ChevronRight, FileText, Folder, FolderOpen, Loader2, Package,} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Compress to ZIP — file, folder or subfolder → an on-disk archive    */
/*  stored in the SAME folder or ANYWHERE on the machine.               */
/*                                                                      */
/*  Opened from:                                                        */
/*   • the Explorer's right-click menus (file / folder / subfolder)      */
/*     via the praxis:compress window event, and                        */
/*   • the navbar's Tools ▸ Export ▸ "Compress … to ZIP…" items.        */
/* ------------------------------------------------------------------ */

export const COMPRESS_EVENT = "praxis:compress";

export interface CompressRequest {
    kind: "file" | "folder";
    /** Folder slug owning the item. */
    folder: string;
    /** Relative subfolder path (folder kind, subfolder scope). */
    sub?: string;
    /** File slug / relative path (file kind). */
    file?: string;
    /** Display name of the item being compressed. */
    name: string;
}

/** Open the compress dialog from anywhere (context menu, navbar…). */
export function requestCompress(req: CompressRequest): void {
    window.dispatchEvent(new CustomEvent(COMPRESS_EVENT, {detail: req}));
}

interface PickerCrumb {
    name: string;
    path: string;
    isStart: boolean;
}

interface PickerDirInfo {
    name: string;
    path: string;
}

interface FolderListResponse {
    path: string;
    parent: string | null;
    isAppDir: boolean;
    crumbs: PickerCrumb[];
    dirs: PickerDirInfo[];
}

interface CompressResponse {
    ok?: boolean;
    path?: string;
    name?: string;
    sizeBytes?: number;
    entryCount?: number;
    error?: string;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function CompressDialog() {
    const {toast} = useToast();
    const [source, setSource] = React.useState<CompressRequest | null>(null);
    const [open, setOpen] = React.useState(false);
    const [zipName, setZipName] = React.useState("");
    const [destMode, setDestMode] = React.useState<"same" | "browse">("same");
    const [destPath, setDestPath] = React.useState<string | null>(null);
    const [listing, setListing] = React.useState<FolderListResponse | null>(null);
    const [loadingList, setLoadingList] = React.useState(false);
    const [listError, setListError] = React.useState<string | null>(null);
    const [manualPath, setManualPath] = React.useState("");
    const [working, setWorking] = React.useState(false);

    /* ── Open via the window event (context menus + the navbar). ─── */
    React.useEffect(() => {
        const onCompress = (e: Event) => {
            const d = (e as CustomEvent).detail as CompressRequest | undefined;
            if (!d || (d.kind !== "file" && d.kind !== "folder") || !d.folder || !d.name) return;
            setSource(d);
            // Archive name default: the item's name (".zip" is appended by
            // the server; a nested scope gets the folder_sub convention).
            const base = d.kind === "file"
                ? d.name.replace(/\.[^.]+$/, "")
                : d.name;
            setZipName(base.replace(/\.zip$/i, ""));
            setDestMode("same");
            setDestPath(null);
            setListing(null);
            setListError(null);
            setManualPath("");
            setOpen(true);
        };
        window.addEventListener(COMPRESS_EVENT, onCompress);
        return () => window.removeEventListener(COMPRESS_EVENT, onCompress);
    }, []);

    /* ── Folder browser (reuses /api/folder-list — browses the whole
          machine, same backend as the "Open project" picker). ─────── */
    const loadListing = React.useCallback((target?: string) => {
        setLoadingList(true);
        setListError(null);
        const url = target
            ? `/api/folder-list?path=${encodeURIComponent(target)}`
            : "/api/folder-list";
        fetch(url, {cache: "no-store"})
            .then(async (r) => {
                const data = await r.json().catch(() => null);
                if (!r.ok || !data) throw new Error(data?.error ?? `HTTP ${r.status}`);
                return data as FolderListResponse;
            })
            .then((data) => setListing(data))
            .catch((err) => setListError((err as Error).message))
            .finally(() => setLoadingList(false));
    }, []);

    // Load the start listing whenever browse mode is (re)entered.
    React.useEffect(() => {
        if (open && destMode === "browse" && !listing && !loadingList && !listError) {
            const t = setTimeout(() => loadListing(), 0);
            return () => clearTimeout(t);
        }
    }, [open, destMode, listing, loadingList, listError, loadListing]);

    const selectDestination = (p: string) => {
        setDestPath(p);
        setManualPath("");
        toast({title: "Destination set", description: p});
    };

    /* ── Compress → POST /api/compress ────────────────────────────── */
    const handleCompress = React.useCallback(async () => {
        if (!source || working) return;
        const name = zipName.trim();
        if (!name) {
            toast({
                title: "Name the archive first",
                description: "Pick a name for the .zip file.",
                variant: "destructive"
            });
            return;
        }
        if (destMode === "browse" && !destPath) {
            toast({
                title: "Pick a destination folder",
                description: "Browse to (or type) the folder that will hold the archive.",
                variant: "destructive"
            });
            return;
        }
        setWorking(true);
        try {
            const res = await fetch("/api/compress", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    kind: source.kind,
                    folder: source.folder,
                    sub: source.sub ?? "",
                    file: source.file ?? "",
                    zipName: name,
                    destMode: destMode === "browse" ? "path" : "same",
                    destPath: destMode === "browse" ? destPath : undefined,
                }),
            });
            const data = (await res.json().catch(() => null)) as CompressResponse | null;
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            toast({
                title: "Archive created",
                description: `${data.name} · ${formatBytes(data.sizeBytes ?? 0)} · ${data.entryCount} file${(data.entryCount ?? 1) === 1 ? "" : "s"} — ${data.path}`,
            });
            setOpen(false);
            // If the archive landed inside the project, refresh the tree so
            // it shows up immediately (the page listens for this event).
            window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
        } catch (err) {
            toast({title: "Compression failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setWorking(false);
        }
    }, [source, zipName, destMode, destPath, working, toast]);

    const isFile = source?.kind === "file";

    return (
        <Dialog open={open} onOpenChange={(v) => !working && setOpen(v)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Archive className="size-4 text-emerald-500"/>
                        Compress to ZIP
                    </DialogTitle>
                    <DialogDescription>
                        Create a .zip archive of the selected {isFile ? "file" : "folder"} and store it in the
                        same folder or anywhere on this machine.
                    </DialogDescription>
                </DialogHeader>

                {/* Source summary */}
                {source && (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                        {isFile ? (
                            <FileText className="size-4 text-sky-500 shrink-0"/>
                        ) : (
                            <Folder className="size-4 text-amber-500 shrink-0"/>
                        )}
                        <span className="text-xs font-medium truncate flex-1" title={source.name}>
              {source.name}
            </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
              {isFile ? "file" : source.sub ? "subfolder" : "folder"}
            </span>
                    </div>
                )}

                {/* Archive name */}
                <div className="space-y-1.5">
                    <Label htmlFor="compress-name" className="text-xs">
                        Archive name
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="compress-name"
                            value={zipName}
                            onChange={(e) => setZipName(e.target.value)}
                            placeholder="my-archive"
                            className="h-8 text-xs font-mono"
                            disabled={working}
                        />
                        <span className="text-xs text-muted-foreground shrink-0">.zip</span>
                    </div>
                </div>

                {/* Destination choice */}
                <div className="space-y-1.5">
                    <Label className="text-xs">Store the archive…</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                        <button
                            type="button"
                            onClick={() => setDestMode("same")}
                            disabled={working}
                            className={cn(
                                "flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                destMode === "same"
                                    ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                                    : "hover:bg-accent text-muted-foreground"
                            )}
                            title={isFile ? "Next to the file, in its own folder" : "In the folder that CONTAINS it — the archive sits next to it, like Windows Send to ▸ Compressed folder"}
                        >
                            <Package className={cn("size-3.5 shrink-0", destMode === "same" && "text-emerald-500")}/>
                            <span className="flex-1">In The Same Folder</span>
                            {destMode === "same" &&
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400">default</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDestMode("browse")}
                            disabled={working}
                            className={cn(
                                "flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                destMode === "browse"
                                    ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                                    : "hover:bg-accent text-muted-foreground"
                            )}
                            title="Browse anywhere on this machine and pick the folder that receives the archive"
                        >
                            <FolderOpen
                                className={cn("size-3.5 shrink-0", destMode === "browse" && "text-emerald-500")}/>
                            <span className="flex-1">In Another Location…</span>
                        </button>
                    </div>
                    {destMode === "same" && source && (
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            {isFile
                                ? "The archive is written next to the file, inside its folder."
                                : "The archive is written next to the folder (in its parent), so it never nests inside itself."}
                        </p>
                    )}
                </div>

                {/* Destination browser */}
                {destMode === "browse" && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() => listing?.parent && loadListing(listing.parent)}
                                disabled={!listing?.parent || loadingList}
                                aria-label="Up one level"
                                title="Go up one level"
                            >
                                <ArrowUp className="size-3.5"/>
                            </Button>
                            <div
                                className="flex items-center gap-0.5 text-[11px] flex-wrap min-w-0"
                                aria-label="Current folder"
                            >
                                {(listing?.crumbs ?? []).map((c, i) => (
                                    <React.Fragment key={c.path}>
                                        {i > 0 && <ChevronRight className="size-3 text-muted-foreground shrink-0"/>}
                                        <button
                                            type="button"
                                            onClick={() => loadListing(c.path)}
                                            disabled={loadingList}
                                            className={cn(
                                                "px-1 py-0.5 rounded truncate max-w-[120px] hover:bg-accent transition-colors",
                                                listing && i === listing.crumbs.length - 1
                                                    ? "font-semibold text-foreground"
                                                    : "text-muted-foreground"
                                            )}
                                            title={c.path}
                                        >
                                            {c.name}
                                        </button>
                                    </React.Fragment>
                                ))}
                                {loadingList && <Loader2 className="size-3 animate-spin text-muted-foreground"/>}
                            </div>
                        </div>

                        <ScrollArea className="h-40 rounded-md border">
                            {listError ? (
                                <div
                                    className="flex items-center justify-center h-full text-xs text-red-600 dark:text-red-400 px-4 text-center">
                                    {listError}
                                </div>
                            ) : !listing ? (
                                <div
                                    className="flex items-center justify-center h-full text-xs text-muted-foreground gap-2">
                                    <Loader2 className="size-3.5 animate-spin"/> Loading…
                                </div>
                            ) : listing.dirs.length === 0 ? (
                                <div
                                    className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-1.5 px-4 text-center">
                                    <Folder className="size-4 opacity-50"/>
                                    No subfolders here — this folder is a valid destination.
                                </div>
                            ) : (
                                <div className="p-1">
                                    {listing.dirs.map((d) => (
                                        <button
                                            key={d.path}
                                            type="button"
                                            onClick={() => loadListing(d.path)}
                                            disabled={loadingList}
                                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:bg-accent focus:outline-none transition-colors"
                                            title={`Browse into "${d.name}"`}
                                        >
                                            <Folder className="size-3.5 shrink-0 text-amber-500"/>
                                            <span className="truncate flex-1">{d.name}</span>
                                            <ChevronRight className="size-3 text-muted-foreground/50 shrink-0"/>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>

                        <div className="flex items-center gap-1.5">
                            <Input
                                value={manualPath}
                                onChange={(e) => setManualPath(e.target.value)}
                                placeholder={listing ? `e.g. ${listing.path}/backups` : "Absolute path…"}
                                className="h-8 text-xs"
                                disabled={working}
                                aria-label="Destination folder by path"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs shrink-0"
                                disabled={!manualPath.trim() || working}
                                onClick={() => selectDestination(manualPath.trim())}
                                title="Use the typed path as the destination (validated on the server)"
                            >
                                Use path
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs shrink-0"
                                disabled={!listing || listing.isAppDir || working}
                                onClick={() => listing && selectDestination(listing.path)}
                                title="Store the archive in the currently browsed folder"
                            >
                                <FolderOpen className="size-3.5"/>
                                Use this folder
                            </Button>
                        </div>

                        <p className="text-[10px] text-muted-foreground leading-snug min-h-3">
                            {destPath ? (
                                <>
                                    Destination: <span className="font-medium text-foreground">{destPath}</span>
                                </>
                            ) : (
                                "Browse into (or type) a folder, then press “Use this folder”."
                            )}
                        </p>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpen(false)}
                        disabled={working}
                        className="text-xs"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => void handleCompress()}
                        disabled={working || !source || !zipName.trim() || (destMode === "browse" && !destPath)}
                        title="Build the .zip and write it to the chosen destination"
                    >
                        {working ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <Archive className="size-3.5"/>
                        )}
                        {working ? "Compressing…" : "Compress"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
