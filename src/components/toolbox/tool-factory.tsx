"use client";

/**
 * tool-factory.tsx — the shared scaffolding for the six new
 * Developer-Toolbox categories (Data & Tables / Math & Calc /
 * Formatters / Security / Validators / Text Analysis).
 *
 * Every tool is a pure (or async WebCrypto) text transform declared as
 * DATA — the factory renders the same three-pane layout the original
 * toolbox uses: input textarea, an options strip (native selects /
 * toggles declared per tool), and an output pane with Copy / Download.
 * Async transforms (WebCrypto digests, AES) resolve with a spinner.
 *
 * Offline: no fetches, no new dependencies.
 */

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {Download} from "lucide-react";

export interface ToolOption {
    key: string;
    label: string;
    kind: "select" | "toggle";
    /** kind=select: [value, label] pairs. */
    choices?: ReadonlyArray<readonly [string, string]>;
    default?: string | boolean;
}

export interface TextToolSpec {
    id: string;
    label: string;
    description: string;
    placeholder?: string;
    sample?: string;
    options?: readonly ToolOption[];
    /** Sync or async transform; opts carries the option values. */
    transform: (input: string, opts: Record<string, string | boolean>) => string | Promise<string>;
    note?: string;
    /** Extra guidance shown when the input is empty. */
    emptyHint?: string;
}

export function makeTextTool(spec: TextToolSpec): React.ComponentType {
    function Tool() {
        const {toast} = useToast();
        const [input, setInput] = React.useState(spec.sample ?? "");
        const [opts, setOpts] = React.useState<Record<string, string | boolean>>(() => {
            const init: Record<string, string | boolean> = {};
            for (const o of spec.options ?? []) init[o.key] = o.default ?? (o.kind === "toggle" ? false : "");
            return init;
        });
        const [out, setOut] = React.useState("");
        const [busy, setBusy] = React.useState(false);

        React.useEffect(() => {
            let alive = true;
            if (!input.trim()) {
                setOut("");
                return;
            }
            try {
                const result = spec.transform(input, opts);
                if (typeof result === "string") {
                    if (alive) setOut(result);
                } else {
                    setBusy(true);
                    result
                        .then((r) => alive && setOut(r))
                        .catch((e) => alive && setOut(`Error: ${e instanceof Error ? e.message : String(e)}`))
                        .finally(() => alive && setBusy(false));
                }
            } catch (err) {
                setOut(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
            return () => {
                alive = false;
            };
        }, [input, opts]);

        const download = () => {
            if (!out) return;
            // File name + MIME follow the OUTPUT shape (a JSON tool downloads
            // .json, a CSV tool .csv) instead of always praxis-tool-output.txt;
            // the blob URL is released deferred so Firefox/Safari finish the
            // download before the revocation lands.
            const looks = out.trimStart()[0];
            const kind =
                looks === "{" || looks === "[" ? "json"
                    : looks === "<" ? "html"
                        : "txt";
            const blob = new Blob([out], {type: kind === "json" ? "application/json" : kind === "html" ? "text/html" : "text/plain;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${spec.id}.${kind}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        };

        return (
            <div className="space-y-3 py-1">
                <p className="text-[11px] leading-relaxed text-muted-foreground">{spec.description}</p>
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    wrap="off"
                    placeholder={spec.placeholder ?? "Paste or type the input…"}
                    className="font-mono text-xs min-h-[110px] w-full rounded-md border bg-muted/30 p-2 focus-visible:ring-1"
                    aria-label={`${spec.label} input`}
                />
                {(spec.options ?? []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {(spec.options ?? []).map((o) =>
                            o.kind === "toggle" ? (
                                <label key={o.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="size-3"
                                        checked={opts[o.key] === true}
                                        onChange={(e) => setOpts((prev) => ({...prev, [o.key]: e.target.checked}))}
                                    />
                                    {o.label}
                                </label>
                            ) : (
                                <label key={o.key} className="flex items-center gap-1.5 text-xs">
                                    <span className="text-muted-foreground">{o.label}</span>
                                    <select
                                        className="h-7 rounded-md border bg-background px-1.5 text-xs"
                                        aria-label={o.label}
                                        value={String(opts[o.key] ?? "")}
                                        onChange={(e) => setOpts((prev) => ({...prev, [o.key]: e.target.value}))}
                                    >
                                        {(o.choices ?? []).map(([v, l]) => (
                                            <option key={v} value={v}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )
                        )}
                    </div>
                )}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {busy ? "Working…" : "Output"}
            </span>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                disabled={!out}
                                onClick={() => {
                                    void navigator.clipboard
                                        .writeText(out)
                                        .then(() => toast({title: "Copied to clipboard", variant: "success"}));
                                }}
                            >
                                Copy
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                disabled={!out}
                                onClick={download}
                                title="Download the output as a file"
                            >
                                <Download className="size-3"/>
                                Download
                            </Button>
                        </div>
                    </div>
                    <pre
                        className={cn(
                            "font-mono text-xs min-h-[60px] w-full rounded-md border bg-muted/30 p-2 whitespace-pre-wrap break-all",
                            busy && "animate-pulse"
                        )}
                    >
            {out || (input.trim() ? "" : spec.emptyHint ?? "—")}
          </pre>
                </div>
                {spec.note && <p className="text-[10px] leading-relaxed text-muted-foreground">{spec.note}</p>}
            </div>
        );
    }

    /* Stamp the spec's id + label onto the component itself so registries
     * can list them without keeping a second array (dev-toolbox.tsx reads
     * them for its category → tool dropdowns). */
    const typed = Tool as React.ComponentType & { toolId?: string; toolLabel?: string };
    typed.toolId = spec.id;
    typed.toolLabel = spec.label;
    return Tool;
}

/* ─── shared pure helpers for the tool files ───────────────────── */

/** Parse "a=1;b=2" / "a: 1" / line-per-"key=value" option strings. */
export function parsePairs(text: string): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const raw of text.split(/[\n;]/)) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^([^=:]+)[=:](.*)$/);
        if (m) out.push([m[1].trim(), m[2].trim()]);
    }
    return out;
}

export function clampNum(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function roundTo(n: number, digits: number): string {
    if (!Number.isFinite(n)) return String(n);
    return n.toFixed(Math.max(0, Math.min(12, digits)));
}
