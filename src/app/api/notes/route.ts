import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, safeFolderName} from "@/lib/scripts";

/**
 * Per-script notes API — CRUD over free-form notes attached to each
 * (folder, file) pair.
 *
 * GET  /api/notes?folder=<slug>&file=<slug>  → { notes: string }
 * POST /api/notes  { folder, file, notes }  → { ok: true }
 *
 * this route used to return `ok: true` without
 * persisting anything (a placeholder that lied about success). Notes
 * are now stored on disk at `<project-root>/.praxis/notes.json`, keyed
 * by the (deslugified) folder + file names, with an atomic
 * write-temp-then-rename save so concurrent writes can't corrupt the
 * file. The ScriptNotes component still mirrors to localStorage for
 * instant loads; this endpoint gives the notes a durable home.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cap per-note size — notes are prose, not output dumps. */
const MAX_NOTES_CHARS = 100_000;

function notesFilePath(): string {
    // Fix: notes belong to the ACTIVE project's.praxis folder —
    // `getActiveProjectRoot ?? process.cwd` wrote them to the APP's
    // cwd when no explicit project was open (the default python_scripts
    // workspace), splitting notes across two roots. getScriptsRoot is
    // the canonical resolver (active project → default workspace).
    return path.join(getScriptsRoot(), ".praxis", "notes.json");
}

/** Validate the (folder, file) pair; returns the safe names or null. */
function validatePair(
    folder: string | null,
    file: string | null
): { folderName: string; fileName: string } | null {
    if (!folder || !file) return null;
    const folderName = safeFolderName(folder);
    if (!folderName) return null;
    // File names go through the same deslugify + separator/".." checks.
    const fileName = Buffer.from(file, "base64url").toString("utf-8");
    if (
        !fileName ||
        fileName.includes("/") ||
        fileName.includes("\\") ||
        fileName.includes("..") ||
        fileName.includes("\0") ||
        fileName !== fileName.trim()
    ) {
        return null;
    }
    return {folderName, fileName};
}

async function loadAll(): Promise<Record<string, string>> {
    try {
        const text = await fs.readFile(notesFilePath(), "utf-8");
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, string>;
        }
        return {};
    } catch {
        return {};
    }
}

async function saveAll(notes: Record<string, string>) {
    const file = notesFilePath();
    await fs.mkdir(path.dirname(file), {recursive: true});
    // Atomic write — see the snippets route for rationale.
    const tmpFile = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(notes, null, 2), "utf-8");
    await fs.rename(tmpFile, file);
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const pair = validatePair(
        searchParams.get("folder"),
        searchParams.get("file")
    );
    if (!pair) {
        return NextResponse.json(
            {error: "Missing or invalid folder/file."},
            {status: 400}
        );
    }
    const all = await loadAll();
    const key = `${pair.folderName}/${pair.fileName}`;
    return NextResponse.json({notes: all[key] ?? "", folder: pair.folderName, file: pair.fileName});
}

export async function POST(request: Request) {
    let body: { folder?: string; file?: string; notes?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON."}, {status: 400});
    }
    const pair = validatePair(body.folder ?? null, body.file ?? null);
    if (!pair) {
        return NextResponse.json(
            {error: "Body must include valid 'folder' and 'file'."},
            {status: 400}
        );
    }
    if (typeof body.notes !== "string") {
        return NextResponse.json(
            {error: "Body must include 'notes' (string)."},
            {status: 400}
        );
    }
    if (body.notes.length > MAX_NOTES_CHARS) {
        return NextResponse.json(
            {error: `Notes exceed the ${MAX_NOTES_CHARS} character limit.`},
            {status: 413}
        );
    }
    const all = await loadAll();
    const key = `${pair.folderName}/${pair.fileName}`;
    if (body.notes === "") {
        delete all[key];
    } else {
        all[key] = body.notes;
    }
    try {
        await saveAll(all);
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to persist notes: ${(err as Error).message}`},
            {status: 500}
        );
    }
    return NextResponse.json({ok: true});
}
