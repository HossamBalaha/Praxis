"use client";

import * as React from "react";
import {Eye, EyeOff, Plus, Save, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";

/**
 * The .env form editor — a two-column KEY / VALUE table
 * with a show/hide masked-secrets toggle (values that look like
 * tokens/keys render as dots until revealed), add/remove pairs, and
 * comments/blank lines preserved on save. Editing any other text file
 * keeps the classic textarea.
 */

interface EnvPair {
    key: string;
    value: string;
    comment?: string;
    disabled?: boolean;
}

interface EnvEditorProps {
    content: string;
    onSave: (next: string) => void;
    /** Reports the unsaved-pairs state upward (the page's dirty-tab /
     * tree-switch guard asks Save / Discard instead of silently
     * dropping the edits "editing.env and going to
     * another place, it does not prevent me and ignores the edits"). */
    onDirtyChange?: (dirty: boolean) => void;
}

function parseEnv(text: string): EnvPair[] {
    const out: EnvPair[] = [];
    for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
        if (!line.trim() || line.trim().startsWith("#")) {
            out.push({key: "", value: "", comment: line});
            continue;
        }
        const disabled = line.trim().startsWith("# ");
        const body = disabled ? line.trim().slice(2) : line;
        const eq = body.indexOf("=");
        if (eq < 0) {
            out.push({key: "", value: "", comment: line});
            continue;
        }
        out.push({
            key: body.slice(0, eq).trim(),
            value: body.slice(eq + 1).trim().replace(/^["']|["']$/g, ""),
            disabled,
        });
    }
    return out;
}

function stringifyEnv(pairs: EnvPair[]): string {
    return (
        pairs
            .map((p) => {
                if (!p.key) return p.comment ?? "";
                const line = `${p.key}=${p.value.includes(" ") ? `"${p.value}"` : p.value}`;
                return p.disabled ? `# ${line}` : line;
            })
            .join("\n") + "\n"
    );
}

function looksSecret(key: string): boolean {
    return /pass|secret|token|key|credential|api|auth|salt|seed/i.test(key);
}

export function EnvEditor({content, onSave, onDirtyChange}: EnvEditorProps) {
    const {toast} = useToast();
    const [pairs, setPairs] = React.useState<EnvPair[]>(() => parseEnv(content));
    const [masked, setMasked] = React.useState(true);
    const [dirty, setDirty] = React.useState(false);

    React.useEffect(() => {
        setPairs(parseEnv(content));
        setDirty(false);
    }, [content]);

    // Mirror the dirty flag upward whenever it flips (and on mount) so
    // the page-level guard sees .env edits exactly like textarea edits.
    React.useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const update = (index: number, patch: Partial<EnvPair>) => {
        setPairs((prev) => prev.map((p, i) => (i === index ? {...p, ...patch} : p)));
        setDirty(true);
    };

    const addPair = () => {
        setPairs((prev) => [...prev, {key: "NEW_KEY", value: ""}]);
        setDirty(true);
    };

    const removePair = (index: number) => {
        setPairs((prev) => prev.filter((_, i) => i !== index));
        setDirty(true);
    };

    const save = async () => {
        await onSave(stringifyEnv(pairs));
        setDirty(false);
        toast({title: ".env saved", variant: "success"});
    };

    // EXTERNAL FLUSH (the dirty-guard round-trip): the page's
    // "Save & switch" flow dispatches praxis:file-viewer-save → the
    // FileViewer asks THIS editor to flush via praxis:env-save and waits
    // for praxis:env-saved (2.5 s belt-and-braces on the listener side).
    // Without it the guard's Save wrote the stale textarea buffer (or
    // nothing) and the .env edits were lost anyway.
    React.useEffect(() => {
        const onFlush = () => {
            void (async () => {
                try {
                    if (dirty) await save();
                } finally {
                    window.dispatchEvent(new Event("praxis:env-saved"));
                }
            })();
        };
        window.addEventListener("praxis:env-save", onFlush);
        return () => window.removeEventListener("praxis:env-save", onFlush);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty, pairs]);


    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setMasked((m) => !m)}
                    title={masked ? "Reveal secret-looking values" : "Mask secret-looking values"}
                >
                    {masked ? <Eye className="size-3.5"/> : <EyeOff className="size-3.5"/>}
                    {masked ? "Reveal secrets" : "Mask secrets"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={addPair}>
                    <Plus className="size-3.5"/> Add pair
                </Button>
                <div className="flex-1"/>
                <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={!dirty} onClick={() => void save()}>
                    <Save className="size-3.5"/> Save .env
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                    <tr>
                        <th className="text-left font-medium px-3 py-1.5 border-b w-[38%]">Key</th>
                        <th className="text-left font-medium px-3 py-1.5 border-b">Value</th>
                        <th className="w-16 border-b" aria-label="Row actions"/>
                    </tr>
                    </thead>
                    <tbody>
                    {pairs.map((p, i) =>
                        p.key === "" ? (
                            <tr key={i}>
                                <td colSpan={3}
                                    className="px-3 py-1 text-muted-foreground font-mono text-[10px] select-none">
                                    {p.comment || "\u00a0"}
                                </td>
                            </tr>
                        ) : (
                            <tr key={i} className={p.disabled ? "opacity-50" : undefined}>
                                <td className="px-2 py-1 align-middle">
                                    <Input
                                        value={p.key}
                                        onChange={(e) => update(i, {key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")})}
                                        className="h-7 font-mono text-[11px]"
                                        aria-label={`Key of row ${i + 1}`}
                                    />
                                </td>
                                <td className="px-2 py-1 align-middle">
                                    <Input
                                        type={masked && looksSecret(p.key) ? "password" : "text"}
                                        value={p.value}
                                        onChange={(e) => update(i, {value: e.target.value})}
                                        className="h-7 font-mono text-[11px]"
                                        aria-label={`Value of ${p.key}`}
                                    />
                                </td>
                                <td className="text-center">
                                    <Button variant="ghost" size="sm" className="h-7 px-1.5"
                                            onClick={() => removePair(i)} title="Remove this pair">
                                        <Trash2 className="size-3.5 text-red-500/70"/>
                                    </Button>
                                </td>
                            </tr>
                        )
                    )}
                    </tbody>
                </table>
                <p className="px-3 py-2 text-[10px] text-muted-foreground">
                    Comments and blank lines are preserved on save · keys are upper-snake-case · values with
                    spaces are quoted.
                </p>
            </div>
        </div>
    );
}
