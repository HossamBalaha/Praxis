"use client";

/**
 * tool-extra-media.tsx — the additional MEDIA-studio tools that lift the
 * five media categories to the 30-tool minimum (Audio Studio 9→30,
 * PDF Studio 17→30, Image → Text 8→30; the Image Studio +3 and Video
 * Studio +10 entries live inside their own factories in image-studio.tsx
 * and video-studio.tsx).
 *
 * Every tool here is a REAL browser operation:
 *   ▸ Audio — an OfflineAudioContext WebAudio graph (biquad filters,
 *     panner, compressor, delay with feedback) rendered offline faster
 *     than real time, then exported through lib/audio-ops' WAV encoder;
 *     post passes (reverse / silence-trim / loop / bit-crush) run on the
 *     rendered channels.
 *   ▸ PDF — pdf-lib (the same dynamic import the PDF studio uses):
 *     text stamps (headers/footers/bates/date) and page-set transforms.
 *   ▸ Image → Text — a canvas pass producing text artifacts
 *     (ASCII charsets, palettes, histograms, data URLs, markup builders).
 *
 * No network, no new npm dependencies.
 */

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {encodeWav} from "@/lib/audio-ops";
import {Download, Loader2, Music, Type as TypeIcon} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
 *  shared delivery (used by the audio + pdf engines)
 * ══════════════════════════════════════════════════════════════════ */

function downloadBlob(blob: Blob, filename: string, what: string): void {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    void what;
}

function Err({children}: { children: React.ReactNode }) {
    return <p className="text-xs text-red-600 dark:text-red-400">{children}</p>;
}

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

/* ══════════════════════════════════════════════════════════════════
 *  AUDIO — the effect engine + 21 tools (9 → 30)
 * ══════════════════════════════════════════════════════════════════ */

interface AudioFilterSpec {
    type: BiquadFilterType;
    freq: number;
    q?: number;
    gain?: number;
}

interface AudioFxSpec {
    id: string;
    label: string;
    hint: string;
    /** Biquad chain applied in order. */
    filters?: AudioFilterSpec[];
    /** Stereo pan (−1 … +1). */
    pan?: number;
    /** DynamicsCompressor for loudness tools. */
    compressor?: boolean;
    /** Output gain multiplier. */
    gain?: number;
    /** Echo: delay seconds + feedback (0…0.9). */
    delay?: { time: number; feedback: number };
    /** Down-mix to mono. */
    mono?: boolean;
    /** Post-render passes. */
    reverse?: boolean;
    silenceTrim?: { threshold: number; marginSec: number };
    loop?: number;
    bitCrush?: number;
    /** Re-render at this sample rate (22050 / 44100 / 48000). */
    sampleRate?: number;
}

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
    const raw = await file.arrayBuffer();
    const ctx = new AudioContext();
    try {
        return await ctx.decodeAudioData(raw);
    } finally {
        void ctx.close();
    }
}

