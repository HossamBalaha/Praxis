"use client";

/**
 * the "Image → text" category — 8
 * tools that turn pixels into text. All of them are fully offline
 * except ① OCR, which lazily loads tesseract.js (worker + English
 * language model are fetched ONCE from the CDN) and degrades with an
 * actionable message when the network is unavailable.
 *
 *   ① OCR text extraction   tesseract.js, dynamic import inside the handler
 *   ② ASCII art             luminance → character ramp (pure TS)
 *   ③ Data URL              file → base64 data: URI
 *   ④ Image info report     dimensions / megapixels / aspect / bytes
 *   ⑤ Color palette         top-N quantized colors → hex + share
 *   ⑥ Dominant color        top-1 + nearest CSS color name
 *   ⑦ Histogram             R/G/B/luma buckets as a text table
 *   ⑧ JPEG EXIF dump        pure APP1/TIFF parser
 *
 * Every text result goes through the OutputDeliveryDialog (copy /
 * save-as / save-into-project) — never a raw download.
 */

import * as React from "react";
import {Loader2, Upload} from "lucide-react";
import {fetchPreloadFile, toolboxSaveTarget, useToolboxPreload} from "@/lib/toolbox-preload";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {
    ASCII_RAMPS,
    asciiFromRaster,
    dominantColor,
    formatExifReport,
    histogramFromRaster,
    histogramText,
    imageInfoReport,
    imageToRaster,
    loadImageFile,
    type PaletteEntry,
    paletteFromRaster,
    parseExif,
} from "@/lib/image-ops";

/* "Save into project" resolves through toolboxSaveTarget
 *  (preload folder → source file's folder; else the project root). */

