/**
 * flame-graph-sort.test.ts — unit tests for the "sort by self time"
 * sibling ordering added to layoutFlame (the flame graph toolbar's
 * Cumulative / Self time two-segment toggle).
 *
 * Follows flame-graph-data.test.ts style: pure data-lib coverage, no
 * DOM. Covered:
 *   · default layout keeps the ingestion (cumulative) sibling order and
 *     reports sort: "cumulative"
 *   · sort: "self" re-orders every parent's children by self time
 *     descending (cumulative desc as the tie-break), leftmost = hottest
 *     self — at EVERY depth, including under a zoom root
 *   · widths stay proportional to CUMULATIVE time in both modes (only
 *     the ORDER changes — the same rect set, the same total)
 *   · the SHARED tree is never mutated: a cumulative layout after a
 *     self layout still renders the ingestion order
 *   · click-to-zoom parity: the zoom key resolves in either mode, and
 *     zooming re-roots the SAME subtree (percent base = true root)
 *   · zero-self siblings keep the cumulative order among themselves
 */
import {describe, expect, it} from "vitest";
import {buildFlameTree, type FlameNode, layoutFlame,} from "@/lib/flame-graph-data";

/**
 * Fixture — one root, three children, one grandchild level. Sums are
 * exact (child cumulative ≤ parent budget) so no overflow scaling muddies
 * the x/w assertions:
 *
 *   root (cum 1, self 0)
 *   ├── aa (cum 0.5, self 0.05)   ← lowest self of the three
 *   │   ├── aa1 (cum 0.3, self 0.1)
 *   │   └── aa2 (cum 0.15, self 0.3)  ← hotter self than aa1
 *   ├── bb (cum 0.2, self 0.3)    ← hottest self at depth 1
 *   └── cc (cum 0.3, self 0.15)
 */
const TREE: FlameNode = {
    name: "root",
    cumulative: 1,
    self: 0,
    children: [
        {
            name: "aa",
            cumulative: 0.5,
            self: 0.05,
            children: [
                {name: "aa1", cumulative: 0.3, self: 0.1},
                {name: "aa2", cumulative: 0.15, self: 0.3},
            ],
        },
        {name: "bb", cumulative: 0.2, self: 0.3},
        {name: "cc", cumulative: 0.3, self: 0.15},
    ],
};

/** names of `node`'s children laid left-to-right (by ascending x). */
function childOrderAt(
    rects: { depth: number; x: number; w: number; node: FlameNode }[],
    nodeName: string,
    depth: number
): string[] {
    return rects
        .filter((r) => r.depth === depth && r.node.name === nodeName)
        .flatMap((r) =>
            rects
                .filter((c) => c.depth === depth + 1 && c.x >= r.x && c.x < r.x + r.w)
                .sort((a, b) => a.x - b.x)
                .map((c) => c.node.name)
        );
}

describe("layoutFlame sort mode", () => {
    it("defaults to cumulative: ingestion order, sort field set", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        const lay = layoutFlame(tree, {width: 100});
        expect(lay.sort).toBe("cumulative");
        expect(childOrderAt(lay.rects, "root", 0)).toEqual(["aa", "bb", "cc"]);
        expect(childOrderAt(lay.rects, "aa", 1)).toEqual(["aa1", "aa2"]);
    });

    it("sort: 'self' orders siblings by self time desc at every depth", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        const lay = layoutFlame(tree, {width: 100, sort: "self"});
        expect(lay.sort).toBe("self");
        // Depth 1: bb (0.3) → cc (0.15) → aa (0.05).
        expect(childOrderAt(lay.rects, "root", 0)).toEqual(["bb", "cc", "aa"]);
        // Depth 2 (under aa): aa2 (0.3) → aa1 (0.1) — per-parent ordering.
        expect(childOrderAt(lay.rects, "aa", 1)).toEqual(["aa2", "aa1"]);
    });

    it("ties break by cumulative time (zero-self siblings stay ordered)", () => {
        const parent: FlameNode = {
            name: "p",
            cumulative: 1,
            children: [
                {name: "z", cumulative: 0.1},
                {name: "y", cumulative: 0.3},
                {name: "x", cumulative: 0.2},
            ],
        };
        const tree = buildFlameTree({tree: [parent]})!;
        const lay = layoutFlame(tree, {width: 100, sort: "self"});
        // All self-less (self ?? 0) → cumulative desc: y, x, z.
        expect(childOrderAt(lay.rects, "p", 0)).toEqual(["y", "x", "z"]);
    });

    it("only re-orders — widths stay proportional to cumulative time", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        const cum = layoutFlame(tree, {width: 100});
        const self = layoutFlame(tree, {width: 100, sort: "self"});
        const widthOf = (lay: typeof cum, n: string) =>
            lay.rects.find((r) => r.node.name === n)!.w;
        for (const n of ["aa", "bb", "cc", "aa1", "aa2"]) {
            expect(widthOf(self, n)).toBeCloseTo(widthOf(cum, n), 9);
        }
        expect(self.total).toBeCloseTo(cum.total, 9);
        expect(self.rows).toBe(cum.rows);
    });

    it("never mutates the shared tree — cumulative order survives a self layout", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        layoutFlame(tree, {width: 100, sort: "self"});
        const back = layoutFlame(tree, {width: 100});
        expect(childOrderAt(back.rects, "root", 0)).toEqual(["aa", "bb", "cc"]);
        expect(childOrderAt(back.rects, "aa", 1)).toEqual(["aa1", "aa2"]);
    });

    it("keeps click-to-zoom parity: the zoom key re-roots in self mode too", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        const aa = [...tree.byKey.values()].find((e) => e.node.name === "aa")!;
        const key = tree.keyOf(aa.node);
        const lay = layoutFlame(tree, {width: 100, zoomKey: key, sort: "self"});
        const zoomRoot = lay.rects.find((r) => r.depth === 0)!;
        expect(zoomRoot.node.name).toBe("aa");
        expect(zoomRoot.isZoomRoot).toBe(true);
        // aa's children still self-ordered under the zoom root…
        expect(childOrderAt(lay.rects, "aa", 0)).toEqual(["aa2", "aa1"]);
        // …and the percent base is still the TRUE root's total.
        expect(lay.total).toBeCloseTo(1, 9);
    });

    it("an unknown sort value degrades to the cumulative order", () => {
        const tree = buildFlameTree({tree: [TREE]})!;
        const lay = layoutFlame(tree, {width: 100, sort: undefined});
        expect(lay.sort).toBe("cumulative");
        expect(childOrderAt(lay.rects, "root", 0)).toEqual(["aa", "bb", "cc"]);
    });
});