async function renderAudioEffect(buffer: AudioBuffer, spec: AudioFxSpec): Promise<AudioBuffer> {
    const sr = spec.sampleRate ?? buffer.sampleRate;
    const OfflineCtor: typeof OfflineAudioContext =
        (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext ??
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const channels = spec.mono ? 1 : buffer.numberOfChannels;
    const length = Math.max(1, Math.ceil(buffer.length * (sr / buffer.sampleRate) * (spec.loop ?? 1) + (spec.delay ? spec.delay.time * sr * 4 : 0)));
    const ctx = new OfflineCtor(channels, length, sr);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    let node: AudioNode = src;
    for (const f of spec.filters ?? []) {
        const bi = ctx.createBiquadFilter();
        bi.type = f.type;
        bi.frequency.value = f.freq;
        if (f.q !== undefined) bi.Q.value = f.q;
        if (f.gain !== undefined) bi.gain.value = f.gain;
        node.connect(bi);
        node = bi;
    }
    if (spec.delay) {
        const d = ctx.createDelay(1.5);
        d.delayTime.value = Math.min(1.4, spec.delay.time);
        const fb = ctx.createGain();
        fb.gain.value = spec.delay.feedback;
        const wet = ctx.createGain();
        wet.gain.value = 0.8;
        node.connect(d);
        d.connect(fb);
        fb.connect(d);
        d.connect(wet);
        const dry = ctx.createGain();
        dry.gain.value = 1;
        node.connect(dry);
        const sum = ctx.createGain();
        dry.connect(sum);
        wet.connect(sum);
        node = sum;
    }
    if (spec.pan !== undefined) {
        const p = ctx.createStereoPanner();
        p.pan.value = spec.pan;
        node.connect(p);
        node = p;
    }
    if (spec.compressor) {
        const c = ctx.createDynamicsCompressor();
        c.threshold.value = -26;
        c.knee.value = 12;
        c.ratio.value = 4;
        c.attack.value = 0.004;
        c.release.value = 0.18;
        node.connect(c);
        node = c;
    }
    const out = ctx.createGain();
    out.gain.value = spec.gain ?? 1;
    node.connect(out);
    out.connect(ctx.destination);
    src.start();
    const rendered = await ctx.startRendering();
    return postProcess(rendered, spec);
}

function postProcess(buffer: AudioBuffer, spec: AudioFxSpec): AudioBuffer {
    let out = buffer;
    if (spec.reverse || spec.bitCrush !== undefined || spec.silenceTrim) {
        const chans: Float32Array[] = [];
        for (let c = 0; c < out.numberOfChannels; c++) chans.push(Float32Array.from(out.getChannelData(c)));
        if (spec.reverse) for (const ch of chans) ch.reverse();
        if (spec.bitCrush !== undefined && spec.bitCrush >= 2) {
            const steps = 2 ** spec.bitCrush - 1;
            for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] = Math.round((ch[i] + 1) * (steps / 2)) / (steps / 2) - 1;
        }
        if (spec.silenceTrim) {
            const {threshold, marginSec} = spec.silenceTrim;
            const margin = Math.floor(marginSec * out.sampleRate);
            const loud = (ch: Float32Array) => {
                for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > threshold) return i;
                return ch.length;
            };
            const first = Math.max(0, Math.min(...chans.map(loud)) - margin);
            const lastIdx = (ch: Float32Array) => {
                for (let i = ch.length - 1; i >= 0; i--) if (Math.abs(ch[i]) > threshold) return i + 1;
                return 0;
            };
            const last = Math.min(out.length, Math.max(...chans.map(lastIdx)) + margin);
            for (let c = 0; c < chans.length; c++) chans[c] = chans[c].slice(first, last);
            out = bufferFrom(chans, out.sampleRate);
        } else {
            out = bufferFrom(chans, out.sampleRate);
        }
    }
    if (spec.loop && spec.loop > 1) {
        const chans: Float32Array[] = [];
        for (let c = 0; c < out.numberOfChannels; c++) {
            const one = out.getChannelData(c);
            const big = new Float32Array(one.length * spec.loop);
            for (let i = 0; i < spec.loop; i++) big.set(one, i * one.length);
            chans.push(big);
        }
        out = bufferFrom(chans, out.sampleRate);
    }
    return out;
}

function bufferFrom(channels: Float32Array[], sampleRate: number): AudioBuffer {
    const ctx = new AudioContext();
    try {
        const buf = ctx.createBuffer(channels.length, Math.max(1, channels[0].length), sampleRate);
        channels.forEach((ch, i) => buf.copyToChannel(new Float32Array(ch), i));
        return buf;
    } finally {
        void ctx.close();
    }
}

function AudioFxTool({spec}: { spec: AudioFxSpec }) {
    const {toast} = useToast();
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [meta, setMeta] = React.useState<string | null>(null);
    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setMeta(null);
        setFile(e.target.files?.[0] ?? null);
    };
    const run = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const buffer = await decodeAudioFile(file);
            const out = await renderAudioEffect(buffer, spec);
            const chans: Float32Array[] = [];
            for (let c = 0; c < out.numberOfChannels; c++) chans.push(out.getChannelData(c));
            const wav = encodeWav(
                chans.map((ch) => new Float32Array(ch)),
                out.sampleRate
            );
            const blob = new Blob([wav as unknown as BlobPart], {type: "audio/wav"});
            const base = file.name.replace(/\.[^.]+$/, "");
            downloadBlob(blob, `${base}-${spec.id.replace(/^aud-/, "")}.wav`, "audio");
            setMeta(`${out.numberOfChannels} ch · ${out.sampleRate} Hz · ${out.duration.toFixed(2)} s rendered → WAV (${(wav.length / 1024).toFixed(0)} KB)`);
            toast({
                title: `${spec.label} rendered`,
                description: "The WAV downloaded from your browser.",
                variant: "success"
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-3 py-1">
            <Note>{spec.hint}</Note>
            <div className="flex items-center gap-3">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs">
                    <Music className="size-3.5 text-emerald-500"/>
                    {file ? file.name : "Pick an audio file"}
                    <input type="file" accept="audio/*" className="hidden" onChange={onPick}/>
                </label>
                <Button size="sm" className="h-8 text-xs" disabled={!file || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : <Download className="size-3.5"/>}
                    Render → WAV
                </Button>
            </div>
            {error && <Err>{error}</Err>}
            {meta && <Note>{meta}</Note>}
        </div>
    );
}

export function audioFxTool(id: string): React.ComponentType {
    const spec = AUDIO_FX_SPECS.find((s) => s.id === id);
    const C = function AudioFxEntry() {
        if (!spec) return <Note>Unknown tool.</Note>;
        return <AudioFxTool spec={spec}/>;
    };
    C.displayName = `AudioFx(${id})`;
    return C;
}

