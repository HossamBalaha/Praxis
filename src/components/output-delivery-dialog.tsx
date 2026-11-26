"use client";

import * as React from "react";
import {Check, ClipboardCopy, Download, FileText, HardDriveDownload, ImageIcon, Loader2,} from "lucide-react";
import {Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";

/**
 * the shared "what should happen with this output?" dialog.
 *
 * Actions that PRODUCE a file (image crop → PNG, video grab-frame,
 * PDF text extraction, …) used to silently download to the Downloads
 * folder. This dialog gives the user the three choices they asked
 * for, with a preview and an editable filename:
 *
 * ① Copy to clipboard — PNG goes to the system clipboard as an
 * image (where supported); text as text.
 * ② Save as… (download) — the browser's save dialog / Downloads.
 * ③ Save into project — written next to the source file in the
 * workspace (binary via base64), with an
 * overwrite confirmation when it exists.
 */

interface OutputDeliveryDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** e.g. "Crop ready" */
    title: string;
    description?: string;
    /** Binary payload (image PNG…) — takes precedence over `text`. */
    blob?: Blob | null;
    /** Text payload (extracted text…). */
    text?: string | null;
    /** Pre-filled filename (with extension). */
    defaultName: string;
    /** Folder slug for "Save into project". */
    folderSlug: string;
    /** Sub-path inside the folder (optional). */
    subPath?: string;
}

/** ArrayBuffer → base64, chunked (btoa throws on >~30k chars). */
function bufToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let out = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(out);
}

