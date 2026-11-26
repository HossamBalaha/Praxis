import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import {getScriptsRoot, restoreActiveProjectRoot} from "@/lib/scripts";

/**
 * POST /api/spell
 *
 * Actions:
 *
 *  1. { action: "check", text, kind?, dict?, hint? } → spell-check a
 *     text buffer (markdown or plain prose). Returns every misspelled
 *     word with its 1-indexed line + column, plus the dictionary that
 *     was used:
 *       { ok, dict, misspelled: [{ word, line, col }] }
 *
 *     `dict` selects the dictionary: "auto" (the default) detects the
 *     language from the text itself; an explicit language name
 *     ("english", "spanish", …) pins it. `hint` is an optional caller
 *     side language (the file's natural language, name or ISO code)
 *     that overrides detection when it maps — only prose kinds carry
 *     one (a python file's comments are typically english, so its
 *     viewers send no hint and let detection read the prose).
 *
 *  2. { action: "suggest", word, limit?, dict? } → near-matches for
 *     ONE word (the misspelled-word popover fetches these on open —
 *     cheap: one bounded scan over the dictionary). Honors `dict`;
 *     "auto" reuses the language the most recent check settled on.
 *       { ok, dict, suggestions: [...] }
 *
 *  3. { action: "ignore", word }        → append a word to the
 *     project dictionary (`.praxis/spell-ignore.json`), so future
 *     checks skip it. Stamps the add time (shown in the manager).
 *     Returns { ok, ignored: [{ word, addedAt }] }.
 *
 *  4. { action: "remove", word }        → take a word OUT of the
 *     project dictionary (the dictionary manager's ✕ button).
 *     Returns { ok, ignored: [{ word, addedAt }] }.
 *
 *  5. { action: "clear" }               → empty the project
 *     dictionary in one go. Returns { ok, ignored: [] }.
 *
 * GET /api/spell → { ok, ignored: [{ word, addedAt }], dicts } (the
 * current project dictionary — words + when they were added, plus the
 * dictionary languages installed under public/dict). Legacy files
 * that hold a bare string[] come back with addedAt: null.
 *
 * Dictionaries: `public/dict/<language>.txt` — one lowercase word per
 * line, loaded once per server process into a Set, cached per
 * language (english.txt ships 240k words; spanish/french/german/
 * italian/portuguese/russian ride alongside). The files ship with the
 * app (they are copied into the standalone build by the package
 * script), so no runtime downloads.
 *
 * Tokenizer rules (tuned for prose-in-code: READMEs + comments):
 *   - words = runs of Latin/Cyrillic letters + internal apostrophes
 *     (unicode-aware, so être / señor / дом all tokenize whole)
 *   - anything containing a digit is an identifier — skipped
 *   - MixedCase / camelCase tokens are identifiers — skipped
 *   - ALL-CAPS acronyms ≤ 5 chars are skipped (ANSI, CSV, MSE…)
 *   - possessives: "folder's" checks "folder" and "folders"
 *   - elisions/contractions: "l'homme", "qu'elle", "l'ho" fall back
 *     to their letter runs ("homme", "elle", "ho")
 *   - scripts without a dictionary here (CJK, Arabic, …) are never
 *     tokenized — flagging unsegmentable runs would be pure noise
 *   - markdown: fenced code blocks, inline code, URLs and link
 *     targets are stripped before checking (kind: "markdown")
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Dictionaries (loaded once per process) ─────────────────────────
/** The dictionary languages this route understands. "auto" is a
 * REQUEST value (detect from the text), never a file name. */
const DICT_LANGUAGES = [
    "english",
    "spanish",
    "french",
    "german",
    "italian",
    "portuguese",
    "russian",
] as const;
type DictLanguage = (typeof DICT_LANGUAGES)[number];

const dictCache = new Map<string, Set<string>>();

function dictDir(): string {
    // Dev: <project>/public/...  Standalone: cwd is the standalone root
    // and the build script copies public/ into it — same relative path.
    return path.join(process.cwd(), "public", "dict");
}

/** The dictionary files present (basenames without .txt) — the
 * allowlist `dict` / `hint` values validate against. Listed with ONE
 * readdirSync per process (cached); a file dropped in later needs the
 * usual dev-server restart to register. */