const AUDIO_FX_SPECS: AudioFxSpec[] = [
    {
        id: "aud-fx-bass",
        label: "Bass Boost",
        hint: "Low-shelf +6 dB below 120 Hz — warmer bottom end, rendered offline.",
        filters: [{type: "lowshelf", freq: 120, gain: 6}]
    },
    {
        id: "aud-fx-treble",
        label: "Treble Boost",
        hint: "High-shelf +6 dB above 6 kHz — brighter, airier top end.",
        filters: [{type: "highshelf", freq: 6000, gain: 6}]
    },
    {
        id: "aud-fx-loudness",
        label: "Loudness (compressor)",
        hint: "A 4:1 dynamics compressor with makeup gain — evens out the loud and quiet.",
        compressor: true,
        gain: 1.25
    },
    {
        id: "aud-fx-lowpass",
        label: "Low-Pass Filter",
        hint: "12 kHz low-pass — removes the harsh top hiss.",
        filters: [{type: "lowpass", freq: 12000, q: 0.8}]
    },
    {
        id: "aud-fx-highpass",
        label: "High-Pass Filter",
        hint: "80 Hz high-pass — removes rumble and DC offset.",
        filters: [{type: "highpass", freq: 80, q: 0.8}]
    },
    {
        id: "aud-fx-bandpass",
        label: "Band-Pass (1 kHz)",
        hint: "A Q=1 band-pass centered at 1 kHz — hear only the mids.",
        filters: [{type: "bandpass", freq: 1000, q: 1}]
    },
    {
        id: "aud-fx-hum",
        label: "Mains Hum Removal",
        hint: "Two notches at 50 and 60 Hz (Q=25) — kills ground-loop hum.",
        filters: [{type: "notch", freq: 50, q: 25}, {type: "notch", freq: 60, q: 25}]
    },
    {
        id: "aud-fx-telephone",
        label: "Telephone Filter",
        hint: "The classic 300-3400 Hz telephone band — band-limit + a touch of drive.",
        filters: [{type: "highpass", freq: 300, q: 0.7}, {type: "lowpass", freq: 3400, q: 0.7}, {
            type: "peaking",
            freq: 1800,
            q: 1.2,
            gain: 6
        }],
        gain: 1.6
    },
    {
        id: "aud-fx-night",
        label: "Night Mode",
        hint: "8 kHz low-pass + gentle compression — the late-night listening curve.",
        filters: [{type: "lowpass", freq: 8000, q: 0.7}],
        compressor: true,
        gain: 1.1
    },
    {
        id: "aud-fx-echo",
        label: "Echo (feedback)",
        hint: "250 ms delay with 35% feedback — the canyon echo.",
        delay: {time: 0.25, feedback: 0.35}
    },
    {
        id: "aud-fx-slapback",
        label: "Slapback Delay",
        hint: "120 ms delay, 15% feedback, mostly dry — the rockabilly slap.",
        delay: {time: 0.12, feedback: 0.15}
    },
    {
        id: "aud-fx-mono",
        label: "Mono Down-Mix",
        hint: "Every channel folded to one — the compatibility check.",
        mono: true
    },
    {id: "aud-fx-pan-l", label: "Pan Left", hint: "Hard-ish left pan (−0.8).", pan: -0.8},
    {id: "aud-fx-pan-r", label: "Pan Right", hint: "Hard-ish right pan (+0.8).", pan: 0.8},
    {
        id: "aud-fx-vocal",
        label: "Vocal Presence",
        hint: "A +6 dB peak at 2.5 kHz — voices step forward.",
        filters: [{type: "peaking", freq: 2500, q: 1, gain: 6}]
    },
    {
        id: "aud-fx-deesser",
        label: "De-Esser",
        hint: "A −6 dB peak at 6 kHz — tames the sibilant “s” spikes.",
        filters: [{type: "peaking", freq: 6000, q: 2, gain: -6}]
    },
    {
        id: "aud-fx-reverse",
        label: "Reverse Audio",
        hint: "Plays the buffer backwards — the hidden-message check.",
        reverse: true
    },
    {
        id: "aud-fx-silence",
        label: "Silence Trimmer",
        hint: "Cuts leading/trailing near-silence (below −40 dB) with a 50 ms margin.",
        silenceTrim: {threshold: 0.01, marginSec: 0.05}
    },
    {id: "aud-fx-loop", label: "Loop ×3", hint: "Repeats the clip three times — the loop point check.", loop: 3},
    {
        id: "aud-fx-crush",
        label: "Bit-Crusher",
        hint: "Quantizes samples to 6 bits — the lo-fi chip-music crunch.",
        bitCrush: 6
    },
    {
        id: "aud-fx-22k",
        label: "Resample 22.05 kHz",
        hint: "Re-renders at 22,050 Hz — the telephone-era bandwidth ceiling.",
        sampleRate: 22050
    },
];

/* ══════════════════════════════════════════════════════════════════
 *  PDF — the stamp + page-set engines + 13 tools (17 → 30)
 * ══════════════════════════════════════════════════════════════════ */

type PDFLib = Awaited<typeof import("pdf-lib")>;

