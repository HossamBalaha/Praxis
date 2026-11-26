"use client";

import * as React from "react";
import {
    ArrowUp,
    Check,
    ChevronRight,
    FileCode2,
    Folder,
    FolderOpen,
    FolderSearch,
    Loader2,
    TriangleAlert,
} from "lucide-react";
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
import {ScrollArea} from "@/components/ui/scroll-area";
import {cn} from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  FolderPickerDialog — "Open folder…" (+ toolbar) / File → Open      */
/*  project → Browse for folder…                                       */

/* ------------------------------------------------------------------ */

interface PickerCrumb {
    name: string;
    path: string;
    isStart: boolean;
}

interface PickerDirInfo {
    name: string;
    path: string;
    hasPy: boolean;
    scriptCount: number;
    created: boolean;
}

interface FolderListResponse {
    root: string;
    rootName: string;
    path: string;
    relPath: string;
    parent: string | null;
    isDefault: boolean;
    /** true when the browsed directory is the app's own
     *  folder — it can never be opened as a project. */
    isAppDir: boolean;
    /** why the current folder cannot be opened (null when it
     *  can) — e.g. drive roots, reserved names, hidden folders. */
    rejection: string | null;
    /** Absolute path of the projects parent root (the browse start). */
    startPath: string;
    hasPy: boolean;
    scriptCount: number;
    created: boolean;
    crumbs: PickerCrumb[];
    dirs: PickerDirInfo[];
}

interface FolderPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Activate the chosen project (the page's handleSelectProject —
     *  performs the POST /api/projects switch and toasts the outcome).
     *  Returns true when the switch succeeded so the dialog can close. */
    onSelect: (projectPath: string) => Promise<boolean> | boolean;
    /** Absolute path of the currently-active project ("" = default). */
    activeProject?: string;
}

/** Client-side absolute-path detector: POSIX "/…", Windows "C:\…",
 * "C:/…" and UNC "\\\\server\\…". the picker accepts paths
 *  anywhere on the machine, so typed paths are no longer forced to be
 *  projects-root-relative. */
function looksAbsolute(p: string): boolean {
    return (
        p.startsWith("/") ||
        p.startsWith("\\\\") ||
        /^[a-zA-Z]:[\\/]/.test(p)
    );
}

/**
 * A server-folder browser for the "Open folder…" flow. the
 * user can navigate the WHOLE filesystem (not just the projects
 * directory) and open any folder as the active project — validation
 * happens server-side in POST /api/projects (drive roots, the app
 * directory, reserved names and hidden folders are rejected there).
 *
 * Navigation is single-click-to-enter, breadcrumb-to-jump (built from
 * the server-supplied `crumbs`, so Windows backslashes never break
 * the client), plus a manual path field for pasting a known location.
 */
