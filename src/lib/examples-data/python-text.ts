/**
 * Python — Text processing examples. Category: "Text processing".
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {fn, mkExample, vr} from "./_helpers";

const CAT = "Text processing";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_TEXT_EXAMPLES: FileExample[] = [
    // ─── Regular expressions ─────────────────────────────────────────
    py("py-ex-regex-log", "Regex log parser", "Parses log lines with re, tallies levels and status codes.", "Regular expressions", "regex_log_parser",
        (s) => `# -*- coding: utf-8 -*-
"""Parse web-server log lines with a named-group regex."""
import re
from collections import Counter

${applyNamingStyle(s.variables, "log_lines")} = [
    '10.0.0.1 - alice [2026/01/03] "GET /home HTTP/1.1" 200 1043',
    '10.0.0.2 - bob [2026/01/03] "POST /login HTTP/1.1" 401 95',
    '10.0.0.1 - alice [2026/01/04] "GET /report HTTP/1.1" 500 210',
    '10.0.0.3 - carol [2026/01/04] "GET /home HTTP/1.1" 200 1043',
    '10.0.0.2 - bob [2026/01/05] "GET /dashboard HTTP/1.1" 403 120',
]

${applyNamingStyle(s.variables, "pattern")} = re.compile(
    r'(?P<ip>[\\d.]+) - (?P<user>\\w+) \\[(?P<date>[^\\]]+)\\] '
    r'"(?P<method>\\w+) (?P<path>/\\S*) (?P<proto>[\\w./]+)" (?P<status>\\d{3}) (?P<bytes>\\d+)'
)

${applyNamingStyle(s.variables, "records")} = []
for ${applyNamingStyle(s.variables, "line")} in ${applyNamingStyle(s.variables, "log_lines")}:
    ${applyNamingStyle(s.variables, "match")} = ${applyNamingStyle(s.variables, "pattern")}.match(${applyNamingStyle(s.variables, "line")})
    if ${applyNamingStyle(s.variables, "match")}:
        ${applyNamingStyle(s.variables, "records")}.append(${applyNamingStyle(s.variables, "match")}.groupdict())
    else:
        print(f"UNPARSED: {${applyNamingStyle(s.variables, "line")}}")

print(f"parsed {len(${applyNamingStyle(s.variables, "records")})}/{len(${applyNamingStyle(s.variables, "log_lines")})} lines")
print("status    :", dict(Counter(${applyNamingStyle(s.variables, "r")}["status"] for ${applyNamingStyle(s.variables, "r")} in ${applyNamingStyle(s.variables, "records")})))
print("endpoints :", dict(Counter(${applyNamingStyle(s.variables, "r")}["path"] for ${applyNamingStyle(s.variables, "r")} in ${applyNamingStyle(s.variables, "records")})))
print("errors    :")
for ${applyNamingStyle(s.variables, "r")} in ${applyNamingStyle(s.variables, "records")}:
    if int(${applyNamingStyle(s.variables, "r")}["status"]) >= 400:
        print(f'  {${applyNamingStyle(s.variables, "r")}["date"]} {${applyNamingStyle(s.variables, "r")}["path"]} -> {${applyNamingStyle(s.variables, "r")}["status"]} ({${applyNamingStyle(s.variables, "r")}["user"]})')
`),
    py("py-ex-regex-findall", "findall & groups", "match vs search vs findall vs fullmatch — the four verbs.", "Regular expressions", "regex_findall",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The four regex verbs on the same text."""
import re

${v("text")} = "orders: #1042 shipped, #1043 pending, #1044 shipped"

${v("pattern")} = r"#(\\d+)\\s+(\\w+)"

print(f"match   : {re.match(${v("pattern")}, ${v("text")})}")  # anchored at start -> None
print(f"search  : {re.search(${v("pattern")}, ${v("text")}).groups()}")
print(f"findall : {re.findall(${v("pattern")}, ${v("text")})}")
print(f"fullmatch on a clean string: {re.fullmatch(r'#\\d+\\s+\\w+', '#9999 shipped') is not None}")

${v("finditer")} = list(re.finditer(${v("pattern")}, ${v("text")}))
for ${v("m")} in ${v("finditer")}:
    print(f"  span={${v("m")}.span()} order={${v("m")}.group(1)} state={${v("m")}.group(2)}")

${v("states")} = [m.group(2) for m in ${v("finditer")}]
print(f"states  : {${v("states")}}")
print(f"shipped : {${v("states")}.count('shipped')}/{len(${v("states")})}")
`;
        }),
    py("py-ex-regex-sub", "Substitution templates", "re.sub with functions, backreferences, and flags.", "Regular expressions", "regex_substitution",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""re.sub: string surgery with patterns."""
import re

${v("text")} = "alice@EXAMPLE.com, BOB@example.com, carol@example.COM"

${v("lowered")} = re.sub(r"@[A-Za-z.]+", lambda m: m.group(0).lower(), ${v("text")})
print(f"domain-lowered : {${v("lowered")}}")

${v("masked")} = re.sub(r"(\\w)(\\w*)@", r"\\1***@", ${v("lowered")})
print(f"masked users   : {${v("masked")}}")

${v("template")} = "hello NAME, your order ORDER is DONE"
${v("filled")} = re.sub(
    r"\\b(NAME|ORDER|DONE)\\b",
    lambda m: {"NAME": "Carol", "ORDER": "#42", "DONE": "complete"}[m.group(1)],
    ${v("template")},
)
print(f"template filled: {${v("filled")}}")

${v("dates")} = re.sub(r"(\\d{4})-(\\d{2})-(\\d{2})", r"\\3/\\2/\\1", "logs from 2026-11-07 and 2026-11-08")
print(f"date reformat  : {${v("dates")}}")
`;
        }),
    py("py-ex-regex-split", "Regex split & scan", "Multiple delimiters at once and tokenizing formulas.", "Regular expressions", "regex_split",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Splitting on patterns, not single characters."""
import re

${v("csvish")} = "alpha, beta;gamma,,delta   epsilon"
${v("tokens")} = [t for t in re.split(r"[,;\\s]+", ${v("csvish")}) if t]
print(f"multi-delimiter split: {${v("tokens")}}")

${v("formula")} = "3.14*x**2 + 42*sin(y) - 7/z"
${v("numbers")} = re.findall(r"\\d+\\.?\\d*", ${v("formula")})
print(f"numbers in formula   : {${v("numbers")}}")

${v("identifiers")} = re.findall(r"[A-Za-z_]\\w*", ${v("formula")})
print(f"identifiers          : {${v("identifiers")}}")

${v("operators")} = re.findall(r"[-+*/]{1,2}", ${v("formula")})
print(f"operators            : {${v("operators")}}")