async function loadPdfLib(): Promise<PDFLib> {
    return import("pdf-lib");
}

async function loadPdfFile(file: File): Promise<{ lib: PDFLib; doc: import("pdf-lib").PDFDocument }> {
    const lib = await loadPdfLib();
    const bytes = await file.arrayBuffer();
    const doc = await lib.PDFDocument.load(bytes, {ignoreEncryption: true});
    return {lib, doc};
}

interface PdfStampSpec {
    id: string;
    label: string;
    hint: string;
    /** Where the stamp lands. */
    position: "footer-center" | "header-center" | "footer-right" | "header-right";
    /** Literal text; {n} = page number, {total}, {date} = YYYY-MM-DD. */
    text: string;
    size: number;
    color: [number, number, number];
    startAt?: number;
}

function PdfStampTool({spec}: { spec: PdfStampSpec }) {
    const {toast} = useToast();
    const [file, setFile] = React.useState<File | null>(null);
    const [text, setText] = React.useState(spec.text);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const run = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const {lib, doc} = await loadPdfFile(file);
            const pages = doc.getPages();
            const date = new Date().toISOString().slice(0, 10);
            pages.forEach((page, i) => {
                const {width, height} = page.getSize();
                const label = text
                    .replace(/\{n\}/g, String((spec.startAt ?? 1) + i))
                    .replace(/\{total\}/g, String(pages.length))
                    .replace(/\{date\}/g, date)
                    .replace(/BATES\{n\}/, () => "BATES-" + String((spec.startAt ?? 1) + i).padStart(6, "0"));
                const font = doc.embedStandardFont(lib.StandardFonts.Helvetica);
                const w = font.widthOfTextAtSize(label, spec.size);
                let x = (width - w) / 2;
                let y = 24;
                if (spec.position === "header-center") y = height - spec.size - 14;
                else if (spec.position === "footer-right") x = width - w - 28;
                else if (spec.position === "header-right") {
                    x = width - w - 28;
                    y = height - spec.size - 14;
                }
                page.drawText(label, {x, y, size: spec.size, font, color: lib.rgb(...spec.color)});
            });
            const out = await doc.save();
            const blob = new Blob([out as unknown as BlobPart], {type: "application/pdf"});
            const base = file.name.replace(/\.pdf$/i, "");
            downloadBlob(blob, `${base}-${spec.id.replace(/^pdf-/, "")}.pdf`, "pdf");
            toast({
                title: `${spec.label} applied`,
                description: `${pages.length} pages stamped — the PDF downloaded.`,
                variant: "success"
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-3 py-1">
            <Note>{spec.hint}</Note>
            <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs">
                    <TypeIcon className="size-3.5 text-amber-500"/>
                    {file ? file.name : "Pick a PDF"}
                    <input type="file" accept="application/pdf" className="hidden"
                           onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>
                </label>
                <Input value={text} onChange={(e) => setText(e.target.value)} className="h-8 w-56 text-xs"
                       aria-label="Stamp text"/>
                <Button size="sm" className="h-8 text-xs" disabled={!file || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : <Download className="size-3.5"/>}
                    Stamp → PDF
                </Button>
            </div>
            <Note>{"Tokens: {n} page number · {total} · {date} · BATES{n} zero-padded legal numbering"}</Note>
            {error && <Err>{error}</Err>}
        </div>
    );
}

interface PdfPageSpec {
    id: string;
    label: string;
    hint: string;
    /** page numbers are 1-based; the predicate decides which ORIGINAL pages keep / become which. */
    keep?: (oneBased: number, total: number) => boolean;
    /** Duplicate every kept page this many times. */
    repeat?: number;
    /** Insert a blank page before each kept page. */
    blankBefore?: boolean;
    /** Rotate kept pages by degrees. */
    rotate?: number;
}

function PdfPageTool({spec}: { spec: PdfPageSpec }) {
    const {toast} = useToast();
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const run = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const {lib, doc} = await loadPdfFile(file);
            const total = doc.getPageCount();
            const out = await lib.PDFDocument.create();
            for (let i = 1; i <= total; i++) {
                if (spec.keep && !spec.keep(i, total)) continue;
                const times = spec.repeat ?? 1;
                for (let r = 0; r < times; r++) {
                    if (spec.blankBefore) {
                        const blank = out.addPage();
                        const src = doc.getPage(i - 1);
                        blank.setSize(src.getWidth(), src.getHeight());
                    }
                    const [copied] = await out.copyPages(doc, [i - 1]);
                    if (spec.rotate) copied.setRotation(lib.degrees((copied.getRotation().angle + spec.rotate) % 360));
                    out.addPage(copied);
                }
            }
            if (out.getPageCount() === 0) throw new Error("That filter kept zero pages — nothing to export.");
            const bytes = await out.save();
            const blob = new Blob([bytes as unknown as BlobPart], {type: "application/pdf"});
            const base = file.name.replace(/\.pdf$/i, "");
            downloadBlob(blob, `${base}-${spec.id.replace(/^pdf-/, "")}.pdf`, "pdf");
            toast({
                title: `${spec.label} done`,
                description: `${out.getPageCount()} pages in the output.`,
                variant: "success"
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-3 py-1">
            <Note>{spec.hint}</Note>
            <div className="flex items-center gap-3">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs">
                    <TypeIcon className="size-3.5 text-amber-500"/>
                    {file ? file.name : "Pick a PDF"}
                    <input type="file" accept="application/pdf" className="hidden"
                           onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>
                </label>
                <Button size="sm" className="h-8 text-xs" disabled={!file || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : <Download className="size-3.5"/>}
                    Transform → PDF
                </Button>
            </div>
            {error && <Err>{error}</Err>}
        </div>
    );
}

const PDF_STAMP_SPECS: PdfStampSpec[] = [
    {
        id: "pdf-footer",
        label: "Footer Text Stamp",
        hint: "Small gray text centered at the bottom of every page.",
        position: "footer-center",
        text: "Generated with Praxis",
        size: 9,
        color: [0.45, 0.45, 0.45]
    },
    {
        id: "pdf-header",
        label: "Header Text Stamp",
        hint: "Small gray text centered at the top of every page.",
        position: "header-center",
        text: "Draft",
        size: 10,
        color: [0.4, 0.4, 0.4]
    },
    {
        id: "pdf-bates",
        label: "Bates Numbering",
        hint: "Legal-style BATES-000001 numbering, bottom-right, from a starting index.",
        position: "footer-right",
        text: "BATES{n}",
        size: 10,
        color: [0.1, 0.1, 0.1]
    },
    {
        id: "pdf-date",
        label: "Date Stamp",
        hint: "Today's date bottom-right — the print-date record.",
        position: "footer-right",
        text: "{date}",
        size: 9,
        color: [0.35, 0.35, 0.35]
    },
    {
        id: "pdf-corner-date",
        label: "Corner Date/Time",
        hint: "The full timestamp top-right — an audit corner.",
        position: "header-right",
        text: "{date} · printed {n}/{total}",
        size: 8,
        color: [0.4, 0.4, 0.4]
    },
    {
        id: "pdf-conf",
        label: "CONFIDENTIAL Banner",
        hint: "Red CONFIDENTIAL footer on every page — bold and unmissable.",
        position: "footer-center",
        text: "CONFIDENTIAL",
        size: 14,
        color: [0.75, 0.08, 0.08]
    },
    {
        id: "pdf-draft",
        label: "DRAFT Marker",
        hint: "Gray DRAFT centered top — soft, present on every page.",
        position: "header-center",
        text: "DRAFT — NOT FINAL",
        size: 11,
        color: [0.55, 0.55, 0.55]
    },
];

const PDF_PAGE_SPECS: PdfPageSpec[] = [
    {id: "pdf-dup", label: "Duplicate Every Page", hint: "Every page twice — the print-and-file copy.", repeat: 2},
    {id: "pdf-odd", label: "Keep Odd Pages", hint: "1, 3, 5 … — the odd set.", keep: (i) => i % 2 === 1},
    {id: "pdf-even", label: "Keep Even Pages", hint: "2, 4, 6 … — the even set.", keep: (i) => i % 2 === 0},
    {
        id: "pdf-keep-first",
        label: "Keep First Half",
        hint: "Only the first half of the pages.",
        keep: (i, total) => i <= Math.ceil(total / 2)
    },
    {
        id: "pdf-keep-last",
        label: "Keep Last Half",
        hint: "Only the second half of the pages.",
        keep: (i, total) => i > Math.ceil(total / 2)
    },
    {
        id: "pdf-drop-third",
        label: "Remove Every 3rd",
        hint: "Drops pages 3, 6, 9 … — the periodic thinning.",
        keep: (i) => i % 3 !== 0
    },
    {
        id: "pdf-blank-each",
        label: "Blank Sheet Before Each",
        hint: "A blank page before every page — the note-taking print layout.",
        blankBefore: true
    },
    {
        id: "pdf-rot-odd",
        label: "Rotate Odd Pages",
        hint: "Odd pages turned 90° — the mixed-orientation normalizer.",
        keep: () => true,
        rotate: 90
    },
];

export function pdfStampTool(id: string): React.ComponentType {
    const spec = PDF_STAMP_SPECS.find((s) => s.id === id);
    const C = function PdfStampEntry() {
        if (!spec) return <Note>Unknown tool.</Note>;
        return <PdfStampTool spec={spec}/>;
    };
    C.displayName = `PdfStamp(${id})`;
    return C;
}

export function pdfPageTool(id: string): React.ComponentType {
    const spec = PDF_PAGE_SPECS.find((s) => s.id === id);
    const C = function PdfPageEntry() {
        if (!spec) return <Note>Unknown tool.</Note>;
        return <PdfPageTool spec={spec}/>;
    };
    C.displayName = `PdfPage(${id})`;
    return C;
}

/* ══════════════════════════════════════════════════════════════════
 *  IMAGE → TEXT — the analysis engine + 22 tools (8 → 30)
 * ══════════════════════════════════════════════════════════════════ */

type ImageTextMode =
    | "ascii" | "hex" | "palette" | "histogram" | "info" | "dataurl" | "markup";

interface ImageTextSpec {
    id: string;
    label: string;
    hint: string;
    mode: ImageTextMode;
    /** ascii: the charset dark→light. */
    charset?: string;
    /** ascii: max output width in characters. */
    width?: number;
    /** palette: how many colors. */
    count?: number;
    /** palette / info output style. */
    style?: "hex" | "rgb" | "hsl" | "json" | "markdown" | "csv" | "css" | "scss";
    /** histogram: channel. */
    channel?: "luma" | "r" | "g" | "b" | "csv";
    /** dataurl: mime + quality. */
    mime?: "image/png" | "image/jpeg" | "image/webp";
    quality?: number;
    /** markup: which snippet. */
    markup?: "img" | "css" | "srcset" | "favicon";
    alt?: string;
}

async function loadImageCanvas(file: File, maxW = 240): Promise<{
    canvas: HTMLCanvasElement;
    full: HTMLCanvasElement;
    w: number;
    h: number
}> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error("That file would not decode as an image."));
            i.src = url;
        });
        const full = document.createElement("canvas");
        full.width = img.naturalWidth;
        full.height = img.naturalHeight;
        full.getContext("2d")!.drawImage(img, 0, 0);
        const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return {canvas, full, w: img.naturalWidth, h: img.naturalHeight};
    } finally {
        URL.revokeObjectURL(url);
    }
}

