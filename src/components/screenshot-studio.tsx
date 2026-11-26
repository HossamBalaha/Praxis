import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {useToast} from "@/hooks/use-toast";
import {
    Aperture,
    AppWindow,
    Camera,
    Check,
    ClipboardCopy,
    Crop,
    Download,
    FolderInput,
    Hash,
    Image as ImageIcon,
    Layers,
    ListOrdered,
    Loader2,
    Monitor,
    MousePointerSquareDashed,
    Palette,
    PanelBottom,
    PanelLeft,
    RefreshCw,
    Scissors,
    Send,
    SlidersHorizontal,
    SquareCode,
    TextCursorInput,
} from "lucide-react";
import {
    clampImageQuality,
    type CodeShotSpec,
    type DomRaster,
    rasterizeDomToSvg,
    renderCodeToPng,
    resampleCanvasToDpi,
    SHOT_PALETTES,
    type ShotEncodeOptions,
    shotPaletteById,
    svgDataUrl,
    trySvgToPng,
} from "@/lib/screenshot-render";
import {loadSettings} from "@/lib/settings";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";

export type ScreenshotMode =
    "window"
    | "code"
    | "selection"
    | "selection-text"
    | "range"
    | "editor"
    | "bottom"
    | "sidebar"
    | "dialog"
    | "app";

/* ────────────────────────────────────────────────────────────────────
* SHOT COMPOSER — the Screenshot studio, redesigned from scratch.
*
* The previous studio (removed) was a flat dialog: an options bar,
* three capture cards and a result block — every control at the same
* level, no flow..
*
* NEW IDEA — a camera-style THREE-STEP composer, visible in a step
* strip at the top of the dialog:
*
* 1 PICK pick what to shoot (Window / Region / Code) — a
* vertical rail on the left, always available for a
* re-take.
* 2 COMPOSE the captured frame sits on a checkerboard stage;
* the adjustments live UNDER it in labeled groups:
* Quality (named presets, not raw numbers), Format
* (segmented, with what each is for), and — for code
* shots — line numbers + a custom caption. Every
* change re-encodes the CURRENT shot live.
* 3 DELIVER filename + folder, then one row of actions — Save To
* File / Copy / Download — plus a remembered
* "After capture" action that fires automatically when
* the next shot lands.
*
* Better settings & configs the old studio never had:
* ▸ Quality presets with intent labels: Screen 96 · Sharp 192 ·
* Print 300 · Max 600 (raw DPI numbers hid the purpose).
* ▸ Custom caption for code shots (the line-range default is a
* placeholder, editable before saving).
* ▸ "After capture" automation: Ask / Copy / Save / Download —
* remembered per user in localStorage.
* ▸ Folder + filename, auto-named per shot ({name}-{stamp}.{ext})
* and remembered; the old studio reset both every time.
* ──────────────────────────────────────────────────────────────────── */

/** Storage format → canonical file extension. */
function extFor(format: "png" | "jpeg" | "webp"): string {
    return format === "jpeg" ? "jpg" : format;
}

interface ScreenshotStudioProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Which screenshot to perform — set by the menu / navbar icon; the
     *  composer runs it as soon as it opens, then the value resets. */
    pendingMode: ScreenshotMode | null;
    onPendingModeConsumed: () => void;
    /** The open file's text + name for "Screenshot: code" — the page
     *  feeds this from the viewer it mounts (null when nothing
     *  text-ish is open). */
    getCodeSpec: () => CodeShotSpec | null;
}

interface Shot {
    dataUrl: string;
    width: number;
    height: number;
    bytes: number;
    label: string;
    detail: string;
    /** Code shots can re-render (line-number / caption toggle) — keep the spec. */
    spec?: CodeShotSpec;
    /** Region shots can re-run the snip picker — keep the mode. */
    retake?: ScreenshotMode;
    /** The pre-resample SOURCE canvas (window / region shots) — kept so
     *  quality / format changes re-encode the CURRENT screenshot live
     *  instead of only applying to the next one. Code shots re-render
     *  from `spec` instead. */
    sourceCanvas?: HTMLCanvasElement;
    /* VECTOR delivery (the internal DOM capture): Chromium taints any
      *  canvas that drew a foreignObject SVG, so window/region shots of
      *  the IDE deliver as self-contained VECTOR SVG — displayed with the
      *  SAME dataUrl (an image/svg+xml data URL shows fine in <img>),
      *  downloaded / saved as .svg, infinitely scalable. PNG-only actions
      *  (clipboard) explain the limitation. Quality/format re-encodes skip
      *  vector shots. */
    vector?: { text: string };
}

/* ── Quality presets — intent labels instead of raw DPI numbers ── */
const QUALITY_PRESETS: ReadonlyArray<{ dpi: number; label: string; hint: string }> = [
    {dpi: 72, label: "Draft", hint: "0.75× — smallest files, quick notes"},
    {dpi: 96, label: "Screen", hint: "1× — exactly the on-screen pixels"},
    {dpi: 144, label: "Crisp", hint: "1.5× — sharper text for doc embeds"},
    {dpi: 192, label: "Sharp", hint: "2× — retina crisp, good default for docs"},
    {dpi: 300, label: "Print", hint: "3.1× — laser-print quality (the default)"},
    {dpi: 450, label: "Ultra", hint: "4.7× — high-DPI displays & deep zoom"},
    {dpi: 600, label: "Max", hint: "6.25× — archival, very large files"},
];

/* Every DPI the settings select offers must map to a preset chip or
 * the custom row below carries it — the union keeps the composer and
 * Settings → Capture → Screenshot storage DPI consistent. */
const KNOWN_DPIS = new Set<number>([...QUALITY_PRESETS.map((q) => q.dpi), 120, 220, 400]);

/** Clamp a custom DPI into the renderer's 72–600 band. */
function clampCustomDpi(v: number): number {
    if (!Number.isFinite(v)) return 300;
    return Math.min(600, Math.max(72, Math.round(v)));
}

/* ── Format choices — what each is FOR, next to the name ── */
const FORMAT_CHOICES: ReadonlyArray<{ value: "png" | "jpeg" | "webp"; label: string; hint: string }> = [
    {value: "png", label: "PNG", hint: "lossless — screenshots with text"},
    {value: "jpeg", label: "JPG", hint: "smaller, lossy — photos of screens"},
    {value: "webp", label: "WebP", hint: "smallest — web embeds"},
];

/* ── After-capture automation (remembered) ── */
type AfterAction = "ask" | "copy" | "save" | "download";
const AFTER_CHOICES: ReadonlyArray<{ value: AfterAction; label: string; hint: string }> = [
    {value: "ask", label: "Ask", hint: "keep the shot on the stage"},
    {value: "copy", label: "Copy", hint: "clipboard, right after the shot"},
    {value: "save", label: "Save", hint: "into the project folder"},
    {value: "download", label: "Download", hint: "browser download"},
];

/** Composer preferences — remembered in localStorage. */
interface ComposerPrefs {
    dpi: number;
    format: "png" | "jpeg" | "webp";
    lineNumbers: boolean;
    after: AfterAction;
    folder: string;
    /** Last-used shot palette — remembered across sessions ("auto" or
     *  a SHOT_PALETTES id; legacy "light"/"dark" are migrated). */
    theme?: string;
    /** JPEG / WebP encode quality, 0.5–1. */
    imageQuality?: number;
    /** Render the traffic-dot header strip on code shots. */
    showHeader?: boolean;
    /** Render the footer line/char note + watermark on code shots. */
    showFooter?: boolean;
    /** Custom footer watermark for code shots — empty/unset = the
     *  default "Praxis — Theory into practice". */
    watermark?: string;
}

const PREFS_KEY = "praxis.shotComposerPrefs";

function loadPrefs(): ComposerPrefs | null {
    try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as ComposerPrefs;
        if (
            !p ||
            typeof p.dpi !== "number" ||
            (p.format !== "png" && p.format !== "jpeg" && p.format !== "webp") ||
            (p.after !== "ask" && p.after !== "copy" && p.after !== "save" && p.after !== "download")
        ) {
            return null;
        }
        return p;
    } catch {
        return null;
    }
}

function stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Map a dragged viewport rectangle onto the OPEN CODE SURFACE's line
 *  range — used when a region sits over the editor: Chromium cannot
 *  export the DOM raster to PNG (foreignObject taint), but the code
 *  renderer draws text NATIVELY on canvas, so the exact lines under the
 *  drag re-render as a crisp PNG at the configured DPI / format /
 *  theme. The candidate surfaces are the Python editor's code viewport
 *  and the FileViewer's body. Returns the measured <pre> + its rect so
 *  the caller maps with the file's line count, or null when the rect
 *  does not sit over code. */
