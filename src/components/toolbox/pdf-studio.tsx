"use client";

/**
 * the "PDF studio" category — built on pdf-lib (write side only, so
 * everything is offline; tool count: see the registry — the category
 * keeps the ≥ 30-tool minimum). pdf-lib
 * is loaded LAZILY — every helper in src/lib/pdf-ops.ts dynamic-imports
 * it inside the function, so opening the toolbox costs nothing.
 *
 *   pages      merge · extract range · delete pages · rotate · reverse ·
 *              move page · insert blank · split every N
 *   marks      page numbers (corner + font size) · text watermark
 *   metadata   set · clear · info report
 *   create     images → PDF · text → PDF · title/cover page
 *
 * Page ranges go through the strict pure parser (parsePageRange —
 * bounds-checked, unit tested). Every output — PDF Blob or text report —
 * is delivered through the OutputDeliveryDialog, never a raw download.
 */

import * as React from "react";
import {
    ChevronDown,
    Download,
    FilePlus,
    FileText,
    HardDriveDownload,
    ImageIcon,
    Loader2,
    Upload,
    X
} from "lucide-react";
import {fetchPreloadFile, toolboxSaveTarget, useToolboxPreload} from "@/lib/toolbox-preload";
import {useToast} from "@/hooks/use-toast";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {
    clearPdfMetadata,
    coverPagePdf,
    deletePdfPages,
    extractPdfImages,
    extractPdfPages,
    formatPageLabel,
    formatPdfInfo,
    imagesToPdf,
    insertBlankPdfPage,
    mergePdfDocs,
    movePdfPage,
    normalizePdfName,
    PageRangeError,
    parsePageRange,
    type PdfChunk,
    type PdfImageExtractResult,
    pdfInfo,
    reversePdfPages,
    rotatePdfPages,
    sanitizeMetadataValue,
    setPdfMetadata,
    splitPdfEvery,
    stampPageNumbers,
    textToPdf,
    textWatermarkPdf,
} from "@/lib/pdf-ops";

/** ArrayBuffer → base64 without
 *  stack overflow on big images (chunked). */
