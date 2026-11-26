"use client";

/**
 * the 33 additional Developer-Toolbox tools that sit on
 * top of the pure helpers in src/lib/toolbox-more.ts and src/lib/qr.ts.
 * Every tool is offline & synchronous except the JWT signer (WebCrypto)
 * — no new npm dependencies, no network calls.
 *
 * The components are imported by dev-toolbox.tsx and registered in its
 * category → tool dropdowns (registry-wide counts live there — see
 * dev-toolbox.tsx and the wrap-and-toolbox unit test).
 */

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {parseColor} from "@/lib/toolbox-utils";
import {type EccLevel, encodeQr, qrToSvg} from "@/lib/qr";
import {
    asciiTable,
    buildGitignore,
    chmodFromSymbolic,
    chmodToSymbolic,
    cleanText,
    compareSemver,
    contrastRatio,
    crackTimeEstimate,
    crc32,
    cssBoxShadow,
    cssLinearGradient,
    csvToMarkdownTable,
    type EscapeKind,
    escapeString,
    formatDotenv,
    formatDuration,
    fromRoman,
    generatePassword,
    GITIGNORE_TEMPLATES,
    hexDump,
    HTTP_STATUSES,
    jsonToTypes,
    jwtSignHs256,
    type LineOps,
    MIME_TYPES,
    morseDecode,
    morseEncode,
    nanoid,
    parseDotenv,
    parseDuration,
    parseSemver,
    parseSubnet,
    passwordEntropyBits,
    reverseText,
    semverSatisfies,
    slugify,
    svgPlaceholder,
    toNato,
    toRoman,
    transformLines,
    ulid,
    uuidv7,
    wcagRating,
} from "@/lib/toolbox-more";

/* ─── shared bits (local copies so the two files stay independent) ── */

function CopyBtn({text, label = "Copy"}: { text: string; label?: string }) {
    const {toast} = useToast();
    return (
        <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!text}
            onClick={() => {
                void navigator.clipboard
                    .writeText(text)
                    .then(() => toast({title: "Copied to clipboard", variant: "success"}));
            }}
        >
            {label}
        </Button>
    );
}

const area =
    "font-mono text-xs min-h-[110px] w-full rounded-md border bg-muted/30 p-2 focus-visible:ring-1 whitespace-pre-wrap";

function Out({label, text, minH = 60}: { label: string; text: string; minH?: number }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <CopyBtn text={text}/>
            </div>
            <pre className={cn(area, `min-h-[${minH}px]`, "whitespace-pre-wrap break-all")} style={{minHeight: minH}}>
        {text || "—"}
      </pre>
        </div>
    );
}

function Sel<T extends string>({
                                   value,
                                   onValueChange,
                                   options,
                                   ariaLabel,
                                   className,
                               }: {
    value: T;
    onValueChange: (v: T) => void;
    options: ReadonlyArray<readonly [T, string]>;
    ariaLabel: string;
    className?: string;
}) {
    return (
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
            <SelectTrigger size="sm" className={cn("h-8 text-xs", className)} aria-label={ariaLabel}>
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

function Num({
                 value,
                 onChange,
                 min,
                 max,
                 step = 1,
                 w = "w-24",
                 ariaLabel,
             }: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    w?: string;
    ariaLabel: string;
}) {
    return (
        <Input
            type="number"
            value={Number.isFinite(value) ? value : ""}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
                const n = Number(e.target.value);
                onChange(Number.isNaN(n) ? 0 : n);
            }}
            className={cn("h-8 w-24 text-xs", w)}
            aria-label={ariaLabel}
        />
    );
}

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Err({children}: { children: React.ReactNode }) {
    return (
        <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">{children}</p>
    );
}

/** Trigger a browser download for generated content. */
function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── Hash & crypto ─────────────────────────────────────────────── */

export function Crc32Tool() {
    const [input, setInput] = React.useState("123456789");
    const out = React.useMemo(() => crc32(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="soft"
                placeholder="Text to checksum"
                className={area}
                aria-label="CRC-32 input"
            />
            <Out label="CRC-32 (hex)" text={out} minH={40}/>
            <Note>CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320) — a checksum, not a cryptographic hash.</Note>
        </div>
    );
}

export function JwtSignTool() {
    const [payload, setPayload] = React.useState('{\n  "sub": "user-1",\n  "role": "dev"\n}');
    const [secret, setSecret] = React.useState("my-dev-secret");
    const [exp, setExp] = React.useState(3600);
    const [token, setToken] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const sign = async () => {
        setBusy(true);
        setError(null);
        try {
            const parsed = JSON.parse(payload) as unknown;
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                throw new Error("payload must be a JSON object");
            }
            const t = await jwtSignHs256(parsed as Record<string, unknown>, secret, exp > 0 ? exp : undefined);
            setToken(t);
        } catch (e) {
            setError((e as Error).message);
            setToken("");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <div className="space-y-1.5">
                <Label className="text-xs">Payload (JSON object)</Label>
                <Textarea
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    wrap="soft"
                    className={cn(area, "min-h-[100px]")}
                    aria-label="JWT payload"
                />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Secret</Label>
                <Input
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="h-8 flex-1 min-w-[160px] font-mono text-xs"
                    aria-label="JWT secret"
                />
                <Label className="text-xs">exp (s)</Label>
                <Num value={exp} onChange={setExp} min={0} step={60} ariaLabel="Expiry seconds"/>
                <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void sign()}>
                    {busy ? "Signing…" : "Sign HS256"}
                </Button>
            </div>
            {error && <Err>{error}</Err>}
            {token && <Out label="Signed JWT" text={token} minH={70}/>}
            <Note>Signs locally with WebCrypto HMAC-SHA256. Never put production secrets in a browser tool.</Note>
        </div>
    );
}

