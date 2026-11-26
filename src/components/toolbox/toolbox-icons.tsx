"use client";

/**
 * toolbox-icons.tsx — the ONE shared per-category icon map for the
 * Developer Toolbox (Section 4 icon-consistency work).
 *
 * RULE: a category shows the SAME icon at EVERY site — the navigation
 * menus (menu-bar's Tools / Data "Developer Toolbox…" entries), the
 * top-bar toolbox quick-action button, the Developer Toolbox dialog
 * itself (title, category dropdown, header chip). Ad-hoc per-site icon
 * picks are replaced with lookups into this map so the icons can never
 * drift apart again.
 *
 * The picks follow the per-tool icons the registry already uses
 * (dev-toolbox.tsx: ArrowRightLeft = the converter rows, Binary = the
 * encoders, Table2 = the data tables…), so a category's chip matches
 * the tools listed under it. Media suites take their suite glyph.
 *
 * Count-agnostic on purpose: the registry size lives in
 * dev-toolbox.tsx (609 tools / 20 categories, every category ≥ 30 —
 * guarded by the wrap-and-toolbox unit test); this module only owns
 * ICONS, never counts.
 */

import * as React from "react";
import type {LucideIcon} from "lucide-react";
import {
    AlignLeft,
    ArrowRightLeft,
    AudioWaveform,
    BarChart3,
    Binary,
    Braces,
    Clock3,
    FileText,
    Film,
    Fingerprint,
    Hash,
    Image as ImageIcon,
    KeyRound,
    Link2,
    Palette,
    ScanText,
    ShieldCheck,
    Sigma,
    Table2,
    Type,
    Wrench,
} from "lucide-react";

/** The canonical per-category icon map — one entry per registry
 *  category (20 today; unknown keys fall back gracefully). */
export const TOOLBOX_CATEGORY_ICONS: Record<string, LucideIcon> = {
    Converters: ArrowRightLeft,
    Encoders: Binary,
    Text: Type,
    Generators: Hash,
    "Hash & Crypto": Fingerprint,
    Color: Palette,
    "URL & Network": Link2,
    Time: Clock3,
    Reference: Braces,
    "Image Studio": ImageIcon,
    "Image → Text": ScanText,
    "Video Studio": Film,
    "Audio Studio": AudioWaveform,
    "PDF Studio": FileText,
    "Data & Tables": Table2,
    "Math & Calc": Sigma,
    Formatters: AlignLeft,
    Security: KeyRound,
    Validators: ShieldCheck,
    "Text Analysis": BarChart3,
};

/** The canonical TOOLBOX icon — the toolbox itself (not a category).
 *  The top-bar wrench button, the Tools ▸ Developer Toolbox… menu
 *  items and the dialog title all render THIS, so the entity reads as
 *  one thing everywhere. */
export const TOOLBOX_ICON: LucideIcon = Wrench;

/** Fallback for a category missing from the map (registry drift) —
 *  every map consumer must go through toolboxCategoryIcon so the
 *  fallback actually applies. */
export const TOOLBOX_ICON_FALLBACK: LucideIcon = Wrench;

/** The ONE lookup sites must use — map hit or the fallback icon. */
export function toolboxCategoryIcon(category: string): LucideIcon {
    return TOOLBOX_CATEGORY_ICONS[category] ?? TOOLBOX_ICON_FALLBACK;
}

/** Render-site helper: draws a category's icon (map + fallback) from
 *  a plain prop, so consumers never mint a component during render
 *  (react-hooks/static-components). Use this in JSX. */
export function ToolboxCategoryIcon({
                                        category,
                                        className,
                                    }: {
    category: string;
    className?: string;
}) {
    // lowercase alias + createElement on purpose — a capitalized const
    //  assigned from the lookup would read as a component minted
    //  during render (react-hooks/static-components).
    const icon = toolboxCategoryIcon(category);
    return React.createElement(icon, {className});
}
