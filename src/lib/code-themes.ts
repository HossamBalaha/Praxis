/**
 * Shared code-theme registry — the ONE list + the ONE persistence
 * key (`praxis.code-theme`) behind BOTH viewers:
 *
 *   ▸ the Python editor (src/components/code-viewer.tsx) — its
 *     24-theme picker (One Light, One Dark, Dracula, …);
 *   ▸ every OTHER language's viewer (src/components/file-viewer.tsx)
 *     — the source view resolves through this SAME list and this
 *     SAME key, so picking a theme from either bar restyles both
 *     viewers consistently.
 *
 * Extracted verbatim from code-viewer.tsx (the array, the entry
 * shape, the storage helpers) so there is exactly one source of
 * truth; both components import from here.
 */

import {
    a11yDark as rsA11yDark,
    atomDark as rsAtomDark,
    dracula as rsDracula,
    duotoneDark as rsDuotoneDark,
    duotoneEarth as rsDuotoneEarth,
    duotoneForest as rsDuotoneForest,
    duotoneLight as rsDuotoneLight,
    duotoneSea as rsDuotoneSea,
    duotoneSpace as rsDuotoneSpace,
    ghcolors as rsGhColors,
    gruvboxDark as rsGruvboxDark,
    gruvboxLight as rsGruvboxLight,
    materialDark as rsMaterialDark,
    materialLight as rsMaterialLight,
    materialOceanic as rsMaterialOceanic,
    nightOwl as rsNightOwl,
    nord as rsNord,
    oneDark as rsOneDark,
    oneLight as rsOneLight,
    solarizedlight as rsSolarizedLight,
    tomorrow as rsTomorrow,
    twilight as rsTwilight,
    vscDarkPlus as rsVscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

export interface CodeThemeEntry {
    id: string;
    label: string;
    bg: string;
    keyword: string;
    str: string;
    /** The react-syntax-highlighter Prism style for view mode. */
    rsStyle: Record<string, unknown>;
    isDark: boolean;
}

/** Same key the Python editor has always used — now shared. */
export const CODE_THEME_STORAGE_KEY = "praxis.code-theme";

/** All 24 Prism themes (verbatim from the Python editor's list). */
export const CODE_THEMES: CodeThemeEntry[] = [
    {
        id: "follow",
        label: "Follow global",
        bg: "#808080",
        keyword: "#808080",
        str: "#808080",
        rsStyle: rsOneDark,
        isDark: true
    },
    {
        id: "one-dark",
        label: "One Dark",
        bg: "#282c34",
        keyword: "#c678dd",
        str: "#98c379",
        rsStyle: rsOneDark,
        isDark: true
    },
    {
        id: "one-light",
        label: "One Light",
        bg: "#fafafa",
        keyword: "#a626a4",
        str: "#50a14f",
        rsStyle: rsOneLight,
        isDark: false
    },
    {
        id: "dracula",
        label: "Dracula",
        bg: "#282a36",
        keyword: "#ff79c6",
        str: "#f1fa8c",
        rsStyle: rsDracula,
        isDark: true
    },
    {
        id: "vsc-dark-plus",
        label: "VS Code Dark+",
        bg: "#1e1e1e",
        keyword: "#569cd6",
        str: "#ce9178",
        rsStyle: rsVscDarkPlus,
        isDark: true
    },
    {id: "nord", label: "Nord", bg: "#2e3440", keyword: "#81a1c1", str: "#a3be8c", rsStyle: rsNord, isDark: true},
    {
        id: "night-owl",
        label: "Night Owl",
        bg: "#011627",
        keyword: "#c792ea",
        str: "#ecc48d",
        rsStyle: rsNightOwl,
        isDark: true
    },
    {
        id: "material-oceanic",
        label: "Material Oceanic",
        bg: "#0f111a",
        keyword: "#c792ea",
        str: "#c3e88d",
        rsStyle: rsMaterialOceanic,
        isDark: true
    },
    {
        id: "material-dark",
        label: "Material Dark",
        bg: "#263238",
        keyword: "#c792ea",
        str: "#c3e88d",
        rsStyle: rsMaterialDark,
        isDark: true
    },
    {
        id: "material-light",
        label: "Material Light",
        bg: "#fafafa",
        keyword: "#c792ea",
        str: "#c3e88d",
        rsStyle: rsMaterialLight,
        isDark: false
    },
    {
        id: "gruvbox-dark",
        label: "Gruvbox Dark",
        bg: "#282828",
        keyword: "#fb4934",
        str: "#b8bb26",
        rsStyle: rsGruvboxDark,
        isDark: true
    },
    {
        id: "gruvbox-light",
        label: "Gruvbox Light",
        bg: "#fbf1c7",
        keyword: "#9d0006",
        str: "#79740e",
        rsStyle: rsGruvboxLight,
        isDark: false
    },
    {
        id: "tomorrow",
        label: "Tomorrow",
        bg: "#ffffff",
        keyword: "#8959a8",
        str: "#718c00",
        rsStyle: rsTomorrow,
        isDark: false
    },
    {
        id: "twilight",
        label: "Twilight",
        bg: "#141414",
        keyword: "#f9ee98",
        str: "#8f9d6a",
        rsStyle: rsTwilight,
        isDark: true
    },
    {
        id: "atom-dark",
        label: "Atom Dark",
        bg: "#1d1f21",
        keyword: "#cc6666",
        str: "#99c794",
        rsStyle: rsAtomDark,
        isDark: true
    },
    {
        id: "ghcolors",
        label: "GitHub Colors",
        bg: "#ffffff",
        keyword: "#0086b3",
        str: "#183691",
        rsStyle: rsGhColors,
        isDark: false
    },
    {
        id: "solarized-light",
        label: "Solarized Light",
        bg: "#fdf6e3",
        keyword: "#859900",
        str: "#2aa198",
        rsStyle: rsSolarizedLight,
        isDark: false
    },
    {
        id: "duotone-dark",
        label: "Duotone Dark",
        bg: "#2a2734",
        keyword: "#fc929e",
        str: "#aaadbe",
        rsStyle: rsDuotoneDark,
        isDark: true
    },
    {
        id: "duotone-light",
        label: "Duotone Light",
        bg: "#faf8f5",
        keyword: "#aaadbe",
        str: "#b29762",
        rsStyle: rsDuotoneLight,
        isDark: false
    },
    {
        id: "duotone-sea",
        label: "Duotone Sea",
        bg: "#1d262f",
        keyword: "#84e7e3",
        str: "#a6bdde",
        rsStyle: rsDuotoneSea,
        isDark: true
    },
    {
        id: "duotone-space",
        label: "Duotone Space",
        bg: "#2a2734",
        keyword: "#aaadbe",
        str: "#fc929e",
        rsStyle: rsDuotoneSpace,
        isDark: true
    },
    {
        id: "duotone-forest",
        label: "Duotone Forest",
        bg: "#2a2734",
        keyword: "#5cc9b5",
        str: "#aaadbe",
        rsStyle: rsDuotoneForest,
        isDark: true
    },
    {
        id: "duotone-earth",
        label: "Duotone Earth",
        bg: "#2a2734",
        keyword: "#d88f2b",
        str: "#aaadbe",
        rsStyle: rsDuotoneEarth,
        isDark: true
    },
    {
        id: "a11y-dark",
        label: "A11y Dark",
        bg: "#2b2b2b",
        keyword: "#ffc66d",
        str: "#a5c261",
        rsStyle: rsA11yDark,
        isDark: true
    },
];

export function loadCodeTheme(): string {
    if (typeof window === "undefined") return "follow";
    try {
        return window.localStorage.getItem(CODE_THEME_STORAGE_KEY) || "follow";
    } catch {
        return "follow";
    }
}

export function saveCodeTheme(id: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(CODE_THEME_STORAGE_KEY, id);
    } catch { /* */
    }
}

