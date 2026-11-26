/**
 * Pure text helpers for the integrated terminal panel
 * (src/components/terminal-panel.tsx): scrollback SEARCH over the
 * ANSI-laden buffer and http(s) LINK detection for the rendered lines.
 *
 * The scrollback is a single string peppered with SGR/OSC escape
 * sequences, so both features need the same primitive: a mapping
 * between positions in the RAW text and positions in the ANSI-STRIPPED
 * (visible) text. No React / DOM here so the vitest suite can pin the
 * tricky offset math down directly.
 */

/* ------------------------------------------------------------------ */
/*  ANSI stripping + raw↔plain offset mapping                          */
/* ------------------------------------------------------------------ */

/** CSI sequences (`\x1b[…m` colors, cursor moves) — the same class the
 *  panel's copy-scrollback strips. Global flag: only used via
 *  String.replace, which resets lastIndex itself. */
export const ANSI_CSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** OSC sequences (window-title writes: `\x1b]0;…\x07`). */
const ANSI_OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Remove every ANSI escape sequence, leaving the visible text. */
export function stripAnsiCodes(text: string): string {
    return text.replace(ANSI_CSI_RE, "").replace(ANSI_OSC_RE, "");
}

/** Walk one raw line and record, for every VISIBLE character, the
 *  offset it came from in the raw line. Escape sequences occupy raw
 *  space but produce no visible chars, so `rawOf[plainIdx]` maps a
 *  plain-text index back onto the raw line — the search highlight and
 *  the link splitter both need that reverse mapping. */
function ansiOffsetMap(line: string): { plain: string; rawOf: number[] } {
    const rawOf: number[] = [];
    let plain = "";
    let i = 0;
    while (i < line.length) {
        if (line.charCodeAt(i) === 0x1b) {
            const rest = line.slice(i);
            const csi = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(rest);
            if (csi) {
                i += csi[0].length;
                continue;
            }
            const osc = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(rest);
            if (osc) {
                i += osc[0].length;
                continue;
            }
            // Lone ESC byte with no sequence behind it — skip the byte.
            i += 1;
            continue;
        }
        rawOf.push(i);
        plain += line[i];
        i += 1;
    }
    return {plain, rawOf};
}

/* ------------------------------------------------------------------ */
/*  Scrollback search                                                  */

/* ------------------------------------------------------------------ */

/** One find-bar hit over the scrollback buffer. All offsets are
 *  CHARACTER offsets (not byte offsets) — the panel slices the same
 *  JS string with them. */
export interface TermScrollMatch {
    /** 0-based line index within the buffer (for tests / previews). */
    line: number;
    /** Raw offset of the line's first character within the WHOLE buffer —
     *  add rawStart/rawEnd to slice the buffer directly. */
    bufOffset: number;
    /** Match start/end offsets within the raw line. */
    rawStart: number;
    rawEnd: number;
    /** ANSI-stripped line text (handy for match previews). */
    plain: string;
    /** Match start within the plain line. */
    plainStart: number;
}

/** Case-insensitive substring search over the VISIBLE scrollback text,
 *  one hit per occurrence, never spanning a newline (matches that
 *  would cross lines are simply not terminal-find material). Query is
 *  matched after ANSI stripping, so a search for "0" cannot hit the
 *  digits inside a color escape; the returned raw offsets let the
 *  caller wrap the right span of the RAW buffer in a highlight. */
export function findScrollbackMatches(
    buffer: string,
    query: string
): TermScrollMatch[] {
    const q = query.toLowerCase();
    if (!q) return [];
    const out: TermScrollMatch[] = [];
    // Walk line by line, tracking each line's raw offset in the buffer
    // (split() drops the "\n" separators, so we re-add 1 per line).
    let bufOffset = 0;
    let lineIdx = 0;
    for (const line of buffer.split("\n")) {
        const {plain, rawOf} = ansiOffsetMap(line);
        const low = plain.toLowerCase();
        let idx = low.indexOf(q);
        while (idx !== -1) {
            const rawStart = rawOf[idx] ?? line.length;
            // End = raw offset of the LAST matched char + 1; if the match
            // runs to the plain line's end, fall back to the raw line length.
            const rawEnd =
                idx + q.length - 1 < rawOf.length
                    ? (rawOf[idx + q.length - 1] ?? 0) + 1
                    : line.length;
            out.push({
                line: lineIdx,
                bufOffset,
                rawStart,
                rawEnd,
                plain,
                plainStart: idx,
            });
            idx = low.indexOf(q, idx + q.length);
        }
        bufOffset += line.length + 1;
        lineIdx += 1;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  URL link detection                                                 */

/* ------------------------------------------------------------------ */

/** One piece of the buffer: either plain (ANSI-carrying) text or a
 *  detected http(s) URL. `start` is the segment's absolute offset in
 *  the source text so an overlapping search highlight can split it. */
export interface TermLinkSegment {
    isUrl: boolean;
    text: string;
    start: number;
}

/** http(s) URL scanner — no whitespace, no control bytes, no quotes or
 *  angle brackets inside the URL. ANSI escapes are control bytes and
 *  are therefore never swallowed into a URL. */
const TERMINAL_URL_RE = /https?:\/\/[^\s\x00-\x1f<>"']+/g;

/** Trim trailing punctuation that is really sentence syntax, not part
 *  of the URL: `.` `,` `;` `:` `!` `?` always, and a closing paren /
 *  bracket / brace only when the URL never opened one (the Wikipedia
 *  `(disambiguation)` case keeps its balanced parens). */
export function trimUrlTrailing(url: string): string {
    let u = url;
    let changed = true;
    while (changed && u.length > 0) {
        changed = false;
        const last = u.charAt(u.length - 1);
        if (".,;:!?".includes(last)) {
            u = u.slice(0, -1);
            changed = true;
            continue;
        }
        const pairs: Array<[string, string]> = [
            ["(", ")"],
            ["[", "]"],
            ["{", "}"],
        ];
        for (const [open, close] of pairs) {
            if (
                last === close &&
                u.split(open).length - 1 < u.split(close).length - 1
            ) {
                u = u.slice(0, -1);
                changed = true;
                break;
            }
        }
    }
    return u;
}

/** Split a raw buffer into alternating plain-text / URL segments. The
 *  trimmed-off trailing punctuation stays part of the FOLLOWING plain
 *  segment, so nothing is ever lost. Consecutive text pieces are kept
 *  separate (the caller renders each through its own Ansi pass — URLs
 *  are rare, so there are normally just one or two segments). */
export function splitTerminalLinks(text: string): TermLinkSegment[] {
    const out: TermLinkSegment[] = [];
    let last = 0;
    // Local regex instance: the module-level /g constant could carry a
    // stale lastIndex if a previous exec loop bailed early.
    const re = new RegExp(TERMINAL_URL_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const url = trimUrlTrailing(m[0]);
        // A trim down to bare scheme (or shorter) is not a link worth
        // rendering — keep it as plain text instead.
        if (url.length <= "https://".length) continue;
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