/* ─── shared bits (local copies so the suite files stay independent) ── */

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Err({children}: { children: React.ReactNode }) {
    return <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

/** Drop-zone / picker + decode + optional raster, shared by all 8 tools.
 * consumes the toolbox preload context — when the dialog
 *  was opened from an image's view/edit UI (praxis:open-toolbox),
 *  that image is fetched and set as the loaded file automatically. */
function useLoadedImage() {
    const [file, setFile] = React.useState<File | null>(null);
    const [img, setImg] = React.useState<HTMLImageElement | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const preload = useToolboxPreload();

    React.useEffect(() => {
        if (!file) {
            setImg(null);
            return;
        }
        let cancelled = false;
        setError(null);
        void loadImageFile(file)
            .then((el) => {
                if (!cancelled) setImg(el);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError((err as Error).message);
            });
        return () => {
            cancelled = true;
        };
    }, [file]);

    // preload the file that is open in the viewer.
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

    return {file, img, error, setFile, preloaded: preload ? preload.fileName : null};
}

function Drop({file, onPick}: { file: File | null; onPick: (f: File | null) => void }) {
    return (
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
        {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Drop an image or click to browse"}
      </span>
            <input type="file" accept="image/*" className="hidden"
                   onChange={(e) => onPick(e.target.files?.[0] ?? null)}/>
        </label>
    );
}

/** The little preview thumbnail (shows what was loaded). */
function Thumb({img}: { img: HTMLImageElement | null }) {
    const ref = React.useRef<HTMLCanvasElement | null>(null);
    React.useEffect(() => {
        const c = ref.current;
        if (!c || !img) return;
        const s = Math.min(180 / img.naturalWidth, 120 / img.naturalHeight, 1);
        c.width = Math.max(1, Math.round(img.naturalWidth * s));
        c.height = Math.max(1, Math.round(img.naturalHeight * s));
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    }, [img]);
    return (
        <div className="grid place-items-center rounded-md border bg-muted/20 p-2">
            {img ? (
                <canvas ref={ref} className="max-h-[120px] rounded" aria-label="Image preview"/>
            ) : (
                <p className="py-6 text-xs text-muted-foreground">Pick an image first.</p>
            )}
        </div>
    );
}

/** One <pre> area + "deliver" wiring, shared by the text-producing tools. */
function useTextDelivery() {
    // save-into-project lands in the SOURCE file's folder when
    // one was preloaded (Tools ▸ from the viewer), else the project root.
    const preload = useToolboxPreload();
    const [delivery, setDelivery] = React.useState<{ text: string; name: string } | null>(null);
    const [open, setOpen] = React.useState(false);
    const deliver = (text: string, name: string) => {
        setDelivery({text, name});
        setOpen(true);
    };
    const dialog = (
        <OutputDeliveryDialog
            open={open}
            onOpenChange={setOpen}
            title="Text Result Ready"
            description="Copy to clipboard, save as…, or save into the project folder."
            text={delivery?.text ?? null}
            defaultName={delivery?.name ?? "result.txt"}
            folderSlug={toolboxSaveTarget(preload)}
        />
    );
    return {deliver, dialog};
}

/* ─── ① OCR ─────────────────────────────────────────────────────── */

export function OcrTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [busy, setBusy] = React.useState(false);
    const [progress, setProgress] = React.useState<number | null>(null);
    const [ocrError, setOcrError] = React.useState<string | null>(null);

    const runOcr = async () => {
        if (!img || !file) return;
        setBusy(true);
        setOcrError(null);
        setProgress(0);
        try {
            // tesseract.js is a big dependency AND fetches its worker + English
            // model from the network the first time — load it lazily, right here.
            type TessApi = typeof import("tesseract.js");
            const mod = (await import("tesseract.js")) as unknown as TessApi & { default?: TessApi };
            const tess = mod.default ?? mod;
            const worker = await tess.createWorker("eng", 1, {
                logger: (m) => {
                    if (m.status === "recognizing text") setProgress(m.progress);
                },
            });
            try {
                const result = await worker.recognize(img);
                const text = (result.data.text ?? "").trim();
                if (!text) {
                    setOcrError("No readable text found — try a sharper crop or higher contrast.");
                } else {
                    deliver(text, `${file.name.replace(/\.[^.]+$/, "")}-ocr.txt`);
                }
            } finally {
                await worker.terminate();
            }
        } catch (err) {
            setOcrError(
                `OCR downloads its language model once — check network; the other image→text tools work fully offline. ` +
                `(${(err as Error).message})`
            );
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <Thumb img={img}/>
            <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!img || busy} onClick={() => void runOcr()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? (progress != null ? `Recognizing… ${Math.round(progress * 100)}%` : "Loading engine…") : "Extract text"}
                </Button>
                {progress != null && progress > 0 && (
                    <div className="h-1.5 w-40 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-emerald-500" style={{width: `${Math.round(progress * 100)}%`}}/>
                    </div>
                )}
            </div>
            {ocrError && <Err>{ocrError}</Err>}
            <Note>
                tesseract.js runs fully in the browser (WASM). The first run fetches the worker + English language model
                once
                and caches it — after that it works offline.
            </Note>
            {dialog}
        </div>
    );
}

/* ─── ② ASCII art ───────────────────────────────────────────────── */

export function AsciiArtTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [width, setWidth] = React.useState(80);
    const [ramp, setRamp] = React.useState("standard");
    const [invert, setInvert] = React.useState(false);
    const [preview, setPreview] = React.useState("");

    React.useEffect(() => {
        if (!img) {
            setPreview("");
            return;
        }
        const raster = imageToRaster(img, 640);
        setPreview(asciiFromRaster(raster, width, ASCII_RAMPS[ramp] ?? ASCII_RAMPS.standard, invert));
    }, [img, width, ramp, invert]);

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Width</span>
                    <input
                        type="range"
                        min={20}
                        max={200}
                        step={2}
                        value={width}
                        onChange={(e) => setWidth(Number(e.target.value))}
                        className="h-1.5 w-32 accent-emerald-600"
                        aria-label="ASCII width"
                    />
                    <span className="w-14 font-mono text-[11px] text-muted-foreground">{width} chars</span>
                </label>
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Ramp</span>
                    <Select value={ramp} onValueChange={setRamp}>
                        <SelectTrigger size="sm" className="h-8 text-xs" aria-label="Character ramp">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(ASCII_RAMPS).map((k) => (
                                <SelectItem key={k} value={k} className="text-xs">
                                    {k}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                        type="checkbox"
                        checked={invert}
                        onChange={(e) => setInvert(e.target.checked)}
                        className="size-3.5 accent-emerald-600"
                    />
                    Invert
                </label>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!preview}
                    onClick={() => deliver(preview, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-ascii.txt`)}
                >
                    Deliver .txt
                </Button>
            </div>
            <pre
                className="max-h-72 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-tight whitespace-pre">
        {preview || "Pick an image to render ASCII art."}
      </pre>
            <Note>Luminance → character ramp, cell height half the width (terminal glyphs are ~2:1).</Note>
            {dialog}
        </div>
    );
}

/* ─── ③ Data URL ────────────────────────────────────────────────── */

export function DataUrlImageTool() {
    const {file, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [busy, setBusy] = React.useState(false);
    const [dataUrl, setDataUrl] = React.useState("");

    React.useEffect(() => {
        if (!file) {
            setDataUrl("");
            return;
        }
        let cancelled = false;
        setBusy(true);
        const reader = new FileReader();
        reader.onload = () => {
            if (!cancelled) setDataUrl(String(reader.result ?? ""));
        };
        reader.onerror = () => {
            if (!cancelled) setDataUrl("");
        };
        reader.onloadend = () => {
            if (!cancelled) setBusy(false);
        };
        reader.readAsDataURL(file);
        return () => {
            cancelled = true;
        };
    }, [file]);

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!dataUrl || busy}
                    onClick={() => deliver(dataUrl, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-dataurl.txt`)}
                >
                    {busy ? "Encoding…" : "Deliver .txt"}
                </Button>
                {dataUrl &&
                  <Note>{dataUrl.length.toLocaleString()} characters · {(dataUrl.length / 1024).toFixed(1)} KB of
                    text</Note>}
            </div>
            <pre
                className="max-h-40 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] break-all whitespace-pre-wrap">
        {dataUrl || "Pick an image to encode as a data: URI."}
      </pre>
            <Note>Works for any image type. Use it for CSS url(), &lt;img src&gt; or JSON payloads.</Note>
            {dialog}
        </div>
    );
}

