import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * folder comparison — POST { folderA, subA?, folderB, subB? }.
 *
 * Walks both folder trees (recursively), diffs them by RELATIVE path
 * and classifies every entry: same (size + mtime equal), modified
 * (size or mtime differs), onlyA, onlyB. Returns sorted lists plus a
 * summary — the Compare Folders dialog renders them side by side.
 *
 * Same traversal guards as the other folder routes; both sides are
 * read-only walks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES = 20_000;

async function walk(root: string): Promise<Map<string, { size: number; mtime: number }>> {
    const out = new Map<string, { size: number; mtime: number }>();
    const stack: string[] = [""];
    while (stack.length > 0 && out.size < MAX_ENTRIES) {
        const rel = stack.pop() as string;
        const abs = path.join(root, rel);
        let entries: import("node:fs").Dirent[];
        try {
            entries = await fs.readdir(abs, {withFileTypes: true});
        } catch {
            continue; // unreadable dir — skip
        }
        for (const e of entries) {
            if (e.name.startsWith(".")) continue; // .praxis, .git…
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                stack.push(childRel);
            } else if (e.isFile()) {
                try {
                    const st = await fs.stat(path.join(root, childRel));
                    out.set(childRel, {size: st.size, mtime: st.mtimeMs});
                } catch {
                    out.set(childRel, {size: -1, mtime: -1});
                }
            }
        }
    }
    return out;
}

function cleanRel(sub: string | undefined | null): string | null {
    const s = (sub ?? "").trim();
    if (!s) return "";
    if (
        s.includes("..") ||
        s.includes("\\") ||
        s.startsWith("/") ||
        s.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return null;
    }
    return s;
}

export async function POST(request: NextRequest) {
    let body: { folderA?: string; subA?: string; folderB?: string; subB?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folderA, folderB} = body;
    const subA = cleanRel(body.subA);
    const subB = cleanRel(body.subB);
    if (subA === null || subB === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    const nameA = deslugify(folderA ?? "");
    const nameB = deslugify(folderB ?? "");
    if (!nameA || !nameB) {
        return NextResponse.json({error: "Missing or invalid 'folderA' / 'folderB'."}, {status: 400});
    }
    const rootA = path.join(/* turbopackIgnore: true */ getScriptsRoot(), nameA, subA);
    const rootB = path.join(/* turbopackIgnore: true */ getScriptsRoot(), nameB, subB);
    const guard = (p: string): boolean => {
        const rel = path.relative(getScriptsRoot(), p);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
    };
    if (!guard(rootA) || !guard(rootB)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const stA = await fs.stat(/* turbopackIgnore: true */ rootA);
        if (!stA.isDirectory()) throw new Error("not a directory");
    } catch {
        return NextResponse.json({error: "Folder A not found."}, {status: 404});
    }
    try {
        const stB = await fs.stat(/* turbopackIgnore: true */ rootB);
        if (!stB.isDirectory()) throw new Error("not a directory");
    } catch {
        return NextResponse.json({error: "Folder B not found."}, {status: 404});
    }

    const [mapA, mapB] = await Promise.all([walk(rootA), walk(rootB)]);
    const same: string[] = [];
    const modified: Array<{ path: string; sizeA: number; sizeB: number }> = [];
    const onlyA: string[] = [];
    const onlyB: string[] = [];
    const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].sort();
    for (const key of keys) {
        const a = mapA.get(key);
        const b = mapB.get(key);
        if (a && b) {
            if (a.size === b.size && Math.abs(a.mtime - b.mtime) < 1000) same.push(key);
            else modified.push({path: key, sizeA: a.size, sizeB: b.size});
        } else if (a) onlyA.push(key);
        else if (b) onlyB.push(key);
    }
    return NextResponse.json({
        ok: true,
        labelA: subA ? `${nameA}/${subA}` : nameA,
        labelB: subB ? `${nameB}/${subB}` : nameB,
        same,
        modified,
        onlyA,
        onlyB,
        counts: {
            same: same.length,
            modified: modified.length,
            onlyA: onlyA.length,
            onlyB: onlyB.length,
        },
    });
}