export function OutputDeliveryDialog({
                                         open,
                                         onOpenChange,
                                         title,
                                         description,
                                         blob,
                                         text,
                                         defaultName,
                                         folderSlug,
                                         subPath,
                                     }: OutputDeliveryDialogProps) {
    const {toast} = useToast();
    const [name, setName] = React.useState(defaultName);
    const [busy, setBusy] = React.useState<null | "copy" | "save">(null);
    const [done, setDone] = React.useState<null | "copy" | "download" | "save">(null);
    //
    // overwriting files") — the raw window.confirm is gone; a themed
    // AlertDialog in the same style as the explorer's overwrite prompts,
    // with Overwrite / Keep both (auto-numbered copy) / Cancel.
    const [overwriteAsk, setOverwriteAsk] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) {
            setName(defaultName);
            setDone(null);
            setBusy(null);
        }
    }, [open, defaultName]);

    const isImage = !!blob;
    const objectUrl = React.useMemo(
        () => (blob ? URL.createObjectURL(blob) : null),
        [blob]
    );
    React.useEffect(() => {
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [objectUrl]);

    const sanitized = name.trim() || defaultName;

    const copyToClipboard = async () => {
        if (busy) return;
        setBusy("copy");
        try {
            if (blob) {
                const ClipboardItemCtor =
                    (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
                if (!navigator.clipboard || !("write" in navigator.clipboard) || !ClipboardItemCtor) {
                    throw new Error("This browser cannot copy images to the clipboard.");
                }
                await navigator.clipboard.write([new ClipboardItemCtor({[blob.type || "image/png"]: blob})]);
            } else if (text != null) {
                await navigator.clipboard.writeText(text);
            } else {
                throw new Error("Nothing to copy.");
            }
            setDone("copy");
            toast({
                title: "Copied to clipboard",
                description: isImage ? "Paste it into any image editor." : `${text?.length.toLocaleString()} characters copied.`,
                variant: "success"
            });
            setTimeout(() => onOpenChange(false), 900);
        } catch (err) {
            toast({title: "Copy failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusy(null);
        }
    };

    const download = () => {
        const url = objectUrl ?? (text != null ? URL.createObjectURL(new Blob([text], {type: "text/plain;charset=utf-8"})) : null);
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.download = sanitized;
        a.click();
        if (!objectUrl) URL.revokeObjectURL(url);
        setDone("download");
        toast({
            title: `Downloading ${sanitized}`,
            description: "The browser's save dialog (or Downloads folder) has it.",
            variant: "success"
        });
    };

    const saveToProject = async (overwrite = false) => {
        if (busy) return;
        setBusy("save");
        try {
            const payload: {
                folder: string;
                sub?: string;
                files: Array<{ name: string; content: string; encoding?: "utf-8" | "base64" }>;
                overwrite?: boolean;
            } = {folder: folderSlug, files: [], overwrite};
            if (subPath) payload.sub = subPath;
            if (blob) {
                const b64 = bufToBase64(await blob.arrayBuffer());
                payload.files = [{name: sanitized, content: b64, encoding: "base64"}];
            } else if (text != null) {
                payload.files = [{name: sanitized, content: text, encoding: "utf-8"}];
            } else {
                throw new Error("Nothing to save.");
            }
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            if (Array.isArray(json.skipped) && json.skipped.length > 0) {
                // ask through the themed dialog instead of the old
                // window.confirm — same Praxis design as every other overwrite
                // prompt (Overwrite / Keep both / Cancel).
                setBusy(null);
                setOverwriteAsk(sanitized);
                return;
            }
            setDone("save");
            toast({
                title: `Saved ${sanitized}`,
                description: "Written into the project folder — find it in the explorer.",
                variant: "success",
            });
            // Let the explorer know to refresh.
            window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
            setTimeout(() => onOpenChange(false), 900);
        } catch (err) {
            toast({title: "Save into project failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusy(null);
        }
    };

    /** "Keep both" — save a NUMBERED copy (name-1.ext …
     * name-9.ext) instead of clobbering the existing file. Probes the
     * first free suffix with up to five quick attempts. */
    const saveNumberedCopy = async () => {
        const dot = sanitized.lastIndexOf(".");
        const stem = dot > 0 ? sanitized.slice(0, dot) : sanitized;
        const ext = dot > 0 ? sanitized.slice(dot) : "";
        for (let n = 1; n <= 9; n++) {
            const candidate = `${stem}-${n}${ext}`;
            const payload = {
                folder: folderSlug,
                ...(subPath ? {sub: subPath} : {}),
                files: blob
                    ? [{name: candidate, content: bufToBase64(await blob.arrayBuffer()), encoding: "base64" as const}]
                    : [{name: candidate, content: text ?? "", encoding: "utf-8" as const}],
            };
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.ok && !(Array.isArray(json.skipped) && json.skipped.length > 0)) {
                setOverwriteAsk(null);
                setName(candidate);
                setDone("save");
                toast({
                    title: `Saved ${candidate}`,
                    description: "The existing file was left untouched — the new one carries a numbered suffix.",
                    variant: "success",
                });
                window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
                setTimeout(() => onOpenChange(false), 900);
                return;
            }
        }
        toast({
            title: "Could not find a free name",
            description: "All numbered copies (name-1 … name-9) already exist — pick a different name above.",
            variant: "destructive",
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
                <ResizableDialogContent id="output-delivery" defaultW={600} defaultH={560}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {isImage ? <ImageIcon className="size-4 text-emerald-500"/> :
                                <FileText className="size-4 text-sky-500"/>}
                            {title}
                        </DialogTitle>
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>

                    {/* Preview */}
                    <div className="rounded-md border bg-muted/20 p-3 max-h-56 overflow-auto grid place-items-center">
                        {objectUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={objectUrl} alt="Output preview"
                                 className="max-h-44 max-w-full object-contain rounded"/>
                        ) : text != null ? (
                            <div className="w-full">
                                <p className="text-[11px] text-muted-foreground mb-1.5">
                                    {text.length.toLocaleString()} characters
                                    · {text.split("\n").length.toLocaleString()} lines
                                </p>
                                <pre
                                    className="text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-auto bg-background rounded border p-2">
                {text.slice(0, 1200)}
                                    {text.length > 1200 ? "\n…" : ""}
              </pre>
                            </div>
                        ) : null}
                    </div>

                    {/* Filename */}
                    <label className="block space-y-1">
                        <span className="text-[11px] text-muted-foreground">File Name</span>
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs font-mono"
                               spellCheck={false}/>
                    </label>

                    {/* Actions */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-col gap-0.5 py-1.5"
                            onClick={() => void copyToClipboard()}
                            disabled={busy != null}
                            title="Copy to the system clipboard"
                        >
                            {busy === "copy" ? <Loader2 className="size-4 animate-spin"/> : done === "copy" ?
                                <Check className="size-4 text-emerald-500"/> : <ClipboardCopy className="size-4"/>}
                            <span className="text-[10px]">Copy</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-col gap-0.5 py-1.5"
                            onClick={download}
                            disabled={busy != null}
                            title="Download it to your Downloads folder (the browser may ask where)"
                        >
                            {done === "download" ? <Check className="size-4 text-emerald-500"/> :
                                <Download className="size-4"/>}
                            <span className="text-[10px]">Download</span>
                        </Button>
                        <Button
                            size="sm"
                            className="h-9 flex-col gap-0.5 py-1.5"
                            onClick={() => void saveToProject(false)}
                            disabled={busy != null}
                            title="Write the file into this project folder"
                        >
                            {busy === "save" ? <Loader2 className="size-4 animate-spin"/> : done === "save" ?
                                <Check className="size-4 text-emerald-500"/> : <HardDriveDownload className="size-4"/>}
                            <span className="text-[10px]">Save into project</span>
                        </Button>
                    </div>

                    <DialogFooter className="text-[10px] text-muted-foreground sm:justify-start">
                        Copy puts it on the clipboard · Download saves it to your device · Save into project writes it
                        next to the source.
                    </DialogFooter>
                </ResizableDialogContent>
            </Dialog>

            {/* — the themed overwrite prompt (same Praxis design as
        the explorer's): replaces the raw window.confirm that asked
        "OK = overwrite it, Cancel = keep both". */}
            <AlertDialog
                open={!!overwriteAsk}
                onOpenChange={(o) => {
                    if (!o) setOverwriteAsk(null);
                }}
            >
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>File already exists</AlertDialogTitle>
                        <AlertDialogDescription>
                            <code className="font-mono text-foreground">{overwriteAsk}</code> already
                            exists in this folder. Overwrite it, or keep both by saving a numbered copy
                            (e.g. <code className="font-mono">-1</code> before the extension)?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setOverwriteAsk(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void saveNumberedCopy()}
                            className="bg-muted text-foreground hover:bg-muted/70 border border-border"
                        >
                            Keep both
                        </AlertDialogAction>
                        <AlertDialogAction
                            onClick={() => {
                                const target = overwriteAsk;
                                setOverwriteAsk(null);
                                if (target) void saveToProject(true);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            Overwrite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
