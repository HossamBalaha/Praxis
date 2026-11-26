/**
 * ui-themes.ts — the app-wide INTERFACE theme registry.
 *
 * Praxis used to ship exactly two looks (light + dark via next-themes).
 *. This registry
 * drives:
 * ▸ the menu-bar theme dropdown (a palette button + chevron listing
 * every theme with color swatches, VSCode-style),
 * ▸ Settings → Editor → "Interface theme",
 * ▸ globals.css, where each non-default id has a `[data-theme="…"]`
 * block overriding the full CSS-variable set.
 *
 * "light" and "dark" ride next-themes alone (no data-theme attribute —
 * they ARE the defaults). Every other id ALSO sets
 * `data-theme="<id>"` on <html>; because a themed block redefines every
 * variable the `.dark` / light base becomes irrelevant, but the class
 * still toggles for the `dark:` Tailwind variants — so an extended
 * theme sets.dark according to its FAMILY, keeping all existing
 * dark:-styled chrome (chips, borders, badges) coherent with its
 * family.
 */

export type ThemeFamily = "light" | "dark";

export interface UiThemeEntry {
    /** Stable id — equals the data-theme attribute value. */
    id: string;
    /** Label shown in the dropdown / settings. */
    label: string;
    /** Which base family the theme derives from (drives the .dark class). */
    family: ThemeFamily;
    /** Short one-line hint for the dropdown row tooltip. */
    hint: string;
    /** Swatch colors — the dropdown row shows bg / accent / fg dots. */
    swatch: { bg: string; panel: string; accent: string; fg: string };
}

/** The registry — order = dropdown order. Grouped LIGHT-first then
 *  DARK, so the picker reads like an IDE's theme menu. */