function rgbToHexStr(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

function ImageTextTool({spec}: { spec: ImageTextSpec }) {
    const {toast} = useToast();
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [out, setOut] = React.useState<string | null>(null);
    const run = async () => {
        if (!file) return;
        setBusy(true);
        setError(null);
        setOut(null);
        try {
            const isAscii = spec.mode === "ascii";
            const {canvas, full, w, h} = await loadImageCanvas(file, isAscii ? (spec.width ?? 100) : 240);
            const ctx = canvas.getContext("2d")!;
            const {data, width, height} = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = await buildImageText(spec, {data, width, height, full, w, h, file});
            setOut(result);
            toast({title: `${spec.label} ready`, variant: "success"});
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-3 py-1">
            <Note>{spec.hint}</Note>
            <div className="flex items-center gap-3">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs">
                    <TypeIcon className="size-3.5 text-emerald-500"/>
                    {file ? file.name : "Pick an image"}
                    <input type="file" accept="image/*" className="hidden"
                           onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>
                </label>
                <Button size="sm" className="h-8 text-xs" disabled={!file || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    Extract text
                </Button>
                {out && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                            void navigator.clipboard.writeText(out).then(() => toast({
                                title: "Copied to clipboard",
                                variant: "success"
                            }));
                        }}
                    >
                        Copy
                    </Button>
                )}
            </div>
            {error && <Err>{error}</Err>}
            {out && (
                <pre
                    className={cn("max-h-72 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] whitespace-pre", isAsciiNow(spec) && "text-[6px] leading-[1.05]")}>{out}</pre>
            )}
        </div>
    );
}