let availableCache: Set<string> | null = null;

function availableDicts(): Set<string> {
    if (availableCache) return availableCache;
    try {
        availableCache = new Set(
            fsSync
                .readdirSync(dictDir())
                .filter((f) => f.endsWith(".txt"))
                .map((f) => f.slice(0, -4))
        );
    } catch {
        availableCache = new Set();
    }
    return availableCache;
}

async function loadDictionary(name: string): Promise<Set<string>> {
    const cached = dictCache.get(name);
    if (cached) return cached;
    let words: Set<string>;
    try {
        const raw = await fs.readFile(path.join(dictDir(), `${name}.txt`), "utf-8");
        words = new Set(
            raw.split("\n").map((w) => w.trim()).filter(Boolean)
        );
    } catch {
        // Missing file — callers decide the fallback (see resolveDictionary).
        words = new Set();
    }
    dictCache.set(name, words);
    return words;
}

// ─── Language auto-detection ────────────────────────────────────────
// ~30 function words per language, counted in the (markdown-stripped)
// prose. Function words are the classic fingerprint: they survive any
// topic, and no sane identifier is called "the" or "nicht". Words
// shared by several languages (que: es+pt, la: es+fr+it) count
// fractionally, so distinctive hits decide. Programming keywords are
// deliberately NOT English stopwords — a Spanish python file's code
// (if/for/not/def) must not outvote its comments.
const STOPWORDS: Record<DictLanguage, string[]> = {
    english: [
        "the", "of", "to", "he", "she", "was", "you", "that", "they",
        "been", "has", "had", "were", "them", "then", "when", "what",
        "your", "about", "which", "their", "there", "would", "could",
        "should", "people", "because", "very", "through", "just", "much",
    ],
    spanish: [
        "el", "la", "que", "los", "las", "de", "en", "un", "una",
        "por", "con", "para", "como", "pero", "sus", "le", "ya",
        "este", "esta", "porque", "muy", "sin", "sobre", "también",
        "hasta", "donde", "quien", "desde", "todo", "nos", "les",
    ],
    french: [
        "le", "la", "les", "des", "est", "une", "pour", "que", "qui",
        "dans", "pas", "plus", "elle", "sur", "aux", "avec", "tout",
        "mais", "nous", "vous", "comme", "ont", "été", "leur", "cela",
        "cette", "être", "avoir", "fait", "dire", "même", "aussi",
    ],
    german: [
        "der", "die", "und", "den", "von", "zu", "das", "mit", "sich",
        "des", "auf", "für", "ist", "im", "dem", "nicht", "ein",
        "eine", "als", "auch", "werden", "aus", "er", "dass", "sie",
        "nach", "bei", "um", "uns", "noch", "aber",
    ],
    italian: [
        "il", "che", "di", "non", "per", "con", "del", "della", "sono",
        "si", "al", "gli", "alla", "più", "anche", "essere", "hanno",
        "fatto", "quando", "questo", "quella", "così", "bene", "senza",
        "ogni", "molto", "poco", "prima", "dopo", "stato", "detto",
    ],
    portuguese: [
        "que", "de", "do", "da", "em", "um", "para", "com", "não",
        "uma", "dos", "se", "por", "mais", "como", "mas", "ao",
        "ele", "isso", "você", "tem", "foi", "ser", "pelo", "na",
        "no", "das", "os", "são", "está", "muito", "já",
    ],
    russian: [
        "и", "в", "не", "на", "что", "с", "он", "как", "а", "то",
        "все", "она", "так", "его", "но", "да", "к", "у", "же",
        "вы", "за", "бы", "по", "только", "её", "мне", "было", "вот",
        "от", "меня", "ещё", "этом",
    ],
};

/** word → [language, weight] pairs; a word listed by N languages is
 * worth 1/N points to each, so "que" (es+pt) splits while "der"
 * (de only) counts whole. Built once at module load. */
