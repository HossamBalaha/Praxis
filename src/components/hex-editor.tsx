"use client";

import * as React from "react";
import {Binary, Loader2, RotateCcw, Search, TriangleAlert, Undo2,} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * HexEditor — the 64 KB-chunked binary viewer / in-place byte editor.
 *
 * Rendering: 16 (8 / 32) bytes per row, VIRTUALIZED with plain scroll math
 * (no react-window): rows are absolutely positioned inside a fixed-height
 * inner container, and only the visible slice (+ overscan) is mounted —
 * a 64 KB chunk is ~4000 rows, so windowing is mandatory.
 *
 * Editing: an explicit toggle (in-place edits cannot be undone after the
 * viewer closes). Clicking a byte focuses its hex cell; typing two hex
 * digits commits the byte locally, queues the patch, and the flush runs
 * 500 ms after the last keystroke, grouping CONTIGUOUS pending bytes into
 * one PATCH request. An in-session undo stack plus "Revert all" patches
 * old values back the same debounced way.
 */

const CHUNK = 64 * 1024;
const ROW_H = 24;
const OVERSCAN = 8;
const VIEWPORT_H = 480;
const SCAN_CAP = 50 * 1024 * 1024;

interface HexEditorProps {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    totalSize?: number;
}

interface BytesGetResponse {
    ok?: boolean;
    bytes?: string;
    offset?: number;
    totalSize?: number;
    fileName?: string;
    error?: string;
}

interface BytesPatchResponse {
    ok?: boolean;
    written?: number;
    error?: string;
}

interface UndoEntry {
    offset: number;
    old: number;
    value: number;
}

function base64ToBytes(b64: string): Uint8Array {
    if (!b64) return new Uint8Array(0);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    // 32 KB steps — String.fromCharCode has an argument-count ceiling
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
    }
    return btoa(bin);
}

function hex8(n: number): string {
    return n.toString(16).toUpperCase().padStart(8, "0");
}