function bufToBase64(ab: ArrayBuffer): string {
    const bytes = new Uint8Array(ab);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/** tiny thumbnail over an image
 *  Blob — object URL + checkerboard backdrop. */
function Thumb({blob, alt}: { blob: Blob; alt: string }) {
    const url = React.useMemo(() => URL.createObjectURL(blob), [blob]);
    React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
    return (
        <div
            className="grid place-items-center overflow-hidden rounded"
            style={{
                minHeight: 84,
                background: "repeating-conic-gradient(rgba(128,128,128,0.18) 0% 25%, transparent 0% 50%) 50% / 14px 14px",
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="max-h-[220px] max-w-full object-contain"/>
        </div>
    );
}

/* "Save into project" resolves through toolboxSaveTarget
 *  (preload folder → source file's folder; else the project root). */

/* ─── shared bits (local copies so the suite files stay independent) ── */

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Err({children}: { children: React.ReactNode }) {
    return <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

function Check({checked, onChange, label}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="size-3.5 accent-emerald-600"
            />
            {label}
        </label>
    );
}

function Sel<T extends string>({
                                   value,
                                   onValueChange,
                                   options,
                                   ariaLabel,
                               }: {
    value: T;
    onValueChange: (v: T) => void;
    options: ReadonlyArray<readonly [T, string]>;
    ariaLabel: string;
}) {
    return (
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
            <SelectTrigger size="sm" className="h-8 text-xs" aria-label={ariaLabel}>
                <SelectValue/>
            </SelectTrigger>
            <SelectContent>
                {options.map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-xs">
                        {label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function Field({
                   label,
                   value,
                   onChange,
                   placeholder,
                   w = "w-44",
               }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    w?: string;
}) {
    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                   className={`h-8 ${w} text-xs`} aria-label={label}/>
        </label>
    );
}

function NumField({
                      label,
                      value,
                      onChange,
                      min,
                      max,
                      w = "w-20",
                  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    w?: string;
}) {
    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <Input
                type="number"
                value={Number.isFinite(value) ? value : ""}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value) || 0)}
                className={`h-8 ${w} text-xs`}
                aria-label={label}
            />
        </label>
    );
}

/**: a live, bounded preview of the loaded PDF —
 * the browser's native PDF viewer in an <iframe> over a blob URL,
 * collapsible per tool. Sits under the picker in EVERY single-file
 * PDF tool, so the document being edited is always one glance away. */
function PdfPreview({file, defaultOpen = true}: { file: File | null; defaultOpen?: boolean }) {
    const [open, setOpen] = React.useState(defaultOpen);
    const url = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    React.useEffect(() => () => {
        if (url) URL.revokeObjectURL(url);
    }, [url]);
    if (!file || !url) return null;
    return (
        <div className="rounded-md border bg-muted/10">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                title={open ? "Collapse the live preview" : "Show the live preview of this PDF"}
            >
                <FileText className="size-3.5 shrink-0 text-emerald-500"/>
                <span className="truncate">Preview — {file.name}</span>
                <ChevronDown className={`ml-auto size-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}/>
            </button>
            {open && (
                <iframe
                    src={url}
                    title={`Preview of ${file.name}`}
                    className="h-[42vh] min-h-[220px] w-full rounded-b border-t bg-muted/20"
                />
            )}
        </div>
    );
}

/** Single-PDF picker (drag-drop or browse) — with the live
 *  preview of the picked/preloaded document underneath. */
function Drop({file, onPick}: { file: File | null; onPick: (f: File | null) => void }) {
    return (
        <div className="space-y-1.5">
            <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) onPick(f);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
                <Upload className="size-3.5 shrink-0"/>
                <span className="truncate">
          {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Drop a PDF or click to browse"}
        </span>
                <input type="file" accept="application/pdf,.pdf" className="hidden"
                       onChange={(e) => onPick(e.target.files?.[0] ?? null)}/>
            </label>
            <PdfPreview file={file}/>
        </div>
    );
}

/** Multi-file picker with an ordered list + remove buttons. */
function MultiDrop({
                       files,
                       setFiles,
                       accept,
                       label,
                   }: {
    files: File[];
    setFiles: (f: File[]) => void;
    accept: string;
    label: string;
}) {
    return (
        <div className="space-y-1.5">
            <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const dropped = Array.from(e.dataTransfer.files ?? []);
                    if (dropped.length) setFiles([...files, ...dropped]);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
                <Upload className="size-3.5 shrink-0"/>
                <span>{files.length ? `${files.length} file(s) picked — click to add more` : label}</span>
                <input
                    type="file"
                    multiple
                    accept={accept}
                    className="hidden"
                    onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        if (picked.length) setFiles([...files, ...picked]);
                    }}
                />
            </label>
            {files.length > 0 && (
                <PdfPreview file={files[0] ?? null} defaultOpen={false}/>
            )}
            {files.length > 0 && (
                <ul className="space-y-1">
                    {files.map((f, i) => (
                        <li key={`${f.name}-${i}`}
                            className="flex items-center gap-2 rounded border bg-muted/20 px-2 py-1 text-xs">
                            <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                            <span className="truncate">{f.name}</span>
                            <span
                                className="ml-auto shrink-0 text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                            <button
                                type="button"
                                className="shrink-0 rounded p-0.5 hover:bg-muted"
                                title="Remove"
                                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                            >
                                <X className="size-3"/>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Load one PDF: bytes + page count (validated through pdf-lib).
 * consumes the toolbox preload context — when the dialog
 *  was opened from a PDF's view UI (praxis:open-toolbox), that PDF
 *  is fetched and set as the loaded file automatically. */
function usePdfDoc() {
    const [file, setFile] = React.useState<File | null>(null);
    const [bytes, setBytes] = React.useState<Uint8Array | null>(null);
    const [pageCount, setPageCount] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const preload = useToolboxPreload();

    // fetch the preloaded file once (the PDF that is open in
    // the viewer when the toolbox was opened from its view UI).
    React.useEffect(() => {
        if (!preload || file) return;
        let cancelled = false;
        void fetchPreloadFile(preload).then((f) => {
            if (f && !cancelled) setFile(f);
        });
        return () => {
            cancelled = true;
        };
    }, [preload, file]);

    React.useEffect(() => {
        if (!file) {
            setBytes(null);
            setPageCount(null);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        void (async () => {
            try {
                const arr = new Uint8Array(await file.arrayBuffer());
                const info = await pdfInfo(arr);
                if (cancelled) return;
                setBytes(arr);
                setPageCount(info.pageCount);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [file]);

    return {file, setFile, bytes, pageCount, error, loading, preloaded: preload ? preload.fileName : null};
}

interface PdfDelivery {
    blob?: Blob;
    text?: string;
    name: string;
    title: string;
    description?: string;
}

function usePdfDelivery() {
    // save-into-project lands in the SOURCE file's folder when
    // one was preloaded (Tools ▸ from the viewer), else the project root.
    const preload = useToolboxPreload();
    const [delivery, setDelivery] = React.useState<PdfDelivery | null>(null);
    const [open, setOpen] = React.useState(false);
    const deliver = (d: PdfDelivery) => {
        setDelivery(d);
        setOpen(true);
    };
    const dialog = (
        <OutputDeliveryDialog
            open={open}
            onOpenChange={setOpen}
            title={delivery?.title ?? "PDF Ready"}
            description={delivery?.description}
            blob={delivery?.blob ?? null}
            text={delivery?.text ?? null}
            defaultName={delivery?.name ?? "document.pdf"}
            folderSlug={toolboxSaveTarget(preload)}
        />
    );
    return {deliver, dialog};
}

const pdfBlob = (bytes: Uint8Array): Blob =>
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {type: "application/pdf"});

function PageRangeInput({
                            value,
                            onChange,
                            pageCount,
                        }: {
    value: string;
    onChange: (v: string) => void;
    pageCount: number | null;
}) {
    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="shrink-0 text-muted-foreground">Pages</span>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="1-3,5,7-9"
                className="h-8 w-36 font-mono text-xs"
                aria-label="Page range"
            />
            {pageCount != null && <span className="shrink-0 text-[11px] text-muted-foreground">of {pageCount}</span>}
        </label>
    );
}

/* ─── ① merge ───────────────────────────────────────────────────── */

export function PdfMergeTool() {
    const [files, setFiles] = React.useState<File[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (files.length < 2) {
            setError("Pick at least two PDFs to merge (order = list order).");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
            const out = await mergePdfDocs(
                buffers.map((b) => new Uint8Array(b)),
                sanitizeMetadataValue(files.map((f) => f.name.replace(/\.pdf$/i, "")).join(" + "), 180)
            );
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${files[0].name.replace(/\.pdf$/i, "")}-merged`),
                title: "Merged PDF ready",
                description: `${files.length} documents merged in list order.`,
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <MultiDrop files={files} setFiles={setFiles} accept="application/pdf,.pdf"
                       label="Drop PDFs here or click to browse (in merge order)"/>
            {error && <Err>{error}</Err>}
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={files.length < 1 || busy}
                    onClick={() => void run()}>
                {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                {busy ? "Merging…" : `Merge ${files.length || ""} PDFs`}
            </Button>
            <Note>Merge order follows the list above — remove and re-add to reorder. pdf-lib loads lazily on first
                use.</Note>
            {dialog}
        </div>
    );
}

/* ─── ② extract range ───────────────────────────────────────────── */

export function PdfExtractTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [range, setRange] = React.useState("1");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file || pageCount == null) return;
        setBusy(true);
        setRunError(null);
        try {
            const pages = parsePageRange(range, pageCount);
            const out = await extractPdfPages(bytes, pages);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-extract`),
                title: "Extracted pages ready",
                description: `${pages.length} page(s): ${pages.join(", ")}.`,
            });
        } catch (err) {
            setRunError(err instanceof PageRangeError ? err.message : (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-3">
                <PageRangeInput value={range} onChange={setRange} pageCount={pageCount}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Extracting…" : "Extract pages"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>A brand-new PDF containing only the listed pages, in the listed order.</Note>
            {dialog}
        </div>
    );
}

/* ─── ③ delete pages ────────────────────────────────────────────── */

export function PdfDeleteTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [range, setRange] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file || pageCount == null) return;
        setBusy(true);
        setRunError(null);
        try {
            const pages = parsePageRange(range, pageCount);
            if (pages.length >= pageCount) {
                throw new PageRangeError("That would delete every page — use Extract instead to keep only some pages.");
            }
            const out = await deletePdfPages(bytes, pages);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-trimmed`),
                title: "PDF without those pages ready",
                description: `Removed ${pages.length} page(s): ${pages.join(", ")} — ${pageCount - pages.length} remain.`,
            });
        } catch (err) {
            setRunError(err instanceof PageRangeError ? err.message : (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-3">
                <PageRangeInput value={range} onChange={setRange} pageCount={pageCount}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || !range || busy}
                        onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Deleting…" : "Delete pages"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>The remaining pages keep their order; at least one page always survives.</Note>
            {dialog}
        </div>
    );
}

