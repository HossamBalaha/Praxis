import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {deslugify, getScriptsRoot, resolveScriptPath} from "@/lib/scripts";

/**
 * POST /api/open-folder
 *
 * Body: { folder: <slug>, file?: <slug> }
 *
 * Reveals the folder folder of the currently-selected script in the
 * operating system's native file explorer (Explorer on Windows, Finder
 * on macOS, xdg-open on Linux). The file itself is selected when the OS
 * supports it.
 *
 * `file` is now OPTIONAL — when omitted the route reveals
 * the FOLDER folder itself (the explorer's "Reveal in OS explorer"
 * folder-menu action), instead of requiring a file to anchor on.
 *
 * The path is rebuilt from base64url slugs and validated to stay inside
 * `python_scripts/`, exactly like /api/code and /api/run.
 *
 * Response shape:
 *   { ok: true, command: "explorer", path: "C:\\..." }
 *
 * or on error:
 *   { ok: false, error: "..." }
 */
export async function POST(request: Request) {
    let body: { folder?: string; file?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const {folder, file, sub} = body;
    if (!folder) {
        return NextResponse.json(
            {error: "Body must include 'folder' (and optionally 'file') slugs."},
            {status: 400}
        );
    }

    // ── Resolve the target: file (when given) or the folder folder ──
    let targetPath: string;
    let folderName: string;
    let fileName: string | undefined;
    if (file) {
        const resolved = await resolveScriptPath(folder, file);
        if (!resolved) {
            return NextResponse.json(
                {error: "File not found inside python_scripts/."},
                {status: 404}
            );
        }
        targetPath = resolved.absPath;
        folderName = resolved.folderName;
        fileName = resolved.fileName;
    } else {
        // Folder-reveal mode: validate the folder slug the same way the
        // folder-stats / folder-zip routes do, then resolve its directory.
        // an optional `sub` (relative subfolder path inside
        // the folder) reveals a NESTED folder row in the OS explorer.
        folderName = deslugify(folder);
        if (!folderName) {
            return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
        }
        if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
            return NextResponse.json({error: "Invalid folder name."}, {status: 400});
        }
        const cleanSub = (sub ?? "").trim();
        if (cleanSub && (
            cleanSub.includes("..") || cleanSub.includes("\\") ||
            cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
            cleanSub.split("/").some((seg) => !seg || seg.startsWith(".")) ||
            cleanSub.split("/").length > 4
        )) {
            return NextResponse.json({error: "Invalid subfolder path."}, {status: 400});
        }
        const dir = path.join(getScriptsRoot(), folderName, cleanSub);
        const rel = path.relative(getScriptsRoot(), dir);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
        }
        try {
            const st = await fs.stat(dir);
            if (!st.isDirectory()) {
                return NextResponse.json({error: "Not a folder."}, {status: 400});
            }
        } catch {
            return NextResponse.json({error: "Folder not found."}, {status: 404});
        }
        targetPath = dir;
    }

    // Spawn the OS-specific file manager. We deliberately spawn without
    // shell and ignore stdio — the user just wants a window to appear.
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (!fileName) {
        // Folder-reveal: open the folder itself (nothing to select).
        if (platform === "win32") {
            command = "explorer";
            args = [targetPath];
        } else {
            command = platform === "darwin" ? "open" : "xdg-open";
            args = [targetPath];
        }
    } else if (platform === "win32") {
        // `explorer /select,<file>` opens Explorer with the file highlighted.
        command = "explorer";
        args = ["/select,", targetPath];
    } else if (platform === "darwin") {
        // `open -R <file>` reveals the file in Finder.
        command = "open";
        args = ["-R", targetPath];
    } else {
        // Linux / *BSD: xdg-open opens the containing directory. There is
        // no portable "reveal and select" flag, so we open the folder.
        command = "xdg-open";
        args = [targetPath.substring(0, targetPath.lastIndexOf("/"))];
    }

    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(/* turbopackIgnore: true */ command, args, {
                stdio: "ignore",
                detached: true,
            });
            child.on("error", reject);
            // Detach so the file manager keeps running after the API call ends.
            child.unref();
            // Give it a beat to actually launch before we report success.
            setTimeout(() => resolve(), 250);
        });
        return NextResponse.json({
            ok: true,
            command,
            path: targetPath,
            folder: folderName,
            ...(fileName ? {file: fileName} : {}),
            platform,
        });
    } catch (err) {
        return NextResponse.json(
            {
                ok: false,
                error: `Failed to open folder: ${(err as Error).message}`,
                command,
                platform,
            },
            {status: 500}
        );
    }
}