${v("words")} = "It's a well-known fact—regexes help."
print(f"word tokens          : {re.findall(r"[\\w'-]+", ${v("words")})}")
`;
        }),
    py("py-ex-regex-flags", "Regex flags & compile", "VERBOSE patterns, IGNORECASE, MULTILINE, and DOTALL.", "Regular expressions", "regex_flags",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Flags make hard patterns readable."""
import re

${v("config")} = """# app settings
Host = example.com
PORT = 8000
debug = true
# end"""

${v("pattern")} = re.compile(r"""
    ^\\s*(?P<key>[A-Za-z_]+)   # key
    \\s*=\\s*                    # equals
    (?P<value>[^\\s#]+)         # value
""", re.VERBOSE | re.MULTILINE | re.IGNORECASE)

${v("settings")} = {m.group("key").lower(): m.group("value") for m in ${v("pattern")}.finditer(${v("config")})}
print(f"parsed settings: {${v("settings")}}")

${v("multiline")} = "first line\\nsecond LINE\\nthird line"
print(f"case-insensitive count: {len(re.findall(r'line', ${v("multiline")}, re.IGNORECASE))}")

${v("html")} = "<p>one</p>\\n<p>two</p>"
print(f"DOTALL across newlines: {re.findall(r'<p>(.*?)</p>', ${v("html")}, re.DOTALL)}")
`;
        }),
    py("py-ex-extract-emails", "Extract emails & URLs", "Practical extraction with validation-aware patterns.", "Regular expressions", "extract_emails",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Pull emails and URLs out of messy text."""
import re

${v("text")} = """
Contact alice@example.com or BOB.Smith@company.co.uk for details.
Old address: carol+legacy@sub.example.com (retired).
Docs at https://docs.example.com/guide and http://wiki.example.com.
Broken: not-an-email@ , also ftp://files.example.com stays out.
"""

${v("email_pattern")} = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
${v("url_pattern")} = re.compile(r"https?://[A-Za-z0-9.-]+(?:/[A-Za-z0-9./_-]*)?")

${v("emails")} = sorted(set(${v("email_pattern")}.findall(${v("text")})))
${v("urls")} = sorted(set(${v("url_pattern")}.findall(${v("text")})))

print("emails found:")
for ${v("email")} in ${v("emails")}:
    ${v("domain")} = ${v("email")}.split("@")[1]
    print(f"  {${v("email")}:<32} domain={${v("domain")}}")

print("urls found:")
for ${v("url")} in ${v("urls")}:
    print(f"  {${v("url")}}")
`;
        }),
    py("py-ex-extract-dates", "Extract dates & numbers", "Dates, money, and percentages out of free text.", "Regular expressions", "extract_dates",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Scan a paragraph for dates, amounts, and percentages."""
import re

${v("report")} = """
Q3 review (2026-09-30): revenue hit $1,234,567.89, up 12.5% QoQ
and 3.2 points above the 8.4% forecast from 09/15/2026.
Next review: October 3, 2026. Budget cap: 42,000.50 EUR.
"""

${v("iso_dates")} = re.findall(r"\\d{4}-\\d{2}-\\d{2}", ${v("report")})
${v("us_dates")} = re.findall(r"\\d{2}/\\d{2}/\\d{4}", ${v("report")})
${v("money")} = re.findall(r"\\$[\\d,]+(?:\\.\\d{2})?", ${v("report")})
${v("percents")} = re.findall(r"\\d+\\.\\d+%", ${v("report")})

print(f"ISO dates    : {${v("iso_dates")}}")
print(f"US dates     : {${v("us_dates")}}")
print(f"money        : {${v("money")}}")
print(f"percentages  : {${v("percents")}}")

${v("all_numbers")} = [float(x.replace(",", "").replace("$", "")) for x in ${v("money")}]
print(f"money parsed : {${v("all_numbers")}}")
`;
        }),

    // ─── Tokens & frequency ──────────────────────────────────────────
    py("py-ex-word-frequency", "Word frequency (dict)", "Text → cleaned tokens → sorted frequency table. Pure standard library.", "Tokens & frequency", "word_frequency",
        (s) => `# -*- coding: utf-8 -*-
"""Count and rank word frequencies in a text sample."""

${applyNamingStyle(s.variables, "text")} = (
    "the quick brown fox jumps over the lazy dog "
    "the dog barks and the fox runs away"
)


def ${applyNamingStyle(s.functions, "count_words")}(text: str) -> dict[str, int]:
    ${applyNamingStyle(s.variables, "counts")} = {}
    for ${applyNamingStyle(s.variables, "word")} in text.lower().split():
        ${applyNamingStyle(s.variables, "counts")}[${applyNamingStyle(s.variables, "word")}] = ${applyNamingStyle(s.variables, "counts")}.get(${applyNamingStyle(s.variables, "word")}, 0) + 1
    return ${applyNamingStyle(s.variables, "counts")}


def main() -> None:
    ${applyNamingStyle(s.variables, "counts")} = ${applyNamingStyle(s.functions, "count_words")}(${applyNamingStyle(s.variables, "text")})
    for ${applyNamingStyle(s.variables, "word")}, ${applyNamingStyle(s.variables, "count")} in sorted(${applyNamingStyle(s.variables, "counts")}.items(), key=lambda ${applyNamingStyle(s.variables, "pair")}: ${applyNamingStyle(s.variables, "pair")}[1], reverse=True):
        print(f"{${applyNamingStyle(s.variables, "word")}:<8} {${applyNamingStyle(s.variables, "count")}:>3}  {'#' * ${applyNamingStyle(s.variables, "count")}}")


if __name__ == "__main__":
    main()
`),
    py("py-ex-ngrams", "N-grams", "Bigrams and trigrams — the bridge to language models.", "Tokens & frequency", "ngrams",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""N-gram extraction and frequency."""
from collections import Counter


def ${fn(s)("ngrams")}(text: str, n: int) -> list[str]:
    ${v("words")} = text.lower().split()
    return [" ".join(${v("words")}[i:i + n]) for i in range(len(${v("words")}) - n + 1)]


${v("text")} = "the quick brown fox jumps over the lazy dog the fox runs"

print("top bigrams :")
for ${v("gram")}, ${v("count")} in Counter(${fn(s)("ngrams")}(${v("text")}, 2)).most_common(5):
    print(f"  {${v("gram")}:<24} x{${v("count")}}")

print("top trigrams:")
for ${v("gram")}, ${v("count")} in Counter(${fn(s)("ngrams")}(${v("text")}, 3)).most_common(3):
    print(f"  {${v("gram")}:<32} x{${v("count")}}")

${v("bigrams")} = ${fn(s)("ngrams")}(${v("text")}, 2)
print(f"\\n{len(${v('bigrams')})} bigrams, {len(set(${v('bigrams')}))} distinct")
`;
        }),
    py("py-ex-stopwords", "Stopword filtering", "Content words vs function words — the search-engine filter.", "Tokens & frequency", "stopwords",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Remove function words to see what a text is actually about."""
from collections import Counter

${v("stopwords")} = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "over",
    "is", "are", "was", "were", "it", "its", "for", "with", "that", "this",
}

${v("text")} = (
    "the quick brown fox jumps over the lazy dog and the dog "
    "barks at the fox because the fox is quick"
)

${v("all_words")} = ${v("text")}.lower().split()
${v("content_words")} = [w for w in ${v("all_words")} if w not in ${v("stopwords")}]

print(f"tokens           : {len(${v("all_words")})}")
print(f"after filtering  : {len(${v("content_words")})} ({len(${v("content_words")}) / len(${v("all_words")}):.0%} kept)")
print(f"stopwords share  : {(len(${v('all_words')}) - len(${v('content_words')})) / len(${v('all_words')}):.0%}")
print(f"\\ntop content words:")
for ${v("word")}, ${v("count")} in Counter(${v("content_words")}).most_common(5):
    print(f"  {${v("word")}:<10} x{${v("count")}}")
`;
        }),
    py("py-ex-char-frequency", "Character frequency (figure)", "Letter histogram — the classic cryptanalysis start.", "Tokens & frequency", "char_frequency",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Letter frequencies of a text, plotted."""
from collections import Counter

import matplotlib.pyplot as plt

${v("text")} = (
    "the quick brown fox jumps over the lazy dog "
    "pack my box with five dozen liquor jugs"
)
${v("letters")} = [c for c in ${v("text")}.lower() if c.isalpha()]
${v("counts")} = Counter(${v("letters")})
${v("alphabet")} = sorted(${v("counts")})
${v("frequencies")} = [${v("counts")}[c] for c in ${v("alphabet")}]

${v("total")} = sum(${v("frequencies")})
print(f"letters: {${v("total")}}, distinct: {len(${v("alphabet")})}")
for ${v("letter")} in ${v("alphabet")}[:8]:
    ${v("share")} = 100 * ${v("counts")}[${v("letter")}] / ${v("total")}
    print(f"  {${v("letter")}}: {${v("share")}:.1f}%  {'#' * round(${v("share")})}")

${v("fig")}, ${v("ax")} = plt.subplots(figsize=(8, 4))
${v("ax")}.bar(${v("alphabet")}, ${v("frequencies")}, color="#2a9d8f")
${v("ax")}.set_xlabel("letter")
${v("ax")}.set_ylabel("count")
${v("ax")}.set_title("Letter frequency (English text skews left)")
${v("fig")}.tight_layout()
plt.show()
`;
        }),

    // ─── String algorithms ───────────────────────────────────────────
    py("py-ex-levenshtein", "Levenshtein distance", "The edit-distance DP with a full ops trace.", "String algorithms", "levenshtein_text",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Edit distance with the operations listed."""


def ${f("edit_trace")}(a: str, b: str) -> tuple[int, list[str]]:
    ${v("n")}, ${v("m")} = len(a), len(b)
    ${v("table")} = [[0] * (${v("m")} + 1) for _ in range(${v("n")} + 1)]
    for ${v("i")} in range(${v("n")} + 1):
        ${v("table")}[${v("i")}][0] = ${v("i")}
    for ${v("j")} in range(${v("m")} + 1):
        ${v("table")}[0][${v("j")}] = ${v("j")}
    for ${v("i")} in range(1, ${v("n")} + 1):
        for ${v("j")} in range(1, ${v("m")} + 1):
            ${v("cost")} = 0 if a[${v("i")} - 1] == b[${v("j")} - 1] else 1
            ${v("table")}[${v("i")}][${v("j")}] = min(
                ${v("table")}[${v("i")} - 1][${v("j")}] + 1,
                ${v("table")}[${v("i")}][${v("j")} - 1] + 1,
                ${v("table")}[${v("i")} - 1][${v("j")} - 1] + ${v("cost")},
            )

    ${v("ops")} = []
    ${v("i")}, ${v("j")} = ${v("n")}, ${v("m")}
    while ${v("i")} > 0 or ${v("j")} > 0:
        if ${v("i")} > 0 and ${v("j")} > 0 and a[${v("i")} - 1] == b[${v("j")} - 1] and ${v("table")}[${v("i")}][${v("j")}] == ${v("table")}[${v("i")} - 1][${v("j")} - 1]:
            ${v("ops")}.append(f"keep {a[${v("i")} - 1]}")
            ${v("i")} -= 1
            ${v("j")} -= 1
        elif ${v("i")} > 0 and ${v("j")} > 0 and ${v("table")}[${v("i")}][${v("j")}] == ${v("table")}[${v("i")} - 1][${v("j")} - 1] + 1:
            ${v("ops")}.append(f"substitute {a[${v("i")} - 1]} -> {b[${v("j")} - 1]}")
            ${v("i")} -= 1
            ${v("j")} -= 1
        elif ${v("i")} > 0 and ${v("table")}[${v("i")}][${v("j")}] == ${v("table")}[${v("i")} - 1][${v("j")}] + 1:
            ${v("ops")}.append(f"delete {a[${v("i")} - 1]}")
            ${v("i")} -= 1
        else:
            ${v("ops")}.append(f"insert {b[${v("j")} - 1]}")
            ${v("j")} -= 1
    return ${v("table")}[${v("n")}][${v("m")}], list(reversed(${v("ops")}))


${v("distance")}, ${v("ops")} = ${f("edit_trace")}("kitten", "sitting")
print(f"kitten -> sitting needs {${v("distance")}} edits:")
for ${v("op")} in ${v("ops")}:
    print(f"  {${v("op")}}")
`;
        }),
    py("py-ex-word-wrap", "Word wrap", "Greedy line-filling to a fixed width — terminal-style.", "String algorithms", "word_wrap",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Greedy word wrap at N columns."""


def ${f("wrap")}(text: str, width: int) -> list[str]:
    ${v("lines")} = []
    ${v("current")} = []
    ${v("length")} = 0
    for ${v("word")} in text.split():
        ${v("word_len")} = len(${v("word")})
        ${v("space")} = 1 if ${v("current")} else 0
        if ${v("length")} + ${v("space")} + ${v("word_len")} > width and ${v("current")}:
            ${v("lines")}.append(" ".join(${v("current")}))
            ${v("current")} = [${v("word")}]
            ${v("length")} = ${v("word_len")}
        else:
            ${v("current")}.append(${v("word")})
            ${v("length")} += ${v("space")} + ${v("word_len")}
    if ${v("current")}:
        ${v("lines")}.append(" ".join(${v("current")}))
    return ${v("lines")}


${v("text")} = "the quick brown fox jumps over the lazy dog and keeps jumping because wrapping is fun"
for ${v("line")} in ${f("wrap")}(${v("text")}, 28):
    print(f"|{${v("line")}:<28}|")
`;
        }),
    py("py-ex-caesar-cipher", "Caesar cipher", "Rotate letters by a key — encode, decode, brute-force.", "String algorithms", "caesar_cipher",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The Caesar cipher: shift letters by a key."""


def ${f("shift_text")}(text: str, key: int) -> str:
    ${v("result")} = []
    for ${v("char")} in text:
        if ${v("char")}.isalpha():
            ${v("base")} = ord("a") if ${v("char")}.islower() else ord("A")
            ${v("shifted")} = (ord(${v("char")}) - ${v("base")} + key) % 26 + ${v("base")}
            ${v("result")}.append(chr(${v("shifted")}))
        else:
            ${v("result")}.append(${v("char")})
    return "".join(${v("result")})


${v("message")} = "attack at dawn, sector 7!"
${v("encoded")} = ${f("shift_text")}(${v("message")}, 3)
print(f"plaintext : {${v("message")}}")
print(f"encoded   : {${v("encoded")}}")
print(f"decoded   : {${f("shift_text")}(${v("encoded")}, -3)}")

print("\\nbrute-force all 26 keys:")
for ${v("key")} in range(26):
    ${v("candidate")} = ${f("shift_text")}(${v("encoded")}, -${v("key")})
    if "attack" in ${v("candidate")}:
        print(f"  key={${v("key")}:>2}: {${v("candidate")}}  <- found it")
`;
        }),
    py("py-ex-anagram-groups", "Anagram grouping", "Signature-keyed buckets — the interview classic.", "String algorithms", "anagram_groups",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Group words that are anagrams of each other."""
from collections import defaultdict

${v("words")} = [
    "listen", "silent", "enlist", "google", "gogole",
    "cat", "act", "tac", "dog", "god", "odg",
]

${v("groups")} = defaultdict(list)
for ${v("word")} in ${v("words")}:
    ${v("signature")} = "".join(sorted(${v("word")}))
    ${v("groups")}[${v("signature")}].append(${v("word")})

print("anagram families:")
for ${v("signature")}, ${v("members")} in sorted(${v("groups")}.items(), key=lambda item: -len(item[1])):
    print(f"  {${v("signature")}} <- {${v("members")}}")

${v("largest")} = max(${v("groups")}.values(), key=len)
print(f"\\nlargest family: {${v("largest")}} ({len(${v("largest")})} words)")
print(f"words in a family: {sum(len(g) for g in ${v("groups")}.values() if len(g) > 1)}/{len(${v("words")})}")
`;
        }),
    py("py-ex-palindrome", "Palindrome checks", "Characters, words, and the two-pointer scan.", "String algorithms", "palindrome_check",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Palindromes at three levels of strictness."""


def ${f("is_palindrome_chars")}(text: str) -> bool:
    ${v("cleaned")} = "".join(c.lower() for c in text if c.isalnum())
    return ${v("cleaned")} == ${v("cleaned")}[::-1]


def ${f("is_palindrome_two_pointer")}(text: str) -> bool:
    ${v("cleaned")} = "".join(c.lower() for c in text if c.isalnum())
    ${v("left")}, ${v("right")} = 0, len(${v("cleaned")}) - 1
    while ${v("left")} < ${v("right")}:
        if ${v("cleaned")}[${v("left")}] != ${v("cleaned")}[${v("right")}]:
            return False
        ${v("left")} += 1
        ${v("right")} -= 1
    return True


${v("tests")} = ["racecar", "A man, a plan, a canal: Panama", "hello", "Was it a car or a cat I saw?", "praxis"]
for ${v("text")} in ${v("tests")}:
    ${v("simple")} = ${f("is_palindrome_chars")}(${v("text")})
    ${v("pointer")} = ${f("is_palindrome_two_pointer")}(${v("text")})
    print(f"{${v("text")}:<38} {${v("simple")}}")
`;
        }),
    py("py-ex-longest-prefix", "Longest common prefix", "Horizontal scan, sort trick, and divide & conquer.", "String algorithms", "longest_prefix",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Three ways to find the longest common prefix."""


def ${f("prefix_scan")}(words: list[str]) -> str:
    if not words:
        return ""
    ${v("prefix")} = words[0]
    for ${v("word")} in words[1:]:
        while not ${v("word")}.startswith(${v("prefix")}):
            ${v("prefix")} = ${v("prefix")}[:-1]
            if not ${v("prefix")}:
                return ""
    return ${v("prefix")}


def ${f("prefix_sort")}(words: list[str]) -> str:
    if not words:
        return ""
    ${v("first")}, ${v("last")} = min(words), max(words)
    ${v("i")} = 0
    while ${v("i")} < len(${v("first")}) and ${v("i")} < len(${v("last")}) and ${v("first")}[${v("i")}] == ${v("last")}[${v("i")}]:
        ${v("i")} += 1
    return ${v("first")}[:${v("i")}]


${v("cases")} = [
    ["flower", "flow", "flight"],
    ["interspecies", "interstellar", "interstate"],
    ["dog", "racecar", "car"],
]
for ${v("words")} in ${v("cases")}:
    print(f"{str(${v("words")}):<50} -> {${f("prefix_scan")}(${v("words")})!r} / {${f("prefix_sort")}(${v("words")})!r}")
`;
        }),

    // ─── Normalization ───────────────────────────────────────────────
    py("py-ex-unicode-normalize", "Unicode normalization", "NFC/NFD, casefold, and why 'café' != 'café'.", "Normalization", "unicode_normalize",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Same-looking strings can be byte-different."""
import unicodedata

${v("nfc")} = "café"        # single codepoint for é
${v("nfd")} = "cafe\\u0301"  # e + combining acute

print(f"as displayed : {${v("nfc")} == ${v("nfd")}}")
print(f"as bytes     : {len(${v("nfc")}.encode())} vs {len(${v("nfd")}.encode())} bytes")
print(f"NFC == NFC   : {unicodedata.normalize('NFC', ${v("nfd")}) == ${v("nfc")}}")

${v("turkish")} = "İSTANBUL"
print(f"upper->lower : {${v("turkish")}.lower()}")
print(f"casefold     : {'straße'.casefold()} (ss)")

${v("duplicates")} = ["café", "cafe\\u0301", "CAFE\\u0301", "CAFÉ"]
${v("canonical")} = {}
for ${v("word")} in ${v("duplicates")}:
    ${v("key")} = unicodedata.normalize("NFC", ${v("word")}).casefold()
    ${v("canonical")}.setdefault(${v("key")}, []).append(${v("word")})
print(f"distinct after NFC+casefold: {len(${v("canonical")})} -> {list(${v("canonical")}.values())}")
`;
        }),
    py("py-ex-whitespace-cleanup", "Whitespace cleanup", "strip, splitlines, and the squeeze pattern.", "Normalization", "whitespace_cleanup",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Tame messy whitespace."""
import re

${v("messy")} = " \\t\\n  hello   world  \\n\\t again  \\n"

print(f"original      : {${v("messy")}!r}")
print(f"strip()       : {${v("messy")}.strip()!r}")
print(f"split()       : {${v("messy")}.split()}")
print(f"splitlines()  : {${v("messy")}.splitlines()}")

${v("squeezed")} = re.sub(r"\\s+", " ", ${v("messy")}).strip()
print(f"squeezed      : {${v("squeezed")}!r}")

${v("lines")} = ["  keep this  ", "", "\\t drop-empty-but-keep-order  ", "done"]
${v("cleaned")} = [line.strip() for line in ${v("lines")}]
print(f"cleaned lines : {${v("cleaned")}}")
print(f"non-empty     : {[l for l in ${v('cleaned')} if l]}")
`;
        }),
    py("py-ex-titlecase-names", "Title-casing names", "Smart capitalization: particles, apostrophes, hyphens.", "Normalization", "titlecase_names",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Names deserve better than str.title()."""
import re

${v("lowercase_particles")} = {"de", "da", "van", "von", "der", "den", "la", "le", "di"}


def ${f("smart_title")}(name: str) -> str:
    ${v("words")} = name.lower().split()
    ${v("fixed")} = []
    for ${v("i")}, ${v("word")} in enumerate(${v("words")}):
        if ${v("i")} > 0 and ${v("word")} in ${v("lowercase_particles")} and ${v("i")} < len(${v("words")}) - 1:
            ${v("fixed")}.append(${v("word")})
        elif "-" in ${v("word")}:
            ${v("fixed")}.append("-".join(p[:1].upper() + p[1:] for p in ${v("word")}.split("-")))
        elif "'" in ${v("word")}:
            ${v("fixed")}.append("'".join(p[:1].upper() + p[1:] for p in ${v("word")}.split("'")))
        else:
            ${v("fixed")}.append(${v("word")}[:1].upper() + ${v("word")}[1:])
    return " ".join(${v("fixed")})


${v("names")} = [
    "jean de la fontaine",
    "mary-jane o'connor",
    "van der berg",
    "ludwig van beethoven",
]
for ${v("name")} in ${v("names")}:
    print(f"{${v("name")}:<24} -> {${f("smart_title")}(${v("name")})}")
`;
        }),
    py("py-ex-sentence-split", "Sentence splitting", "Abbreviation-aware sentence boundaries with regex.", "Normalization", "sentence_split",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Split prose into sentences without falling for abbreviations."""
import re

${v("text")} = (
    "Dr. Smith arrived at 3 p.m. on Nov. 5th. She checked the results. "
    "The patient, J. R. Hartley, was stable. Everything looked fine! "
    "Or did it? The next chapter begins here."
)

${v("pattern")} = re.compile(
    r"""                    
    (?<=[.!?])\\s+          
    (?=[A-Z])               
""", re.VERBOSE)

${v("sentences")} = [s.strip() for s in ${v("pattern")}.split(${v("text")}) if s.strip()]
print(f"sentences found: {len(${v("sentences")})}")
for ${v("i")}, ${v("sentence")} in enumerate(${v("sentences")}, 1):
    ${v("display")} = ${v("sentence")}[:52] + ("..." if len(${v("sentence")}) > 52 else "")
    print(f"  {${v('i')}}. {${v('display')}}")
    print(f"  {${v("i")}}. {${v("display")}}")
${v("words")} = len(${v("text")}.split())
print(f"\\nwords: {${v('words')}}, avg per sentence: {${v('words')} / len(${v('sentences')}):.1f}")
`;
        }),
];
