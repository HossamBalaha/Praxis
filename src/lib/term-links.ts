/**
 * Pure URL-link helpers for the terminal scrollback, layered on
 * src/lib/term-text.ts (the find-bar module). term-text's
 * splitTerminalLinks already linkifies http(s):// URLs; this module
 * closes the remaining gap — scheme-less www. links (2c): plain
 * `www.example.com/page` mentions in logs, help text, READMEs echoed
 * into the terminal.
 *
 * The segment CONTRACT is byte-for-byte the same as term-text's: the
 * pieces still TILE the raw buffer (trimmed trailing punctuation stays
 * in the following plain segment, nothing is ever lost), so the find
 * bar's <mark> math — absolute [start, end) ranges sliced against the
 * raw stream — is untouched. This is a rendering-layer change only;
 * the find bar keeps matching over the raw buffer regardless.
 *
 * No React / DOM here so the vitest suite can pin the splitter and
 * the href normalization directly.
 */

import {type TermLinkSegment, trimUrlTrailing} from "@/lib/term-text";

/** http(s) OR scheme-less www. URL scanner — same exclusion class as
 * term-text's TERMINAL_URL_RE: no whitespace, no control bytes (ANSI
 * escapes are therefore never swallowed into a URL), no quotes or
 * angle brackets. Alternation order guarantees a scheme-prefixed
 * https://www.… matches ONCE, as one URL, never as a nested www. */
const TERMINAL_URL_WWW_RE = /https?:\/\/[^\s\x00-\x1f<>"']+|www\.[^\s\x00-\x1f<>"']+/g;

/** Absolute href for a detected URL segment: a scheme-less www. link
 *  navigates via the https:// form (a bare `www…` href would be
 *  resolved as a RELATIVE path by the browser); http(s) segments pass
 *  through verbatim. */
export function terminalLinkHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Split a raw buffer into alternating plain-text / URL segments —
 *  term-text's splitTerminalLinks plus the www. variant (the regex and
 *  the trim/min-length bookkeeping mirror it exactly so http(s)
 *  behavior is unchanged). Consecutive text pieces are kept separate
 *  (the caller renders each through its own Ansi pass — URLs are
 *  rare, so there are normally just one or two segments). */
export function splitTerminalLinks(text: string): TermLinkSegment[] {
    const out: TermLinkSegment[] = [];
    let last = 0;
    // Local regex instance: a shared /g constant could carry a stale
    // lastIndex if a previous exec loop bailed early.
    const re = new RegExp(TERMINAL_URL_WWW_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const url = trimUrlTrailing(m[0]);
        // Minimum skeleton per shape: "https://" (8) / "www." (4). A trim
        // down to the bare prefix is not a link worth rendering — the
        // match stays plain text instead (its chars land in the next
        // plain segment, exactly like term-text's rule).
        const minLen = m[0].startsWith("www.") ? "www.".length : "https://".length;
        if (url.length <= minLen) continue;
        const start = m.index;
        const end = start + url.length;
        if (start > last) out.push({isUrl: false, text: text.slice(last, start), start: last});
        out.push({isUrl: true, text: url, start});
        last = end;
        re.lastIndex = end;
    }
    if (last < text.length) {
        out.push({isUrl: false, text: text.slice(last), start: last});
    }
    return out;
}
