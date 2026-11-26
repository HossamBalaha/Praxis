/**
 * the PDF toolbox suite's PURE helpers
 * (page-range parser, metadata sanitizer, word-wrap, watermark anchor
 * math) plus THIN wrappers around pdf-lib. pdf-lib is a heavy dependency,
 * so every wrapper `await import("pdf-lib")`s INSIDE the function — it
 * only loads when a PDF tool actually runs, keeping the toolbox dialog
 * itself offline & instant.
 *
 * The pure helpers run in plain Node (see
 * src/lib/__tests__/pdf-ops.test.ts); the wrappers need no DOM either
 * (pdf-lib is pure JS), but they are only exercised from the browser
 * components.
 */

import {clamp} from "./image-ops";
import type {PDFDocument} from "pdf-lib";

/* ─── pure: page ranges ─────────────────────────────────────────── */

export class PageRangeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PageRangeError";
    }
}

/**
 * "1-3,5,7-9" → [1,2,3,5,7,8,9] — 1-based, deduped, sorted. Throws
 * PageRangeError with an actionable message on empty input, backwards
 * ranges, non-numbers or out-of-bounds pages.
 */
export function parsePageRange(input: string, pageCount: number): number[] {
    const raw = (input ?? "").trim();
    if (!raw) throw new PageRangeError("Enter a page range, e.g. 1-3,5,7-9.");
    if (!Number.isFinite(pageCount) || pageCount < 1) {
        throw new PageRangeError("Load a PDF first — the range is validated against its page count.");
    }
    const plural = pageCount === 1 ? "" : "s";
    const pages = new Set<number>();
    for (const part of raw.split(",")) {
        const token = part.trim();
        if (!token) continue;
        const single = /^\d+$/.test(token);
        const range = /^\d+\s*-\s*\d+$/.test(token);
        if (!single && !range) {
            throw new PageRangeError(`"${token}" is not a page number or range — use 5 or 1-3.`);
        }
        if (single) {
            const p = Number(token);
            if (p < 1 || p > pageCount) {
                throw new PageRangeError(`Page ${p} is out of range — the document has ${pageCount} page${plural}.`);
            }
            pages.add(p);
        } else {
            const a = Number(token.split("-")[0]);
            const b = Number(token.split("-")[1]);
            if (a > b) throw new PageRangeError(`Range "${token}" is backwards — write the smaller page first.`);
            if (a < 1) throw new PageRangeError(`Page ${a} is out of range — pages start at 1.`);
            if (b > pageCount) {
                throw new PageRangeError(`Page ${b} is out of range — the document has ${pageCount} page${plural}.`);
            }
            for (let p = a; p <= b; p++) pages.add(p);
        }
    }
    const out = [...pages].sort((x, y) => x - y);
    if (out.length === 0) throw new PageRangeError("Enter a page range, e.g. 1-3,5,7-9.");
    return out;
}

/** Validate a "move page from → to" pair (1-based, inclusive). */
export function parseMoveCommand(from: number, to: number, pageCount: number): { from: number; to: number } {
    const pairs: Array<[number, string]> = [
        [from, "from"],
        [to, "to"],
    ];
    for (const [n, label] of pairs) {
        if (!Number.isFinite(n) || n < 1 || n > pageCount) {
            throw new PageRangeError(`The "${label}" page must be between 1 and ${pageCount}.`);
        }
    }
    return {from: Math.round(from), to: Math.round(to)};
}

/* ─── pure: metadata, naming, labels ────────────────────────────── */

/** Strip control chars, collapse whitespace, cap the length. */
export function sanitizeMetadataValue(value: string, maxLength = 200): string {
    let s = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > maxLength) s = s.slice(0, maxLength - 1).trimEnd() + "…";
    return s;
}

/** Filesystem-safe name that always ends in .pdf. */
export function normalizePdfName(name: string): string {
    let base = (name ?? "").trim().replace(/\.pdf$/i, "");
    base = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/-+$/g, "").trim();
    return `${base || "document"}.pdf`;
}

