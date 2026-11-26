"use client";
import dynamic from "next/dynamic";

import * as React from "react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    ArrowLeftRight,
    ArrowUpCircle,
    Info as InfoIcon,
    Loader2,
    Package,
    Pin,
    RefreshCw,
    Search,
    Trash2,
    TriangleAlert,
} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import type {DeclaredDependency, ManifestSource} from "@/lib/manifest-deps";
import {cn} from "@/lib/utils";

interface PipPackage {
    name: string;
    version: string;
}

const EnvSyncTab = dynamic(() => import("@/components/env-sync-tab").then((m) => m.EnvSyncTab), {ssr: false});

/** One manifest the project declares dependencies in. */
interface ManifestsState {
    requirements: boolean;
    pyproject: boolean;
}

/** Short badge label for where one declared dependency came from. */
function manifestSourceLabel(source: ManifestSource, group?: string): string {
    switch (source) {
        case "requirements":
            return "requirements.txt";
        case "pyproject":
            return "pyproject [project]";
        case "pyproject-optional":
            return `pyproject [${group ?? "optional"}]`;
        case "pyproject-uv":
            return "pyproject [tool.uv]";
        default:
            return source;
    }
}

interface OutdatedEntry {
    name: string;
    version: string;
    latest: string;
}

/**
 *  — the Dependency Manager (Tools ▸ Dependency Manager…).
 *
 * A manager over the SELECTED environment's site-packages: every
 * installed package + version, an on-demand "check outdated" (hits
 * PyPI — that is why it is a button, not automatic), per-package
 * UPDATE / REMOVE buttons on EVERY row, an "Update all" pass over
 * the whole outdated set, an install-by-name input, and a one-click
 * "pin to requirements.txt" that freezes the current versions at the
 * project root so the folder becomes reproducible.
 *
 * The project's DECLARED dependencies are read from BOTH manifests —
 * requirements.txt AND pyproject.toml ([project].dependencies,
 * optional-dependencies groups, uv-style [tool.uv]) — the badges
 * under the list show which manifest(s) were detected, and every
 * package row carries its own Pin button that writes `name==version`
 * INTO THE MANIFEST IT CAME FROM (a minimal, validated TOML edit for
 * pyproject; a merged line for requirements.txt; a requirements.txt
 * line + an explanation when the TOML array can't be edited safely).
 */
