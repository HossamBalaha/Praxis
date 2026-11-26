"use client";

/**
 * tool-textanalysis.tsx — the "Text Analysis" toolbox category
 * (base tools; the registry's boosts keep the category ≥ 30 — see
 * dev-toolbox.tsx). Readability, frequencies, similarity and structure
 * analyzers over pasted prose. All offline.
 */

import {makeTextTool, type TextToolSpec} from "./tool-factory";

const WORDS = (text: string): string[] => text.toLowerCase().match(/[a-z0-9''-]+/g) ?? [];
const STOPWORDS = new Set(
    "a an the and or but if then else when while of to in on at by for with from into over under above below up down out off again further once here there all any both each few more most other some such no nor not only own same so than too very can will just don should now is are was were be been being am have has had do does did i me my we our you your he him his she her it its they them their this that these those as until about against between through during before after".split(" ")
);
const syllables = (word: string): number => {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    const trimmed = w
        .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
        .replace(/^y/, "");
    const groups = trimmed.match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups?.length ?? 1);
};
const sentences = (text: string): string[] =>
    text
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

const levDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({length: n + 1}, (_, i) => i);
    const cur = new Array<number>(n + 1);
    for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        prev = cur.slice();
    }
    return prev[n];
};

const soundex = (word: string): string => {
    const w = word.toUpperCase().replace(/[^A-Z]/g, "");
    if (!w) return "";
    const code = (c: string): string => {
        if ("BFPV".includes(c)) return "1";
        if ("CGJKQSXZ".includes(c)) return "2";
        if ("DT".includes(c)) return "3";
        if (c === "L") return "4";
        if ("MN".includes(c)) return "5";
        if (c === "R") return "6";
        return "";
    };
    let out = w[0];
    let last = code(w[0]);
    for (const c of w.slice(1)) {
        const d = code(c);
        if (d && d !== last) out += d;
        if (c !== "H" && c !== "W") last = d;
        if (out.length === 4) break;
    }
    return (out + "000").slice(0, 4);
};

