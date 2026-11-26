"use client";

import * as React from "react";
import {
    Bookmark,
    ChevronDown,
    Code2,
    Copy,
    Download,
    Globe,
    History,
    Loader2,
    Pencil,
    Play,
    Plus,
    Save,
    Send,
    Settings2,
    Timer,
    Trash2,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {JsonInspector} from "@/components/json-inspector";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";

/**
 * the .http / .rest API client workbench — a full-pane request builder
 * (method / URL / headers / body + {{variable}} substitution from a
 * localStorage environment set) that sends through the server-side
 * /api/http-proxy relay (no browser CORS), and renders the response
 * (status chip, timing, size, headers, JSON tree via the shared
 * JsonInspector).
 *
 * When a .http file is passed as `content` it is PRE-PARSED into the
 * builder (`###` separators, `METHOD url`, `key: value` headers, blank
 * line then body; multiple requests per file get a picker strip) and
 * every builder edit serializes back into .http source text shown in a
 * read-only collapsible Source section — "Save to file" pushes it
 * through onSaved.
 *
 * History (last 20 requests) and named collections live in
 * localStorage; both re-send with one click.
 */

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface HeaderRow {
    key: string;
    value: string;
}

/** One request of a .http file (and the builder's model). */
interface HttpRequest {
    name?: string;
    method: HttpMethod;
    url: string;
    headers: HeaderRow[];
    body?: string;
}

/** An {{variable}} environment. */
interface HttpEnv {
    name: string;
    vars: Record<string, string>;
}

interface HistoryEntry {
    id: string;
    method: HttpMethod;
    url: string;
    headers: HeaderRow[];
    body?: string;
    at: number;
    status?: number;
}

interface CollectionEntry {
    id: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers: HeaderRow[];
    body?: string;
}

/** Successful /api/http-proxy response (mirrors the route). */
interface ProxyResponse {
    ok: true;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    bodyText: string;
    truncated?: boolean;
    sizeBytes: number;
    timeMs: number;
    redirects?: number;
    finalUrl?: string;
}

interface ApiClientWorkbenchProps {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** The .http file's current text — parsed into the builder on load. */
    content?: string;
    /** Save-back path for the serialized .http source. */
    onSaved?: (newContent: string) => void;
    /** Round 3 — true while the workbench backs an UNTITLED in-memory
     *  draft tab: the Save control becomes "Save As…", never writes
     *  behind the user's back, and the page's onSaved opens a
     *  destination picker instead of a silent disk write. */
    untitled?: boolean;
    /** Round 3 — live draft sync. The page stores every serialized
     *  source change (builder edits) into its in-memory draft map, so
     *  switching tabs and coming back — or pressing ⌘S later — always
     *  sees the latest text. Fire-and-forget; no re-render round trip. */
    onSourceChange?: (next: string) => void;
}

// ── localStorage keys (all under the app's STORAGE_PREFIX) ──────────
const ENVS_KEY = `${STORAGE_PREFIX}.http.envs`;
const ACTIVE_ENV_KEY = `${STORAGE_PREFIX}.http.activeEnv`;
const HISTORY_KEY = `${STORAGE_PREFIX}.http.history`;
const COLLECTIONS_KEY = `${STORAGE_PREFIX}.http.collections`;
const HISTORY_MAX = 20;

/** Webkit scrollbar styling for the inline scroll areas. */
const SCROLLBAR =
    "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent";

// ─── pure .http parser / serializer / var substitution ──────────────

/** Parse .http source: `###` separators (rest of that line = the
 *  request name), a `METHOD url` request line, `key: value` header
 *  lines, then a blank line and the body. `#` lines are comments.
 *  Multiple requests per file; unparseable blocks are skipped. */
function parseHttpFile(text: string): HttpRequest[] {
    const requests: HttpRequest[] = [];
    // split-with-capture -> [lead, name1, block1, name2, block2, ...]
    const parts = text.split(/^###[ \t]*(.*)$/m);
    const blocks: Array<{ name?: string; body: string }> = [];
    if (parts[0] && parts[0].trim() !== "") blocks.push({body: parts[0]});
    for (let i = 1; i < parts.length; i += 2) {
        blocks.push({name: parts[i].trim() || undefined, body: parts[i + 1] ?? ""});
    }
    for (const block of blocks) {
        const lines = block.body.split("\n");
        let method: HttpMethod | null = null;
        let url = "";
        let bodyStart = -1;
        const headers: HeaderRow[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (method === null) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)$/i.exec(trimmed);
                if (m) {
                    method = m[1].toUpperCase() as HttpMethod;
                    url = m[2];
                    continue; // proceed to the header / body lines below
                }
                // no request line at the block top — skip the block entirely
                break;
            }
            if (bodyStart === -1) {
                if (line.trim() === "") {
                    bodyStart = i + 1; // blank line — the body starts after it
                    continue;
                }
                if (line.startsWith("#")) continue; // comment between headers
                const h = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s?(.*)$/.exec(line);
                if (h) {
                    headers.push({key: h[1], value: h[2]});
                    continue;
                }
                bodyStart = i; // lenient: a non-header line starts the body
                break;
            }
        }
        if (method === null) continue;
        const body = bodyStart >= 0 ? lines.slice(bodyStart).join("\n").trim() : "";
        requests.push({
            name: block.name,
            method,
            url,
            headers,
            body: body !== "" ? body : undefined,
        });
    }
    return requests;
}

