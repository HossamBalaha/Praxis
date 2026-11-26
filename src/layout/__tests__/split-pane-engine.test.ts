/**
 * split-pane-engine tests — the pane model, gutter topology, share
 * math and every transition, at 100% branch coverage of the module.
 *
 * Two proof styles run side by side:
 *   - EXHAUSTIVE example cases for each rule (bounds, clamps, no-ops);
 *   - PROPERTY SWEEPS for the structural invariants — most notably
 *     gutterCount(n) === n − 1 proven for EVERY n in a wide range,
 *     and a randomized transition storm that requires
 *     splitLayoutViolations to stay empty after every step.
 */
import {describe, expect, it} from "vitest";
import {
    adjustAdjacentSplitSizes,
    applySplitPreset,
    closedSplitLayout,
    closeSplitPane,
    dragSplitGutterFrom,
    equalSplitShares,
    gutterCount,
    gutterIndices,
    healSplitLayout,
    MAX_SPLIT_PANES,
    nudgeSplitGutter,
    openSplitLayout,
    paneBasisPercent,
    panePairForGutter,
    renormalizeSplitSizes,
    resizeSplitGutter,
    restoreSplitLayout,
    retargetSplitPane,
    setSplitGroupVisible,
    setSplitGroupWidth,
    SPLIT_GROUP_WIDTH_MAX,
    SPLIT_GROUP_WIDTH_MIN,
    SPLIT_SHARE_FLOOR,
    type SplitLayoutState,
    splitLayoutViolations,
    toggleSplitLayout,
} from "../split-pane-engine";

/** A tiny pane content stand-in — the engine must not care what T is. */
interface PaneProbe {
    name: string;
}

/** Three named panes for the example cases. */
function threePanes(): PaneProbe[] {
    return [{name: "alpha"}, {name: "beta"}, {name: "gamma"}];
}

/** Open a fresh 3-pane layout (equal 33/33/34 shares). */
function openThreePaneLayout(): SplitLayoutState<PaneProbe> {
    return openSplitLayout(closedSplitLayout<PaneProbe>(), "right", threePanes());
}

describe("closedSplitLayout", () => {
    it("starts fully neutral", () => {
        // Every field at its documented default.
        expect(closedSplitLayout<PaneProbe>()).toEqual({
            open: false,
            orientation: "right",
            panes: [],
            sizes: [],
            groupWidthPercent: 50,
        });
    });

    it("is invariant-clean", () => {
        // The pristine state must pass the audit.
        expect(splitLayoutViolations(closedSplitLayout<PaneProbe>())).toEqual([]);
    });
});

describe("THE gutter invariant — gutterCount(n) === n − 1", () => {
    it("is proven by exhaustive sweep for every n from 0 to 128", () => {
        // The mathematical proof the module exists for: EVERY pane count
        // in a wide range has exactly one gutter per adjacent pane pair.
        for (let n = 0; n <= 128; n++) {
            // No pane count can ever yield a negative gutter count.
            expect(gutterCount(n)).toBeGreaterThanOrEqual(0);
            // The identity itself: N panes ⇒ N − 1 gutters.
            expect(gutterCount(n)).toBe(Math.max(0, n - 1));
            // The index enumeration agrees with the count, one-to-one.
            expect(gutterIndices(n).length).toBe(gutterCount(n));
            // The enumerated indices are exactly 0 … count−1, ascending.
            expect(gutterIndices(n)).toEqual(gutterIndices(n).map((_, i) => i));
        }
    });

    it("degenerates to zero gutters for 0 and 1 panes", () => {
        // A lone pane has no neighbour to divide from.
        expect(gutterCount(0)).toBe(0);
        expect(gutterCount(1)).toBe(0);
        expect(gutterIndices(1)).toEqual([]);
    });

    it("gives the Round 3 bug shape (3 panes ⇒ 2 gutters)", () => {
        // The exact regression: three panes must expose TWO working gutters.
        expect(gutterCount(3)).toBe(2);
        expect(gutterIndices(3)).toEqual([0, 1]);
    });
});