export function DependencyManagerDialog({
                                            open,
                                            onOpenChange,
                                            interpreter,
                                            folderSlug,
                                        }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** The ACTIVE folder — the Environment Sync section (freeze /
     *  diff / sync / lock / pin) runs against it. */
    folderSlug?: string;
    /** The environment selected in Settings (pythonInterpreter). Sent
     * with every request so the package list ALWAYS reflects the env
     * the user picked — not the server's auto-detected default. */
    interpreter?: string;
}) {
    const {toast} = useToast();
    const [packages, setPackages] = React.useState<PipPackage[] | null>(null);
    /** What the API actually listed (echoed back by the server). */
    const [listedInterpreter, setListedInterpreter] = React.useState<string | null>(null);
    const [requirements, setRequirements] = React.useState<string | null>(null);
    /** pyproject.toml content at the ACTIVE project root (null = the
     *  project declares its dependencies only in requirements.txt — or
     *  in nothing at all yet). */
    const [pyproject, setPyproject] = React.useState<string | null>(null);
    /** Which manifests were detected — the badges in the panel below. */
    const [manifests, setManifests] = React.useState<ManifestsState>({
        requirements: false,
        pyproject: false,
    });
    /** The declared dependencies across BOTH manifests, each tagged with
     *  the manifest it came from (drives the per-row Pin tooltip + the
     *  summary list). */
    const [declared, setDeclared] = React.useState<DeclaredDependency[] | null>(null);
    const [outdated, setOutdated] = React.useState<Map<string, OutdatedEntry> | null>(null);
    const [listError, setListError] = React.useState<string | null>(null);
    /** False when the selected env has no pip module (conda envs) — the
     * list then came from importlib.metadata and pip-only actions are
     * disabled with an actionable hint. */
    const [pipAvailable, setPipAvailable] = React.useState(true);
    const [listingMethod, setListingMethod] = React.useState<"pip" | "importlib.metadata">("pip");
    const [query, setQuery] = React.useState("");
    /** The install input ("requests" or "pandas==2.2.0"). */
    const [installText, setInstallText] = React.useState("");
    const [busy, setBusy] = React.useState<string | null>(null); // action id, e.g. "outdated" | "upgrade:black"
    const [refreshNonce, setRefreshNonce] = React.useState(0);
    /** Active view: the Packages list or the Environment Sync tab. */
    const [view, setView] = React.useState<"packages" | "sync">("packages");

    const load = React.useCallback(async () => {
        setPackages(null);
        setListError(null);
        try {
            // ?interpreter= pins the listing to the environment selected in
            // the Settings dialog
            // a different env than the one chosen in the config).
            const qs = interpreter ? `?interpreter=${encodeURIComponent(interpreter)}` : "";
            const res = await fetch(`/api/pip-list${qs}`, {cache: "no-store"});
            const data = (await res.json()) as
                | {
                ok: true;
                packages: PipPackage[];
                interpreter: string;
                requirements: string | null;
                pipAvailable?: boolean;
                method?: "pip" | "importlib.metadata";
                pyproject?: string | null;
                declared?: DeclaredDependency[];
                manifests?: ManifestsState
            }
                | {
                ok: false;
                error?: string;
                packages?: PipPackage[];
                interpreter?: string;
                requirements?: string | null;
                pipAvailable?: boolean;
                method?: "pip" | "importlib.metadata";
                pyproject?: string | null;
                declared?: DeclaredDependency[];
                manifests?: ManifestsState
            };
            setPackages(data.packages ?? []);
            setListedInterpreter(data.interpreter ?? null);
            setRequirements(data.requirements ?? null);
            setPyproject(data.pyproject ?? null);
            setManifests(data.manifests ?? {
                requirements: data.requirements != null,
                pyproject: data.pyproject != null
            });
            setDeclared(data.declared ?? null);
            setPipAvailable(data.pipAvailable !== false);
            setListingMethod(data.method ?? "pip");
            // Only a real failure (spawn error / no Python at all) is an
            // error. A missing pip module is NOT — the importlib.metadata
            // fallback still produced the package list; the informational
            // banner below explains what is disabled and how to fix it.
            if (!data.ok && (data.packages ?? []).length === 0) {
                setListError(data.error ?? "No packages could be listed for this environment.");
            } else {
                setListError(null);
            }
        } catch {
            setListError("Network error while listing packages.");
            setPackages([]);
        }
    }, [interpreter]);

    // Load whenever the dialog opens (or Refresh is clicked).
    React.useEffect(() => {
        if (!open) return;
        void load();
    }, [open, refreshNonce, load, interpreter]);

    const filtered = React.useMemo(() => {
        if (!packages) return null;
        const q = query.trim().toLowerCase();
        return q ? packages.filter((p) => p.name.toLowerCase().includes(q)) : packages;
    }, [packages, query]);

    /** POST an action to /api/pip-list and refresh afterwards. The
     *  optional `version` rides the pin-package action so the server
     *  writes the exact frozen spec the user saw in the row. */
    const runAction = React.useCallback(
        async (
            action: "outdated" | "upgrade" | "uninstall" | "install" | "upgrade-all" | "pin" | "pin-package",
            pkg?: string,
            packages?: string[],
            version?: string
        ) => {
            const id = pkg ? `${action}:${pkg}` : action;
            setBusy(id);
            try {
                const res = await fetch("/api/pip-list", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action, package: pkg, packages, interpreter, version}),
                });
                const data = (await res.json()) as {
                    ok?: boolean;
                    error?: string;
                    outdated?: OutdatedEntry[];
                    requirements?: string;
                    pyproject?: string | null;
                    declared?: DeclaredDependency[];
                    manifests?: ManifestsState;
                    count?: number;
                    output?: string;
                    wrote?: string;
                    version?: string;
                    fellBack?: boolean;
                    reason?: string;
                };
                if (action === "outdated") {
                    if (data.error) {
                        toast({title: "Outdated check failed", description: data.error, variant: "destructive"});
                    } else {
                        const map = new Map<string, OutdatedEntry>();
                        for (const e of data.outdated ?? []) map.set(e.name.toLowerCase(), e);
                        setOutdated(map);
                        toast({
                            title: map.size === 0 ? "Everything is up to date" : `${map.size} outdated package${map.size > 1 ? "s" : ""}`,
                            description:
                                map.size === 0
                                    ? "Every installed package matches its latest published version."
                                    : "The list below now badges the packages that have newer releases on PyPI.",
                        });
                    }
                } else if (action === "pin") {
                    if (data.ok) {
                        setRequirements(data.requirements ?? null);
                        setPyproject(data.pyproject ?? null);
                        setManifests(data.manifests ?? {
                            requirements: data.requirements != null,
                            pyproject: data.pyproject != null
                        });
                        setDeclared(data.declared ?? null);
                        toast({
                            title: "requirements.txt pinned",
                            description: `${data.count ?? 0} packages frozen at their current versions${(data as {
                                method?: string
                            }).method ? ` (via ${(data as { method: string }).method})` : ""}.`,
                        });
                    } else {
                        toast({
                            title: "Pin failed",
                            description: data.error ?? "pip freeze failed.",
                            variant: "destructive"
                        });
                    }
                } else if (action === "pin-package") {
                    if (data.ok) {
                        // The response carries the FRESH manifest state — apply it
                        // directly (no extra GET needed).
                        setRequirements(data.requirements ?? null);
                        setPyproject(data.pyproject ?? null);
                        setManifests(data.manifests ?? {
                            requirements: data.requirements != null,
                            pyproject: data.pyproject != null
                        });
                        setDeclared(data.declared ?? null);
                        const spec = `${pkg}==${data.version ?? version ?? ""}`;
                        if (data.fellBack) {
                            // The pyproject dependencies array could not be edited
                            // safely — the pin landed in requirements.txt instead and
                            // the UI must SAY so (never a silent manifest drift).
                            toast({
                                title: `${pkg} pinned to requirements.txt`,
                                description: `${spec} — pyproject.toml was left untouched: ${data.reason ?? "its dependencies array could not be edited safely"}.`,
                                variant: "default",
                            });
                        } else if (data.wrote === "pyproject.toml") {
                            toast({
                                title: `${pkg} pinned in pyproject.toml`,
                                description: `${spec} replaced the entry in the [project] dependencies array — the manifest it was declared in.`,
                            });
                        } else {
                            toast({
                                title: `${pkg} pinned`,
                                description: `${spec} written to requirements.txt.`,
                            });
                        }
                    } else {
                        toast({
                            title: "Pin failed",
                            description: data.error ?? "Could not write the pin.",
                            variant: "destructive"
                        });
                    }
                } else if (action === "install") {
                    if (data.ok) {
                        toast({title: `${pkg} installed`, description: "The package list is refreshing…"});
                        setInstallText("");
                        await load();
                    } else {
                        toast({
                            title: "Install failed",
                            description: data.error ?? "See the pip output.",
                            variant: "destructive"
                        });
                    }
                } else if (action === "upgrade-all") {
                    const n = data.count ?? (packages ?? []).length;
                    if (data.ok) {
                        toast({
                            title: `${n} package${n === 1 ? "" : "s"} upgraded`,
                            description: "The package list is refreshing… — re-run Check outdated to confirm."
                        });
                        setOutdated(null);
                        await load();
                    } else {
                        toast({
                            title: "Update-all failed",
                            description: data.error ?? "See the pip output.",
                            variant: "destructive"
                        });
                    }
                } else {
                    // upgrade / uninstall
                    if (data.ok) {
                        toast({
                            title: `${pkg} ${action === "upgrade" ? "upgraded" : "uninstalled"}`,
                            description: "The package list is refreshing…"
                        });
                        await load();
                    } else {
                        toast({
                            title: `${action} failed`,
                            description: data.error ?? "See the console output.",
                            variant: "destructive"
                        });
                    }
                }
            } catch {
                toast({title: "Action failed", description: "Network error.", variant: "destructive"});
            } finally {
                setBusy(null);
            }
        },
        [load, toast, interpreter]
    );

    const outdatedCount = outdated?.size ?? 0;

    /** Update-all: one pip pass over every outdated package. */
    const runUpdateAll = React.useCallback(() => {
        if (!outdated || outdated.size === 0) return;
        const names = [...outdated.values()].map((e) => e.name);
        void runAction("upgrade-all", undefined, names);
    }, [outdated, runAction]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <ResizableDialogContent id="dependency-manager" defaultW={940} defaultH={660} className="flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="size-5"/>
                        Dependency Manager
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Refresh the package list"
                            title="Refresh"
                            onClick={() => setRefreshNonce((n) => n + 1)}
                        >
                            <RefreshCw className="size-3.5"/>
                        </Button>
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2">
            <span className="min-w-0">
              Installed packages of the selected environment —{" "}
                <span className="font-mono text-[10px] break-all" title={listedInterpreter ?? undefined}>
                {/* Prefer the env the server actually used (it echoes the
                    validated path); fall back to the configured selection. */}
                    {listedInterpreter ?? interpreter ?? "pip could not be reached."}
              </span>
                {interpreter && listedInterpreter && listedInterpreter !== interpreter && (
                    <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                  (configured: {interpreter})
                </span>
                )}
            </span>
                    </DialogDescription>
                </DialogHeader>

                {/* ── Tabs: Packages | Sync ──────────────────────────────────
            The Sync view is a REAL tab now (not a collapsed details
            block above the package list): freeze the env into
            requirements.txt / pyproject, diff declared-vs-installed
            with per-package actions, one-click Sync, lock files, and
            per-project interpreter pinning. */}
                <div className="flex items-center gap-1 shrink-0 border-b" role="tablist"
                     aria-label="Dependency Manager views">
                    {(["packages", "sync"] as const).map((v) => (
                        <button
                            key={v}
                            type="button"
                            role="tab"
                            aria-selected={view === v}
                            onClick={() => setView(v)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                                view === v
                                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {v === "packages" ? <Package className="size-3.5"/> :
                                <ArrowLeftRight className="size-3.5"/>}
                            {v === "packages" ? "Packages" : "Sync"}
                        </button>
                    ))}
                    {view === "sync" && (
                        <span className="ml-auto pr-2 text-[10px] text-muted-foreground">freeze · diff · sync · lock · pin</span>
                    )}
                </div>

                {view === "sync" ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {folderSlug ? (
                            <EnvSyncTab folderSlug={folderSlug} folderName={folderSlug} interpreter={interpreter}/>
                        ) : (
                            <p className="text-[11px] text-muted-foreground py-6 text-center">
                                Open a folder first — Environment Sync compares the active project&apos;s declared
                                dependencies with the selected interpreter.
                            </p>
                        )}
                    </div>
                ) : (
                    <>

                        {/* Toolbar: search + outdated check + pin */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="relative flex-1 min-w-40">
                                <Search
                                    className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Filter packages…"
                                    className="h-8 pl-7 text-xs"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={busy !== null || !pipAvailable}
                                onClick={() => runAction("outdated")}
                                title={
                                    pipAvailable
                                        ? "Query PyPI for newer releases of the installed packages (needs network access)"
                                        : "Needs pip — this environment has no pip module (the list was read via importlib.metadata). Install it with `python -m ensurepip --upgrade` or `conda install pip`, then refresh."
                                }
                            >
                                {busy === "outdated" ? <Loader2 className="size-3.5 animate-spin"/> :
                                    <ArrowUpCircle className="size-3.5"/>}
                                Check outdated
                                {outdatedCount > 0 && (
                                    <span
                                        className="ml-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 text-[10px] font-semibold">
                {outdatedCount}
              </span>
                                )}
                            </Button>
                            {outdatedCount > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs text-emerald-600 dark:text-emerald-400"
                                    disabled={busy !== null || !pipAvailable}
                                    onClick={runUpdateAll}
                                    title={`pip install --upgrade all ${outdatedCount} outdated packages in one pass (can take a few minutes)`}
                                >
                                    {busy === "upgrade-all" ? <Loader2 className="size-3.5 animate-spin"/> :
                                        <ArrowUpCircle className="size-3.5"/>}
                                    Update all
                                    <span
                                        className="ml-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 text-[10px] font-semibold">
                {outdatedCount}
              </span>
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={busy !== null}
                                onClick={() => runAction("pin")}
                                title="pip freeze → requirements.txt at the project root, so the project is reproducible"
                            >
                                {busy === "pin" ? <Loader2 className="size-3.5 animate-spin"/> :
                                    <Pin className="size-3.5"/>}
                                Pin to requirements.txt
                            </Button>
                        </div>

                        {/* Install a new package (pip install <name>[==version]). */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative flex-1 min-w-40">
                                <Package
                                    className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                                <Input
                                    value={installText}
                                    onChange={(e) => setInstallText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && installText.trim() && pipAvailable && busy === null) {
                                            e.preventDefault();
                                            void runAction("install", installText.trim());
                                        }
                                    }}
                                    placeholder="Install a package… e.g. requests or pandas==2.2.0"
                                    className="h-8 pl-7 text-xs font-mono"
                                    disabled={!pipAvailable || busy !== null}
                                    aria-label="Package to install"
                                    title={pipAvailable ? "pip install <name> into the selected environment" : "Needs pip — this environment has no pip module (see the banner below)"}
                                />
                            </div>
                            <Button
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pipAvailable || busy !== null || !installText.trim()}
                                onClick={() => void runAction("install", installText.trim())}
                                title="Install the package into the selected environment"
                            >
                                {busy && busy.startsWith("install:") ? <Loader2 className="size-3.5 animate-spin"/> :
                                    <ArrowUpCircle className="size-3.5 rotate-45"/>}
                                Install
                            </Button>
                        </div>

                        {/* No-pip banner (conda envs): the list still works via
            importlib.metadata — explain what is off and how to enable
            it, instead of the old dead-end error. */}
                        {!pipAvailable && packages != null && packages.length > 0 ? (
                            <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1 py-2 rounded-md bg-sky-500/5 border border-sky-500/20">
                                <InfoIcon className="size-3.5 shrink-0 mt-0.5 text-sky-500"/>
                                <span>
              This environment has no <span className="font-mono">pip</span> module, so the package list
              was read with Python&apos;s built-in <span className="font-mono">importlib.metadata</span>
                                    {listingMethod === "importlib.metadata" ? " (same site-packages, same versions)" : ""}.
              "Check outdated", install, update and remove all need pip — install it with{" "}
                                    <span
                                        className="font-mono">{listedInterpreter ?? "python"} -m ensurepip --upgrade</span>{" "}
                                    (or <span className="font-mono">conda install pip</span>), then press Refresh.
            </span>
                            </p>
                        ) : null}

                        {listError ? (
                            <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1 py-3">
                                <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-amber-500"/>
                                {listError}
                            </p>
                        ) : filtered === null ? (
                            <p className="text-xs text-muted-foreground py-6 text-center">Listing packages…</p>
                        ) : filtered.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-6 text-center">
                                {query ? `No package matches “${query}”.` : "No packages installed in this environment."}
                            </p>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-y-auto rounded-md border text-xs">
                                {filtered.map((p) => {
                                    const od = outdated?.get(p.name.toLowerCase());
                                    // Which manifest(s) this row is declared in — the Pin
                                    // button writes the frozen spec THERE (requirements.txt
                                    // line / pyproject array entry) instead of blindly
                                    // freezing everything into requirements.txt.
                                    const rowDeclared = (declared ?? []).filter(
                                        (d) => d.name.toLowerCase().replace(/[-_.]+/g, "-") === p.name.toLowerCase().replace(/[-_.]+/g, "-")
                                    );
                                    const rowManifest = rowDeclared.length > 0
                                        ? rowDeclared.map((d) => manifestSourceLabel(d.source, d.group)).join(" · ")
                                        : "requirements.txt (new line)";
                                    return (
                                        <div
                                            key={p.name}
                                            className="flex items-center gap-2 px-2 py-1.5 border-b last:border-b-0 hover:bg-accent/40"
                                        >
                  <span className="font-mono font-medium truncate flex-1" title={p.name}>
                    {p.name}
                  </span>
                                            {od ? (
                                                <span
                                                    className="flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400"
                                                    title={`Installed ${od.version} — latest is ${od.latest}`}
                                                >
                      <TriangleAlert className="size-3"/>
                                                    {p.version} → {od.latest}
                    </span>
                                            ) : (
                                                <span
                                                    className="text-[10px] font-mono text-muted-foreground">{p.version}</span>
                                            )}
                                            <span className="flex items-center gap-1 shrink-0">
                      <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`Pin ${p.name} at ${p.version}`}
                          title={`Pin ${p.name}==${p.version} into the manifest it is declared in — ${rowManifest}`}
                          disabled={busy !== null}
                          onClick={() => runAction("pin-package", p.name, undefined, p.version)}
                      >
                        {busy === `pin-package:${p.name}` ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <Pin className="size-3.5 text-amber-500"/>
                        )}
                      </Button>
                      <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`Update ${p.name}`}
                          title={
                              !pipAvailable
                                  ? "Needs pip — install it first (see the banner above)"
                                  : od ? `Update to ${od.latest}` : "Update to the latest release"
                          }
                          disabled={busy !== null || !pipAvailable}
                          onClick={() => runAction("upgrade", p.name)}
                      >
                        {busy === `upgrade:${p.name}` ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <ArrowUpCircle className="size-3.5 text-emerald-600 dark:text-emerald-400"/>
                        )}
                      </Button>
                      <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`Remove ${p.name}`}
                          title={!pipAvailable ? "Needs pip — install it first (see the banner above)" : `Remove ${p.name} from this environment`}
                          disabled={busy !== null || !pipAvailable}
                          onClick={() => runAction("uninstall", p.name)}
                      >
                        {busy === `uninstall:${p.name}` ? (
                            <Loader2 className="size-3.5 animate-spin"/>
                        ) : (
                            <Trash2 className="size-3.5 text-red-600 dark:text-red-400"/>
                        )}
                      </Button>
                    </span>
                                        </div>
                                    );
                                })}
                                <p className="px-2 py-1.5 text-[10px] text-muted-foreground border-t">
                                    {filtered.length} of {packages?.length ?? 0} packages — every row can be pinned,
                                    updated or removed;
                                    install new ones with the input above (all through{" "}
                                    <span className="font-mono">python -m pip</span> of the selected environment).
                                </p>
                            </div>
                        )}

                        {/* Manifests state — which manifest(s) the ACTIVE project
            declares its dependencies in (requirements.txt / pyproject
            [project] / optional groups / [tool.uv]) + their declared
            entries, each badged with the manifest it came from. */}
                        <div className="shrink-0 rounded-md border px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <p className="text-[10px] font-medium text-muted-foreground">Detected manifests</p>
                                <span
                                    className={cn(
                                        "rounded-full px-1.5 py-0 text-[10px] font-semibold",
                                        manifests.requirements
                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground/70"
                                    )}
                                    title={
                                        manifests.requirements
                                            ? "requirements.txt was found at the active project root"
                                            : "no requirements.txt at the active project root"
                                    }
                                >
              {manifests.requirements ? "requirements.txt" : "requirements.txt — none"}
            </span>
                                <span
                                    className={cn(
                                        "rounded-full px-1.5 py-0 text-[10px] font-semibold",
                                        manifests.pyproject
                                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                            : "bg-muted text-muted-foreground/70"
                                    )}
                                    title={
                                        manifests.pyproject
                                            ? "pyproject.toml was found at the active project root ([project].dependencies, optional-dependencies groups and uv-style [tool.uv] are read)"
                                            : "no pyproject.toml at the active project root"
                                    }
                                >
              {manifests.pyproject ? "pyproject.toml" : "pyproject.toml — none"}
            </span>
                                {declared && declared.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                — {declared.length} declared
              </span>
                                )}
                            </div>

                            {/* Declared dependencies across BOTH manifests — one line each,
              badged with the manifest it came from. */}
                            {declared && declared.length > 0 && (
                                <div className="max-h-24 overflow-y-auto text-[10px] leading-relaxed mb-1.5 pr-1">
                                    {declared.map((d) => (
                                        <div key={`${d.source}-${d.group ?? ""}-${d.name}`}
                                             className="flex items-center gap-1.5 py-0.5">
                  <span className="font-mono font-medium truncate" title={d.spec ? `${d.name}${d.spec}` : d.name}>
                    {d.name}
                  </span>
                                            {d.spec ? (
                                                <span className="font-mono text-muted-foreground truncate"
                                                      title={`${d.name}${d.spec}`}>
                      {d.spec}
                    </span>
                                            ) : null}
                                            <span
                                                className={cn(
                                                    "ml-auto shrink-0 rounded-full px-1.5 py-0 font-semibold",
                                                    d.source === "requirements"
                                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                                )}
                                                title={`Declared in ${manifestSourceLabel(d.source, d.group)}`}
                                            >
                    {manifestSourceLabel(d.source, d.group)}
                  </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* requirements.txt content (existing behavior, kept verbatim) */}
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">
                                requirements.txt {requirements ? "(project root)" : "— not pinned yet"}
                            </p>
                            {requirements ? (
                                <pre
                                    className="max-h-20 overflow-y-auto text-[10px] font-mono whitespace-pre leading-relaxed">
              {requirements}
            </pre>
                            ) : (
                                <p className="text-[10px] text-muted-foreground">
                                    Click <span className="font-medium">Pin to requirements.txt</span> to freeze the
                                    current versions
                                    and make the project reproducible.
                                </p>
                            )}

                            {/* pyproject.toml content — shown when the project has one so
              the pin target is visible right where the freeze lives. */}
                            {pyproject ? (
                                <>
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1 mt-2">
                                        pyproject.toml (project root)
                                    </p>
                                    <pre
                                        className="max-h-24 overflow-y-auto text-[10px] font-mono whitespace-pre leading-relaxed">
                {pyproject}
              </pre>
                                </>
                            ) : null}
                        </div>
                    </>
                )}
            </ResizableDialogContent>
        </Dialog>
    );
}
