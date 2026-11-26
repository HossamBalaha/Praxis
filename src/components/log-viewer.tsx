"use client";

import * as React from "react";
import {Filter, Loader2, Radio, Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import {markSpellWords} from "@/lib/spell-marks";

/**
 * the log file mode — `*.log` files get level coloring
 * (ERROR red / WARN amber / INFO sky / DEBUG gray), a filter box
 * (plain text or /regex/), a virtualized row window (huge logs render
 * only the visible slice), and an optional FOLLOW mode that re-reads
 * the tail every 2 s and keeps the view pinned to the bottom while a
 * run writes the file.
 */

type LogLevel = "error" | "warn" | "info" | "debug" | "trace" | "plain";

interface LogLine {
    index: number;
    text: string;
    level: LogLevel;
}

const LEVEL_RULES: Array<[RegExp, LogLevel]> = [
    [/\b(ERROR|CRITICAL|FATAL|PANIC|EXCEPTION|Traceback)\b/i, "error"],
    [/\b(WARN(?:ING)?|ALERT|DEPRECAT\w*)\b/i, "warn"],
    [/\b(INFO|NOTE|NOTICE|STATUS|OK)\b/i, "info"],
    [/\b(DEBUG|TRACE|VERBOSE)\b/i, "debug"],
];

function classify(text: string): LogLevel {
    for (const [re, level] of LEVEL_RULES) {
        if (re.test(text)) return level;
    }
    return "plain";
}

const LEVEL_CLASS: Record<LogLevel, string> = {
    error: "text-red-600 dark:text-red-400 bg-red-500/5",
    warn: "text-amber-600 dark:text-amber-400 bg-amber-500/5",
    info: "text-sky-700 dark:text-sky-300",
    debug: "text-muted-foreground",
    trace: "text-muted-foreground italic",
    plain: "",
};

const LEVEL_BADGE: Record<LogLevel, string> = {
    error: "bg-red-500/15 text-red-600 dark:text-red-400",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    info: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    debug: "bg-muted text-muted-foreground",
    trace: "bg-muted text-muted-foreground",
    plain: "bg-muted/50 text-muted-foreground",
};

interface LogViewerProps {
    content: string;
    contentTruncated?: boolean;
    /** Re-read the file (follow mode) — returns the fresh text. */
    refetch?: () => Promise<string | null>;
    fontScale?: number;
    /** spell-check misspelling words — when non-empty the
     * line text renders with the wavy-underlined marks (logs get the
     * same underlines every other spellable kind shows). */
    spellWords?: Set<string>;
    /** Click handler attached to each marked word (adds it to the
     *  project dictionary). */
    onIgnoreSpell?: (word: string) => void;
}

const ROW_HEIGHT = 20;
const OVERSCAN = 20;

export function LogViewer({
                              content,
                              contentTruncated,
                              refetch,
                              fontScale = 1,
                              spellWords,
                              onIgnoreSpell
                          }: LogViewerProps) {
    const [filter, setFilter] = React.useState("");
    const [levelFilter, setLevelFilter] = React.useState<LogLevel | "all">("all");
    const [follow, setFollow] = React.useState(false);
    const [liveText, setLiveText] = React.useState<string | null>(null);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = React.useState(0);
    const [viewportH, setViewportH] = React.useState(400);

    const text = liveText ?? content;

    const lines = React.useMemo<LogLine[]>(() => {
        const raw = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
        return raw.map((line, index) => ({index, text: line, level: classify(line)}));
    }, [text]);

    const filtered = React.useMemo(() => {
        let query: RegExp | null = null;
        const t = filter.trim();
        if (t.startsWith("/") && t.lastIndexOf("/") > 0) {
            const last = t.lastIndexOf("/");
            try {
                query = new RegExp(t.slice(1, last), "i");
            } catch {
                query = null;
            }
        }
        return lines.filter((l) => {
            if (levelFilter !== "all" && l.level !== levelFilter) return false;
            if (!t) return true;
            if (query) return query.test(l.text);
            return l.text.toLowerCase().includes(t.toLowerCase());
        });
    }, [lines, filter, levelFilter]);

    // Follow mode: poll refetch every 2 s; keep the view at the bottom.
    React.useEffect(() => {
        if (!follow || !refetch) return;
        let cancelled = false;
        const tick = async () => {
            const fresh = await refetch();
            if (!cancelled && fresh !== null && fresh !== text) {
                setLiveText(fresh);
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }
        };
        void tick();
        const timer = window.setInterval(() => void tick(), 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [follow, refetch]);

    React.useEffect(() => {
        setLiveText(null);
    }, [content]);

    // Viewport size observer.
    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
        ro.observe(el);
        setViewportH(el.clientHeight);
        return () => ro.disconnect();
    }, []);

    const counts = React.useMemo(() => {
        const c: Record<LogLevel, number> = {error: 0, warn: 0, info: 0, debug: 0, trace: 0, plain: 0};
        for (const l of lines) c[l.level]++;
        return c;
    }, [lines]);

    const rowHeight = ROW_HEIGHT * fontScale;
    const total = filtered.length;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const end = Math.min(total, Math.ceil((scrollTop + viewportH) / rowHeight) + OVERSCAN);
    const visible = filtered.slice(start, end);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Filter className="size-3 text-muted-foreground"/>
                <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="filter…  or /regex/"
                    className="h-7 w-44 text-[11px] font-mono"
                    aria-label="Log filter"
                />
                <div className="flex gap-1">
                    {(["all", "error", "warn", "info", "debug"] as const).map((lv) => (
                        <Button
                            key={lv}
                            size="sm"
                            variant={levelFilter === lv ? "default" : "ghost"}
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setLevelFilter(lv as LogLevel | "all")}
                            title={lv === "all" ? "All levels" : `Only ${lv.toUpperCase()} lines (${counts[lv]})`}
                        >
                            {lv === "all" ? "all" : lv.toUpperCase()}
                            {lv !== "all" && <span className="ml-1 opacity-70">{counts[lv]}</span>}
                        </Button>
                    ))}
                </div>
                <div className="flex-1"/>
                {refetch && (
                    <Button
                        size="sm"
                        variant={follow ? "default" : "outline"}
                        className="h-6 gap-1 text-[10px]"
                        onClick={() => setFollow((f) => !f)}
                        title="Follow the file — re-read every 2 s and stay pinned to the tail"
                    >
                        <Radio className={cn("size-3", follow && "text-red-400 animate-pulse")}/>
                        {follow ? "Following" : "Follow"}
                    </Button>
                )}
            </div>

            {/* Virtualized log body */}
            <div
                ref={scrollRef}
                onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
                className="flex-1 min-h-0 overflow-y-auto font-mono"
                style={{fontSize: `${12 * fontScale}px`}}
                data-testid="log-viewer-body"
            >
                {total === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">No lines match the filter.</p>
                ) : (
                    <div style={{height: `${total * rowHeight}px`, position: "relative"}}>
                        <div style={{transform: `translateY(${start * rowHeight}px)`}}>
                            {visible.map((l) => (
                                <div
                                    key={l.index}
                                    className={cn("flex items-start gap-2 px-3 whitespace-pre-wrap break-all", LEVEL_CLASS[l.level])}
                                    style={{minHeight: rowHeight, lineHeight: `${rowHeight}px`}}
                                >
                  <span
                      className={cn("text-[8px] uppercase tracking-wide rounded px-1 shrink-0 self-center", LEVEL_BADGE[l.level])}>
                    {l.level === "plain" ? "···" : l.level}
                  </span>
                                    <span
                                        className="text-[10px] text-muted-foreground/60 select-none shrink-0 self-center"
                                        title={`line ${l.index + 1}`}>
                    {l.index + 1}
                  </span>
                                    <span className="flex-1">
 {/* wavy-underlined spell marks inside the
                        virtualized rows (click = project dictionary). */}
                                        {spellWords && spellWords.size > 0 && onIgnoreSpell
                                            ? markSpellWords(l.text || " ", spellWords, onIgnoreSpell)
                                            : l.text || " "}
                  </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 px-3 py-1 border-t text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Search
                    className="size-2.5"/>{filtered.length.toLocaleString()} / {lines.length.toLocaleString()} lines</span>
                {counts.error > 0 && <span className="text-red-600 dark:text-red-400">{counts.error} errors</span>}
                {counts.warn > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.warn} warnings</span>}
                {follow &&
                  <span className="flex items-center gap-1"><Loader2 className="size-2.5 animate-spin"/> live</span>}
                {contentTruncated && <span className="italic">truncated at 1 MB</span>}
            </div>
        </div>
    );
}
