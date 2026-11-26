# Architecture — Split Panes

The split-pane layout is governed by one pure engine: `src/layout/split-pane-engine.ts`
(538 lines). It imports **nothing** — no React, no DOM, no storage. Every rule below is
enforced by that module and proven by `src/layout/__tests__/split-pane-engine.test.ts`
(60 tests, 100% branch coverage). All persistence and drag-glue lives outside the engine,
in `src/app/page.tsx` and `src/lib/workspace-session.ts`; the view half of the contract
lives in `src/components/split-file-pane.tsx` ("the engine owns the pane MODEL, THIS
component is the pane VIEW").

This document is the full contract. The summary lives in
[ARCHITECTURE.md](../ARCHITECTURE.md) §2.1–2.2.

---

## State shape

```ts
// The orientation the pane group stacks in, relative to the main editor.
export type SplitOrientation = "right" | "down";

// The complete layout state. Generic over the pane content T.
export interface SplitLayoutState<T> {
  // Whether the pane group is mounted at all.
  open: boolean;
  // Which way the group stacks beside ("right") or below ("down") the main editor.
  orientation: SplitOrientation;
  // Panes left-to-right (right) or top-to-bottom (down), capped at MAX_SPLIT_PANES.
  panes: T[];
  // Each pane's share of the group, in whole percents, summing to exactly 100.
  sizes: number[];
  // The main-editor <-> group divider position, in percent of the editor row/column.
  groupWidthPercent: number;
}
```

Praxis instantiates `SplitLayoutState<SplitTarget>` in `page.tsx`, where each target is
an open-file reference (`folderSlug`, `fileSlug`, `fileName`, `folderName`).

### Exported constants

| Constant                    | Value | Meaning                                                                 |
|-----------------------------|-------|-------------------------------------------------------------------------|
| `SPLIT_SHARE_FLOOR`         | `10`  | The smallest share one pane may keep, in percent of the group.          |
| `MAX_SPLIT_PANES`           | `4`   | The most panes one group may hold; the UI caps multi-splits here.       |
| `SPLIT_GROUP_WIDTH_MIN`     | `10`  | The smallest width of the whole pane group vs the main editor, percent. |
| `SPLIT_GROUP_WIDTH_MAX`     | `90`  | The largest width of the whole pane group vs the main editor, percent.  |
| `SPLIT_GROUP_WIDTH_DEFAULT` | `50`  | The group's default share of the main editor row/column, percent.       |

### Exported functions (21)

| Function                                                               | Behavior and edge cases                                                                                                                                                                                                                                                                                          |
|------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `closedSplitLayout<T>()`                                               | The neutral default: `{open: false, orientation: "right", panes: [], sizes: [], groupWidthPercent: 50}`.                                                                                                                                                                                                         |
| `gutterCount(paneCount)`                                               | `Math.max(0, n − 1)`; degenerate non-positive counts return 0.                                                                                                                                                                                                                                                   |
| `gutterIndices(paneCount)`                                             | `[0 … n−2]`, exactly `gutterCount(n)` entries.                                                                                                                                                                                                                                                                   |
| `panePairForGutter<T>(state, gutterIndex)`                             | Returns `{first: g, second: g + 1}`; returns **`null`** when `g < 0                                                                                                                                                                                                                                              || g + 1 >= panes.length` — a wiring-mistake detector that refuses to guess. |
| `equalSplitShares(count)`                                              | `[]` for `n ≤ 0`; `base = floor(100 / n)`; the remainder is added 1% at a time from the LAST pane backwards, so the sum is exactly 100.                                                                                                                                                                          |
| `renormalizeSplitSizes(sizes)`                                         | `[]` for empty input; total = sum of clamped-non-negative values; a degenerate total falls back to `equalSplitShares`; otherwise each pane is rescaled to `round(v / total · 100)` with rounding drift fixed onto the last pane.                                                                                 |
| `adjustAdjacentSplitSizes(sizes, firstIndex, deltaPercent)`            | Pair-sum-invariant, floor-clamped, whole-percent redistribution. Returns the **original array reference** (identity no-op) when the pair index is out of range, the delta is non-finite, or rounding absorbs the delta — the no-op reference avoids a pointless re-render. Always returns a new array otherwise. |
| `openSplitLayout<T>(state, orientation, targets)`                      | Identity no-op for an empty target list; caps `targets.slice(0, MAX_SPLIT_PANES)`; assigns `equalSplitShares`; sets `open: true` and the orientation.                                                                                                                                                            |
| `restoreSplitLayout<T>(state, orientation, targets, savedSizes?)`      | Caps targets FIRST; trusts `savedSizes` only when its length equals the capped pane count, the sum is exactly 100, and every value is ≥ `SPLIT_SHARE_FLOOR` — anything else (older snapshot, corruption, missing) falls back to equal shares. Always opens.                                                      |
| `setSplitGroupVisible<T>(state, visible)`                              | Flips ONLY `open`; panes and sizes ride along (menu hide/restore semantics).                                                                                                                                                                                                                                     |
| `applySplitPreset<T>(state, preset)`                                   | Forces `{open, orientation}` in one step without touching panes or sizes.                                                                                                                                                                                                                                        |
| `toggleSplitLayout<T>(state, orientation, targets)`                    | When already open in the same orientation with no targets: close **and clear**. With explicit targets: re-target (never close). In the other orientation: re-open oriented.                                                                                                                                      |
| `retargetSplitPane<T>(state, index, next)`                             | Identity no-op for out-of-range index; otherwise replaces exactly one pane, sizes untouched.                                                                                                                                                                                                                     |
| `closeSplitPane<T>(state, index)`                                      | Identity no-op for out-of-range index; removing the last pane closes the whole group (`{open: false, panes: [], sizes: []}`); otherwise survivors are `renormalizeSplitSizes`-rescaled back to exactly 100.                                                                                                      |
| `resizeSplitGutter<T>(state, gutterIndex, deltaPercent)`               | Refuses (identity) when `panePairForGutter` is null; otherwise delegates to `adjustAdjacentSplitSizes`.                                                                                                                                                                                                          |
| `dragSplitGutterFrom<T>(state, startSizes, gutterIndex, deltaPercent)` | The frozen-snapshot drag primitive — see [Dragging from a frozen snapshot](#dragging-from-a-frozen-snapshot).                                                                                                                                                                                                    |
| `nudgeSplitGutter<T>(state, gutterIndex, stepPercent)`                 | Delegates to `resizeSplitGutter` with a fixed step (keyboard gutter resize); positive grows the left/top pane.                                                                                                                                                                                                   |
| `healSplitLayout<T>(state)`                                            | Returns the same object when the layout is consistent; a pane-less group gets `sizes: []`; a sizes/panes length mismatch is rebuilt to `equalSplitShares`.                                                                                                                                                       |
| `setSplitGroupWidth<T>(state, percent)`                                | Identity no-op for a non-finite percent; otherwise clamps into `[SPLIT_GROUP_WIDTH_MIN, SPLIT_GROUP_WIDTH_MAX]` (10–90).                                                                                                                                                                                         |
| `paneBasisPercent<T>(state, paneIndex)`                                | Returns `state.sizes[paneIndex]`, or `undefined` for an out-of-range pane.                                                                                                                                                                                                                                       |
| `splitLayoutViolations<T>(state)`                                      | The audit function — see [The audit function](#the-audit-function).                                                                                                                                                                                                                                              |

---

## The gutter invariant — *N panes ⇒ exactly N − 1 gutters*

A group of `N` panes has **exactly `N − 1` gutters**, one between every adjacent pair:
gutter `g` sits between pane `g` and pane `g + 1`. The old bug (the "Round 3" bug this
module exists to protect) rendered a decorative divider for panes `2..n` with no pointer
wiring. `gutterCount`, `gutterIndices` and `panePairForGutter` make the correct topology
the only expressible one, and the test suite proves it mathematically for every pane count (an exhaustive sweep for
every `n` from 0 to 128).

A gutter drag redistributes width **only within its own pair** — the sum of every other
pane is untouched. The pair-local clamp during a drag is floor-aware: each pane of the
dragged pair stays ≥ `SPLIT_SHARE_FLOOR` (10), *relaxed to `pairSum / 2` when the pair
cannot afford the full floor*, so tiny pairs never deadlock.

At render time `page.tsx` renders one separator before each pane with `paneIndex > 0`,
which yields exactly `paneCount − 1` separators — the topology emerges from the loop and
matches the engine's arithmetic. Both drag surfaces are `role="separator"` with
`tabIndex={0}`, use pointer capture plus window `pointermove`/`pointerup` listeners, and are
throttled by `rafThrottle` (one state commit per animation frame — see
[ARCHITECTURE.md](../ARCHITECTURE.md) §3.4). A mouse-only guard ignores non-primary-button
pointers: `if (e.pointerType === "mouse" && e.button !== 0) return;`.

---

## The share invariants

1. `sizes.length === panes.length` **always** — hidden panes keep their shares.
2. `panes.length ≤ MAX_SPLIT_PANES` (4) whenever panes exist.
3. Every share is a whole integer (no fractional percents).
4. Shares sum to exactly 100 whenever panes exist.
5. Every share ≥ `SPLIT_SHARE_FLOOR` (10) when its pair can afford it.
6. The group width sits inside `[10, 90]` percent.

**Visibility is orthogonal to content — deliberately.** The menu Split toggle HIDES the
group without clearing it (`setSplitGroupVisible`); toggling it back restores the same
panes at the same sizes. Conversely an open group may legitimately hold ZERO panes (the
empty-split hint state). Neither state is a violation.

The group-width drag surface (main editor ↔ pane group) advertises `aria-valuemin=20` /
`aria-valuemax=80` and the page pre-clamps to 20–80 before calling `setSplitGroupWidth`,
which re-clamps to the engine's wider 10–90 range — an intentional UI narrowing of the
engine's legal range. Keyboard arrows move it ±2; intra-group gutters are keyboard-nudged
±2 via `nudgeSplitGutter` relative to the *current* sizes (not the frozen snapshot).

---

## Dragging from a frozen snapshot

The frozen-snapshot rule exists because of a measured bug. The naive implementation
applied each pointermove's delta on top of the previous applied frame:

```ts
// Every pointermove recomputes the next array from THIS fixed starting point.
const startSizes = splitPaneSizes;

// The cumulative delta is applied through the frozen snapshot, not the live state.
setSplitLayout((prev) => dragSplitGutterFrom(prev, startSizes, pairIndex, deltaPercent));
```

Applying the cumulative delta through a `(prev) => …` updater re-applied it on top of the
last applied frame EVERY frame — the shares accelerated and slammed into the 10% floor
within one small drag. `dragSplitGutterFrom(state, startSizes, gutterIndex, deltaPercent)`
encodes exactly this rule: the pair is validated against the **current live state** (a
gutter that no longer exists is refused), while the delta is applied to the **frozen
`startSizes`** captured at pointer-down. The test "applies every move against the
pointer-down snapshot" pins the arithmetic: `+10` then `+20` lands at `+20`, not `+30`.

During a drag the page sets `document.body.style.cursor` to `col-resize`/`row-resize` and
`userSelect: "none"`; `onUp` cancels the throttle, removes the listeners, and resets cursor
and user-select. There is no `pointercancel` handler — the `pointerup` path plus the
self-heal effect below cover abandoned drags.

A related self-heal guard runs at the page level: an effect calls
`healSplitLayout` on every `splitLayout` change, so any pane/sizes tear (for example a
retarget landing mid-drag) is healed back to consistent shares. `healSplitLayout` returns
the same object for an already-consistent layout, which keeps the effect from looping.

---

## Transitions and restore

- **Open**: `openSplitLayout` assigns equal shares, drops targets beyond 4, and ignores an
  empty target list entirely.
- **Toggle**: same orientation + no targets ⇒ close and clear (the event path); explicit
  targets ⇒ re-target; other orientation ⇒ re-open oriented.
- **Menu hide / preset**: `setSplitGroupVisible` / `applySplitPreset` only flip visibility
  and orientation, preserving panes + sizes for restore.
- **Session restore**: `restoreSplitLayout` caps at 4 first, then trusts `savedSizes` only
  when length matches, the sum is exactly 100, and every value ≥ 10 — otherwise equal
  shares. It never half-applies a corrupt snapshot.
- **Page-level restore** (`page.tsx`): gated by the `sessionRestore` setting, one-shot via
  `sessionRestoredRef`, skipped when a URL deep-link pre-picked a file. Targets are
  re-validated against the fresh folder listing (deleted files are dropped); a corrupt
  snapshot is caught and falls back to a single pane. The group width is restored from the
  orientation-appropriate ratio (`verticalRatio` when "down", else `horizontalRatio`)
  through `setSplitGroupWidth`, which rounds and clamps.
- **Split open events**: the page listens to the `praxis:split-editor` /
  `praxis:split-editor-down` custom events; the fallback target is the most recent OTHER
  open tab (the current file mirrors into a pane only when it is the sole tab).

---

## The audit function

`splitLayoutViolations(state)` returns a list of human-readable violations, checked in
this order:

1. `sizes.length !== panes.length` → `"sizes length L does not match pane count N"` —
   early return; the deeper checks are meaningless without alignment.
2. `panes.length === 0` → return (the empty-split hint state is legal).
3. `panes.length > MAX_SPLIT_PANES` → `"pane count N exceeds the cap 4"`.
4. Any non-integer size → `"non-integer share X"` (one per offending value).
5. `sum !== 100` → `"shares sum to N, not 100"`.
6. Any `sizes[i] < SPLIT_SHARE_FLOOR` → `"pane i share N is below the floor 10"`.
7. `groupWidthPercent` outside `[10, 90]` → `"group width N is out of range"`.

The tests run the audit after EVERY transition of a 500-step randomized storm (LCG seed
20261121; open/close/drag/toggle/heal/retarget operations), asserting both that
`gutterCount === max(0, panes − 1)` and that the audit stays empty after each step. The
app may also call it in dev builds as a cheap assertion; today the audit is test-side only.

---

## Persistence

The engine itself persists nothing. The keys in play (grep-verified):

| Key                    | Owner                          | Content                                                                                                                                                                                                                                                                                             |
|------------------------|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `praxis.session`       | `src/lib/workspace-session.ts` | `WorkspaceSession` v1: `openTabs`, `activeTab`, `splitPane` `{open, orientation, targets, sizes?}`, `bottomPanel`, `splitWidths {horizontalRatio, verticalRatio, rightRailWidth}`, `dirtyBuffers`, `terminalSessions`, `consoleSessionId`, `savedAt`. A stale/unknown version is dropped wholesale. |
| `praxis.session.v1`    | legacy                         | One-time migration into `praxis.session`.                                                                                                                                                                                                                                                           |
| `praxis.layout-preset` | `src/lib/layout-presets.ts`    | The selected preset id; removed on Reset layout.                                                                                                                                                                                                                                                    |
| `praxis.layout`        | `page.tsx`                     | `sidebarWidth` (160–480) and `codePanelHeight` (10–90) only — NOT split state.                                                                                                                                                                                                                      |

The save path (`page.tsx`): while the split group is open with panes, `splitPane` is saved
as `{open: true, orientation, targets, sizes}` (the dragged per-pane shares persist, so a
reload lands the multi-pane layout at the same sizes); otherwise `{open: false,
orientation, targets: []}`. Both ratios are stored as `splitPaneWidthPercent / 100`, so an
orientation flip keeps each layout's last size. Saves go through
`saveWorkspaceSession(snapshot, 700)` (debounced) with a `beforeunload` flush. The loader
sanitizes `sizes` to finite values in `(0, 100)` before handing them to
`restoreSplitLayout`, which applies the final trust checks.

The pane view (`split-file-pane.tsx`) receives `basisPercent?: number` and renders
`style={{ flex: `0 1 ${basisPercent}%` }}`, falling back to `flex-1 basis-0` classes when
undefined — "undefined only in the transitional frame where the sizes array trails the
pane list".

---

## Test coverage

`src/layout/__tests__/split-pane-engine.test.ts` — 60 `it` blocks under 21 `describe`
groups, written in two proof styles (exhaustive examples and property sweeps), claiming
100% branch coverage. Highlights:

- The gutter invariant proven by an exhaustive sweep for every `n` from 0 to 128.
- The 3-pane ⇒ 2-gutter "Round 3 bug shape".
- Equal-share remainder distribution with a sweep for every count.
- Pair-sum invariance and floor clamps under `adjustAdjacentSplitSizes`.
- The frozen-snapshot drag arithmetic (`+10` then `+20` lands at `+20`).
- `restoreSplitLayout` trusting well-formed saved shares and rejecting unsound ones.
- The menu hide/restore toggle preserving panes AND sizes.
- The audit flagging every violation class (and accepting the legal visibility extremes).
- The 500-step randomized transition storm asserting the invariants after EVERY step.
- A module-surface test asserting exactly the 21 exports the page consumes.