function hex2(n: number): string {
    return n.toString(16).toUpperCase().padStart(2, "0");
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "DE AD BE EF" / "DEADBEEF" -> bytes; null when the text is not hex. */
function parseHexPattern(q: string): Uint8Array | null {
    const t = q.trim().replace(/\s+/g, "");
    if (t.length === 0 || t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) return null;
    const out = new Uint8Array(t.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function findPattern(buf: Uint8Array, pat: Uint8Array, from = 0): number {
    if (pat.length === 0 || pat.length > buf.length) return -1;
    outer: for (let i = from; i <= buf.length - pat.length; i++) {
        for (let j = 0; j < pat.length; j++) {
            if (buf[i + j] !== pat[j]) continue outer;
        }
        return i;
    }
    return -1;
}

/** 0x1A2B (hex) | 1234 (decimal) | 1A2B (hex, letters present). */
function parseOffsetInput(s: string): number {
    const t = s.trim();
    if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
    if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
    if (/^[0-9a-f]+$/i.test(t) && /[a-f]/i.test(t)) return parseInt(t, 16);
    return Number.NaN;
}

function isPrintable(b: number): boolean {
    return b >= 0x20 && b <= 0x7e;
}

function asciiChar(b: number): string {
    return isPrintable(b) ? String.fromCharCode(b) : "\u00b7";
}

export function HexEditor({folderSlug, fileSlug, fileName, totalSize}: HexEditorProps) {
    const {toast} = useToast();

    const [size, setSize] = React.useState<number | null>(totalSize ?? null);
    const sizeRef = React.useRef<number | null>(totalSize ?? null);
    const [chunkStart, setChunkStart] = React.useState(0);
    const [chunk, setChunk] = React.useState<Uint8Array | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [scrollTop, setScrollTop] = React.useState(0);
    const [bpr, setBpr] = React.useState<8 | 16 | 32>(16);
    const [editing, setEditing] = React.useState(false);
    const [focusCell, setFocusCell] = React.useState<number | null>(null);
    const [nibble, setNibble] = React.useState<{ offset: number; high: string } | null>(null);
    const [gotoText, setGotoText] = React.useState("");
    const [searchText, setSearchText] = React.useState("");
    const [searchProgress, setSearchProgress] = React.useState<number | null>(null);
    const [chunkNote, setChunkNote] = React.useState<string | null>(null);
    const [pendingCount, setPendingCount] = React.useState(0);
    const [undoCount, setUndoCount] = React.useState(0);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const pendingRef = React.useRef<Map<number, number>>(new Map());
    const undoRef = React.useRef<UndoEntry[]>([]);
    const timerRef = React.useRef<number | null>(null);
    const abortScanRef = React.useRef(false);
    const flushRef = React.useRef<(() => Promise<void>) | null>(null);
    const chunkStartRef = React.useRef(0);

    const setErrorSize = (n: number): void => {
        sizeRef.current = n;
        setSize(n);
    };

    // ── chunk loading ─────────────────────────────────────────────────────

    const fetchChunk = React.useCallback(
        async (offset: number): Promise<void> => {
            const total = sizeRef.current;
            let base = Math.floor(Math.max(0, offset) / CHUNK) * CHUNK;
            if (total !== null && total > 0) {
                const maxBase = Math.floor((total - 1) / CHUNK) * CHUNK;
                if (base > maxBase) base = maxBase;
            } else if (total !== null && total === 0) {
                base = 0;
            }
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/bytes?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}&offset=${base}&length=${CHUNK}`
                );
                const data = (await res.json()) as BytesGetResponse;
                if (!res.ok || !data.ok || typeof data.bytes !== "string") {
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                if (typeof data.totalSize === "number") setErrorSize(data.totalSize);
                setChunk(base64ToBytes(data.bytes));
                chunkStartRef.current = base;
                setChunkStart(base);
            } catch (err) {
                setChunk(null);
                setError(err instanceof Error ? err.message : "Could not load bytes.");
            } finally {
                setLoading(false);
            }
        },
        [folderSlug, fileSlug]
    );

    React.useEffect(() => {
        void fetchChunk(0);
    }, [fetchChunk]);

    // Keep the latest flusher for the unmount cleanup (pending writes are
    // fired once — losing them on close would strand local-only edits).
    React.useEffect(() => {
        return () => {
            void flushRef.current?.();
        };
    }, []);

    // ── pending byte patches (500 ms debounce, contiguous-run batching) ──

    const flushPending = React.useCallback(async (): Promise<void> => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const entries = Array.from(pendingRef.current.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([offset, value]) => ({offset, value}));
        if (entries.length === 0) return;
        const runs: Array<{ offset: number; bytes: number[] }> = [];
        for (const en of entries) {
            const lastRun = runs[runs.length - 1];
            if (lastRun && en.offset === lastRun.offset + lastRun.bytes.length) {
                lastRun.bytes.push(en.value);
            } else {
                runs.push({offset: en.offset, bytes: [en.value]});
            }
        }
        for (const run of runs) {
            try {
                const res = await fetch("/api/bytes", {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: folderSlug,
                        file: fileSlug,
                        offset: run.offset,
                        bytes: bytesToBase64(Uint8Array.from(run.bytes)),
                    }),
                });
                const data = (await res.json()) as BytesPatchResponse;
                if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                for (let i = 0; i < run.bytes.length; i++) pendingRef.current.delete(run.offset + i);
            } catch (err) {
                // server state wins — resync the window from disk and drop the queue
                toast({
                    title: "Byte write failed",
                    description: err instanceof Error ? err.message : "The chunk will be reloaded from disk.",
                    variant: "destructive",
                });
                pendingRef.current.clear();
                setPendingCount(pendingRef.current.size);
                void fetchChunk(chunkStartRef.current);
                return;
            }
        }
        setPendingCount(pendingRef.current.size);
    }, [folderSlug, fileSlug, toast, fetchChunk]);

    React.useEffect(() => {
        flushRef.current = flushPending;
    }, [flushPending]);

    const queuePatch = React.useCallback((offset: number, value: number): void => {
        pendingRef.current.set(offset, value);
        setPendingCount(pendingRef.current.size);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            void flushRef.current?.();
        }, 500);
    }, []);

    const revertLocal = React.useCallback(
        (offset: number, value: number): void => {
            setChunk((prev) => {
                if (!prev) return prev;
                const idx = offset - chunkStartRef.current;
                if (idx < 0 || idx >= prev.length) return prev;
                const next = new Uint8Array(prev.length);
                next.set(prev);
                next[idx] = value;
                return next;
            });
        },
        []
    );

    const applyByteEdit = React.useCallback(
        (offset: number, value: number): void => {
            const current = chunk;
            if (!current) return;
            const idx = offset - chunkStartRef.current;
            if (idx < 0 || idx >= current.length) return;
            const old = current[idx];
            if (old === value) return;
            const next = new Uint8Array(current.length);
            next.set(current);
            next[idx] = value;
            setChunk(next);
            undoRef.current.push({offset, old, value});
            setUndoCount(undoRef.current.length);
            queuePatch(offset, value);
        },
        [chunk, queuePatch]
    );

    const undoLast = React.useCallback(async (): Promise<void> => {
        if (undoRef.current.length === 0) return;
        await flushPending();
        const entry = undoRef.current.pop();
        if (!entry) return;
        setUndoCount(undoRef.current.length);
        revertLocal(entry.offset, entry.old);
        queuePatch(entry.offset, entry.old);
    }, [flushPending, queuePatch, revertLocal]);

    const revertAll = React.useCallback(async (): Promise<void> => {
        if (undoRef.current.length === 0) return;
        await flushPending();
        const entries = [...undoRef.current].reverse();
        undoRef.current = [];
        setUndoCount(0);
        for (const en of entries) {
            revertLocal(en.offset, en.old);
            queuePatch(en.offset, en.old);
        }
    }, [flushPending, queuePatch, revertLocal]);

    // ── navigation ────────────────────────────────────────────────────────

    const goTo = React.useCallback(
        async (absolute: number): Promise<boolean> => {
            const total = sizeRef.current;
            if (Number.isNaN(absolute) || absolute < 0) {
                toast({title: "Invalid offset", description: "Use hex (0x1A2B) or decimal.", variant: "destructive"});
                return false;
            }
            if (total !== null && absolute >= total) {
                toast({
                    title: "Offset beyond end of file",
                    description: `File is ${formatBytes(total)}.`,
                    variant: "destructive"
                });
                return false;
            }
            if (!chunk || absolute < chunkStartRef.current || absolute >= chunkStartRef.current + chunk.length) {
                await fetchChunk(absolute);
            }
            setFocusCell(absolute);
            setNibble(null);
            return true;
        },
        [chunk, fetchChunk, toast]
    );

    const ensureFocus = React.useCallback(
        async (target: number): Promise<void> => {
            const total = sizeRef.current;
            if (target < 0 || (total !== null && target >= total)) return;
            if (chunk && target >= chunkStartRef.current && target < chunkStartRef.current + chunk.length) {
                setFocusCell(target);
                setNibble(null);
                return;
            }
            await fetchChunk(target);
            setFocusCell(target);
            setNibble(null);
        },
        [chunk, fetchChunk]
    );

    // scroll the focused row into view + focus its cell button
    React.useEffect(() => {
        if (focusCell === null || !chunk) return;
        const row = Math.floor((focusCell - chunkStart) / bpr);
        const el = containerRef.current;
        if (el) {
            const top = row * ROW_H;
            if (top < el.scrollTop) el.scrollTop = top;
            else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
        }
        const cell = el?.querySelector<HTMLButtonElement>(`[data-cell="${focusCell}"]`);
        if (cell) cell.focus();
    }, [focusCell, chunk, chunkStart, bpr]);

    // ── search ───────────────────────────────────────────────────────────

    const searchPattern = React.useCallback((): Uint8Array | null => {
        const q = searchText.trim();
        if (!q) return null;
        const hex = parseHexPattern(q);
        if (hex) return hex;
        return new TextEncoder().encode(q);
    }, [searchText]);

    const searchLoadedChunk = React.useCallback(async (): Promise<void> => {
        const pat = searchPattern();
        if (!pat || !chunk) {
            setChunkNote(pat ? "no chunk loaded" : "empty pattern");
            return;
        }
        const idx = findPattern(chunk, pat);
        if (idx !== -1) {
            setChunkNote(`found at 0x${(chunkStart + idx).toString(16).toUpperCase()}`);
            await goTo(chunkStart + idx);
        } else {
            setChunkNote("not in the loaded chunk — try whole-file search");
        }
    }, [searchPattern, chunk, chunkStart, goTo]);

    const searchWholeFile = React.useCallback(async (): Promise<void> => {
        const pat = searchPattern();
        const total = sizeRef.current;
        if (!pat || total === null) return;
        if (total > SCAN_CAP) {
            toast({
                title: "File too large to scan",
                description: "The whole-file search caps at 50 MB.",
                variant: "destructive"
            });
            return;
        }
        abortScanRef.current = false;
        setSearchProgress(0);
        try {
            // carry the last (patternLen - 1) bytes across chunk edges so a
            // match spanning two fetches is still found
            let carry: Uint8Array | null = null;
            for (let off = 0; off < total; off += CHUNK) {
                if (abortScanRef.current) return;
                const len = Math.min(CHUNK, total - off);
                const res = await fetch(
                    `/api/bytes?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}&offset=${off}&length=${len}`
                );
                const data = (await res.json()) as BytesGetResponse;
                if (!res.ok || !data.ok || typeof data.bytes !== "string") {
                    throw new Error(data.error ?? `HTTP ${res.status}`);
                }
                const bytes = base64ToBytes(data.bytes);
                const carryLen = carry ? carry.length : 0;
                const combined = carry
                    ? (() => {
                        const c = new Uint8Array(carry.length + bytes.length);
                        c.set(carry);
                        c.set(bytes, carry.length);
                        return c;
                    })()
                    : bytes;
                const idx = findPattern(combined, pat);
                if (idx !== -1 && idx + pat.length > carryLen) {
                    const absolute = off - carryLen + idx;
                    setSearchProgress(null);
                    setChunkNote(`found at 0x${absolute.toString(16).toUpperCase()}`);
                    toast({
                        title: "Pattern found",
                        description: `At offset 0x${absolute.toString(16).toUpperCase()} (${absolute}).`
                    });
                    await goTo(absolute);
                    return;
                }
                carry = bytes.slice(Math.max(0, bytes.length - (pat.length - 1)));
                setSearchProgress(Math.min(100, Math.round(((off + len) / total) * 100)));
            }
            setChunkNote("pattern not found");
            toast({title: "Pattern not found", description: `Scanned ${formatBytes(total)}.`});
        } catch (err) {
            toast({
                title: "Search failed",
                description: err instanceof Error ? err.message : "Could not scan the file.",
                variant: "destructive",
            });
        } finally {
            setSearchProgress(null);
        }
    }, [searchPattern, folderSlug, fileSlug, goTo, toast]);

    // ── keyboard ──────────────────────────────────────────────────────────

    const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (focusCell === null) return;
        const key = e.key;

        if (editing && /^[0-9a-fA-F]$/.test(key)) {
            e.preventDefault();
            if (nibble && nibble.offset === focusCell) {
                const value = parseInt(`${nibble.high}${key}`, 16);
                applyByteEdit(focusCell, value);
                setNibble(null);
                const chunkEnd = chunk ? chunkStartRef.current + chunk.length : 0;
                if (focusCell + 1 < chunkEnd) setFocusCell(focusCell + 1);
            } else {
                setNibble({offset: focusCell, high: key.toUpperCase()});
            }
            return;
        }
        if (key === "Backspace" && nibble) {
            e.preventDefault();
            setNibble(null);
            return;
        }

        const lastByte = chunk ? chunkStartRef.current + chunk.length - 1 : -1;
        const pageBytes = Math.max(1, Math.floor(VIEWPORT_H / ROW_H) * bpr);
        switch (key) {
            case "ArrowLeft":
                e.preventDefault();
                if (focusCell > chunkStartRef.current) setFocusCell(focusCell - 1);
                return;
            case "ArrowRight":
                e.preventDefault();
                if (focusCell < lastByte) setFocusCell(focusCell + 1);
                return;
            case "ArrowUp":
                e.preventDefault();
                void ensureFocus(focusCell - bpr);
                return;
            case "ArrowDown":
                e.preventDefault();
                void ensureFocus(focusCell + bpr);
                return;
            case "PageUp":
                e.preventDefault();
                if (focusCell - pageBytes >= chunkStartRef.current) setFocusCell(focusCell - pageBytes);
                else void ensureFocus(chunkStartRef.current - 1);
                return;
            case "PageDown":
                e.preventDefault();
                if (focusCell + pageBytes <= lastByte) setFocusCell(focusCell + pageBytes);
                else void ensureFocus(lastByte + 1);
                return;
            default:
                return;
        }
    };

    // ── virtualization math ───────────────────────────────────────────────

    // The grid closes over a NON-NULL local so the row closures never
    // capture the nullable chunk state (TS cannot keep narrowing inside
    // callbacks).
    const rowsData = chunk ?? new Uint8Array(0);
    const rows = Math.ceil(rowsData.length / bpr);
    const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const lastRow = Math.min(
        rows,
        Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN
    );
    const visibleRows: number[] = [];
    for (let r = firstRow; r < lastRow; r++) visibleRows.push(r);
    const totalChunks = size !== null && size > 0 ? Math.ceil(size / CHUNK) : 0;
    const currentChunkIndex = totalChunks > 0 ? Math.floor(chunkStart / CHUNK) + 1 : 0;

    // ── render ────────────────────────────────────────────────────────────

    return (
        <Card className="gap-4 p-4" aria-label={`${fileName} hex editor`}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Binary className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
                    <span className="truncate font-mono text-xs font-medium" title={fileName}>
            {fileName}
          </span>
                    <Badge variant="secondary" className="text-xs">
                        {size !== null ? formatBytes(size) : "…"}
                    </Badge>
                    {totalChunks > 0 && (
                        <Badge variant="outline" className="text-xs">
                            chunk {currentChunkIndex}/{totalChunks}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Input
                        value={gotoText}
                        onChange={(e) => setGotoText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void goTo(parseOffsetInput(gotoText));
                        }}
                        placeholder="Go to offset (0x…)"
                        aria-label="Go to offset, hex or decimal"
                        className="h-8 w-40 font-mono text-xs"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void goTo(parseOffsetInput(gotoText))}
                        aria-label="Go to offset"
                    >
                        Go
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Input
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void searchLoadedChunk();
                        }}
                        placeholder="Search hex (DE AD BE) or text"
                        aria-label="Search pattern, hex bytes or plain text"
                        className="h-8 w-48 font-mono text-xs"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void searchLoadedChunk()}
                        aria-label="Search the loaded chunk"
                    >
                        <Search className="size-3.5" aria-hidden="true"/>
                        Find
                    </Button>
                    {searchProgress === null ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void searchWholeFile()}
                            disabled={loading || size === null}
                            aria-label="Search the whole file"
                        >
                            Whole file
                        </Button>
                    ) : (
                        <Badge variant="secondary" className="gap-1 text-xs">
                            <Loader2 className="size-3 animate-spin" aria-hidden="true"/>
                            scanning {searchProgress}%
                        </Badge>
                    )}
                    {searchProgress !== null && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                abortScanRef.current = true;
                            }}
                            aria-label="Stop the whole-file scan"
                        >
                            Stop
                        </Button>
                    )}
                </div>

                <Select
                    value={String(bpr)}
                    onValueChange={(v) => setBpr(Number(v) as 8 | 16 | 32)}
                >
                    <SelectTrigger size="sm" className="w-24 text-xs" aria-label="Bytes per row">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="8" className="text-xs">8 / row</SelectItem>
                        <SelectItem value="16" className="text-xs">16 / row</SelectItem>
                        <SelectItem value="32" className="text-xs">32 / row</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant={editing ? "destructive" : "outline"}
                        onClick={() => {
                            setEditing((v) => !v);
                            setNibble(null);
                        }}
                        aria-label="Toggle in-place byte editing"
                    >
                        {editing ? "Editing on" : "Enable editing"}
                    </Button>
                    {editing && (
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void undoLast()}
                                disabled={undoCount === 0}
                                aria-label="Undo the last byte edit"
                            >
                                <Undo2 className="size-3.5" aria-hidden="true"/>
                                Undo
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void revertAll()}
                                disabled={undoCount === 0}
                                aria-label="Revert all byte edits from this session"
                            >
                                <RotateCcw className="size-3.5" aria-hidden="true"/>
                                Revert all
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {editing && (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                    role="status"
                >
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true"/>
                    <span>
            In-place byte edits cannot be undone after the viewer closes. Undo and Revert all only cover this session.
          </span>
                    {pendingCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                            {pendingCount} pending write{pendingCount === 1 ? "" : "s"}
                        </Badge>
                    )}
                </div>
            )}

            {chunkNote && !error && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {chunkNote}
                </p>
            )}

            {error ? (
                <div
                    className="flex h-48 items-center justify-center rounded-md border bg-muted/30 p-4 text-xs text-destructive">
                    {error}
                    <Button size="sm" variant="outline" className="ml-3"
                            onClick={() => void fetchChunk(chunkStartRef.current)}>
                        Retry
                    </Button>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    role="grid"
                    aria-label={`${fileName} hex view, ${bpr} bytes per row`}
                    tabIndex={0}
                    onKeyDown={onGridKeyDown}
                    onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                    className="h-[480px] overflow-y-auto rounded-md border bg-muted/30 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
                >
                    {loading && !chunk ? (
                        <div className="space-y-2" aria-label="Loading bytes">
                            {Array.from({length: 18}).map((_, i) => (
                                <Skeleton key={i} className="h-5 w-full"/>
                            ))}
                        </div>
                    ) : chunk && chunk.length === 0 ? (
                        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                            Empty file (0 bytes).
                        </div>
                    ) : (
                        <div className="relative font-mono text-xs" style={{height: rows * ROW_H}}>
                            {visibleRows.map((row) => {
                                const rowOffset = chunkStart + row * bpr;
                                return (
                                    <div
                                        key={rowOffset}
                                        role="row"
                                        className="absolute left-0 right-0 flex items-center gap-3"
                                        style={{top: row * ROW_H, height: ROW_H}}
                                        aria-label={`Row at offset 0x${hex8(rowOffset)}`}
                                    >
                    <span className="w-20 shrink-0 select-none text-muted-foreground" role="rowheader">
                      {hex8(rowOffset)}
                    </span>
                                        <div className="flex shrink-0 items-center gap-0.5" role="gridcell"
                                             aria-hidden="true">
                                            {Array.from({length: bpr}).map((_, i) => {
                                                const idx = row * bpr + i;
                                                const off = rowOffset + i;
                                                if (idx >= rowsData.length) {
                                                    return (
                                                        <span key={i}
                                                              className="w-6 shrink-0 text-center text-muted-foreground/30">
                              –
                            </span>
                                                    );
                                                }
                                                const value = rowsData[idx];
                                                const isFocused = focusCell === off;
                                                const isPending = pendingRef.current.has(off);
                                                const half = nibble && nibble.offset === off ? `${nibble.high}_` : hex2(value);
                                                return (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        data-cell={off}
                                                        tabIndex={-1}
                                                        disabled={!editing}
                                                        aria-label={`Byte at offset 0x${hex8(off)}: 0x${hex2(value)}`}
                                                        onClick={() => {
                                                            setFocusCell(off);
                                                            setNibble(null);
                                                        }}
                                                        className={cn(
                                                            "h-5 w-6 shrink-0 rounded-sm text-center leading-5 transition-colors",
                                                            isFocused
                                                                ? "bg-primary text-primary-foreground"
                                                                : isPending
                                                                    ? "font-semibold text-amber-600 dark:text-amber-400"
                                                                    : "text-foreground",
                                                            editing && !isFocused && "hover:bg-accent"
                                                        )}
                                                    >
                                                        {half}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex shrink-0 items-center" aria-hidden="true">
                                            {Array.from({length: bpr}).map((_, i) => {
                                                const idx = row * bpr + i;
                                                if (idx >= rowsData.length) {
                                                    return (
                                                        <span key={i}
                                                              className="w-2.5 text-center text-muted-foreground/30">
                              ·
                            </span>
                                                    );
                                                }
                                                const off = rowOffset + i;
                                                return (
                                                    <span
                                                        key={i}
                                                        className={cn(
                                                            "w-2.5 text-center",
                                                            focusCell === off
                                                                ? "font-bold text-primary"
                                                                : pendingRef.current.has(off)
                                                                    ? "text-amber-600 dark:text-amber-400"
                                                                    : "text-muted-foreground"
                                                        )}
                                                    >
                            {asciiChar(rowsData[idx])}
                          </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>offset: hex address</span>
                <span>middle: hex bytes</span>
                <span>right: ASCII (· = non-printable)</span>
                {editing && <span>click a byte, then type two hex digits</span>}
                <span>PageUp / PageDown load adjacent 64 KB chunks</span>
            </div>
        </Card>
    );
}