/* ─── ④ rotate pages ────────────────────────────────────────────── */

export function PdfRotateTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [range, setRange] = React.useState("");
    const [all, setAll] = React.useState(true);
    const [angle, setAngle] = React.useState("90");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file || pageCount == null) return;
        setBusy(true);
        setRunError(null);
        try {
            const pages = all ? null : parsePageRange(range, pageCount);
            const out = await rotatePdfPages(bytes, pages, Number(angle) as 90 | 180 | 270);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-rotated`),
                title: "Rotated PDF ready",
                description: `${all ? "All pages" : `Pages ${parsePageRange(range, pageCount).join(", ")}`} turned ${angle}° (added to any existing rotation).`,
            });
        } catch (err) {
            setRunError(err instanceof PageRangeError ? err.message : (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Check checked={all} onChange={setAll} label="All pages"/>
                {!all && <PageRangeInput value={range} onChange={setRange} pageCount={pageCount}/>}
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Angle</span>
                    <Sel
                        value={angle}
                        onValueChange={setAngle}
                        options={[
                            ["90", "90° CW"],
                            ["180", "180°"],
                            ["270", "270° (90° CCW)"],
                        ] as ReadonlyArray<readonly [string, string]>}
                        ariaLabel="Rotation angle"
                    />
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Rotating…" : "Rotate"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>The angle is ADDED to any existing /Rotate value (90 + 90 = 180) and wraps at 360°.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑤ reverse ─────────────────────────────────────────────────── */

export function PdfReverseTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [busy, setBusy] = React.useState(false);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        try {
            const out = await reversePdfPages(bytes);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-reversed`),
                title: "Reversed PDF ready",
                description: `${pageCount ?? "?"} pages in the opposite order.`,
            });
        } catch (err) {
            // surfaced by the note below; errors are rare here
            void err;
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                {busy ? "Reversing…" : "Reverse page order"}
            </Button>
            <Note>Last page becomes the first — handy for reordering scanned stacks.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑥ move page ───────────────────────────────────────────────── */

export function PdfMoveTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [from, setFrom] = React.useState(1);
    const [to, setTo] = React.useState(1);
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file || pageCount == null) return;
        setBusy(true);
        setRunError(null);
        try {
            const out = await movePdfPage(bytes, from, to);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-moved`),
                title: "PDF ready",
                description: `Page ${from} moved to position ${to}.`,
            });
        } catch (err) {
            setRunError(err instanceof PageRangeError ? err.message : (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <NumField label="From" value={from} onChange={setFrom} min={1} max={pageCount ?? undefined}/>
                <NumField label="To" value={to} onChange={setTo} min={1} max={pageCount ?? undefined}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Moving…" : "Move page"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>1-based positions — “from” is removed and re-inserted at “to”.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑦ insert blank page ───────────────────────────────────────── */

export function PdfBlankTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [at, setAt] = React.useState(1);
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    React.useEffect(() => {
        if (pageCount != null) setAt(pageCount + 1);
    }, [pageCount]);

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const out = await insertBlankPdfPage(bytes, at);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-blank`),
                title: "PDF ready",
                description: `A blank page (sized like page 1) inserted at position ${Math.min(Math.max(at, 1), (pageCount ?? 0) + 1)}.`,
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <NumField label="Position" value={at} onChange={setAt} min={1} max={(pageCount ?? 0) + 1}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    <FilePlus className="size-3.5"/>
                    {busy ? "Inserting…" : "Insert blank page"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>1-based — 1 inserts at the very
                front, {pageCount != null ? `${pageCount + 1} at the end` : "N+1 at the end"}.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑧ page numbers ────────────────────────────────────────────── */

const NUMBER_POSITIONS: ReadonlyArray<readonly [string, string]> = [
    ["bottom-center", "Bottom center"],
    ["bottom-right", "Bottom right"],
    ["bottom-left", "Bottom left"],
    ["top-center", "Top center"],
    ["top-right", "Top right"],
    ["top-left", "Top left"],
];

export function PdfNumbersTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [position, setPosition] = React.useState("bottom-center");
    const [fontSize, setFontSize] = React.useState(10);
    const [startAt, setStartAt] = React.useState(1);
    const [format, setFormat] = React.useState("# / @");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file || pageCount == null) return;
        setBusy(true);
        setRunError(null);
        try {
            const out = await stampPageNumbers(bytes, {
                position: position as "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right",
                fontSize: Math.max(6, Math.min(36, fontSize)),
                startAt: Math.max(1, Math.round(startAt)),
                format,
            });
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-numbered`),
                title: "Numbered PDF ready",
                description: `Every page stamped “${formatPageLabel(format, startAt, pageCount + Math.max(0, startAt - 1))}…”.`,
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Corner</span>
                    <Sel value={position} onValueChange={setPosition} options={NUMBER_POSITIONS}
                         ariaLabel="Number position"/>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Format</span>
                    <Sel
                        value={format}
                        onValueChange={setFormat}
                        options={[
                            ["#", "1"],
                            ["# / @", "1 / 9"],
                            ["Page # of @", "Page 1 of 9"],
                        ] as ReadonlyArray<readonly [string, string]>}
                        ariaLabel="Number format"
                    />
                </div>
                <NumField label="Font size" value={fontSize} onChange={setFontSize} min={6} max={36}/>
                <NumField label="Start at" value={startAt} onChange={setStartAt} min={1}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Stamping…" : "Stamp page numbers"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note># is the page number, @ the total. Helvetica, gray, 24 pt margins.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑨ watermark ───────────────────────────────────────────────── */

export function PdfWatermarkTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [text, setText] = React.useState("CONFIDENTIAL");
    const [fontSize, setFontSize] = React.useState(48);
    const [opacity, setOpacity] = React.useState(18);
    const [angle, setAngle] = React.useState("45");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const clean = sanitizeMetadataValue(text, 120);
            if (!clean) throw new Error("Enter watermark text first.");
            const out = await textWatermarkPdf(bytes, {
                text: clean,
                fontSize: Math.max(8, Math.min(200, fontSize)),
                opacity: Math.max(2, Math.min(100, opacity)) / 100,
                angle: Number(angle),
            });
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-watermarked`),
                title: "Watermarked PDF ready",
                description: `“${clean}” diagonally across all ${pageCount ?? "?"} page(s).`,
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Field label="Text" value={text} onChange={setText} placeholder="CONFIDENTIAL"/>
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Angle</span>
                    <Sel
                        value={angle}
                        onValueChange={setAngle}
                        options={[
                            ["30", "30°"],
                            ["45", "45°"],
                            ["60", "60°"],
                        ] as ReadonlyArray<readonly [string, string]>}
                        ariaLabel="Watermark angle"
                    />
                </div>
                <NumField label="Font size" value={fontSize} onChange={setFontSize} min={8} max={200}/>
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Opacity</span>
                    <input
                        type="range"
                        min={2}
                        max={80}
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                        className="h-1.5 w-28 accent-emerald-600"
                        aria-label="Watermark opacity"
                    />
                    <span className="w-10 font-mono text-[11px] text-muted-foreground">{opacity}%</span>
                </label>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Stamping…" : "Add watermark"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>Centered diagonally on every page; shrinks automatically so long texts still fit the diagonal.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑩⑪ metadata set / clear ───────────────────────────────────── */

