/**
 * split-pane-engine — the pure model behind the split editor.
 *
 * OWNERSHIP (Phase 2 extraction): everything geometric about the split
 * layout lives HERE — the pane model, the gutter topology, the share
 * math and every open/close/retarget/resize transition — as PURE
 * functions over a plain `SplitLayoutState<T>`. `page.tsx` keeps only
 * React glue: it holds the state object, feeds user intent (drag
 * deltas, close clicks, split events) through these transitions, and
 * renders the result. The engine never imports React, the DOM, or any
 * component, so every rule below is unit-testable in isolation
 * (src/layout/__tests__/split-pane-engine.test.ts).
 *
 * THE GUTTER INVARIANT (the Round 3 bug this module exists to protect):
 * a group of N panes has EXACTLY N − 1 gutters, one between every
 * ADJACENT pair — gutter g sits between pane g and pane g + 1. The old
 * bug rendered a decorative divider for panes 2..n with no pointer
 * wiring; `gutterCount` / `gutterIndices` / `panePairForGutter` make
 * the correct topology the only expressible one, and the test suite
 * proves it mathematically for every pane count.
 *
 * THE SHARE INVARIANTS: `sizes` has one entry per pane, whole
 * percents, summing to exactly 100 whenever panes exist; every pane
 * keeps at least `SPLIT_SHARE_FLOOR` percent when its pair can afford
 * it; and a gutter drag redistributes width ONLY within its own pair
 * (the sum of every other pane is untouched).
 *
 * VISIBILITY IS ORTHOGONAL TO CONTENT, deliberately: the menu Split
 * toggle HIDES the group without clearing it (toggling back restores
 * the same panes), and an open group may legitimately hold ZERO panes
 * (the empty-split hint). `splitLayoutViolations` encodes exactly this
 * contract and the tests exercise it over every transition.
 */

/** Orientation of the pane group relative to the main editor. */
export type SplitOrientation = "right" | "down";

/** The smallest share ONE pane may keep, in percent of the group. */
export const SPLIT_SHARE_FLOOR = 10;

/** The most panes one group may hold (the UI caps multi-splits here). */
export const MAX_SPLIT_PANES = 4;

/** The smallest width of the whole pane GROUP vs the main editor, percent. */
export const SPLIT_GROUP_WIDTH_MIN = 10;

/** The largest width of the whole pane GROUP vs the main editor, percent. */
export const SPLIT_GROUP_WIDTH_MAX = 90;

/** The group's default share of the main editor row/column, percent. */
export const SPLIT_GROUP_WIDTH_DEFAULT = 50;

/**
 * The complete split layout — one immutable snapshot.
 *
 * Generic over the pane CONTENT (`T`): the engine only ever counts and
 * positions panes; what a pane SHOWS (file targets in Praxis) is the
 * caller's business. `groupWidthPercent` is the main-editor ↔ group
 * divider position, kept here so ALL resize math has one home.
 */
export interface SplitLayoutState<T> {
    /** Whether the pane group is mounted at all. */
    open: boolean;
    /** Which way the group stacks beside/below the main editor. */
    orientation: SplitOrientation;
    /** The panes, left-to-right (right) or top-to-bottom (down). */
    panes: T[];
    /** Each pane's share of the group, in whole percents (sums to 100). */
    sizes: number[];
    /** The group's own width (right) or height (down) vs the main editor, percent. */
    groupWidthPercent: number;
}

/** A fresh, closed layout — the initial and fully-reset state. */
export function closedSplitLayout<T>(): SplitLayoutState<T> {
    // Every field at its neutral default: no panes, no shares, group at half.
    return {
        open: false,
        orientation: "right",
        panes: [],
        sizes: [],
        groupWidthPercent: SPLIT_GROUP_WIDTH_DEFAULT,
    };
}

/* ─── GUTTER TOPOLOGY ──────────────────────────────────────────── */

/**
 * How many resize gutters a group of `paneCount` panes has.
 *
 * THE invariant: N panes ⇒ N − 1 gutters (a lone pane group has none;
 * a degenerate non-positive count has none either).
 */
export function gutterCount(paneCount: number): number {
    // A group needs at least two panes before a divider can exist.
    return Math.max(0, paneCount - 1);
}

