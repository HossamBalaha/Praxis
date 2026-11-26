import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {resolveSnapshotFile, validateSnapshotId,} from "../list/route-helpers";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {ensureSnapshotScheduler} from "@/lib/local-history-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compute a simple unified diff between two strings (line-based LCS). */
function computeDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    const result: string[] = [];
    result.push(`--- snapshot`);
    result.push(`+++ current`);
    // Simple line-by-line comparison (not a full LCS, but good enough
    // for showing what changed).
    const maxLen = Math.max(oldLines.length, newLines.length);
    let oldIdx = 0;
    let newIdx = 0;
    let hunkStart = -1;
    let hunkLines: string[] = [];
    const flushHunk = () => {
        if (hunkLines.length > 0) {
            result.push(`@@ -${hunkStart + 1},${oldLines.length} +${hunkStart + 1},${newLines.length} @@`);
            result.push(...hunkLines);
            hunkLines = [];
        }
    };
    for (let i = 0; i < maxLen; i++) {
        const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : undefined;
        const newLine = newIdx < newLines.length ? newLines[newIdx] : undefined;
        if (oldLine === newLine) {
            if (hunkLines.length > 0 && hunkLines.length < 6) {
                hunkLines.push(` ${oldLine ?? ""}`);
            } else {
                flushHunk();
            }
            if (hunkLines.length === 0) hunkStart = i;
            oldIdx++;
            newIdx++;
        } else {
            if (hunkLines.length === 0) hunkStart = i;
            if (oldLine !== undefined) hunkLines.push(`-${oldLine}`);
            if (newLine !== undefined) hunkLines.push(`+${newLine}`);
            oldIdx++;
            newIdx++;
        }
    }
    flushHunk();
    return result.join("\n");
}

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
        // Read the snapshot content.
        // canonical dir first, then the legacy
        // 16-char dir (pre-unification snapshots).
        const snapshotPath = await resolveSnapshotFile(folder, file, id);
        const snapshotContent = await fs.readFile(snapshotPath, "utf-8");
        // Read the current file content from disk.
        const scriptsRoot = getScriptsRoot();
        const folderName = deslugify(folder);
        const fileName = deslugify(file);
        const filePath = path.join(scriptsRoot, folderName, fileName);
        let currentContent = "";
        try {
            currentContent = await fs.readFile(filePath, "utf-8");
        } catch {
            // File might not exist anymore — diff against empty.
        }
        const diff = computeDiff(snapshotContent, currentContent);
        return NextResponse.json({ok: true, diff});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: (err as Error).message},
            {status: 500}
        );
    }
}