function codeSurfaceFromRect(rect: { x: number; y: number; w: number; h: number }): {
    preRect: DOMRect;
} | null {
    const candidates = [
        document.querySelector('[aria-label^="Code viewport"] pre'),
        document.querySelector("[data-file-viewer-body] pre"),
    ].filter(Boolean) as HTMLElement[];
    let best: { preRect: DOMRect; overlap: number } | null = null;
    for (const pre of candidates) {
        const r = pre.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const ix = Math.min(rect.x + rect.w, r.right) - Math.max(rect.x, r.left);
        const iy = Math.min(rect.y + rect.h, r.bottom) - Math.max(rect.y, r.top);
        const overlap = Math.max(0, ix) * Math.max(0, iy);
        if (overlap <= 0) continue;
        if (!best || overlap > best.overlap) best = {preRect: r, overlap};
    }
    if (!best) return null;
    // The rect must sit MOSTLY over the code column (not the sidebar or
    // gutter chrome far left, not the tabs above).
    const r = best.preRect;
    const ix = Math.min(rect.x + rect.w, r.right) - Math.max(rect.x, r.left);
    if (ix < Math.max(8, 0.35 * rect.w)) return null;
    return {preRect: r};
}

/** The pitch-aware line mapping over a measured code <pre> — the pitch
 *  (height / lineCount) self-corrects for wrapped rows on average. */
function linesFromPreRect(
    preRect: DOMRect,
    rect: { x: number; y: number; w: number; h: number },
    lineCount: number
): { first: number; last: number } | null {
    if (lineCount < 1) return null;
    const pitch = preRect.height / lineCount;
    if (!Number.isFinite(pitch) || pitch <= 0) return null;
    const first = Math.max(1, Math.min(lineCount, Math.floor((rect.y - preRect.top) / pitch) + 1));
    const last = Math.max(first, Math.min(lineCount, Math.ceil((rect.y + rect.h - preRect.top) / pitch)));
    if (last < first) return null;
    return {first, last};
}

/** Bytes → human label. */
function prettyBytes(b: number): string {
    if (b > 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
}

/* ────────────────────────────────────────────────────────────────────
* RegionSnipOverlay — the scissors-style region picker over the IDE.
*
* A frozen frame of the IDE'S OWN WORKSPACE (rasterized from the DOM —
* NOT the PC screen; "when the capture region is toggled, it
* should capture a region inside the IDE not inside the PC") is shown
* at its on-screen position; the user drags a rectangle with the
* crosshair cursor, sees the live pixel size, then confirms. The
* rectangle is reported in VIEWPORT pixels; the caller maps it onto
* the frozen frame through the workspace root's bounding rect.
* ──────────────────────────────────────────────────────────────────── */
interface RegionSnipOverlayProps {
    /** The frozen IDE frame as a data URL (workspace-root resolution). */
    frameUrl: string;
    /** The workspace root's viewport rect — the frozen frame is shown
     *  at exactly this position, so drag coordinates map 1:1. */
    rootRect: { left: number; top: number; width: number; height: number };
    onCancel: () => void;
    onConfirm: (rect: { x: number; y: number; w: number; h: number }) => void;
}

function RegionSnipOverlay({frameUrl, rootRect, onCancel, onConfirm}: RegionSnipOverlayProps) {
    const [dragStart, setDragStart] = React.useState<{ x: number; y: number } | null>(null);
    const [dragNow, setDragNow] = React.useState<{ x: number; y: number } | null>(null);
    const [done, setDone] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const rectFrom = React.useCallback(
        (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(a.x - b.x),
            h: Math.abs(a.y - b.y),
        }),
        []
    );

    const activeRect = React.useMemo(() => {
        if (done) return done;
        if (dragStart && dragNow) return rectFrom(dragStart, dragNow);
        return null;
    }, [done, dragStart, dragNow, rectFrom]);

    const commit = React.useCallback(() => {
        if (!activeRect || activeRect.w < 2 || activeRect.h < 2) return;
        onConfirm(activeRect);
    }, [activeRect, onConfirm]);

    // Escape cancels, Enter confirms, Space grabs the whole IDE region.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Escape") onCancel();
            else if (e.key === "Enter") commit();
            else if (e.key === " ") {
                e.preventDefault();
                onConfirm({x: rootRect.left, y: rootRect.top, w: rootRect.width, h: rootRect.height});
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [commit, onCancel, onConfirm, rootRect]);

    const onPointerDown = (e: React.PointerEvent) => {
        if (done) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setDragStart({x: e.clientX, y: e.clientY});
        setDragNow({x: e.clientX, y: e.clientY});
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragStart || done) return;
        setDragNow({x: e.clientX, y: e.clientY});
    };
    const onPointerUp = () => {
        if (!dragStart || done) return;
        const r = rectFrom(dragStart, dragNow ?? dragStart);
        setDragStart(null);
        setDragNow(null);
        if (r.w < 2 || r.h < 2) return; // a click, not a drag — restart
        setDone(r);
    };

    return (
        <div
            className="fixed inset-0 z-[300] select-none bg-black/90"
            style={{cursor: done ? "default" : "crosshair"}}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onContextMenu={(e) => {
                e.preventDefault();
                onCancel();
            }}
        >
            {/* The frozen IDE frame, shown at the workspace root's exact
          on-screen position (object-fill inside that box — the raster
          was taken at the box's size, so pixels map 1:1). */}
            <img
                src={frameUrl}
                alt="Frozen IDE frame"
                className="pointer-events-none absolute object-fill"
                draggable={false}
                style={{
                    left: rootRect.left,
                    top: rootRect.top,
                    width: rootRect.width,
                    height: rootRect.height,
                }}
            />

            {/* Dim veil with a transparent hole over the selection. */}
            {activeRect ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                    <defs>
                        <mask id="snip-hole">
                            <rect width="100%" height="100%" fill="white"/>
                            <rect
                                x={activeRect.x}
                                y={activeRect.y}
                                width={activeRect.w}
                                height={activeRect.h}
                                fill="black"
                            />
                        </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#snip-hole)"/>
                    <rect
                        x={activeRect.x}
                        y={activeRect.y}
                        width={activeRect.w}
                        height={activeRect.h}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="1.5"
                        strokeDasharray={done ? undefined : "6 4"}
                    />
                    {/* Corner handles in the done state. */}
                    {done &&
                        [
                            [activeRect.x, activeRect.y],
                            [activeRect.x + activeRect.w, activeRect.y],
                            [activeRect.x, activeRect.y + activeRect.h],
                            [activeRect.x + activeRect.w, activeRect.y + activeRect.h],
                        ].map(([hx, hy], i) => (
                            <rect key={i} x={hx - 4} y={hy - 4} width="8" height="8" fill="#10b981"/>
                        ))}
                </svg>
            ) : null}

            {/* Live size badge. */}
            {activeRect ? (
                <div
                    className="pointer-events-none absolute rounded-md bg-emerald-600 px-2 py-0.5 font-mono text-[11px] font-medium text-white shadow-lg"
                    style={{
                        left: Math.min(Math.max(activeRect.x, 8), window.innerWidth - 130),
                        top: Math.max(activeRect.y - 26, 8),
                    }}
                >
                    {Math.round(activeRect.w)} × {Math.round(activeRect.h)} px
                </div>
            ) : null}

            {/* Hint bar. */}
            <div
                className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-4 py-1.5 text-xs font-medium text-foreground shadow-lg">
                <Scissors className="size-3.5 text-emerald-500"/>
                {done ? (
                    <span>
            <kbd className="rounded bg-muted px-1">Enter</kbd> screenshot the region ·{" "}
                        <kbd className="rounded bg-muted px-1">Space</kbd> whole IDE ·{" "}
                        <kbd className="rounded bg-muted px-1">Esc</kbd> cancel
          </span>
                ) : (
                    <span>Drag to select a region of the IDE · Space = whole IDE · Esc = cancel</span>
                )}
            </div>

            {/* Confirm actions once a rect is drawn. */}
            {done ? (
                <div
                    className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-background/95 p-1.5 shadow-2xl">
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={commit}>
                        <Crop className="size-3.5"/> Screenshot: region
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setDone(null)}
                    >
                        <RefreshCw className="size-3.5"/> Redraw
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

/* ── Small local UI atoms ─────────────────────────────────────────── */

/** A labeled group card — one COMPOSE setting per card. */
function ComposeGroup({
                          icon,
                          title,
                          hint,
                          children,
                      }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                {React.createElement(icon, {className: "size-3.5 text-muted-foreground"})}
                {title}
            </p>
            {hint && <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>}
            <div className="mt-2">{children}</div>
        </div>
    );
}

/** Segmented control — WRAPS. The row now wraps: each chip keeps a
 * minimum width so its label stays readable, flex-grows when there is
 * room, and the overflow flows onto the next line. */
