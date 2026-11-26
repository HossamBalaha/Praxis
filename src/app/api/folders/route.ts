import {NextResponse} from "next/server";
import {listFolders, restoreActiveProjectRoot} from "@/lib/scripts";

/**
 * GET /api/folders
 *
 * Returns the full folder / file tree of the ACTIVE project. The
 * directory is re-scanned on every request, so adding or removing a
 * folder or file is reflected in the UI without a server restart.
 *
 * Cold-start guard: on the first page load after a server restart
 * this route races /api/projects and /api/project-settings. Without
 * the restore below, a custom project's pointer was not yet loaded
 * when the tree was scanned — the explorer listed the DEFAULT
 * project and nothing re-fetched when the pointer landed.
 */
export async function GET(request: Request) {
    await restoreActiveProjectRoot();
    // ?hidden=1 surfaces dot-directories (.praxis!) and dot-files —
    // the explorer's show-hidden toggle.
    const url = new URL(request.url);
    const includeHidden = url.searchParams.get("hidden") === "1";
    const folders = await listFolders(includeHidden);
    return NextResponse.json({folders});
}
