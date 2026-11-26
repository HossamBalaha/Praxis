/**
 * run-format.test.ts — unit tests for src/lib/run-format.ts.
 *
 * Covers the pieces the run pipeline leans on:
 * - isTimeoutRun: the stderr-marker sniff that separates a server-side
 * hard timeout from a user-initiated stop (the end event's `killed`
 * flag alone is true for both)
 * - runTimeoutMarkerLine: the marker /api/run stamps before SIGKILL —
 * /api/run-all now stamps the SAME line for per-file batch timeouts,
 * so the test pins it BYTE-IDENTICAL to the main route's literal and
 * against RUN_TIMEOUT_MARKER_RE (if either drifts, the Output panel
 * would fall back to the misleading "Stopped" pill)
 * - batchRunNotifyInfo: the pure builder that turns a run-all batch
 * `end` event into the RunNotifyInfo the completion notification +
 * chime consume (the batch path shows only a toast otherwise)
 * - formatByteCap / formatElapsedRun: the boundary cases the panel
 * renders (the 2 MB fallback for the truncation notice, the mm:ss →
 * h:mm:ss rollover and the negative-clamp guard)
 *
 * The module is pure — no React, no window, no fs — so the plain node
 * environment is sufficient.
 */
import {describe, expect, it} from "vitest";
import {
    batchRunNotifyInfo,
    formatByteCap,
    formatElapsedRun,
    isTimeoutRun,
    RUN_TIMEOUT_MARKER_RE,
    runTimeoutMarkerLine,
} from "@/lib/run-format";

/* ── runTimeoutMarkerLine ─────────────────────────────────────────── */

describe("runTimeoutMarkerLine", () => {
    it("matches the /api/run literal byte-for-byte (the two channels cannot drift)", () => {
        // This is the exact string api/run/route.ts sends as the stderr
        // event right before SIGKILL (both the Python path at ~line 885 and
        // the generic-language path at ~line 246). run-all reuses it.
        expect(runTimeoutMarkerLine(60_000)).toBe(
            "\n[praxis] run timed out after 60 s — the process was killed (hard timeout).\n"
        );
    });

    it("is sniffed by RUN_TIMEOUT_MARKER_RE / isTimeoutRun (the client's detection)", () => {
        const marker = runTimeoutMarkerLine(60_000);
        expect(RUN_TIMEOUT_MARKER_RE.test(marker)).toBe(true);
        expect(isTimeoutRun(marker)).toBe(true);
        // buried in a bigger stderr stream, not just alone on a line
        expect(isTimeoutRun("Traceback (most recent call last):\n" + marker)).toBe(true);
    });

    it("rounds the seconds like the main route (Math.round, not floor)", () => {
        expect(runTimeoutMarkerLine(90_500)).toContain("after 91 s");
        expect(runTimeoutMarkerLine(1_500)).toContain("after 2 s");
        expect(runTimeoutMarkerLine(1_000)).toContain("after 1 s");
    });

    it("does not sniff as a timeout for plain crash output", () => {
        expect(isTimeoutRun("SyntaxError: invalid syntax\n")).toBe(false);
        expect(isTimeoutRun(undefined)).toBe(false);
    });
});

/* ── batchRunNotifyInfo ──────────────────────────────────────────── */

describe("batchRunNotifyInfo", () => {
    it("builds a success alert: ok=true, no killed, file count pluralized", () => {
        const info = batchRunNotifyInfo({
            folderName: "Calibration",
            total: 7,
            failCount: 0,
            durationMs: 123_456,
        });
        expect(info).toEqual({
            fileName: "Run all — Calibration (7 files)",
            folderName: "Calibration",
            ok: true,
            killed: false,
            durationMs: 123_456,
        });
    });

    it("singularizes one file", () => {
        const info = batchRunNotifyInfo({
            folderName: "Calibration",
            total: 1,
            failCount: 0,
            durationMs: 5_000,
        });
        expect(info.fileName).toBe("Run all — Calibration (1 file)");
    });

    it("carries the failure count in the fileName (title text) and reports ok=false", () => {
        const info = batchRunNotifyInfo({
            folderName: "Calibration",
            total: 7,
            failCount: 2,
            durationMs: 123_456,
        });
        expect(info.fileName).toBe("Run all — Calibration (7 files, 2 failed)");
        // ok=false → notifyRunFinished titles it "Run failed: …", the chime
        // plays the falling notes, and runNotifyOnFailure gates it.
        expect(info.ok).toBe(false);
        expect(info.killed).toBe(false);
    });

    it("a stopped batch reports killed=true (\"Run stopped: …\") and is never ok", () => {
        const info = batchRunNotifyInfo({
            folderName: "Calibration",
            total: 3,
            failCount: 0,
            stopped: true,
            durationMs: 45_000,
        });
        expect(info.ok).toBe(false);
        expect(info.killed).toBe(true);
        expect(info.fileName).toBe("Run all — Calibration (3 files)");
    });

    it("scopes the label to the subfolder when the batch ran one", () => {
        const info = batchRunNotifyInfo({
            folderName: "Calibration",
            sub: "sims",
            total: 4,
            failCount: 1,
            durationMs: 20_000,
        });
        expect(info.fileName).toBe("Run all — Calibration/sims (4 files, 1 failed)");
        expect(info.folderName).toBe("Calibration");
    });

    it("zero-file batches stay coherent (stopped before anything finished)", () => {
        const info = batchRunNotifyInfo({
            folderName: "Empty",
            total: 0,
            failCount: 0,
            stopped: true,
            durationMs: 120,
        });
        expect(info.fileName).toBe("Run all — Empty (0 files)");
        expect(info.killed).toBe(true);
        expect(info.ok).toBe(false);
    });
});

/* ── formatByteCap (the truncation-notice label) ──────────────────── */

describe("formatByteCap", () => {
    it("keeps the historical 2 MB default for unset/invalid caps", () => {
        expect(formatByteCap(0)).toBe("2 MB");
        expect(formatByteCap(Number.NaN)).toBe("2 MB");
        expect(formatByteCap(-1)).toBe("2 MB");
    });

    it("formats MB with one decimal below 10 and integer above", () => {
        expect(formatByteCap(2_000_000)).toBe("2 MB");
        expect(formatByteCap(2_500_000)).toBe("2.5 MB");
        expect(formatByteCap(10_000_000)).toBe("10 MB");
    });

    it("formats KB with a minimum of 1", () => {
        expect(formatByteCap(500_000)).toBe("500 KB");
        expect(formatByteCap(10)).toBe("1 KB");
    });
});

/* ── formatElapsedRun (the live running pill) ─────────────────────── */

describe("formatElapsedRun", () => {
    it("renders mm:ss below an hour", () => {
        expect(formatElapsedRun(0)).toBe("00:00");
        expect(formatElapsedRun(59_999)).toBe("00:59");
        expect(formatElapsedRun(61_000)).toBe("01:01");
    });

    it("rolls to h:mm:ss at the hour and clamps negatives", () => {
        expect(formatElapsedRun(3_600_000)).toBe("1:00:00");
        expect(formatElapsedRun(3_723_000)).toBe("1:02:03");
        expect(formatElapsedRun(-5_000)).toBe("00:00");
        expect(formatElapsedRun(Number.NaN)).toBe("00:00");
    });
});