/**
 * The gutter indices of a group — `[0 … paneCount − 2]`.
 *
 * Gutter `g` sits between pane `g` and pane `g + 1`; the render loop
 * maps over THIS so the painted separators and the resize handlers can
 * never disagree about how many gutters exist.
 */
export function gutterIndices(paneCount: number): number[] {
    // Enumerate exactly gutterCount indices from 0 upward.
    const count = gutterCount(paneCount);
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
        indices.push(i);
    }
    return indices;
}

/**
 * The adjacent pane pair a gutter controls.
 *
 * Returns `{ first, second }` for a valid gutter index of this layout,
 * or null when the index does not exist — callers use the null case to
 * detect wiring mistakes instead of resizing the wrong panes.
 */
export function panePairForGutter<T>(
    state: SplitLayoutState<T>,
    gutterIndex: number
): { first: number; second: number } | null {
    // A gutter needs both neighbours to exist inside the CURRENT pane list.
    if (gutterIndex < 0 || gutterIndex + 1 >= state.panes.length) {
        return null;
    }
    // Gutter g drives panes (g, g + 1) — the adjacency definition.
    return {first: gutterIndex, second: gutterIndex + 1};
}

/* ─── SHARE MATH ───────────────────────────────────────────────── */

/** Equal per-pane shares (percent of the pane GROUP), for `count` panes.
 *
 * 100 is split evenly; any integer remainder is handed to the LAST
 * pane(s) so the shares always SUM to exactly 100 — flex-basis
 * percentages that undershoot leave a gap at the group's end. */
export function equalSplitShares(count: number): number[] {
    // Guard: a non-positive count yields an empty array (no panes).
    if (count <= 0) {
        return [];
    }
    // Whole-percent base share for every pane.
    const base = Math.floor(100 / count);
    // Remainder distributed one percent at a time from the LAST pane
    // backwards — the sum always lands on exactly 100.
    const remainder = 100 - base * count;
    const shares = new Array(count).fill(base) as number[];
    for (let i = 0; i < remainder; i++) {
        shares[count - 1 - (i % count)] += 1;
    }
    return shares;
}

/** Rescale shares to sum to exactly 100 (after a pane closes).
 *
 * Each share keeps its PROPORTION of the surviving total; an all-zero
 * (or degenerate) list falls back to equal shares so the group never
 * divides by zero. */
export function renormalizeSplitSizes(sizes: number[]): number[] {
    // An empty group has nothing to rescale.
    if (sizes.length === 0) {
        return [];
    }
    // Sum of the surviving shares.
    const total = sizes.reduce((acc, value) => acc + Math.max(0, value), 0);
    // Degenerate total (all zero / negatives) — equal shares instead.
    if (total <= 0) {
        return equalSplitShares(sizes.length);
    }
    // Scale each share by 100/total and round to integers.
    const scaled = sizes.map((value) => Math.round((Math.max(0, value) / total) * 100));
    // Fix rounding drift on the LAST pane so the sum is exactly 100.
    const drift = 100 - scaled.reduce((acc, value) => acc + value, 0);
    scaled[scaled.length - 1] += drift;
    return scaled;
}

/** Move `deltaPercent` of the group between panes `firstIndex` and
 * `firstIndex + 1`, keeping every other pane's share untouched.
 *
 * The PAIR's sum is invariant, both panes stay ≥ `SPLIT_SHARE_FLOOR`,
 * and a degenerate call (out-of-range index, non-finite delta) returns
 * the original array unchanged. Returns a NEW array — the caller's
 * state is never mutated. */