const STOPWORD_INDEX: ReadonlyMap<string, ReadonlyArray<readonly [DictLanguage, number]>> =
    (() => {
        const index = new Map<string, Array<[DictLanguage, number]>>();
        for (const lang of DICT_LANGUAGES) {
            for (const w of STOPWORDS[lang]) {
                const entry = index.get(w) ?? [];
                entry.push([lang, 0]); // weight filled in once counts are known
                index.set(w, entry);
            }
        }
        for (const entries of index.values()) {
            const weight = 1 / entries.length;
            for (const e of entries) e[1] = weight;
        }
        return index;
    })();

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const DETECT_TOKEN_RE = /[\p{Script=Latin}\p{Script=Cyrillic}]+/gu;

/** Detect the prose language from stopword hits. Pure — unit-tested
 * through the POST handler. */
function detectLanguage(text: string): DictLanguage {
    const tokens = text.toLowerCase().match(DETECT_TOKEN_RE);
    if (!tokens || tokens.length === 0) return "english";
    let cyrillic = 0;
    let latin = 0;
    let totalHits = 0;
    const scores = new Map<DictLanguage, number>();
    const rawHits = new Map<DictLanguage, number>();
    for (const t of tokens) {
        if (CYRILLIC_RE.test(t)) cyrillic++;
        else latin++;
        const entries = STOPWORD_INDEX.get(t);
        if (entries) {
            totalHits++;
            for (const [lang, weight] of entries) {
                scores.set(lang, (scores.get(lang) ?? 0) + weight);
                rawHits.set(lang, (rawHits.get(lang) ?? 0) + 1);
            }
        }
    }
    // Script dominance beats stopwords: a Cyrillic-majority text is
    // Russian whatever Latin words ride along (identifiers, brand
    // names), and its function words can't collide with Latin lists.
    if (cyrillic > latin) return "russian";
    // Under three stopword hits total — not enough signal; the
    // historical default stands.
    if (totalHits < 3) return "english";
    let best: DictLanguage = "english";
    let bestScore = -1;
    let bestHits = -1;
    let secondScore = -1;
    for (const lang of DICT_LANGUAGES) {
        const s = scores.get(lang) ?? 0;
        const h = rawHits.get(lang) ?? 0;
        // strict > keeps the earlier language on ties — deterministic
        if (s > bestScore || (s === bestScore && h > bestHits)) {
            secondScore = bestScore; // the previous best is the runner-up
            best = lang;
            bestScore = s;
            bestHits = h;
        } else if (s > secondScore) {
            secondScore = s;
        }
    }
    // Ambiguity guard: a non-English winner must CLEARLY beat the
    // runner-up (1.5×) — code buffers ride identifiers and keywords
    // alongside the comments, and a one-word tip ("se" is Portuguese,
    // "el" Spanish) must not flip the dictionary. Ambiguous → English.
    if (best !== "english" && secondScore >= 0 && bestScore < 1.5 * secondScore) {
        return "english";
    }
    return best;
}

/** Caller hints (the file's natural language) → dictionary language.
 * Names and ISO codes map; file KINDS ("markdown", "python") are not
 * languages and deliberately don't — detection reads the prose. */
const HINT_ALIASES: Record<string, DictLanguage> = {
    english: "english", en: "english",
    spanish: "spanish", es: "spanish", español: "spanish", castellano: "spanish",
    french: "french", fr: "french", français: "french",
    german: "german", de: "german", deutsch: "german",
    italian: "italian", it: "italian", italiano: "italian",
    portuguese: "portuguese", pt: "portuguese", português: "portuguese", portugues: "portuguese",
    russian: "russian", ru: "russian", русский: "russian",
};

/** The language the most recent check settled on — the suggest
 * popover's "auto" anchor: it only POSTs the word, so its near-matches
 * come from the dictionary the surrounding text was checked against. */
let lastDetected: DictLanguage = "english";

interface ResolvedDict {
    /** The language actually used (reported back to the caller). */
    name: DictLanguage;
    words: Set<string>;
}

/** Pick the dictionary for a check: explicit `dict` → caller `hint` →
 * detection → fallbacks. Every explicit choice still validates against
 * the files present, so a name without a file degrades to detection
 * instead of 500-ing or checking against nothing. */
