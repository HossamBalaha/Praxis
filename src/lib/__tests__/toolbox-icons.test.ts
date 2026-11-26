/**
 * Tests for the shared Developer-Toolbox icon map
 * (src/components/toolbox/toolbox-icons.tsx).
 *
 * Section 4 icon-consistency rule: EVERY registry category must have
 * an entry in the ONE shared per-category map, so no site (dropdown
 * rows, header chip, trigger portal, menu-bar entries) ever falls
 * back to the generic wrench without the drift being caught here.
 *
 * Like wrap-and-toolbox.test.ts, this reads the two files as TEXT
 * instead of importing them — importing dev-toolbox.tsx would pull
 * the whole toolbox chunk (every tool component) into the test.
 */

import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const devToolboxSource = readFileSync(
    resolve(__dirname, "../../components/dev-toolbox.tsx"),
    "utf-8"
);
const iconsSource = readFileSync(
    resolve(__dirname, "../../components/toolbox/toolbox-icons.tsx"),
    "utf-8"
);

/** The registry's category strings — every category is spelled out as
 *  a `category: "…"` literal somewhere inside the TOOLS array (rows,
 *  spec-module spreads and engine tuples alike). */
function registryCategories(): Set<string> {
    const start = devToolboxSource.indexOf("const TOOLS: ToolDef[] = [");
    const end = devToolboxSource.indexOf("\n];", start);
    expect(start, "the TOOLS registry must exist").toBeGreaterThan(-1);
    const body = devToolboxSource.slice(start, end);
    const names = new Set<string>();
    for (const m of body.matchAll(/category: "([^"]+)"/g)) names.add(m[1]);
    return names;
}

/** The map's keys — bare identifiers and quoted keys alike. */
function mapKeys(): Set<string> {
    const start = iconsSource.indexOf(
        "TOOLBOX_CATEGORY_ICONS: Record<string, LucideIcon> = {"
    );
    const end = iconsSource.indexOf("\n};", start);
    expect(start, "the TOOLBOX_CATEGORY_ICONS map must exist").toBeGreaterThan(-1);
    const body = iconsSource.slice(start, end);
    const keys = new Set<string>();
    for (const m of body.matchAll(/(?:^|\n)\s*(?:"([^"]+)"|([A-Za-z][\w &]*)): /g)) {
        keys.add(m[1] ?? m[2]);
    }
    return keys;
}

describe("toolbox per-category icon map", () => {
    it("covers EVERY registry category (the fallback never silently applies)", () => {
        const registry = registryCategories();
        const map = mapKeys();
        // 20 categories today — the registry shape guard lives in
        // wrap-and-toolbox.test.ts; here we only need "every one mapped".
        expect(registry.size).toBe(20);
        const missing = [...registry].filter((c) => !map.has(c));
        expect(missing, `categories missing an icon: ${missing.join(", ")}`).toEqual([]);
    });

    it("keeps the canonical toolbox glyph + a fallback in the shared module", () => {
        expect(iconsSource).toContain("export const TOOLBOX_ICON: LucideIcon = Wrench");
        expect(iconsSource).toContain("export const TOOLBOX_ICON_FALLBACK: LucideIcon = Wrench");
        expect(iconsSource).toContain("export function toolboxCategoryIcon(");
    });

    it("is the module the menu bar + dialog consume (no ad-hoc per-site picks)", () => {
        // the toolbox entity glyph + the category icons come from the map,
        // not from per-site lucide imports.
        expect(devToolboxSource).toContain("TOOLBOX_ICON as ToolboxIcon");
        expect(devToolboxSource).toContain("<ToolboxCategoryIcon");
    });
});
