"use client";

import * as React from "react";
import {BookOpen, Copy, FileText, Loader2, RotateCw, Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";

/**
 * the PDF toolkit — page-thumbnail sidebar with jump
 * (#page=N in the iframe), in-document TEXT search (page-mapped, via
 * /api/pdf-info → pdftotext) and extract-text-to-clipboard, plus a
 * rotate-view control. Best-effort by design: when poppler (pdftoppm /
 * pdftotext) is missing the toolbar degrades to rotate-only and says
 * so — the iframe viewer keeps working regardless.
 */

interface PdfToolsProps {
    src: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    onLoaded?: () => void;
}

interface PdfInfo {
    ok: boolean;
    tools: { pdftoppm: boolean; pdftotext: boolean };
    pages: string[];
    textPages: string[];
}

export function PdfTools({src, fileName, folderSlug, fileSlug, onLoaded}: PdfToolsProps) {
    const {toast} = useToast();
    const [info, setInfo] = React.useState<PdfInfo | null>(null);
    const [infoError, setInfoError] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    const [rotation, setRotation] = React.useState(0);
    const [activePage, setActivePage] = React.useState(1);
    /** extract-text delivery (copy / save-as / into project). */
    const [extractOpen, setExtractOpen] = React.useState(false);
    const [extracted, setExtracted] = React.useState<string | null>(null);

    const loadInfo = React.useCallback(() => {
        setInfo(null);
        setInfoError(null);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/pdf-info?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                );
                const json = (await res.json()) as PdfInfo;
                if (!res.ok) throw new Error(json.ok === false ? "pdf info unavailable" : `HTTP ${res.status}`);
                setInfo(json);
            } catch (err) {
                setInfoError((err as Error).message);
            }
        })();
    }, [folderSlug, fileSlug]);

    React.useEffect(() => {
        loadInfo();
        setRotation(0);
        setActivePage(1);
        setQuery("");
    }, [folderSlug, fileSlug, loadInfo]);

    const matches = React.useMemo(() => {
        if (!query.trim() || !info?.textPages.length) return [];
        const q = query.toLowerCase();
        const out: Array<{ page: number; snippet: string }> = [];
        info.textPages.forEach((text, pageIdx) => {
            const lower = text.toLowerCase();
            let from = 0;
            while (out.length < 60) {
                const at = lower.indexOf(q, from);
                if (at < 0) break;
                out.push({
                    page: pageIdx + 1,
                    snippet: text.slice(Math.max(0, at - 40), at + q.length + 60).replace(/\s+/g, " ").trim(),
                });
                from = at + q.length;
            }
        });
        return out;
    }, [query, info]);

    const jumpToPage = (page: number) => {
        setActivePage(page);
        const iframe = document.getElementById("praxis-pdf-iframe") as HTMLIFrameElement | null;
        if (iframe) {
            // #page=N works in Chromium's and Firefox's built-in PDF viewers.
            iframe.src = `${src.split("#")[0]}#page=${page}`;
        }
    };

    const extractText = () => {
        if (!info?.textPages.length) {
            toast({
                title: "Text extraction unavailable",
                description: "pdftotext (poppler) is not installed on this machine.",
                variant: "destructive",
            });
            return;
        }
        const text = info.textPages
            .map((t, i) => `── page ${i + 1} ──\n${t.trim()}`)
            .join("\n\n");
        // ask what to do — copy, save-as, or save into the
        // project folder (was: silent clipboard-only copy).
        setExtracted(text);
        setExtractOpen(true);
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    title="Rotate the view 90° (display-only)"
                >
                    <RotateCw className="size-3.5"/>
                </Button>
                <div className="flex items-center gap-1">
                    <Search className="size-3 text-muted-foreground"/>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="search text…"
                        className="h-7 w-36 text-[11px]"
                        aria-label="Search in document"
                    />
                    {query.trim() && info && (
                        <span className="text-[10px] text-muted-foreground">{matches.length} hit(s)</span>
                    )}
                </div>
                <div className="flex-1"/>
                {/* The duplicate
Tools ▸ dropdown here was REMOVED — the FileViewer header's
Tools menu (next to the zoom cluster) is the single entry
point for the toolbox suites now, which also saves a row of
horizontal space. */}
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={extractText}
                        title="Extract the full text, then choose copy / save-as / save into project">
                    <Copy className="size-3.5"/> Extract text…
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={loadInfo}
                        title="Reload thumbnails + text">
                    <FileText className="size-3.5"/> Refresh
                </Button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Thumbnail sidebar */}
                <div className="w-24 shrink-0 border-r overflow-y-auto p-1.5 space-y-1.5 bg-muted/5">
                    {!info && !infoError && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground p-2">
                            <Loader2 className="size-3 animate-spin"/> pages…
                        </div>
                    )}
                    {infoError && <p className="text-[9px] text-muted-foreground p-2 italic">thumbnails unavailable</p>}
                    {info && info.pages.length === 0 && info.tools.pdftoppm === false && (
                        <p className="text-[9px] text-muted-foreground p-2 italic"
                           title="Install poppler to enable thumbnails">
                            no pdftoppm
                        </p>
                    )}
                    {info?.pages.map((dataUrl, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => jumpToPage(i + 1)}
                            className={cn(
                                "w-full rounded border-2 overflow-hidden transition",
                                activePage === i + 1 ? "border-emerald-500" : "border-transparent hover:border-muted"
                            )}
                            title={`Jump to page ${i + 1}`}
                        >
                            <img src={dataUrl} alt={`Page ${i + 1}`} className="w-full"/>
                            <span className="block text-[9px] text-muted-foreground text-center py-0.5">{i + 1}</span>
                        </button>
                    ))}
                </div>

                {/* Viewer + search results */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {query.trim() && (
                        <div className="max-h-40 overflow-y-auto border-b bg-muted/10">
                            {info && !info.tools.pdftotext && (
                                <p className="text-[10px] text-muted-foreground p-2 italic">
                                    Search needs pdftotext (poppler) on this machine.
                                </p>
                            )}
                            {info?.tools.pdftotext && matches.length === 0 && (
                                <p className="text-[10px] text-muted-foreground p-2">No text hits.</p>
                            )}
                            {matches.map((m, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/60 border-b border-border/40"
                                    onClick={() => jumpToPage(m.page)}
                                >
                                    <span
                                        className="text-[9px] uppercase tracking-wide text-muted-foreground mr-1.5">p.{m.page}</span>
                                    <span className="font-mono">…{m.snippet}…</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 min-h-0 grid place-items-center overflow-auto p-2">
                        <iframe
                            id="praxis-pdf-iframe"
                            src={`${src}#page=${activePage}`}
                            title={fileName}
                            onLoad={onLoaded}
                            className="w-full h-full min-h-[420px] rounded border bg-muted/20"
                            style={{transform: `rotate(${rotation}deg)`}}
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-3 py-1 border-t text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1 truncate"><BookOpen className="size-2.5"/> {fileName}</span>
                {info && (
                    <span>
            {info.pages.length || (info.textPages.length || 0)} page(s) · thumbnails {info.tools.pdftoppm ? "on" : "off"} · text {info.tools.pdftotext ? "on" : "off"}
          </span>
                )}
                {rotation > 0 && <span>rotated {rotation}°</span>}
            </div>

            {/* extracted-text delivery dialog. */}
            <OutputDeliveryDialog
                open={extractOpen}
                onOpenChange={setExtractOpen}
                title="Extracted Text Ready"
                description={`${info?.textPages.length ?? 0} page(s) — choose copy, save-as…, or save into the project folder.`}
                text={extracted}
                defaultName={`${fileName.replace(/\.[^.]+$/, "")}-text.txt`}
                folderSlug={folderSlug}
            />
        </div>
    );
}