export const TEXTANALYSIS_TOOLS: TextToolSpec[] = [
    {
        id: "ta-readability",
        label: "Readability Scores",
        description: "Flesch Reading Ease, Flesch–Kincaid grade, Gunning Fog + counts — the editor's-eye report.",
        sample:
            "The quick brown fox jumps over the lazy dog. Praxis turns theory into daily practice, and practice into mastery that lasts.",
        transform: (input) => {
            const text = input.trim();
            const words = WORDS(text);
            const sents = sentences(text);
            if (words.length === 0 || sents.length === 0) return "Error: need at least one sentence of prose.";
            const syllCount = words.reduce((a, w) => a + syllables(w), 0);
            const wps = words.length / sents.length;
            const spw = syllCount / words.length;
            const complex = words.filter((w) => syllables(w) >= 3).length;
            const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
            const fkGrade = 0.39 * wps + 11.8 * spw - 15.59;
            const fog = 0.4 * (wps + 100 * (complex / words.length));
            const level = flesch >= 90 ? "very easy (5th grade)" : flesch >= 80 ? "easy (6th grade)" : flesch >= 70 ? "fairly easy (7th)" : flesch >= 60 ? "plain English (8–9th)" : flesch >= 50 ? "fairly difficult (10–12th)" : flesch >= 30 ? "difficult (college)" : "very difficult (graduate)";
            return [
                `words ${words.length} · sentences ${sents.length} · syllables ${syllCount}`,
                `avg words/sentence   ${wps.toFixed(1)}`,
                `avg syllables/word   ${spw.toFixed(2)}`,
                `complex words (3+)   ${complex} (${((100 * complex) / words.length).toFixed(0)}%)`,
                `Flesch Reading Ease  ${flesch.toFixed(1)} — ${level}`,
                `Flesch–Kincaid grade ${fkGrade.toFixed(1)}`,
                `Gunning Fog index    ${fog.toFixed(1)}`,
            ].join("\n");
        },
    },
    {
        id: "ta-reading-time",
        label: "Reading / Speaking Time",
        description: "How long the text takes to read (200–250 wpm) and to speak aloud (~140 wpm).",
        sample: "Paste an article or speech here to see how long it takes to read.",
        transform: (input) => {
            const words = WORDS(input).length;
            const mins = (wpm: number) => {
                const t = words / wpm;
                const m = Math.floor(t);
                const s = Math.round((t - m) * 60);
                return `${m}m ${String(s).padStart(2, "0")}s`;
            };
            return [
                `words            ${words}`,
                `read (slow 200)  ${mins(200)}`,
                `read (avg 235)    ${mins(235)}`,
                `read (fast 250)  ${mins(250)}`,
                `speak (~140 wpm)  ${mins(140)}`,
            ].join("\n");
        },
    },
    {
        id: "ta-word-freq",
        label: "Word Frequency Table",
        description: "Top-N words with counts and share — stopword filtering optional.",
        sample: "the cat sat on the mat and the cat ate the rat",
        options: [
            {
                key: "top",
                label: "Top N",
                kind: "select",
                choices: [["10", "10"], ["20", "20"], ["50", "50"]],
                default: "20"
            },
            {key: "stop", label: "Drop stop-words", kind: "toggle", default: true},
        ],
        transform: (input, o) => {
            let words = WORDS(input);
            if (o.stop === true) words = words.filter((w) => !STOPWORDS.has(w));
            if (words.length === 0) return "Error: no words after filtering.";
            const counts = new Map<string, number>();
            for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
            const top = parseInt(String(o.top), 10) || 20;
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const max = sorted[0][1];
            return sorted.slice(0, top).map(([w, c]) => {
                const bar = "█".repeat(Math.max(1, Math.round((c / max) * 24)));
                return `${w.padEnd(Math.min(18, max === 1 ? 18 : 18))} ${String(c).padStart(4)}  ${(100 * c).toFixed(1)}%  ${bar}`;
            }).join("\n");
        },
    },
    {
        id: "ta-letter-freq",
        label: "Letter Frequency",
        description: "A–Z counts + percentages with a bar chart — the cryptanalysis starter.",
        sample: "The quick brown fox jumps over the lazy dog.",
        transform: (input) => {
            const letters = input.toLowerCase().replace(/[^a-z]/g, "");
            if (letters.length === 0) return "Error: no letters found.";
            const counts = new Array<number>(26).fill(0);
            for (const c of letters) counts[c.charCodeAt(0) - 97]++;
            const max = Math.max(...counts);
            return counts
                .map((c, i) => {
                    const letter = String.fromCharCode(97 + i);
                    const bar = "█".repeat(Math.max(c > 0 ? 1 : 0, Math.round((c / max) * 20)));
                    return `${letter} ${String(c).padStart(5)}  ${((100 * c) / letters.length).toFixed(2).padStart(5)}%  ${bar}`;
                })
                .filter((line, i) => counts[i] > 0)
                .join("\n");
        },
    },
    {
        id: "ta-ngrams",
        label: "N-Gram Counter",
        description: "Most common word pairs / triples / quadruples — phrase mining for SEO and style.",
        sample: "praxis makes practice perfect practice makes praxis",
        options: [{
            key: "n",
            label: "N",
            kind: "select",
            choices: [["2", "2 (bigrams)"], ["3", "3 (trigrams)"], ["4", "4"]],
            default: "2"
        }],
        transform: (input, o) => {
            const words = WORDS(input);
            const n = parseInt(String(o.n), 10) || 2;
            if (words.length < n) return `Error: fewer than ${n} words.`;
            const counts = new Map<string, number>();
            for (let i = 0; i <= words.length - n; i++) {
                const gram = words.slice(i, i + n).join(" ");
                counts.set(gram, (counts.get(gram) ?? 0) + 1);
            }
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25);
            const max = sorted[0]?.[1] ?? 1;
            return sorted
                .map(([g, c]) => `${String(c).padStart(3)}  ${g}  ${"█".repeat(Math.max(1, Math.round((c / max) * 20)))}`)
                .join("\n");
        },
    },
    {
        id: "ta-char-count",
        label: "Character Census",
        description: "Chars, chars-no-spaces, letters, digits, punctuation, spaces, unicode-class shares.",
        sample: "Praxis 2026 — practice daily!",
        transform: (input) => {
            const chars = [...input];
            const letters = (input.match(/\p{L}/gu) ?? []).length;
            const digits = (input.match(/\p{Nd}/gu) ?? []).length;
            const spaces = (input.match(/\s/g) ?? []).length;
            const punct = (input.match(/\p{P}/gu) ?? []).length;
            const symbols = (input.match(/\p{S}/gu) ?? []).length;
            const uppers = (input.match(/\p{Lu}/gu) ?? []).length;
            const lines = input.split(/\r?\n/).length;
            const nonAscii = chars.filter((c) => c.charCodeAt(0) > 127).length;
            return [
                `characters (total)      ${chars.length}`,
                `characters (no spaces) ${chars.length - spaces}`,
                `letters / digits       ${letters} / ${digits}`,
                `spaces / punctuation   ${spaces} / ${punct}`,
                `symbols / uppercase    ${symbols} / ${uppers}`,
                `lines                  ${lines}`,
                `non-ASCII characters   ${nonAscii}${nonAscii ? " (unicode-heavy text)" : ""}`,
            ].join("\n");
        },
    },
    {
        id: "ta-syllables",
        label: "Syllable Counter",
        description: "Per-word syllable estimates — haiku checks and poetry beats.",
        sample: "praxis haiku poetry counts syllables",
        transform: (input) =>
            WORDS(input).map((w) => `${w}  ${"·".repeat(syllables(w))} ${syllables(w)}`).join("\n"),
    },
    {
        id: "ta-sentences",
        label: "Sentence Split & Stats",
        description: "Sentences split on terminal punctuation, with per-sentence word counts.",
        sample: "One sentence here. Another follows! Does it end? Yes — with a dash too.",
        transform: (input) => {
            const sents = sentences(input);
            if (sents.length === 0) return "Error: no sentences found.";
            const counts = sents.map((s) => WORDS(s).length);
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
            const out = sents.map((s, i) => `${String(i + 1).padStart(2)}. [${counts[i]} words] ${s.slice(0, 90)}${s.length > 90 ? "…" : ""}`);
            return `${sents.length} sentences · avg ${avg.toFixed(1)} words/sentence · longest ${Math.max(...counts)}\n\n${out.join("\n")}`;
        },
    },
    {
        id: "ta-paragraphs",
        label: "Paragraph Splitter",
        description: "Blank-line paragraphs with their own stats — structure at a glance.",
        sample: "First paragraph here.\n\nSecond paragraph with more to say.\n\nThird.",
        transform: (input) => {
            const paras = input.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
            if (paras.length === 0) return "Error: no paragraphs (blank-line separated).";
            return paras
                .map((p, i) => {
                    const words = WORDS(p).length;
                    const sents = sentences(p).length;
                    return `${String(i + 1).padStart(2)}. ${words} words · ${sents} sentence(s) · first line: ${p.split("\n")[0].slice(0, 70)}${p.length > 70 ? "…" : ""}`;
                })
                .join("\n");
        },
    },
    {
        id: "ta-vocab",
        label: "Vocabulary Richness",
        description: "Type–token ratio, hapaxes (once-only words), longest words — the style fingerprint.",
        sample: "to be or not to be that is the question",
        transform: (input) => {
            const words = WORDS(input);
            if (words.length === 0) return "Error: no words.";
            const unique = new Set(words);
            const hapaxes = [...unique].filter((w) => words.filter((x) => x === w).length === 1);
            const longest = [...unique].sort((a, b) => b.length - a.length).slice(0, 8);
            return [
                `tokens (total words)   ${words.length}`,
                `types (unique words)   ${unique.size}`,
                `type–token ratio       ${(unique.size / words.length).toFixed(3)}`,
                `hapaxes (seen once)    ${hapaxes.length}${hapaxes.length ? ` — ${hapaxes.slice(0, 12).join(", ")}` : ""}`,
                `longest words          ${longest.join(", ")}`,
            ].join("\n");
        },
    },
    {
        id: "ta-stopwords",
        label: "Strip Stop-Words",
        description: "Remove the ~200 common English filler words — what remains is the content core.",
        sample: "The tool will remove the words that are not needed for the search.",
        transform: (input) => {
            const out = input.replace(/[A-Za-z''-]+/g, (w) => (STOPWORDS.has(w.toLowerCase()) ? "" : w));
            return out.replace(/[ \t]{2,}/g, " ").replace(/ ?, ?([,.;:])/g, "$1").trim();
        },
    },
    {
        id: "ta-keyword-density",
        label: "Keyword Density",
        description: "Density of a target phrase in the text — the SEO sanity check.",
        sample: "keyword: praxis\nPraxis is a practice platform. Practice makes Praxis.",
        transform: (input) => {
            const nl = input.indexOf("\n");
            const first = (nl > 0 ? input.slice(0, nl) : "").trim();
            const keyword = first.replace(/^keyword:\s*/i, "").toLowerCase();
            const body = nl > 0 ? input.slice(nl + 1) : "";
            if (!keyword) return "Error: first line `keyword: your phrase`, then the text.";
            const words = WORDS(body);
            if (words.length === 0) return "Error: no text below the keyword line.";
            const kwWords = keyword.split(/\s+/);
            let hits = 0;
            if (kwWords.length === 1) {
                hits = words.filter((w) => w === keyword || w.startsWith(keyword)).length;
            } else {
                for (let i = 0; i <= words.length - kwWords.length; i++) {
                    if (kwWords.every((k, j) => words[i + j] === k)) hits++;
                }
            }
            const units = words.length / kwWords.length;
            return [
                `keyword              "${keyword}"`,
                `occurrences          ${hits}`,
                `total words          ${words.length}`,
                `density              ${((100 * hits) / units).toFixed(2)}% (phrases: ${((100 * hits) / Math.max(1, hits + units - hits)).toFixed(2)}%)`,
                `verdict              ${hits === 0 ? "absent" : (100 * hits) / units < 0.5 ? "thin" : (100 * hits) / units > 5 ? "stuffed" : "in the healthy 0.5–3% band"}`,
            ].join("\n");
        },
    },
    {
        id: "ta-similarity",
        label: "Text Similarity (2 texts)",
        description: "Levenshtein distance + similarity % + Jaccard word overlap — paste both texts separated by a `---` line.",
        sample: "the cat sat on the mat\n---\nthe cat sat on that mat",
        transform: (input) => {
            const parts = input.split(/^---\s*$/m);
            if (parts.length < 2) return "Error: text A, a `---` line, then text B.";
            const a = parts[0].trim();
            const b = parts[1].trim();
            if (!a || !b) return "Error: both sides need text.";
            const dist = levDistance(a, b);
            const similarity = 1 - dist / Math.max(a.length, b.length);
            const wa = new Set(WORDS(a));
            const wb = new Set(WORDS(b));
            const inter = [...wa].filter((w) => wb.has(w)).length;
            const union = new Set([...wa, ...wb]).size;
            const jaccard = union === 0 ? 1 : inter / union;
            return [
                `Levenshtein edits     ${dist} (of ${Math.max(a.length, b.length)} chars)`,
                `edit similarity        ${(similarity * 100).toFixed(1)}%`,
                `shared unique words    ${inter} / ${union} union`,
                `Jaccard overlap        ${(jaccard * 100).toFixed(1)}%`,
            ].join("\n");
        },
    },
    {
        id: "ta-levenshtein",
        label: "Levenshtein Word Pairs",
        description: "Edit distance for `word1 word2` lines — typo clustering.",
        sample: "kitten sitting\nflaw lawn",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const m = line.trim().match(/^(\S+)\s+(\S+)$/);
                if (!m) return `${line} → syntax: word1 word2`;
                const d = levDistance(m[1].toLowerCase(), m[2].toLowerCase());
                return `${m[1]} ↔ ${m[2]} → distance ${d}${d === 1 ? " (one edit — likely a typo pair)" : ""}`;
            }).join("\n"),
    },
    {
        id: "ta-soundex",
        label: "Soundex Codes",
        description: "Phonetic codes per word — names that sound alike hash the same.",
        sample: "Tymczak\nAshcraft\nRobert Rupert",
        transform: (input) =>
            WORDS(input).map((w) => `${w.padEnd(12)} ${soundex(w)}`).join("\n"),
        note: "Words sharing a code are phonetic neighbors (Tymczak → T522).",
    },
    {
        id: "ta-palindrome",
        label: "Palindrome Detector",
        description: "Line-by-line palindrome check (letters/digits only, case ignored).",
        sample: "A man, a plan, a canal: Panama\nnot one",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const cleaned = line.toLowerCase().replace(/[^a-z0-9]/g, "");
                const rev = [...cleaned].reverse().join("");
                return `${line.trim()} → ${cleaned === rev ? "PALINDROME" : "not a palindrome"}`;
            }).join("\n"),
    },
    {
        id: "ta-anagram",
        label: "Anagram Grouping",
        description: "Group the input words by their letter signature — anagrams land on one line.",
        sample: "listen silent enlist\ncat act\nbanana",
        transform: (input) => {
            const words = WORDS(input);
            if (words.length === 0) return "Error: no words.";
            const groups = new Map<string, string[]>();
            for (const w of words) {
                const sig = [...w].sort().join("");
                const arr = groups.get(sig);
                if (arr) arr.push(w);
                else groups.set(sig, [w]);
            }
            return [...groups.values()]
                .map((g) => (g.length > 1 ? `${[...new Set(g)].join(" = ")}  (anagram set)` : `${g[0]}`))
                .join("\n");
        },
    },
    {
        id: "ta-longest",
        label: "Longest Words & Lines",
        description: "The 10 longest words and 10 longest lines — the outliers report.",
        sample: "short line\nextraordinarily long line with pseudohypopotamus",
        transform: (input) => {
            const words = [...new Set(WORDS(input))].sort((a, b) => b.length - a.length).slice(0, 10);
            const lines = input.split(/\r?\n/).filter((l) => l.trim() !== "").sort((a, b) => b.length - a.length).slice(0, 10);
            return [
                "longest words:",
                ...words.map((w) => `  ${w} (${w.length})`),
                "",
                "longest lines:",
                ...lines.map((l) => `  [${l.length}] ${l.slice(0, 80)}${l.length > 80 ? "…" : ""}`),
            ].join("\n");
        },
    },
    {
        id: "ta-repeat-lines",
        label: "Repeated Lines",
        description: "Lines appearing more than once, with counts — log noise and copy-paste scars.",
        sample: "same line\nother line\nsame line\nsame line",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (lines.length === 0) return "Error: no lines.";
            const counts = new Map<string, number>();
            for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
            const dups = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
            if (dups.length === 0) return `No repeated lines (${lines.length} lines checked).`;
            return `${dups.length} repeated line(s):\n${dups.map(([l, c]) => `  ${String(c)}× ${l.slice(0, 90)}`).join("\n")}`;
        },
    },
    {
        id: "ta-bulletize",
        label: "Sentences → Bullet List",
        description: "Each sentence becomes a bullet — prose to checklist in one paste.",
        sample: "First thing to do. Second thing. Third and last thing.",
        options: [{
            key: "marker",
            label: "Marker",
            kind: "select",
            choices: [["-", "- (dash)"], ["*", "* (asterisk)"], ["1.", "1. (numbered)"]],
            default: "-"
        }],
        transform: (input, o) => {
            const sents = sentences(input);
            if (sents.length === 0) return "Error: no sentences.";
            const marker = o.marker === "*" ? "*" : o.marker === "1." ? undefined : "-";
            return sents.map((s, i) => (marker ? `${marker} ${s}` : `${i + 1}. ${s}`)).join("\n");
        },
    },
    {
        id: "ta-summarize",
        label: "Extractive Summary",
        description: "Keep the first N sentences — the honest extractive summary (no AI, no invention).",
        sample: "Lead with the point. Support it next. Then detail. Finally repeat.",
        options: [{
            key: "n",
            label: "Sentences",
            kind: "select",
            choices: [["1", "1"], ["2", "2"], ["3", "3"], ["5", "5"]],
            default: "3"
        }],
        transform: (input, o) => {
            const sents = sentences(input);
            if (sents.length === 0) return "Error: no sentences.";
            const n = Math.min(parseInt(String(o.n), 10) || 3, sents.length);
            return `${sents.length} → ${n} sentences:\n\n${sents.slice(0, n).join(" ")}`;
        },
    },
    {
        id: "ta-tail-head",
        label: "Head / Tail Extractor",
        description: "First and last N lines of the text — the preview of a long paste.",
        sample: "1\n2\n3\n4\n5\n6\n7",
        options: [{
            key: "n",
            label: "N lines",
            kind: "select",
            choices: [["3", "3"], ["5", "5"], ["10", "10"]],
            default: "5"
        }],
        transform: (input, o) => {
            const lines = input.split(/\r?\n/);
            const n = parseInt(String(o.n), 10) || 5;
            if (lines.length <= n * 2) return `(${lines.length} lines — short enough to show all)\n${lines.join("\n")}`;
            const head = lines.slice(0, n);
            const tail = lines.slice(-n);
            return `${head.join("\n")}\n… ${lines.length - n * 2} lines omitted …\n${tail.join("\n")}`;
        },
    },
    {
        id: "ta-case-report",
        label: "Case Report",
        description: "Count camelCase / snake_case / kebab / CONSTANT / Title tokens — naming-style census.",
        sample: "myVar otherVar MY_CONST my-kebab",
        transform: (input) => {
            const tokens = input.match(/[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9_-]*/g) ?? [];
            const tally = {camel: 0, pascal: 0, snake: 0, kebab: 0, constant: 0, plain: 0, mixed: 0};
            for (const t of tokens) {
                if (t.includes("_") && t === t.toUpperCase() && /[A-Z]/.test(t)) tally.constant++;
                else if (t.includes("_") && t === t.toLowerCase()) tally.snake++;
                else if (t.includes("-") && t === t.toLowerCase()) tally.kebab++;
                else if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t)) tally.camel++;
                else if (/^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(t)) tally.pascal++;
                else if (t === t.toLowerCase() || t === t.toUpperCase()) tally.plain++;
                else tally.mixed++;
            }
            const total = tokens.length || 1;
            return [
                `tokens        ${tokens.length}`,
                ...Object.entries(tally).map(([k, v]) => `${k.padEnd(9)} ${String(v).padStart(4)}  ${((100 * v) / total).toFixed(1)}%`),
            ].join("\n");
        },
    },
    {
        id: "ta-emoji-unicode",
        label: "Unicode / Emoji Report",
        description: "Code points above U+007F with their blocks — the invisible-character detector.",
        sample: "café — π 🦊≠≈",
        transform: (input) => {
            const rows: string[] = [];
            [...input].forEach((ch) => {
                const cp = ch.codePointAt(0) ?? 0;
                if (cp > 0x7f) {
                    const block =
                        cp >= 0x1f300 && cp <= 0x1faff ? "emoji" :
                            cp >= 0x2600 && cp <= 0x27bf ? "misc symbols" :
                                cp >= 0x0080 && cp <= 0x024f ? "latin extended" :
                                    cp >= 0x0300 && cp <= 0x036f ? "combining diacritics" :
                                        cp >= 0x2000 && cp <= 0x206f ? "general punctuation" :
                                            cp >= 0x2070 && cp <= 0x209f ? "super/subscripts" :
                                                cp >= 0x20a0 && cp <= 0x20cf ? "currency" :
                                                    cp >= 0x2100 && cp <= 0x214f ? "letterlike" :
                                                        cp >= 0x2190 && cp <= 0x22ff ? "arrows/math" :
                                                            cp >= 0x3000 && cp <= 0x303f ? "CJK punctuation" :
                                                                cp >= 0x1f600 && cp <= 0x1f64f ? "emoticons" :
                                                                    "other";
                    rows.push(`${ch}  U+${cp.toString(16).toUpperCase().padStart(4, "0")}  ${block}`);
                }
            });
            const zwj = (input.match(/\u200d/g) ?? []).length;
            const zwnbsp = (input.match(/\ufeff/g) ?? []).length;
            const rtl = (input.match(/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/g) ?? []).length;
            return rows.length === 0
                ? "Pure ASCII — no unicode outside U+007F."
                : `${rows.length} extended code point(s):\n${rows.join("\n")}${zwj ? `\nZWJ sequences: ${zwj}` : ""}${zwnbsp ? `\nzero-width/BOM chars: ${zwnbsp}` : ""}${rtl ? `\nRTL characters: ${rtl}` : ""}`;
        },
    },
    {
        id: "ta-dedupe-words",
        label: "Dedupe & Sort Words",
        description: "The unique word list, sorted — the vocabulary dump.",
        sample: "b a b c a",
        options: [{
            key: "order",
            label: "Order",
            kind: "select",
            choices: [["alpha", "alphabetical"], ["freq", "by frequency"], ["len", "by length"]],
            default: "alpha"
        }],
        transform: (input, o) => {
            const words = WORDS(input);
            const unique = [...new Set(words)];
            if (o.order === "freq") {
                const counts = new Map<string, number>();
                for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
                unique.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
            } else if (o.order === "len") unique.sort((a, b) => b.length - a.length || a.localeCompare(b));
            else unique.sort((a, b) => a.localeCompare(b));
            return `${words.length} → ${unique.length} unique\n\n${unique.join(" ")}`;
        },
    },
    {
        id: "ta-line-stats",
        label: "Line Stats",
        description: "Line length distribution — mean, median, p95, longest — the wrap sanity check.",
        sample: "short\na considerably longer line here\nmid",
        transform: (input) => {
            const lines = input.split(/\r?\n/).filter((l) => l !== "");
            if (lines.length === 0) return "Error: no lines.";
            const lens = lines.map((l) => l.length).sort((a, b) => a - b);
            const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
            const median = lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2;
            const p = (q: number) => lens[Math.min(lens.length - 1, Math.floor(q * lens.length))];
            const histogram = new Map<number, number>();
            for (const l of lens) {
                const bucket = Math.floor(l / 10) * 10;
                histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
            }
            const maxBar = Math.max(...histogram.values());
            return [
                `lines            ${lens.length}`,
                `empty lines      ${input.split(/\r?\n/).length - lens.length}`,
                `mean / median    ${mean.toFixed(1)} / ${median}`,
                `p50 / p95 / max  ${p(0.5)} / ${p(0.95)} / ${lens[lens.length - 1]}`,
                ``,
                `length histogram (buckets of 10):`,
                ...[...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `  ${String(b).padStart(3)}–${String(b + 9).padEnd(3)}  ${"█".repeat(Math.max(1, Math.round((c / maxBar) * 30)))} ${c}`),
            ].join("\n");
        },
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const TEXTANALYSIS_TOOL_ENTRIES = TEXTANALYSIS_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
