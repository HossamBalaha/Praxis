/**
 * estimate-runtime.test.ts — unit tests for src/lib/estimate-runtime.ts.
 *
 * The estimator predicts run duration from (1) historical run durations
 * when available, else (2) a conservative static analysis of the source.
 * These tests exercise:
 *   - the history path: single run, odd/even run counts (median semantics,
 *     including the upper-median behavior for even counts), the 5-run window
 *   - the static path with small/medium/large synthetic inputs: heavy
 *     imports (deduped), time.sleep, file reads, loops, matplotlib figures,
 *     line-count baseline, obvious long-run flags (while True, huge range,
 *     ML fit+predict)
 *   - boundary values: empty source → 200 ms floor, all-comment source →
 *     floor, sub-floor line counts clamped to 200 ms
 *   - formatDuration at its unit boundaries (ms → s → m+s), including the
 *     current behavior where a 59.5 s remainder renders as "1m 60s".
 *
 * All numbers are deterministic — the module is pure.
 */
import {describe, expect, it} from "vitest";
import {estimateRunDuration, formatDuration} from "@/lib/estimate-runtime";

const noHistory = {pastDurationsMs: [] as number[]};

describe("estimateRunDuration — history path (high confidence)", () => {
    it("uses the single past duration verbatim", () => {
        const r = estimateRunDuration({source: "x = 1", pastDurationsMs: [1500]});
        expect(r.estimatedMs).toBe(1500);
        expect(r.confidence).toBe("high");
        expect(r.reasoning).toBe("Based on 1 previous run of this exact script.");
        expect(r.signals).toEqual([{label: "Last 1 run (median)", contributionMs: 1500}]);
    });

    it("uses the median of the recent runs", () => {
        const r = estimateRunDuration({source: "x = 1", pastDurationsMs: [1000, 3000, 2000]});
        expect(r.estimatedMs).toBe(2000);
        expect(r.confidence).toBe("high");
        expect(r.reasoning).toBe("Based on 3 previous runs of this exact script.");
        expect(r.signals[0].label).toBe("Last 3 runs (median)");
    });

    it("takes the UPPER middle value for an even number of runs (current behavior)", () => {
        // sorted [1000, 3000], index floor(2/2) = 1 → 3000. This documents the
        // implementation's upper-median choice rather than averaging.
        const r = estimateRunDuration({source: "x = 1", pastDurationsMs: [1000, 3000]});
        expect(r.estimatedMs).toBe(3000);
        expect(r.signals[0].label).toBe("Last 2 runs (median)");
    });

    it("only considers the 5 most recent runs", () => {
        // First five: [9000, 100, 100, 100, 100] → median 100; the two older
        // 1 ms entries must not drag the estimate down.
        const r = estimateRunDuration({
            source: "x = 1",
            pastDurationsMs: [9000, 100, 100, 100, 100, 1, 1],
        });
        expect(r.estimatedMs).toBe(100);
        expect(r.signals[0].label).toBe("Last 5 runs (median)");
    });

    it("history wins even for a source full of heavy signals", () => {
        const r = estimateRunDuration({
            source: "import torch\nwhile True:\n    pass",
            pastDurationsMs: [500],
        });
        expect(r.estimatedMs).toBe(500);
        expect(r.confidence).toBe("high");
    });
});