export function PasswordGenTool() {
    const [length, setLength] = React.useState(20);
    const [lower, setLower] = React.useState(true);
    const [upper, setUpper] = React.useState(true);
    const [digits, setDigits] = React.useState(true);
    const [symbols, setSymbols] = React.useState(true);
    const [excludeAmbiguous, setExcludeAmbiguous] = React.useState(false);
    const [count, setCount] = React.useState(5);
    const [list, setList] = React.useState<string[]>([]);

    const generate = () => {
        try {
            setList(Array.from({length: Math.max(1, Math.min(50, count))}, () =>
                generatePassword({length, lower, upper, digits, symbols, excludeAmbiguous})
            ));
        } catch (e) {
            setList([(e as Error).message]);
        }
    };

    const first = list.find((p) => passwordEntropyBits(p) > 0) ?? "";

    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-3">
                <Label className="text-xs">Length</Label>
                <Num value={length} onChange={setLength} min={4} max={128} ariaLabel="Password length"/>
                <Label className="text-xs">Count</Label>
                <Num value={count} onChange={setCount} min={1} max={50} w="w-16" ariaLabel="How many passwords"/>
                <Button size="sm" className="h-8 text-xs" onClick={generate}>
                    Generate
                </Button>
            </div>
            <div className="flex flex-wrap gap-3">
                <Check checked={lower} onChange={setLower} label="a-z"/>
                <Check checked={upper} onChange={setUpper} label="A-Z"/>
                <Check checked={digits} onChange={setDigits} label="0-9"/>
                <Check checked={symbols} onChange={setSymbols} label="symbols"/>
                <Check checked={excludeAmbiguous} onChange={setExcludeAmbiguous} label="exclude ambiguous (Il1O0…)"/>
            </div>
            {first && (
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{passwordEntropyBits(first)} bits</Badge>
                    <span
                        className="text-[11px] text-muted-foreground">{crackTimeEstimate(passwordEntropyBits(first))} to crack at 10¹⁰ guesses/s</span>
                </div>
            )}
            <Out label={`Passwords (${list.length})`} text={list.join("\n")} minH={90}/>
        </div>
    );
}

export function PasswordStrengthTool() {
    const [pw, setPw] = React.useState("correct horse battery staple");
    const bits = React.useMemo(() => passwordEntropyBits(pw), [pw]);
    return (
        <div className="space-y-3 py-1">
            <div className="space-y-1.5">
                <Label className="text-xs">Password to check (never leaves the browser)</Label>
                <Input
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    className="h-8 font-mono text-xs"
                    aria-label="Password to analyze"
                />
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="text-xs font-mono">{bits} bits</Badge>
                <span className="text-xs text-muted-foreground">{crackTimeEstimate(bits)}</span>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn("h-full transition-all", bits < 40 ? "bg-red-500" : bits < 60 ? "bg-amber-500" : bits < 80 ? "bg-lime-500" : "bg-emerald-500")}
                        style={{width: `${Math.min(100, (bits / 128) * 100)}%`}}
                    />
                </div>
            </div>
            <Note>
                Smallest-charset model: the pool is inferred from what the password reveals (lowercase → 26,
                +case → 52, +digits → 36/62, mixed alnum → full printable 95, symbol observed → 76). Entropy
                per character ≈ log2(pool); total = length × bits/char, rounded.
            </Note>
        </div>
    );
}

/* ─── Generators ────────────────────────────────────────────────── */

function IdBatch({gen, defCount, max = 50}: { gen: () => string; defCount: number; max?: number }) {
    const [count, setCount] = React.useState(defCount);
    const [list, setList] = React.useState<string[]>(() => Array.from({length: defCount}, gen));
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Count</Label>
                <Num value={count} onChange={setCount} min={1} max={max} w="w-20" ariaLabel="How many ids"/>
                <Button size="sm" className="h-8 text-xs"
                        onClick={() => setList(Array.from({length: Math.max(1, Math.min(max, count))}, gen))}>
                    Generate
                </Button>
            </div>
            <Out label="Ids" text={list.join("\n")} minH={90}/>
        </div>
    );
}

export function Uuidv7Tool() {
    return (
        <div className="space-y-2 py-1">
            <IdBatch gen={() => uuidv7()} defCount={5}/>
            <Note>UUID v7: 48-bit millisecond timestamp + random — lexicographically sortable, index-friendly.</Note>
        </div>
    );
}

