import {describe, expect, it} from "vitest";
// term-links — www. (scheme-less) URL segmentation layered on
// term-text's http(s) splitter; the tests pin the detector, the href
// normalization and — critically for the find bar — the exact tiling
// of the raw buffer (segments must reconstruct the source verbatim).
import {splitTerminalLinks, terminalLinkHref} from "@/lib/term-links";

describe("splitTerminalLinks", () => {
    it("linkifies scheme-less www. URLs between plain text", () => {
        const segs = splitTerminalLinks("see www.example.com/docs for details");
        expect(segs).toEqual([
            {isUrl: false, text: "see ", start: 0},
            {isUrl: true, text: "www.example.com/docs", start: 4},
            {isUrl: false, text: " for details", start: 24},
        ]);
    });

    it("keeps http(s) detection intact (term-text behavior)", () => {
        const segs = splitTerminalLinks("docs: https://a.io/x and http://b.io/y");
        expect(segs.filter((s) => s.isUrl).map((s) => s.text)).toEqual([
            "https://a.io/x",
            "http://b.io/y",
        ]);
    });

    it("matches a scheme-prefixed www host ONCE, never nested", () => {
        const segs = splitTerminalLinks("go to https://www.example.com/a");
        expect(segs.filter((s) => s.isUrl)).toEqual([
            {isUrl: true, text: "https://www.example.com/a", start: 6},
        ]);
    });

    it("trims trailing sentence punctuation into the next plain segment", () => {
        const segs = splitTerminalLinks("visit www.example.com.");
        expect(segs).toEqual([
            {isUrl: false, text: "visit ", start: 0},
            {isUrl: true, text: "www.example.com", start: 6},
            {isUrl: false, text: ".", start: 21},
        ]);
    });

    it("keeps balanced parens inside a URL and trims unbalanced ones", () => {
        expect(
            splitTerminalLinks("(see www.en.wikipedia.org/wiki/Python_(lang))")[1]
        ).toMatchObject({isUrl: true, text: "www.en.wikipedia.org/wiki/Python_(lang)"});
        expect(splitTerminalLinks("www.example.com)")[0]).toMatchObject({
            isUrl: true,
            text: "www.example.com",
        });
    });

    it("never swallows ANSI escapes into a URL", () => {
        // escape before the URL: the link still ends at the reset escape
        const segs = splitTerminalLinks("\x1b[36mwww.example.com\x1b[0m end");
        expect(segs).toEqual([
            {isUrl: false, text: "\x1b[36m", start: 0},
            {isUrl: true, text: "www.example.com", start: 5},
            {isUrl: false, text: "\x1b[0m end", start: 20},
        ]);
    });

    it("leaves bare www. (nothing after the dot) unlinked", () => {
        expect(splitTerminalLinks("just www. alone").every((s) => !s.isUrl)).toBe(true);
    });

    it("segments always tile the raw buffer exactly (find-bar offsets)", () => {
        const text =
            "docs at www.example.com and https://a.io/x., then www.b.io)";
        const segs = splitTerminalLinks(text);
        expect(segs.map((s) => s.text).join("")).toBe(text);
        for (const s of segs) {
            expect(text.slice(s.start, s.start + s.text.length)).toBe(s.text);
        }
    });
});

describe("terminalLinkHref", () => {
    it("passes http(s) URLs through verbatim", () => {
        expect(terminalLinkHref("http://a.io/x")).toBe("http://a.io/x");
        expect(terminalLinkHref("https://b.io/y")).toBe("https://b.io/y");
    });
    it("upgrades scheme-less www. URLs to https:// (not a relative path)", () => {
        expect(terminalLinkHref("www.example.com/docs")).toBe(
            "https://www.example.com/docs"
        );
    });
});