export function FolderPickerDialog({
                                       open,
                                       onOpenChange,
                                       onSelect,
                                       activeProject,
                                   }: FolderPickerDialogProps) {
    const [current, setCurrent] = React.useState<FolderListResponse | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [opening, setOpening] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [manualPath, setManualPath] = React.useState("");
    const [nonce, setNonce] = React.useState(0);

    /** Fetch the listing for a folder. `target` omitted = the projects
     *  root. Shared by the open-effect, the Refresh affordance and
     *  folder navigation. A generation counter drops responses that
     *  arrive after a newer navigation started (quick re-open / fast
     *  clicks can otherwise race and restore stale listings). */
    const genRef = React.useRef(0);
    const loadListing = React.useCallback((target?: string) => {
        const gen = ++genRef.current;
        setLoading(true);
        setError(null);
        const url = target
            ? `/api/folder-list?path=${encodeURIComponent(target)}`
            : "/api/folder-list";
        return fetch(url, {cache: "no-store"})
            .then(async (r) => {
                const data = await r.json().catch(() => null);
                if (!r.ok || !data) throw new Error(data?.error ?? `HTTP ${r.status}`);
                return data as FolderListResponse;
            })
            .then((data) => {
                if (genRef.current === gen) setCurrent(data);
            })
            .catch((err) => {
                if (genRef.current === gen) setError((err as Error).message);
            })
            .finally(() => {
                if (genRef.current === gen) setLoading(false);
            });
    }, []);

    // Load the start listing whenever the dialog (re)opens; the nonce
    // lets the Refresh affordance re-fetch on demand. The fetch is
    // deferred a tick so the effect body itself never calls setState
    // synchronously (cascading-render lint rule) — and so an instant
    // close/reopen cancels the listing fetch instead of racing it.
    React.useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => void loadListing(), 0);
        return () => clearTimeout(t);
    }, [open, nonce, loadListing]);

    const navigate = React.useCallback(
        (target: string) => {
            void loadListing(target);
        },
        [loadListing]
    );

    /** Open the given folder as the active project. The dialog only
     * closes when the switch actually succeeded — on failure the page
     * toasts the server's error and the user keeps their browse spot. */
    const openAsProject = React.useCallback(
        async (projectPath: string) => {
            if (!projectPath) return;
            setOpening(true);
            try {
                const ok = await onSelect(projectPath);
                if (ok) onOpenChange(false);
            } finally {
                setOpening(false);
            }
        },
        [onSelect, onOpenChange]
    );

    // at the drive/filesystem root there is no parent and the
    // root itself is not openable.
    const atFsRoot = current ? current.relPath === "" : false;
    const currentName = current
        ? current.isDefault
            ? `${pathBase(current.path)} (default)`
            : atFsRoot
                ? current.rootName
                : pathBase(current.path)
        : "";
    // Any browsed folder is openable — except the app's own directory,
    // the drive root, and folders the server flags as rejected.
    const canOpenCurrent =
        !!current &&
        !atFsRoot &&
        !current.isAppDir &&
        !current.rejection &&
        !opening;

    /** Resolve a typed path against the CURRENT browsed folder when
     *  relative, or use it as-is when absolute. */
    const resolveTyped = React.useCallback(
        (raw: string): string => {
            const t = raw.trim();
            if (looksAbsolute(t) || !current) return t;
            return `${current.path.replace(/[\\/]+$/, "")}/${t}`;
        },
        [current]
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderSearch className="size-4 text-emerald-500"/>
                        Open Project Folder
                    </DialogTitle>
                    <DialogDescription>
                        Browse anywhere on this machine and pick any folder to open
                        as the active project.
                    </DialogDescription>
                </DialogHeader>

                {/* Breadcrumb + up button */}
                {current && (
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 shrink-0"
                            onClick={() => current.parent && navigate(current.parent)}
                            disabled={!current.parent || loading}
                            aria-label="Up one level"
                            title="Go up one level"
                        >
                            <ArrowUp className="size-3.5"/>
                        </Button>
                        <div
                            className="flex items-center gap-0.5 text-xs flex-wrap min-w-0"
                            aria-label="Current folder"
                        >
                            {current.crumbs.map((c, i) => (
                                <React.Fragment key={c.path}>
                                    {i > 0 && (
                                        <ChevronRight className="size-3 text-muted-foreground shrink-0"/>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => navigate(c.path)}
                                        disabled={loading}
                                        className={cn(
                                            "px-1 py-0.5 rounded truncate max-w-[140px] hover:bg-accent transition-colors",
                                            i === current.crumbs.length - 1
                                                ? "font-semibold text-foreground"
                                                : "text-muted-foreground"
                                        )}
                                        title={c.path}
                                    >
                                        {c.isStart ? `${c.name} (projects)` : c.name}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 ml-auto shrink-0"
                            onClick={() => setNonce((n) => n + 1)}
                            disabled={loading}
                            aria-label="Refresh folder list"
                            title="Refresh the folder list"
                        >
                            <Loader2
                                className={cn("size-3.5", loading && "animate-spin")}
                            />
                        </Button>
                    </div>
                )}

                {/* Folder list */}
                <ScrollArea className="h-56 rounded-md border">
                    {loading && !current ? (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-2">
                            <Loader2 className="size-3.5 animate-spin"/> Loading…
                        </div>
                    ) : error ? (
                        <div
                            className="flex items-center justify-center h-full text-xs text-red-600 dark:text-red-400 px-4 text-center">
                            {error}
                        </div>
                    ) : current && current.dirs.length === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-1.5 px-4 text-center">
                            <Folder className="size-4 opacity-50"/>
                            No subfolders here.
                        </div>
                    ) : (
                        <div className="p-1">
                            {current?.dirs.map((d) => (
                                <button
                                    key={d.path}
                                    type="button"
                                    onClick={() => navigate(d.path)}
                                    disabled={loading}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:bg-accent focus:outline-none transition-colors",
                                        activeProject === d.path && "bg-accent/60"
                                    )}
                                    title={`Browse into "${d.name}" (${d.scriptCount} Python files) — then open it with the button below`}
                                >
                                    <Folder className="size-3.5 shrink-0 text-amber-500"/>
                                    <span className="truncate flex-1">{d.name}</span>
                                    {d.scriptCount > 0 ? (
                                        <span
                                            className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                      <FileCode2 className="size-3"/>
                                            {d.scriptCount}
                    </span>
                                    ) : d.created ? (
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                      opened before
                    </span>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      no .py yet
                    </span>
                                    )}
                                    {activeProject === d.path && (
                                        <Check className="size-3.5 shrink-0 text-emerald-500"/>
                                    )}
                                    <ChevronRight className="size-3 text-muted-foreground/50 shrink-0"/>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Current-folder status line */}
                {current && (
                    <div className="text-[11px] text-muted-foreground min-h-4">
                        {atFsRoot ? (
                            <>This is the top level of the drive — open one of its folders below.</>
                        ) : current.isAppDir ? (
                            <span className="inline-flex items-center gap-1">
                <TriangleAlert className="size-3 text-amber-500"/>
                This is the Praxis app folder — it can&apos;t be opened as a project.
              </span>
                        ) : current.rejection ? (
                            <span className="inline-flex items-center gap-1">
                <TriangleAlert className="size-3 text-amber-500"/>
                                {current.rejection}
              </span>
                        ) : current.isDefault ? (
                            <>
                <span className="font-medium text-foreground">
                  {current.path}
                </span>{" "}
                                — the default project ({current.scriptCount} scripts).
                            </>
                        ) : current.hasPy ? (
                            <>
                <span className="font-medium text-foreground">
                  {current.path}
                </span>{" "}
                                — {current.scriptCount} Python{" "}
                                {current.scriptCount === 1 ? "file" : "files"}.
                            </>
                        ) : (
                            <>
                <span className="font-medium text-foreground">
                  {current.path}
                </span>{" "}
                                — no Python files yet; it will open as an empty project.
                            </>
                        )}
                    </div>
                )}

                {/* Manual path entry */}
                <div className="flex items-center gap-1.5">
                    <Input
                        value={manualPath}
                        onChange={(e) => setManualPath(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && manualPath.trim() && !opening) {
                                e.preventDefault();
                                void openAsProject(resolveTyped(manualPath));
                            }
                        }}
                        placeholder={
                            current
                                ? `Any path, e.g. ${current.path}/my-project`
                                : "Absolute path…"
                        }
                        className="h-8 text-xs"
                        aria-label="Open a project by path"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        disabled={!manualPath.trim() || opening}
                        onClick={() => void openAsProject(resolveTyped(manualPath))}
                        title="Open the typed path as the project (validated on the server)"
                    >
                        Open path
                    </Button>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="text-xs gap-1.5"
                        disabled={!canOpenCurrent}
                        onClick={() => void openAsProject(current!.path)}
                        title={
                            canOpenCurrent
                                ? `Open "${currentName}" as the active project`
                                : atFsRoot
                                    ? "Pick a folder first — the drive root is not a project"
                                    : current?.rejection ??
                                    current?.isAppDir
                                        ? "This folder cannot be opened as a project"
                                        : "Pick a folder first"
                        }
                    >
                        {opening ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <FolderOpen className="size-3.5"/>
                        )}
                        {atFsRoot ? "Open Project Folder" : `Open "${currentName}"`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Basename helper that handles both separators (display-only). */
function pathBase(p: string): string {
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : p;
}
