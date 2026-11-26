# Architecture — Overlays, Scrolling, and Highlighting

Everything you see floating over code in the viewer — squiggles, spell chips, fold
chevrons, find rects, diff/coverage strips, blame gutter, rainbow brackets — is positioned
by one pure math module, `src/layout/code-overlay-engine.ts`, and mounted inside ONE
scroll container shared with the text. This document is the full contract; the summary
lives in [ARCHITECTURE.md](../ARCHITECTURE.md) §2.3–2.5.

---

## Text and overlay layers share ONE scroll container

The viewer root (`src/components/code-viewer.tsx`) is a column: header (`shrink-0`) + **body** + optional footer
(`shrink-0`). The body is the only scroll container:

- The scroller: `<div ref={scrollContainerRef} tabIndex={0} role="region">` with
  `className="relative flex-1 min-h-0 …"`, `overflow-auto` in normal mode. It is focusable
  so `Home`/`End`/`Ctrl+Home`/`Ctrl+End` work in view mode.
- The inner content div (`codeBodyRef`, `className="relative"`) is **not** scrollable —
  `codeBodyRef.scrollTo` would be a no-op, which is exactly why the find bars drive
  `scrollContainerRef` instead.
- All decoration layers are absolutely-positioned children of the same clipped wrapper
  that owns the code: `<pre>` overlays (whitespace, indent guides, rainbow brackets) are
  `absolute inset-0 pointer-events-none`; overlay divs use `absolute` plus
  `top: lineTop(row)` px. Overlays therefore scroll **for free** with the text — no
  nested scrollers, no scroll-sync code. The comments in the file state the invariant
  verbatim: "the words and the overlays share ONE clip; zero nested scroll containers."

In collapsed (non-expanded) view mode the scroller hard-locks `overflow-hidden` +
`overscroll-behavior: contain`, and the sticky header, progress chip, bottom fade
gradient, minimap, and the "Show less" pill all live inside or around this same container
hierarchy.

### Measurement

What is measured, and when:

| Quantity             | How                                                                                                                                                            | Fallback         |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|
| `viewportHeight`     | `ResizeObserver` on the scroll container, reading `clientHeight` (classic-scrollbar-safe), change-quantized ±2 px.                                             | —                |
| `measuredLineHeight` | A `useLayoutEffect` queries `.linenumber`, `.react-syntax-highlighter-line-number`, `[data-line-number]` inside `codeBodyRef`; `rect.height` of the first hit. | `fontSize * 1.6` |
| `measuredCodeTop`    | Same probe; `rect.top − containerRect.top`.                                                                                                                    | `16`             |
| `measuredCodeLeft`   | Same probe; `rect.right − containerRect.left` (fallback: the first `<span>` inside `code`).                                                                    | `0`              |
| `measuredCharWidth`  | A hidden probe `<span>` of exactly 100 `M` glyphs (same font/size/letter-spacing), `width / 100`.                                                              | —                |
| `viewWrapCols`       | `wrapColumnCount(pre.clientWidth − padR − measuredCodeLeft, probeW)`.                                                                                          | `Infinity`       |

