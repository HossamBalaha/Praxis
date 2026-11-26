import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {STORAGE_PREFIX} from "@/lib/config";

/**
 * Snippets API — CRUD over a small library of reusable code snippets
 * the user can insert into any script via the Ctrl+/ palette.
 *
 * GET /api/snippets → list all
 * POST /api/snippets → create or update { name, content, tags? }
 * DELETE /api/snippets?name=<n> → delete by name
 *
 * Snippets live in `~/.praxis-snippets.json` (or, if STORAGE_PREFIX
 * is set, `~/.<prefix>-snippets.json`). They are scoped per-machine
 * since they're really user preferences, not project data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sanitize STORAGE_PREFIX so it can only contain [a-z0-9-].
 * This prevents path traversal if a user sets a malicious
 * NEXT_PUBLIC_STORAGE_PREFIX env var (e.g. "../../etc/cron.d").
 */
function safePrefix(prefix: string): string {
    const cleaned = prefix.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    return cleaned || "praxis";
}

const SNIPPETS_FILE = path.join(
    process.env.HOME || process.env.USERPROFILE || "/tmp",
    `.${safePrefix(STORAGE_PREFIX)}-snippets.json`
);

interface Snippet {
    name: string;
    content: string;
    tags?: string[];
    createdAt: number;
    updatedAt: number;
}

async function loadAll(): Promise<Snippet[]> {
    try {
        const text = await fs.readFile(SNIPPETS_FILE, "utf-8");
        return JSON.parse(text) as Snippet[];
    } catch {
        return [];
    }
}

async function saveAll(snippets: Snippet[]) {
    // write-temp-then-rename. The read-modify-write
    // used to write the file in place — two concurrent POSTs could each
    // load the old list and the second save silently dropped the first
    // one's snippet; a crash mid-write left a truncated JSON file that
    // loadAll then treated as empty (all snippets lost). The atomic
    // rename means readers only ever see the old or the new complete file.
    const tmpFile = `${SNIPPETS_FILE}.${process.pid}.tmp`;
    await fs.writeFile(
        tmpFile,
        JSON.stringify(snippets, null, 2),
        "utf-8"
    );
    await fs.rename(tmpFile, SNIPPETS_FILE);
}

export async function GET() {
    const all = await loadAll();
    return NextResponse.json({snippets: all});
}

export async function POST(request: Request) {
    let body: { name?: string; content?: string; tags?: string[] };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {name, content, tags} = body;
    if (!name || !content) {
        return NextResponse.json(
            {error: "Body must include 'name' and 'content'."},
            {status: 400}
        );
    }
    const all = await loadAll();
    const now = Date.now();
    const existing = all.find((s) => s.name === name);
    if (existing) {
        existing.content = content;
        existing.tags = tags;
        existing.updatedAt = now;
    } else {
        all.push({
            name,
            content,
            tags,
            createdAt: now,
            updatedAt: now,
        });
    }
    await saveAll(all);
    return NextResponse.json({ok: true, snippet: all.find((s) => s.name === name)});
}

export async function DELETE(request: Request) {
    const {searchParams} = new URL(request.url);
    const name = searchParams.get("name");
    if (!name) {
        return NextResponse.json(
            {error: "Missing 'name' query parameter."},
            {status: 400}
        );
    }
    const all = await loadAll();
    const next = all.filter((s) => s.name !== name);
    await saveAll(next);
    return NextResponse.json({ok: true, deleted: all.length - next.length});
}
