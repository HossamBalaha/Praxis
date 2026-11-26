import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import {resolveSnapshotFile, validateSnapshotId,} from "../list/route-helpers";
import {ensureSnapshotScheduler} from "@/lib/local-history-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    // Lazy-start the periodic snapshot scheduler (see the list route).
    ensureSnapshotScheduler();
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") ?? "";
    const file = url.searchParams.get("file") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!folder || !file || !id) {
        return NextResponse.json(
            {ok: false, error: "Missing folder, file, or id"},
            {status: 400}
        );
    }
    if (!validateSnapshotId(id)) {
        return NextResponse.json(
            {ok: false, error: "Invalid snapshot id"},
            {status: 400}
        );
    }
    try {
        // canonical dir first, then the legacy
        // 16-char dir (pre-unification snapshots).
        const filePath = await resolveSnapshotFile(folder, file, id);
        const content = await fs.readFile(filePath, "utf-8");
        return NextResponse.json({ok: true, content});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: (err as Error).message},
            {status: 500}
        );
    }
}