/** "#" → page number, "@" → total pages ("Page # of @"). */
export function formatPageLabel(format: string, pageNumber: number, totalPages: number): string {
    return format.replace(/#/g, String(pageNumber)).replace(/@/g, String(totalPages));
}

/* ─── pure: text layout math ────────────────────────────────────── */

/**
 * Greedy word wrap for the Text → PDF tool. Respects explicit newlines,
 * breaks words longer than a line, and returns lines whose estimated
 * width (fontSize × charWidthRatio × chars) stays within maxWidth.
 */
export function wrapTextToWidth(text: string, fontSize: number, maxWidth: number, charWidthRatio = 0.5): string[] {
    const size = clamp(fontSize, 4, 96);
    const charW = Math.max(0.5, size * clamp(charWidthRatio, 0.3, 1));
    const maxChars = Math.max(1, Math.floor(maxWidth / charW));
    const out: string[] = [];
    for (const paragraph of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
        if (!paragraph) {
            out.push("");
            continue;
        }
        let line = "";
        for (const word of paragraph.split(/ +/)) {
            let piece = word;
            while (piece.length > maxChars) {
                if (line) {
                    out.push(line);
                    line = "";
                }
                out.push(piece.slice(0, maxChars));
                piece = piece.slice(maxChars);
            }
            const candidate = line ? `${line} ${piece}` : piece;
            if (candidate.length > maxChars && line) {
                out.push(line);
                line = piece;
            } else {
                line = candidate;
            }
        }
        if (line) out.push(line);
    }
    return out;
}

/**
 * Where to anchor a diagonal watermark so its visual center lands on the
 * page center. `textWidth` is the string's width at `fontSize`.
 */
export function watermarkAnchorPdf(
    pageW: number,
    pageH: number,
    textWidth: number,
    fontSize: number,
    angleDeg = 45
): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    const x = pageW / 2 - (textWidth / 2) * Math.cos(rad) + (fontSize / 2) * Math.sin(rad);
    const y = pageH / 2 - (textWidth / 2) * Math.sin(rad) - (fontSize / 2) * Math.cos(rad);
    return {x, y};
}

/** Shrink a font size until the text plausibly fits `maxWidth`. */
export function fitFontSize(
    text: string,
    maxWidth: number,
    startSize: number,
    charWidthRatio = 0.5,
    minSize = 10
): number {
    let size = clamp(startSize, minSize, 400);
    while (size > minSize && text.length * size * charWidthRatio > maxWidth) size -= 1;
    return size;
}

/* ─── pure: report formatting ───────────────────────────────────── */

export interface PdfInfoData {
    fileName?: string;
    bytes?: number;
    pageCount: number;
    pageSizes: Array<{ width: number; height: number }>;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
}

function formatPdfDate(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export function formatPdfInfo(info: PdfInfoData): string {
    const sizeSummary = new Map<string, number>();
    for (const s of info.pageSizes) {
        const key = `${Math.round(s.width)} × ${Math.round(s.height)} pt`;
        sizeSummary.set(key, (sizeSummary.get(key) ?? 0) + 1);
    }
    const sizes = [...sizeSummary.entries()]
        .map(([key, n]) => (info.pageCount > 1 ? `${key} (${n} page${n === 1 ? "" : "s"})` : key))
        .join(", ");
    const meta = (label: string, v?: string): string[] => (v ? [`${label.padEnd(16)}${v}`] : []);
    return [
        `File             ${info.fileName ?? "—"}`,
        `File size        ${info.bytes != null ? `${(info.bytes / 1024).toFixed(1)} KB (${info.bytes.toLocaleString()} bytes)` : "—"}`,
        `Pages            ${info.pageCount}`,
        `Page size        ${sizes || "—"}`,
        ...meta("Title", info.title),
        ...meta("Author", info.author),
        ...meta("Subject", info.subject),
        ...meta("Keywords", info.keywords),
        ...meta("Creator", info.creator),
        ...meta("Producer", info.producer),
        ...meta("Created", formatPdfDate(info.creationDate)),
        ...meta("Modified", formatPdfDate(info.modificationDate)),
    ]
        .filter(Boolean)
        .join("\n");
}

/* ─── pdf-lib wrappers (dynamic import INSIDE each function) ────── */

async function loadDoc(bytes: Uint8Array): Promise<PDFDocument> {
    const {PDFDocument} = await import("pdf-lib");
    try {
        return await PDFDocument.load(bytes, {ignoreEncryption: true});
    } catch (err) {
        throw new Error(`Could not read this PDF — ${(err as Error).message}`);
    }
}

/** Merge N PDFs in file order. */
export async function mergePdfDocs(files: Uint8Array[], title?: string): Promise<Uint8Array> {
    if (files.length === 0) throw new Error("Pick at least one PDF to merge.");
    const {PDFDocument} = await import("pdf-lib");
    const out = await PDFDocument.create();
    for (const bytes of files) {
        const src = await loadDoc(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
    }
    if (title) out.setTitle(title);
    return out.save();
}

/** Keep only the given 1-based pages (in the given order). */
export async function extractPdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
    const {PDFDocument} = await import("pdf-lib");
    const src = await loadDoc(bytes);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, pages.map((p) => p - 1));
    for (const p of copied) out.addPage(p);
    return out.save();
}

