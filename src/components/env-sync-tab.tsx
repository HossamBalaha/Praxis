"use client";

import * as React from "react";
import {CheckCircle2, Loader2, Lock, Package, Pin, Plus, RefreshCw, Save, TriangleAlert,} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * EnvSyncTab — the declared-vs-installed environment view for one folder
 * folder, backed by /api/env-sync.
 *
 * Sections: Declared (with per-row Install for missing packages — one
 * scoped sync POST with a dry-run probe on the server), Extras (with a
 * per-row "add to requirements" merge), and the Actions row (Freeze —
 * a destructive overwrite behind a confirm dialog; Lock file; Pin
 * interpreter). Skeletons while loading, toasts on completion.
 */

interface DeclaredDep {
    name: string;
    spec?: string;
    source: "requirements" | "pyproject";
}

interface MissingDep {
    name: string;
    spec?: string;
    source: string;
}

interface InstalledPkg {
    name: string;
    version: string;
}

interface EnvSyncData {
    ok: boolean;
    interpreter: string;
    pinned?: string;
    declared: DeclaredDep[];
    installed: InstalledPkg[];
    missing: MissingDep[];
    extra: InstalledPkg[];
    lockfilePresent: boolean;
}

interface EnvSyncResult {
    name: string;
    action: string;
    ok: boolean;
    note?: string;
}

interface EnvSyncPostResponse {
    ok?: boolean;
    results?: EnvSyncResult[];
    wrote?: string;
    error?: string;
}

interface EnvSyncTabProps {
    folderSlug: string;
    folderName: string;
    interpreter?: string;
}