describe("estimateRunDuration — static path (low confidence)", () => {
    it("empty source floors the estimate at the 200 ms Python startup overhead", () => {
        const r = estimateRunDuration({source: "", ...noHistory});
        expect(r.estimatedMs).toBe(200);
        expect(r.confidence).toBe("low");
        expect(r.signals).toEqual([]);
        expect(r.reasoning).toBe("No strong signals detected; defaulting to a minimal estimate.");
    });

    it("a tiny script with no signals is also clamped to 200 ms", () => {
        const r = estimateRunDuration({source: "x = 1", ...noHistory});
        expect(r.estimatedMs).toBe(200); // 1 line × 0.5 ms = 0.5 → 1 ms → floor 200
        expect(r.confidence).toBe("low");
    });

    it("blank lines and comment lines do not count toward the line baseline", () => {
        const r = estimateRunDuration({source: "# comment\n\nx = 1", ...noHistory});
        expect(r.estimatedMs).toBe(200);
        expect(r.signals).toEqual([{label: "1 non-comment lines", contributionMs: 1}]);
    });

    it("sums heavy imports (each counted once) plus the line baseline", () => {
        const src = [
            "import torch", // 8000
            "import numpy", // 800
            "from sklearn.model_selection import train_test_split", // sklearn 2500
        ].join("\n");
        const r = estimateRunDuration({source: src, ...noHistory});
        expect(r.estimatedMs).toBe(11302); // 11300 + round(3 × 0.5) = 2
        expect(r.confidence).toBe("low");
        expect(r.signals).toEqual([
            {label: "Heavy imports (torch, numpy, sklearn)", contributionMs: 11300},
            {label: "3 non-comment lines", contributionMs: 2},
        ]);
        expect(r.reasoning).toContain("Static analysis of 3 lines");
    });

    it("duplicate imports of the same module are only counted once", () => {
        const r = estimateRunDuration({source: "import torch\nimport torch", ...noHistory});
        expect(r.estimatedMs).toBe(8001); // 8000 + round(2 × 0.5) = 1
    });

    it("adds time.sleep seconds as milliseconds", () => {
        const r = estimateRunDuration({source: "import time\ntime.sleep(2.5)", ...noHistory});
        expect(r.estimatedMs).toBe(2501); // 2500 + round(2 × 0.5) = 1
        expect(r.signals).toEqual([
            {label: "time.sleep() calls", contributionMs: 2500},
            {label: "2 non-comment lines", contributionMs: 1},
        ]);
    });

    it("counts for- and while-loops at ~50 ms each (assumed ~1000 iterations)", () => {
        const r = estimateRunDuration({
            source: "for i in range(10):\n    pass\nwhile x:\n    pass",
            ...noHistory,
        });
        expect(r.estimatedMs).toBe(200); // 2×50 + 4 lines×0.5 = 102 → floor 200
        expect(r.signals).toEqual([
            {label: "2 loops (for/while, ~1000 iters each)", contributionMs: 100},
            {label: "4 non-comment lines", contributionMs: 2},
        ]);
    });

    it("counts matplotlib figure calls and the matplotlib import separately", () => {
        const src = "import matplotlib.pyplot as plt\nplt.plot([1,2])\nplt.scatter([1],[2])";
        const r = estimateRunDuration({source: src, ...noHistory});
        expect(r.estimatedMs).toBe(1802); // import 1200 + 2 figures × 300 + 2
        expect(r.signals).toEqual([
            {label: "Heavy imports (matplotlib)", contributionMs: 1200},
            {label: "2 matplotlib figures", contributionMs: 600},
            {label: "3 non-comment lines", contributionMs: 2},
        ]);
    });

    it("counts data-file reads at 500 ms each", () => {
        const src = 'import pandas as pd\ndf = pd.read_csv("x.csv")\ndf2 = pd.read_csv("y.csv")';
        const r = estimateRunDuration({source: src, ...noHistory});
        expect(r.estimatedMs).toBe(2202); // pandas 1200 + 2 × 500 + 2
        expect(r.signals).toEqual([
            {label: "Heavy imports (pandas)", contributionMs: 1200},
            {label: "2 file reads (pd.read_csv / np.load / open)", contributionMs: 1000},
            {label: "3 non-comment lines", contributionMs: 2},
        ]);
    });

    it("flags `while True:` with a flat 5 s penalty on top of the loop signal", () => {
        const r = estimateRunDuration({source: "while True:\n    pass", ...noHistory});
        expect(r.estimatedMs).toBe(5051); // loop 50 + lines 1 + 5000
        expect(r.signals).toEqual([
            {label: "1 loop (for/while, ~1000 iters each)", contributionMs: 50},
            {label: "2 non-comment lines", contributionMs: 1},
            {label: "⚠ while True loop", contributionMs: 5000},
        ]);
    });

    it("flags ranges of a million or more", () => {
        const r = estimateRunDuration({source: "for i in range(1_000_000):\n    pass", ...noHistory});
        expect(r.estimatedMs).toBe(5051); // loop 50 + lines 1 + 5000
        expect(r.signals.some((s) => s.label === "⚠ range ≥ 1,000,000")).toBe(true);
    });

    it("flags ML fit + predict patterns", () => {
        const r = estimateRunDuration({source: "m.fit(x)\ny = m.predict(x)", ...noHistory});
        expect(r.estimatedMs).toBe(5001); // 5000 + lines 1
        expect(r.signals.some((s) => s.label === "⚠ ML fit+predict")).toBe(true);
    });

    it("combines every signal family for a large synthetic script", () => {
        const src = [
            "import torch", // 8000
            "import time",
            "time.sleep(1)", // 1000
            "df = pd.read_csv('big.csv')", // 500 (pd.read_csv)
            "for i in range(10):", // loop 50
            "    plt.plot(xs, ys)", // figure 300
            "m.fit(x)", // 5000 (fit+predict flag below)
            "y = m.predict(x)",
            "while True:", // loop 50 + 5000 flag
            "    pass",
        ].join("\n");
        const r = estimateRunDuration({source: src, ...noHistory});
        const lines = 10; // all non-comment
        const expected =
            8000 + // torch
            1000 + // sleep
            500 + // read_csv
            2 * 50 + // two loops
            300 + // one figure
            2 * 5000 + // two long-run flags
            Math.round(lines * 0.5); // 5
        expect(r.estimatedMs).toBe(expected);
        expect(r.signals.map((s) => s.label)).toEqual([
            "Heavy imports (torch)",
            "time.sleep() calls",
            "1 file read (pd.read_csv / np.load / open)",
            "2 loops (for/while, ~1000 iters each)",
            "1 matplotlib figure",
            "10 non-comment lines",
            "⚠ while True loop", // detectObviousLongRuns checks while True first
            "⚠ ML fit+predict",
        ]);
    });
});

describe("formatDuration", () => {
    it("renders sub-second values in rounded milliseconds", () => {
        expect(formatDuration(0)).toBe("0 ms");
        expect(formatDuration(499)).toBe("499 ms");
        expect(formatDuration(999)).toBe("999 ms");
    });

    it("renders seconds with one decimal up to a minute", () => {
        expect(formatDuration(1000)).toBe("1.0 s");
        expect(formatDuration(1500)).toBe("1.5 s");
        expect(formatDuration(59_999)).toBe("60.0 s");
    });

    it("renders minutes + whole seconds from one minute up", () => {
        expect(formatDuration(60_000)).toBe("1m 0s");
        expect(formatDuration(90_500)).toBe("1m 31s");
        expect(formatDuration(125_000)).toBe("2m 5s");
    });

    it("carries rounded seconds into the minutes field (edge-case fix)", () => {
        // 119_500 ms → 119.5 s → 2m 0s (used to render "1m 60s").
        expect(formatDuration(119_500)).toBe("2m 0s");
        expect(formatDuration(60_499)).toBe("1m 0s");
        expect(formatDuration(179_999)).toBe("3m 0s");
    });
});
