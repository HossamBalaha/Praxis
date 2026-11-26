/**
 * unit tests for the project-overrides merge in src/lib/settings.ts:
 *   ▸ mergeProjectSettings — plain values replace wholesale, while the
 *     MAP-shaped settings (topRightQuickActions, formatLangIndent,
 *     formatLangAutoSave) merge PER KEY so a project file can never wipe
 *     the browser's own entries (an empty shipped map used to reset the
 *     user's opt-in quick actions on every reload).
 *
 * Pure logic only — the node vitest environment is enough (no
 * localStorage is touched; the helpers take explicit objects).
 */
import {describe, expect, it} from "vitest";
import {DEFAULT_SETTINGS, mergeProjectSettings, type Settings,} from "@/lib/settings";

const base = (): Settings => ({
    ...DEFAULT_SETTINGS,
    topRightQuickActions: {run: false, palette: true, jump: true},
    formatLangIndent: {sql: 4},
    formatLangAutoSave: {yaml: true},
});

describe("mergeProjectSettings — plain values", () => {
    it("replaces plain values wholesale", () => {
        const out = mergeProjectSettings(base(), {runTimeoutSeconds: 120});
        expect(out.runTimeoutSeconds).toBe(120);
        expect(out.cacheTtlSeconds).toBe(DEFAULT_SETTINGS.cacheTtlSeconds);
    });

    it("replaces arrays wholesale (provider lists are not merged)", () => {
        const out = mergeProjectSettings(base(), {
            aiChatProviders: [{
                id: "p1",
                name: "P",
                kind: "openai",
                baseUrl: "http://x",
                apiKey: "",
                model: "m",
                enabled: true
            }],
        });
        expect(out.aiChatProviders).toHaveLength(1);
    });

    it("returns the base untouched for null/undefined/empty overrides", () => {
        const b = base();
        expect(mergeProjectSettings(b, null)).toBe(b);
        expect(mergeProjectSettings(b, undefined)).toBe(b);
        expect(mergeProjectSettings(b, {})).toBe(b);
    });
});

describe("mergeProjectSettings — map-shaped settings merge per key", () => {
    it("an EMPTY project map never wipes the browser's opt-in quick actions", () => {
        const out = mergeProjectSettings(base(), {topRightQuickActions: {}});
        expect(out.topRightQuickActions).toEqual({run: false, palette: true, jump: true});
    });

    it("project pins win, browser entries fill the rest", () => {
        const out = mergeProjectSettings(base(), {topRightQuickActions: {run: true}});
        expect(out.topRightQuickActions).toEqual({run: true, palette: true, jump: true});
    });

    it("per-language indent pins merge per language", () => {
        const out = mergeProjectSettings(base(), {formatLangIndent: {json: 2}});
        expect(out.formatLangIndent).toEqual({sql: 4, json: 2});
    });

    it("per-language format-on-save pins merge per language", () => {
        const out = mergeProjectSettings(base(), {formatLangAutoSave: {json: false}});
        expect(out.formatLangAutoSave).toEqual({yaml: true, json: false});
    });

    it("a project map without the key leaves the browser map untouched", () => {
        const out = mergeProjectSettings(base(), {runTimeoutSeconds: 30});
        expect(out.topRightQuickActions).toEqual({run: false, palette: true, jump: true});
    });
});
