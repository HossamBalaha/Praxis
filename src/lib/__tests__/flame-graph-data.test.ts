/**
 * flame-graph-data.test.ts — unit tests for src/lib/flame-graph-data.ts.
 *
 * Covered:
 *   · pstats location parsing (regular, Windows backslash paths,
 *     built-ins in both the "~:0(...)" and "{...}" forms, pathological)
 *   · moduleOf basenames across separators; shortFrameName shortening
 *   · ncalls parsing ("10", "10/3", garbage)
 *   · buildFlameTree from flat rows — the pseudo call-tree derivation:
 *     null for empty input; the tightest-fit nesting recovers a
 *     plausible <module> → main → work → print chain; total = max cum
 *   · layoutFlame — proportional widths, self-time gap, zoom re-rooting
 *     with the percent base staying the TRUE root, "(other)" aggregation
 *     of sub-pixel siblings, depth-cap truncation
 *   · hitTestFlame depth/row lookup
 *   · flameColorsFor stability + warm-palette membership
 *   · formatSeconds / percentOf adaptive formatting
 *   · flamePathTo breadcrumb path
 */
import {describe, expect, it} from "vitest";
import {
    buildFlameTree,
    flameColorsFor,
    type FlameNode,
    flamePathTo,
    formatSeconds,
    hitTestFlame,
    layoutFlame,
    moduleOf,
    parseNcalls,
    parsePstatsLocation,
    percentOf,
    type PstatsRow,
    shortFrameName,
} from "@/lib/flame-graph-data";

// ── pstats cell parsing ─────────────────────────────────────────────

describe("parsePstatsLocation", () => {
    it("parses a regular file:line(func) cell", () => {
        expect(parsePstatsLocation("main.py:20(main)")).toEqual({
            name: "main",
            file: "main.py",
            line: 20,
            module: "main.py",
        });
    });

    it("splits Windows backslash paths (F:\\Praxis profiles)", () => {
        const p = parsePstatsLocation("F:\\Praxis\\demo.py:12(work)");
        expect(p.file).toBe("F:\\Praxis\\demo.py");
        expect(p.module).toBe("demo.py");
        expect(p.line).toBe(12);
        expect(p.name).toBe("work");
    });

    it("parses built-ins in the ~:0(<built-in method x>) form", () => {
        const p = parsePstatsLocation("~:0(<built-in method print>)");
        expect(p.file).toBe("~");
        expect(p.line).toBe(0);
        expect(p.module).toBe("~");
        expect(p.name).toBe("<built-in method print>");
    });

    it("parses built-ins in the brace form", () => {
        const p = parsePstatsLocation("{built-in method builtins.abs}");
        expect(p.module).toBe("~");
        expect(p.line).toBe(0);
        expect(p.name).toBe("built-in method builtins.abs");
    });

    it("keeps a pathological cell verbatim", () => {
        const p = parsePstatsLocation("not a location at all");
        expect(p.name).toBe("not a location at all");
        expect(p.module).toBe("~");
    });

    it("returns a placeholder for an empty cell", () => {
        expect(parsePstatsLocation("").name).toBe("(unknown)");
    });
});

describe("moduleOf", () => {
    it("takes the basename on both separators", () => {
        expect(moduleOf("/home/u/scripts/main.py")).toBe("main.py");
        expect(moduleOf("C:\\work\\proj\\util.py")).toBe("util.py");
    });
    it("maps built-ins and empties to ~", () => {
        expect(moduleOf("~")).toBe("~");
        expect(moduleOf("")).toBe("~");
    });
});

describe("shortFrameName", () => {
    it("strips <built-in method …>", () => {
        expect(shortFrameName("<built-in method print>")).toBe("print");
    });
    it("strips <built-in function …>", () => {
        expect(shortFrameName("<built-in function abs>")).toBe("abs");
    });
    it("extracts the method name from <method 'x' of 'y' objects>", () => {
        expect(shortFrameName("<method 'append' of 'list' objects>")).toBe("append");
    });
    it("keeps <module> and plain names", () => {
        expect(shortFrameName("<module>")).toBe("<module>");
        expect(shortFrameName("work")).toBe("work");
        expect(shortFrameName("")).toBe("(unknown)");
    });
});

describe("parseNcalls", () => {
    it("parses plain totals", () => {
        expect(parseNcalls("10")).toEqual({total: 10, primitive: null});
    });
    it("parses total/primitive cells", () => {
        expect(parseNcalls("10/3")).toEqual({total: 10, primitive: 3});
    });
    it("falls back to zero on garbage", () => {
        expect(parseNcalls("n/a")).toEqual({total: 0, primitive: null});
        expect(parseNcalls("")).toEqual({total: 0, primitive: null});
    });
});

// ── pseudo call-tree from flat rows ─────────────────────────────────

const CHAIN_ROWS: PstatsRow[] = [
    {ncalls: "1", tottime: 0.005, cumtime: 0.1, location: "<string>:1(<module>)"},
    {ncalls: "1", tottime: 0.001, cumtime: 0.095, location: "main.py:20(main)"},
    {ncalls: "10", tottime: 0.03, cumtime: 0.08, location: "main.py:5(work)"},
    {ncalls: "10", tottime: 0.02, cumtime: 0.02, location: "~:0(<built-in method print>)"},
];