export function UlidTool() {
    return (
        <div className="space-y-2 py-1">
            <IdBatch gen={() => ulid()} defCount={5}/>
            <Note>ULID: 26 Crockford-base32 chars (10 timestamp + 16 random) — sortable within a millisecond.</Note>
        </div>
    );
}

export function NanoIdTool() {
    const [size, setSize] = React.useState(21);
    return (
        <div className="space-y-2 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Size</Label>
                <Num value={size} onChange={setSize} min={1} max={64} w="w-20" ariaLabel="NanoID size"/>
            </div>
            <IdBatch gen={() => nanoid(Math.max(1, Math.min(64, size)))} defCount={5}/>
            <Note>NanoID-style URL-safe ids (A-Za-z0-9_-) using the crypto RNG.</Note>
        </div>
    );
}

export function TokenTool() {
    const [bytes, setBytes] = React.useState(32);
    const [encoding, setEncoding] = React.useState<"hex" | "base64" | "base64url">("hex");
    const [count, setCount] = React.useState(3);
    const [tokens, setTokens] = React.useState<string[]>([]);

    const generate = () => {
        const n = Math.max(1, Math.min(32, count));
        const b = Math.max(1, Math.min(512, bytes));
        const list: string[] = [];
        for (let i = 0; i < n; i++) {
            const arr = new Uint8Array(b);
            crypto.getRandomValues(arr);
            let bin = "";
            for (const x of arr) bin += String.fromCharCode(x);
            if (encoding === "hex") {
                list.push([...arr].map((x) => x.toString(16).padStart(2, "0")).join(""));
            } else if (encoding === "base64") {
                list.push(btoa(bin));
            } else {
                list.push(btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
            }
        }
        setTokens(list);
    };

    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Bytes</Label>
                <Num value={bytes} onChange={setBytes} min={1} max={512} ariaLabel="Token bytes"/>
                <Sel
                    value={encoding}
                    onValueChange={setEncoding}
                    ariaLabel="Token encoding"
                    options={[
                        ["hex", "hex"],
                        ["base64", "base64"],
                        ["base64url", "base64url"],
                    ] as const}
                />
                <Label className="text-xs">Count</Label>
                <Num value={count} onChange={setCount} min={1} max={32} w="w-16" ariaLabel="How many tokens"/>
                <Button size="sm" className="h-8 text-xs" onClick={generate}>
                    Generate
                </Button>
            </div>
            <Out label="Tokens (crypto RNG)" text={tokens.join("\n")} minH={80}/>
            <Note>32 bytes hex = 256 bits — a solid API key. Generated with crypto.getRandomValues.</Note>
        </div>
    );
}

export function GitignoreTool() {
    const [picked, setPicked] = React.useState<string[]>(["node", "python"]);
    const out = React.useMemo(() => buildGitignore(picked), [picked]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-3">
                {GITIGNORE_TEMPLATES.map((t) => (
                    <Check
                        key={t.id}
                        checked={picked.includes(t.id)}
                        onChange={(v) => setPicked((p) => (v ? [...p, t.id] : p.filter((x) => x !== t.id)))}
                        label={t.label}
                    />
                ))}
            </div>
            <Out label=".gitignore" text={out} minH={140}/>
            <Note>Templates are merged and de-duplicated in the order you see above.</Note>
        </div>
    );
}

export function SvgPlaceholderTool() {
    const [width, setWidth] = React.useState(320);
    const [height, setHeight] = React.useState(200);
    const [bg, setBg] = React.useState("#10b981");
    const [fg, setFg] = React.useState("#ffffff");
    const [text, setText] = React.useState("Hero");
    const svg = React.useMemo(
        () => svgPlaceholder({
            width: Math.max(1, Math.min(2000, width)),
            height: Math.max(1, Math.min(2000, height)),
            bg,
            fg,
            text: text || undefined
        }),
        [width, height, bg, fg, text]
    );
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">W</Label>
                <Num value={width} onChange={setWidth} min={1} max={2000} ariaLabel="SVG width"/>
                <Label className="text-xs">H</Label>
                <Num value={height} onChange={setHeight} min={1} max={2000} ariaLabel="SVG height"/>
                <Input value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-24 font-mono text-xs"
                       aria-label="Background color"/>
                <Input value={fg} onChange={(e) => setFg(e.target.value)} className="h-8 w-24 font-mono text-xs"
                       aria-label="Foreground color"/>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="auto"
                       className="h-8 w-28 text-xs" aria-label="Placeholder text"/>
            </div>
            <div
                className="flex items-center justify-center rounded-md border bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
                <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Generated placeholder preview"
                     className="max-h-52 max-w-full"/>
            </div>
            <Out label="SVG source" text={svg} minH={70}/>
            <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => download(`placeholder-${width}x${height}.svg`, svg, "image/svg+xml")}>
                    Download .svg
                </Button>
            </div>
        </div>
    );
}