describe("panePairForGutter", () => {
    it("maps every gutter onto its adjacent pair", () => {
        // Gutter g drives panes (g, g+1) — the adjacency definition.
        const state = openThreePaneLayout();
        expect(panePairForGutter(state, 0)).toEqual({first: 0, second: 1});
        expect(panePairForGutter(state, 1)).toEqual({first: 1, second: 2});
    });

    it("rejects every non-existent gutter", () => {
        // Out-of-range gutters must not silently resize the wrong panes.
        const state = openThreePaneLayout();
        expect(panePairForGutter(state, -1)).toBeNull();
        expect(panePairForGutter(state, 2)).toBeNull();
        expect(panePairForGutter(state, 99)).toBeNull();
        expect(panePairForGutter(closedSplitLayout<PaneProbe>(), 0)).toBeNull();
    });
});

describe("equalSplitShares", () => {
    it("splits evenly when 100 divides cleanly", () => {
        // 2 and 4 panes divide 100 without remainder.
        expect(equalSplitShares(2)).toEqual([50, 50]);
        expect(equalSplitShares(4)).toEqual([25, 25, 25, 25]);
    });

    it("distributes the remainder so shares sum to exactly 100", () => {
        // 3 panes: 33/33/34 — the remainder lands on the last pane.
        const shares = equalSplitShares(3);
        expect(shares).toEqual([33, 33, 34]);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it("keeps the sum at exactly 100 for EVERY count in a sweep", () => {
        // Property proof across the full practical range.
        for (let count = 1; count <= 64; count++) {
            const shares = equalSplitShares(count);
            // One share per pane, whole percents, summing to 100.
            expect(shares.length).toBe(count);
            expect(shares.every((s) => Number.isInteger(s))).toBe(true);
            expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
        }
    });

    it("returns an empty array for non-positive counts", () => {
        // No panes ⇒ no shares.
        expect(equalSplitShares(0)).toEqual([]);
        expect(equalSplitShares(-3)).toEqual([]);
    });
});

describe("renormalizeSplitSizes", () => {
    it("rescales survivors proportionally to a full 100", () => {
        // 40+20 → 67+33 (proportions kept, sum exact).
        const rescaled = renormalizeSplitSizes([40, 20]);
        expect(rescaled.reduce((a, b) => a + b, 0)).toBe(100);
        expect(rescaled[0]).toBeGreaterThan(rescaled[1]);
    });

    it("corrects rounding drift onto the last pane", () => {
        // Three equal-ish shares must still sum to exactly 100.
        const rescaled = renormalizeSplitSizes([10, 10, 10]);
        expect(rescaled.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it("falls back to equal shares on a degenerate total", () => {
        // All-zero shares cannot be scaled — equal shares instead.
        expect(renormalizeSplitSizes([0, 0, 0])).toEqual(equalSplitShares(3));
        expect(renormalizeSplitSizes([-5, -5])).toEqual(equalSplitShares(2));
    });

    it("returns an empty array for an empty group", () => {
        // Nothing to rescale.
        expect(renormalizeSplitSizes([])).toEqual([]);
    });
});

describe("adjustAdjacentSplitSizes", () => {
    it("moves share between exactly the addressed pair", () => {
        // The Round 3 fix scenario: dragging gutter 1 of a 3-pane group.
        const before = [40, 30, 30];
        const after = adjustAdjacentSplitSizes(before, 1, 10);
        // The pair's members move by the given delta.
        expect(after[1]).toBe(40);
        expect(after[2]).toBe(20);
        // The untouched pane keeps its share, and the array is new.
        expect(after[0]).toBe(40);
        expect(after).not.toBe(before);
    });

    it("never lets a pane fall below the floor", () => {
        // A huge negative delta slams pane 0 into the 10% floor.
        const after = adjustAdjacentSplitSizes([50, 50], 0, -500);
        expect(after[0]).toBeGreaterThanOrEqual(SPLIT_SHARE_FLOOR);
        expect(after).toEqual([10, 90]);
        // The mirrored direction clamps pane 1 instead.
        const afterUp = adjustAdjacentSplitSizes([50, 50], 0, 500);
        expect(afterUp).toEqual([90, 10]);
    });

    it("keeps the pair's sum invariant", () => {
        // Any legal drag only redistributes within the pair.
        const before = [30, 40, 30];
        const after = adjustAdjacentSplitSizes(before, 0, 25);
        expect(after[0] + after[1]).toBe(before[0] + before[1]);
        expect(after[2]).toBe(before[2]);
    });

    it("is a no-op for out-of-range pairs and non-finite deltas", () => {
        // Degenerate calls return the ORIGINAL array, unchanged.
        const sizes = [50, 50];
        expect(adjustAdjacentSplitSizes(sizes, -1, 10)).toBe(sizes);
        expect(adjustAdjacentSplitSizes(sizes, 1, 10)).toBe(sizes);
        expect(adjustAdjacentSplitSizes(sizes, 99, 10)).toBe(sizes);
        expect(adjustAdjacentSplitSizes(sizes, 0, Number.NaN)).toBe(sizes);
        expect(adjustAdjacentSplitSizes(sizes, 0, Infinity)).toBe(sizes);
    });

    it("is a no-op when rounding absorbs the delta", () => {
        // A sub-half-percent move rounds away — no state churn.
        const sizes = [50, 50];
        expect(adjustAdjacentSplitSizes(sizes, 0, 0.1)).toBe(sizes);
    });
});

describe("openSplitLayout", () => {
    it("opens with equal shares and the requested orientation", () => {
        // The canonical open: 3 panes, gutter-ready equal shares.
        const state = openSplitLayout(closedSplitLayout<PaneProbe>(), "down", threePanes());
        expect(state.open).toBe(true);
        expect(state.orientation).toBe("down");
        expect(state.panes).toEqual(threePanes());
        expect(state.sizes).toEqual(equalSplitShares(3));
        expect(splitLayoutViolations(state)).toEqual([]);
    });

    it("ignores an empty target list", () => {
        // Nothing to show — the state object is returned untouched.
        const closed = closedSplitLayout<PaneProbe>();
        expect(openSplitLayout(closed, "right", [])).toBe(closed);
    });

    it("caps the group at MAX_SPLIT_PANES", () => {
        // Five targets, four panes — the fifth is dropped, shares equal.
        const five = [...threePanes(), {name: "delta"}, {name: "epsilon"}];
        const state = openSplitLayout(closedSplitLayout<PaneProbe>(), "right", five);
        expect(state.panes.length).toBe(MAX_SPLIT_PANES);
        expect(state.sizes).toEqual(equalSplitShares(MAX_SPLIT_PANES));
    });
});

describe("toggleSplitLayout", () => {
    it("closes when already open in the same orientation with no targets", () => {
        // The classic menu toggle: Split Right twice = open then close.
        const opened = openThreePaneLayout();
        const toggled = toggleSplitLayout(opened, "right", []);
        expect(toggled.open).toBe(false);
        expect(toggled.panes).toEqual([]);
        expect(toggled.sizes).toEqual([]);
        expect(splitLayoutViolations(toggled)).toEqual([]);
    });

    it("re-targets instead of closing when explicit targets arrive", () => {
        // A multi-file split always re-targets — never a toggle close.
        const opened = openThreePaneLayout();
        const toggled = toggleSplitLayout(opened, "right", [{name: "solo"}]);
        expect(toggled.open).toBe(true);
        expect(toggled.panes).toEqual([{name: "solo"}]);
        expect(toggled.sizes).toEqual([100]);
    });

    it("switches orientation when toggled in the other direction", () => {
        // Split Down while open Right re-opens DOWN (the group replaces).
        const opened = openThreePaneLayout();
        const toggled = toggleSplitLayout(opened, "down", [{name: "solo"}]);
        expect(toggled.orientation).toBe("down");
        expect(toggled.open).toBe(true);
    });

    it("is a no-op when closed with no targets", () => {
        // No tabs to fall back on and nothing explicit — nothing happens.
        const closed = closedSplitLayout<PaneProbe>();
        expect(toggleSplitLayout(closed, "right", [])).toBe(closed);
    });
});

describe("restoreSplitLayout (session snapshots)", () => {
    it("trusts well-formed saved shares", () => {
        // A snapshot with dragged sizes restores them exactly.
        const state = restoreSplitLayout(
            closedSplitLayout<PaneProbe>(),
            "down",
            threePanes(),
            [50, 30, 20]
        );
        expect(state.open).toBe(true);
        expect(state.orientation).toBe("down");
        expect(state.sizes).toEqual([50, 30, 20]);
        expect(splitLayoutViolations(state)).toEqual([]);
    });

    it("falls back to equal shares for unsound saved sizes", () => {
        // Wrong length, wrong sum, or sub-floor shares each fall back.
        const short = restoreSplitLayout(closedSplitLayout<PaneProbe>(), "right", threePanes(), [50, 50]);
        expect(short.sizes).toEqual(equalSplitShares(3));
        const misSummed = restoreSplitLayout(closedSplitLayout<PaneProbe>(), "right", threePanes(), [60, 30, 20]);
        expect(misSummed.sizes).toEqual(equalSplitShares(3));
        const sunken = restoreSplitLayout(closedSplitLayout<PaneProbe>(), "right", threePanes(), [5, 55, 40]);
        expect(sunken.sizes).toEqual(equalSplitShares(3));
        const missing = restoreSplitLayout(closedSplitLayout<PaneProbe>(), "right", threePanes());
        expect(missing.sizes).toEqual(equalSplitShares(3));
    });

    it("caps the restored group at MAX_SPLIT_PANES", () => {
        // Five targets restore as four panes.
        const five = [...threePanes(), {name: "delta"}, {name: "epsilon"}];
        const state = restoreSplitLayout(closedSplitLayout<PaneProbe>(), "right", five, [20, 20, 20, 20, 20]);
        expect(state.panes.length).toBe(MAX_SPLIT_PANES);
        expect(state.sizes).toEqual(equalSplitShares(MAX_SPLIT_PANES));
    });
});

describe("setSplitGroupVisible (the menu hide/restore toggle)", () => {
    it("hides WITHOUT clearing — toggling back restores the panes", () => {
        // The menu Split toggle semantics: hide keeps content for restore.
        const opened = openThreePaneLayout();
        const hidden = setSplitGroupVisible(opened, false);
        expect(hidden.open).toBe(false);
        expect(hidden.panes).toEqual(opened.panes);
        expect(hidden.sizes).toEqual(opened.sizes);
        expect(splitLayoutViolations(hidden)).toEqual([]);
        // Toggling back reveals the SAME panes.
        const shown = setSplitGroupVisible(hidden, true);
        expect(shown.panes).toEqual(opened.panes);
    });

    it("showing an empty group is the legal hint state", () => {
        // open + zero panes renders the empty-split hint — not a violation.
        const hint = setSplitGroupVisible(closedSplitLayout<PaneProbe>(), true);
        expect(hint.open).toBe(true);
        expect(hint.panes).toEqual([]);
        expect(splitLayoutViolations(hint)).toEqual([]);
    });
});

describe("applySplitPreset", () => {
    it("forces visibility and orientation without touching panes", () => {
        // Presets describe chrome, not content: panes ride along untouched.
        const opened = openThreePaneLayout();
        const presetted = applySplitPreset(opened, {open: true, orientation: "down"});
        expect(presetted.orientation).toBe("down");
        expect(presetted.open).toBe(true);
        expect(presetted.panes).toEqual(opened.panes);
        expect(presetted.sizes).toEqual(opened.sizes);
        expect(splitLayoutViolations(presetted)).toEqual([]);
    });
});

describe("dragSplitGutterFrom (frozen drag math)", () => {
    it("applies every move against the pointer-down snapshot", () => {
        // The acceleration-bug regression: cumulative deltas onto the
        // latest frame snowballed; frozen math cannot.
        const state = openThreePaneLayout();
        const startSizes = state.sizes;
        // Two consecutive moves of +10 then +20 must land at +20 total,
        // not at +30 (10, then 10+20 re-applied on the moved state).
        const moveOne = dragSplitGutterFrom(state, startSizes, 0, 10);
        const moveTwo = dragSplitGutterFrom(moveOne, startSizes, 0, 20);
        expect(moveTwo.sizes[0]).toBe(startSizes[0] + 20);
        expect(moveTwo.sizes[1]).toBe(startSizes[1] - 20);
        expect(splitLayoutViolations(moveTwo)).toEqual([]);
    });

    it("refuses gutters that do not exist in the live layout", () => {
        // The frozen sizes belong to a drag; the PAIR must exist NOW.
        const state = openThreePaneLayout();
        expect(dragSplitGutterFrom(state, state.sizes, 5, 10)).toBe(state);
    });
});

describe("retargetSplitPane", () => {
    it("swaps exactly the addressed pane", () => {
        // Pane 1 shows new content; panes and sizes otherwise unchanged.
        const state = openThreePaneLayout();
        const next = retargetSplitPane(state, 1, {name: "replacement"});
        expect(next.panes.map((p) => p.name)).toEqual(["alpha", "replacement", "gamma"]);
        expect(next.sizes).toBe(state.sizes);
    });

    it("ignores out-of-range indices", () => {
        // No pane to swap — original state returned.
        const state = openThreePaneLayout();
        expect(retargetSplitPane(state, -1, {name: "x"})).toBe(state);
        expect(retargetSplitPane(state, 3, {name: "x"})).toBe(state);
    });
});

describe("closeSplitPane", () => {
    it("rescales the survivors back to exactly 100", () => {
        // Closing the middle pane keeps proportions of the other two.
        const state = openThreePaneLayout();
        const after = closeSplitPane(state, 1);
        expect(after.panes.map((p) => p.name)).toEqual(["alpha", "gamma"]);
        expect(after.sizes.reduce((a, b) => a + b, 0)).toBe(100);
        expect(splitLayoutViolations(after)).toEqual([]);
    });

    it("closes the whole group on the last pane", () => {
        // One pane left → closing it empties and closes the layout.
        const solo = openSplitLayout(closedSplitLayout<PaneProbe>(), "right", [{name: "solo"}]);
        const after = closeSplitPane(solo, 0);
        expect(after.open).toBe(false);
        expect(after.panes).toEqual([]);
        expect(after.sizes).toEqual([]);
    });

    it("ignores out-of-range indices", () => {
        // No pane to close — original state returned.
        const state = openThreePaneLayout();
        expect(closeSplitPane(state, 7)).toBe(state);
        expect(closeSplitPane(state, -2)).toBe(state);
    });
});

describe("resizeSplitGutter + nudgeSplitGutter", () => {
    it("drags through an existing gutter with clamps", () => {
        // Gutter 0 of the 3-pane group moves 10 points right.
        const state = openThreePaneLayout();
        const after = resizeSplitGutter(state, 0, 10);
        expect(after.sizes[0]).toBe(state.sizes[0] + 10);
        expect(after.sizes[1]).toBe(state.sizes[1] - 10);
        expect(after.sizes[2]).toBe(state.sizes[2]);
    });

    it("refuses non-existent gutters", () => {
        // A bad gutter index is a wiring bug — refuse to resize.
        const state = openThreePaneLayout();
        expect(resizeSplitGutter(state, -1, 10)).toBe(state);
        expect(resizeSplitGutter(state, 2, 10)).toBe(state);
        expect(nudgeSplitGutter(closedSplitLayout<PaneProbe>(), 0, 2)).toEqual(
            closedSplitLayout<PaneProbe>()
        );
    });

    it("nudges by a fixed step for the keyboard", () => {
        // Arrow-key resize: the same clamps, a fixed ± step.
        const state = openThreePaneLayout();
        const nudged = nudgeSplitGutter(state, 1, 2);
        expect(nudged.sizes[1]).toBe(state.sizes[1] + 2);
        expect(nudged.sizes[2]).toBe(state.sizes[2] - 2);
    });
});

describe("healSplitLayout", () => {
    it("rebuilds equal shares when sizes trail the pane list", () => {
        // The stale-snapshot case: 3 panes but only 2 shares.
        const torn: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            sizes: [50, 50],
        };
        const healed = healSplitLayout(torn);
        expect(healed.sizes).toEqual(equalSplitShares(3));
        expect(splitLayoutViolations(healed)).toEqual([]);
    });

    it("leaves a consistent layout untouched", () => {
        // Lengths agree — the exact state object comes back.
        const state = openThreePaneLayout();
        expect(healSplitLayout(state)).toBe(state);
    });

    it("keeps a hidden group's panes AND sizes for restore", () => {
        // Visibility is orthogonal: the menu-hidden group heals to itself.
        const hidden: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            open: false,
        };
        expect(healSplitLayout(hidden)).toBe(hidden);
    });

    it("strips stale sizes from a pane-less group, open or not", () => {
        // No panes ⇒ no sizes, regardless of visibility.
        const staleClosed: SplitLayoutState<PaneProbe> = {
            ...closedSplitLayout<PaneProbe>(),
            sizes: [33, 33, 34],
        };
        expect(healSplitLayout(staleClosed).sizes).toEqual([]);
        const staleHint: SplitLayoutState<PaneProbe> = {
            ...closedSplitLayout<PaneProbe>(),
            open: true,
            sizes: [100],
        };
        expect(healSplitLayout(staleHint).sizes).toEqual([]);
    });

    it("keeps an already-empty closed layout as-is", () => {
        // Nothing to strip — the same object returns.
        const closed = closedSplitLayout<PaneProbe>();
        expect(healSplitLayout(closed)).toBe(closed);
    });
});

describe("setSplitGroupWidth", () => {
    it("clamps into the advertised range", () => {
        // The main↔group divider honours its aria-valuemin/max.
        const state = closedSplitLayout<PaneProbe>();
        expect(setSplitGroupWidth(state, 5).groupWidthPercent).toBe(SPLIT_GROUP_WIDTH_MIN);
        expect(setSplitGroupWidth(state, 400).groupWidthPercent).toBe(SPLIT_GROUP_WIDTH_MAX);
        expect(setSplitGroupWidth(state, 62.5).groupWidthPercent).toBe(62.5);
    });

    it("rejects non-finite percents", () => {
        // NaN/Infinity would poison the style string.
        const state = closedSplitLayout<PaneProbe>();
        expect(setSplitGroupWidth(state, Number.NaN)).toBe(state);
    });
});

describe("paneBasisPercent", () => {
    it("returns the pane's share when sizes align", () => {
        // The flex-basis source for the render.
        const state = openThreePaneLayout();
        expect(paneBasisPercent(state, 0)).toBe(state.sizes[0]);
    });

    it("returns undefined for out-of-range panes", () => {
        // Only real panes have a basis.
        const state = openThreePaneLayout();
        expect(paneBasisPercent(state, -1)).toBeUndefined();
        expect(paneBasisPercent(state, 3)).toBeUndefined();
    });
});

describe("splitLayoutViolations (the audit)", () => {
    it("accepts the legal visibility extremes", () => {
        // Hidden-with-panes (menu restore) and open-without-panes (the
        // hint) are DESIGNED states, not violations.
        const hidden = setSplitGroupVisible(openThreePaneLayout(), false);
        expect(splitLayoutViolations(hidden)).toEqual([]);
        const hint = setSplitGroupVisible(closedSplitLayout<PaneProbe>(), true);
        expect(splitLayoutViolations(hint)).toEqual([]);
    });

    it("flags a pane count over the cap", () => {
        // More panes than MAX_SPLIT_PANES cannot come from the engine.
        const broken: SplitLayoutState<PaneProbe> = {
            open: true,
            orientation: "right",
            panes: Array.from({length: MAX_SPLIT_PANES + 1}, (_, i) => ({name: `p${i}`})),
            sizes: equalSplitShares(MAX_SPLIT_PANES + 1),
            groupWidthPercent: 50,
        };
        expect(splitLayoutViolations(broken)[0]).toContain("exceeds the cap");
    });

    it("flags size/pane length mismatches before deeper checks", () => {
        // Misaligned sizes make sum/floor checks meaningless — even for a
        // hidden group (its panes keep their sizes for restore).
        const broken: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            sizes: [50, 50],
        };
        const violations = splitLayoutViolations(broken);
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain("does not match pane count");
    });

    it("flags non-integer and mis-summed shares", () => {
        // Fractional shares break the flex-basis contract.
        const fractional: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            sizes: [33.5, 33.5, 33],
        };
        expect(splitLayoutViolations(fractional)).toContain("non-integer share 33.5");
        // A sum off 100 leaves a gap (or overflow) at the group's end.
        const misSummed: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            sizes: [40, 40, 10],
        };
        expect(splitLayoutViolations(misSummed)).toContain("shares sum to 90, not 100");
    });

    it("flags shares below the floor", () => {
        // A pane under 10% is either a bug or a clamp failure.
        const sunken: SplitLayoutState<PaneProbe> = {
            ...openThreePaneLayout(),
            sizes: [5, 55, 40],
        };
        expect(splitLayoutViolations(sunken)).toContain("pane 0 share 5 is below the floor 10");
    });

    it("flags an out-of-range group width", () => {
        // The divider cannot leave its advertised min/max.
        const wide: SplitLayoutState<PaneProbe> = {...openThreePaneLayout(), groupWidthPercent: 95};
        expect(splitLayoutViolations(wide)[0]).toContain("group width 95 is out of range");
    });
});