export function adjustAdjacentSplitSizes(
    sizes: number[],
    firstIndex: number,
    deltaPercent: number
): number[] {
    // Out-of-range pair — nothing to adjust.
    if (firstIndex < 0 || firstIndex + 1 >= sizes.length) {
        return sizes;
    }
    // A non-finite delta would poison the state — reject it.
    if (!Number.isFinite(deltaPercent)) {
        return sizes;
    }
    // Current shares of the two panes sharing this gutter.
    const first = Math.max(0, sizes[firstIndex]);
    const second = Math.max(0, sizes[firstIndex + 1]);
    // The pair's combined share — the drag only redistributes THIS.
    const pairSum = first + second;
    // The floor clamps: neither pane may go below the minimum share.
    const firstLow = Math.min(SPLIT_SHARE_FLOOR, pairSum / 2);
    const firstHigh = pairSum - firstLow;
    // The clamped next share for the FIRST pane of the pair.
    const nextFirst = Math.min(firstHigh, Math.max(firstLow, first + deltaPercent));
    // Round to whole percent so the flex-basis strings stay stable.
    const nextFirstRounded = Math.round(nextFirst);
    const nextSecondRounded = Math.round(pairSum - nextFirst);
    // No-op when the rounded values did not move — avoids a state churn
    // re-render on every pointermove frame.
    if (nextFirstRounded === Math.round(first) && nextSecondRounded === Math.round(second)) {
        return sizes;
    }
    // Copy the array, patch only the two entries of the pair.
    const next = sizes.slice();
    next[firstIndex] = nextFirstRounded;
    next[firstIndex + 1] = nextSecondRounded;
    return next;
}

/* ─── LAYOUT TRANSITIONS (pure state → state) ──────────────────── */

/**
 * Open (or re-target) the pane group with explicit pane contents.
 *
 * Panes beyond `MAX_SPLIT_PANES` are dropped, every pane opens with an
 * equal share, and the orientation switches to the requested one. An
 * empty target list is a no-op (nothing to show) — use
 * `setSplitGroupVisible` to reveal the empty-split hint state.
 */
export function openSplitLayout<T>(
    state: SplitLayoutState<T>,
    orientation: SplitOrientation,
    targets: T[]
): SplitLayoutState<T> {
    // Nothing to open — keep the state untouched.
    if (targets.length === 0) {
        return state;
    }
    // Cap the group size, then hand every pane an equal share.
    const panes = targets.slice(0, MAX_SPLIT_PANES);
    return {
        ...state,
        open: true,
        orientation,
        panes,
        sizes: equalSplitShares(panes.length),
    };
}

/**
 * Restore a session snapshot: open with explicit targets AND the
 * per-pane shares the user last dragged.
 *
 * `savedSizes` is only trusted when it lines up with the (capped)
 * target list, sums to exactly 100 and respects the floor — anything
 * else (an older snapshot, corruption) falls back to equal shares.
 */
export function restoreSplitLayout<T>(
    state: SplitLayoutState<T>,
    orientation: SplitOrientation,
    targets: T[],
    savedSizes?: number[]
): SplitLayoutState<T> {
    // Cap the group size first — the saved sizes must match the CAPPED list.
    const panes = targets.slice(0, MAX_SPLIT_PANES);
    // Trust the saved shares only when they are fully well-formed.
    const savedIsSound =
        !!savedSizes &&
        savedSizes.length === panes.length &&
        savedSizes.reduce((acc, value) => acc + value, 0) === 100 &&
        savedSizes.every((value) => value >= SPLIT_SHARE_FLOOR);
    // Equal shares are the recovery for anything unsound.
    const sizes = savedIsSound ? (savedSizes as number[]) : equalSplitShares(panes.length);
    return {...state, open: true, orientation, panes, sizes};
}

/**
 * Flip ONLY the group's visibility — panes and sizes ride along
 * untouched.
 *
 * This is the MENU Split toggle semantics: hiding the group must not
 * clear it, so toggling back restores the exact same panes; showing a
 * group that holds no panes renders the empty-split hint.
 */
export function setSplitGroupVisible<T>(
    state: SplitLayoutState<T>,
    visible: boolean
): SplitLayoutState<T> {
    // Pure visibility flip — nothing else moves.
    return {...state, open: visible};
}

/**
 * Layout-preset application: force the group's visibility and
 * orientation in one step without touching its panes.
 *
 * Presets (lib/layout-presets.ts) describe chrome around the editor,
 * not file contents — so they may re-orient or reveal an existing
 * group but never populate one.
 */
export function applySplitPreset<T>(
    state: SplitLayoutState<T>,
    preset: { open: boolean; orientation: SplitOrientation }
): SplitLayoutState<T> {
    // Force both preset-controlled fields in one immutable step.
    return {...state, open: preset.open, orientation: preset.orientation};
}

/**
 * The split-menu toggle: open with `targets`, re-target when already
 * open with explicit targets, and CLOSE when already open in the SAME
 * orientation with no explicit targets (the classic toggle). Closing
 * clears the group — this is the event-handler path, not the
 * hide/restore menu path.
 */