/* ─── Text tools ────────────────────────────────────────────────── */

export function SlugifyTool() {
    const [input, setInput] = React.useState("Über schnelle Bäume! — a blog title");
    const out = React.useMemo(() => slugify(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to slugify"/>
            <Out label="Slug" text={out} minH={40}/>
            <Note>Accents folded, separators unified to dashes, trimmed to 96 chars — URL safe.</Note>
        </div>
    );
}

export function LinesTool() {
    const [input, setInput] = React.useState("banana\napple\n\nbanana\ncherry");
    const [sort, setSort] = React.useState<LineOps["sort"]>("alpha");
    const [unique, setUnique] = React.useState(true);
    const [trim, setTrim] = React.useState(true);
    const [removeEmpty, setRemoveEmpty] = React.useState(true);
    const [reverse, setReverse] = React.useState(false);
    const [addLineNumbers, setAddLineNumbers] = React.useState(false);
    const out = React.useMemo(
        () => transformLines(input, {sort, unique, trim, removeEmpty, reverse, addLineNumbers}),
        [input, sort, unique, trim, removeEmpty, reverse, addLineNumbers]
    );
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="off" className={area}
                      aria-label="Lines input"/>
            <div className="flex flex-wrap items-center gap-3">
                <Sel
                    value={sort}
                    onValueChange={setSort}
                    ariaLabel="Sort mode"
                    options={[
                        ["none", "no sort"],
                        ["alpha", "A→Z"],
                        ["alpha-desc", "Z→A"],
                        ["length", "short→long"],
                        ["length-desc", "long→short"],
                        ["shuffle", "shuffle"],
                    ] as const}
                />
                <Check checked={unique} onChange={setUnique} label="unique"/>
                <Check checked={trim} onChange={setTrim} label="trim"/>
                <Check checked={removeEmpty} onChange={setRemoveEmpty} label="drop empty"/>
                <Check checked={reverse} onChange={setReverse} label="reverse"/>
                <Check checked={addLineNumbers} onChange={setAddLineNumbers} label="number"/>
            </div>
            <Out label="Transformed" text={out} minH={90}/>
        </div>
    );
}

export function ReverseTool() {
    const [input, setInput] = React.useState("the quick brown fox");
    const [mode, setMode] = React.useState<"chars" | "words" | "lines">("chars");
    const out = React.useMemo(() => reverseText(input, mode), [input, mode]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={mode}
                    onValueChange={setMode}
                    ariaLabel="Reverse mode"
                    options={[
                        ["chars", "characters"],
                        ["words", "words"],
                        ["lines", "lines"],
                    ] as const}
                />
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to reverse"/>
            <Out label="Reversed" text={out} minH={60}/>
        </div>
    );
}

export function StringEscapeTool() {
    const [input, setInput] = React.useState('say "hi"\na & b');
    const [kind, setKind] = React.useState<EscapeKind>("json");
    const out = React.useMemo(() => escapeString(input, kind), [input, kind]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={kind}
                    onValueChange={setKind}
                    ariaLabel="Escape target"
                    options={[
                        ["json", "JSON string"],
                        ["regex", "regex literal"],
                        ["sql", "SQL (single quotes)"],
                        ["url-query", "URL query"],
                    ] as const}
                />
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to escape"/>
            <Out label="Escaped" text={out} minH={60}/>
            <Note>JSON mode escapes control characters but keeps quotes — wrap the result
                in &quot;…&quot; yourself.</Note>
        </div>
    );
}

export function CsvMdTool() {
    const [input, setInput] = React.useState("name,age\nAda,36\nBob,unknown");
    const out = React.useMemo(() => csvToMarkdownTable(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="off" className={area}
                      aria-label="CSV input"/>
            <Out label="Markdown table" text={out} minH={80}/>
            <Note>First row becomes the header; quoted fields are handled. Great for READMEs and issues.</Note>
        </div>
    );
}

export function CleanTool() {
    const [input, setInput] = React.useState("  spaced\tout   text  \n\n\u201Csmart\u201D quotes…\n\n\n");
    const [trimLines, setTrimLines] = React.useState(true);
    const [collapseSpaces, setCollapseSpaces] = React.useState(true);
    const [removeBlankLines, setRemoveBlankLines] = React.useState(true);
    const [normalizeQuotes, setNormalizeQuotes] = React.useState(true);
    const out = React.useMemo(
        () => cleanText(input, {trimLines, collapseSpaces, removeBlankLines, normalizeQuotes}),
        [input, trimLines, collapseSpaces, removeBlankLines, normalizeQuotes]
    );
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to clean"/>
            <div className="flex flex-wrap gap-3">
                <Check checked={trimLines} onChange={setTrimLines} label="trim lines"/>
                <Check checked={collapseSpaces} onChange={setCollapseSpaces} label="collapse spaces"/>
                <Check checked={removeBlankLines} onChange={setRemoveBlankLines} label="drop blanks"/>
                <Check checked={normalizeQuotes} onChange={setNormalizeQuotes} label="normalize quotes"/>
            </div>
            <Out label="Cleaned" text={out} minH={60}/>
        </div>
    );
}

