import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {getScriptsRoot} from "@/lib/scripts";

export function historyRoot(): string {
    return path.join(os.tmpdir(), "praxis-local-history");
}

/** The ACTIVE PROJECT's history dir — the 12-char-hash dir whose
 *  per-file snapshot subdirs every local-history route reads/writes.
 *  Exported so the periodic scheduler (lib/local-history-scheduler.ts)
 *  can keep its per-project state file next to the snapshots it
 *  writes through this same module. */
export function projectHistoryDir(): string {
    const projectHash = crypto
        .createHash("sha1")
        .update(getScriptsRoot())
        .digest("hex")
        .slice(0, 12);
    return path.join(historyRoot(), projectHash);
}

/** Canonical (12-char) project-hash dir — what every route READS and
 *  what file-write now WRITES (via the shared snapshotDir helper). */
export function snapshotDir(folderSlug: string, fileSlug: string): string {
    const projectHash = crypto
        .createHash("sha1")
        .update(getScriptsRoot())
        .digest("hex")
        .slice(0, 12);
    return path.join(historyRoot(), projectHash, folderSlug, fileSlug);
}

/** file-write used to build the snapshot dir
 *  with a 16-char hash while list/restore/diff read a 12-char one —
 *  snapshots were written but NEVER visible. The canonical dir is now
 *  the 12-char one everywhere; this returns the legacy 16-char sibling
 *  so existing on-disk snapshots stay readable. */
export function legacySnapshotDir(folderSlug: string, fileSlug: string): string {
    const legacyHash = crypto
        .createHash("sha1")
        .update(getScriptsRoot())
        .digest("hex")
        .slice(0, 16);
    return path.join(historyRoot(), legacyHash, folderSlug, fileSlug);
}

/** Both possible dirs for a folder/file pair (canonical first). */
export function snapshotDirs(folderSlug: string, fileSlug: string): string[] {
    return [snapshotDir(folderSlug, fileSlug), legacySnapshotDir(folderSlug, fileSlug)];
}

/** Path of snapshot `id` — the file that EXISTS (canonical first, then
 *  the legacy 16-char dir), or the canonical path when neither does
 *  (so callers get a sensible ENOENT). */
export async function resolveSnapshotFile(
    folderSlug: string,
    fileSlug: string,
    id: string
): Promise<string> {
    const canonical = path.join(snapshotDir(folderSlug, fileSlug), `${id}.txt`);
    try {
        await fs.access(canonical);
        return canonical;
    } catch {
        /* fall through to the legacy dir */
    }
    const legacy = path.join(legacySnapshotDir(folderSlug, fileSlug), `${id}.txt`);
    try {
        await fs.access(legacy);
        return legacy;
    } catch {
        return canonical; // caller's readFile reports the canonical ENOENT
    }
}

export function validateSnapshotId(id: string): boolean {
    return /^\d{13,}$/.test(id);
}

/* ────────────────────────────────────────────────────────────────────
   Shared snapshot WRITER.

   Both editing paths (the non-Python /api/file-write AND Python saves
   through /api/import-py) call this one helper so every edit gets a
   pre-write snapshot (same layout the list / diff / restore routes
   already read: <tmp>/praxis-local-history/<hash>/<folderSlug>/
   <fileSlug>/<ms>.txt) with the same 50-snapshot prune.

   The periodic scheduler (lib/local-history-scheduler.ts) and the
   manual /api/local-history/save route write through THE SAME helper
   so every producer lands in the one layout the timeline UI reads.
   ──────────────────────────────────────────────────────────────────── */

/** Snapshots kept per file before the oldest start dropping. */
const SNAPSHOT_PRUNE_LIMIT = 50;

/** Optional extras for snapshot writes. */
export interface SnapshotWriteOptions {
    /** Human label sidecar (<id>.label) the list route renders next to
     *  the time — used by MANUAL snapshots (the save route) and by the
     *  periodic scheduler's "periodic" marker. Absent = automatic
     *  save-time snapshot. */
    label?: string;
}

/**
 * Write one snapshot (best-effort — a failure must never break the
 * actual save that calls it). Returns the new snapshot id (epoch ms)
 * or null when the write failed.
 *
 * @param folderSlug the folder slug as the client sent it (canonical
 *                  12-char-hash dir layout below it).
 * @param fileSlug  the FILE slug the Local History dialog lists with
 *                  (slugify of the file's relative path — for a
 *                  folder-root file that is plain slugify(name)).
 * @param label    optional sidecar label (see SnapshotWriteOptions).
 */
export async function saveLocalHistorySnapshot(
    folderSlug: string,
    fileSlug: string,
    content: string,
    options?: SnapshotWriteOptions
): Promise<string | null> {
    try {
        const dir = snapshotDir(folderSlug, fileSlug);
        await fs.mkdir(dir, {recursive: true});
        const id = String(Date.now());
        await fs.writeFile(path.join(dir, `${id}.txt`), content, "utf-8");
        // A .label sidecar the list route picks up and renders next to
        // the time (only when a label was given — automatic snapshots
        // carry none, which is exactly what the UI expects).
        const label = options?.label;
        if (label && label.trim()) {
            await fs.writeFile(
                path.join(dir, `${id}.label`),
                label.trim().slice(0, 80),
                "utf-8"
            );
        }
        // Prune to the newest N snapshots.
        const entries = await fs.readdir(dir);
        const txts = entries.filter((n) => n.endsWith(".txt")).sort();
        if (txts.length > SNAPSHOT_PRUNE_LIMIT) {
            await Promise.all(
                txts
                    .slice(0, txts.length - SNAPSHOT_PRUNE_LIMIT)
                    .flatMap((n) => {
                        // drop the label sidecar with its snapshot so no orphan
                        // .label files survive their .txt partners.
                        const unlinkTxt = fs.unlink(path.join(dir, n)).catch(() => {
                        });
                        const unlinkLabel = fs
                            .unlink(path.join(dir, `${n.slice(0, -4)}.label`))
                            .catch(() => {
                            });
                        return [unlinkTxt, unlinkLabel];
                    })
            );
        }
        return id;
    } catch {
        /* best-effort — the caller's real write must not fail because a
           history snapshot could not be taken (disk-full, permissions…). */
        return null;
    }
}