function isAsciiNow(spec: ImageTextSpec): boolean {
    return spec.mode === "ascii";
}

async function buildImageText(
    spec: ImageTextSpec,
    ctxInfo: {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        full: HTMLCanvasElement;
        w: number;
        h: number;
        file: File;
    }
): Promise<string> {
    const {data, width, height, full, w, h, file} = ctxInfo;
    const lumaAt = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (spec.mode === "ascii") {
        const charset = spec.charset ?? "@%*+=-:. ";
        const lines: string[] = [];
        for (let y = 0; y < height; y++) {
            let line = "";
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const l = lumaAt(i) / 255;
                line += charset[Math.min(charset.length - 1, Math.floor(l * charset.length))];
            }
            lines.push(line);
        }
        return lines.join("\n");
    }
    if (spec.mode === "hex" || spec.mode === "palette") {
        const counts = new Map<string, { r: number; g: number; b: number; n: number }>();
        for (let i = 0; i < data.length; i += 4) {
            const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
            const e = counts.get(key) ?? {r: 0, g: 0, b: 0, n: 0};
            e.r += data[i];
            e.g += data[i + 1];
            e.b += data[i + 2];
            e.n++;
            counts.set(key, e);
        }
        const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
        const top = sorted.slice(0, spec.count ?? 12);
        const total = (width * height) || 1;
        if (spec.style === "json") {
            return JSON.stringify(top.map((c) => ({
                hex: rgbToHexStr(c.r / c.n, c.g / c.n, c.b / c.n),
                share: +(c.n / total).toFixed(4)
            })), null, 2);
        }
        if (spec.style === "css") return top.map((c, i) => `--color-${i + 1}: ${rgbToHexStr(c.r / c.n, c.g / c.n, c.b / c.n)}; /* ${(100 * c.n / total).toFixed(1)}% */`).join("\n");
        if (spec.style === "scss") return top.map((c, i) => `$color-${i + 1}: ${rgbToHexStr(c.r / c.n, c.g / c.n, c.b / c.n)};`).join("\n");
        return top.map((c) => {
            const hex = rgbToHexStr(c.r / c.n, c.g / c.n, c.b / c.n);
            return `${hex}  rgb(${Math.round(c.r / c.n)}, ${Math.round(c.g / c.n)}, ${Math.round(c.b / c.n)})  ${(100 * c.n / total).toFixed(1)}%`;
        }).join("\n");
    }
    if (spec.mode === "histogram") {
        if (spec.channel === "csv") {
            const rows = ["bucket,r,g,b"];
            const buckets = 16;
            const r = new Array(buckets).fill(0);
            const g = new Array(buckets).fill(0);
            const b = new Array(buckets).fill(0);
            for (let i = 0; i < data.length; i += 4) {
                r[data[i] >> 4]++;
                g[data[i + 1] >> 4]++;
                b[data[i + 2] >> 4]++;
            }
            for (let k = 0; k < buckets; k++) rows.push(`${k * 16}-${k * 16 + 15},${r[k]},${g[k]},${b[k]}`);
            return rows.join("\n");
        }
        const chan = spec.channel === "r" ? 0 : spec.channel === "g" ? 1 : spec.channel === "b" ? 2 : -1;
        const buckets = 32;
        const hist = new Array(buckets).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const v = chan < 0 ? lumaAt(i) : data[i + chan];
            hist[Math.min(buckets - 1, Math.floor((v / 256) * buckets))]++;
        }
        const max = Math.max(...hist, 1);
        return hist
            .map((n, k) => `${String(Math.floor((k * 256) / buckets)).padStart(3)}-${String(Math.floor(((k + 1) * 256) / buckets) - 1).padStart(3)}  ${String(n).padStart(7)}  ${"█".repeat(Math.max(1, Math.round((n / max) * 40)))}`)
            .join("\n");
    }
    if (spec.mode === "info") {
        const aspect = (w / h).toFixed(3);
        const mp = ((w * h) / 1e6).toFixed(2);
        if (spec.style === "markdown") return `| property | value |\n|---|---|\n| name | ${file.name} |\n| size | ${w} × ${h} px |\n| aspect | ${aspect} |\n| megapixels | ${mp} MP |\n| bytes | ${file.size.toLocaleString()} |`;
        if (spec.style === "csv") return `name,width,height,aspect,megapixels,bytes\n"${file.name}",${w},${h},${aspect},${mp},${file.size}`;
        return JSON.stringify({
            name: file.name,
            width: w,
            height: h,
            aspect: Number(aspect),
            megapixels: Number(mp),
            bytes: file.size,
            type: file.type
        }, null, 2);
    }
    if (spec.mode === "dataurl") {
        const url = await new Promise<string>((resolve, reject) => {
            full.toBlob(
                (blob) => {
                    if (!blob) return reject(new Error("Encoding failed."));
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result));
                    r.onerror = () => reject(new Error("Reading the blob failed."));
                    r.readAsDataURL(blob);
                },
                spec.mime ?? "image/png",
                spec.quality
            );
        });
        const head = url.slice(0, 64);
        return `${head}\n… ${(url.length / 1024).toFixed(0)} KB total (${w}×${h}). Copy needs the full value — this pane shows the preview; use the Copy button above for the whole payload.`;
    }
    // markup builders
    const alt = spec.alt ?? file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    if (spec.markup === "css") return [
        `.hero {`,
        `  width: 100%;`,
        `  aspect-ratio: ${w} / ${h};`,
        `  background: url("${file.name}") center / cover no-repeat;`,
        `  background-color: #0b1220; /* fallback while it loads */`,
        `}`,
    ].join("\n");
    if (spec.markup === "srcset") return [
        `<img`,
        `  src="${file.name}"`,
        `  srcset="${file.name} 1x, ${file.name.replace(/(\.\w+)$/, "@2x$1")} 2x"`,
        `  width="${w}"`,
        `  height="${h}"`,
        `  alt="${alt}"`,
        `  loading="lazy"`,
        `  decoding="async" />`,
    ].join("\n");
    if (spec.markup === "favicon") return [
        `<link rel="icon" href="/favicon.ico" sizes="any" />`,
        `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
        `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />`,
        `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />`,
        `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`,
        `<link rel="manifest" href="/manifest.json" />`,
    ].join("\n");
    return `<img src="${file.name}" width="${w}" height="${h}" alt="${alt}" loading="lazy" />`;
}

const IMAGE_TEXT_SPECS: ImageTextSpec[] = [
    {
        id: "img-ascii-blocks",
        label: "ASCII Art (blocks)",
        hint: "The image re-drawn with solid block glyphs — dense and high-contrast.",
        mode: "ascii",
        charset: "█▓▒░ ",
        width: 80
    },
    {
        id: "img-ascii-shade",
        label: "ASCII Art (shaded)",
        hint: "The classic @%*+=-:. shading — the terminal-photo look.",
        mode: "ascii",
        charset: "@%*+=-:. ",
        width: 100
    },
    {
        id: "img-ascii-binary",
        label: "ASCII Art (binary)",
        hint: "Pure 01 bits — the punch-card aesthetic.",
        mode: "ascii",
        charset: "01",
        width: 120
    },
    {
        id: "img-ascii-mid",
        label: "ASCII Art (mid)",
        hint: "A medium-density charset for softer output.",
        mode: "ascii",
        charset: "mwdbqpMVYxo+*-=~:. ",
        width: 90
    },
    {
        id: "img-palette-8",
        label: "Color Palette (top 8)",
        hint: "The 8 dominant colors as hex + share.",
        mode: "palette",
        count: 8,
        style: "hex"
    },
    {
        id: "img-palette-16",
        label: "Color Palette (top 16)",
        hint: "The 16 dominant colors as hex + share.",
        mode: "palette",
        count: 16,
        style: "hex"
    },
    {
        id: "img-palette-css",
        label: "Palette → CSS Variables",
        hint: "The dominant colors as a --var set ready to paste.",
        mode: "palette",
        count: 12,
        style: "css"
    },
    {
        id: "img-palette-scss",
        label: "Palette → SCSS Variables",
        hint: "The dominant colors as $color-n vars.",
        mode: "palette",
        count: 12,
        style: "scss"
    },
    {
        id: "img-palette-json",
        label: "Palette → JSON",
        hint: "The dominant colors with share weights as JSON.",
        mode: "palette",
        count: 10,
        style: "json"
    },
    {
        id: "img-hist-luma",
        label: "Luminance Histogram",
        hint: "Brightness distribution as a text bar chart.",
        mode: "histogram",
        channel: "luma"
    },
    {id: "img-hist-r", label: "Red Histogram", hint: "The red channel distribution.", mode: "histogram", channel: "r"},
    {
        id: "img-hist-g",
        label: "Green Histogram",
        hint: "The green channel distribution.",
        mode: "histogram",
        channel: "g"
    },
    {
        id: "img-hist-b",
        label: "Blue Histogram",
        hint: "The blue channel distribution.",
        mode: "histogram",
        channel: "b"
    },
    {
        id: "img-hist-csv",
        label: "Histogram (CSV)",
        hint: "All three channels bucketed — the stats-sheet version.",
        mode: "histogram",
        channel: "csv"
    },
    {
        id: "img-info-json",
        label: "Image Info (JSON)",
        hint: "Dimensions, aspect, megapixels, bytes — as JSON.",
        mode: "info",
        style: "json"
    },
    {
        id: "img-info-md",
        label: "Image Info (Markdown)",
        hint: "The same facts as a markdown table.",
        mode: "info",
        style: "markdown"
    },
    {id: "img-info-csv", label: "Image Info (CSV)", hint: "The same facts as one CSV row.", mode: "info", style: "csv"},
    {
        id: "img-durl-png",
        label: "Data URL (PNG)",
        hint: "The image as a lossless PNG data URL — inline-embed payload.",
        mode: "dataurl",
        mime: "image/png"
    },
    {
        id: "img-durl-jpg",
        label: "Data URL (JPEG)",
        hint: "The image as a 80%-quality JPEG data URL — the smaller embed.",
        mode: "dataurl",
        mime: "image/jpeg",
        quality: 0.8
    },
    {
        id: "img-durl-webp",
        label: "Data URL (WebP)",
        hint: "The image as a WebP data URL — the smallest embed (browser-dependent).",
        mode: "dataurl",
        mime: "image/webp",
        quality: 0.85
    },
    {
        id: "img-tag",
        label: "<img> Tag Builder",
        hint: "A complete img tag with width/height/alt/loading — from the real dimensions.",
        mode: "markup",
        markup: "img"
    },
    {
        id: "img-cssbg",
        label: "CSS Background Snippet",
        hint: "A hero background rule with the image's true aspect ratio.",
        mode: "markup",
        markup: "css"
    },
    {
        id: "img-srcset",
        label: "srcset Builder",
        hint: "Responsive markup with 1x / 2x candidates + lazy/async hints.",
        mode: "markup",
        markup: "srcset"
    },
    {
        id: "img-favicon",
        label: "Favicon Link Set",
        hint: "The full favicon <link> block — ico, svg, png and apple-touch.",
        mode: "markup",
        markup: "favicon"
    },
];

export function imageTextTool(id: string): React.ComponentType {
    const spec = IMAGE_TEXT_SPECS.find((s) => s.id === id);
    const C = function ImageTextEntry() {
        if (!spec) return <Note>Unknown tool.</Note>;
        return <ImageTextTool spec={spec}/>;
    };
    C.displayName = `ImageText(${id})`;
    return C;
}
