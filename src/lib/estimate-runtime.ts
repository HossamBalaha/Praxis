/**
 * Run-duration estimator.
 *
 * Predicts how long a Python script will take to execute, BEFORE the
 * user runs it. Used by page.tsx to show a "this run may take a while"
 * confirmation dialog when the estimate exceeds the * `runDurationWarningThreshold` setting.
 *
 * Two signals are combined, in priority order:
 *
 * 1. **Historical** — if the script has been run before, the last
 * observed duration is the single best predictor. We look it up
 * in the in-browser run history (passed in by the caller).
 *
 * 2. **Static analysis fallback** — for first-time runs, we scan the
 * source for signals that correlate with long runtimes:
 * - heavy imports (torch, tensorflow, sklearn, scipy, cv2, etc.)
 * - explicit `time.sleep(...)` calls
 * - nested loops (rough O(n²) detection)
 * - large-file reads (`pd.read_csv`, `np.loadtxt`, `open(...).read`)
 * - matplotlib figure count (each figure ≈ 0.3s)
 * - total line count (rough proxy for "work done")
 *
 * The static estimate is deliberately conservative — it's a lower
 * bound meant to flag obviously-long scripts, not to be precise.
 * Real runtimes vary by 10x+ depending on data sizes we can't see.
 *
 * No external libraries are used; everything is regex/AST-light.
 */

export interface EstimateInput {
    /** The script's source code. */
    source: string;
    /** Past run durations (ms) for this exact script, most-recent first.
     *  Empty array on first run. */
    pastDurationsMs: number[];
}

export interface EstimateResult {
    /** Best-guess duration in milliseconds. */
    estimatedMs: number;
    /** How confident we are: "high" = history-based, "low" = static-only. */
    confidence: "high" | "low";
    /** Human-readable explanation of the signals used. */
    reasoning: string;
    /** The signals that were detected (for the UI to show). */
    signals: EstimateSignal[];
}

export interface EstimateSignal {
    label: string;
    /** How many ms this signal contributed to the estimate. */
    contributionMs: number;
}

/** Heavy Python imports that usually mean "this will take a while". */
const HEAVY_IMPORTS: Record<string, number> = {
    // Deep-learning frameworks — first import is expensive (5-15s).
    torch: 8_000,
    tensorflow: 12_000,
    keras: 8_000,
    jax: 6_000,
    flax: 6_000,
    // Scientific stack — first import is 1-3s.
    sklearn: 2_500,
    scipy: 1_500,
    numpy: 800,
    pandas: 1_200,
    // Image / video — moderate.
    cv2: 1_500,
    PIL: 600,
    skimage: 1_200,
    // Plotting.
    matplotlib: 1_200,
    seaborn: 1_500,
    plotly: 2_000,
    bokeh: 1_800,
    // NLP / LLM.
    transformers: 5_000,
    spacy: 3_000,
    nltk: 2_000,
    // Geo / big data.
    geopandas: 3_000,
    dask: 3_000,
    pyspark: 8_000,
    // Database drivers.
    sqlalchemy: 1_500,
    psycopg2: 800,
    // Network-heavy.
    requests: 200,
    httpx: 200,
    aiohttp: 400,
};

/** Default per-line cost in ms. Rough proxy for "work done". */
const PER_LINE_MS = 0.5;

/** Default per-loop-iteration cost in ms (assumes ~1000 iterations). */
const PER_LOOP_MS = 50;

/** Default per-figure cost (matplotlib savefig ≈ 300ms). */
const PER_FIGURE_MS = 300;

/** Default per-file-read cost (pd.read_csv on a moderate file). */
const PER_FILE_READ_MS = 500;

/** time.sleep(n) — extracted verbatim and converted to ms. */
function extractSleepMs(source: string): number {
    let total = 0;
    const re = /time\.sleep\s*\(\s*([\d.]+)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n)) total += n * 1000;
    }
    return total;
}

/** Detect heavy imports and sum their per-import cost. */
function detectHeavyImports(source: string): { names: string[]; ms: number } {
    const found = new Set<string>();
    let ms = 0;
    // Match `import X` / `import X.Y` / `from X import ...` / `from X.Y import ...`
    const re = /^\s*(?:from\s+([\w.]+)\s+import\s+|import\s+([\w.]+))/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        const top = (m[1] ?? m[2] ?? "").split(".")[0];
        if (HEAVY_IMPORTS[top]) {
            if (!found.has(top)) {
                found.add(top);
                ms += HEAVY_IMPORTS[top];
            }
        }
    }
    return {names: Array.from(found), ms};
}

/** Count nested loops as a rough O(n²) signal. */
function countLoops(source: string): number {
    const re = /^\s*(?:for\s+\w+\s+in\s+|while\s+)/gm;
    return (source.match(re) ?? []).length;
}