describe("buildFlameTree (rows)", () => {
    it("returns null for empty rows and undefined sources", () => {
        expect(buildFlameTree({rows: []})).toBeNull();
        expect(buildFlameTree({})).toBeNull();
    });

    it("derives the plausible call chain via tightest-fit nesting", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        const names: string[] = [];
        let n = tree.root;
        for (; ;) {
            names.push(n.name);
            const kids = n.children ?? [];
            if (kids.length === 0) break;
            // The chain is a single spine in this fixture; each child list
            // holds exactly the next nested frame.
            expect(kids.length).toBe(1);
            n = kids[0];
        }
        expect(names).toEqual(["<script>", "<module>", "main", "work", "print"]);
    });

    it("uses the largest cumulative row as the total", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        expect(tree.total).toBeCloseTo(0.1, 9);
    });

    it("indexes every frame with stable keys and paths", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        expect(tree.byKey.size).toBe(5);
        const work = [...tree.byKey.values()].find((e) => e.node.name === "work")!;
        expect(work.path.map((p) => p.name)).toEqual([
            "<script>",
            "<module>",
            "main",
            "work",
        ]);
        expect(work.parent?.name).toBe("main");
        expect(work.depth).toBe(3);
        // Same build → same keys (stable colors + zoom targets).
        const again = buildFlameTree({rows: CHAIN_ROWS.map((r) => ({...r}))})!;
        expect(again.keyOf(again.root)).toBe(tree.keyOf(tree.root));
    });
});

// ── layout ─────────────────────────────────────────────────────────

describe("layoutFlame", () => {
    it("gives the root the full width and nests children proportionally", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        const lay = layoutFlame(tree, {width: 200});
        const root = lay.rects.find((r) => r.depth === 0)!;
        expect(root.x).toBe(0);
        expect(root.w).toBeCloseTo(200, 6);
        // <script> has zero self time, so <module> (cum == total) gets the
        // full width too — the self-time gap appears on <module>'s row.
        const mod = lay.rects.find((r) => r.node.name === "<module>")!;
        expect(mod.w).toBeCloseTo(200, 6);
        expect(mod.x).toBe(0);
        // main: <module>'s child budget is (0.1−0.005)/0.1 of the width →
        // main (cum 0.095) fills it exactly: 0.095/0.1 × 200 = 190.
        const main = lay.rects.find((r) => r.node.name === "main")!;
        expect(main.w).toBeCloseTo(190, 6);
        // work: 0.08/0.1 of the root width → 160px at depth 3.
        const work = lay.rects.find((r) => r.node.name === "work")!;
        expect(work.w).toBeCloseTo(160, 6);
        expect(work.depth).toBe(3);
        expect(lay.rows).toBe(5);
        expect(lay.truncated).toBe(false);
    });

    it("re-roots on zoomKey while keeping the TRUE root as percent base", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        const workEntry = [...tree.byKey.values()].find((e) => e.node.name === "work")!;
        const lay = layoutFlame(tree, {width: 200, zoomKey: tree.keyOf(workEntry.node)});
        const root = lay.rects.find((r) => r.depth === 0)!;
        expect(root.node.name).toBe("work");
        expect(root.isZoomRoot).toBe(true);
        expect(root.w).toBeCloseTo(200, 6);
        // print under work: 0.02/0.08 of the width.
        const print = lay.rects.find((r) => r.node.name === "print")!;
        expect(print.w).toBeCloseTo(50, 6);
        expect(lay.total).toBeCloseTo(0.1, 9);
    });

    it("aggregates sub-pixel siblings into one (other) bucket", () => {
        // One wide child + 6 tiny ones, driven through the rich tree input.
        const parent: FlameNode = {
            name: "parent",
            cumulative: 1,
            self: 0,
            children: [
                {name: "big", cumulative: 0.94},
                ...Array.from({length: 6}, (_, i) => ({
                    name: `tiny${i}`,
                    cumulative: 0.01,
                })),
            ],
        };
        const tree = buildFlameTree({tree: [parent]})!;
        const lay = layoutFlame(tree, {width: 100, minFramePx: 4});
        const bucket = lay.rects.find((r) => r.aggregated);
        expect(bucket).toBeDefined();
        expect(bucket!.aggregated!.length).toBe(6);
        expect(bucket!.aggregated!.map((m) => m.name)).toEqual(
            Array.from({length: 6}, (_, i) => `tiny${i}`)
        );
        // The bucket spans the tiny run's combined width (6 × 1px).
        expect(bucket!.w).toBeCloseTo(6, 6);
        // big (94px) is drawn as a real frame; the tiny ones are not.
        expect(lay.rects.some((r) => r.node.name === "big")).toBe(true);
        expect(lay.rects.some((r) => r.node.name === "tiny3")).toBe(false);
    });

    it("truncates deeper stacks with a flag instead of overflowing", () => {
        let deep: FlameNode = {name: "leaf", cumulative: 0.0001};
        for (let i = 0; i < 20; i++) {
            deep = {name: `lvl${i}`, cumulative: 1, self: 0.01, children: [deep]};
        }
        const tree = buildFlameTree({tree: [deep]})!;
        const lay = layoutFlame(tree, {width: 400, maxDepth: 4});
        expect(lay.rows).toBe(4);
        expect(lay.truncated).toBe(true);
        expect(lay.rects.filter((r) => r.depth >= 4).length).toBe(0);
    });

    it("scales overflowing pseudo-trees down so sibling ratios survive", () => {
        // Parent cum 1 / self 0.5 → child budget = half the width; two
        // children of cum 0.4 each would sum 0.8 > 0.5 → scaled to 0.25.
        const tree = buildFlameTree({
            tree: [
                {
                    name: "p",
                    cumulative: 1,
                    self: 0.5,
                    children: [
                        {name: "a", cumulative: 0.4},
                        {name: "b", cumulative: 0.4},
                    ],
                },
            ],
        })!;
        const lay = layoutFlame(tree, {width: 200});
        const a = lay.rects.find((r) => r.node.name === "a")!;
        const b = lay.rects.find((r) => r.node.name === "b")!;
        expect(a.w).toBeCloseTo(50, 6); // (0.4/1)*200 scaled by 100/160
        expect(b.w).toBeCloseTo(50, 6);
        expect(a.w / b.w).toBeCloseTo(1, 9);
        // Both children sit inside the parent's child budget (100px).
        expect(a.x + a.w).toBeLessThanOrEqual(200);
    });

    it("handles an unknown zoomKey by falling back to the full view", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        const lay = layoutFlame(tree, {width: 200, zoomKey: "nope"});
        expect(lay.rects.find((r) => r.depth === 0)!.node.name).toBe("<script>");
        expect(lay.zoomKey).toBe("nope");
    });
});