A **MutationObserver latch** handles the worker-highlighting case: with web-worker
highlighting the first render is a metrically-identical SKELETON with no line-number/code
elements, so the layout effect found nothing and `measuredCodeLeft` stayed 0 (the
"zigzags shifted right" bug — ~11 px off on a 13 px font, stuck forever because the effect
deps never change once the worker's real `<pre>` lands). The fix: when `measure()` returns
false, a `MutationObserver` on `codeBodyRef` (`{childList: true, subtree: true}`) re-runs
the measurement (rAF-coalesced) the moment a real element appears, then disconnects; wrap
columns are recomputed late; a `setTimeout(10_000)` safety-disconnects the observer.
`measuredCodeLeftRef` mirrors the state because the wrap-width read happens after the
`setMeasuredCodeLeft` call — state is one render stale, the ref is fresh within the effect.

Stale-measurement consequences are deliberately bounded: a stale rect displaces a
decoration by a pixel until the observer re-measures. Overlay POSITIONING may depend on
measurement; overlay CLIPPING may not (next section).

### The overlay window (windowing with hysteresis)

The mounted-decoration window is computed by pure functions:

| Export                                                                          | Semantics                                                                                                                                                                                                                                      |
|---------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `OVERLAY_WINDOW_MARGIN`                                                         | `40` — look-above/look-below lines around the visible range.                                                                                                                                                                                   |
| `OVERLAY_WINDOW_HYSTERESIS`                                                     | `20` — commit a new window only when an edge moved ≥ this many lines.                                                                                                                                                                          |
| `overlayWindowFromScroll(scrollTop, clientHeight, rowHeight, codeTop, margin?)` | `first = max(1, floor((scrollTop − codeTop) / rowHeight) − margin)`; `last = ceil((scrollTop + clientHeight) / rowHeight) + margin`. Returns **`null` while `rowHeight <= 0`** (measurement in flight) — the caller keeps the previous window. |
| `overlayWindowChanged(next, prev, hysteresis?)`                                 | True iff either edge moved ≥ the hysteresis.                                                                                                                                                                                                   |
| `lineInOverlayWindow(line, first, last)`                                        | Inclusive on both edges.                                                                                                                                                                                                                       |
| `lineTopOf(row, rowHeight, codeTop)`                                            | `(row − 1) * rowHeight + codeTop`.                                                                                                                                                                                                             |
| `buildRawLineToViewRow(code, symbols, foldedLines, codeFolding)`                | Maps raw line numbers to display rows; lines inside a folded symbol map to `0` (hidden); each folded symbol's def line is followed by one placeholder row. An empty map (identity) when folding is off or nothing is folded.                   |
| `viewRowTopOf(rawLine, ctx)`                                                    | Returns **`null`** when the row is hidden under a fold, past the collapsed preview's cut, or past the progressive-render frontier; otherwise `lineTopOf(row, …)`.                                                                              |
| `buildViewRowPrefix(lines, wordWrap, wrapCols, tabSize, hasWrappedMarks)`       | Null when wrapping is off; else each line's wrapped-row surplus (from `wrappedRowCount` in `@/lib/editor-geometry`).                                                                                                                           |
| `windowedOverlayRange(first, last, margin, nodeCount)`                          | Clamps a node index window to the array; builds a `spacer` of newlines standing in for hidden rows above; **`null`** for an empty window.                                                                                                      |
| `gutterDigitCount(totalLines)`                                                  | Digits of the widest line number.                                                                                                                                                                                                              |
| `gutterMinWidthOf(totalLines)`                                                  | `` `max(2.5em, ${digits}ch + 1.2em)` `` — the line-number gutter minWidth (the alignment fix for files ≥ 100 lines).                                                                                                                           |

The wiring in `code-viewer.tsx`: on every `scroll` event (passive), one `requestAnimationFrame`
is scheduled (skipped when one is pending); `compute()` derives the next window with
`overlayWindowFromScroll`; a `null` keeps the previous window; the hysteresis gate commits
only when either edge moved ≥ 20 lines. Result: "a couple of re-renders per scroll GESTURE,
never per scroll frame." The window is also recomputed once on mount and when
`[measuredLineHeight, measuredCodeTop, fontSize, lineHeight]` change.

Every overlay family gates its mounting on `overlayFirst`/`overlayLast`: fold chevrons,
the timing overlay, the git-diff gutter, coverage strips (capped at 4,000 markers),
bookmarks, diagnostics, find rects, spell chips, and the rainbow-bracket window via
`windowedOverlayRange(overlayFirst, overlayLast, OVERLAY_WINDOW_MARGIN, nodes.length)` in
BOTH view and edit mode — the hidden rows above collapse into the newline `spacer`, so a
5,000-line file mounts ~120 line fragments instead of 5,000.

### Folds and the progressive frontier

**View-mode folds** (`foldedSymbols: Set<number>` of def lines): chevron buttons in a
dedicated gutter left of the line numbers, gated to the overlay window; toggling updates
the set; persistence is a per-file localStorage slot `praxis-folded.<folderSlug>.<fileSlug>`
storing the JSON array of folded line numbers, filtered on load to lines that are valid
symbol lines of the CURRENT file (no phantom folds after edits). `buildFoldedView`
(`src/lib/fold-view.ts`) drops hidden body lines and inserts one placeholder row after the
def line — `▸ def foo(args) … (N lines hidden — click to expand)` — with the symbol name
truncated to 60 chars. Fold keys are `type:name` while unique among same-type symbols, else
`type:name#line` (the fix for React duplicate-key crashes on sibling `else` blocks).

**Edit-mode folds** (`editFoldedKeys: Set<string>`): presentational only — an opaque box
covers the folded body (click to expand), gutter numbers dim, the textarea text is
untouched. Persistence is `src/lib/fold-state.ts`: localStorage key **`praxis.fold-state`**
("deliberately WITHOUT a numeric suffix"), an LRU cap of `FOLD_STATE_MAX_FILES = 50`
entries of `Record<fileId, string[]>` where `fileId = "<folderSlug>/<fileSlug>"`. Writes
are debounced `FOLD_SAVE_DEBOUNCE_MS = 400`, only USER fold actions schedule writes (`foldMutatedRef`), and a snapshot
ref is flushed on unmount/file-switch. `loadFoldState`
is SSR-guarded and per-entry validated so one corrupted entry cannot take the map down.

Folded regions shrink the display-row space the ±40-line window scrolls through:
`rawLineToViewRow` maps folded bodies to `0`, and `viewRowTopOf` returns `null` for hidden
rows, so marks under folds never mount.

**The progressive frontier** (`src/lib/code-chunks.ts` +
`src/components/code-viewer-progressive.tsx`): files longer than
`FULL_CHUNK_THRESHOLD = 800` lines render in `FULL_CHUNK_LINES = 200`-line chunks (200 was
chosen over 500 because a 500-line chunk's main-thread tokenize measured ~1.8 s).
`splitSafeChunks` is a state machine over `'''`/`"""` so chunk boundaries NEVER fall inside
a triple-quoted string. `ProgressiveCodeBody` owns the mounted-chunk counter: resets to 0
on chunk-set change, reports `onFrontier(startRows[1] ?? Infinity)` at mount START (rows
past chunk 1 are gated from the first frame), increments once per `requestAnimationFrame`
per chunk, and reports `onFrontier(Infinity)` at mount END. Each chunk renders with CSS
`content-visibility: auto` + `containIntrinsicSize: auto chunkLines * lineHeightPx`. The
parent keeps `mountedRowLimit` state (a pinned progress chip shows while it is finite); the
counter deliberately lives OUTSIDE the 8.6k-line viewer because re-rendering the whole
viewer per chunk measured 1.3–1.8 s long tasks on a 3,600-line file. Files above
`MAX_RENDER_LINES = 5000` get the "Large file … download to view" fallback.

---

## A clipping surface must never depend on measurement to clip

The rule: overlays may depend on measurement (a stale rect displaces a decoration by a
pixel until the `MutationObserver` re-measures). **Clipping surfaces may not** — a stale
measurement there would leak scrollbars or clip the wrong rows, which is precisely the
class of bug `e2e/round3-fixes.spec.ts` ("Show Less: one shared clip, zero scrollbars,
overlays glued to the words") pins.

The collapsed "Show less" preview clips with CSS geometry only (`src/lib/clip-math.ts` constants):

| Constant                     | Value               |
|------------------------------|---------------------|
| `COLLAPSED_LINE_COUNT`       | `8` (fallback rows) |
| `COLLAPSED_FALLBACK_CLIP_PX` | `220`               |
| `CLIP_BOTTOM_BUDGET_PX`      | `20`                |
| `CLIP_PRE_BOTTOM_PAD_PX`     | `16`                |
| `VIEW_PAD_TRIM_MAX_PX`       | `16`                |

`collapsedRowCount(viewportH, lineH, codeTop) = max(8, floor((viewportH − codeTop − 20) / rowH))`;
`collapsedClipHeight = min(floor(viewportH), round(codeTop + rows * rowH + 16))`;
`isFileCollapsible(totalLines, rowCount) = totalLines > rowCount` (ANY overflow clips — the
old `+2` slack left a 1–2-line scroll sliver).

The exact mechanism, all CSS:

1. The clip lives on the wrapper that owns BOTH the code and every absolutely-positioned
   overlay: `maxHeight: collapsedClipPx` + `overflow: hidden` (outer), repeated on an inner
   clip div. Clipping only the code container previously left overlays extending
   `scrollHeight` — a few pixels of vertical scroll with words sliding under screen-glued
   chips.
2. The scroll container itself hard-locks `overflow-hidden` + `overscroll-behavior:
   contain` in every collapsed view-mode file (cell/notebook view is exempt); a
   belt-and-braces effect zeroes `scrollTop` on activation and re-pins it to 0 on every
   capture-phase scroll event while collapsed — killing rubber-band/momentum drift.
3. The `<pre>`s switch `overflow-x-auto` → `overflow-hidden` when collapsed, because
   `overflow-x: auto` computes `overflow-y: auto` (CSS §11.1.1) and painted a nested
   vertical scrollbar; the worker path takes an explicit `clipOverflow={!expanded}`.
4. NO max-height transition and NO framer-motion `animate maxHeight` — collapse and expand
   are INSTANT so clip + overlays + container land in final geometry in one frame. (An
   `undefined` animate value used to be treated as a removed key; the inline max-height
   got stuck at ~220 px — "white screen with zigzags".)
5. The "Show less"/"Show full code" toggle pill is `absolute bottom-3 right-3 z-30` on the
   viewer root.

The mark-position math (`viewRowTopOf`) already returns `null` for rows past the collapse
cut, so marks and text agree without any measured clipping.

### Progressive rendering

See [Folds and the progressive frontier](#folds-and-the-progressive-frontier) above for
the chunk machinery. Two additional details: the loader row ("Rendering N of M lines…")
renders in-flow per chunk so frame 0 paints it before the heaviest tokenize runs, and
`viewPadTrim` trims a ≤16 px scroll leftover (`VIEW_PAD_TRIM_MAX_PX`) from the `<pre>`
bottom padding so expanded short-overflow files show no scrollbar sliver.

### The sticky header is its own component

`src/components/code-viewer-sticky-header.tsx` (`StickyScrollHeader`, `React.memo`): pins
the innermost def/class/method containing the first visible line (deepest `indent`, tie →
later `line`), but only once that header line has scrolled above the first visible line (the VS Code no-pin-at-top
behavior: `if (best && best.line >= line) best = null`). It has
its own passive rAF-throttled scroll listener on the shared `scrollRef` and only
`setState`s when the pinned symbol changes. The wrapper is `sticky top-0 z-30 h-0
pointer-events-none`; the inner bar is `absolute left-0 right-0` at `rowH` px with the
code background, a rotated chevron, `formatSymbol(symbol)`, an optional docstring (md+
only), and a right-aligned `L{line}`.

Two instances exist: the view-mode one is a `<button>` that jumps to the symbol; the
edit-mode one is pure presentation (`pointer-events-none` throughout so it never steals a
click/focus from the textarea) fed by `useDeferredValue`-deferred symbols. The perf
rationale in comments: per-crossing setState used to re-render the whole viewer —
250–860 ms long tasks, ~9 fps on a 3,600-line file (41 fps with sticky off).

The minimap column (`src/components/minimap-column.tsx`) is likewise its own component: a
64 px (`w-16`) canvas rail, DPR raster capped at 2, one 1-px row per line, gray-coded by
leading-whitespace bucket, a translucent viewport rect, pointer-drag scrubbing with
`minimapScrollTargetForRatio`, and scroll sync via one passive scroll listener plus
`ResizeObserver`s on the scroller AND its first element child, all rAF-coalesced. It hides
above `MINIMAP_MAX_LINES = 8000` (static "minimap off · N lines" note) and when the content
is not scrollable.

---

## Worker grammars must match the main-thread registry

Syntax highlighting runs in ONE module Web Worker (`src/lib/highlight-worker.ts`),
created lazily by `src/lib/highlight-client.ts`:

```ts
// A single module worker instance is created lazily, on first use.
const worker = new Worker(new URL("./highlight-worker.ts", import.meta.url), { type: "module" });
```

**The JSON protocol (exact fields):** request `postMessage({ id, code, language })`;
response success `postMessage({ id, tokens })`; response failure
`postMessage({ id, error })`. `SerializedToken = { types: string[]; value?; children? }`
(structured-clone-safe plain JSON; aliases folded into `types`; a single plain-text child
collapses to a leaf). An unknown `language` falls back to the python grammar.

**The client guarantees:**

- **LRU cache of 96 results** (`CACHE_MAX = 96`), keyed by
  `` `${language} ${code.length} ${code.slice(0,64)} ${code.slice(-64)}` ``; LRU touch is
  delete + re-insert; only successful responses are cached.
- **`workerBroken` latch**: `worker.onerror` (or a construction throw) sets the latch,
  rejects every pending request, terminates the worker, and nulls the reference — a
  PERMANENT main-thread fallback for the session. `ensureWorker()` returns null while
  broken.
- **Per-request timeout of 10,000 ms** resolving `null` ("never hang the UI"); the caller
  falls back to the pre-worker main-thread renderer.
- `tokenizeHighlight(code, language = "python", timeoutMs = 10_000)` resolves `null`
  whenever the worker is unavailable — callers MUST fall back (`WorkerOrPlainHighlightBlock` is the drop-in switch).

The fallback renderer (`src/components/worker-highlight.tsx`) re-renders the serialized
token tree through the SAME react-syntax-highlighter span pipeline (same `token <type>`
classes, same inline line-number spans), so worker and main-thread output are
pixel-identical. While the round trip is in flight it shows a metrically-identical shimmer
SKELETON (same font/line-height/padding, up to 60 rows).

**The registry mirror hazard.** Prism grammars are registered in two hand-maintained
lists — the main thread (`src/lib/highlighter.ts`, PrismLight, 43 grammars + aliases:
python, bash, json, markdown, yaml, toml, sql, r, javascript, js, typescript, jsx, tsx,
matlab, java, c, cpp, css, ini, ruby, markup-templating, php, go, markup, html, xml, lua,
perl, rust, julia, kotlin, swift, powershell, batch, zig, dart, groovy, scala, elixir,
haskell, erlang, clojure, ocaml, fsharp, graphql, diff) and the worker (`src/lib/highlight-worker.ts` REGISTRY, the same
43 via refractor modules). The lists
match 1:1 today; there is NO code-level guarantee. A third file routes FileKind → grammar (`prismLanguageFor` in
`file-viewer.tsx`, driven by `fileKindFromExt` in
`src/lib/scripts.ts`). Adding a highlightable language is therefore THREE coordinated
edits — miss one and the grammar is registered-but-unreachable, routed-but-unregistered (plain gray), or highlighted
differently on the two threads. The documented instance:
html/markdown were once missing from the router AND markup unregistered, so view-source
rendered plain gray.

Unit coverage: `src/layout/__tests__/code-overlay-engine.test.ts` (window derivation,
hysteresis, fold maps, `viewRowTopOf` null cases, wrapped-row prefixes, the newline spacer,
gutter digit sizing) plus `src/lib/__tests__/` suites for `fold-state`, `fold-view`,
`clip-math`, `code-chunks`, and `minimap`.
