"use client";

/**
 * toolbox PRELOAD channel.
 *
 * The Developer-toolbox media tools (image studio,
 * image → text, video studio, PDF studio) are LINKED from the file
 * edit/view UIs: opening an image/video/PDF and picking "Tools ▸ …"
 * now opens the toolbox with THAT file already loaded — no re-drop.
 *
 * Mechanism: page.tsx listens for the `praxis:open-toolbox` window
 * event ({ toolId, url, fileName, fileSlug, folderSlug }), opens the
 * DevToolbox dialog and stores the preload. The dialog wraps the
 * active tool in a ToolboxPreloadContext provider; the media suites
 * consume the context and fetch the URL into a File on mount.
 */

import * as React from "react";

export interface ToolPreload {
    /** Absolute URL of the open file (/api/file?...). */
    url: string;
    /** Display name (e.g. "SamplePhoto.jpeg"). */
    fileName: string;
    /** Optional slugs (future: direct save-back). */
    fileSlug?: string;
    folderSlug?: string;
}

export const ToolboxPreloadContext = React.createContext<ToolPreload | null>(null);

export function useToolboxPreload(): ToolPreload | null {
    return React.useContext(ToolboxPreloadContext);
}

/* ─── the toolbox save target ───────────────
*
* Two requirements, one behavior:
* ① "(Save into project) should save the new file in the same path
* as the edited file" — when a tool runs on a file that was
* preloaded from a project folder (Tools ▸ in the viewer), the
* result now lands in THAT folder, next to its source.
* ② "files in the main project dir should be on the same level of
* the folders and not in a new folder named with the same
* project" — with no preload (a file the user dropped by hand),
* output goes to the PROJECT ROOT (the explorer's synthetic
* first entry), never into a nested "Toolbox output" folder. */

/** slugify(".") — the sentinel the explorer's synthetic project-root
 *  entry carries; every route resolves it back to the project root. */
export const PROJECT_ROOT_SLUG = "Lg";

/** Where a toolbox result should be written: the source file's folder
 *  when one was preloaded, else the project root. */
export function toolboxSaveTarget(preload: ToolPreload | null): string {
    return preload?.folderSlug || PROJECT_ROOT_SLUG;
}

/** Fetch the preloaded URL into a File (for the drop-zone style
 * tools). Returns null when the fetch fails — the drop zone stays
 * ready and the user can still pick a file manually. */
export async function fetchPreloadFile(preload: ToolPreload): Promise<File | null> {
    try {
        const res = await fetch(preload.url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const name = preload.fileName || "file";
        return new File([blob], name, {type: blob.type || "application/octet-stream"});
    } catch {
        return null;
    }
}