/** Delete the given 1-based pages (guard: keep ≥ 1 page in the caller). */
export async function deletePdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
    const doc = await loadDoc(bytes);
    const indices = [...new Set(pages)].map((p) => p - 1).sort((a, b) => b - a);
    for (const i of indices) doc.removePage(i);
    return doc.save();
}

/** Rotate pages (1-based list, or null = all) by a RELATIVE angle. */
export async function rotatePdfPages(
    bytes: Uint8Array,
    pages: number[] | null,
    angle: 90 | 180 | 270
): Promise<Uint8Array> {
    const {degrees} = await import("pdf-lib");
    const doc = await loadDoc(bytes);
    const indices = pages ?? doc.getPageIndices();
    for (const i of indices) {
        const page = doc.getPage(i);
        page.setRotation(degrees((page.getRotation().angle + angle) % 360));
    }
    return doc.save();
}

export async function reversePdfPages(bytes: Uint8Array): Promise<Uint8Array> {
    const {PDFDocument} = await import("pdf-lib");
    const src = await loadDoc(bytes);
    const count = src.getPageCount();
    if (count < 2) return src.save();
    const out = await PDFDocument.create();
    const indices = Array.from({length: count}, (_, i) => count - 1 - i);
    const copied = await out.copyPages(src, indices);
    for (const p of copied) out.addPage(p);
    return out.save();
}

export async function movePdfPage(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
    const {PDFDocument} = await import("pdf-lib");
    const src = await loadDoc(bytes);
    const count = src.getPageCount();
    const order = Array.from({length: count}, (_, i) => i);
    const [moved] = order.splice(from - 1, 1);
    order.splice(to - 1, 0, moved);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, order);
    for (const p of copied) out.addPage(p);
    return out.save();
}

/** Insert a blank page at 1-based position `at` (default: the end). */
export async function insertBlankPdfPage(bytes: Uint8Array, at: number): Promise<Uint8Array> {
    const {rgb} = await import("pdf-lib");
    const doc = await loadDoc(bytes);
    const first = doc.getPage(0);
    const {width, height} = first.getSize();
    const pos = clamp(Math.round(at), 1, doc.getPageCount() + 1);
    const page = doc.insertPage(pos - 1, [width, height]);
    page.drawRectangle({x: 0, y: 0, width, height, color: rgb(1, 1, 1)});
    return doc.save();
}

export interface PageNumberOptions {
    position: "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";
    fontSize: number;
    startAt: number;
    format: string;
}