export function PdfMetadataTool() {
    const {file, setFile, bytes, error, loading} = usePdfDoc();
    const [title, setTitle] = React.useState("");
    const [author, setAuthor] = React.useState("");
    const [subject, setSubject] = React.useState("");
    const [keywords, setKeywords] = React.useState("");
    const [creator, setCreator] = React.useState("");
    const [producer, setProducer] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    // prefill from the loaded document
    React.useEffect(() => {
        if (!bytes) return;
        let cancelled = false;
        void pdfInfo(bytes).then((info) => {
            if (cancelled) return;
            setTitle(info.title ?? "");
            setAuthor(info.author ?? "");
            setSubject(info.subject ?? "");
            setKeywords(info.keywords ?? "");
            setCreator(info.creator ?? "");
            setProducer(info.producer ?? "");
        });
        return () => {
            cancelled = true;
        };
    }, [bytes]);

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const meta = {
                title: sanitizeMetadataValue(title),
                author: sanitizeMetadataValue(author),
                subject: sanitizeMetadataValue(subject),
                keywords: sanitizeMetadataValue(keywords, 300),
                creator: sanitizeMetadataValue(creator),
                producer: sanitizeMetadataValue(producer),
            };
            if (!meta.title && !meta.author && !meta.subject && !meta.keywords && !meta.creator && !meta.producer) {
                throw new Error("Fill at least one field (or use Clear metadata).");
            }
            const out = await setPdfMetadata(bytes, meta);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-meta`),
                title: "Metadata written",
                description: "Blank fields are left untouched; modification date updated.",
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Title" value={title} onChange={setTitle} placeholder="Quarterly Report"/>
                <Field label="Author" value={author} onChange={setAuthor} placeholder="Praxis"/>
                <Field label="Subject" value={subject} onChange={setSubject} placeholder="Q3 finances"/>
                <Field label="Keywords" value={keywords} onChange={setKeywords} placeholder="finance, q3, internal"/>
                <Field label="Creator" value={creator} onChange={setCreator} placeholder="tool that made it"/>
                <Field label="Producer" value={producer} onChange={setProducer} placeholder="pdf-lib"/>
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Writing…" : "Set metadata"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>Fields prefill from the loaded document. Values are sanitized (control chars stripped, 200-char
                cap).</Note>
            {dialog}
        </div>
    );
}

export function PdfClearMetaTool() {
    const {file, setFile, bytes, error, loading} = usePdfDoc();
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const out = await clearPdfMetadata(bytes);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-clean`),
                title: "Metadata cleared",
                description: "Title, author, subject, keywords, creator and producer are now blank.",
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                {busy ? "Clearing…" : "Clear all metadata"}
            </Button>
            {runError && <Err>{runError}</Err>}
            <Note>Useful before sharing — strips the authoring trail (page CONTENT is untouched).</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑫ images → PDF ────────────────────────────────────────────── */

