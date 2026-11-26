"use client";

/**
 * extensions-panel — the Extensions manager dialog.
 *
 * One card per builtin manifest (icon tile monogram, permission
 * chips with a lock for scoped ones, enable/disable switch, run
 * buttons for each contributed command, live status-bar preview
 * chips), the shared notification queue, and a pinned sandbox note.
 *
 * The panel is a pure VIEW over src/lib/extensions-registry.ts's
 * subscribe store (useSyncExternalStore): it never touches Workers
 * directly — toggles call startExtension/stopExtension, buttons call
 * runCommand, and the store pushes every state change back.
 *
 * Async paths all have a visible state: skeleton cards while the
 * workers boot, a disabled switch while a start/stop is in flight,
 * and disabled run buttons while an extension is stopped.
 */

import * as React from "react";
import {Activity, Bell, Lock, Play, Puzzle, ShieldCheck, Trash2,} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Separator} from "@/components/ui/separator";
import {Skeleton} from "@/components/ui/skeleton";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {
    clearExtensionNotifications,
    type EnabledMap,
    type ExtensionManifest,
    getExtensionState,
    listBuiltinExtensions,
    loadEnabled,
    runCommand,
    saveEnabled,
    startEnabled,
    startExtension,
    stopExtension,
    subscribeExtensions,
} from "@/lib/extensions-registry";

/**
 * Permissions that reach host data or capabilities (storage, the
 * editor, the clipboard) rather than UI-only contributions — those
 * chips carry a lock icon.
 */
const SCOPED_PERMISSIONS = new Set<string>(["clipboard", "editor.insertText", "storage"]);

