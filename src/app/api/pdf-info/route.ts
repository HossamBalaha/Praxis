import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * PDF toolkit backend — GET ?folder=&file=
 *
 * Best-effort, capability-probed on every call:
 *   - page THUMBNAILS via poppler's pdftoppm (48 dpi PNG, base64)
 *   - page-mapped TEXT via poppler's pdftotext (form feeds \f split
 *     pages) — powers in-document search + extract-to-clipboard
 *
 * When a tool is missing the response says so explicitly
 * ({ tools: { pdftoppm: false } }) so the client can hide that part
 * of the UI instead of failing — on machines without poppler the PDF
 * still opens through the iframe viewer as before.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 60;
const TIMEOUT_MS = 30_000;

function probe(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn(bin, ["-v"], {stdio: "ignore"});
        child.on("error", () => resolve(false));
        child.on("close", () => resolve(true));
    });
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{
    code: number | null;
    stdout: string;
    stderr: string
}> {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const child = spawn(bin, args, {stdio: ["ignore", "pipe", "pipe"]});
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, timeoutMs);
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code, stdout, stderr});
        });
        child.on("error", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code: null, stdout: "", stderr: "spawn failed"});
        });
    });
}

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const folderSlug = sp.get("folder");
    const fileSlug = sp.get("file");
    if (!folderSlug || !fileSlug) {
        return NextResponse.json({error: "Missing 'folder' and 'file'."}, {status: 400});
    }
    const folderName = deslugify(folderSlug);
    const relFile = deslugify(fileSlug);
    if (!folderName || !relFile || relFile.includes("..") || relFile.includes("\\") || relFile.startsWith("/")) {
        return NextResponse.json({error: "Invalid file reference."}, {status: 400});
    }
    if (path.extname(relFile).toLowerCase() !== ".pdf") {
        return NextResponse.json({error: "Not a PDF file."}, {status: 400});
    }
    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const st = await fs.stat(/* turbopackIgnore: true */ abs);
        if (!st.isFile()) throw new Error("not a file");
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    const [hasPdftoppm, hasPdftotext] = await Promise.all([
        probe("pdftoppm"),
        probe("pdftotext"),
    ]);

    let pages: string[] = [];
    let textPages: string[] = [];

    if (hasPdftoppm) {
        const tmpDir = await fs.mkdtemp("praxis-pdf-");
        try {
            const res = await run(
                "pdftoppm",
                ["-png", "-r", "48", "-f", "1", "-l", String(MAX_PAGES), abs, `${tmpDir}/page`],
                TIMEOUT_MS
            );
            if (res.code === 0) {
                const files = (await fs.readdir(tmpDir)).filter((f) => f.endsWith(".png")).sort();
                pages = await Promise.all(
                    files.map(async (f) => {
                        const buf = await fs.readFile(path.join(tmpDir, f));
                        return `data:image/png;base64,${buf.toString("base64")}`;
                    })
                );
            }
        } finally {
            fs.rm(tmpDir, {recursive: true, force: true}).catch(() => undefined);
        }
    }

    if (hasPdftotext) {
        const res = await run("pdftotext", ["-layout", abs, "-"], TIMEOUT_MS);
        if (res.code === 0 && res.stdout) {
            textPages = res.stdout.split("\f");
            if (textPages.length > 0 && textPages[textPages.length - 1].trim() === "") {
                textPages = textPages.slice(0, -1);
            }
            if (textPages.length > MAX_PAGES) textPages = textPages.slice(0, MAX_PAGES);
        }
    }

    return NextResponse.json({
        ok: true,
        tools: {pdftoppm: hasPdftoppm, pdftotext: hasPdftotext},
        pages,
        textPages,
    });
}