async function resolveDictionary(
    dict: unknown,
    hint: unknown,
    text: string
): Promise<ResolvedDict> {
    const available = availableDicts();
    if (typeof dict === "string") {
        const wanted = dict.trim().toLowerCase();
        if (wanted !== "auto" && available.has(wanted)) {
            return {
                name: wanted as DictLanguage,
                words: await loadDictionary(wanted),
            };
        }
    }
    if (typeof hint === "string") {
        const mapped = HINT_ALIASES[hint.trim().toLowerCase()];
        if (mapped && available.has(mapped)) {
            return {name: mapped, words: await loadDictionary(mapped)};
        }
    }
    const detected = detectLanguage(text);
    if (available.has(detected)) {
        return {name: detected, words: await loadDictionary(detected)};
    }
    // Detected language has no file here. Latin-script text degrades to
    // the English dictionary (the historical behavior); Cyrillic text
    // would flag EVERY word against a Latin dictionary — return no
    // dictionary instead (no squiggles): we simply can't check that
    // language on this install.
    if (detected === "russian") {
        return {name: "russian", words: new Set<string>()};
    }
    return {name: "english", words: await loadDictionary("english")};
}

/** Pick the dictionary for a suggest call (same precedence, but there
 * is no prose to detect — a single word carries at most its script). */
async function resolveSuggestDict(dict: unknown, word: string): Promise<string> {
    const available = availableDicts();
    if (typeof dict === "string") {
        const wanted = dict.trim().toLowerCase();
        if (wanted !== "auto" && available.has(wanted)) return wanted;
    }
    // "auto": a Cyrillic word can only come from Cyrillic prose.
    if (CYRILLIC_RE.test(word) && available.has("russian")) return "russian";
    return available.has(lastDetected) ? lastDetected : "english";
}

// ─── Project dictionary (.praxis/spell-ignore.json) ─────────────
// One entry per word with the ADD TIMESTAMP (shown in the manager —
// "show the timestamp that the word added in the dictionary"):
//
//   [ { "word": "praxis", "addedAt": "2026-11-18T13:22:04.123Z" } ]
//
// The old shape — a bare string[] — still reads fine (every word
// comes back with addedAt: null); the first write upgrades the file
// to the timestamped shape.
export interface DictEntry {
    word: string;
    addedAt: string | null;
}

// getScriptsRoot — the ACTIVE project's root (falling back to the
// default scripts dir). The old resolution (active project ?? env ??
// cwd) wrote the file to the APP root when the default project was
// open, so the ignore list lived outside the project the user saw in
// the explorer.
function ignoreFilePath(): string {
    return path.join(getScriptsRoot(), ".praxis", "spell-ignore.json");
}

async function readIgnoreList(): Promise<DictEntry[]> {
    try {
        const text = await fs.readFile(ignoreFilePath(), "utf-8");
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            const out: DictEntry[] = [];
            for (const entry of parsed) {
                if (typeof entry === "string") {
                    // legacy bare-word list — no add time known
                    out.push({word: entry, addedAt: null});
                } else if (
                    entry &&
                    typeof entry === "object" &&
                    typeof (entry as { word?: unknown }).word === "string"
                ) {
                    const at = (entry as { addedAt?: unknown }).addedAt;
                    out.push({
                        word: (entry as { word: string }).word,
                        addedAt: typeof at === "string" && at ? at : null,
                    });
                }
            }
            return out;
        }
    } catch {
        /* missing / malformed — empty list */
    }
    return [];
}

async function writeIgnoreList(entries: DictEntry[]): Promise<void> {
    const file = ignoreFilePath();
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, JSON.stringify(entries, null, 2), "utf-8");
}

// ─── Markdown stripping ───────────────────────────────────────────
/** Remove fenced code blocks, inline code, URLs and link targets so
 * they're never spell-checked. Line breaks are preserved so reported
 * line numbers stay accurate. */