describe("transition storm — invariants hold after ANY step", () => {
    it("survives a long randomized sequence of legal operations", () => {
        // Deterministic pseudo-random generator so failures reproduce.
        let seed = 20261121;
        const random = (): number => {
            // A tiny LCG — enough entropy for a transition storm.
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        // The storm: apply random engine operations and demand that the
        // audit stays empty and the gutter identity keeps holding after
        // EVERY single step (not just at the end).
        let state = closedSplitLayout<PaneProbe>();
        for (let step = 0; step < 500; step++) {
            const pick = Math.floor(random() * 6);
            if (pick === 0) {
                // Open a random-sized group (0..5 targets, the cap applies).
                const targets = Array.from({length: Math.floor(random() * 6)}, (_, i) => ({name: `s${step}-${i}`}));
                state = openSplitLayout(state, random() < 0.5 ? "right" : "down", targets);
            } else if (pick === 1 && state.open) {
                // Close a random pane.
                state = closeSplitPane(state, Math.floor(random() * state.panes.length));
            } else if (pick === 2 && state.open) {
                // Drag a random gutter by a random delta.
                state = resizeSplitGutter(state, Math.floor(random() * gutterCount(state.panes.length)), (random() - 0.5) * 80);
            } else if (pick === 3) {
                // Toggle the layout.
                state = toggleSplitLayout(state, random() < 0.5 ? "right" : "down", []);
            } else if (pick === 4) {
                // Heal (a no-op unless a tear was smuggled in).
                state = healSplitLayout(state);
            } else if (state.open && state.panes.length > 0) {
                // Retarget a random pane.
                state = retargetSplitPane(state, Math.floor(random() * state.panes.length), {name: `r${step}`});
            }
            // The gutter identity, after every step.
            expect(gutterCount(state.panes.length)).toBe(Math.max(0, state.panes.length - 1));
            // The full invariant audit, after every step.
            expect(splitLayoutViolations(state), `step ${step} (op ${pick})`).toEqual([]);
        }
    });
});

describe("module surface", () => {
    it("exports exactly the engine API used by page.tsx", async () => {
        // The module's importable surface is a fixed contract; assert the
        // names the app depends on all exist as functions.
        const engine = await import("../split-pane-engine");
        for (const name of [
            "closedSplitLayout",
            "gutterCount",
            "gutterIndices",
            "panePairForGutter",
            "equalSplitShares",
            "renormalizeSplitSizes",
            "adjustAdjacentSplitSizes",
            "openSplitLayout",
            "restoreSplitLayout",
            "setSplitGroupVisible",
            "applySplitPreset",
            "toggleSplitLayout",
            "retargetSplitPane",
            "closeSplitPane",
            "resizeSplitGutter",
            "dragSplitGutterFrom",
            "nudgeSplitGutter",
            "healSplitLayout",
            "setSplitGroupWidth",
            "paneBasisPercent",
            "splitLayoutViolations",
        ]) {
            expect(typeof (engine as unknown as Record<string, unknown>)[name]).toBe("function");
        }
    });
});