export const UI_THEMES: readonly UiThemeEntry[] = [
    // ─── LIGHT family ───────────────────────────────────────
    {
        id: "light",
        label: "Praxis Light",
        family: "light",
        hint: "The classic light workspace — clean paper white.",
        swatch: {bg: "#ffffff", panel: "#f5f5f5", accent: "#10b981", fg: "#24292f"},
    },
    {
        id: "vscode-light",
        label: "VS Code Light",
        family: "light",
        hint: "Visual Studio's default Light+ — blue links, soft greys.",
        swatch: {bg: "#ffffff", panel: "#f3f3f3", accent: "#007acc", fg: "#3b3b3b"},
    },
    {
        id: "github-light",
        label: "GitHub Light",
        family: "light",
        hint: "GitHub's clean light interface — familiar and neutral.",
        swatch: {bg: "#ffffff", panel: "#f6f8fa", accent: "#0969da", fg: "#1f2328"},
    },
    {
        id: "one-light",
        label: "One Light",
        family: "light",
        hint: "Atom's balanced light — warm grey surfaces, blue accent.",
        swatch: {bg: "#fafafa", panel: "#f0f0f0", accent: "#4078f2", fg: "#383a42"},
    },
    {
        id: "quiet-light",
        label: "Quiet Light",
        family: "light",
        hint: "VS Code's warm quiet light — rose-tinted paper for prose.",
        swatch: {bg: "#fdf6f3", panel: "#f5ece9", accent: "#b85252", fg: "#333333"},
    },
    {
        id: "nord-light",
        label: "Nord Light",
        family: "light",
        hint: "Nord's snowstorm side — frosty blues, cool and calm.",
        swatch: {bg: "#eceff4", panel: "#e5e9f0", accent: "#5e81ac", fg: "#2e3440"},
    },
    {
        id: "material-lighter",
        label: "Material Lighter",
        family: "light",
        hint: "Material Theme's lightest — pale blue panels, teal accent.",
        swatch: {bg: "#fafafa", panel: "#eef3f6", accent: "#00897b", fg: "#34454f"},
    },
    {
        id: "ayu-light",
        label: "Ayu Light",
        family: "light",
        hint: "Ayu's daylight side — soft orange on cream greys.",
        swatch: {bg: "#fafafa", panel: "#f2f2f2", accent: "#ff9940", fg: "#5c6166"},
    },
    {
        id: "everforest-light",
        label: "Everforest Light",
        family: "light",
        hint: "Everforest's daylight — green-tinged paper, calm contrast.",
        swatch: {bg: "#fdf6e3", panel: "#f3ead3", accent: "#8da101", fg: "#5c6a60"},
    },
    {
        id: "catppuccin-latte",
        label: "Catppuccin Latte",
        family: "light",
        hint: "Catppuccin's daylight side — soft pastel light.",
        swatch: {bg: "#eff1f5", panel: "#e6e9ef", accent: "#8839ef", fg: "#4c4f69"},
    },
    {
        id: "solarized-light",
        label: "Solarized Light",
        family: "light",
        hint: "The warm cream classic — reading-friendly daylight.",
        swatch: {bg: "#fdf6e3", panel: "#eee8d5", accent: "#268bd2", fg: "#657b83"},
    },
    {
        id: "gruvbox-light",
        label: "Gruvbox Light",
        family: "light",
        hint: "Retro groove in daylight — faded paper and warm ink.",
        swatch: {bg: "#fbf1c7", panel: "#ebdbb2", accent: "#b57600", fg: "#3c3836"},
    },
    {
        id: "paper-sepia",
        label: "Paper Sepia",
        family: "light",
        hint: "An aged-manuscript sepia tone — gentle on the eyes.",
        swatch: {bg: "#f5ecd7", panel: "#ede0c8", accent: "#a3540d", fg: "#43361f"},
    },
    {
        id: "high-contrast-light",
        label: "High Contrast Light",
        family: "light",
        hint: "Pure white with black ink — maximum readability.",
        swatch: {bg: "#ffffff", panel: "#f2f2f2", accent: "#005a9e", fg: "#000000"},
    },
    // ─── further light themes ───────────────────────────────
    {
        id: "alabaster",
        label: "Alabaster",
        family: "light",
        hint: "The minimal light classic — near-white stone, one teal accent.",
        swatch: {bg: "#f7f7f7", panel: "#ededed", accent: "#55b8b9", fg: "#333333"},
    },
    {
        id: "tomorrow-light",
        label: "Tomorrow",
        family: "light",
        hint: "Base16 Tomorrow Light — soft greys with steel-blue links.",
        swatch: {bg: "#ffffff", panel: "#efefef", accent: "#4271ae", fg: "#4d4d4c"},
    },
    {
        id: "horizon-light",
        label: "Horizon Light",
        family: "light",
        hint: "Horizon's warm daylight — peach paper, coral accent.",
        swatch: {bg: "#fdf5f0", panel: "#f5e3dd", accent: "#e9597d", fg: "#1c1e29"},
    },
    {
        id: "rose-pine-dawn",
        label: "Rosé Pine Dawn",
        family: "light",
        hint: "The Rosé Pine sunrise — warm dawn cream with rose accents.",
        swatch: {bg: "#faf4ed", panel: "#f2e9e1", accent: "#d7827e", fg: "#576269"},
    },
    {
        id: "winter-is-coming-light",
        label: "Winter Is Coming (Light)",
        family: "light",
        hint: "Crisp pale frost — cool greys and an icy blue accent.",
        swatch: {bg: "#f2f2f2", panel: "#e6e6e6", accent: "#11a2e5", fg: "#1f1f1f"},
    },
    {
        id: "blueprint",
        label: "Blueprint",
        family: "light",
        hint: "Engineering drafting paper — pale blue sheet, deep ink lines.",
        swatch: {bg: "#eef3f8", panel: "#dce6f2", accent: "#1e5aa8", fg: "#1a2b3c"},
    },
    // ─── DARK family ───────────────────────────────────────
    {
        id: "dark",
        label: "Praxis Dark",
        family: "dark",
        hint: "The classic dark workspace — charcoal surfaces.",
        swatch: {bg: "#0a0a0a", panel: "#1a1a1a", accent: "#10b981", fg: "#fafafa"},
    },
    {
        id: "one-dark",
        label: "One Dark",
        family: "dark",
        hint: "Atom's beloved balanced dark — soft blue-grey surfaces.",
        swatch: {bg: "#282c34", panel: "#21252b", accent: "#61afef", fg: "#abb2bf"},
    },
    {
        id: "vscode-dark-plus",
        label: "VS Code Dark+",
        family: "dark",
        hint: "Visual Studio's default dark — deep blue-charcoal.",
        swatch: {bg: "#1e1e1e", panel: "#252526", accent: "#007acc", fg: "#d4d4d4"},
    },
    {
        id: "monokai",
        label: "Monokai",
        family: "dark",
        hint: "The classic warm dark with olive-brown editor vibes.",
        swatch: {bg: "#272822", panel: "#1e1f1c", accent: "#a6e22e", fg: "#f8f8f2"},
    },
    {
        id: "dracula",
        label: "Dracula",
        family: "dark",
        hint: "The famous purple-tinted dark palette.",
        swatch: {bg: "#282a36", panel: "#21222c", accent: "#bd93f9", fg: "#f8f8f2"},
    },
    {
        id: "nord",
        label: "Nord",
        family: "dark",
        hint: "Blustery cold blues — calm, low-contrast arctic dark.",
        swatch: {bg: "#2e3440", panel: "#3b4252", accent: "#88c0d0", fg: "#eceff4"},
    },
    {
        id: "gruvbox-dark",
        label: "Gruvbox Dark",
        family: "dark",
        hint: "Retro groove — warm beige-on-brown contrast.",
        swatch: {bg: "#282828", panel: "#32302f", accent: "#fabd2f", fg: "#ebdbb2"},
    },
    {
        id: "solarized-dark",
        label: "Solarized Dark",
        family: "dark",
        hint: "Ethan Schoonover's precise low-glare dark laboratory.",
        swatch: {bg: "#002b36", panel: "#073642", accent: "#2aa198", fg: "#93a1a1"},
    },
    {
        id: "tokyo-night",
        label: "Tokyo Night",
        family: "dark",
        hint: "Night-city blues with cyan neon accents.",
        swatch: {bg: "#1a1b26", panel: "#24283b", accent: "#7aa2f7", fg: "#c0caf5"},
    },
    {
        id: "rose-pine",
        label: "Rosé Pine",
        family: "dark",
        hint: "All natural — muted rose and pine on a soft dark base.",
        swatch: {bg: "#191724", panel: "#1f1d2e", accent: "#ebbcba", fg: "#e0def4"},
    },
    {
        id: "github-dark",
        label: "GitHub Dark",
        family: "dark",
        hint: "GitHub's dark mode — deep neutral blues and soft greys.",
        swatch: {bg: "#0d1117", panel: "#161b22", accent: "#58a6ff", fg: "#e6edf3"},
    },
    {
        id: "catppuccin-mocha",
        label: "Catppuccin Mocha",
        family: "dark",
        hint: "The soothing pastel dark — warm and low-strain.",
        swatch: {bg: "#1e1e2e", panel: "#181825", accent: "#cba6f7", fg: "#cdd6f4"},
    },
    {
        id: "catppuccin-frappe",
        label: "Catppuccin Frappé",
        family: "dark",
        hint: "Catppuccin's middle roast — softer than Mocha, still pastel.",
        swatch: {bg: "#303446", panel: "#292c3c", accent: "#ca9ee6", fg: "#c6d0f5"},
    },
    {
        id: "ayu-dark",
        label: "Ayu Dark",
        family: "dark",
        hint: "Ayu's calm dark — orange accents on slate blue.",
        swatch: {bg: "#0b0e14", panel: "#111521", accent: "#ff8f40", fg: "#bfbdb6"},
    },
    {
        id: "everforest-dark",
        label: "Everforest Dark",
        family: "dark",
        hint: "Green-toned comfort — the calm of a forest at dusk.",
        swatch: {bg: "#2d353b", panel: "#343f44", accent: "#a7c080", fg: "#d3c6aa"},
    },
    {
        id: "kanagawa-wave",
        label: "Kanagawa Wave",
        family: "dark",
        hint: "The Great Wave palette — blue-ink sumi-e tones.",
        swatch: {bg: "#1f1f28", panel: "#16161d", accent: "#7e9cd8", fg: "#dcd7ba"},
    },
    {
        id: "moonlight",
        label: "Moonlight",
        family: "dark",
        hint: "A violet night sky — indigo surfaces, lavender accent.",
        swatch: {bg: "#1f2133", panel: "#262a3f", accent: "#a5b0f5", fg: "#c8cbe8"},
    },
    {
        id: "shades-of-purple",
        label: "Shades of Purple",
        family: "dark",
        hint: "Royal purples with vivid cyan — a bold dark classic.",
        swatch: {bg: "#2b213c", panel: "#38305c", accent: "#a5b4fc", fg: "#f1f2f8"},
    },
    {
        id: "vesper",
        label: "Vesper",
        family: "dark",
        hint: "Minimal matte black-grey — an essay in restraint.",
        swatch: {bg: "#101010", panel: "#161616", accent: "#ffc999", fg: "#d0d0d0"},
    },
    {
        id: "synthwave-84",
        label: "Synthwave '84",
        family: "dark",
        hint: "Neon retro-future — purple sunsets and hot pink.",
        swatch: {bg: "#241b2f", panel: "#1a1721", accent: "#f97a72", fg: "#f8f8f2"},
    },
    {
        id: "high-contrast-dark",
        label: "High Contrast Dark",
        family: "dark",
        hint: "Near-black with bright white text — maximum readability.",
        swatch: {bg: "#000000", panel: "#0d0d0d", accent: "#2ea043", fg: "#ffffff"},
    },
    // ─── further dark themes ────────────────────────────────
    {
        id: "night-owl",
        label: "Night Owl",
        family: "dark",
        hint: "Sarah Drasner's deep navy night — electric blue accents.",
        swatch: {bg: "#011627", panel: "#0b2942", accent: "#82aaff", fg: "#d6deeb"},
    },
    {
        id: "material-ocean",
        label: "Material Ocean",
        family: "dark",
        hint: "Material's deepest blue with cyan ripples.",
        swatch: {bg: "#0f111a", panel: "#1f2233", accent: "#84ffff", fg: "#a6accd"},
    },
    {
        id: "arc-dark",
        label: "Arc Dark",
        family: "dark",
        hint: "The Arc desktop shell — slate surfaces, arcing blue.",
        swatch: {bg: "#2f343f", panel: "#383c4a", accent: "#5294e2", fg: "#d3dae3"},
    },
    {
        id: "rose-pine-moon",
        label: "Rosé Pine Moon",
        family: "dark",
        hint: "Rosé Pine's moonlit variant — twilight violet with rose.",
        swatch: {bg: "#232136", panel: "#2a2837", accent: "#ebbcba", fg: "#e0def4"},
    },
    {
        id: "panda-syntax",
        label: "Panda Syntax",
        family: "dark",
        hint: "The playful panda — warm charcoal with hot pink accents.",
        swatch: {bg: "#222223", panel: "#2a2a2b", accent: "#ff75b5", fg: "#e6e6e6"},
    },
    {
        id: "terminal-green",
        label: "Terminal Green",
        family: "dark",
        hint: "A retro CRT terminal — phosphor green on near-black.",
        swatch: {bg: "#07100b", panel: "#0b1a10", accent: "#2bd94e", fg: "#c8f7d4"},
    },
] as const;

/** Look up an entry (falls back to the family default). */
export function uiThemeById(id: string | null | undefined): UiThemeEntry {
    return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
}

/**
 * Apply an interface theme to the document root:
 *   ▸ data-theme attribute (empty for the two plain defaults) so
 *     globals.css' `[data-theme="…"]` blocks take over;
 *   ▸ returns the desired next-themes theme ("light" / "dark" — the
 *     family), which the caller passes to next-themes' setTheme so the
 *     `.dark` class + persisted storage stay consistent.
 */
export function applyUiTheme(id: string): ThemeFamily {
    const entry = uiThemeById(id);
    const root = document.documentElement;
    if (entry.id === "light" || entry.id === "dark") {
        root.removeAttribute("data-theme");
    } else {
        root.setAttribute("data-theme", entry.id);
    }
    return entry.family;
}