/* ─── ④ Image info report ───────────────────────────────────────── */

export function ImageInfoTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const report = React.useMemo(
        () =>
            file && img
                ? imageInfoReport({
                    name: file.name,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    bytes: file.size,
                    type: file.type || "unknown",
                })
                : "",
        [file, img]
    );

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <Thumb img={img}/>
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!report}
                    onClick={() => deliver(report, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-info.txt`)}
                >
                    Deliver .txt
                </Button>
            </div>
            <pre
                className="min-h-[80px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick an image to inspect."}
      </pre>
            {dialog}
        </div>
    );
}

/* ─── ⑤⑥ palette + dominant color ───────────────────────────────── */

function PaletteRows({palette}: { palette: PaletteEntry[] }) {
    return (
        <div className="space-y-1">
            {palette.map((c) => (
                <div key={c.hex} className="flex items-center gap-2 text-xs">
                    <span className="size-4 shrink-0 rounded border" style={{background: c.hex}}/>
                    <span className="w-20 font-mono">{c.hex}</span>
                    <span className="w-24 text-muted-foreground">{c.name}</span>
                    <span className="w-14 text-right font-mono tabular-nums">{(c.share * 100).toFixed(1)}%</span>
                </div>
            ))}
        </div>
    );
}

export function ColorPaletteTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [count, setCount] = React.useState(8);
    const palette = React.useMemo(() => (img ? paletteFromRaster(imageToRaster(img, 512), count) : []), [img, count]);

    const asText = React.useCallback(
        (rows: PaletteEntry[]) =>
            ["hex        name         share", ...rows.map((c) => `${c.hex}  ${c.name.padEnd(12)} ${(c.share * 100).toFixed(1)}%`)].join(
                "\n"
            ),
        []
    );

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Colors</span>
                    <input
                        type="range"
                        min={2}
                        max={24}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        className="h-1.5 w-32 accent-emerald-600"
                        aria-label="Palette size"
                    />
                    <span className="w-8 font-mono text-[11px] text-muted-foreground">{count}</span>
                </label>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!palette.length}
                    onClick={() => deliver(asText(palette), `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-palette.csv`)}
                >
                    Deliver .csv
                </Button>
            </div>
            {palette.length > 0 ? <PaletteRows palette={palette}/> :
                <Note>Pick an image to quantize its palette.</Note>}
            <Note>4-bit-per-channel quantization (4096 buckets) → top-N by pixel count.</Note>
            {dialog}
        </div>
    );
}

export function DominantColorTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const dom = React.useMemo(() => (img ? dominantColor(imageToRaster(img, 512)) : null), [img]);
    const text = React.useMemo(
        () => (dom ? `Dominant color\n  hex     ${dom.hex}\n  rgb     ${dom.r}, ${dom.g}, ${dom.b}\n  name    ${dom.name}\n  share   ${(dom.share * 100).toFixed(1)}% of pixels` : ""),
        [dom]
    );

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {dom ? (
                <div className="flex items-center gap-3">
                    <div className="size-16 rounded-md border" style={{background: dom.hex}}/>
                    <div className="font-mono text-xs">
                        <div className="text-lg font-semibold">{dom.hex}</div>
                        <div className="text-muted-foreground">
                            rgb({dom.r}, {dom.g}, {dom.b}) · {dom.name} · {(dom.share * 100).toFixed(1)}% of pixels
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7 text-xs"
                        onClick={() => deliver(text, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-dominant.txt`)}
                    >
                        Deliver .txt
                    </Button>
                </div>
            ) : (
                <Note>Pick an image to find its dominant color.</Note>
            )}
            {dialog}
        </div>
    );
}

