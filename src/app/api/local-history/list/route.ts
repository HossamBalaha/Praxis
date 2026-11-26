import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {historyRoot, snapshotDirs, validateSnapshotId,} from "./route-helpers";
import {ensureSnapshotScheduler} from "@/lib/local-history-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Snapshot {
    id: string;
    ts: number;
    size: number;
    /** human label attached to MANUAL snapshots
     *  ("Save labeled snapshot now") — absent on automatic ones. */
    label?: string;
}

export {snapshotDirs, validateSnapshotId, historyRoot};

export async function GET(request: Request) {
    // Lazy-start the PERIODIC snapshot scheduler on the first
    // local-history API call (idempotent; a no-op under vitest; the
    // timer is unref'd so it never keeps the server alive).
    ensureSnapshotScheduler();
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") ?? "";
    const file = url.searchParams.get("file") ?? "";
    if (!folder || !file) {
        return NextResponse.json(
            {ok: false, error: "Missing folder or file", snapshots: []},
            {status: 400}
        );
    }
    try {
        // read BOTH the canonical (12-char hash)
        // dir and the legacy 16-char one that file-write wrote to before
        // the hash lengths were unified — merged + deduped by id so old
        // snapshots resurface.
        const snapshots: Snapshot[] = [];
        const seen = new Set<string>();
        for (const dir of snapshotDirs(folder, file)) {
            let entries: string[] = [];
            try {
                entries = await fs.readdir(dir);
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (!entry.endsWith(".txt")) continue;
                const id = entry.slice(0, -4);
                if (!validateSnapshotId(id) || seen.has(id)) continue;
                try {
                    const stat = await fs.stat(path.join(dir, entry));
                    seen.add(id);
                    let label: string | undefined;
                    try {
                        label = (await fs.readFile(path.join(dir, `${id}.label`), "utf-8")).trim() || undefined;
                    } catch {
                        /* no label sidecar — automatic snapshot */
                    }
                    snapshots.push({id, ts: Number(id), size: stat.size, label});
                } catch {
                }
            }
        }
        snapshots.sort((a, b) => b.ts - a.ts);
        // Prune to max 50 (oldest first to delete) — across both dirs.
        if (snapshots.length > 50) {
            const toDelete = snapshots.slice(50);
            for (const s of toDelete) {
                for (const dir of snapshotDirs(folder, file)) {
                    try {
                        await fs.unlink(path.join(dir, `${s.id}.txt`));
                    } catch {
                    }
                    try {
                        await fs.unlink(path.join(dir, `${s.id}.label`));
                    } catch {
                    }
                }
            }
            snapshots.splice(50);
        }
        return NextResponse.json({ok: true, snapshots});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: (err as Error).message, snapshots: []},
            {status: 500}
        );
    }
}
