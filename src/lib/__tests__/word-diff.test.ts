/**
 * word-diff.test.ts — unit tests for src/lib/word-diff.ts (item F22).
 *
 * Covers the line-diff LCS (equal/add/remove/replace, empty inputs,
 * index reconstruction of BOTH sides, removes-before-adds block
 * ordering for the word-diff pairing), the documented size guards
 * (>5,000-line inputs and >2.5M-cell middles fall back to the
 * prefix/suffix trim + single replace block), and the intra-line
 * word segmentation (exact spans, concatenation invariant, empty
 * sides, char/token guards).
 */
import {describe, expect, it} from "vitest";
import {type DiffOp, lineDiff, wordDiffSegments, type WordSegment,} from "@/lib/word-diff";

/* ── helpers ──────────────────────────────────────────────────────── */

function countTypes(ops: DiffOp[]) {
    let equal = 0;
    let remove = 0;
    let add = 0;
    for (const op of ops) {
        if (op.type === "equal") equal++;
        else if (op.type === "remove") remove++;
        else add++;
    }
    return {equal, remove, add};
}

/** Replay ops and rebuild BOTH inputs — the core lineDiff invariant. */
function reconstruct(ops: DiffOp[], a: string[], b: string[]) {
    const aBack: string[] = [];
    const bBack: string[] = [];
    for (const op of ops) {
        if (op.type === "equal") {
            expect(a[op.aIndex]).toBe(b[op.bIndex]);
            aBack.push(a[op.aIndex]);
            bBack.push(b[op.bIndex]);
        } else if (op.type === "remove") {
            aBack.push(a[op.aIndex]);
        } else {
            bBack.push(b[op.bIndex]);
        }
    }
    return {aBack, bBack};
}

/** Word segments must concatenate back to the segmented side. */
function joinSegs(segs: WordSegment[]): string {
    return segs.map((s) => s.text).join("");
}

/* ── lineDiff ─────────────────────────────────────────────────────── */

describe("lineDiff", () => {
    it("returns all-equal ops for identical inputs", () => {
        const ops = lineDiff(["a", "b", "c"], ["a", "b", "c"]);
        expect(ops).toEqual([
            {type: "equal", aIndex: 0, bIndex: 0},
            {type: "equal", aIndex: 1, bIndex: 1},
            {type: "equal", aIndex: 2, bIndex: 2},
        ]);
    });

    it("emits a pure insertion with the correct b-side index", () => {
        const ops = lineDiff(["a"], ["a", "b"]);
        expect(ops).toEqual([
            {type: "equal", aIndex: 0, bIndex: 0},
            {type: "add", bIndex: 1},
        ]);
    });

    it("emits a pure deletion with the correct a-side index", () => {
        const ops = lineDiff(["a", "b"], ["b"]);
        expect(ops).toEqual([{type: "remove", aIndex: 0}, {type: "equal", aIndex: 1, bIndex: 0}]);
    });

    it("splits a middle replacement into remove-then-add", () => {
        const ops = lineDiff(["a", "b", "c"], ["a", "x", "c"]);
        expect(ops).toEqual([
            {type: "equal", aIndex: 0, bIndex: 0},
            {type: "remove", aIndex: 1},
            {type: "add", bIndex: 1},
            {type: "equal", aIndex: 2, bIndex: 2},
        ]);
    });

    it("handles empty inputs", () => {
        expect(lineDiff([], [])).toEqual([]);
        expect(lineDiff(["a"], [])).toEqual([{type: "remove", aIndex: 0}]);
        expect(lineDiff([], ["a"])).toEqual([{type: "add", bIndex: 0}]);
    });

    it("treats whitespace-variant lines as different (normalization is the caller's job)", () => {
        expect(lineDiff(["a "], ["a"])).toEqual([
            {type: "remove", aIndex: 0},
            {type: "add", bIndex: 0},
        ]);
    });

    it("reconstructs both sides and keeps removes before adds on a scrambled case", () => {
        const a = Array.from({length: 120}, (_, i) => `line ${i}`);
        const b: string[] = [];
        for (let i = 0; i < 120; i++) {
            if (i % 7 === 3) continue; // deleted lines
            b.push(i % 11 === 5 ? `line ${i}!` : `line ${i}`); // modified lines
            if (i % 13 === 2) b.push(`insert ${i}`); // inserted lines
        }
        const ops = lineDiff(a, b);

        const {aBack, bBack} = reconstruct(ops, a, b);
        expect(aBack).toEqual(a);
        expect(bBack).toEqual(b);

        // Block ordering: a remove never follows an add inside a change
        // block — the renderer pairs the k-th remove with the k-th add.
        for (let i = 1; i < ops.length; i++) {
            const prev = ops[i - 1];
            const cur = ops[i];
            expect(prev.type === "add" && cur.type === "remove").toBe(false);
        }

        // The scripted edits really show up as changes.
        const counts = countTypes(ops);
        expect(counts.add).toBeGreaterThan(0);
        expect(counts.remove).toBeGreaterThan(0);
        expect(counts.equal).toBeGreaterThan(0);
    });

    it("guards >5,000-line inputs: prefix/suffix trim + replace block keeps a single middle change minimal", () => {
        const n = 6_000;
        const a = Array.from({length: n}, (_, i) => `left ${i}`);
        const b = a.slice();
        b[2_999] = "CHANGED";
        const ops = lineDiff(a, b);

        expect(countTypes(ops)).toEqual({equal: 5_999, remove: 1, add: 1});
        expect(ops.length).toBe(6_001);
        expect(ops[2_999]).toEqual({type: "remove", aIndex: 2_999});
        expect(ops[3_000]).toEqual({type: "add", bIndex: 2_999});
        const {aBack, bBack} = reconstruct(ops, a, b);
        expect(aBack).toEqual(a);
        expect(bBack).toEqual(b);
    });

    it("guards >5,000-line fully-different inputs with one replace block", () => {
        const a = Array.from({length: 6_000}, (_, i) => `l${i}`);
        const b = Array.from({length: 6_000}, (_, i) => `r${i}`);
        const ops = lineDiff(a, b);

        expect(countTypes(ops)).toEqual({equal: 0, remove: 6_000, add: 6_000});
        expect(ops[0]).toEqual({type: "remove", aIndex: 0});
        expect(ops[5_999]).toEqual({type: "remove", aIndex: 5_999});
        expect(ops[6_000]).toEqual({type: "add", bIndex: 0});
        expect(ops[11_999]).toEqual({type: "add", bIndex: 5_999});
    });

    it("guards oversized DP area even under the 5,000-line cap", () => {
        // 5,000 × 2,000 = 10M cells > MAX_LCS_CELLS → replace-block fallback.
        const a = Array.from({length: 5_000}, (_, i) => `a${i}`);
        const b = Array.from({length: 2_000}, (_, i) => `b${i}`);
        const ops = lineDiff(a, b);
        expect(countTypes(ops)).toEqual({equal: 0, remove: 5_000, add: 2_000});
    });

    it("still diffs identical 5,001-line files as all-equal (guard fast path)", () => {
        const a = Array.from({length: 5_001}, (_, i) => `same ${i}`);
        const ops = lineDiff(a, a.slice());
        expect(countTypes(ops)).toEqual({equal: 5_001, remove: 0, add: 0});
    });
});