/* ─── ⑦ Histogram ───────────────────────────────────────────────── */

export function HistogramTool() {
    const {file, img, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [buckets, setBuckets] = React.useState(16);
    const table = React.useMemo(() => (img ? histogramText(histogramFromRaster(imageToRaster(img, 512), buckets)) : ""), [img, buckets]);

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Buckets</span>
                    <input
                        type="range"
                        min={4}
                        max={64}
                        step={4}
                        value={buckets}
                        onChange={(e) => setBuckets(Number(e.target.value))}
                        className="h-1.5 w-32 accent-emerald-600"
                        aria-label="Histogram buckets"
                    />
                    <span className="w-8 font-mono text-[11px] text-muted-foreground">{buckets}</span>
                </label>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!table}
                    onClick={() => deliver(table, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-histogram.csv`)}
                >
                    Deliver .csv
                </Button>
            </div>
            <pre
                className="max-h-64 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] whitespace-pre">
        {table || "Pick an image to chart its histogram."}
      </pre>
            <Note>R, G, B and luma channel counts per brightness bucket.</Note>
            {dialog}
        </div>
    );
}

/* ─── ⑧ EXIF dump ───────────────────────────────────────────────── */

export function ExifTool() {
    const {file, error, setFile} = useLoadedImage();
    const {deliver, dialog} = useTextDelivery();
    const [report, setReport] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!file) {
            setReport("");
            return;
        }
        let cancelled = false;
        setBusy(true);
        void file
            .arrayBuffer()
            .then((buf) => {
                if (cancelled) return;
                const bytes = new Uint8Array(buf);
                setReport(formatExifReport(parseExif(bytes), file.name));
            })
            .catch((err: unknown) => {
                if (!cancelled) setReport(`EXIF — ${file.name}\n\nread error: ${(err as Error).message}`);
            })
            .finally(() => {
                if (!cancelled) setBusy(false);
            });
        return () => {
            cancelled = true;
        };
    }, [file]);

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!report || busy}
                    onClick={() => deliver(report, `${(file?.name ?? "image").replace(/\.[^.]+$/, "")}-exif.txt`)}
                >
                    {busy ? "Parsing…" : "Deliver .txt"}
                </Button>
            </div>
            <pre
                className="min-h-[80px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick a JPEG to dump its EXIF (orientation, camera, dates, exposure…)."}
      </pre>
            <Note>
                Pure TypeScript APP1/TIFF parser — no libraries. Non-JPEG files and JPEGs without EXIF get a graceful
                “no EXIF found” report.
            </Note>
            {dialog}
        </div>
    );
}