export function HexDumpTool() {
    const [input, setInput] = React.useState("The quick brown fox jumps");
    const [perLine, setPerLine] = React.useState<"8" | "16">("16");
    const out = React.useMemo(() => hexDump(input, Number(perLine)), [input, perLine]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={perLine}
                    onValueChange={setPerLine}
                    ariaLabel="Bytes per line"
                    options={[
                        ["8", "8 bytes/line"],
                        ["16", "16 bytes/line"],
                    ] as const}
                />
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to dump"/>
            <Out label="Hex dump" text={out} minH={90}/>
        </div>
    );
}

export function AsciiTableTool() {
    const [input, setInput] = React.useState("k,v\na,1\nlonger-cell,42");
    const [align, setAlign] = React.useState<"left" | "right" | "center">("left");
    const [sep, setSep] = React.useState<"," | "\\t">(",");
    const out = React.useMemo(() => {
        const rows = input
            .split(/\r?\n/)
            .filter((l) => l.trim() !== "")
            .map((l) => (sep === "," ? l.split(/ *, */) : l.split("\t")));
        return asciiTable(rows, {align});
    }, [input, align, sep]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={sep}
                    onValueChange={setSep}
                    ariaLabel="Cell separator"
                    options={[
                        [",", "comma"],
                        ["\\t", "tab"],
                    ] as const}
                />
                <Sel
                    value={align}
                    onValueChange={setAlign}
                    ariaLabel="Alignment"
                    options={[
                        ["left", "left"],
                        ["right", "right"],
                        ["center", "center"],
                    ] as const}
                />
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="off" className={area}
                      aria-label="Table rows"/>
            <Out label="Box-drawing table" text={out} minH={90}/>
        </div>
    );
}

