"use client";

/**
 * — the Run Configurations popover.
 *
 * Sits in the Run toolbar next to the args/env fields. Lists the saved
 * configs for the CURRENT script, lets the user save the current
 * args/env/stdin state under a name, apply/delete configs, and pick a
 * default that auto-fills the toolbar when the script is selected.
 */
import * as React from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {loadRunConfigs, newRunConfigId, type RunConfig, runConfigSummary, saveRunConfigs,} from "@/lib/run-configs";
import {Check, ChevronDown, Save, Star, Trash2, Zap} from "lucide-react";

export function RunConfigPopover({
                                     folderSlug,
                                     fileSlug,
                                     args,
                                     env,
                                     stdin,
                                     onApply,
                                 }: {
    folderSlug: string;
    fileSlug: string;
    /** Current toolbar state — saved verbatim into a new config. */
    args: string;
    env: string;
    stdin: string;
    /** Apply a config: parent copies fields into the toolbar state. */
    onApply: (c: RunConfig) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [data, setData] = React.useState({configs: [] as RunConfig[], defaultId: null as string | null});
    const [name, setName] = React.useState("");
    const nameRef = React.useRef<HTMLInputElement>(null);

    const refresh = React.useCallback(() => {
        if (folderSlug && fileSlug) {
            setData(loadRunConfigs(folderSlug, fileSlug));
        } else {
            setData({configs: [], defaultId: null});
        }
    }, [folderSlug, fileSlug]);

    React.useEffect(() => {
        if (open) refresh();
    }, [open, refresh]);

    React.useEffect(() => {
        if (open) requestAnimationFrame(() => nameRef.current?.focus());
    }, [open]);

    const persist = (next: typeof data) => {
        setData(next);
        if (folderSlug && fileSlug) saveRunConfigs(folderSlug, fileSlug, next);
    };

    const saveCurrent = () => {
        const trimmed = name.trim() || `Config ${data.configs.length + 1}`;
        const config: RunConfig = {
            id: newRunConfigId(),
            name: trimmed,
            args,
            env,
            stdin,
            createdAt: Date.now(),
        };
        persist({configs: [...data.configs, config], defaultId: data.defaultId});
        setName("");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs px-2"
                    title="Run configurations — save the current args/env/stdin under a name, or apply a saved set"
                    disabled={!folderSlug || !fileSlug}
                >
                    <Zap className="size-3.5"/>
                    <span className="hidden sm:inline">Configs</span>
                    <ChevronDown className="size-3"/>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
                <p className="text-xs font-semibold mb-2">Run configurations</p>

                {/* Save current */}
                <div className="flex items-center gap-1.5 mb-3">
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (name.trim() || data.configs.length >= 0)) {
                                e.preventDefault();
                                saveCurrent();
                            }
                        }}
                        placeholder="Name for the current args/env…"
                        className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs shrink-0"
                        onClick={saveCurrent}
                        title="Save the current Run toolbar state under this name"
                    >
                        <Save className="size-3"/>
                        Save
                    </Button>
                </div>

                {/* List */}
                {data.configs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground py-3 text-center">
                        No saved configs for this script yet. Set args / env above,
                        type a name, and press Save.
                    </p>
                ) : (
                    <ul className="space-y-1 max-h-64 overflow-auto">
                        {data.configs.map((c) => (
                            <li
                                key={c.id}
                                className="group rounded-md border border-border px-2 py-1.5 hover:bg-accent/50"
                            >
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => {
                                            onApply(c);
                                            setOpen(false);
                                        }}
                                        className="flex-1 min-w-0 text-left"
                                        title={`Apply — ${runConfigSummary(c)}`}
                                    >
                                        <span className="block text-xs font-medium truncate">{c.name}</span>
                                        <span className="block text-[10px] text-muted-foreground truncate">
                      {runConfigSummary(c)}
                    </span>
                                    </button>
                                    <button
                                        onClick={() =>
                                            persist({
                                                configs: data.configs,
                                                defaultId: data.defaultId === c.id ? null : c.id,
                                            })
                                        }
                                        className={`shrink-0 rounded p-1 hover:bg-accent ${
                                            data.defaultId === c.id ? "text-amber-400" : "text-muted-foreground/50"
                                        }`}
                                        title={
                                            data.defaultId === c.id
                                                ? "Default config — click to unset"
                                                : "Make default (auto-applied when this script is selected)"
                                        }
                                    >
                                        {data.defaultId === c.id ? (
                                            <Star className="size-3.5 fill-current"/>
                                        ) : (
                                            <Star className="size-3.5"/>
                                        )}
                                    </button>
                                    <button
                                        onClick={() =>
                                            persist({
                                                configs: data.configs.filter((x) => x.id !== c.id),
                                                defaultId: data.defaultId === c.id ? null : data.defaultId,
                                            })
                                        }
                                        className="shrink-0 rounded p-1 text-muted-foreground/50 hover:text-red-400 hover:bg-accent"
                                        title="Delete this config"
                                    >
                                        <Trash2 className="size-3.5"/>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {data.configs.length > 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                        <Check className="size-3"/>
                        Click a config to apply it to the Run toolbar.{" "}
                        <Star className="size-3 text-amber-400"/> = default.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