function stripMarkdown(text: string): string {
    const lines = text.split("\n");
    let inFence = false;
    return lines
        .map((line) => {
            if (/^\s*(```|~~~)/.test(line)) {
                inFence = !inFence;
                return "";
            }
            if (inFence) return "";
            let out = line;
            // Inline code spans first (may contain pipes/brackets).
            out = out.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
            // Bare URLs + markdown link targets.
            out = out.replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
            out = out.replace(/\]\([^)]*\)/g, (m) => " ".repeat(m.length));
            // Image alt text labels / leading # headings keep their words —
            // those ARE prose. Math fragments ($...$) are stripped too.
            out = out.replace(/\$\$[^$]*\$\$/g, (m) => " ".repeat(m.length));
            out = out.replace(/\$[^$]*\$/g, (m) => " ".repeat(m.length));
            return out;
        })
        .join("\n");
}

// ─── Suggestions (near-matches for a misspelled word) ───────────
/** Bounded Levenshtein distance — early-exits once the budget is
 * blown, so a 240k-word scan stays a few milliseconds. */
function editDistanceWithin(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = new Array<number>(b.length + 1);
    const cur = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        let rowMin = cur[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (cur[j] < rowMin) rowMin = cur[j];
        }
        if (rowMin > max) return max + 1; // every completion of this row is over budget
        for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
}

/** Near-matches for `word` from the named dictionary, best-first.
 * Tries distance 1 first (the classic “did you mean” tier), then
 * distance 2; ties keep the shorter word (less typing). */
async function suggestFor(word: string, limit: number, dictName: string): Promise<string[]> {
    const dict = await loadDictionary(dictName);
    const w = word.toLowerCase();
    if (!w || dict.has(w)) return [];
    const sameFirst: string[] = [];
    const rest: string[] = [];
    for (const cand of dict) {
        // cheap length gate before the expensive distance call
        if (Math.abs(cand.length - w.length) > 2) continue;
        if (cand[0] === w[0]) sameFirst.push(cand);
        else if (Math.abs(cand.length - w.length) <= 1) rest.push(cand);
    }
    const scored: Array<{ word: string; d: number }> = [];
    for (const cand of sameFirst) {
        const d = editDistanceWithin(w, cand, 2);
        if (d <= 2) scored.push({word: cand, d});
    }
    if (scored.length < limit) {
        for (const cand of rest) {
            const d = editDistanceWithin(w, cand, 2);
            if (d <= 2) scored.push({word: cand, d});
        }
    }
    scored.sort((x, y) => x.d - y.d || x.word.length - y.word.length || (x.word < y.word ? -1 : 1));
    const out: string[] = [];
    for (const s of scored) {
        if (out.length >= limit) break;
        out.push(s.word);
    }
    return out;
}

// ─── Check ────────────────────────────────────────────────────────
// Latin + Cyrillic letters with internal apostrophes. Unicode-aware
// so accented Latin (être, señor, über) and Cyrillic (дом) tokenize
// whole; scripts with no dictionary here (CJK, Arabic…) match nothing
// and are never flagged.
const WORD_RE = /[\p{Script=Latin}\p{Script=Cyrillic}]+(?:'[\p{Script=Latin}\p{Script=Cyrillic}]+)*/gu;
/** A single dictionary word (ignore/suggest payload validation) —
 * letters first, then letters/apostrophes/hyphens. */
const WORD_FORM_RE = /^[\p{Script=Latin}\p{Script=Cyrillic}][\p{Script=Latin}\p{Script=Cyrillic}'-]*$/u;
const MAX_TEXT_BYTES = 300_000;

interface Misspelled {
    word: string;
    line: number;
    col: number;
}

function checkText(text: string, dict: Set<string>, ignored: Set<string>): Misspelled[] {
    const out: Misspelled[] = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const m of line.matchAll(WORD_RE)) {
            const raw = m[0];
            const start = m.index ?? 0;
            // Identifier-ish heuristics.
            if (/\d/.test(raw)) continue;
            if (/\p{Lu}/u.test(raw.slice(1))) continue; // MixedCase / camelCase
            if (raw === raw.toUpperCase() && raw.length <= 5) continue; // acronyms
            // Possessive: try "word", "words".
            const candidates = [raw];
            if (raw.endsWith("'s")) {
                candidates.push(raw.slice(0, -2), raw.slice(0, -2) + "s");
            } else if (raw.endsWith("'")) {
                candidates.push(raw.slice(0, -1));
            }
            // Elisions / contractions: if the whole token isn't a word, the
            // letter runs around the apostrophe may be — "l'homme" →
            // "homme", "qu'elle" → "elle", "l'ho" → "ho" (English
            // "don't" → "don" as a harmless side effect).
            if (raw.includes("'")) {
                let anySegment = false;
                for (const seg of raw.split("'")) {
                    if (seg.length >= 2) {
                        anySegment = true;
                        if (!candidates.includes(seg)) candidates.push(seg);
                    }
                }
                // Pure function-word glue ("d'à", "l'a") — every run around
                // the apostrophe is a single letter; nothing checkable.
                if (!anySegment) continue;
            }
            const lowered = candidates.map((c) => c.toLowerCase());
            if (lowered.some((c) => dict.has(c))) continue;
            if (lowered.some((c) => ignored.has(c))) continue;
            if (raw.length <= 1) continue;
            out.push({word: raw, line: i + 1, col: start + 1});
        }
    }
    return out;
}

export async function GET() {
    return NextResponse.json({
        ok: true,
        ignored: await readIgnoreList(),
        dicts: [...availableDicts()].sort(),
    });
}

export async function POST(request: Request) {
    // Cold-start guard: this can be the first route a fresh server
    // process handles — restore the persisted active-project pointer so
    // the ignore list resolves inside the project the user actually has
    // open (no-op after the first call).
    await restoreActiveProjectRoot();
    let body: {
        action?: string;
        text?: string;
        kind?: string;
        word?: string;
        limit?: number;
        dict?: string;
        hint?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    if (body.action === "ignore") {
        const word = (body.word ?? "").trim();
        if (!word || !WORD_FORM_RE.test(word)) {
            return NextResponse.json(
                {error: "Invalid word to ignore."},
                {status: 400}
            );
        }
        const list = await readIgnoreList();
        if (!list.some((e) => e.word.toLowerCase() === word.toLowerCase())) {
            list.push({word, addedAt: new Date().toISOString()});
            await writeIgnoreList(list);
        }
        return NextResponse.json({ok: true, ignored: list});
    }

    if (body.action === "remove") {
        const word = (body.word ?? "").trim();
        if (!word) {
            return NextResponse.json({error: "Missing word to remove."}, {status: 400});
        }
        const list = (await readIgnoreList()).filter(
            (e) => e.word.toLowerCase() !== word.toLowerCase()
        );
        await writeIgnoreList(list);
        return NextResponse.json({ok: true, ignored: list});
    }

    if (body.action === "clear") {
        await writeIgnoreList([]);
        return NextResponse.json({ok: true, ignored: []});
    }

    if (body.action === "suggest") {
        // Near-matches for ONE word (the misspelled-word popover fetches
        // these on open — cheap: one bounded scan over the dictionary).
        // The dictionary follows the caller's `dict`; "auto" (what the
        // popover sends today, by omission) reuses the language the last
        // check used, so Spanish text gets Spanish suggestions.
        const word = (body.word ?? "").trim();
        const limit = Math.max(1, Math.min(8, Number(body.limit) || 3));
        if (!word || !WORD_FORM_RE.test(word)) {
            return NextResponse.json({ok: true, suggestions: []});
        }
        const dictName = await resolveSuggestDict(body.dict, word);
        return NextResponse.json({
            ok: true,
            dict: dictName,
            suggestions: await suggestFor(word, limit, dictName),
        });
    }

    // Default action: "check".
    const text = typeof body.text === "string" ? body.text : "";
    if (text.length > MAX_TEXT_BYTES) {
        return NextResponse.json(
            {error: `Text too long to spell-check (> ${MAX_TEXT_BYTES} chars).`},
            {status: 413}
        );
    }
    const source = body.kind === "markdown" ? stripMarkdown(text) : text;
    const [resolved, ignoreList] = await Promise.all([
        resolveDictionary(body.dict, body.hint, source),
        readIgnoreList(),
    ]);
    lastDetected = resolved.name;
    const ignored = new Set(ignoreList.map((e) => e.word.toLowerCase()));
    return NextResponse.json({
        ok: true,
        dict: resolved.name,
        misspelled: checkText(source, resolved.words, ignored),
        ignoredCount: ignoreList.length,
    });
}