export function toggleSplitLayout<T>(
    state: SplitLayoutState<T>,
    orientation: SplitOrientation,
    targets: T[]
): SplitLayoutState<T> {
    // Already open in this orientation with no explicit targets → close.
    if (state.open && state.orientation === orientation && targets.length === 0) {
        return {...state, open: false, panes: [], sizes: []};
    }
    // Every other case is an open/re-target.
    return openSplitLayout(state, orientation, targets);
}

/** Swap the content ONE pane shows (its header picker). */
export function retargetSplitPane<T>(
    state: SplitLayoutState<T>,
    index: number,
    next: T
): SplitLayoutState<T> {
    // An out-of-range index has no pane to swap.
    if (index < 0 || index >= state.panes.length) {
        return state;
    }
    // Patch exactly the addressed pane; sizes are untouched by content.
    return {...state, panes: state.panes.map((p, i) => (i === index ? next : p))};
}

/** Close ONE pane; the last close empties (and closes) the whole group. */
export function closeSplitPane<T>(
    state: SplitLayoutState<T>,
    index: number
): SplitLayoutState<T> {
    // An out-of-range index has no pane to close.
    if (index < 0 || index >= state.panes.length) {
        return state;
    }
    // Drop the pane from the list.
    const panes = state.panes.filter((_, i) => i !== index);
    // The last pane's close empties the group entirely.
    if (panes.length === 0) {
        return {...state, open: false, panes: [], sizes: []};
    }
    // Survivors keep their PROPORTIONS, rescaled back to a full 100.
    const sizes = renormalizeSplitSizes(state.sizes.filter((_, i) => i !== index));
    return {...state, panes, sizes};
}

/** Drag a gutter: move `deltaPercent` between its adjacent pane pair. */
export function resizeSplitGutter<T>(
    state: SplitLayoutState<T>,
    gutterIndex: number,
    deltaPercent: number
): SplitLayoutState<T> {
    // Resize only through a gutter that exists in THIS layout.
    const pair = panePairForGutter(state, gutterIndex);
    if (!pair) {
        return state;
    }
    // The pure share math does the clamping; the state just carries it.
    return {...state, sizes: adjustAdjacentSplitSizes(state.sizes, pair.first, deltaPercent)};
}

/**
 * Drag continuation: resize gutter `gutterIndex` by `deltaPercent`
 * measured against FROZEN `startSizes` — the array captured at
 * pointer-down.
 *
 * Every pointermove recomputes from the SAME starting point; applying
 * the cumulative delta onto the latest-applied frame instead
 * re-applied it on top of the previous frame EVERY frame — the shares
 * accelerated and slammed into the floor within one small drag (the
 * Round 3 acceleration bug, now structurally impossible to express).
 */
export function dragSplitGutterFrom<T>(
    state: SplitLayoutState<T>,
    startSizes: number[],
    gutterIndex: number,
    deltaPercent: number
): SplitLayoutState<T> {
    // Resize only through a gutter that exists in THIS layout.
    const pair = panePairForGutter(state, gutterIndex);
    if (!pair) {
        return state;
    }
    // The frozen snapshot carries the drag math; the state just carries the result.
    return {...state, sizes: adjustAdjacentSplitSizes(startSizes, pair.first, deltaPercent)};
}

/** Keyboard nudge: step a gutter by `stepPercent` (positive grows the left/top pane). */
export function nudgeSplitGutter<T>(
    state: SplitLayoutState<T>,
    gutterIndex: number,
    stepPercent: number
): SplitLayoutState<T> {
    // A nudge is just a fixed-step resize through the same clamps.
    return resizeSplitGutter(state, gutterIndex, stepPercent);
}

/**
 * Self-heal the sizes array against the pane list.
 *
 * Whenever the two disagree in length (a stale session snapshot, a
 * partial toggle, a crash mid-update), rebuild equal shares so every
 * pane keeps a sane flex-basis and every gutter keeps valid math. A
 * group with NO panes always carries NO sizes — visibility is
 * irrelevant here (a hidden group may keep its panes for restore).
 */
