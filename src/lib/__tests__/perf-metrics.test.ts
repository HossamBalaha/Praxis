/**
 * perf-metrics.test.ts — unit tests for the render-report API the
 * Perf HUD reads (src/lib/perf-metrics.ts, item G23):
 *
 *   ▸ reportPanelRender bumps the shared registry and shows up in
 *     getSnapshot().renderCounts (the exact path the HUD renders).
 *   ▸ noteRender and reportPanelRender share ONE registry, so labels
 *     stay comparable no matter which entry point a panel uses.
 *   │ garbage panel ids (empty / blank / oversized / non-string) are
 *     ignored instead of polluting the HUD's top-6 list.
 *   ▸ the perfMetrics hub mirror + reset() clear the counters.
 *
 * Pure module-state logic — the rAF loop never starts in node (start()
 * guards on `typeof window`), so this stays a plain node test.
 */
import {beforeEach, describe, expect, it} from "vitest";
import {noteRender, perfMetrics, reportPanelRender,} from "@/lib/perf-metrics";

beforeEach(() => {
    perfMetrics.reset();
});

describe("reportPanelRender — the panel-facing API", () => {
    it("bumps a cumulative per-label counter the HUD snapshot can read", () => {
        reportPanelRender("Editor");
        reportPanelRender("Editor");
        reportPanelRender("Editor");
        expect(perfMetrics.getSnapshot().renderCounts["Editor"]).toBe(3);
    });

    it("shares the registry with noteRender (labels are comparable)", () => {
        reportPanelRender("Terminal");
        noteRender("Terminal");
        noteRender("Terminal");
        expect(perfMetrics.getSnapshot().renderCounts["Terminal"]).toBe(3);
    });

    it("counts distinct labels independently", () => {
        reportPanelRender("EditorTabs");
        reportPanelRender("Console");
        reportPanelRender("Console");
        const counts = perfMetrics.getSnapshot().renderCounts;
        expect(counts["EditorTabs"]).toBe(1);
        expect(counts["Console"]).toBe(2);
    });

    it("ignores garbage ids so the HUD's list never fills with noise", () => {
        reportPanelRender("");
        reportPanelRender("   ");
        reportPanelRender("x".repeat(64));
        // Non-string ids are a runtime hazard (dynamic callers), not a
        // compile-time one — the guard must hold anyway.
        reportPanelRender(undefined as unknown as string);
        reportPanelRender(42 as unknown as string);
        expect(Object.keys(perfMetrics.getSnapshot().renderCounts)).toEqual([]);
    });

    it("trims surrounding whitespace from the label", () => {
        reportPanelRender("  Editor  ");
        expect(perfMetrics.getSnapshot().renderCounts["Editor"]).toBe(1);
    });

    it("is mirrored on the perfMetrics hub object", () => {
        perfMetrics.reportPanelRender("Output");
        expect(perfMetrics.getSnapshot().renderCounts["Output"]).toBe(1);
    });

    it("reset() clears the render counters", () => {
        reportPanelRender("Editor");
        perfMetrics.reset();
        expect(perfMetrics.getSnapshot().renderCounts["Editor"]).toBeUndefined();
    });
});