/** Serialize the builder requests back into .http source (round-trips
 *  the parser): `### name`, `METHOD url`, `key: value`, blank, body. */
function serializeHttpFile(requests: HttpRequest[]): string {
    const blocks = requests.map((r, i) => {
        const name = r.name?.trim() || `${r.method} ${r.url}`.slice(0, 48) || `request-${i + 1}`;
        const lines: string[] = [`### ${name}`, `${r.method} ${r.url}`];
        for (const h of r.headers) {
            if (h.key.trim()) lines.push(`${h.key}: ${h.value}`);
        }
        if (r.body && r.body.trim() !== "") {
            lines.push("", r.body.replace(/\s+$/, ""));
        }
        return lines.join("\n");
    });
    return `${blocks.join("\n\n")}\n`;
}

/** Replace {{var}} placeholders from the active environment's vars.
 *  Unknown vars stay LITERAL so they remain visible and fixable. */
function substituteVars(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key: string) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole
    );
}

// ─── small pure helpers ─────────────────────────────────────────────

function rowsFromVars(vars: Record<string, string>): HeaderRow[] {
    return Object.entries(vars).map(([key, value]) => ({key, value}));
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extension guessed from the response content-type. */
function extForContentType(contentType: string): string {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    if (mime.includes("json")) return ".json";
    if (mime.includes("html")) return ".html";
    if (mime.includes("xml")) return ".xml";
    if (mime.includes("csv")) return ".csv";
    if (mime.includes("javascript")) return ".js";
    if (mime.includes("markdown")) return ".md";
    return ".txt";
}

function statusChipClass(status: number): string {
    if (status >= 200 && status < 300) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    if (status >= 300 && status < 400) return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
    if (status >= 400 && status < 500) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    if (status >= 500) return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    return "bg-muted text-muted-foreground border-border";
}

function downloadText(fileName: string, text: string, mime: string): void {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

function defaultRequest(): HttpRequest {
    // {{host}} showcases the environment substitution out of the box
    return {
        name: "Health check",
        method: "GET",
        url: "{{host}}/api/health",
        headers: [{key: "Accept", value: "application/json"}],
        body: undefined,
    };
}

// ─── environment var rows (kept half-typed rows locally) ────────────

/** Var rows for ONE environment — commit only FILLED keys back to the
 *  record so an in-progress empty row survives while typing. */
function EnvVarsEditor({env, onChange}: { env: HttpEnv; onChange: (vars: Record<string, string>) => void }) {
    const [rows, setRows] = React.useState<HeaderRow[]>(() => rowsFromVars(env.vars));
    React.useEffect(() => {
        setRows(rowsFromVars(env.vars));
    }, [env.vars]);
    const commit = (next: HeaderRow[]) => {
        setRows(next);
        const vars: Record<string, string> = {};
        for (const r of next) {
            const key = r.key.trim();
            if (key) vars[key] = r.value;
        }
        onChange(vars);
    };
    const setRow = (i: number, patch: Partial<HeaderRow>) =>
        commit(rows.map((r, j) => (j === i ? {...r, ...patch} : r)));
    return (
        <div className="space-y-1.5 pt-1.5">
            {rows.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No variables — add one to use {"{{name}}"} in the URL,
                    headers and body.</p>
            )}
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <Input
                        value={r.key}
                        onChange={(e) => setRow(i, {key: e.target.value})}
                        placeholder="key"
                        className="h-7 font-mono text-[11px] w-28 shrink-0"
                        aria-label={`Variable ${i + 1} name`}
                        spellCheck={false}
                    />
                    <Input
                        value={r.value}
                        onChange={(e) => setRow(i, {value: e.target.value})}
                        placeholder="value"
                        className="h-7 font-mono text-[11px] flex-1 min-w-0"
                        aria-label={`Variable ${i + 1} value`}
                        spellCheck={false}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-red-500"
                        onClick={() => commit(rows.filter((_, j) => j !== i))}
                        aria-label={`Remove variable ${r.key || i + 1}`}
                    >
                        <Trash2 className="size-3"/>
                    </Button>
                </div>
            ))}
            <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-[11px] gap-1"
                onClick={() => commit([...rows, {key: "", value: ""}])}
                aria-label="Add variable to this environment"
            >
                <Plus className="size-3"/> Add variable
            </Button>
        </div>
    );
}