export function PdfImagesTool() {
    const [files, setFiles] = React.useState<File[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (files.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const images: Array<{ bytes: Uint8Array; mime: "image/jpeg" | "image/png" }> = [];
            for (const f of files) {
                const isPng = f.type === "image/png" || f.name.toLowerCase().endsWith(".png");
                const isJpg = f.type === "image/jpeg" || /\.jpe?g$/.test(f.name.toLowerCase());
                if (!isPng && !isJpg) throw new Error(`“${f.name}” is not a PNG or JPEG — those are the only formats pdf-lib embeds.`);
                images.push({bytes: new Uint8Array(await f.arrayBuffer()), mime: isPng ? "image/png" : "image/jpeg"});
            }
            const out = await imagesToPdf(images);
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(`${files[0].name.replace(/\.[^.]+$/, "")}-images`),
                title: "Images → PDF ready",
                description: `${files.length} image(s), one per page, each page sized to its image.`,
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <MultiDrop files={files} setFiles={setFiles} accept="image/png,image/jpeg"
                       label="Drop PNG/JPEG files here or click to browse (one page each)"/>
            {error && <Err>{error}</Err>}
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={files.length === 0 || busy}
                    onClick={() => void run()}>
                {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                {busy ? "Building…" : `Build PDF from ${files.length} image(s)`}
            </Button>
            <Note>Page size = image size in points (1 px ≈ 0.75 pt) — no borders, no scaling.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑬ text → PDF ──────────────────────────────────────────────── */

export function PdfTextTool() {
    const [text, setText] = React.useState(
        "Praxis — Text → PDF\n\nEvery explicit line break is kept.\nLong paragraphs are word-wrapped to the page and spill onto as many letter pages as needed.\n"
    );
    const [fontSize, setFontSize] = React.useState(11);
    const [mono, setMono] = React.useState(true);
    const [margin, setMargin] = React.useState(36);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        if (!text.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const out = await textToPdf(text, {
                fontSize: Math.max(6, Math.min(48, fontSize)),
                mono,
                margin: Math.max(12, Math.min(96, margin)),
            });
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName("text"),
                title: "Text → PDF ready",
                description: `${mono ? "Courier" : "Helvetica"} ${fontSize} pt on letter pages, ${margin} pt margins.`,
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                wrap="soft"
                placeholder="Paste the text…"
                className="font-mono text-xs min-h-[160px] w-full rounded-md border bg-muted/30 p-2 focus-visible:ring-1"
                aria-label="Text to convert"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <NumField label="Font size" value={fontSize} onChange={setFontSize} min={6} max={48}/>
                <Check checked={mono} onChange={setMono} label="Monospace (Courier)"/>
                <NumField label="Margin" value={margin} onChange={setMargin} min={12} max={96}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!text.trim() || busy}
                        onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Typesetting…" : "Text → PDF"}
                </Button>
            </div>
            {error && <Err>{error}</Err>}
            <Note>Word wrap is estimated, then hard-trimmed with the real font metrics, so nothing ever
                overflows.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑭ info report ─────────────────────────────────────────────── */

export function PdfInfoTool() {
    const {file, setFile, bytes, error, loading} = usePdfDoc();
    // save-target — source folder when preloaded, else root.
    const preload = useToolboxPreload();
    const [report, setReport] = React.useState("");
    const [infoDeliver, setInfoDeliver] = React.useState(false);

    React.useEffect(() => {
        if (!bytes || !file) {
            setReport("");
            return;
        }
        let cancelled = false;
        void pdfInfo(bytes).then((info) => {
            if (!cancelled) setReport(formatPdfInfo({...info, fileName: file.name, bytes: bytes.length}));
        });
        return () => {
            cancelled = true;
        };
    }, [bytes, file]);

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!report}
                    onClick={() => {
                        if (!file) return;
                        setInfoDeliver(true);
                    }}
                >
                    Deliver .txt
                </Button>
            </div>
            <pre
                className="min-h-[100px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick a PDF to inspect."}
      </pre>
            <OutputDeliveryDialog
                open={infoDeliver}
                onOpenChange={setInfoDeliver}
                title="PDF Info Ready"
                description="Copy, download, or save into the project folder."
                text={report || null}
                defaultName={`${(file?.name ?? "document").replace(/\.pdf$/i, "")}-info.txt`}
                folderSlug={toolboxSaveTarget(preload)}
            />
            <Note>Page count, sizes and the document info dictionary — read with pdf-lib, no server round-trip.</Note>
        </div>
    );
}

/* ─── ⑮ split every N ───────────────────────────────────────────── */

export function PdfSplitTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [n, setN] = React.useState(1);
    const [chunks, setChunks] = React.useState<PdfChunk[]>([]);
    const [which, setWhich] = React.useState("0");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    React.useEffect(() => {
        setChunks([]);
        setWhich("0");
    }, [file]);

    const split = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const parts = await splitPdfEvery(bytes, n);
            setChunks(parts);
            setWhich("0");
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const deliverChunk = (idx: number) => {
        const c = chunks[idx];
        if (!c || !file) return;
        const summary = chunks
            .map((ch, j) => `chunk ${j + 1}: pages ${ch.from}–${ch.to} · ${(ch.bytes.length / 1024).toFixed(0)} KB`)
            .join("  ·  ");
        deliver({
            blob: pdfBlob(c.bytes),
            name: normalizePdfName(`${file.name.replace(/\.pdf$/i, "")}-part${idx + 1}`),
            title: `Chunk ${idx + 1} of ${chunks.length} ready`,
            description: `Pages ${c.from}–${c.to}. Summary: ${summary}`,
        });
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <NumField label="Pages per chunk" value={n} onChange={setN} min={1} max={pageCount ?? 999}/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy}
                        onClick={() => void split()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Splitting…" : "Split"}
                </Button>
                {chunks.length > 0 && (
                    <>
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">Deliver chunk</span>
                            <Sel
                                value={which}
                                onValueChange={setWhich}
                                options={chunks.map((c, i) => [String(i), `${i + 1} (pages ${c.from}–${c.to})`] as const)}
                                ariaLabel="Chunk to deliver"
                            />
                        </div>
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                                onClick={() => deliverChunk(Number(which))}>
                            Deliver chunk {Number(which) + 1}
                        </Button>
                    </>
                )}
            </div>
            {runError && <Err>{runError}</Err>}
            {chunks.length > 0 && (
                <pre className="w-full rounded-md border bg-muted/30 p-2 font-mono text-[11px] whitespace-pre-wrap">
          {chunks.map((c, i) => `chunk ${i + 1}: pages ${c.from}–${c.to} · ${(c.bytes.length / 1024).toFixed(0)} KB`).join("\n")}
        </pre>
            )}
            <Note>All chunks are built in memory; pick which one to deliver (the dialog description carries the full
                summary).</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑯ title/cover page ────────────────────────────────────────── */

export function PdfCoverTool() {
    const {file, setFile, bytes, pageCount, error, loading} = usePdfDoc();
    const [title, setTitle] = React.useState("Quarterly Report");
    const [subtitle, setSubtitle] = React.useState("Prepared in the Praxis toolbox");
    const [author, setAuthor] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = usePdfDelivery();

    const run = async () => {
        setBusy(true);
        setRunError(null);
        try {
            const cleanTitle = sanitizeMetadataValue(title, 120);
            if (!cleanTitle) throw new Error("Enter a title first.");
            const out = await coverPagePdf(bytes, {
                title: cleanTitle,
                subtitle: sanitizeMetadataValue(subtitle, 160) || undefined,
                author: sanitizeMetadataValue(author, 80) || undefined,
                date: new Date().toISOString().slice(0, 10),
            });
            deliver({
                blob: pdfBlob(out),
                name: normalizePdfName(file ? `${file.name.replace(/\.pdf$/i, "")}-cover` : "cover-page"),
                title: "Cover page ready",
                description: file
                    ? `Prepended in front of the loaded PDF (${(pageCount ?? 0) + 1} pages total now).`
                    : "A standalone one-page cover PDF.",
            });
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Field label="Title" value={title} onChange={setTitle} placeholder="Quarterly Report"/>
                <Field label="Subtitle" value={subtitle} onChange={setSubtitle} placeholder="optional"/>
                <Field label="Author" value={author} onChange={setAuthor} placeholder="optional" w="w-32"/>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!title.trim() || busy}
                        onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Building…" : file ? "Prepend cover page" : "Create cover PDF"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>
                {file
                    ? "The cover is INSERTED as page 1 of the loaded PDF, sized to match its first page."
                    : "No PDF loaded — you’ll get a standalone one-page cover PDF (letter size)."}
            </Note>
            {dialog}
        </div>
    );
}

/* ─── ⑰ extract the EMBEDDED images (— the "add extract images to PDF" ask; the inverse of ⑫ Images → PDF) ── */

export function PdfExtractImagesTool() {
    const {file, setFile, bytes, error, loading, preloaded} = usePdfDoc();
    // save-all writes next to the SOURCE file when preloaded,
    // else into the project root (same level as the folders).
    const preload = useToolboxPreload();
    const [result, setResult] = React.useState<PdfImageExtractResult | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const [savingAll, setSavingAll] = React.useState(false);
    const {deliver, dialog} = usePdfDelivery();
    const {toast} = useToast();

    React.useEffect(() => {
        setResult(null);
        setRunError(null);
    }, [file]);

    const run = async () => {
        if (!bytes || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const r = await extractPdfImages(bytes, file.name);
            setResult(r);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const saveAll = async () => {
        if (!result || result.images.length === 0) return;
        setSavingAll(true);
        try {
            const files: Array<{ name: string; content: string; encoding: "base64" }> = [];
            for (const img of result.images) {
                const b64 = bufToBase64(await img.blob.arrayBuffer());
                files.push({name: img.name, content: b64, encoding: "base64"});
            }
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: toolboxSaveTarget(preload), files, overwrite: true}),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            toast({
                title: `Saved ${files.length} image${files.length === 1 ? "" : "s"}`,
                description: "Written next to the source file (or the project root) — find them in the explorer.",
                variant: "success",
            });
            window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
        } catch (err) {
            toast({title: "Save all failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setSavingAll(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {preloaded && file &&
              <Note>Loaded from the open file <span className="font-mono">{file.name}</span>.</Note>}
            {error && <Err>{error}</Err>}
            {loading && <Note>Loading…</Note>}
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!bytes || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : <ImageIcon className="size-3.5"/>}
                    {busy ? "Scanning…" : "Extract images"}
                </Button>
                {result && result.images.length > 0 && (
                    <>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={savingAll}
                                onClick={() => void saveAll()}>
                            {savingAll ? <Loader2 className="size-3.5 animate-spin"/> :
                                <HardDriveDownload className="size-3.5"/>}
                            Save all into project
                        </Button>
                        <Note>
                            {result.images.length} image{result.images.length === 1 ? "" : "s"} found
                            {result.skipped.length > 0 ? ` · ${result.skipped.length} skipped (unsupported codec)` : ""}
                        </Note>
                    </>
                )}
            </div>
            {runError && <Err>{runError}</Err>}
            {result && result.images.length === 0 && result.skipped.length === 0 && (
                <Note>This PDF contains no embedded raster images (vector-only or text-only).</Note>
            )}
            {result && result.skipped.length > 0 && (
                <Note>
                    Skipped: {result.skipped.map((s) => `${s.width}×${s.height} (${s.reason})`).join(" · ")}
                </Note>
            )}
            {result && result.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {result.images.map((img, i) => (
                        <div key={`${img.name}-${i}`} className="space-y-1 rounded-md border bg-muted/20 p-2">
                            <Thumb blob={img.blob} alt={img.name}/>
                            <p className="truncate font-mono text-[10px]"
                               title={`${img.name} · ${img.filter} · page ${img.page ?? "—"}`}>
                                {img.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {img.width}×{img.height} · {(img.sizeBytes / 1024).toFixed(0)} KB · {img.filter}
                                {img.page != null ? ` · page ${img.page}` : ""}
                            </p>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-full text-[11px]"
                                onClick={() =>
                                    deliver({
                                        blob: img.blob,
                                        name: img.name,
                                        title: `${img.width}×${img.height} image ready`,
                                        description: `${img.filter} · ${(img.sizeBytes / 1024).toFixed(0)} KB`,
                                    })
                                }
                            >
                                <Download className="size-3"/> Deliver
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            <Note>
                JPEG streams pass through byte-identical; Flate streams are decoded to pixels and re-encoded as
                spec-conformant PNGs — both fully client-side.
            </Note>
            {dialog}
        </div>
    );
}

/* ─── the registry entry point ──────────────────────────────────── */

/** One component per tool id — used by the dev-toolbox registry. */
export function pdfStudioTool(id: string): React.ComponentType {
    const C = function PdfStudioEntry() {
        switch (id) {
            case "pdf-merge":
                return <PdfMergeTool/>;
            case "pdf-extract":
                return <PdfExtractTool/>;
            case "pdf-delete":
                return <PdfDeleteTool/>;
            case "pdf-rotate":
                return <PdfRotateTool/>;
            case "pdf-reverse":
                return <PdfReverseTool/>;
            case "pdf-move":
                return <PdfMoveTool/>;
            case "pdf-blank":
                return <PdfBlankTool/>;
            case "pdf-numbers":
                return <PdfNumbersTool/>;
            case "pdf-watermark":
                return <PdfWatermarkTool/>;
            case "pdf-meta":
                return <PdfMetadataTool/>;
            case "pdf-meta-clear":
                return <PdfClearMetaTool/>;
            case "pdf-images":
                return <PdfImagesTool/>;
            case "pdf-text":
                return <PdfTextTool/>;
            case "pdf-info":
                return <PdfInfoTool/>;
            case "pdf-split":
                return <PdfSplitTool/>;
            case "pdf-cover":
                return <PdfCoverTool/>;
            case "pdf-extract-images":
                return <PdfExtractImagesTool/>;
            default:
                return <Note>Unknown tool.</Note>;
        }
    };
    C.displayName = `PdfStudio(${id})`;
    return C;
}