/** Count matplotlib figure-creating calls. */
function countFigures(source: string): number {
    const re = /\b(?:plt\.subplots|plt\.figure|plt\.plot|plt\.scatter|plt\.bar|plt\.hist|plt\.imshow|fig\s*=\s*plt\.subplots|ax\.plot|ax\.scatter|ax\.bar|ax\.hist|ax\.imshow)\s*\(/g;
    return (source.match(re) ?? []).length;
}

/** Count file-read calls (pd.read_csv, np.loadtxt, open.read, etc.). */
function countFileReads(source: string): number {
    const re = /\b(?:pd\.read_csv|pd\.read_excel|pd\.read_parquet|pd\.read_json|np\.loadtxt|np\.load|scipy\.io\.loadmat|open\s*\([^)]*\)\.read)\s*\(/g;
    return (source.match(re) ?? []).length;
}

/** Detect obvious long-running patterns: `while True`, `for _ in range(10**6)`, etc. */
function detectObviousLongRuns(source: string): string[] {
    const flags: string[] = [];
    if (/while\s+True\b/.test(source)) flags.push("while True loop");
    if (/range\s*\(\s*1_?000_?000|range\s*\(\s*10\s*\*\*\s*[6-9]/.test(source)) flags.push("range ≥ 1,000,000");
    if (/\bGridSearchCV\b|\bRandomizedSearchCV\b/.test(source)) flags.push("sklearn grid search");
    if (/\btrain_test_split\b.*\bfit\b/.test(source)) flags.push("ML train+fit");
    if (/\.fit\s*\(/.test(source) && /\bpredict\s*\(/.test(source)) flags.push("ML fit+predict");
    if (/\btorch\.cuda\b|\bmodel\.to\s*\(\s*['"]cuda/.test(source)) flags.push("GPU/CUDA training");
    return flags;
}

/**
 * Estimate the runtime of a script.
 *
 * @returns {EstimateResult} — always returns something; never throws.
 */
export function estimateRunDuration(input: EstimateInput): EstimateResult {
    const {source, pastDurationsMs} = input;

    // ── 1. History-based estimate (high confidence) ────────────────
    if (pastDurationsMs.length > 0) {
        // Use the median of the last 5 runs (or all if fewer) to dampen
        // outliers. Median is more robust than mean to one-off slow runs.
        const recent = pastDurationsMs.slice(0, 5);
        const sorted = [...recent].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const signals: EstimateSignal[] = [
            {
                label: `Last ${recent.length} run${recent.length === 1 ? "" : "s"} (median)`,
                contributionMs: median,
            },
        ];
        return {
            estimatedMs: median,
            confidence: "high",
            reasoning: `Based on ${recent.length} previous run${recent.length === 1 ? "" : "s"} of this exact script.`,
            signals,
        };
    }

    // ── 2. Static-analysis estimate (low confidence) ───────────────
    const signals: EstimateSignal[] = [];
    let total = 0;

    // Heavy imports.
    const heavy = detectHeavyImports(source);
    if (heavy.ms > 0) {
        signals.push({
            label: `Heavy imports (${heavy.names.join(", ")})`,
            contributionMs: heavy.ms,
        });
        total += heavy.ms;
    }

    // time.sleep calls.
    const sleepMs = extractSleepMs(source);
    if (sleepMs > 0) {
        signals.push({label: "time.sleep() calls", contributionMs: sleepMs});
        total += sleepMs;
    }

    // File reads.
    const fileReads = countFileReads(source);
    if (fileReads > 0) {
        const ms = fileReads * PER_FILE_READ_MS;
        signals.push({
            label: `${fileReads} file read${fileReads === 1 ? "" : "s"} (pd.read_csv / np.load / open)`,
            contributionMs: ms
        });
        total += ms;
    }

    // Loops.
    const loops = countLoops(source);
    if (loops > 0) {
        const ms = loops * PER_LOOP_MS;
        signals.push({
            label: `${loops} loop${loops === 1 ? "" : "s"} (for/while, ~1000 iters each)`,
            contributionMs: ms
        });
        total += ms;
    }

    // Matplotlib figures.
    const figs = countFigures(source);
    if (figs > 0) {
        const ms = figs * PER_FIGURE_MS;
        signals.push({label: `${figs} matplotlib figure${figs === 1 ? "" : "s"}`, contributionMs: ms});
        total += ms;
    }

    // Line count (rough baseline work).
    const lines = source.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    const lineMs = Math.round(lines * PER_LINE_MS);
    if (lineMs > 0) {
        signals.push({label: `${lines} non-comment lines`, contributionMs: lineMs});
        total += lineMs;
    }

    // Obvious long-run patterns — add a flat 5s penalty each.
    const flags = detectObviousLongRuns(source);
    for (const f of flags) {
        signals.push({label: `⚠ ${f}`, contributionMs: 5_000});
        total += 5_000;
    }

    // Minimum 200ms (Python startup overhead).
    if (total < 200) total = 200;

    const reasoning = signals.length === 0
        ? "No strong signals detected; defaulting to a minimal estimate."
        : `Static analysis of ${lines} lines. This is a rough lower bound — real runtimes vary by 10×+ depending on data sizes.`;

    return {
        estimatedMs: total,
        confidence: "low",
        reasoning,
        signals,
    };
}

/** Format milliseconds as a human-readable duration string. */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    // Carry rounded seconds into minutes (119_500 ms used to render as
    // "1m 60s" — found by the vitest review).
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
}
