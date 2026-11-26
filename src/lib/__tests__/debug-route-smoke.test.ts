/**
 * INTEGRATION smoke test for the /api/debug route's call-stack + watch
 * extensions (src/app/api/debug/route.ts) — the route is imported
 * directly and POSTed with a duck-typed request, so the FULL pdb-over-
 * SSE protocol runs against a real `python -u -m pdb` child:
 *
 *   start → stopped (with `stack` + `currentFrame`) → watch POST
 *   (immediate values while paused) → frame POST (pdb up/down + a
 *   `frame` event with refreshed locals/watches) → quit.
 *
 * The python fixture is created under python_scripts/ by the test and
 * removed afterwards (the route only resolves files inside the
 * scripts root).
 */
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
// The module under test — importing a route file is safe here: the
// vitest node environment resolves the @ alias and node builtins.
import {POST} from "@/app/api/debug/route";

const FOLDER_NAME = "Debugger Smoke Test";
const FOLDER_SLUG = Buffer.from(FOLDER_NAME, "utf-8").toString("base64url");
const FILE_NAME = "SmokeStack.py";
const FILE_SLUG = Buffer.from(FILE_NAME, "utf-8").toString("base64url");

const SCRIPT = [
    "def inner(x):",
    "    y = x + 1",
    "    return y",
    "",
    "def outer():",
    "    a = 1",
    "    total = inner(a) + inner(a)",
    "    return total",
    "",
    "result = outer()",
    "print(result)",
    "",
].join("\n");

const scriptsRoot = path.join(process.cwd(), "python_scripts");

/** Minimal duck-typed NextRequest — the route only calls .json(). */
function req(body: unknown): Parameters<typeof POST>[0] {
    return {
        json: async () => body,
    } as unknown as Parameters<typeof POST>[0];
}

interface SseEvent {
    type: string;

    [k: string]: unknown;
}

/** Pump an SSE Response into an event queue + a per-type wait helper. */
function pump(res: Response) {
    const events: SseEvent[] = [];
    const readers: Array<(e: SseEvent) => void> = [];
    let done = false;
    const run = (async () => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const r = await reader.read();
            if (r.done) break;
            buffer += decoder.decode(r.value, {stream: true});
            let sep: number;
            while ((sep = buffer.indexOf("\n\n")) >= 0) {
                const raw = buffer.slice(0, sep).trim();
                buffer = buffer.slice(sep + 2);
                if (!raw.startsWith("data: ")) continue;
                try {
                    const evt = JSON.parse(raw.slice(6)) as SseEvent;
                    events.push(evt);
                    for (const w of readers.splice(0)) w(evt);
                } catch {
                    // ignore malformed
                }
            }
        }
        done = true;
        for (const w of readers.splice(0)) w({type: "__eof__"} as SseEvent);
    })();
    const waitFor = (
        pred: (e: SseEvent) => boolean,
        timeoutMs = 30_000
    ): Promise<SseEvent> =>
        new Promise((resolve, reject) => {
            const existing = events.find(pred);
            if (existing) return resolve(existing);
            const timer = setTimeout(
                () => reject(new Error("timed out waiting for SSE event")),
                timeoutMs
            );
            const w = (e: SseEvent) => {
                if (pred(e)) {
                    clearTimeout(timer);
                    resolve(e);
                } else {
                    readers.push(w);
                }
            };
            if (done) w({type: "__eof__"} as SseEvent);
            else readers.push(w);
        });
    return {events, waitFor, run};
}

let response: Response;
let pumpState: ReturnType<typeof pump>;
/** The live session, if the test got far enough to start one — the
 *  afterAll teardown must QUIT it: the parked pdb child runs with its
 *  CWD inside the fixture folder, and Windows refuses to delete a
 *  live process's CWD (EBUSY). */
let liveSessionId: string | null = null;

beforeAll(async () => {
    await fs.mkdir(path.join(scriptsRoot, FOLDER_NAME), {recursive: true});
    await fs.writeFile(path.join(scriptsRoot, FOLDER_NAME, FILE_NAME), SCRIPT, "utf-8");
});

afterAll(async () => {
    // End any live session first (see liveSessionId): a mid-test
    // failure leaves pdb parked at a stop, holding the fixture folder
    // as its CWD — unkillable-dir on Windows until the child exits.
    if (liveSessionId) {
        try {
            await POST(req({sessionId: liveSessionId, command: "quit"}));
            // The already-buffered `end` (happy path) resolves instantly; a
            // fresh one arrives as the child exits. Never block teardown.
            if (pumpState) {
                await pumpState.waitFor((e) => e.type === "end", 5_000).catch(() => {
                });
            }
        } catch {
            // Session already gone — nothing to quit.
        }
    }
    // Windows can also hold the dir handle briefly AFTER the child has
    // exited (AV scanners, the indexer) — retry the rm with backoff.
    const dir = path.join(scriptsRoot, FOLDER_NAME);
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            await fs.rm(dir, {recursive: true, force: true});
            lastErr = null;
            break;
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    if (lastErr) throw lastErr;
});