export async function stampPageNumbers(bytes: Uint8Array, opts: PageNumberOptions): Promise<Uint8Array> {
    const {StandardFonts, rgb} = await import("pdf-lib");
    const doc = await loadDoc(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const margin = 24;
    pages.forEach((page, i) => {
        const label = formatPageLabel(opts.format, opts.startAt + i, pages.length + Math.max(0, opts.startAt - 1));
        const {width, height} = page.getSize();
        const tw = font.widthOfTextAtSize(label, opts.fontSize);
        const x = opts.position.includes("left")
            ? margin
            : opts.position.includes("right")
                ? width - margin - tw
                : (width - tw) / 2;
        const y = opts.position.includes("top") ? height - margin - opts.fontSize : margin;
        page.drawText(label, {x, y, size: opts.fontSize, font, color: rgb(0.35, 0.35, 0.35)});
    });
    return doc.save();
}

export interface WatermarkOptions {
    text: string;
    fontSize: number;
    opacity: number;
    angle: number;
}

/** Diagonal centered text watermark on every page. */
export async function textWatermarkPdf(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
    const {StandardFonts, degrees, rgb} = await import("pdf-lib");
    const doc = await loadDoc(bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const text = opts.text || "CONFIDENTIAL";
    for (const page of doc.getPages()) {
        const {width, height} = page.getSize();
        // shrink the font when the text would overflow the diagonal
        const diagonal = Math.sqrt(width * width + height * height) * 0.8;
        const size = fitFontSize(text, diagonal, opts.fontSize, 0.58, 8);
        const tw = font.widthOfTextAtSize(text, size);
        const anchor = watermarkAnchorPdf(width, height, tw, size, opts.angle);
        page.drawText(text, {
            x: anchor.x,
            y: anchor.y,
            size,
            font,
            opacity: clamp(opts.opacity, 0.02, 1),
            rotate: degrees(opts.angle),
            color: rgb(0.45, 0.45, 0.45),
        });
    }
    return doc.save();
}

export interface PdfMetadataInput {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
}

export async function setPdfMetadata(bytes: Uint8Array, meta: PdfMetadataInput): Promise<Uint8Array> {
    const doc = await loadDoc(bytes);
    if (meta.title) doc.setTitle(meta.title);
    if (meta.author) doc.setAuthor(meta.author);
    if (meta.subject) doc.setSubject(meta.subject);
    if (meta.keywords) doc.setKeywords(meta.keywords.split(/[,;]\s*/).filter(Boolean));
    if (meta.creator) doc.setCreator(meta.creator);
    if (meta.producer) doc.setProducer(meta.producer);
    doc.setModificationDate(new Date());
    return doc.save();
}

export async function clearPdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await loadDoc(bytes);
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
    doc.setModificationDate(new Date());
    return doc.save();
}

/** Images → PDF, one page per image, page sized to the image. */
export async function imagesToPdf(
    images: Array<{ bytes: Uint8Array; mime: "image/jpeg" | "image/png" }>
): Promise<Uint8Array> {
    const {PDFDocument, rgb} = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (const img of images) {
        const embedded = img.mime === "image/jpeg" ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
        const page = doc.addPage([embedded.width, embedded.height]);
        page.drawRectangle({x: 0, y: 0, width: embedded.width, height: embedded.height, color: rgb(1, 1, 1)});
        page.drawImage(embedded, {x: 0, y: 0, width: embedded.width, height: embedded.height});
    }
    return doc.save();
}

export interface TextToPdfOptions {
    fontSize: number;
    mono: boolean;
    margin: number;
}

/** Text → PDF: word-wrapped Courier/Helvetica over letter pages. */
export async function textToPdf(text: string, opts: TextToPdfOptions): Promise<Uint8Array> {
    const {PDFDocument, StandardFonts, rgb} = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(opts.mono ? StandardFonts.Courier : StandardFonts.Helvetica);
    const W = 612;
    const H = 792;
    const size = clamp(opts.fontSize, 6, 48);
    const lineHeight = Math.max(size + 4, Math.round(size * 1.4));
    // wrap with a conservative estimate, then hard-trim with the REAL font metrics
    const maxW = W - 2 * opts.margin;
    const estLines = wrapTextToWidth(text, size, maxW, opts.mono ? 0.62 : 0.52);
    const lines = estLines.map((line) => {
        let l = line;
        while (l.length > 1 && font.widthOfTextAtSize(l, size) > maxW) l = l.slice(0, -1);
        return l;
    });
    const perPage = Math.max(1, Math.floor((H - 2 * opts.margin) / lineHeight));
    for (let i = 0; i < lines.length; i += perPage) {
        const page = doc.addPage([W, H]);
        lines.slice(i, i + perPage).forEach((line, j) => {
            if (!line) return;
            page.drawText(line, {
                x: opts.margin,
                y: H - opts.margin - lineHeight * j - size,
                size,
                font,
                color: rgb(0.1, 0.1, 0.1),
            });
        });
    }
    if (doc.getPageCount() === 0) doc.addPage([W, H]);
    return doc.save();
}

export async function pdfInfo(bytes: Uint8Array): Promise<PdfInfoData> {
    const doc = await loadDoc(bytes);
    return {
        pageCount: doc.getPageCount(),
        pageSizes: doc.getPages().map((p) => p.getSize()),
        title: doc.getTitle() || undefined,
        author: doc.getAuthor() || undefined,
        subject: doc.getSubject() || undefined,
        keywords: (doc.getKeywords() || undefined)?.trim() || undefined,
        creator: doc.getCreator() || undefined,
        producer: doc.getProducer() || undefined,
        creationDate: doc.getCreationDate()?.toISOString(),
        modificationDate: doc.getModificationDate()?.toISOString(),
    };
}

export interface PdfChunk {
    bytes: Uint8Array;
    from: number;
    to: number;
}

/** Split into chunks of ≤ n pages each (in page order). */
export async function splitPdfEvery(bytes: Uint8Array, n: number): Promise<PdfChunk[]> {
    const {PDFDocument} = await import("pdf-lib");
    const src = await loadDoc(bytes);
    const count = src.getPageCount();
    const size = clamp(Math.round(n), 1, count);
    const chunks: PdfChunk[] = [];
    for (let from = 0; from < count; from += size) {
        const to = Math.min(from + size, count);
        const part = await PDFDocument.create();
        const indices = Array.from({length: to - from}, (_, i) => from + i);
        const copied = await part.copyPages(src, indices);
        for (const p of copied) part.addPage(p);
        chunks.push({bytes: await part.save(), from: from + 1, to});
    }
    return chunks;
}

export interface CoverOptions {
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
}

/**
 * Title/cover page: appended as a NEW page in front of the loaded PDF
 * (sized to its first page), or a standalone one-page PDF when no PDF
 * is provided.
 */
export async function coverPagePdf(bytes: Uint8Array | null, opts: CoverOptions): Promise<Uint8Array> {
    const {PDFDocument, StandardFonts, rgb} = await import("pdf-lib");
    const doc = bytes ? await loadDoc(bytes) : await PDFDocument.create();
    const firstSize = bytes ? doc.getPage(0).getSize() : {width: 612, height: 792};
    const page = doc.insertPage(0, [firstSize.width, firstSize.height]);
    page.drawRectangle({x: 0, y: 0, width: firstSize.width, height: firstSize.height, color: rgb(1, 1, 1)});
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const W = firstSize.width;
    const H = firstSize.height;
    const titleSize = fitFontSize(opts.title, W - 96, 44, 0.58, 14);
    const titleW = bold.widthOfTextAtSize(opts.title, titleSize);
    page.drawText(opts.title, {
        x: (W - titleW) / 2,
        y: (H * 2) / 3,
        size: titleSize,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
    });
    let y = (H * 2) / 3 - 28;
    if (opts.subtitle) {
        const subSize = fitFontSize(opts.subtitle, W - 96, 18, 0.52, 9);
        const subW = regular.widthOfTextAtSize(opts.subtitle, subSize);
        page.drawText(opts.subtitle, {
            x: (W - subW) / 2,
            y,
            size: subSize,
            font: regular,
            color: rgb(0.35, 0.35, 0.35)
        });
        y -= 26;
    }
    if (opts.author) {
        const a = regular.widthOfTextAtSize(opts.author, 13);
        page.drawText(opts.author, {x: (W - a) / 2, y, size: 13, font: regular, color: rgb(0.35, 0.35, 0.35)});
        y -= 22;
    }
    if (opts.date) {
        const d = regular.widthOfTextAtSize(opts.date, 11);
        page.drawText(opts.date, {x: (W - d) / 2, y, size: 11, font: regular, color: rgb(0.55, 0.55, 0.55)});
    }
    return doc.save();
}

/* ─── extract the EMBEDDED images out of a PDF ──────────
The inverse of Images → PDF: walk the PDF's indirect
objects, find every image XObject, and re-materialize each one as
a real image file:
▸ DCTDecode → the stream bytes ARE a JPEG → passthrough
▸ JPXDecode → JPEG2000 passthrough (.jp2)
▸ FlateDecode (+pals) → decode to raw pixels, then re-encode as
a spec-conformant PNG (built by hand:
IHDR + filtered scanlines + IDAT via the
browser's CompressionStream + IEND, CRC-32
by table) — no new dependency.
Unsupported codecs (CCITTFax fax images, 16-bit components, indexed
palettes) are reported as skipped instead of corrupted silently.
Everything is client-side pdf-lib, same as the rest of the suite. */

export interface ExtractedPdfImage {
    blob: Blob;
    name: string;
    width: number;
    height: number;
    filter: string;
    page: number | null;
    sizeBytes: number;
}

/** CRC-32 (IEEE, reflected) — the PNG chunk checksum. */
function pngCrc32(buf: Uint8Array): number {
    let c: number;
    let crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = c ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const len = data.length;
    out[0] = (len >>> 24) & 0xff;
    out[1] = (len >>> 16) & 0xff;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crc = pngCrc32(out.subarray(4, 8 + data.length));
    out[8 + data.length] = (crc >>> 24) & 0xff;
    out[9 + data.length] = (crc >>> 16) & 0xff;
    out[10 + data.length] = (crc >>> 8) & 0xff;
    out[11 + data.length] = crc & 0xff;
    return out;
}

/** zlib-deflate raw bytes via the browser CompressionStream API. */
async function pngDeflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer]).stream();
    const piped = stream.pipeThrough(new CompressionStream("deflate"));
    const ab = await new Response(piped).arrayBuffer();
    return new Uint8Array(ab);
}

