/**
 * named layout presets over the page's
 * existing panel state (sidebar / bottom panel + tab / split pane +
 * orientation / AI chat). The page applies them; the navbar cycler
 * steps through them. The last-used preset id persists to
 * localStorage so reloads start where the user left off.
 */

export type LayoutPresetId =
    | "editor-output"
    | "editor-terminal"
    | "triple"
    | "zen"
    | "editor-ai"
    | "terminal-focus"
    | "stacked-split"
    | "file-browser"
    | "full-studio";

export interface LayoutPresetTarget {
    sidebarVisible: boolean;
    bottomPanelOpen: boolean;
    /** The page's full bottom-tab union (presets only set output /
     *  terminal). */
    bottomTab: string;
    splitPaneOpen: boolean;
    splitOrientation: "right" | "down";
    aiChatOpen: boolean;
    distractionFree: boolean;
}

export interface LayoutPreset {
    id: LayoutPresetId;
    label: string;
    description: string;
    apply: (current: LayoutPresetTarget) => LayoutPresetTarget;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
    {
        id: "editor-output",
        label: "Editor + Output",
        description: "Sidebar, editor and the Output tab — the classic working view.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: true,
            bottomTab: "output",
            splitPaneOpen: false,
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "editor-terminal",
        label: "Editor + Terminal",
        description: "Sidebar, editor and the integrated terminal.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: true,
            bottomTab: "terminal",
            splitPaneOpen: false,
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "triple",
        label: "Triple split",
        description: "Sidebar, split editor panes side-by-side and the bottom panel.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: true,
            bottomTab: c.bottomTab === "terminal" ? "terminal" : "output",
            splitPaneOpen: true,
            splitOrientation: "right",
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "zen",
        label: "Zen",
        description: "Distraction-free — just the editor (Shift+F11 twin).",
        apply: (c) => ({
            ...c,
            sidebarVisible: false,
            bottomPanelOpen: false,
            splitPaneOpen: false,
            aiChatOpen: false,
            distractionFree: true,
        }),
    },
    {
        id: "editor-ai",
        label: "Editor + AI Chat",
        description: "The editor with the AI chat open on the side — pair-writing sessions.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: false,
            splitPaneOpen: false,
            aiChatOpen: true,
            distractionFree: false,
        }),
    },
    {
        id: "terminal-focus",
        label: "Terminal Focus",
        description: "Max-height terminal with the explorer hidden — shell-first work.",
        apply: (c) => ({
            ...c,
            sidebarVisible: false,
            bottomPanelOpen: true,
            bottomTab: "terminal",
            splitPaneOpen: false,
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "stacked-split",
        label: "Stacked Split",
        description: "Split editor panes stacked top/bottom with the Output tab below.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: true,
            bottomTab: c.bottomTab === "terminal" ? "terminal" : "output",
            splitPaneOpen: true,
            splitOrientation: "down",
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "file-browser",
        label: "File Browser",
        description: "Explorer only — file management, favorites and folder actions.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: false,
            splitPaneOpen: false,
            aiChatOpen: false,
            distractionFree: false,
        }),
    },
    {
        id: "full-studio",
        label: "Full Studio",
        description: "Everything on — explorer, side-by-side split panes, Output and the AI chat.",
        apply: (c) => ({
            ...c,
            sidebarVisible: true,
            bottomPanelOpen: true,
            bottomTab: c.bottomTab === "terminal" ? "terminal" : "output",
            splitPaneOpen: true,
            splitOrientation: "right",
            aiChatOpen: true,
            distractionFree: false,
        }),
    },
];

const KEY = "praxis.layout-preset";

export function loadLastPreset(): LayoutPresetId | null {
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        return LAYOUT_PRESETS.some((p) => p.id === raw) ? (raw as LayoutPresetId) : null;
    } catch {
        return null;
    }
}

export function saveLastPreset(id: LayoutPresetId): void {
    try {
        window.localStorage.setItem(KEY, id);
    } catch {
        /* quota — ignore */
    }
}

/** The preset AFTER `id` in the cycle (wraps). */
export function nextPreset(id: LayoutPresetId | null): LayoutPreset {
    const idx = LAYOUT_PRESETS.findIndex((p) => p.id === id);
    return LAYOUT_PRESETS[(idx + 1 + LAYOUT_PRESETS.length) % LAYOUT_PRESETS.length];
}
