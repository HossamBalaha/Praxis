import {NextResponse} from "next/server";
import {saveLocalHistorySnapshot} from "../list/route-helpers";
import {ensureSnapshotScheduler, schedulerStatus,} from "@/lib/local-history-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/local-history/save — write ONE snapshot for a folder/file.
 *
 * Body: { folder, file, content, label? }
 *
 * The write itself goes through the SHARED saveLocalHistorySnapshot
 * helper (the exact code /api/file-write and /api/import-py use for
 * their save-time snapshots) so the manual path, the edit path and the
 * periodic scheduler all land in the one layout the list / diff /
 * restore routes read — including the 50-per-file prune.
 *
 * Calling this route (like every local-history route) also
 * lazily arms the PERIODIC snapshot scheduler: the first local-history
 * API call of a server session starts the 5-minute pass; the timer is
 * unref'd so it never keeps the process alive.
 */
export async function POST(request: Request) {
    // Lazy start: arm the periodic pass on the FIRST local-history call.
    ensureSnapshotScheduler();
    try {
        const body = (await request.json()) as {
            folder?: string;
            file?: string;
            content?: string;
            label?: string;
        };
        const {folder, file, content, label} = body;
        if (!folder || !file || content === undefined) {
            return NextResponse.json(
                {ok: false, error: "Missing folder, file, or content"},
                {status: 400}
            );
        }
        const id = await saveLocalHistorySnapshot(folder, file, content, {
            // an optional human label for MANUAL snapshots
            // (a .label sidecar the list route picks up and the Local History
            // dialog renders next to the time).
            label,
        });
        if (id === null) {
            return NextResponse.json(
                {ok: false, error: "Snapshot could not be written (history dir not writable?)"},
                {status: 500}
            );
        }
        return NextResponse.json({ok: true, id, scheduler: schedulerStatus()});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: (err as Error).message},
            {status: 500}
        );
    }
}