/** Encode raw RGB / RGBA / gray pixels as a PNG file. */
async function encodePng(
    width: number,
    height: number,
    channels: 1 | 3 | 4,
    raw: Uint8Array
): Promise<Uint8Array> {
    const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
    const stride = width * channels;
    // filter byte 0 (None) per scanline.
    const filtered = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        filtered[y * (stride + 1)] = 0;
        filtered.set(raw.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const idat = await pngDeflate(filtered);
    const ihdr = new Uint8Array(13);
    const w = width;
    const h = height;
    ihdr.set([(w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff], 0);
    ihdr.set([(h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff], 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = colorType;
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

/** naive CMYK(0..255) → RGB conversion (no ICC profile math). */
function cmykToRgb(raw: Uint8Array, pixels: number): Uint8Array {
    const rgb = new Uint8Array(pixels * 3);
    for (let i = 0; i < pixels; i++) {
        const c = raw[i * 4] / 255;
        const m = raw[i * 4 + 1] / 255;
        const y = raw[i * 4 + 2] / 255;
        const k = raw[i * 4 + 3] / 255;
        rgb[i * 3] = Math.round(255 * (1 - Math.min(1, c + k)));
        rgb[i * 3 + 1] = Math.round(255 * (1 - Math.min(1, m + k)));
        rgb[i * 3 + 2] = Math.round(255 * (1 - Math.min(1, y + k)));
    }
    return rgb;
}

export interface PdfImageExtractResult {
    images: ExtractedPdfImage[];
    skipped: Array<{ filter: string; reason: string; width: number; height: number }>;
}

export async function extractPdfImages(bytes: Uint8Array, baseName: string): Promise<PdfImageExtractResult> {
    const pdfLib = await import("pdf-lib");
    const {PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict} = pdfLib as {
        PDFDocument: typeof import("pdf-lib").PDFDocument;
        PDFName: typeof import("pdf-lib").PDFName;
        PDFRawStream: typeof import("pdf-lib").PDFRawStream;
        PDFArray: typeof import("pdf-lib").PDFArray;
        PDFNumber: typeof import("pdf-lib").PDFNumber;
        PDFDict: typeof import("pdf-lib").PDFDict;
    };
    const doc = await PDFDocument.load(bytes, {ignoreEncryption: true, updateMetadata: false});

    // Best-effort page attribution: map each XObject ref → 1-based
    // page index by walking every page's /Resources /XObject dict.
    // Resources can be INHERITED from the parent pages tree, so the
    // walk climbs Parent until it finds one.
    const pageOf = new Map<string, number>();
    type NodeLike = {
        Resources?: () => unknown;
        Parent?: () => unknown;
    };
    const resourcesOf = (node: unknown, depth = 0): {
        lookupMaybe?: (k: unknown, t: unknown) => unknown
    } | undefined => {
        if (!node || depth > 8) return undefined;
        const n = node as NodeLike;
        const own = typeof n.Resources === "function" ? n.Resources() : undefined;
        if (own) return own as { lookupMaybe?: (k: unknown, t: unknown) => unknown };
        return resourcesOf(typeof n.Parent === "function" ? n.Parent() : undefined, depth + 1);
    };
    try {
        doc.getPages().forEach((page, idx) => {
            const res = resourcesOf(page.node);
            if (!res?.lookupMaybe) return;
            const xo = res.lookupMaybe(PDFName.of("XObject"), PDFDict) as
                | { entries?: () => Array<[unknown, unknown]> }
                | undefined;
            if (!xo?.entries) return;
            for (const [, value] of xo.entries()) {
                if (value && typeof (value as { toString?: () => string }).toString === "function") {
                    pageOf.set((value as { toString: () => string }).toString(), idx + 1);
                }
            }
        });
    } catch {
        /* attribution is cosmetic */
    }

    const objects = doc.context.enumerateIndirectObjects();
    const images: ExtractedPdfImage[] = [];
    const skipped: Array<{ filter: string; reason: string; width: number; height: number }> = [];
    let seq = 0;

    for (const [ref, obj] of objects) {
        if (!(obj instanceof PDFRawStream)) continue;
        const dict = obj.dict;
        const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
        if (!subtype || subtype.asString() !== "/Image") continue;

        const width = dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() ?? 0;
        const height = dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() ?? 0;
        const bpc = dict.lookupMaybe(PDFName.of("BitsPerComponent"), PDFNumber)?.asNumber() ?? 8;
        const colorSpaceObj = dict.lookup(PDFName.of("ColorSpace"));
        const colorSpaceName =
            colorSpaceObj instanceof PDFName ? colorSpaceObj.asString() : colorSpaceObj instanceof PDFArray ? (colorSpaceObj.get(0) as {
                asString?: () => string
            })?.asString?.() ?? "array" : "/DeviceRGB";

        // The filter chain: [/FlateDecode] [/DCTDecode] [/FlateDecode /DCTDecode] …
        const filterObj = dict.lookup(PDFName.of("Filter"));
        const filters: string[] = [];
        if (filterObj instanceof PDFName) filters.push(filterObj.asString().slice(1));
        else if (filterObj instanceof PDFArray) {
            for (const f of filterObj.asArray()) {
                filters.push(f instanceof PDFName ? f.asString().slice(1) : String(f));
            }
        }
        const filterLabel = filters.join(" + ") || "raw";
        const last = filters[filters.length - 1];
        const rawContents = obj.getContents();
        seq += 1;
        const stem = baseName.replace(/\.[^.]+$/, "") || "pdf";
        const page = pageOf.get(ref.toString()) ?? null;
        const mk = (blob: Blob, ext: string): ExtractedPdfImage => ({
            blob,
            name: `${stem}-image-${String(seq).padStart(2, "0")}.${ext}`,
            width,
            height,
            filter: filterLabel,
            page,
            sizeBytes: blob.size,
        });

        if (last === "DCTDecode") {
            // JPEG passthrough: with a FlateDecode stage in front, inflate
            // the stream bytes first.
            let jpegBytes = rawContents;
            if (filters.length > 1) {
                try {
                    const {decodePDFRawStream} = pdfLib as unknown as {
                        decodePDFRawStream: (s: { dict: unknown; contents: unknown }) => { decode: () => Uint8Array }
                    };
                    jpegBytes = decodePDFRawStream(obj as unknown as { dict: unknown; contents: unknown }).decode();
                } catch {
                    skipped.push({
                        filter: filterLabel,
                        reason: "mixed filter chain could not be decoded",
                        width,
                        height
                    });
                    continue;
                }
            }
            images.push(mk(new Blob([jpegBytes as unknown as BlobPart], {type: "image/jpeg"}), "jpg"));
            continue;
        }

        if (last === "JPXDecode") {
            images.push(mk(new Blob([rawContents as unknown as BlobPart], {type: "image/jp2"}), "jp2"));
            continue;
        }

        // Pure encoding filters → decoded RAW PIXELS.
        let pixels: Uint8Array | null = null;
        try {
            const {decodePDFRawStream} = pdfLib as unknown as {
                decodePDFRawStream: (s: unknown) => { decode: () => Uint8Array }
            };
            pixels = decodePDFRawStream(obj as never).decode();
        } catch {
            pixels = null;
        }
        if (!pixels) {
            skipped.push({filter: filterLabel, reason: "unsupported image codec (CCITT fax / LZW / …)", width, height});
            continue;
        }
        if (bpc !== 8) {
            skipped.push({filter: filterLabel, reason: `${bpc}-bit components (only 8-bit supported)`, width, height});
            continue;
        }
        try {
            let channels: 1 | 3 | 4;
            let data = pixels;
            const pixelsCount = width * height;
            if (colorSpaceName === "/DeviceRGB" || colorSpaceName === "/CalRGB") channels = 3;
            else if (colorSpaceName === "/DeviceGray" || colorSpaceName === "/CalGray") channels = 1;
            else if (colorSpaceName === "/DeviceCMYK") {
                if (data.length < pixelsCount * 4) throw new Error("truncated CMYK data");
                data = cmykToRgb(data, pixelsCount);
                channels = 3;
            } else if (colorSpaceName === "/ICCBased") {
                // ICCBased N: 1 gray, 3 rgb, 4 cmyk. N lives on the ICC stream
                // dict: [/ICCBased ref] → ref → dict.N.
                const n = (() => {
                    try {
                        const arr = colorSpaceObj as unknown as { get: (i: number) => unknown };
                        const streamRef = arr.get(1);
                        const resolved = doc.context.lookup(streamRef as never) as
                            | {
                            dict?: { lookupMaybe?: (k: unknown, t: unknown) => { asNumber?: () => number } | undefined }
                        }
                            | undefined;
                        return resolved?.dict?.lookupMaybe?.(PDFName.of("N"), PDFNumber)?.asNumber?.() ?? 3;
                    } catch {
                        return 3;
                    }
                })();
                if (n === 1) channels = 1;
                else if (n === 4) {
                    data = cmykToRgb(data, pixelsCount);
                    channels = 3;
                } else channels = 3;
            } else if (colorSpaceName === "/Indexed") {
                // Indexed: 1 byte/px palette index — expand via the base
                // colorspace + lookup string (best effort, common case RGB).
                try {
                    const arr = colorSpaceObj as unknown as { get: (i: number) => unknown };
                    const base = arr.get(0);
                    const lookupRef = arr.get(3);
                    const lookup = doc.context.lookup(lookupRef as never) as {
                        getContents?: () => Uint8Array
                    } | undefined;
                    const lut = lookup?.getContents?.() ?? new Uint8Array(0);
                    const baseName = base instanceof PDFName ? base.asString() : "/DeviceRGB";
                    const comps = baseName === "/DeviceGray" ? 1 : baseName === "/DeviceCMYK" ? 4 : 3;
                    if (lut.length === 0) throw new Error("empty palette");
                    const out = new Uint8Array(pixelsCount * comps);
                    for (let i = 0; i < pixelsCount; i++) {
                        const idx = Math.min(data[i] ?? 0, Math.floor(lut.length / comps) - 1);
                        for (let c = 0; c < comps; c++) out[i * comps + c] = lut[idx * comps + c] ?? 0;
                    }
                    data = comps === 4 ? cmykToRgb(out, pixelsCount) : out;
                    channels = comps === 4 ? 3 : (comps as 1 | 3);
                } catch {
                    skipped.push({filter: filterLabel, reason: "indexed palette could not be resolved", width, height});
                    continue;
                }
            } else {
                channels = 3;
            }
            if (data.length < pixelsCount * channels) throw new Error("truncated pixel data");
            const png = await encodePng(width, height, channels, data);
            images.push(mk(new Blob([png as unknown as BlobPart], {type: "image/png"}), "png"));
        } catch (err) {
            skipped.push({filter: filterLabel, reason: (err as Error).message, width, height});
        }
    }

    return {images, skipped};
}