describe("hitTestFlame", () => {
    const rects = [
        {key: "a", depth: 0, x: 0, w: 100, node: {name: "a", cumulative: 1}},
        {key: "b", depth: 1, x: 0, w: 60, node: {name: "b", cumulative: 0.6}},
        {key: "c", depth: 1, x: 60, w: 40, node: {name: "c", cumulative: 0.4}},
    ];

    it("hits by depth and x", () => {
        expect(hitTestFlame(rects, 10, 0, 18)?.key).toBe("a");
        expect(hitTestFlame(rects, 70, 18, 18)?.key).toBe("c");
        expect(hitTestFlame(rects, 5, 18, 18)?.key).toBe("b");
    });

    it("misses outside every rect", () => {
        expect(hitTestFlame(rects, 10, 100, 18)).toBeNull();
        expect(hitTestFlame(rects, 10, 54, 18)).toBeNull();
    });
});

// ── colors + formatting ─────────────────────────────────────────────

describe("flameColorsFor", () => {
    it("is stable per module and distinct across modules", () => {
        expect(flameColorsFor("main.py")).toEqual(flameColorsFor("main.py"));
        expect(flameColorsFor("main.py")).not.toEqual(flameColorsFor("util.py"));
    });

    it("uses the warm palette (no blue hues) for real modules", () => {
        const hue = (hsl: string) => Number(/^hsl\((\d+),/.exec(hsl)?.[1] ?? -1);
        for (const m of ["a.py", "b.py", "z.py", "mod.py"]) {
            const h = hue(flameColorsFor(m).fill);
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThanOrEqual(80);
        }
    });

    it("grays out the synthetic and bucket modules", () => {
        expect(flameColorsFor("<script>").fill).not.toEqual(flameColorsFor("a.py").fill);
        expect(flameColorsFor("(other)").fill).toContain("6%");
    });
});

describe("formatSeconds / percentOf", () => {
    it("formats adaptively", () => {
        expect(formatSeconds(0)).toBe("0 s");
        expect(formatSeconds(1.23456)).toBe("1.235 s");
        expect(formatSeconds(0.012345)).toBe("12.35 ms");
        expect(formatSeconds(0.0001234)).toBe("123 µs");
        expect(formatSeconds(Number.NaN)).toBe("—");
    });
    it("computes percents with a zero-total guard", () => {
        expect(percentOf(0.05, 0.1)).toBe("50.0%");
        expect(percentOf(1, 0)).toBe("0.0%");
        expect(percentOf(Number.NaN, 1)).toBe("0.0%");
    });
});

describe("flamePathTo", () => {
    it("returns the inclusive root→node path for a known key", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        const print = [...tree.byKey.values()].find((e) => e.node.name === "print")!;
        const path = flamePathTo(tree, tree.keyOf(print.node));
        expect(path.map((n) => n.name)).toEqual([
            "<script>",
            "<module>",
            "main",
            "work",
            "print",
        ]);
    });
    it("returns [] for null/unknown keys", () => {
        const tree = buildFlameTree({rows: CHAIN_ROWS})!;
        expect(flamePathTo(tree, null)).toEqual([]);
        expect(flamePathTo(tree, "stale")).toEqual([]);
    });
});