// ─── the workbench ──────────────────────────────────────────────────

export function ApiClientWorkbench({
                                       folderSlug,
                                       fileSlug,
                                       fileName,
                                       content,
                                       onSaved,
                                       untitled,
                                       onSourceChange
                                   }: ApiClientWorkbenchProps) {
    const {toast} = useToast();
    const [ready, setReady] = React.useState(false);
    const [envs, setEnvs] = React.useState<HttpEnv[]>([]);
    const [activeEnv, setActiveEnv] = React.useState("local");
    const [requests, setRequests] = React.useState<HttpRequest[]>([defaultRequest()]);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const [response, setResponse] = React.useState<ProxyResponse | null>(null);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [sending, setSending] = React.useState(false);
    const [history, setHistory] = React.useState<HistoryEntry[]>([]);
    const [collections, setCollections] = React.useState<CollectionEntry[]>([]);
    const [showAllBody, setShowAllBody] = React.useState(false);
    const [sourceOpen, setSourceOpen] = React.useState(false);

    const active = requests[activeIdx] ?? requests[0] ?? defaultRequest();

    // load envs / history / collections once (localStorage is client-only)
    React.useEffect(() => {
        let loadedEnvs: HttpEnv[] = [];
        try {
            const raw = window.localStorage.getItem(ENVS_KEY);
            if (raw) loadedEnvs = JSON.parse(raw) as HttpEnv[];
        } catch {
            loadedEnvs = [];
        }
        // drop malformed entries so corrupt storage self-heals on next save
        loadedEnvs = loadedEnvs.filter(
            (e) => e && typeof e.name === "string" && e.vars && typeof e.vars === "object"
        );
        if (loadedEnvs.length === 0) {
            // seed the default "local" environment
            loadedEnvs = [{name: "local", vars: {host: "http://localhost:3000"}}];
            try {
                window.localStorage.setItem(ENVS_KEY, JSON.stringify(loadedEnvs));
            } catch {
                /* quota — session-only then */
            }
        }
        setEnvs(loadedEnvs);
        let name = "local";
        try {
            name = window.localStorage.getItem(ACTIVE_ENV_KEY) || "local";
        } catch {
            /* fall through to default */
        }
        if (loadedEnvs.length === 0) name = "local";
        else if (!loadedEnvs.some((e) => e.name === name)) name = loadedEnvs[0].name;
        setActiveEnv(name);
        try {
            const h = window.localStorage.getItem(HISTORY_KEY);
            if (h) setHistory((JSON.parse(h) as HistoryEntry[]).slice(0, HISTORY_MAX));
        } catch {
            /* ignore corrupt history */
        }
        try {
            const c = window.localStorage.getItem(COLLECTIONS_KEY);
            if (c) setCollections(JSON.parse(c) as CollectionEntry[]);
        } catch {
            /* ignore corrupt collections */
        }
        setReady(true);
    }, []);

    // pre-parse the .http file into the builder whenever it changes
    React.useEffect(() => {
        if (typeof content === "string" && content.trim() !== "") {
            const parsed = parseHttpFile(content);
            setRequests(parsed.length > 0 ? parsed : [defaultRequest()]);
        } else {
            setRequests([defaultRequest()]);
        }
        setActiveIdx(0);
        setResponse(null);
        setSendError(null);
    }, [content]);

    const activeEnvVars = React.useMemo(() => {
        const env = envs.find((e) => e.name === activeEnv);
        return env?.vars ?? {};
    }, [envs, activeEnv]);

    const resolvedUrl = React.useMemo(
        () => substituteVars(active.url, activeEnvVars).trim(),
        [active.url, activeEnvVars]
    );

    const sourceText = React.useMemo(() => serializeHttpFile(requests), [requests]);
    const dirty = typeof content === "string" ? sourceText.trim() !== content.trim() : true;
    /* Round 3 — keep the ref-mirrored callback fresh without re-running
     *  the sync effect whenever the page re-renders with a new inline
     *  callback identity (the effect below must key on sourceText only). */
    const onSourceChangeRef = React.useRef(onSourceChange);
    React.useEffect(() => {
        onSourceChangeRef.current = onSourceChange;
    }, [onSourceChange]);
    /* Round 3 — live draft sync: every serialized change flows to the
     *  page's in-memory draft map the moment it happens, so no builder
     *  edit can be lost on tab switches, closes or a later Save As. */
    React.useEffect(() => {
        onSourceChangeRef.current?.(sourceText);
    }, [sourceText]);

    // ── persistence helpers ──────────────────────────────────────────
    const persistEnvs = (list: HttpEnv[]) => {
        setEnvs(list);
        try {
            window.localStorage.setItem(ENVS_KEY, JSON.stringify(list));
        } catch {
            /* quota */
        }
    };
    const selectEnv = (name: string) => {
        setActiveEnv(name);
        try {
            window.localStorage.setItem(ACTIVE_ENV_KEY, name);
        } catch {
            /* quota */
        }
    };
    const persistHistory = (list: HistoryEntry[]) => {
        setHistory(list.slice(0, HISTORY_MAX));
        try {
            window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
        } catch {
            /* quota */
        }
    };
    const persistCollections = (list: CollectionEntry[]) => {
        setCollections(list);
        try {
            window.localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list));
        } catch {
            /* quota */
        }
    };

    // ── builder editing (syncs back into the .http source) ───────────
    const patchActive = (patch: Partial<HttpRequest>) => {
        setRequests((prev) => prev.map((r, i) => (i === activeIdx ? {...r, ...patch} : r)));
    };

    const copyText = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({title: `${what} copied`});
        } catch {
            toast({title: "Copy failed", description: "Clipboard is unavailable.", variant: "destructive"});
        }
    };

    // ── send through the server-side relay ──────────────────────────
    const send = async (req?: HttpRequest) => {
        const r = req ?? active;
        const url = substituteVars(r.url, activeEnvVars).trim();
        if (!url) {
            toast({title: "Missing URL", description: "Set the request URL before sending.", variant: "warning"});
            return;
        }
        setSending(true);
        setSendError(null);
        setResponse(null);
        setShowAllBody(false);
        try {
            const headers = r.headers
                .filter((h) => h.key.trim())
                .map((h) => ({
                    key: substituteVars(h.key, activeEnvVars).trim(),
                    value: substituteVars(h.value, activeEnvVars),
                }));
            const hasBody = r.method !== "GET" && r.method !== "HEAD";
            const res = await fetch("/api/http-proxy", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    url,
                    method: r.method,
                    headers,
                    body: hasBody ? substituteVars(r.body ?? "", activeEnvVars) : undefined,
                    timeoutMs: 15_000,
                }),
            });
            const json = await res.json();
            if (!res.ok || json.ok !== true) {
                setSendError(json.error ?? `HTTP ${res.status}`);
            } else {
                setResponse(json as ProxyResponse);
                persistHistory([
                    {
                        id: `${Date.now()}`,
                        method: r.method,
                        url,
                        headers,
                        body: hasBody ? r.body : undefined,
                        at: Date.now(),
                        status: json.status as number,
                    },
                    ...history.filter((h) => !(h.method === r.method && h.url === url)),
                ]);
            }
        } catch (err) {
            setSendError((err as Error).message);
        } finally {
            setSending(false);
        }
    };

    const bodyIsJson = React.useMemo(() => {
        if (!response || response.bodyText.trim() === "") return false;
        try {
            JSON.parse(response.bodyText);
            return true;
        } catch {
            return false;
        }
    }, [response]);

    const copyHeaders = () => {
        if (!response) return;
        void copyText(
            Object.entries(response.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n"),
            "Response headers"
        );
    };

    const saveResponseToFile = () => {
        if (!response) return;
        const contentType = response.headers["content-type"] ?? "text/plain";
        const ext = extForContentType(contentType);
        downloadText(
            `${fileName.replace(/\.[^.]+$/, "")}-response${ext}`,
            response.bodyText,
            contentType
        );
        toast({
            title: "Response downloaded",
            description: `Saved as ${fileName.replace(/\.[^.]+$/, "")}-response${ext}`
        });
    };

    const addToCollection = () => {
        const name = window.prompt("Save request as…", `${active.method} ${active.url}`.slice(0, 40));
        if (!name || !name.trim()) return;
        const entry: CollectionEntry = {
            id: `${Date.now()}`,
            name: name.trim().slice(0, 60),
            method: active.method,
            url: active.url,
            headers: active.headers.filter((h) => h.key.trim()),
            body: active.body,
        };
        persistCollections([entry, ...collections.filter((c) => c.name !== entry.name)]);
        toast({title: "Request saved", description: `${entry.name} added to collections.`});
    };

    const loadIntoBuilder = (r: HttpRequest) => {
        setRequests((prev) => prev.map((q, i) => (i === activeIdx ? {...r} : q)));
    };

    // ── environment management ──────────────────────────────────────
    const addEnv = () => {
        const name = window.prompt("New environment name", `env-${envs.length + 1}`);
        if (!name || !name.trim()) return;
        const clean = name.trim().slice(0, 40);
        if (envs.some((e) => e.name === clean)) {
            toast({title: "Name already exists", variant: "destructive"});
            return;
        }
        persistEnvs([...envs, {name: clean, vars: {}}]);
        selectEnv(clean);
    };
    const renameEnv = (oldName: string) => {
        const name = window.prompt("Rename environment", oldName);
        if (!name || !name.trim() || name.trim() === oldName) return;
        const clean = name.trim().slice(0, 40);
        if (envs.some((e) => e.name === clean)) {
            toast({title: "Name already exists", variant: "destructive"});
            return;
        }
        persistEnvs(envs.map((e) => (e.name === oldName ? {...e, name: clean} : e)));
        if (activeEnv === oldName) selectEnv(clean);
    };
    const deleteEnv = (name: string) => {
        if (envs.length <= 1) {
            toast({title: "Cannot delete the only environment", variant: "warning"});
            return;
        }
        if (!window.confirm(`Delete environment "${name}"?`)) return;
        const next = envs.filter((e) => e.name !== name);
        persistEnvs(next);
        if (activeEnv === name) selectEnv(next[0].name);
    };

    const headerRows = active.headers;

    return (
        <div
            className="flex flex-col gap-4 p-4 min-h-0"
            aria-label={`API client workbench — ${fileName}`}
            data-folder-slug={folderSlug}
            data-file-slug={fileSlug}
        >
            {/* ── request picker strip (multi-request .http files) ─────── */}
            {requests.length > 1 && (
                <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="tablist"
                    aria-label="Requests in this file"
                >
                    {requests.map((r, i) => (
                        <button
                            key={`${i}-${r.name ?? r.url}`}
                            type="button"
                            role="tab"
                            aria-selected={i === activeIdx}
                            onClick={() => {
                                setActiveIdx(i);
                                setResponse(null);
                                setSendError(null);
                            }}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] max-w-64 transition-colors",
                                i === activeIdx
                                    ? "bg-foreground text-background border-foreground"
                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            )}
                            title={r.url}
                        >
                            <span className="font-mono font-semibold shrink-0">{r.method}</span>
                            <span className="truncate">{r.name ?? r.url}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── request builder ──────────────────────────────────────── */}
            <section className="rounded-md border p-3 space-y-3" aria-label="Request builder">
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={active.method}
                        onValueChange={(m) => patchActive({method: m as HttpMethod})}
                    >
                        <SelectTrigger size="sm" className="w-[118px] font-mono text-xs" aria-label="HTTP method">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {HTTP_METHODS.map((m) => (
                                <SelectItem key={m} value={m} className="font-mono text-xs">
                                    {m}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        value={active.url}
                        onChange={(e) => patchActive({url: e.target.value})}
                        placeholder="{{host}}/api/…"
                        className="flex-1 min-w-48 h-8 font-mono text-xs"
                        aria-label="Request URL"
                        spellCheck={false}
                    />
                    <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={sending || !active.url.trim()}
                        onClick={() => void send()}
                    >
                        {sending ? <Loader2 className="size-3.5 animate-spin"/> : <Send className="size-3.5"/>}
                        Send
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={addToCollection}
                        aria-label="Save request to collections"
                    >
                        <Bookmark className="size-3.5"/> Save
                    </Button>
                </div>

                {/* resolved URL hint — shows what {{vars}} will actually send */}
                {resolvedUrl !== active.url && resolvedUrl !== "" && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate flex items-center gap-1">
                        <Globe className="size-3 shrink-0"/>
                        {resolvedUrl}
                        <span className="opacity-60">(env &ldquo;{activeEnv}&rdquo;)</span>
                    </p>
                )}

                {/* header rows */}
                <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Headers</p>
                    {headerRows.map((h, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <Input
                                value={h.key}
                                onChange={(e) => patchActive({
                                    headers: headerRows.map((x, j) => (j === i ? {
                                        ...x,
                                        key: e.target.value
                                    } : x))
                                })}
                                placeholder="Key"
                                className="h-8 font-mono text-xs w-40 sm:w-48 shrink-0"
                                aria-label={`Header ${i + 1} key`}
                                spellCheck={false}
                            />
                            <Input
                                value={h.value}
                                onChange={(e) => patchActive({
                                    headers: headerRows.map((x, j) => (j === i ? {
                                        ...x,
                                        value: e.target.value
                                    } : x))
                                })}
                                placeholder="Value"
                                className="h-8 font-mono text-xs flex-1 min-w-0"
                                aria-label={`Header ${i + 1} value`}
                                spellCheck={false}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 shrink-0"
                                onClick={() => patchActive({headers: headerRows.filter((_, j) => j !== i)})}
                                aria-label={`Remove header row ${i + 1}`}
                            >
                                <Trash2 className="size-3.5"/>
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => patchActive({headers: [...headerRows, {key: "", value: ""}]})}
                        aria-label="Add header row"
                    >
                        <Plus className="size-3"/> Add header
                    </Button>
                </div>

                {/* body (only for body-carrying methods) */}
                {active.method !== "GET" && active.method !== "HEAD" && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
                        <Textarea
                            value={active.body ?? ""}
                            onChange={(e) => patchActive({body: e.target.value})}
                            placeholder='{"json": true}'
                            className="min-h-[100px] font-mono text-[13px] resize-y"
                            aria-label="Request body"
                            spellCheck={false}
                        />
                    </div>
                )}

                {/* environment picker + manager */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Settings2 className="size-3"/> Env
                    </p>
                    {ready ? (
                        <Select value={activeEnv} onValueChange={selectEnv}>
                            <SelectTrigger size="sm" className="w-36 text-xs" aria-label="Active environment">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                {envs.map((e) => (
                                    <SelectItem key={e.name} value={e.name} className="text-xs">
                                        {e.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Skeleton className="h-7 w-36 rounded-md"/>
                    )}
                    <Badge variant="secondary" className="text-[10px]" title="Variables in the active environment">
                        {Object.keys(activeEnvVars).length} vars
                    </Badge>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                                    aria-label="Manage environments">
                                <Settings2 className="size-3.5"/> Manage
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-96 p-3" align="start">
                            <p className="text-xs font-medium mb-2">Environments</p>
                            <div className={cn("space-y-2 max-h-80 overflow-y-auto pr-1", SCROLLBAR)}>
                                {envs.map((env) => (
                                    <div
                                        key={env.name}
                                        className={cn(
                                            "rounded-md border p-2",
                                            env.name === activeEnv && "border-emerald-500/40 bg-emerald-500/5"
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                className="text-xs font-medium truncate flex-1 text-left hover:text-emerald-600 dark:hover:text-emerald-400"
                                                onClick={() => selectEnv(env.name)}
                                                title="Activate this environment"
                                            >
                                                {env.name}
                                            </button>
                                            <Badge variant="outline" className="text-[9px] shrink-0">
                                                {Object.keys(env.vars).length} vars
                                            </Badge>
                                            {env.name === activeEnv && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[9px] shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                >
                                                    active
                                                </Badge>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-muted-foreground"
                                                onClick={() => renameEnv(env.name)}
                                                aria-label={`Rename environment ${env.name}`}
                                            >
                                                <Pencil className="size-3"/>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                                                onClick={() => deleteEnv(env.name)}
                                                aria-label={`Delete environment ${env.name}`}
                                            >
                                                <Trash2 className="size-3"/>
                                            </Button>
                                        </div>
                                        {env.name === activeEnv && (
                                            <EnvVarsEditor
                                                env={env}
                                                onChange={(vars) => persistEnvs(envs.map((e) => (e.name === env.name ? {
                                                    ...e,
                                                    vars
                                                } : e)))}
                                            />
                                        )}
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" className="h-7 w-full text-[11px] gap-1"
                                        onClick={addEnv}>
                                    <Plus className="size-3"/> Add environment
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </section>

            {/* ── send error ───────────────────────────────────────────── */}
            {sendError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3" role="alert">
                    <p className="text-xs text-red-600 dark:text-red-400 break-words font-mono">{sendError}</p>
                </div>
            )}

            {/* ── response pane ────────────────────────────────────────── */}
            {sending && (
                <section className="rounded-md border p-3 space-y-2" aria-busy="true" aria-label="Response loading">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-20"/>
                        <Skeleton className="h-5 w-16"/>
                        <Skeleton className="h-5 w-16"/>
                    </div>
                    <Skeleton className="h-4 w-2/3"/>
                    <Skeleton className="h-4 w-1/2"/>
                    <Skeleton className="h-4 w-3/4"/>
                </section>
            )}
            {!sending && response && (
                <Collapsible className="rounded-md border" defaultOpen={false}>
                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b bg-muted/20">
            <span
                className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                    statusChipClass(response.status)
                )}
                title={`${response.status} ${response.statusText}`}
            >
              {response.status} {response.statusText}
            </span>
                        <Badge variant="outline" className="text-[10px] gap-1" title="Elapsed time">
                            <Timer className="size-3"/> {response.timeMs} ms
                        </Badge>
                        <Badge variant="outline" className="text-[10px]" title="Response size">
                            {formatBytes(response.sizeBytes)}
                        </Badge>
                        {(response.redirects ?? 0) > 0 && (
                            <Badge variant="outline" className="text-[10px]" title="Redirects followed (max 3)">
                                {response.redirects} redirect{(response.redirects ?? 0) === 1 ? "" : "s"}
                            </Badge>
                        )}
                        {response.truncated && (
                            <Badge variant="outline"
                                   className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                2 MB cap
                            </Badge>
                        )}
                        <div className="flex-1"/>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 group"
                                    aria-label="Toggle response headers">
                                <ChevronDown
                                    className="size-3 transition-transform group-data-[state=open]:rotate-180"/>
                                Headers ({Object.keys(response.headers).length})
                            </Button>
                        </CollapsibleTrigger>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] gap-1"
                            onClick={() => void copyText(response.bodyText, "Body")}
                            disabled={response.bodyText === ""}
                            aria-label="Copy response body"
                        >
                            <Copy className="size-3"/> Copy body
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] gap-1"
                            onClick={saveResponseToFile}
                            disabled={response.bodyText === ""}
                            aria-label="Save response to file"
                        >
                            <Download className="size-3"/> Save
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={copyHeaders}
                                aria-label="Copy response headers">
                            <Code2 className="size-3"/> Copy headers
                        </Button>
                    </div>

                    <CollapsibleContent>
                        <div
                            className={cn("px-3 py-1.5 space-y-0.5 max-h-40 overflow-y-auto border-b bg-muted/10", SCROLLBAR)}>
                            {Object.entries(response.headers).map(([k, v]) => (
                                <p key={k} className="text-[11px] font-mono truncate" title={`${k}: ${v}`}>
                                    <span className="text-muted-foreground">{k}:</span> {v}
                                </p>
                            ))}
                        </div>
                    </CollapsibleContent>

                    <div>
                        {response.bodyText === "" ? (
                            <p className="p-3 text-xs text-muted-foreground">
                                Empty body{response.status === 204 ? " (204 No Content)" : ""}.
                            </p>
                        ) : bodyIsJson ? (
                            <div className="h-[420px] overflow-hidden">
                                <JsonInspector
                                    content={response.bodyText}
                                    contentTruncated={response.truncated}
                                    rawView={
                                        <pre
                                            className="p-3 m-0 text-xs font-mono whitespace-pre-wrap break-all max-h-[420px] overflow-auto"
                                            aria-label="Raw response body"
                                        >
                      {response.bodyText}
                    </pre>
                                    }
                                />
                            </div>
                        ) : (
                            <div className="p-3">
                <pre
                    className="m-0 text-xs font-mono whitespace-pre-wrap break-all max-h-[420px] overflow-auto"
                    aria-label="Response body"
                >
                  {showAllBody ? response.bodyText : response.bodyText.slice(0, 10_000)}
                </pre>
                                {response.bodyText.length > 10_000 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px] mt-1.5"
                                        onClick={() => setShowAllBody((v) => !v)}
                                        aria-label={showAllBody ? "Collapse response body" : "Show the full response body"}
                                    >
                                        {showAllBody ? "Collapse body" : `Show all (${formatBytes(response.bodyText.length)})`}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </Collapsible>
            )}

            {/* ── Source (serialized .http text) + save-back ───────────── */}
            <Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
                <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 group"
                                aria-label="Toggle .http source">
                            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180"/>
                            Source
                            {dirty && <Badge variant="outline"
                                             className="text-[9px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">unsaved</Badge>}
                        </Button>
                    </CollapsibleTrigger>
                    {/* Round 3 — an UNTITLED draft never has a disk file, so the
              control reads "Save As…", stays enabled even when not
              dirty (the first save must always be possible), and the
              page's onSaved opens the destination picker. A REAL
              .http/.rest file keeps the exact previous write-back
              button and toast. */}
                    <Button
                        size="sm"
                        variant={dirty || untitled ? "default" : "outline"}
                        className="h-7 text-xs gap-1"
                        disabled={!onSaved || (!dirty && !untitled)}
                        onClick={() => {
                            onSaved?.(sourceText);
                            if (!untitled) {
                                toast({title: "Saved to file", description: "The .http source was written back."});
                            }
                        }}
                        aria-label={untitled ? "Save the untitled .http draft to a file of your choice" : "Save the .http source back to the file"}
                    >
                        <Save className="size-3.5"/> {untitled ? "Save As…" : "Save to file"}
                    </Button>
                </div>
                <CollapsibleContent>
          <pre
              className={cn("mt-2 rounded-md border bg-muted/30 p-3 m-0 text-xs font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto", SCROLLBAR)}
              aria-label=".http source text"
          >
            {sourceText}
          </pre>
                </CollapsibleContent>
            </Collapsible>

            {/* ── history + collections (bottom tabs) ──────────────────── */}
            <Tabs defaultValue="history" className="w-full">
                <TabsList className="h-8">
                    <TabsTrigger value="history" className="text-xs gap-1.5 h-7">
                        <History className="size-3.5"/> History ({history.length})
                    </TabsTrigger>
                    <TabsTrigger value="collections" className="text-xs gap-1.5 h-7">
                        <Bookmark className="size-3.5"/> Collections ({collections.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="mt-2">
                    {!ready ? (
                        <div className="space-y-1.5" aria-busy="true" aria-label="History loading">
                            <Skeleton className="h-7 w-full rounded-md"/>
                            <Skeleton className="h-7 w-5/6 rounded-md"/>
                            <Skeleton className="h-7 w-4/6 rounded-md"/>
                        </div>
                    ) : history.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">No requests yet — send one and it lands
                            here.</p>
                    ) : (
                        <ul className={cn("rounded-md border divide-y max-h-72 overflow-y-auto", SCROLLBAR)}
                            aria-label="Request history">
                            {history.map((h) => (
                                <li key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                                    <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                                        {h.method}
                                    </Badge>
                                    <button
                                        type="button"
                                        className="text-xs font-mono truncate flex-1 min-w-0 text-left hover:text-emerald-600 dark:hover:text-emerald-400"
                                        onClick={() =>
                                            loadIntoBuilder({
                                                name: undefined,
                                                method: h.method,
                                                url: h.url,
                                                headers: h.headers,
                                                body: h.body
                                            })
                                        }
                                        title="Load into the builder"
                                    >
                                        {h.url}
                                    </button>
                                    {typeof h.status === "number" && (
                                        <span
                                            className={cn("shrink-0 rounded border px-1.5 py-0 text-[10px] font-semibold", statusChipClass(h.status))}>
                      {h.status}
                    </span>
                                    )}
                                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {new Date(h.at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}
                  </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 shrink-0"
                                        onClick={() => void send({
                                            method: h.method,
                                            url: h.url,
                                            headers: h.headers,
                                            body: h.body
                                        })}
                                        aria-label={`Re-send ${h.method} ${h.url}`}
                                        title="Re-send this request"
                                    >
                                        <Play className="size-3"/>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </TabsContent>

                <TabsContent value="collections" className="mt-2">
                    {!ready ? (
                        <div className="space-y-1.5" aria-busy="true" aria-label="Collections loading">
                            <Skeleton className="h-7 w-full rounded-md"/>
                            <Skeleton className="h-7 w-3/4 rounded-md"/>
                        </div>
                    ) : collections.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">No saved requests — use the Save button in the
                            builder.</p>
                    ) : (
                        <ul className={cn("rounded-md border divide-y max-h-72 overflow-y-auto", SCROLLBAR)}
                            aria-label="Saved collections">
                            {collections.map((c) => (
                                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                                    <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                                        {c.method}
                                    </Badge>
                                    <button
                                        type="button"
                                        className="text-xs truncate flex-1 min-w-0 text-left hover:text-emerald-600 dark:hover:text-emerald-400"
                                        onClick={() =>
                                            loadIntoBuilder({
                                                name: c.name,
                                                method: c.method,
                                                url: c.url,
                                                headers: c.headers,
                                                body: c.body
                                            })
                                        }
                                        title="Load into the builder"
                                    >
                                        {c.name}
                                        <span className="text-muted-foreground font-mono"> · {c.url}</span>
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 shrink-0"
                                        onClick={() =>
                                            void send({method: c.method, url: c.url, headers: c.headers, body: c.body})
                                        }
                                        aria-label={`Run ${c.name}`}
                                        title="Run this saved request"
                                    >
                                        <Play className="size-3"/>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-red-500"
                                        onClick={() => {
                                            persistCollections(collections.filter((x) => x.id !== c.id));
                                            toast({title: "Collection entry deleted"});
                                        }}
                                        aria-label={`Delete ${c.name}`}
                                    >
                                        <Trash2 className="size-3"/>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
