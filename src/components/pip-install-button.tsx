"use client";

import * as React from "react";
import {CircleCheck, Loader2, PackagePlus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import {configuredInterpreter} from "@/lib/settings";

/**
 * PipInstallButton — the automatic "install the missing module" action.
 *
 * Whenever the app surfaces a Python error of the shape
 * `ModuleNotFoundError: No module named 'xyz'`, this button renders
 * NEXT TO the error text and installs the module with one click via
 * POST /api/pip-install (`<interpreter> -m pip install xyz`). Used by
 * the config-validation banner and the Output panel's traceback
 * footer, so the fix is offered exactly where the error appears.
 */

/** Extract the missing module name from an error message.
 * Returns null when the text is not a ModuleNotFoundError. Handles
 * single/double quotes and dotted submodules (`a.b` → installs `a`). */
export function missingModuleFrom(text: string): string | null {
    const m = /No module named\s+['"]([A-Za-z0-9_.-]+)['"]/.exec(text);
    if (!m) return null;
    // A dotted import (`import a.b`) fails on the PACKAGE `a` — pip
    // installs the first segment.
    return m[1].split(".")[0] || null;
}

interface PipInstallButtonProps extends Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> {
    /** The module to install (pip package name). */
    module: string;
    /** Runs after a SUCCESSFUL install (e.g. re-validate / re-run). */
    onInstalled?: () => void;
    /** Compact label (default "pip install <module>"). */
    label?: string;
}

export function PipInstallButton({
                                     module,
                                     onInstalled,
                                     label,
                                     ...rest
                                 }: PipInstallButtonProps) {
    const {toast} = useToast();
    const [state, setState] = React.useState<"idle" | "installing" | "done" | "failed">("idle");

    const install = React.useCallback(async () => {
        if (state === "installing") return;
        setState("installing");
        try {
            const res = await fetch("/api/pip-install", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                // ENV CONSISTENCY
                // installed!!!" but the preview claimed it was missing): the
                // install must target the SAME environment the preview reader
                // and the runs use — the one selected in Settings ▸ Python
                // runtime. Without the explicit `interpreter`, the server
                // fell back to its auto-detected default, which can be a
                // DIFFERENT env than the one the user loaded.
                body: JSON.stringify({package: module, interpreter: configuredInterpreter()}),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setState("failed");
                toast({
                    title: `pip install ${module} failed`,
                    description: json?.error ?? json?.output ?? `HTTP ${res.status}`,
                    variant: "destructive",
                });
                return;
            }
            setState("done");
            toast({
                title: `${module} installed`,
                description: `pip finished in ${((json.durationMs ?? 0) / 1000).toFixed(1)}s into the selected environment.`,
            });
            onInstalled?.();
        } catch (err) {
            setState("failed");
            toast({
                title: `pip install ${module} failed`,
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    }, [module, onInstalled, state, toast]);

    return (
        <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void install()}
            disabled={state === "installing"}
            title={`Install ${module} into the selected Python environment (pip install ${module})`}
            {...rest}
        >
            {state === "installing" ? (
                <Loader2 className="size-3.5 animate-spin"/>
            ) : state === "done" ? (
                <CircleCheck className="size-3.5 text-emerald-500"/>
            ) : (
                <PackagePlus className="size-3.5 text-emerald-500"/>
            )}
            {state === "done" ? `Installed ${module}` : state === "installing" ? `Installing ${module}…` : label ?? `pip install ${module}`}
        </Button>
    );
}