describe("/api/debug call-stack + watches (live pdb session)", () => {
    it(
        "delivers stack frames, evaluates watches, and switches frames via up/down",
        {timeout: 90_000},
        async () => {
            // ── START the session (breakpoint on the `total = …` line, two
            //    watch expressions, one intentionally undefined). ──────────
            response = await POST(
                req({
                    folder: FOLDER_SLUG,
                    file: FILE_SLUG,
                    breakpoints: [7],
                    watch: ["a", "a * 100", "nope_x"],
                })
            );
            expect(response.ok).toBe(true);
            pumpState = pump(response);

            const start = await pumpState.waitFor((e) => e.type === "start");
            expect(typeof start.sessionId).toBe("string");
            const sessionId = start.sessionId as string;
            liveSessionId = sessionId;

            // ── The stop carries the parsed `w` stack (bottom-up) and the
            //    evaluated watches for the selected frame. ─────────────────
            const stopped = (await pumpState.waitFor(
                (e) => e.type === "stopped"
            )) as unknown as {
                line: number;
                frame: string;
                stack: Array<{
                    index: number;
                    function: string;
                    file: string;
                    line: number;
                    current: boolean;
                }>;
                currentFrame: number;
                watches: Array<{ expression: string; value?: string; error?: string }>;
            };
            expect(stopped.frame).toBe("outer");
            expect(stopped.line).toBe(7);
            // Bottom-up frames: <module> (of the debugged file) is present;
            // the innermost is `outer` and is the selected one.
            expect(Array.isArray(stopped.stack)).toBe(true);
            const moduleFrame = stopped.stack.find(
                (f) => f.function === "<module>" && f.file === FILE_NAME
            );
            expect(moduleFrame).toBeDefined();
            expect(stopped.currentFrame).toBe(stopped.stack.length - 1);
            expect(
                stopped.stack[stopped.stack.length - 1].function === "outer" ||
                // When pdb stops one frame deeper on the call, outer is the
                // innermost USER frame; stdlib frames may sit below it.
                stopped.stack[stopped.stack.length - 1].current
            ).toBe(true);
            // Watches evaluated in the outer() frame.
            expect(stopped.watches).toHaveLength(3);
            const byExpr = new Map(
                stopped.watches.map((w) => [w.expression, w])
            );
            expect(byExpr.get("a")?.value).toBe("1");
            expect(byExpr.get("a * 100")?.value).toBe("100");
            expect(byExpr.get("nope_x")?.error).toContain("NameError");

            // ── Set watches MID-PAUSE — the POST response carries values
            //    evaluated immediately (bridge protocol shape 2c). ─────────
            const watchRes = await POST(
                req({sessionId, watch: ["a", "a + 1"]})
            );
            expect(watchRes.status).toBe(200);
            const watchBody = (await watchRes.json()) as {
                ok: boolean;
                values: Array<{ expression: string; value?: string; error?: string }>;
            };
            expect(watchBody.ok).toBe(true);
            expect(watchBody.values).toHaveLength(2);
            expect(watchBody.values.find((w) => w.expression === "a + 1")?.value).toBe("2");

            // ── Select the module frame (bottom-up index of the debugged
            //    file's <module>) — the route sends pdb `up` repeated, then
            //    re-captures stack/locals/watches and emits `frame`. ────────
            const target = moduleFrame!.index;
            const frameRes = await POST(req({sessionId, frame: target}));
            expect(frameRes.status).toBe(200);
            const frameBody = (await frameRes.json()) as { ok: boolean };
            expect(frameBody.ok).toBe(true);

            const frameEvent = (await pumpState.waitFor(
                (e) => e.type === "frame"
            )) as unknown as {
                frame: string;
                line: number;
                file: string;
                locals: string;
                currentFrame: number;
                watches: Array<{ expression: string; value?: string; error?: string }>;
            };
            expect(frameEvent.frame).toBe("<module>");
            expect(frameEvent.file).toBe(FILE_NAME);
            expect(frameEvent.line).toBe(10);
            expect(frameEvent.currentFrame).toBe(target);
            // Module-scope locals are the module globals.
            expect(frameEvent.locals).toContain("__name__");
            // `a` is NOT defined at module scope — the watch now errors.
            const aWatch = frameEvent.watches.find((w) => w.expression === "a");
            expect(aWatch?.error).toContain("NameError");

            // ── Switching back DOWN to the innermost frame works too. ─────
            const downRes = await POST(
                req({sessionId, frame: stopped.stack.length - 1})
            );
            expect(downRes.status).toBe(200);
            const backEvent = (await pumpState.waitFor(
                (e) =>
                    e.type === "frame" &&
                    (e as { currentFrame?: number }).currentFrame ===
                    stopped.stack.length - 1
            )) as unknown as { frame: string; watches: Array<{ expression: string; value?: string }> };
            expect(backEvent.frame).toBe("outer");
            expect(backEvent.watches.find((w) => w.expression === "a")?.value).toBe("1");

            // ── Step commands still work after the frame dance, and a
            //    command while the session is gone answers 404. ────────────
            const stepRes = await POST(req({sessionId, command: "quit"}));
            expect(stepRes.status).toBe(200);
            await pumpState.waitFor((e) => e.type === "end");
            const lateRes = await POST(req({sessionId, command: "continue"}));
            expect(lateRes.status).toBe(404);
        }
    );
});