export function healSplitLayout<T>(state: SplitLayoutState<T>): SplitLayoutState<T> {
    // A pane-less group carries no sizes by contract, open or not.
    if (state.panes.length === 0) {
        return state.sizes.length === 0 ? state : {...state, sizes: []};
    }
    // Sizes already match — nothing to heal.
    if (state.sizes.length === state.panes.length) {
        return state;
    }
    // Mismatch: equal shares are always a valid recovery.
    return {...state, sizes: equalSplitShares(state.panes.length)};
}

/** Clamp + set the main-editor ↔ group divider position, in percent. */
export function setSplitGroupWidth<T>(
    state: SplitLayoutState<T>,
    percent: number
): SplitLayoutState<T> {
    // A non-finite percent would poison the style string — reject it.
    if (!Number.isFinite(percent)) {
        return state;
    }
    // Clamp to the min/max the drag handle advertises (aria-valuemin/max).
    const clamped = Math.max(
        SPLIT_GROUP_WIDTH_MIN,
        Math.min(SPLIT_GROUP_WIDTH_MAX, percent)
    );
    return {...state, groupWidthPercent: clamped};
}

/** This pane's flex-basis percent — undefined only while sizes trail the pane list. */
export function paneBasisPercent<T>(
    state: SplitLayoutState<T>,
    paneIndex: number
): number | undefined {
    // Only addressable panes have a basis.
    if (paneIndex < 0 || paneIndex >= state.panes.length) {
        return undefined;
    }
    // The self-heal effect closes the length gap within one commit.
    return state.sizes[paneIndex];
}

/* ─── INVARIANT AUDIT ──────────────────────────────────────────── */

/**
 * Every violated invariant of `state`, as human-readable strings.
 *
 * An empty array means the layout is sound. The tests run this after
 * EVERY transition; the app may also call it in dev builds as a cheap
 * assertion. Checks:
 *   - sizes.length === panes.length (ALWAYS — hidden panes keep theirs);
 *   - when panes exist: pane count ≤ MAX_SPLIT_PANES, whole percents,
 *     sum exactly 100, every pane ≥ SPLIT_SHARE_FLOOR;
 *   - groupWidthPercent within [SPLIT_GROUP_WIDTH_MIN, SPLIT_GROUP_WIDTH_MAX].
 *
 * Visibility is deliberately NOT an invariant: an open group may hold
 * zero panes (the empty-split hint) and a hidden group may keep its
 * panes (the menu toggle's restore semantics).
 */
export function splitLayoutViolations<T>(state: SplitLayoutState<T>): string[] {
    // Collected violations — empty means sound.
    const violations: string[] = [];
    // Sizes must line up one-to-one with panes, whatever the visibility.
    if (state.sizes.length !== state.panes.length) {
        violations.push(
            `sizes length ${state.sizes.length} does not match pane count ${state.panes.length}`
        );
        // Share-sum and floor checks are meaningless without alignment.
        return violations;
    }
    // A pane-less group has nothing further to check (the hint state).
    if (state.panes.length === 0) {
        return violations;
    }
    // An existing group can hold at most MAX_SPLIT_PANES panes.
    if (state.panes.length > MAX_SPLIT_PANES) {
        violations.push(`pane count ${state.panes.length} exceeds the cap ${MAX_SPLIT_PANES}`);
    }
    // Whole percents only.
    for (const size of state.sizes) {
        if (!Number.isInteger(size)) {
            violations.push(`non-integer share ${size}`);
        }
    }
    // The shares must sum to exactly 100.
    const sum = state.sizes.reduce((acc, value) => acc + value, 0);
    if (sum !== 100) {
        violations.push(`shares sum to ${sum}, not 100`);
    }
    // Every pane keeps the floor: a pane may only dip below it when the
    // whole group is smaller than panes × floor (impossible within the
    // cap and the equal-share builder — so any dip is a bug).
    for (let i = 0; i < state.sizes.length; i++) {
        if (state.sizes[i] < SPLIT_SHARE_FLOOR) {
            violations.push(`pane ${i} share ${state.sizes[i]} is below the floor ${SPLIT_SHARE_FLOOR}`);
        }
    }
    // The group divider stays inside its advertised range.
    if (
        state.groupWidthPercent < SPLIT_GROUP_WIDTH_MIN ||
        state.groupWidthPercent > SPLIT_GROUP_WIDTH_MAX
    ) {
        violations.push(`group width ${state.groupWidthPercent} is out of range`);
    }
    return violations;
}