export interface ExtensionsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** Two-letter tile monogram, e.g. "Word Count" -> "WC". */
function initials(name: string): string {
    return (
        name
            .split(/\s+/)
            .filter((word) => word.length > 0)
            .map((word) => word.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase()
    );
}

/** Small uppercase row label ("Commands", "Status bar", ...). */
function rowLabelClass(): string {
    return "text-[10px] uppercase tracking-wider text-muted-foreground shrink-0";
}

export function ExtensionsPanel({open, onOpenChange}: ExtensionsPanelProps) {
    const builtins = React.useMemo(() => listBuiltinExtensions(), []);
    // The registry's subscribe store — the panel re-renders on every
    // host-side mutation (registrations, notifications, lifecycle).
    const state = React.useSyncExternalStore(
        subscribeExtensions,
        getExtensionState,
        getExtensionState
    );

    const [enabled, setEnabled] = React.useState<EnabledMap>(() => loadEnabled());
    const [booting, setBooting] = React.useState(false);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const bootedOnce = React.useRef(false);

    // Boot the enabled builtins the first time the dialog opens;
    // startEnabled is memoized per module lifetime, so re-opens are free.
    React.useEffect(() => {
        if (!open) return;
        if (bootedOnce.current) {
            setBooting(false);
            return;
        }
        let alive = true;
        setBooting(true);
        void startEnabled().finally(() => {
            bootedOnce.current = true;
            if (alive) setBooting(false);
        });
        return () => {
            alive = false;
        };
    }, [open]);

    const handleToggle = (ext: ExtensionManifest, next: boolean): void => {
        setBusyId(ext.id);
        void (async () => {
            try {
                if (next) {
                    await startExtension(ext);
                } else {
                    stopExtension(ext.id);
                }
                // Re-read persisted state (not the render closure) so rapid
                // toggles of two extensions can never clobber each other.
                const map: EnabledMap = {...loadEnabled(), [ext.id]: next};
                saveEnabled(map);
                setEnabled(map);
            } catch {
                // startExtension logs its own failure; the card state shows the rest.
            } finally {
                setBusyId((current) => (current === ext.id ? null : current));
            }
        })();
    };

    const runningIds = React.useMemo(
        () => new Set(state.running.map((entry) => entry.id)),
        [state.running]
    );

    // Declared commands (always visible — buttons disabled while the
    // extension is stopped) merged with live registrations (their
    // titles win once the worker registers them).
    const commandsByExt = React.useMemo(() => {
        const map = new Map<string, Array<{ commandId: string; title: string }>>();
        for (const ext of builtins) {
            const merged = new Map<string, string>();
            for (const declared of ext.contributions.commands ?? []) {
                merged.set(declared.id, declared.title);
            }
            for (const live of state.commands) {
                if (live.extId === ext.id) merged.set(live.commandId, live.title);
            }
            const list = Array.from(merged, ([commandId, title]) => ({commandId, title}));
            if (list.length > 0) map.set(ext.id, list);
        }
        return map;
    }, [builtins, state.commands]);

    const statusBarByExt = React.useMemo(() => {
        const map = new Map<string, Array<{ id: string; text: string; tooltip?: string }>>();
        for (const item of state.statusBar) {
            const list = map.get(item.extId) ?? [];
            list.push({id: item.id, text: item.text, tooltip: item.tooltip});
            map.set(item.extId, list);
        }
        return map;
    }, [state.statusBar]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-2xl w-[calc(100vw-2rem)] max-h-[75vh] flex flex-col overflow-hidden gap-0 p-0">
                {/* ── FIXED TOP — title + description (settings-dialog layout:
        header strip → scrollable body → pinned footer). */}
                <div className="shrink-0 px-6 pt-5 pb-3">
                    <DialogHeader className="gap-1.5">
                        <DialogTitle className="flex items-center gap-2">
                            <Puzzle className="size-4 text-emerald-500" aria-hidden="true"/>
                            Extensions
                        </DialogTitle>
                        <DialogDescription>
                            Manifest-declared mini-plugins, sandboxed in Web Workers. The enabled state is
                            stored in your browser&apos;s localStorage.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {/* ── SCROLLABLE BODY — extension cards + notifications. */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-3">
                    {booting ? (
                        /* Skeleton cards while the workers boot — same metrics as
                        the real cards so the layout never jumps. */
                        <div className="space-y-3" aria-busy="true" aria-label="Starting extension workers">
                            {builtins.map((ext) => (
                                <div key={ext.id} className="space-y-3 rounded-lg border p-4">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="size-9 rounded-md"/>
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-3.5 w-32"/>
                                            <Skeleton className="h-3 w-3/4"/>
                                        </div>
                                        <Skeleton className="h-5 w-9 rounded-full"/>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <Skeleton className="h-4 w-20 rounded-full"/>
                                        <Skeleton className="h-4 w-24 rounded-full"/>
                                    </div>
                                </div>
                            ))}
                            <p className="py-1 text-center text-xs text-muted-foreground">
                                Starting extension workers…
                            </p>
                        </div>
                    ) : (
                        <>
                            {builtins.map((ext) => (
                                <ExtensionCard
                                    key={ext.id}
                                    ext={ext}
                                    enabled={enabled[ext.id] !== false}
                                    busy={busyId === ext.id}
                                    running={runningIds.has(ext.id)}
                                    commands={commandsByExt.get(ext.id) ?? []}
                                    statusBarItems={statusBarByExt.get(ext.id) ?? []}
                                    onToggle={handleToggle}
                                    onRun={runCommand}
                                />
                            ))}

                            <Separator/>

                            {/* Notifications — the registry store's shared queue. */}
                            <section
                                aria-label="Extension notifications"
                                className="space-y-2 rounded-lg border bg-muted/30 p-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 text-xs font-medium">
                                        <Bell className="size-3.5 text-muted-foreground" aria-hidden="true"/>
                                        Notifications
                                        <span className="text-[10px] text-muted-foreground">
                      ({state.notifications.length})
                    </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1.5 text-xs"
                                        disabled={state.notifications.length === 0}
                                        onClick={clearExtensionNotifications}
                                        aria-label="Clear extension notifications"
                                    >
                                        <Trash2 className="size-3" aria-hidden="true"/>
                                        Clear
                                    </Button>
                                </div>
                                {state.notifications.length === 0 ? (
                                    <p className="py-1 text-xs text-muted-foreground">
                                        No notifications yet — run a command to see extension messages here.
                                    </p>
                                ) : (
                                    <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
                                        {state.notifications.map((note) => (
                                            <li key={note.seq} className="rounded border bg-background px-2.5 py-1.5">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {note.extName}
                          </span>
                                                    <span className="text-[10px] text-muted-foreground">
                            {new Date(note.at).toLocaleTimeString()}
                          </span>
                                                </div>
                                                {note.title ? (
                                                    <div className="text-xs font-medium">{note.title}</div>
                                                ) : null}
                                                <p className="text-xs">{note.text}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </>
                    )}
                </div>

                {/* ── PINNED FOOTER — the sandbox note. */}
                <div className="shrink-0 border-t bg-muted/30 px-6 py-3">
                    <div className="flex items-start gap-2">
                        <ShieldCheck
                            className="mt-px size-3.5 shrink-0 text-emerald-500"
                            aria-hidden="true"
                        />
                        <p className="text-xs text-muted-foreground">
                            Extensions run in a Web Worker with a permission-scoped RPC bridge — no DOM, no
                            direct file access.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  One extension card                                                 */

/* ------------------------------------------------------------------ */

interface ExtensionCardProps {
    ext: ExtensionManifest;
    enabled: boolean;
    /** Start/stop in flight for this extension (switch disabled). */
    busy: boolean;
    running: boolean;
    commands: Array<{ commandId: string; title: string }>;
    statusBarItems: Array<{ id: string; text: string; tooltip?: string }>;
    onToggle: (ext: ExtensionManifest, next: boolean) => void;
    onRun: (extId: string, commandId: string) => void;
};

function ExtensionCard({
                           ext,
                           enabled,
                           busy,
                           running,
                           commands,
                           statusBarItems,
                           onToggle,
                           onRun,
                       }: ExtensionCardProps) {
    return (
        <section
            aria-label={`${ext.name} extension`}
            className="space-y-3 rounded-lg border bg-card p-4"
        >
            {/* Header: icon tile + identity + the enable switch. */}
            <div className="flex items-start gap-3">
                <div
                    aria-hidden="true"
                    className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-md text-xs font-semibold tracking-wide",
                        running ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                >
                    {initials(ext.name)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{ext.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{ext.id}</span>
                        {ext.author ? (
                            <span className="text-[10px] text-muted-foreground">by {ext.author}</span>
                        ) : null}
                        {running ? (
                            <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                                running
                            </Badge>
                        ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ext.description}</p>
                </div>
                <Switch
                    checked={enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => onToggle(ext, checked)}
                    aria-label={`Enable ${ext.name} extension`}
                />
            </div>

            {/* Permission chips — scoped capabilities carry a lock. */}
            <div className="flex flex-wrap items-center gap-1.5" aria-label={`${ext.name} permissions`}>
                {ext.permissions.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">No permissions required</span>
                ) : (
                    ext.permissions.map((permission) => {
                        const scoped = SCOPED_PERMISSIONS.has(permission);
                        return (
                            <Badge
                                key={permission}
                                variant="outline"
                                className="gap-1 font-mono text-[10px]"
                                title={
                                    scoped
                                        ? "Scoped permission — grants access to host capabilities"
                                        : "UI-only contribution permission"
                                }
                            >
                                {scoped ? <Lock className="size-2.5" aria-hidden="true"/> : null}
                                {permission}
                            </Badge>
                        );
                    })
                )}
            </div>

            {/* Contributed commands — runnable while the extension runs. */}
            {commands.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className={rowLabelClass()}>Commands</span>
                    {commands.map((command) => (
                        <Button
                            key={command.commandId}
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            disabled={!running || busy}
                            onClick={() => onRun(ext.id, command.commandId)}
                            aria-label={`Run command: ${command.title}`}
                        >
                            <Play className="size-3" aria-hidden="true"/>
                            {command.title}
                        </Button>
                    ))}
                </div>
            ) : null}

            {/* Live status-bar registrations as preview chips. */}
            {statusBarItems.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={rowLabelClass()}>Status bar</span>
                    {statusBarItems.map((item) => (
                        <span
                            key={item.id}
                            title={item.tooltip}
                            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
              <Activity className="size-2.5 shrink-0" aria-hidden="true"/>
              <span className="max-w-[200px] truncate">{item.text}</span>
            </span>
                    ))}
                </div>
            ) : null}

            {/* Declared snippets (the snippet pack contributes no commands). */}
            {(ext.contributions.snippets?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={rowLabelClass()}>Snippets</span>
                    {(ext.contributions.snippets ?? []).map((snippet) => (
                        <span
                            key={snippet.label}
                            title={snippet.body}
                            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
              <span className="font-mono">{snippet.label}</span>
                            {snippet.language ? (
                                <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                                    {snippet.language}
                                </Badge>
                            ) : null}
            </span>
                    ))}
                </div>
            ) : null}

            {/* Declared themes — declare-only today; the chips hint at the
      future presets. None of the builtins ship any yet. */}
            {(ext.contributions.themes?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={rowLabelClass()}>Themes</span>
                    {(ext.contributions.themes ?? []).map((theme) => (
                        <Badge key={theme.id} variant="outline" className="text-[10px]">
                            {theme.label}
                        </Badge>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