/**
 * Resolve the effective entry — the exact ladder the Python editor
 * uses, shared so the other languages' viewer resolves identically:
 * explicit local pick ▸ settings' default (unless "follow") ▸ "follow"
 * ▸ dark/light fallback (One Dark / One Light).
 */
/** The BACKGROUND COLOR a viewer should paint for a resolved entry.
 *  The "follow" entry carries a PLACEHOLDER bg (grey swatch for the
 *  picker chip) — painting it as the code surface left the editors
 *  grey while on "Follow global theme". Follow resolves by the app's
 *  family instead: One Dark in dark mode, One Light in light mode. */
export function codeBgFor(entry: CodeThemeEntry, isDark: boolean): string {
    if (entry.id !== "follow") return entry.bg;
    return (isDark ? CODE_THEMES[1] : CODE_THEMES[2]).bg;
}

export function resolveCodeThemeEntry(opts: {
    mounted: boolean;
    localId: string;
    settingsTheme?: string;
    isDark: boolean;
}): CodeThemeEntry {
    const effective =
        opts.mounted && opts.localId !== "follow"
            ? opts.localId
            : opts.settingsTheme && opts.settingsTheme !== "follow"
                ? opts.settingsTheme
                : "follow";
    return (
        CODE_THEMES.find((t) => t.id === effective) ??
        (opts.isDark ? CODE_THEMES[1] : CODE_THEMES[2])
    );
}