export function EnvSyncTab({folderSlug, folderName, interpreter}: EnvSyncTabProps) {
    const {toast} = useToast();
    const [data, setData] = React.useState<EnvSyncData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    /** Per-package spinners (install / add-to-requirements rows). */
    const [busy, setBusy] = React.useState<Record<string, boolean>>({});
    /** Per-row result chips from the last action. */
    const [rowResult, setRowResult] = React.useState<Record<string, { ok: boolean; note?: string }>>({});
    const [actionBusy, setActionBusy] = React.useState<"freeze" | "lock" | "pin" | "sync-all" | null>(null);
    const [confirmFreeze, setConfirmFreeze] = React.useState(false);
    // Freeze target — requirements.txt (the classic) or the pyproject
    // [project].dependencies block.
    const [freezeTarget, setFreezeTarget] = React.useState<"requirements" | "pyproject">("requirements");
    const [pinPath, setPinPath] = React.useState("");

    const load = React.useCallback(async (): Promise<void> => {
        setLoading(true);
        setLoadError(null);
        try {
            const url =
                `/api/env-sync?folder=${encodeURIComponent(folderSlug)}` +
                (interpreter ? `&interpreter=${encodeURIComponent(interpreter)}` : "");
            const res = await fetch(url);
            const body = (await res.json()) as EnvSyncData & { error?: string };
            if (!res.ok || !body.ok) {
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setData(body);
            setPinPath(body.pinned ?? interpreter ?? "");
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Could not read the environment.");
        } finally {
            setLoading(false);
        }
    }, [folderSlug, interpreter]);

    React.useEffect(() => {
        void load();
    }, [load]);

    const post = React.useCallback(
        async (body: Record<string, unknown>): Promise<EnvSyncPostResponse | null> => {
            try {
                const res = await fetch("/api/env-sync", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder: folderSlug, interpreter, ...body}),
                });
                const data = (await res.json()) as EnvSyncPostResponse;
                if (!res.ok) {
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                return data;
            } catch (err) {
                toast({
                    title: "Environment action failed",
                    description: err instanceof Error ? err.message : "Unknown error.",
                    variant: "destructive",
                });
                return null;
            }
        },
        [folderSlug, interpreter, toast]
    );

    const firstResultNote = (data: EnvSyncPostResponse | null): string | undefined => {
        const r = data?.results?.[0];
        return r?.note;
    };

    const installOne = React.useCallback(
        async (dep: MissingDep): Promise<void> => {
            setBusy((b) => ({...b, [dep.name]: true}));
            const res = await post({action: "sync", package: dep.name});
            setBusy((b) => ({...b, [dep.name]: false}));
            const r = res?.results?.find((x) => x.name === dep.name);
            if (r) {
                setRowResult((prev) => ({...prev, [dep.name]: {ok: r.ok, note: r.note}}));
                toast({
                    title: r.ok ? `Installed ${dep.name}` : `Could not install ${dep.name}`,
                    description: r.note,
                    variant: r.ok ? "default" : "destructive",
                });
                if (r.ok) void load();
            }
        },
        [post, load, toast]
    );

    const addRequirement = React.useCallback(
        async (pkg: InstalledPkg): Promise<void> => {
            setBusy((b) => ({...b, [pkg.name]: true}));
            const res = await post({action: "freeze", package: pkg.name});
            setBusy((b) => ({...b, [pkg.name]: false}));
            if (res?.ok) {
                setRowResult((prev) => ({...prev, [pkg.name]: {ok: true, note: "added to requirements.txt"}}));
                toast({
                    title: `Added ${pkg.name} to requirements`,
                    description: firstResultNote(res),
                });
                void load();
            } else {
                const r = res?.results?.[0];
                setRowResult((prev) => ({...prev, [pkg.name]: {ok: false, note: r?.note}}));
            }
        },
        [post, load, toast]
    );

    const doFreeze = React.useCallback(async (): Promise<void> => {
        setConfirmFreeze(false);
        setActionBusy("freeze");
        // Freeze target: requirements.txt (default) or the pyproject
        // [project].dependencies block — the route always supported both,
        // the tab just hard-coded requirements.
        const res = await post({action: "freeze", target: freezeTarget});
        setActionBusy(null);
        if (res?.ok) {
            toast({
                title: "Freeze complete",
                description: `${res.wrote ?? (freezeTarget === "pyproject" ? "pyproject.toml" : "requirements.txt")} written (${firstResultNote(res) ?? ""})`,
            });
            void load();
        }
    }, [post, load, toast, freezeTarget]);

    /* Bulk sync — no package → the route syncs EVERY missing declared
     * dependency in one pass (its `targets = env.missing` branch). */
    const doSyncAll = React.useCallback(async (): Promise<void> => {
        if ((data?.missing ?? []).length === 0) {
            toast({title: "Nothing to sync", description: "Every declared dependency is already installed."});
            return;
        }
        setActionBusy("sync-all");
        const res = await post({action: "sync"});
        setActionBusy(null);
        if (res?.ok) {
            const okCount = (res?.results ?? []).filter((r) => r.ok).length;
            toast({
                title: "Sync complete",
                description: `${okCount} of ${(res?.results ?? []).length} package(s) installed — ${firstResultNote(res) ?? ""}`,
            });
            void load();
        }
    }, [post, load, toast, data]);

    const doLock = React.useCallback(async (): Promise<void> => {
        setActionBusy("lock");
        const res = await post({action: "lock"});
        setActionBusy(null);
        if (res?.ok) {
            toast({
                title: "Lock file written",
                description: `${res.wrote ?? "requirements.lock"} (${firstResultNote(res) ?? ""})`,
            });
            void load();
        }
    }, [post, load, toast]);

    const doPin = React.useCallback(async (): Promise<void> => {
        const p = pinPath.trim();
        if (!p || !p.startsWith("/")) {
            toast({
                title: "Pin needs an absolute path",
                description: "Example: /home/user/.venv/bin/python",
                variant: "destructive",
            });
            return;
        }
        setActionBusy("pin");
        const res = await post({action: "pin", pin: p});
        setActionBusy(null);
        if (res?.ok) {
            toast({title: "Interpreter pinned", description: res.wrote ?? ".praxis/interpreter.json"});
            void load();
        }
    }, [pinPath, post, load, toast]);

    const missingSet = React.useMemo<Set<string>>(() => {
        return new Set((data?.missing ?? []).map((m) => m.name.toLowerCase()));
    }, [data]);

    /** Which manifest(s) this folder's declared deps were read from —
     *  the same "detected manifests" summary the Dependency Manager
     *  shows, derived from the declared entries' sources (an entry with
     *  source "pyproject" proves the folder has a pyproject.toml).
     *  Memoized ABOVE the loading/error early returns so the hook order
     *  is identical on every render (rules-of-hooks). */
    const detectedManifests = React.useMemo(() => {
        const has = new Set<string>();
        for (const d of data?.declared ?? []) has.add(d.source);
        return {
            requirements: has.has("requirements"),
            pyproject: has.has("pyproject"),
        };
    }, [data]);

    const renderDeclaredRow = (dep: DeclaredDep): React.ReactNode => {
        const missing = missingSet.has(dep.name.toLowerCase());
        const isBusy = busy[dep.name] === true;
        const result = rowResult[dep.name];
        return (
            <div
                key={`${dep.source}-${dep.name}`}
                className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-accent/50"
                role="listitem"
                aria-label={`Declared dependency ${dep.name}`}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs font-medium">{dep.name}</span>
                    {dep.spec && (
                        <span className="truncate font-mono text-xs text-muted-foreground" title={dep.spec}>
              {dep.spec}
            </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                        {dep.source === "requirements" ? "requirements.txt" : "pyproject.toml"}
                    </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {missing ? (
                        <>
                            <Badge variant="destructive" className="text-[10px]">
                                missing
                            </Badge>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void installOne(dep)}
                                disabled={isBusy}
                                aria-label={`Install ${dep.name}`}
                            >
                                {isBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/> :
                                    <Package className="size-3.5" aria-hidden="true"/>}
                                Install
                            </Button>
                        </>
                    ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true"/>
              installed
            </span>
                    )}
                    {result && (
                        <Badge variant={result.ok ? "secondary" : "destructive"}
                               className="max-w-48 truncate text-[10px]" title={result.note}>
                            {result.ok ? "ok" : "failed"}
                        </Badge>
                    )}
                </div>
            </div>
        );
    };

    const renderExtraRow = (pkg: InstalledPkg): React.ReactNode => {
        const isBusy = busy[pkg.name] === true;
        const result = rowResult[pkg.name];
        return (
            <div
                key={pkg.name}
                className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-accent/50"
                role="listitem"
                aria-label={`Extra installed package ${pkg.name}`}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs font-medium">{pkg.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{pkg.version}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {result && (
                        <Badge variant={result.ok ? "secondary" : "destructive"}
                               className="max-w-48 truncate text-[10px]" title={result.note}>
                            {result.ok ? "added" : "failed"}
                        </Badge>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void addRequirement(pkg)}
                        disabled={isBusy}
                        aria-label={`Add ${pkg.name} to requirements.txt`}
                    >
                        {isBusy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/> :
                            <Plus className="size-3.5" aria-hidden="true"/>}
                        Add to requirements
                    </Button>
                </div>
            </div>
        );
    };

    if (loading && !data) {
        return (
            <div className="space-y-4 p-4" aria-busy="true" aria-label={`Loading environment for ${folderName}`}>
                <Card className="gap-4 p-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-64"/>
                        <Skeleton className="h-3 w-40"/>
                    </div>
                </Card>
                <Card className="gap-3 p-4">
                    <Skeleton className="h-4 w-32"/>
                    {Array.from({length: 5}).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full"/>
                    ))}
                </Card>
                <Card className="gap-3 p-4">
                    <Skeleton className="h-4 w-24"/>
                    {Array.from({length: 3}).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full"/>
                    ))}
                </Card>
            </div>
        );
    }

    if (loadError && !data) {
        return (
            <Card className="gap-4 p-4">
                <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden="true"/>
                    <span>{loadError}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => void load()}
                        aria-label="Retry loading the environment">
                    <RefreshCw className="size-3.5" aria-hidden="true"/>
                    Retry
                </Button>
            </Card>
        );
    }

    const declaredCount = data?.declared.length ?? 0;
    const missingCount = data?.missing.length ?? 0;
    const extraCount = data?.extra.length ?? 0;

    return (
        <div className="space-y-4 p-4" aria-label={`Environment sync for ${folderName}`}>
            <Card className="gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="max-w-72 truncate font-mono text-xs"
                           title={data?.interpreter}>
                        {data?.interpreter ?? interpreter ?? "interpreter"}
                    </Badge>
                    {data?.pinned && (
                        <Badge variant="outline" className="gap-1 text-xs" title={data.pinned}>
                            <Pin className="size-3" aria-hidden="true"/>
                            pinned
                        </Badge>
                    )}
                    <Badge
                        variant="outline"
                        className={cn("text-xs")}
                        title={
                            detectedManifests.requirements
                                ? "requirements.txt was detected in this folder — its entries are part of the declared list"
                                : "no requirements.txt detected in this folder"
                        }
                    >
                        {detectedManifests.requirements ? "requirements.txt" : "requirements.txt — none"}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={cn("text-xs")}
                        title={
                            detectedManifests.pyproject
                                ? "pyproject.toml was detected in this folder — its [project] dependencies are part of the declared list"
                                : "no pyproject.toml detected in this folder"
                        }
                    >
                        {detectedManifests.pyproject ? "pyproject.toml" : "pyproject.toml — none"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        {declaredCount} declared
                    </Badge>
                    <Badge variant={missingCount > 0 ? "destructive" : "outline"} className="text-xs">
                        {missingCount} missing
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        {extraCount} extra
                    </Badge>
                    {data?.lockfilePresent && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                            <Lock className="size-3" aria-hidden="true"/>
                            lockfile
                        </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void load()}
                            aria-label="Refresh the environment"
                        >
                            <RefreshCw className="size-3.5" aria-hidden="true"/>
                            Refresh
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="gap-3 p-4">
                <CardHeader className="px-0">
                    <CardTitle className="text-sm">Declared dependencies</CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    {declaredCount === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            No requirements.txt or pyproject.toml declarations found in this folder.
                        </p>
                    ) : (
                        <div className="max-h-96 overflow-y-auto pr-1" role="list" aria-label="Declared dependencies">
                            {data?.declared.map(renderDeclaredRow)}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="gap-3 p-4">
                <CardHeader className="px-0">
                    <CardTitle className="text-sm">Extras (installed, not declared)</CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    {extraCount === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Everything installed in this environment is declared. Nothing extra.
                        </p>
                    ) : (
                        <div className="max-h-96 overflow-y-auto pr-1" role="list"
                             aria-label="Extra installed packages">
                            {data?.extra.map(renderExtraRow)}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="gap-4 p-4">
                <CardHeader className="px-0">
                    <CardTitle className="text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 px-0">
                    {/* Freeze target picker + Freeze */}
                    <div className="flex items-center gap-1.5">
                        <select
                            value={freezeTarget}
                            onChange={(e) => setFreezeTarget(e.target.value as "requirements" | "pyproject")}
                            aria-label="Freeze target manifest"
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            title="Where the freeze lands: requirements.txt or the pyproject.toml [project].dependencies block"
                        >
                            <option value="requirements">requirements.txt</option>
                            <option value="pyproject">pyproject.toml</option>
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmFreeze(true)}
                            disabled={actionBusy !== null}
                            aria-label="Freeze the environment into the selected manifest"
                        >
                            {actionBusy === "freeze" ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>
                            ) : (
                                <Save className="size-3.5" aria-hidden="true"/>
                            )}
                            Freeze
                        </Button>
                    </div>
                    {/* One-click bulk Sync — install every missing declared dep. */}
                    <Button
                        size="sm"
                        onClick={() => void doSyncAll()}
                        disabled={actionBusy !== null || (data?.missing ?? []).length === 0}
                        title="Install every declared-but-missing package in one pass"
                    >
                        {actionBusy === "sync-all" ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>
                        ) : (
                            <RefreshCw className="size-3.5" aria-hidden="true"/>
                        )}
                        Sync all missing ({(data?.missing ?? []).length})
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void doLock()}
                        disabled={actionBusy !== null}
                        aria-label="Write a requirements.lock file"
                    >
                        {actionBusy === "lock" ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>
                        ) : (
                            <Lock className="size-3.5" aria-hidden="true"/>
                        )}
                        Lock file
                    </Button>
                    <div className="flex items-center gap-2">
                        <Input
                            value={pinPath}
                            onChange={(e) => setPinPath(e.target.value)}
                            placeholder="/absolute/path/to/python"
                            aria-label="Interpreter path to pin"
                            className={cn("h-8 w-64 font-mono text-xs")}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void doPin()}
                            disabled={actionBusy !== null}
                            aria-label="Pin the interpreter"
                        >
                            {actionBusy === "pin" ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>
                            ) : (
                                <Pin className="size-3.5" aria-hidden="true"/>
                            )}
                            Pin interpreter
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={confirmFreeze} onOpenChange={setConfirmFreeze}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Overwrite requirements.txt?</DialogTitle>
                        <DialogDescription>
                            Freeze replaces requirements.txt in folder &quot;{folderName}&quot; with the full pip
                            freeze of the current environment. The existing declared list is lost. Extras
                            become pinned too. This cannot be undone from this tab.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmFreeze(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void doFreeze()}>
                            Overwrite and freeze
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