export function DotenvTool() {
    const [input, setInput] = React.useState(
        "# database\nDB_HOST=localhost # where\nexport SECRET=abc\n\nplain=x"
    );
    const [sort, setSort] = React.useState(true);
    const [uppercase, setUppercase] = React.useState(false);
    const [quote, setQuote] = React.useState(false);
    const [groupBlank, setGroupBlank] = React.useState(false);
    const out = React.useMemo(() => formatDotenv(input, {
        sort,
        uppercase,
        quote,
        groupBlank
    }), [input, sort, uppercase, quote, groupBlank]);
    const parsed = React.useMemo(() => parseDotenv(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="off" className={area}
                      aria-label=".env input"/>
            <div className="flex flex-wrap gap-3">
                <Check checked={sort} onChange={setSort} label="sort keys"/>
                <Check checked={uppercase} onChange={setUppercase} label="UPPERCASE keys"/>
                <Check checked={quote} onChange={setQuote} label="quote values"/>
                <Check checked={groupBlank} onChange={setGroupBlank} label="group w/ comments"/>
            </div>
            <Out label="Formatted .env" text={out} minH={70}/>
            <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Parsed pairs</span>
                <div className="max-h-40 overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                        <tbody>
                        {parsed.filter((p) => p.key).map((p) => (
                            <tr key={p.key} className="border-b last:border-0">
                                <td className="px-2 py-1 font-mono">{p.key}</td>
                                <td className="px-2 py-1 font-mono">{p.value}</td>
                                <td className="px-2 py-1 text-muted-foreground">{p.comment}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ─── Time ──────────────────────────────────────────────────────── */

export function DurationTool() {
    const [ms, setMs] = React.useState(5400000);
    const [text, setText] = React.useState("1h 30m");
    const parsed = React.useMemo(() => parseDuration(text), [text]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">ms</Label>
                <Num value={ms} onChange={setMs} ariaLabel="Milliseconds" w="w-36"/>
                <Badge variant="outline" className="font-mono text-xs">{formatDuration(ms)}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">string</Label>
                <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="h-8 w-40 font-mono text-xs"
                    aria-label="Duration string"
                />
                <Badge variant="outline" className="font-mono text-xs">
                    {parsed === null ? "unparsed" : `${parsed} ms`}
                </Badge>
            </div>
            <Note>Accepts compound strings (&quot;1h 30m&quot;, &quot;2 days&quot;, &quot;90 s&quot;); a bare number
                means seconds.</Note>
        </div>
    );
}

/* ─── Reference ─────────────────────────────────────────────────── */

export function SemverTool() {
    const [a, setA] = React.useState("1.2.3");
    const [b, setB] = React.useState("1.10.0");
    const [range, setRange] = React.useState("^1.2.0");
    const [version, setVersion] = React.useState("1.9.9");
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    const cmp = pa && pb ? compareSemver(pa, pb) : null;
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Input value={a} onChange={(e) => setA(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Version A"/>
                <span className="text-xs text-muted-foreground">vs</span>
                <Input value={b} onChange={(e) => setB(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Version B"/>
                {cmp !== null ? (
                    <Badge variant="outline" className="font-mono text-xs">
                        {cmp === 0 ? "equal" : cmp < 0 ? "A < B" : "A > B"}
                    </Badge>
                ) : (
                    <span className="text-xs text-red-600 dark:text-red-400">invalid version</span>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Input value={range} onChange={(e) => setRange(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Semver range"/>
                <span className="text-xs text-muted-foreground">⊇</span>
                <Input value={version} onChange={(e) => setVersion(e.target.value)}
                       className="h-8 w-32 font-mono text-xs" aria-label="Version to check"/>
                <Badge variant="outline" className="text-xs">
                    {semverSatisfies(range, version) ? "satisfies" : "does not satisfy"}
                </Badge>
            </div>
            <Note>Supports =, &gt;, &gt;=, &lt;, &lt;=, ^ and ~ ranges with full prerelease precedence
                (1.0.0-alpha &lt; 1.0.0).</Note>
        </div>
    );
}

export function ChmodTool() {
    const [octal, setOctal] = React.useState("755");
    const [symbolic, setSymbolic] = React.useState("rwxr-xr-x");
    const sym = React.useMemo(() => {
        try {
            return chmodToSymbolic(octal);
        } catch {
            return "";
        }
    }, [octal]);
    const oct = React.useMemo(() => {
        try {
            return chmodFromSymbolic(symbolic);
        } catch {
            return "";
        }
    }, [symbolic]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">octal</Label>
                <Input value={octal} onChange={(e) => setOctal(e.target.value)} className="h-8 w-24 font-mono text-xs"
                       aria-label="Octal mode"/>
                <span className="text-xs text-muted-foreground">→</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{sym || "—"}</code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">symbolic</Label>
                <Input value={symbolic} onChange={(e) => setSymbolic(e.target.value)}
                       className="h-8 w-28 font-mono text-xs" aria-label="Symbolic mode"/>
                <span className="text-xs text-muted-foreground">→</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{oct || "—"}</code>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {["owner", "group", "other"].map((who, i) => (
                    <div key={who} className="rounded-md border p-2">
                        <div className="mb-1 font-medium text-muted-foreground">{who}</div>
                        <div className="font-mono">{sym.slice(i * 3, i * 3 + 3) || "—"}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RomanTool() {
    const [num, setNum] = React.useState(2024);
    const [roman, setRoman] = React.useState("MMXXIV");
    const toR = React.useMemo(() => {
        try {
            return toRoman(num);
        } catch (e) {
            return (e as Error).message;
        }
    }, [num]);
    const fromR = React.useMemo(() => {
        try {
            return String(fromRoman(roman));
        } catch (e) {
            return (e as Error).message;
        }
    }, [roman]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Num value={num} onChange={setNum} min={0} ariaLabel="Number to convert"/>
                <span className="text-xs text-muted-foreground">→</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{toR}</code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Input value={roman} onChange={(e) => setRoman(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Roman numeral"/>
                <span className="text-xs text-muted-foreground">→</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{fromR}</code>
            </div>
            <Note>Range 1-3999; non-canonical forms like IIII are rejected.</Note>
        </div>
    );
}

export function NatoTool() {
    const [input, setInput] = React.useState("hello 9");
    const out = React.useMemo(() => toNato(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Text to spell"/>
            <Out label="NATO phonetics" text={out} minH={60}/>
        </div>
    );
}

export function HttpStatusTool() {
    const [q, setQ] = React.useState("");
    const rows = React.useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return HTTP_STATUSES;
        return HTTP_STATUSES.filter(
            (s) => String(s.code).includes(needle) || s.phrase.toLowerCase().includes(needle) || s.group.includes(needle)
        );
    }, [q]);
    return (
        <div className="space-y-3 py-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by code, phrase or group…"
                   className="h-8 text-xs" aria-label="Filter status codes"/>
            <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                    <tbody>
                    {rows.map((s) => (
                        <tr key={s.code} className="border-b last:border-0">
                            <td className="w-12 px-2 py-1 font-mono font-medium">{s.code}</td>
                            <td className="px-2 py-1">{s.phrase}</td>
                            <td className="px-2 py-1 text-muted-foreground">{s.note}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <Note>{rows.length} of {HTTP_STATUSES.length} codes shown — the everyday ones, with a one-line note
                each.</Note>
        </div>
    );
}

export function MimeTool() {
    const [q, setQ] = React.useState("");
    const rows = React.useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return MIME_TYPES;
        return MIME_TYPES.filter((m) => m.ext.includes(needle) || m.type.includes(needle) || m.note.toLowerCase().includes(needle));
    }, [q]);
    return (
        <div className="space-y-3 py-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by extension or type…"
                   className="h-8 text-xs" aria-label="Filter MIME types"/>
            <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                    <tbody>
                    {rows.map((m) => (
                        <tr key={m.ext} className="border-b last:border-0">
                            <td className="w-28 px-2 py-1 font-mono">{m.ext}</td>
                            <td className="px-2 py-1 font-mono">{m.type}</td>
                            <td className="px-2 py-1 text-muted-foreground">{m.note}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ─── Encoders ──────────────────────────────────────────────────── */

export function MorseTool() {
    const [input, setInput] = React.useState("SOS");
    const [mode, setMode] = React.useState<"enc" | "dec">("enc");
    const out = React.useMemo(() => {
        try {
            return mode === "enc" ? morseEncode(input) : morseDecode(input);
        } catch (e) {
            return `[error] ${(e as Error).message}`;
        }
    }, [input, mode]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={mode}
                    onValueChange={setMode}
                    ariaLabel="Morse direction"
                    options={[
                        ["enc", "text → morse"],
                        ["dec", "morse → text"],
                    ] as const}
                />
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft" className={area}
                      aria-label="Morse input"/>
            <Out label={mode === "enc" ? "Morse" : "Text"} text={out} minH={60}/>
            <Note>Letters, digits and common punctuation; &quot;/&quot; separates words.</Note>
        </div>
    );
}

export function QrTool() {
    const [text, setText] = React.useState("https://praxis.dev");
    const [level, setLevel] = React.useState<EccLevel>("M");
    const [margin, setMargin] = React.useState(4);
    const [cell, setCell] = React.useState(4);
    const {svg, error, version, size} = React.useMemo(() => {
        try {
            const result = encodeQr(text, {level});
            return {
                svg: qrToSvg(result, {
                    margin: Math.max(0, Math.min(8, margin)),
                    cellSize: Math.max(1, Math.min(12, cell))
                }), error: null as string | null, version: result.version, size: result.size
            };
        } catch (e) {
            return {svg: "", error: (e as Error).message, version: 0, size: 0};
        }
    }, [text, level, margin, cell]);

    return (
        <div className="space-y-3 py-1">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} wrap="soft"
                      className={cn(area, "min-h-[70px]")} aria-label="QR content"/>
            <div className="flex flex-wrap items-center gap-2">
                <Sel
                    value={level}
                    onValueChange={(v) => setLevel(v as EccLevel)}
                    ariaLabel="Error correction level"
                    options={[
                        ["L", "ECC L (7%)"],
                        ["M", "ECC M (15%)"],
                        ["Q", "ECC Q (25%)"],
                        ["H", "ECC H (30%)"],
                    ] as const}
                />
                <Label className="text-xs">margin</Label>
                <Num value={margin} onChange={setMargin} min={0} max={8} w="w-16" ariaLabel="QR margin"/>
                <Label className="text-xs">cell</Label>
                <Num value={cell} onChange={setCell} min={1} max={12} w="w-16" ariaLabel="QR cell size"/>
                {version > 0 && (
                    <Badge variant="outline" className="text-xs">v{version} · {size}×{size}</Badge>
                )}
            </div>
            {error ? (
                <Err>{error}</Err>
            ) : (
                <div className="flex justify-center rounded-md border bg-white p-4">
                    <div className="max-w-full [&>svg]:h-auto [&>svg]:max-h-72 [&>svg]:w-auto"
                         dangerouslySetInnerHTML={{__html: svg}}/>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <CopyBtn text={svg} label="Copy SVG"/>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!svg}
                        onClick={() => download("qr.svg", svg, "image/svg+xml")}>
                    Download .svg
                </Button>
            </div>
            <Note>Pure-TypeScript QR encoder (byte mode, versions 1-13, mask auto-pick) — no network, no library.</Note>
        </div>
    );
}

/* ─── Color ─────────────────────────────────────────────────────── */

export function ContrastTool() {
    const [fg, setFg] = React.useState("#767676");
    const [bg, setBg] = React.useState("#ffffff");
    const {ratio, rating} = React.useMemo(() => {
        const a = parseColor(fg);
        const b = parseColor(bg);
        if (!a || !b) return {ratio: 0, rating: "invalid color"};
        const r = contrastRatio(a, b);
        return {ratio: r, rating: wcagRating(r)};
    }, [fg, bg]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">fg</Label>
                <Input value={fg} onChange={(e) => setFg(e.target.value)} className="h-8 w-28 font-mono text-xs"
                       aria-label="Foreground color"/>
                <Label className="text-xs">bg</Label>
                <Input value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-28 font-mono text-xs"
                       aria-label="Background color"/>
                <Badge variant="outline" className="font-mono text-xs">{ratio.toFixed(2)} : 1</Badge>
                <Badge variant={ratio >= 4.5 ? "default" : "secondary"} className="text-xs">{rating}</Badge>
            </div>
            <div
                className="flex min-h-24 items-center justify-center rounded-md border p-4 text-lg font-medium"
                style={{color: fg, backgroundColor: bg}}
            >
                The quick brown fox jumps over the lazy dog 42
            </div>
            <Note>WCAG 2.x relative-luminance contrast. AA needs 4.5:1 (3:1 large), AAA needs 7:1.</Note>
        </div>
    );
}

export function GradientTool() {
    const [angle, setAngle] = React.useState(90);
    const [c1, setC1] = React.useState("#0ea5e9");
    const [c2, setC2] = React.useState("#10b981");
    const [c3, setC3] = React.useState("");
    const css = React.useMemo(() => {
        const stops = [{color: c1}, {color: c2, position: 100}];
        if (c3.trim()) stops.splice(1, 0, {color: c3.trim(), position: 50});
        return cssLinearGradient(angle, stops);
    }, [angle, c1, c2, c3]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">angle</Label>
                <Num value={angle} onChange={setAngle} min={0} max={360} ariaLabel="Gradient angle"/>
                <Input value={c1} onChange={(e) => setC1(e.target.value)} className="h-8 w-24 font-mono text-xs"
                       aria-label="Start color"/>
                <Input value={c3} onChange={(e) => setC3(e.target.value)} placeholder="mid (opt)"
                       className="h-8 w-24 font-mono text-xs" aria-label="Middle color"/>
                <Input value={c2} onChange={(e) => setC2(e.target.value)} className="h-8 w-24 font-mono text-xs"
                       aria-label="End color"/>
            </div>
            <div className="min-h-24 rounded-md border" style={{background: css}}/>
            <Out label="CSS" text={`background: ${css};`} minH={40}/>
        </div>
    );
}

export function ShadowTool() {
    const [x, setX] = React.useState(4);
    const [y, setY] = React.useState(6);
    const [blur, setBlur] = React.useState(10);
    const [spread, setSpread] = React.useState(0);
    const [color, setColor] = React.useState("rgba(0,0,0,.3)");
    const [inset, setInset] = React.useState(false);
    const [layers, setLayers] = React.useState(1);
    const css = React.useMemo(
        () => cssBoxShadow({x, y, blur, spread, color, inset}, layers),
        [x, y, blur, spread, color, inset, layers]
    );
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">x</Label>
                <Num value={x} onChange={setX} w="w-16" ariaLabel="Shadow x"/>
                <Label className="text-xs">y</Label>
                <Num value={y} onChange={setY} w="w-16" ariaLabel="Shadow y"/>
                <Label className="text-xs">blur</Label>
                <Num value={blur} onChange={setBlur} min={0} w="w-16" ariaLabel="Shadow blur"/>
                <Label className="text-xs">spread</Label>
                <Num value={spread} onChange={setSpread} w="w-16" ariaLabel="Shadow spread"/>
                <Label className="text-xs">layers</Label>
                <Num value={layers} onChange={setLayers} min={1} max={5} w="w-16" ariaLabel="Shadow layers"/>
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Shadow color"/>
                <Check checked={inset} onChange={setInset} label="inset"/>
            </div>
            <div className="flex min-h-28 items-center justify-center rounded-md bg-muted/40 p-6">
                <div className="rounded-lg bg-background px-8 py-6 text-sm font-medium" style={{boxShadow: css}}>
                    Preview card
                </div>
            </div>
            <Out label="CSS" text={`box-shadow: ${css};`} minH={40}/>
            <Note>Multi-layer mode stacks progressively larger/softer copies — nice for soft UI shadows.</Note>
        </div>
    );
}

/* ─── URL & network ─────────────────────────────────────────────── */

export function SubnetTool() {
    const [input, setInput] = React.useState("192.168.1.130/24");
    const facts = React.useMemo(() => parseSubnet(input), [input]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">CIDR</Label>
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="h-8 w-48 font-mono text-xs"
                    aria-label="CIDR input"
                    placeholder="192.168.1.130/24"
                />
            </div>
            {facts ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 text-xs sm:grid-cols-3">
                    {(
                        [
                            ["Network", facts.cidr],
                            ["Netmask", facts.mask],
                            ["Broadcast", facts.broadcast],
                            ["First host", facts.firstHost],
                            ["Last host", facts.lastHost],
                            ["Usable hosts", facts.hosts.toLocaleString()],
                            ["Class", facts.class],
                            ["Private/loopback", facts.private ? "yes" : "no"],
                            ["Prefix", `/${facts.prefix}`],
                        ] as const
                    ).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-mono">{v}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <Err>Not a valid IPv4 CIDR (expected e.g. 10.0.0.0/8).</Err>
            )}
        </div>
    );
}

/* ─── Converters ────────────────────────────────────────────────── */

export function JsonTsTool() {
    const [input, setInput] = React.useState('{\n  "user": { "name": "Ada", "tags": ["a", "b"], "active": true }\n}');
    const [name, setName] = React.useState("Root");
    const out = React.useMemo(() => {
        try {
            const parsed = JSON.parse(input) as unknown;
            const t = jsonToTypes(parsed, name.trim() || "Root");
            return t || "// no object types found in the input";
        } catch (e) {
            return `[error] ${(e as Error).message}`;
        }
    }, [input, name]);
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="off" className={area}
                      aria-label="JSON input"/>
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Root name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-32 font-mono text-xs"
                       aria-label="Root interface name"/>
            </div>
            <Out label="TypeScript types" text={out} minH={120}/>
            <Note>Nested objects become named interfaces; mixed arrays become unions; non-identifier keys get
                quoted.</Note>
        </div>
    );
}