/* ── wordDiffSegments ─────────────────────────────────────────────── */

describe("wordDiffSegments", () => {
    it("returns one unchanged segment for identical strings", () => {
        expect(wordDiffSegments("hello world", "hello world")).toEqual([
            {text: "hello world", changed: false},
        ]);
    });

    it("handles empty sides", () => {
        expect(wordDiffSegments("", "")).toEqual([{text: "", changed: false}]);
        expect(wordDiffSegments("", "abc")).toEqual([]);
        expect(wordDiffSegments("abc", "")).toEqual([{text: "abc", changed: true}]);
    });

    it("highlights only the changed word in a shared sentence", () => {
        expect(wordDiffSegments("the quick brown fox", "the quick red fox")).toEqual([
            {text: "the quick ", changed: false},
            {text: "brown", changed: true},
            {text: " fox", changed: false},
        ]);
    });

    it("highlights a changed numeric literal, not the whole line", () => {
        expect(wordDiffSegments("value = 1", "value = 2")).toEqual([
            {text: "value = ", changed: false},
            {text: "1", changed: true},
        ]);
    });

    it("tokenizes punctuation runs so operator changes highlight alone", () => {
        expect(wordDiffSegments("x = a + b;", "x = a - b;")).toEqual([
            {text: "x = a ", changed: false},
            {text: "+", changed: true},
            {text: " b;", changed: false},
        ]);
    });

    it("marks an insertion on the side that has it (swapped call highlights the other)", () => {
        // a is the longer side — its extra span is the changed one.
        expect(wordDiffSegments("foo new bar", "foo bar")).toEqual([
            {text: "foo ", changed: false},
            {text: "new ", changed: true},
            {text: "bar", changed: false},
        ]);
        // b's own call marks the same span against a.
        expect(wordDiffSegments("foo bar", "foo new bar")).toEqual([
            {text: "foo bar", changed: false},
        ]);
    });

    it("marks multiple disjoint changed spans on one line", () => {
        expect(wordDiffSegments("aa XX bb YY cc", "aa ZZ bb WW cc")).toEqual([
            {text: "aa ", changed: false},
            {text: "XX", changed: true},
            {text: " bb ", changed: false},
            {text: "YY", changed: true},
            {text: " cc", changed: false},
        ]);
    });

    it("concatenates back to the segmented side across cases", () => {
        const cases: Array<[string, string]> = [
            ["", ""],
            ["a", "a"],
            ["", "x"],
            ["x", ""],
            ["hello world", "hello there"],
            ["def main():", "def main(x):"],
            ["aaa bbb ccc ddd", "aaa xxx ccc ddd"],
            ["  indented(  )", "indented()"],
            ["one", "two"],
        ];
        for (const [x, y] of cases) {
            const segs = wordDiffSegments(x, y);
            expect(joinSegs(segs)).toBe(x);
            for (const s of segs) expect(typeof s.changed).toBe("boolean");
            // No empty segments — except the ("", "") identity fast path,
            // which returns one empty unchanged segment by design.
            if (x.length > 0) for (const s of segs) expect(s.text.length).toBeGreaterThan(0);
        }
    });

    it("falls back to character prefix/suffix trim for oversized lines", () => {
        const a = `${"x".repeat(5_000)}A`;
        const b = `${"x".repeat(5_000)}B`;
        const segs = wordDiffSegments(a, b);
        expect(segs).toEqual([
            {text: "x".repeat(5_000), changed: false},
            {text: "A", changed: true},
        ]);
        // The swapped call highlights B on its own side.
        expect(wordDiffSegments(b, a)).toEqual([
            {text: "x".repeat(5_000), changed: false},
            {text: "B", changed: true},
        ]);
    });

    it("marks the whole line changed when the token table would be oversized", () => {
        const a = Array.from({length: 300}, (_, i) => `w${i}`).join(" ");
        const b = Array.from({length: 300}, (_, i) => `v${i}`).join(" ");
        // 599 × 599 tokens > WORD_MAX_TOKEN_CELLS → middle marked wholesale.
        expect(wordDiffSegments(a, b)).toEqual([{text: a, changed: true}]);
        expect(joinSegs(wordDiffSegments(b, a))).toBe(b);
    });
});