function Segmented<T extends string | number>({
                                                  options,
                                                  value,
                                                  onChange,
                                                  ariaLabel,
                                              }: {
    options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
}) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={String(o.value)}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={o.hint}
                        onClick={() => onChange(o.value)}
                        className={
                            "min-w-[3.5rem] flex-1 basis-auto whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition-colors " +
                            (active
                                ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-border bg-background text-foreground hover:bg-muted")
                        }
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────
 * ScreenshotStudio — the Shot Composer dialog.
 * ──────────────────────────────────────────────────────────────────── */
export function ScreenshotStudio({
                                     open,
                                     onOpenChange,
                                     pendingMode,
                                     onPendingModeConsumed,
                                     getCodeSpec,
                                 }: ScreenshotStudioProps) {
    const {toast} = useToast();
    const [shot, setShot] = React.useState<Shot | null>(null);
    const [busy, setBusy] = React.useState(false);
    /** Monotonic id of the last NEW capture (not re-encodes) — drives the
     *  remembered after-capture automation without firing on every
     *  quality/format/caption tweak. */
    const [captureSeq, setCaptureSeq] = React.useState(0);
    const captureSeqRef = React.useRef(0);

    // ── Composer state — seeded once from Settings → Capture (defaults)
    //    or the remembered localStorage prefs; persisted on change.
    const [lineNumbers, setLineNumbers] = React.useState(true);
    const [caption, setCaption] = React.useState("");
    const [savePath, setSavePath] = React.useState("");
    const [savedTo, setSavedTo] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [after, setAfter] = React.useState<AfterAction>("ask");
    const [dpi, setDpi] = React.useState(192);
    const [format, setFormat] = React.useState<"png" | "jpeg" | "webp">("png");
    const [shotTheme, setShotTheme] = React.useState<string>("auto");
    const [imageQuality, setImageQuality] = React.useState(0.92);
    const [folderPrefix, setFolderPrefix] = React.useState("Screenshots");
    /* Chrome toggles — whether code shots carry the traffic-dot
     * header strip and the footer (lines·chars + watermark). */
    const [showHeader, setShowHeader] = React.useState(true);
    const [showFooter, setShowFooter] = React.useState(true);
    /* Custom footer watermark — empty string = the classic
     * "Praxis — Theory into practice"; non-empty replaces it on every
     * code shot (the renderer reads CodeShotSpec.watermark). */
    const [watermark, setWatermark] = React.useState("");
    /* Line-range shot — the from/to window for the “Lines” capture
     * type (1-based, inclusive; clamped against the open file). */
    const [rangeFrom, setRangeFrom] = React.useState(1);
    const [rangeTo, setRangeTo] = React.useState(40);

    /* Resolve the theme at SHOT time — "auto" follows the app's
     * dark/light family (dark app → One Dark, light app → One Light);
     * legacy "light"/"dark" values (from the old 3-way picker) migrate
     * to their palette ids; anything else must be a registry id. */
    const resolveShotTheme = React.useCallback((): string => {
        if (shotTheme === "auto") {
            return document.documentElement.classList.contains("dark") ? "one-dark" : "one-light";
        }
        if (shotTheme === "light") return "one-light";
        if (shotTheme === "dark") return "one-dark";
        return shotPaletteById(shotTheme).id;
    }, [shotTheme]);

    React.useEffect(() => {
        if (!open) return;
        const remembered = loadPrefs();
        if (remembered) {
            setDpi(clampCustomDpi(remembered.dpi));
            setFormat(remembered.format);
            setLineNumbers(remembered.lineNumbers);
            setAfter(remembered.after);
            if (remembered.folder) setFolderPrefix(remembered.folder);
            if (remembered.theme) setShotTheme(remembered.theme);
            if (typeof remembered.imageQuality === "number") {
                setImageQuality(clampImageQuality(remembered.imageQuality));
            }
            if (typeof remembered.showHeader === "boolean") setShowHeader(remembered.showHeader);
            if (typeof remembered.showFooter === "boolean") setShowFooter(remembered.showFooter);
            if (typeof remembered.watermark === "string") setWatermark(remembered.watermark);
        } else {
            const s = loadSettings();
            setDpi(Math.min(600, Math.max(72, Math.round(s.screenshotDpi ?? 300))));
            setFormat(s.screenshotFormat ?? "png");
            setShotTheme(s.shotTheme ?? "auto");
            setImageQuality(clampImageQuality(s.shotImageQuality));
        }
        // the line-range capture seeds its window from the
        // currently open file's length so the inputs are always valid.
        const spec0 = getCodeSpec();
        if (spec0) {
            const total = spec0.content.split("\n").length;
            setRangeFrom(1);
            setRangeTo(Math.min(40, Math.max(1, total)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(
                PREFS_KEY,
                JSON.stringify({
                    dpi,
                    format,
                    lineNumbers,
                    after,
                    folder: folderPrefix,
                    theme: shotTheme,
                    imageQuality,
                    showHeader,
                    showFooter,
                    watermark
                } satisfies ComposerPrefs)
            );
        } catch {
            /* quota — ignore */
        }
    }, [dpi, format, lineNumbers, after, folderPrefix, shotTheme, imageQuality, showHeader, showFooter, watermark]);

    /** The active snip session: a frozen IDE frame (the workspace DOM
     *  serialized to a self-contained SVG — display-only, never a canvas)
     *  + the root's viewport rect + a pending promise resolver. Null when
     *  no region pick is running. */
    const [snip, setSnip] = React.useState<{
        raster: DomRaster;
        rootRect: { left: number; top: number; width: number; height: number };
        resolve: (rect: { x: number; y: number; w: number; h: number } | null) => void;
    } | null>(null);
    /** True for the ~1-frame window while the dialog hides and the IDE
     *  DOM rasterizes — the Dialog stays unmounted so the freeze never
     *  captures the composer itself. */
    const [snipPreparing, setSnipPreparing] = React.useState(false);

    /** The most recent frozen snip raster — kept in a ref so the confirm
     *  handler can crop / re-serialize from it. */
    const snipSourceRef = React.useRef<DomRaster | null>(null);
    /** The workspace root's viewport rect the frozen frame was taken at. */
    const snipRootRectRef = React.useRef<{ left: number; top: number; width: number; height: number } | null>(null);

    const encodeOpts = React.useMemo<ShotEncodeOptions>(() => ({
        dpi,
        format,
        imageQuality
    }), [dpi, format, imageQuality]);

    /** The app's main workspace region — the rasterization target for
     *  the window / region screenshots (the INTERNAL IDE capture). */
    const rootRef = React.useRef<Element | null>(null);

    /** Mark a FRESH capture (bump the seq the automation effect reads). */
    const markFresh = React.useCallback(() => {
        captureSeqRef.current += 1;
        setCaptureSeq(captureSeqRef.current);
    }, []);

    /** Auto-name the deliverable from the shot's label + stamp — the
     *  optional ext override lets vector (.svg) shots name correctly. */
    const autoName = React.useCallback(
        (base: string, ext?: string) => {
            const safe = base.replace(/[^\w.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "shot";
            setSavePath(`${folderPrefix ? folderPrefix.replace(/\/+$/, "") + "/" : ""}${safe}-${stamp()}.${ext ?? extFor(format)}`);
        },
        [folderPrefix, format]
    );

    /** Region snip flow — fully INTERNAL to the IDE: hide this dialog, freeze the workspace
     * DOM into a self-contained SVG, show it as the frozen frame, and
     * let the user drag a scissors-style rectangle over it. No
     * getDisplayMedia, no OS permission prompt — and no canvas, so the
     * Chromium foreignObject taint rule cannot break the freeze.
     * Resolves null when the user cancels or the workspace cannot be
     * serialized. */
    const pickIdeRegion = React.useCallback(
        async (): Promise<{ x: number; y: number; w: number; h: number } | null> => {
            rootRef.current = rootRef.current ?? document.querySelector("[data-screenshot-root]");
            const root = rootRef.current;
            if (!root) return null;
            // 1. Hide THIS dialog so the frozen frame shows the bare IDE.
            setSnipPreparing(true);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            try {
                // 2. Freeze the workspace at its on-screen size (SVG raster).
                const raster = await rasterizeDomToSvg(root);
                const rootRect = root.getBoundingClientRect();
                // Remember the raster + its box for the confirm-side crop.
                snipSourceRef.current = raster;
                snipRootRectRef.current = {
                    left: rootRect.left,
                    top: rootRect.top,
                    width: rootRect.width,
                    height: rootRect.height,
                };
                // 3. Show the frozen frame + the drag overlay; await the rect.
                const rect = await new Promise<{ x: number; y: number; w: number; h: number } | null>(
                    (resolve) => {
                        setSnipPreparing(false);
                        setSnip({raster, rootRect: snipRootRectRef.current!, resolve});
                    }
                );
                return rect;
            } catch {
                setSnipPreparing(false);
                return null;
            }
        },
        []
    );

    const onSnipConfirm = React.useCallback(
        (rect: { x: number; y: number; w: number; h: number }) => {
            setSnip((s) => {
                s?.resolve(rect);
                return null;
            });
        },
        []
    );

    const onSnipCancel = React.useCallback(() => {
        setSnip((s) => {
            s?.resolve(null);
            return null;
        });
    }, []);

    /** The classic text-selection screenshot (the pre-region fallback
     *  when the IDE raster fails and no frame could be frozen). */
    const captureTextSelection = React.useCallback(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString() : "";
        if (!text.trim()) {
            toast({
                title: "Nothing to screenshot",
                description:
                    "The IDE region could not be frozen and no text is selected — drag a region on the frozen frame (recommended) or select text in the viewer first.",
                variant: "destructive",
            });
            return null;
        }
        const spec = getCodeSpec();
        // Locate the selected line window inside the file when the
        // selection came from the viewer itself.
        let startLine = 1;
        let autoCaption = "Selection";
        if (spec && spec.content.includes(text.split("\n")[0] ?? "\u0000")) {
            const lines = spec.content.split("\n");
            const first = text.split("\n")[0] ?? "";
            const idx = lines.findIndex((l) => l === first);
            if (idx >= 0) {
                startLine = idx + 1;
                autoCaption = `Lines ${idx + 1}–${idx + text.split("\n").length}`;
            }
        }
        const png = renderCodeToPng({
            content: text.replace(/\n$/, ""),
            fileName: spec?.fileName ?? "Selection",
            languageLabel: spec?.languageLabel,
            startLine,
            lineNumbers,
            caption: caption || autoCaption,
            dpi,
            format,
            theme: resolveShotTheme(),
            showHeader,
            showFooter,
            imageQuality,
            watermark: watermark || undefined,
        });
        setShot({
            ...png,
            label: "Screenshot: selected text",
            detail: `${autoCaption} — ${text.split("\n").length.toLocaleString()} lines`,
            spec: {
                content: text.replace(/\n$/, ""),
                fileName: spec?.fileName ?? "Selection",
                languageLabel: spec?.languageLabel,
                startLine,
                lineNumbers,
                caption: caption || autoCaption,
                dpi,
                format,
                theme: resolveShotTheme(),
                showHeader,
                showFooter,
                imageQuality,
                watermark: watermark || undefined,
            },
        });
        markFresh();
        setSavedTo(null);
        setCopied(false);
        autoName("selection");
        return png;
    }, [getCodeSpec, lineNumbers, toast, dpi, format, caption, watermark, markFresh, autoName, resolveShotTheme, showHeader, showFooter, imageQuality]);

    /* PANE shots. A pane (the editor surface or the
     * bottom Output/Terminal panel) is cropped out of the workspace DOM
     * raster automatically: resolve the pane element page.tsx tags with
     * `data-shot-pane="editor" | "bottom"`, map its viewport rect into
     * the workspace root's coordinate space, and rasterize with that
     * crop. PNG where the browser allows exporting the foreignObject
     * raster; the self-contained vector SVG otherwise (same delivery
     * ladder as the window shot). Returns false when the pane is not
     * currently visible (hidden bottom panel / no workspace) — the caller
     * already showed the explaining toast. */
    const capturePane = React.useCallback(
        async (pane: "editor" | "bottom"): Promise<boolean> => {
            rootRef.current = rootRef.current ?? document.querySelector("[data-screenshot-root]");
            const root = rootRef.current;
            if (!root) {
                toast({
                    title: "Screenshot failed",
                    description: "The workspace region is not available for a screenshot right now.",
                    variant: "destructive",
                });
                return false;
            }
            const paneEl = root.querySelector(`[data-shot-pane="${pane}"]`);
            if (!paneEl) {
                toast({
                    title: pane === "bottom" ? "The bottom panel is hidden" : "The editor pane is not available",
                    description:
                        pane === "bottom"
                            ? "Open the bottom panel first (View ▸ Toggle bottom panel / ⌘J), pick the tab you want (Output, Terminal, Notes…), then shoot."
                            : "Open a file first — the editor pane renders whatever viewer is active.",
                    variant: "destructive",
                });
                return false;
            }
            const paneRect = (paneEl as HTMLElement).getBoundingClientRect();
            const rootRect = root.getBoundingClientRect();
            if (paneRect.width < 8 || paneRect.height < 8) {
                toast({
                    title: "Screenshot failed",
                    description: "That pane is too small to shoot — enlarge it and try again.",
                    variant: "destructive",
                });
                return false;
            }
            const crop = {
                x: Math.max(0, paneRect.left - rootRect.left),
                y: Math.max(0, paneRect.top - rootRect.top),
                w: Math.min(paneRect.width, rootRect.width),
                h: Math.min(paneRect.height, rootRect.height),
            };
            const raster = await rasterizeDomToSvg(root, {crop});
            const png = await trySvgToPng(raster, encodeOpts);
            const label = pane === "editor" ? "editor pane" : "bottom panel";
            if (png) {
                setShot({
                    ...png,
                    label: `Screenshot: ${label}`,
                    detail: `${label === "editor pane" ? "The editor/viewer pane" : "The Output / Terminal panel"} cropped from the live DOM — ${Math.round(paneRect.width)}×${Math.round(paneRect.height)} px on screen · ${dpi} DPI · ${format.toUpperCase()}`,
                    retake: pane,
                });
            } else {
                setShot({
                    dataUrl: svgDataUrl(raster.text),
                    width: raster.width,
                    height: raster.height,
                    bytes: raster.text.length,
                    label: `Screenshot: ${label} (vector)`,
                    detail: `${label} serialized from the live DOM — ${Math.round(paneRect.width)}×${Math.round(paneRect.height)} px on screen · self-contained SVG (vector)`,
                    retake: pane,
                    vector: {text: raster.text},
                });
            }
            markFresh();
            autoName(pane === "editor" ? "editor-pane" : "bottom-panel", png ? undefined : "svg");
            return true;
        },
        [toast, dpi, format, encodeOpts, markFresh, autoName]
    );

    /* ELEMENT shots — a generalization of the pane capture: rasterize
     * ANY live DOM element (the Explorer sidebar, the app shell, an open
     * dialog) directly — the element itself is the rasterization root,
     * so no crop math is needed. PNG where the browser allows exporting
     * the foreignObject raster; the self-contained vector SVG otherwise
     * (same delivery ladder as the window shot). Returns false when the
     * element is missing/too small — the caller already toasted. */
    const captureElement = React.useCallback(
        async (
            el: Element,
            label: string,
            fileBase: string,
            retake: ScreenshotMode,
            detailLead: string
        ): Promise<boolean> => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8) {
                toast({
                    title: "Screenshot failed",
                    description: "That surface is too small to shoot — enlarge it and try again.",
                    variant: "destructive",
                });
                return false;
            }
            const raster = await rasterizeDomToSvg(el);
            const png = await trySvgToPng(raster, encodeOpts);
            if (png) {
                setShot({
                    ...png,
                    label: `Screenshot: ${label}`,
                    detail: `${detailLead} — ${Math.round(rect.width)}×${Math.round(rect.height)} px on screen · ${dpi} DPI · ${format.toUpperCase()}`,
                    retake,
                });
            } else {
                setShot({
                    dataUrl: svgDataUrl(raster.text),
                    width: raster.width,
                    height: raster.height,
                    bytes: raster.text.length,
                    label: `Screenshot: ${label} (vector)`,
                    detail: `${detailLead} — serialized from the live DOM · self-contained SVG (vector)`,
                    retake,
                    vector: {text: raster.text},
                });
            }
            markFresh();
            autoName(fileBase, png ? undefined : "svg");
            return true;
        },
        [toast, dpi, format, encodeOpts, markFresh, autoName]
    );

    const runCapture = React.useCallback(
        async (mode: ScreenshotMode) => {
            setBusy(true);
            setSavedTo(null);
            setCopied(false);
            try {
                /* PANE shots: the editor/viewer surface or the bottom
                 * Output/Terminal panel, cropped out of the workspace
                 * raster automatically — no drag needed, no surrounding chrome.
                 * Falls back to the vector SVG delivery when Chromium taints
                 * the PNG path; capturePane toasts when the pane is hidden. */
                if (mode === "editor" || mode === "bottom") {
                    await capturePane(mode === "editor" ? "editor" : "bottom");
                    return;
                }
                /* SIDEBAR shot — the Explorer sidebar (folders, recent files,
                 * data files) rasterized on its own, straight from the DOM. */
                if (mode === "sidebar") {
                    const el = document.querySelector('[data-tutorial="sidebar"]');
                    if (!el || el.getClientRects().length === 0) {
                        toast({
                            title: "The Explorer sidebar is hidden",
                            description: "Show it first (View ▸ Toggle sidebar / ⌘B, or widen the window past the lg breakpoint), then shoot.",
                            variant: "destructive",
                        });
                        return;
                    }
                    await captureElement(el, "sidebar (Explorer)", "explorer-sidebar", "sidebar", "The Explorer sidebar (tree, recents, data files) rasterized from the live DOM");
                    return;
                }
                /* APP shot — the WHOLE IDE shell: menu bar + sidebar + editor +
                 * bottom panel, everything except portaled dialogs and toasts. */
                if (mode === "app") {
                    const el = document.querySelector("[data-shot-app-shell]");
                    if (!el) {
                        toast({
                            title: "Screenshot failed",
                            description: "The app shell is not available for a screenshot right now.",
                            variant: "destructive",
                        });
                        return;
                    }
                    await captureElement(el, "app (full IDE)", "praxis-app", "app", "The full IDE — menu bar, Explorer, editor and bottom panel — rasterized from the live DOM");
                    return;
                }
                /* DIALOG shot — the topmost OTHER open dialog (Settings, Export,
                 * Diff, AI chat…). The composer itself is skipped via its
                 * data-shot-composer tag; the dialog's own subtree rasterizes,
                 * so the dimming overlay behind it never darkens the shot. */
                if (mode === "dialog") {
                    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
                        (d) => d.getClientRects().length > 0 && !(d as HTMLElement).closest('[data-shot-composer="true"]')
                    );
                    const top = dialogs[dialogs.length - 1];
                    if (!top) {
                        toast({
                            title: "No dialog is open",
                            description: "Open a dialog first — Settings (⌘,), Export, Diff, AI chat, workbenches… — keep it open, then shoot. The composer hides nothing: both stay open together.",
                            variant: "destructive",
                        });
                        return;
                    }
                    const title = top.querySelector("h2, [data-slot=dialog-title], [aria-label]")?.textContent?.trim();
                    await captureElement(top, `dialog${title ? ` — ${title.slice(0, 40)}` : ""}`, "dialog", "dialog", "The topmost open dialog rasterized from the live DOM");
                    return;
                }
                /* NEW MODE — “Selection”: the current TEXT selection as a
                 * code shot (the classic fallback flow, now a first-class
                 * capture kind). */
                if (mode === "selection-text") {
                    captureTextSelection();
                    return;
                }
                /* NEW MODE — “Lines”: a from–to line RANGE of the open
                 * file rendered like a whole-file shot (own startLine + a
                 * lines caption). The inputs live in the compose groups. */
                if (mode === "range") {
                    const spec = getCodeSpec();
                    if (!spec) {
                        toast({
                            title: "No file for a line-range shot",
                            description: "Open a text file first — the range renders exactly those lines.",
                            variant: "destructive",
                        });
                        return;
                    }
                    const all = spec.content.split("\n");
                    const total = all.length;
                    const first = Math.max(1, Math.min(total, Math.round(rangeFrom)));
                    const last = Math.max(first, Math.min(total, Math.round(rangeTo)));
                    const slice = all.slice(first - 1, last).join("\n");
                    const rangeSpec: CodeShotSpec = {
                        content: slice,
                        fileName: spec.fileName,
                        languageLabel: spec.languageLabel,
                        startLine: first,
                        lineNumbers,
                        caption: caption || `Lines ${first}–${last} of ${total}`,
                        dpi,
                        format,
                        theme: resolveShotTheme(),
                        showHeader,
                        showFooter,
                        imageQuality,
                        watermark: watermark || undefined,
                    };
                    const png = renderCodeToPng(rangeSpec);
                    setShot({
                        ...png,
                        label: "Screenshot: line range",
                        detail: `${spec.fileName} — lines ${first}–${last} of ${total} · ${dpi} DPI · ${format.toUpperCase()}`,
                        spec: rangeSpec,
                        retake: "range",
                    });
                    markFresh();
                    autoName(`${spec.fileName.replace(/\.[^.]+$/, "")}-lines-${first}-${last}`);
                    return;
                }
                if (mode === "code") {
                    const spec = getCodeSpec();
                    if (!spec) {
                        toast({
                            title: "No code to screenshot",
                            description: "Open a text file (code, config, document) first — the code screenshot then renders the whole file into one image.",
                            variant: "destructive",
                        });
                        return;
                    }
                    const withOpts: CodeShotSpec = {
                        ...spec,
                        lineNumbers,
                        caption: caption || spec.caption,
                        dpi,
                        format,
                        theme: resolveShotTheme(),
                        showHeader,
                        showFooter,
                        imageQuality,
                        watermark: watermark || undefined,
                    };
                    const png = renderCodeToPng(withOpts);
                    setShot({
                        ...png,
                        label: "Screenshot: code",
                        detail: `${spec.fileName} — ${spec.content.split("\n").length.toLocaleString()} lines`,
                        spec: withOpts,
                        retake: "code",
                    });
                    markFresh();
                    autoName(spec.fileName.replace(/\.[^.]+$/, ""));
                    return;
                }
                if (mode === "selection") {
                    // INTERNAL scissors-style region pick over a frozen frame of
                    // the IDE's own workspace (no OS screen picker — the user's
                    // "capture a region inside the IDE not inside the PC").
                    // Falls back to the classic text-lines screenshot when the
                    // freeze fails (or the user dismisses it with nothing
                    // selected).
                    const rect = await pickIdeRegion();
                    if (rect) {
                        const source = snipSourceRef.current;
                        const rootRect = snipRootRectRef.current;
                        const rootEl = rootRef.current;
                        if (source && rootRect && rootEl) {
                            // The drag rect is in VIEWPORT px; the frozen frame maps
                            // the workspace root's box 1:1 (same width/height), so
                            // offset + scale by that box, clamping the rect into it.
                            const sx = source.width / Math.max(1, rootRect.width);
                            const sy = source.height / Math.max(1, rootRect.height);
                            // Clip the drag rect to the workspace box first.
                            const cx0 = Math.max(rootRect.left, Math.min(rootRect.left + rootRect.width, rect.x));
                            const cy0 = Math.max(rootRect.top, Math.min(rootRect.top + rootRect.height, rect.y));
                            const cx1 = Math.max(cx0, Math.min(rootRect.left + rootRect.width, rect.x + rect.w));
                            const cy1 = Math.max(cy0, Math.min(rootRect.top + rootRect.height, rect.y + rect.h));
                            if (cx1 - cx0 >= 2 && cy1 - cy0 >= 2) {
                                const crop = {
                                    x: Math.max(0, (cx0 - rootRect.left) * sx),
                                    y: Math.max(0, (cy0 - rootRect.top) * sy),
                                    w: Math.max(1, (cx1 - cx0) * sx),
                                    h: Math.max(1, (cy1 - cy0) * sy),
                                };
                                // 1. PNG attempt — browsers that allow exporting
                                //    foreignObject rasters (Firefox) get a pixel PNG.
                                const cropped = await rasterizeDomToSvg(rootEl, {crop});
                                const png = await trySvgToPng(cropped, encodeOpts);
                                if (png) {
                                    setShot({
                                        ...png,
                                        label: "Screenshot: region",
                                        detail: `Snipped region of the IDE workspace — ${Math.round(cx1 - cx0)}×${Math.round(cy1 - cy0)} px on screen · ${dpi} DPI · ${format.toUpperCase()}`,
                                        retake: "selection",
                                    });
                                    markFresh();
                                    autoName("region");
                                    return;
                                }
                                // 2. Region over CODE — render exactly those lines with
                                //    the canvas code renderer (a TRUE PNG at the
                                //    configured DPI/format/theme; Chromium's taint rule
                                //    can't touch text drawn natively on canvas).
                                const spec = getCodeSpec();
                                const surface = spec ? codeSurfaceFromRect(rect) : null;
                                const lines = spec && surface ? linesFromPreRect(surface.preRect, rect, spec.content.split("\n").length) : null;
                                if (spec && lines) {
                                    const allLines = spec.content.split("\n");
                                    const slice = allLines.slice(lines.first - 1, lines.last).join("\n");
                                    const lineSpec: CodeShotSpec = {
                                        content: slice,
                                        fileName: spec.fileName,
                                        languageLabel: spec.languageLabel,
                                        startLine: lines.first,
                                        lineNumbers,
                                        caption: caption || `Lines ${lines.first}–${lines.last}`,
                                        dpi,
                                        format,
                                        theme: resolveShotTheme(),
                                        showHeader,
                                        showFooter,
                                        imageQuality,
                                        watermark: watermark || undefined,
                                    };
                                    const png2 = renderCodeToPng(lineSpec);
                                    setShot({
                                        ...png2,
                                        label: "Screenshot: region (code lines)",
                                        detail: `Region over the editor — rendered ${lines.last - lines.first + 1} lines (${lines.first}–${lines.last}) at ${dpi} DPI · ${format.toUpperCase()}`,
                                        spec: lineSpec,
                                        retake: "selection",
                                    });
                                    markFresh();
                                    autoName("region");
                                    return;
                                }
                                // 3. Vector delivery — the cropped SVG (Chromium: the
                                //    foreignObject canvas taint makes PNG impossible;
                                //    the self-contained SVG keeps FULL fidelity, scales
                                //    infinitely and saves/downloads as .svg).
                                setShot({
                                    dataUrl: svgDataUrl(cropped.text),
                                    width: cropped.width,
                                    height: cropped.height,
                                    bytes: cropped.text.length,
                                    label: "Screenshot: region (vector)",
                                    detail: `Snipped region of the IDE workspace — ${Math.round(cx1 - cx0)}×${Math.round(cy1 - cy0)} px on screen · self-contained SVG (vector)`,
                                    retake: "selection",
                                    vector: {text: cropped.text},
                                });
                                markFresh();
                                autoName("region", "svg");
                                return;
                            }
                        }
                    }
                    // Fallback: text lines (also handles "user cancelled the
                    // snip but HAS a text selection open" gracefully).
                    captureTextSelection();
                    return;
                }
                // mode === "window" — the IDE's OWN workspace, serialized
                // from the live DOM (the internal capture; no OS window
                // picker, no getDisplayMedia prompt). PNG where the browser
                // allows exporting the raster; vector SVG otherwise.
                rootRef.current = rootRef.current ?? document.querySelector("[data-screenshot-root]");
                const root = rootRef.current;
                if (!root) {
                    toast({
                        title: "Screenshot failed",
                        description: "The workspace region is not available for a screenshot right now.",
                        variant: "destructive",
                    });
                    return;
                }
                const raster = await rasterizeDomToSvg(root);
                const png = await trySvgToPng(raster, encodeOpts);
                if (png) {
                    setShot({
                        ...png,
                        label: "Screenshot: window (IDE)",
                        detail: `The IDE's workspace rasterized from the live DOM — ${raster.width}×${raster.height} px · ${dpi} DPI · ${format.toUpperCase()}`,
                        retake: "window",
                    });
                } else {
                    setShot({
                        dataUrl: svgDataUrl(raster.text),
                        width: raster.width,
                        height: raster.height,
                        bytes: raster.text.length,
                        label: "Screenshot: window (IDE · vector)",
                        detail: `The IDE's workspace serialized from the live DOM — ${raster.width}×${raster.height} px · self-contained SVG (vector)`,
                        retake: "window",
                        vector: {text: raster.text},
                    });
                }
                markFresh();
                autoName("window", png ? undefined : "svg");
            } catch (err) {
                toast({
                    title: "Screenshot failed",
                    description: (err as Error).message ?? "The screenshot could not be produced.",
                    variant: "destructive",
                });
            } finally {
                setBusy(false);
            }
        },
        [getCodeSpec, lineNumbers, caption, toast, dpi, format, encodeOpts, pickIdeRegion, captureTextSelection, capturePane, captureElement, markFresh, autoName, resolveShotTheme, showHeader, showFooter, watermark, imageQuality, rangeFrom, rangeTo]
    );

    // Fire the pending screenshot as the dialog opens.
    React.useEffect(() => {
        if (open && pendingMode) {
            const mode = pendingMode;
            onPendingModeConsumed();
            void runCapture(mode);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pendingMode]);

    // ── LIVE RE-COMPOSE: quality / format / line numbers / caption /
    //    header-footer chrome changes re-render or re-encode the CURRENT
    //    shot immediately. VECTOR shots skip this — DPI / format are PNG
    //    concepts; the SVG is resolution-independent already.
    React.useEffect(() => {
        if (!shot || shot.vector) return;
        if (shot.spec) {
            const withOpts: CodeShotSpec = {
                ...shot.spec,
                lineNumbers,
                caption: caption || shot.spec.caption,
                dpi,
                format,
                theme: resolveShotTheme(),
                showHeader,
                showFooter,
                imageQuality,
                watermark: watermark || undefined,
            };
            const png = renderCodeToPng(withOpts);
            setShot((prev) => (prev ? {...prev, ...png, spec: withOpts} : prev));
            setSavePath((p) => p.replace(/\.(png|jpg|jpeg|webp)$/i, `.${extFor(format)}`));
            return;
        }
        if (shot.sourceCanvas) {
            const out = resampleCanvasToDpi(shot.sourceCanvas, {dpi, format, imageQuality});
            setShot((prev) => (prev ? {...prev, ...out} : prev));
            setSavePath((p) => p.replace(/\.(png|jpg|jpeg|webp)$/i, `.${extFor(format)}`));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dpi, format, imageQuality, lineNumbers, caption, resolveShotTheme, showHeader, showFooter, watermark]);

    const doDownload = React.useCallback(() => {
        if (!shot) return;
        const a = document.createElement("a");
        a.href = shot.dataUrl;
        const fallbackExt = shot.vector ? "svg" : extFor(format);
        a.download = (savePath || `Screenshots/praxis-${stamp()}.${fallbackExt}`).split("/").pop() ?? `praxis-${stamp()}.${fallbackExt}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, [shot, savePath, format]);

    const doCopy = React.useCallback(async () => {
        if (!shot) return;
        // The clipboard only accepts PNG images — vector shots can't go
        // there (render the region over code for a copyable PNG instead).
        if (shot.vector) {
            toast({
                title: "Copy needs a PNG",
                description:
                    "Vector captures can’t go to the clipboard (it only accepts PNG). Use Download or Save To File for the .svg, or drag the region over code — those render as PNG.",
                variant: "destructive",
            });
            return;
        }
        try {
            // The clipboard only accepts PNG — re-encode other formats on
            // the fly from the stored data URL.
            let pngUrl = shot.dataUrl;
            if (!pngUrl.startsWith("data:image/png")) {
                const img = new Image();
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error("re-encode failed"));
                    img.src = shot.dataUrl;
                });
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Canvas 2D context unavailable");
                ctx.drawImage(img, 0, 0);
                pngUrl = canvas.toDataURL("image/png");
            }
            const blob = await (await fetch(pngUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
            toast({
                title: "Copied to clipboard",
                description: "The image is on the clipboard (as PNG) — paste it anywhere."
            });
        } catch {
            toast({
                title: "Copy not available",
                description: "This browser blocks image clipboard writes — use Download or Save To File instead.",
                variant: "destructive",
            });
        }
    }, [shot, toast]);

    const doSave = React.useCallback(async () => {
        if (!shot) return;
        // Vector shots POST their SVG data URL; the path ends .svg (the
        // route accepts image/svg+xml for .svg paths).
        const dataUrl = shot.vector ? svgDataUrl(shot.vector.text) : shot.dataUrl;
        const path = shot.vector
            ? savePath.replace(/\.(png|jpg|jpeg|webp)$/i, ".svg")
            : savePath.replace(/\.svg$/i, `.${extFor(format)}`);
        setBusy(true);
        try {
            const res = await fetch("/api/screenshot-save", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path, dataUrl}),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
                toast({
                    title: "Save failed",
                    description: data?.error ?? `HTTP ${res.status}`,
                    variant: "destructive",
                });
                return;
            }
            setSavedTo(data.path as string);
            toast({
                title: "Screenshot saved",
                description: `Written to ${data.path} (relative: ${data.relPath}).`,
            });
        } catch (err) {
            toast({title: "Save failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusy(false);
        }
    }, [shot, savePath, format, toast]);

    // ── AFTER-CAPTURE AUTOMATION — when the remembered action is not
    //    "Ask", a FRESH capture triggers it exactly once (re-encodes of
    //    the same shot never re-fire it).
    React.useEffect(() => {
        if (!captureSeq || !shot) return;
        if (after === "copy") {
            // Vector shots can't be copied — deliver via download instead
            // (with the explanatory toast from doCopy).
            if (shot.vector) doDownload();
            else void doCopy();
        } else if (after === "save") void doSave();
        else if (after === "download") doDownload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captureSeq]);

    /* Step state for the strip: no shot → step 1; shot without delivery
     * yet → step 2; a save/copy/download happened → step 3. */
    const step = shot ? (savedTo || copied ? 3 : 2) : 1;
    const stepChip = (n: number, label: string, Icon: React.ComponentType<{ className?: string }>) => (
        <span
            className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors " +
                (step === n
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : step > n
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border bg-muted/30 text-muted-foreground")
            }
        >
      {step > n ? <Check className="size-3"/> : <Icon className="size-3"/>}
            {n}. {label}
    </span>
    );

    const modeCard = (
        mode: ScreenshotMode,
        Icon: React.ComponentType<{ className?: string }>,
        title: string,
        hint: string,
        accent: string
    ) => (
        <button
            type="button"
            disabled={busy}
            onClick={() => void runCapture(mode)}
            className="group flex w-full items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
            title={hint}
        >
            <Icon className={"mt-0.5 size-4 shrink-0 " + accent}/>
            <span className="min-w-0">
        <span className="block text-xs font-semibold">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{hint}</span>
      </span>
        </button>
    );

    return (
        <>
            {/* The scissors region picker — rendered ABOVE everything while a
          snip is running; the composer dialog itself stays UNMOUNTED so
          the frozen IDE frame never contains the composer. */}
            {snip ? (
                <RegionSnipOverlay frameUrl={snip.raster.url} rootRect={snip.rootRect} onCancel={onSnipCancel}
                                   onConfirm={onSnipConfirm}/>
            ) : null}
            {/* While PREPARING the region freeze (dialog hidden, DOM
          rasterizing) show a small centered chip so the pause reads as
          intentional. */}
            {snipPreparing && !snip ? (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background/80">
                    <div
                        className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg">
                        <Loader2 className="size-3.5 animate-spin text-emerald-500"/>
                        Freezing the IDE…
                    </div>
                </div>
            ) : null}

            <Dialog open={open && !snip && !snipPreparing} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto"
                               data-shot-composer="true">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Aperture className="size-4 text-emerald-500"/>
                            Screenshot Composer
                        </DialogTitle>
                        <DialogDescription>
                            Pick what to shoot, compose the output, then deliver it — save into the project,
                            copy to the clipboard, or download.
                        </DialogDescription>
                        {/* The three-step strip — the composer's flow, always visible. */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
                            {stepChip(1, "Pick", Camera)}
                            <span className="text-muted-foreground/60 text-[10px]">→</span>
                            {stepChip(2, "Compose", SlidersHorizontal)}
                            <span className="text-muted-foreground/60 text-[10px]">→</span>
                            {stepChip(3, "Deliver", Send)}
                        </div>
                    </DialogHeader>

                    <div className="grid gap-3 lg:grid-cols-[190px_1fr]">
                        {/* ── 1. PICK — the mode rail (always available for retakes) ── */}
                        <div className="space-y-1.5">
                            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Pick a shot
                            </p>
                            {modeCard("window", Monitor, "Window", "The IDE's workspace, rasterized from the live DOM — no OS picker", "text-sky-500")}
                            {modeCard("app", AppWindow, "Full IDE", "The whole app shell — menu bar + Explorer + editor + bottom panel", "text-violet-500")}
                            {modeCard("editor", SquareCode, "Editor", "The editor/viewer pane alone — cropped from the workspace automatically, no chrome", "text-emerald-500")}
                            {modeCard("sidebar", PanelLeft, "Explorer", "The file-tree sidebar — folders, recents and data files, rasterized on its own", "text-sky-500")}
                            {modeCard("selection", Scissors, "Region", "Freeze the IDE, drag a rectangle — the scissors flow, fully internal", "text-amber-500")}
                            {modeCard("code", ImageIcon, "Code", "The whole open file rendered as one image (with line numbers)", "text-emerald-500")}
                            {/* Further capture kinds — the composer's rail grew from
                  three mechanisms to ten. */}
                            {modeCard("selection-text", TextCursorInput, "Selection", "The current TEXT selection rendered as a code shot — select lines in the viewer first", "text-violet-500")}
                            {modeCard("range", ListOrdered, "Lines", "A from–to line RANGE of the open file — set the window in the Line range compose group, then shoot", "text-rose-500")}
                            {/* The bottom Output / Terminal panel. */}
                            {modeCard("bottom", PanelBottom, "Panel", "The bottom panel (Output / Terminal / Notes…) cropped from the live DOM — open it first (⌘J)", "text-cyan-500")}
                            {/* The topmost OTHER open dialog (the composer is skipped). */}
                            {modeCard("dialog", Layers, "Dialog", "The topmost open dialog — Settings, Export, Diff, AI chat… — rasterized with its own chrome", "text-amber-500")}
                            {shot && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-full gap-1.5 text-[11px]"
                                    disabled={busy}
                                    onClick={() => void runCapture(shot.retake ?? (shot.spec ? "code" : "window"))}
                                    title="Retake the same kind of shot"
                                >
                                    <RefreshCw className="size-3"/> Retake
                                </Button>
                            )}
                            <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground">
                                <MousePointerSquareDashed className="mr-1 inline size-3 align-[-2px] text-amber-500"/>
                                Region freezes the IDE itself first (the capture stays inside the app — never the
                                PC screen); if the freeze fails, selected text lines are rendered instead.
                            </p>
                            <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground">
                                Ten capture kinds in all — window · full IDE · editor · Explorer · region · code ·
                                selection · lines · panel · dialog.
                            </p>
                        </div>

                        {/* ── 2/3. COMPOSE + DELIVER — the stage ── */}
                        <div className="min-w-0 space-y-3">
                            {/* The stage: checkerboard + contained preview. */}
                            {busy && !shot && (
                                <div
                                    className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 py-16 text-muted-foreground">
                                    <Loader2 className="size-6 animate-spin text-emerald-500"/>
                                    <p className="text-sm">Rendering the screenshot…</p>
                                </div>
                            )}
                            {!busy && !shot && (
                                <div
                                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 py-14 text-muted-foreground">
                                    <Camera className="size-7 text-muted-foreground/50"/>
                                    <p className="text-sm font-medium text-foreground">Nothing on the stage yet</p>
                                    <p className="max-w-sm text-center text-[11px] leading-snug">
                                        Pick one of the ten shot types on the left — the captured frame lands here and
                                        the compose settings apply live.
                                    </p>
                                </div>
                            )}
                            {shot && (
                                <>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      <Camera className="size-3 text-emerald-500"/> {shot.label}
                    </span>
                                        <span className="min-w-0 flex-1 truncate">{shot.detail}</span>
                                        <span
                                            className="tabular-nums">{shot.width}×{shot.height}px · {prettyBytes(shot.bytes)}</span>
                                    </div>
                                    {/* Checkerboard stage — transparency-friendly, like image editors. */}
                                    <div
                                        className="rounded-xl border p-2 max-h-[38vh] overflow-auto"
                                        style={{
                                            backgroundColor: "rgba(128,128,128,0.12)",
                                            backgroundImage:
                                                "linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%)",
                                            backgroundSize: "16px 16px",
                                            backgroundPosition: "0 0, 8px 8px",
                                        }}
                                    >
                                        <img
                                            src={shot.dataUrl}
                                            alt="The captured screenshot"
                                            className="w-full h-auto rounded-lg shadow-sm"
                                            draggable={false}
                                        />
                                    </div>
                                </>
                            )}

                            {/* ── COMPOSE groups — ALWAYS visible. They pre-configure the NEXT
shot and apply live to the current one; order runs
top-left to bottom-right: Quality → Format (+ lossy
quality) → Theme → Code-shot extras → After capture.
A vector shot on the stage simply ignores the raster
knobs (the note below explains). */}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <ComposeGroup icon={Crop} title="Quality"
                                              hint={shot && !shot.vector ? "Named levels — changes re-encode this shot live." : "Named pixel-density levels for the next shot."}>
                                    <Segmented
                                        ariaLabel="Storage quality"
                                        options={QUALITY_PRESETS.map((q) => ({
                                            value: q.dpi,
                                            label: q.label,
                                            hint: q.hint
                                        }))}
                                        value={dpi}
                                        onChange={(v) => setDpi(v)}
                                    />
                                    {/* CUSTOM DPI — any level between 72 and 600
                      that is not one of the presets (e.g. the 120 /
                      220 / 400 steps the settings select offers). */}
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">Custom</span>
                                        <Input
                                            type="number"
                                            min={72}
                                            max={600}
                                            step={1}
                                            value={dpi}
                                            onChange={(e) => setDpi(clampCustomDpi(parseInt(e.target.value, 10)))}
                                            className="h-7 w-24 text-xs tabular-nums"
                                            aria-label="Custom DPI between 72 and 600"
                                        />
                                        <span className="text-[10px] text-muted-foreground">DPI</span>
                                        {!KNOWN_DPIS.has(dpi) && (
                                            <span
                                                className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">custom level</span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        {QUALITY_PRESETS.find((q) => q.dpi === dpi)?.hint ?? `${dpi} DPI (custom)`}
                                    </p>
                                </ComposeGroup>
                                <ComposeGroup icon={Download} title="Format" hint="What Save and Download write.">
                                    <Segmented
                                        ariaLabel="File format"
                                        options={FORMAT_CHOICES.map((f) => ({
                                            value: f.value,
                                            label: f.label,
                                            hint: f.hint
                                        }))}
                                        value={format}
                                        onChange={(v) => setFormat(v)}
                                    />
                                    {format !== "png" && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <Input
                                                type="range"
                                                min={50}
                                                max={100}
                                                step={1}
                                                value={Math.round(imageQuality * 100)}
                                                onChange={(e) => setImageQuality(parseInt(e.target.value, 10) / 100)}
                                                className="h-6 p-0 flex-1 acc-[color:var(--primary)]"
                                                aria-label="JPEG or WebP quality percent"
                                            />
                                            <span
                                                className="text-[10px] tabular-nums w-8 text-right">{Math.round(imageQuality * 100)}%</span>
                                        </div>
                                    )}
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        {FORMAT_CHOICES.find((f) => f.value === format)?.hint}
                                        {format !== "png" ? ` · quality ${Math.round(imageQuality * 100)}%` : " · clipboard always pastes PNG"}
                                    </p>
                                </ComposeGroup>
                                <ComposeGroup icon={Palette} title="Theme"
                                              hint="Palette of the rendered code shots — remembered, defaults live in Settings → Capture.">
                                    <Select
                                        value={shotTheme === "light" || shotTheme === "dark" ? (shotTheme === "light" ? "one-light" : "one-dark") : shotTheme}
                                        onValueChange={(v) => setShotTheme(v)}
                                    >
                                        <SelectTrigger className="h-8 text-xs w-full" aria-label="Shot theme">
                                            <SelectValue/>
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            <SelectItem value="auto" className="text-xs">Auto — follow the app
                                                theme</SelectItem>
                                            {SHOT_PALETTES.map((p) => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span
                                className="inline-block size-3 rounded-sm border border-foreground/10"
                                style={{backgroundColor: p.palette.bg}}
                                aria-hidden="true"
                            />
                              {p.label}
                          </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        {shotTheme === "auto"
                                            ? "Follows the app theme at shot time"
                                            : `${(shotTheme === "light" || shotTheme === "dark" ? shotPaletteById(shotTheme === "light" ? "one-light" : "one-dark") : shotPaletteById(shotTheme)).label} — applied to code shots`}
                                    </p>
                                </ComposeGroup>
                                {shot?.spec && !shot.vector && (
                                    <ComposeGroup icon={Hash} title="Code shot"
                                                  hint="Applies to code / text rendering — every change re-renders the current shot live.">
                                        <div className="flex h-8 items-center gap-2">
                                            <Switch id="shot-line-numbers" checked={lineNumbers}
                                                    onCheckedChange={setLineNumbers}
                                                    aria-label="Line numbers on the code shot"/>
                                            <Label htmlFor="shot-line-numbers"
                                                   className="text-[11px] font-normal text-muted-foreground">
                                                Line numbers
                                            </Label>
                                        </div>
                                        <div className="mt-1.5">
                                            <Input
                                                value={caption}
                                                onChange={(e) => setCaption(e.target.value)}
                                                placeholder="Caption shown under the header (optional)"
                                                className="h-8 text-xs"
                                                aria-label="Custom caption for the code shot"
                                            />
                                        </div>
                                    </ComposeGroup>
                                )}
                                {/* CHROME — header / footer strips of code shots.
                    The footer toggle also hides the watermark; the
                    header toggle drops the traffic-dot bar (pure code
                    image). Applies live via the re-render effect.
                    The WATERMARK is editable — empty = the
                    classic "Praxis — Theory into practice". */}
                                <ComposeGroup icon={Aperture} title="Chrome"
                                              hint="Decorative strips on code shots — toggling re-renders the current shot live.">
                                    <div className="flex h-8 items-center gap-2">
                                        <Switch id="shot-header" checked={showHeader} onCheckedChange={setShowHeader}
                                                aria-label="Filename header strip on the code shot"/>
                                        <Label htmlFor="shot-header"
                                               className="text-[11px] font-normal text-muted-foreground">
                                            Header (traffic dots + file name)
                                        </Label>
                                    </div>
                                    <div className="mt-1 flex h-8 items-center gap-2">
                                        <Switch id="shot-footer" checked={showFooter} onCheckedChange={setShowFooter}
                                                aria-label="Footer note on the code shot"/>
                                        <Label htmlFor="shot-footer"
                                               className="text-[11px] font-normal text-muted-foreground">
                                            Footer (lines · chars + watermark)
                                        </Label>
                                    </div>
                                    <div className="mt-1.5">
                                        <Input
                                            value={watermark}
                                            onChange={(e) => setWatermark(e.target.value)}
                                            placeholder="Praxis — Theory into practice"
                                            className="h-8 text-xs"
                                            aria-label="Custom watermark in the code shot's footer"
                                            title="Custom text at the footer's right edge — empty uses the default Praxis watermark"
                                        />
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                            {watermark
                                                ? `Watermark: “${watermark}” — re-renders the current shot live.`
                                                : "Watermark: the default Praxis signature — type to replace it in the footer."}
                                        </p>
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        A minimal pure-code image: turn both off plus line numbers for just the code.
                                    </p>
                                </ComposeGroup>
                                {/* LINE RANGE — the window the “Lines” capture type
                    shoots; the Shoot button fires the range capture. */}
                                <ComposeGroup icon={ListOrdered} title="Line range"
                                              hint="For the Lines capture kind — renders exactly this window of the open file (1-based, inclusive).">
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={rangeFrom}
                                            onChange={(e) => setRangeFrom(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                            className="h-8 w-16 text-xs tabular-nums"
                                            aria-label="First line of the range shot"
                                        />
                                        <span className="text-[10px] text-muted-foreground">to</span>
                                        <Input
                                            type="number"
                                            min={rangeFrom}
                                            value={rangeTo}
                                            onChange={(e) => setRangeTo(Math.max(rangeFrom, parseInt(e.target.value, 10) || rangeFrom))}
                                            className="h-8 w-16 text-xs tabular-nums"
                                            aria-label="Last line of the range shot"
                                        />
                                        <Button
                                            size="sm"
                                            className="ml-auto h-8 gap-1 text-[11px]"
                                            disabled={busy}
                                            onClick={() => void runCapture("range")}
                                            title="Render lines rangeFrom–rangeTo as a code shot"
                                        >
                                            <ListOrdered className="size-3.5"/> Shoot range
                                        </Button>
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        Clamped to the open file — e.g. 1–40 for a quick excerpt of a long module.
                                    </p>
                                </ComposeGroup>
                                <ComposeGroup icon={Send} title="After capture"
                                              hint="Remembered — fires automatically on the next fresh shot.">
                                    <Segmented
                                        ariaLabel="After capture action"
                                        options={AFTER_CHOICES.map((a) => ({
                                            value: a.value,
                                            label: a.label,
                                            hint: a.hint
                                        }))}
                                        value={after}
                                        onChange={(v) => setAfter(v)}
                                    />
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                        {AFTER_CHOICES.find((a) => a.value === after)?.hint}
                                    </p>
                                </ComposeGroup>
                            </div>
                            {/* VECTOR shot note — Quality/Format are raster concepts;
                  the SVG is resolution-independent and always
                  saves/downloads as .svg. Code-line region shots and
                  full-code shots keep the full compose tooling above. */}
                            {shot && shot.vector && (
                                <div
                                    className="rounded-lg border bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                                    <Aperture className="mr-1 inline size-3.5 align-[-2px] text-violet-500"/>
                                    <strong className="text-foreground">Vector capture.</strong> Chromium can’t export
                                    the IDE’s DOM
                                    raster to PNG (canvas taint), so this shot is a self-contained <span
                                    className="font-mono">.svg</span> —
                                    it scales infinitely, saves and downloads with full fidelity. Regions dragged
                                    over <em>code</em>
                                    still render as real PNG (with Quality / Format / Theme) — drag over the editor for
                                    that.
                                </div>
                            )}

                            {/* ── DELIVER row (visible from the first shot) ── */}
                            {shot && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div
                                            className="flex h-8 items-center overflow-hidden rounded-md border text-xs">
                      <span
                          className="flex items-center gap-1 border-r bg-muted/40 px-2 text-[10px] text-muted-foreground">
                        <FolderInput className="size-3"/> Folder
                      </span>
                                            <input
                                                value={folderPrefix}
                                                onChange={(e) => setFolderPrefix(e.target.value)}
                                                placeholder="Screenshots"
                                                spellCheck={false}
                                                aria-label="Project folder to save into"
                                                className="h-full w-24 bg-transparent px-2 font-mono text-xs outline-none"
                                            />
                                        </div>
                                        <Input
                                            id="shot-save-path"
                                            value={savePath}
                                            onChange={(e) => setSavePath(e.target.value)}
                                            placeholder={`Screenshots/shot.${extFor(format)}`}
                                            className="font-mono text-xs h-8 min-w-[200px] flex-1"
                                            spellCheck={false}
                                            aria-label="Save into the project at"
                                        />
                                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void doSave()}
                                                disabled={busy}>
                                            {busy ? <Loader2 className="size-3.5 animate-spin"/> :
                                                <FolderInput className="size-3.5"/>}
                                            Save To File
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1.5 text-xs"
                                            onClick={() => void doCopy()}
                                            title="Copy the image to the clipboard (PNG)"
                                        >
                                            <ClipboardCopy className="size-3.5"/>
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1.5 text-xs"
                                            onClick={doDownload}
                                            title={`Download the ${format.toUpperCase()} via the browser`}
                                        >
                                            <Download className="size-3.5"/>
                                            Download
                                        </Button>
                                    </div>
                                    {savedTo && (
                                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-mono">
                                            <Check className="size-3"/> {savedTo}
                                        </p>
                                    )}
                                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                                        Quality resamples the stored raster (300 DPI ≈ 3.1× the on-screen pixels,
                                        embedded
                                        as density metadata); the filename is auto-named per shot and remembered with
                                        the
                                        other composer choices. Defaults also live in <span className="font-medium">Settings → Capture</span>.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
