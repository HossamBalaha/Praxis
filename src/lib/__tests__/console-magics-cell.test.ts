import {describe, expect, it} from "vitest";
import {spawn} from "node:child_process";
// console-magics — the client-side magic PARSING (line + the new CELL
// magics), the unknown-magic hint, the persisted-history array ops and
// the plain pandas text repr parser wired behind the console panel.
// The kernel-side cell-magic EXECUTION lives in console-kernel.ts
// (embedded Python) — the python-gated describe below boots the REAL
// kernel process and drives it over its JSON-lines protocol so the
// %%time / %%timeit / %%capture contract is pinned end to end.
import {
    appendConsoleHistory,
    CONSOLE_HISTORY_CAP,
    CONSOLE_MAGIC_HELP,
    parseConsoleMagic,
    parseDataFrameRepr,
    unknownMagicHint,
} from "@/lib/console-magics";
import {CONSOLE_KERNEL_PY} from "@/lib/console-kernel";

/* ------------------------------------------------------------------ */
/*  parseConsoleMagic — line + cell dispatch                            */
/* ------------------------------------------------------------------ */

describe("parseConsoleMagic — cell magics", () => {
    it("recognizes %%time with a multi-line cell body", () => {
        const p = parseConsoleMagic("%%time\nx = 40 + 2\ny = x * 2\n");
        expect(p.cellMagic).toBe("%%time");
        expect(p.magic).toBeNull();
        expect(p.unknown).toBe(false);
        expect(p.rest).toBe("x = 40 + 2\ny = x * 2");
        expect(p.token).toBe("%%time");
    });

    it("recognizes %%timeit and %%capture", () => {
        expect(parseConsoleMagic("%%timeit\n1 + 1").cellMagic).toBe("%%timeit");
        expect(parseConsoleMagic("%%capture\nprint('x')").cellMagic).toBe("%%capture");
    });

    it("takes the same-line body for a one-line cell", () => {
        const p = parseConsoleMagic("%%time x = 1");
        expect(p.cellMagic).toBe("%%time");
        expect(p.rest).toBe("x = 1");
    });

    it("matches case-insensitively and tolerates leading whitespace", () => {
        expect(parseConsoleMagic("  %%TIME\nx = 1").cellMagic).toBe("%%time");
        expect(parseConsoleMagic("\t%%Capture\npass").cellMagic).toBe("%%capture");
    });

    it("flags an unknown %% token (kernel answers with a friendly error)", () => {
        const p = parseConsoleMagic("%%bash\necho hi");
        expect(p.unknown).toBe(true);
        expect(p.cellMagic).toBeNull();
        expect(p.magic).toBeNull();
        expect(p.token).toBe("%%bash");
    });

    it("keeps line magics as line magics (not cell)", () => {
        const p = parseConsoleMagic("%time 1 + 1");
        expect(p.magic).toBe("%time");
        expect(p.cellMagic).toBeNull();
        expect(p.rest).toBe("1 + 1");
    });

    it("leaves ordinary code (and % mid-string) untouched", () => {
        expect(parseConsoleMagic('print("%time")')).toEqual({
            magic: null,
            cellMagic: null,
            unknown: false,
            rest: 'print("%time")',
            token: "",
        });
        expect(parseConsoleMagic("2 % 3").unknown).toBe(false);
    });
});

describe("unknownMagicHint", () => {
    it("lists the line magics for a single-% token", () => {
        const hint = unknownMagicHint("%foo");
        expect(hint).toContain("Unknown magic %foo");
        expect(hint).toContain("%time");
        expect(hint).toContain("%who");
    });

    it("lists the cell magics for a %% token", () => {
        const hint = unknownMagicHint("%%bash");
        expect(hint).toContain("Unknown cell magic %%bash");
        expect(hint).toContain("%%time");
        expect(hint).toContain("%%capture");
    });
});

describe("CONSOLE_MAGIC_HELP", () => {
    it("documents the cell magics alongside the line magics", () => {
        expect(CONSOLE_MAGIC_HELP).toContain("%%time");
        expect(CONSOLE_MAGIC_HELP).toContain("%%timeit");
        expect(CONSOLE_MAGIC_HELP).toContain("%%capture");
    });
});

/* ------------------------------------------------------------------ */
/*  appendConsoleHistory — persisted history array ops                  */
/* ------------------------------------------------------------------ */

describe("appendConsoleHistory", () => {
    it("appends and collapses consecutive repeats (same reference back)", () => {
        const h = ["a = 1", "b = 2"];
        expect(appendConsoleHistory(h, "c = 3")).toEqual(["a = 1", "b = 2", "c = 3"]);
        // re-running the newest line keeps ONE entry — and returns the
        // SAME array so React state can bail.
        const h2 = ["a = 1", "b = 2"];
        const out = appendConsoleHistory(h2, "b = 2");
        expect(out).toBe(h2);
        // trim-tolerant comparison
        expect(appendConsoleHistory(["b = 2"], "  b = 2  ")).toEqual(["b = 2"]);
    });

    it("ignores blank entries", () => {
        const h = ["x"];
        expect(appendConsoleHistory(h, "   ")).toBe(h);
        expect(appendConsoleHistory(h, "")).toBe(h);
    });

    it("caps to the newest CONSOLE_HISTORY_CAP entries", () => {
        const big: string[] = Array.from({length: CONSOLE_HISTORY_CAP + 5}, (_, i) => `line ${i}`);
        const out = appendConsoleHistory(big, "newest");
        expect(out).toHaveLength(CONSOLE_HISTORY_CAP);
        expect(out[out.length - 1]).toBe("newest");
        // the OLDEST six entries fell off the front
        expect(out[0]).toBe("line 6");
        expect(out).not.toContain("line 5");
        expect(out).not.toContain("line 0");
    });
});

/* ------------------------------------------------------------------ */
/*  parseDataFrameRepr — the third table detector                       */
/* ------------------------------------------------------------------ */

describe("parseDataFrameRepr", () => {
    it("parses the plain pandas text repr (RangeIndex rows)", () => {
        const repr = ["   name  value", "0    aa      1", "1  bbbbb      2", "", "[2 rows x 2 columns]"].join("\n");
        const t = parseDataFrameRepr(repr);
        expect(t).not.toBeNull();
        // columns INCLUDE the leading index slot
        expect(t?.columns).toEqual(["", "name", "value"]);
        expect(t?.rows).toEqual([
            ["0", "aa", "1"],
            ["1", "bbbbb", "2"],
        ]);
        expect(t?.shapeNote).toBe("[2 rows x 2 columns]");
    });

    it("parses a named-index frame (empty index header, >= 2 rows)", () => {
        const repr = ["      name  value", "r1     aa      1", "r2  bbbbb      2"].join("\n");
        const t = parseDataFrameRepr(repr);
        expect(t?.columns).toEqual(["", "name", "value"]);
        expect(t?.rows).toHaveLength(2);
    });

    it("keeps pandas' ellipsis truncation row as a marker row", () => {
        // pandas' truncation filler is column-aligned — 2+ spaces between
        // the .. / ... cells, exactly like the data rows.
        const repr = ["   a  b", "0  1  x", "..  ..  ...", "9  2  y"].join("\n");
        const t = parseDataFrameRepr(repr);
        expect(t?.rows).toEqual([["0", "1", "x"], ["…"], ["9", "2", "y"]]);
    });

    it("rejects a Series tail (Name: …, dtype: …)", () => {
        const repr = ["0    1\n1    2\nName: x, dtype: int64"].join("\n");
        expect(parseDataFrameRepr(repr)).toBeNull();
    });

    it("rejects prose / mixed output that is not a whole-frame block", () => {
        expect(parseDataFrameRepr("hello world\nsecond line")).toBeNull();
        expect(parseDataFrameRepr("single line")).toBeNull();
    });

    it("rejects a plausible block followed by a mismatched line (mixed output stays text)", () => {
        // The header+row pair looks like a frame, but the block must
        // consume the ENTIRE non-blank text — the trailing line bails.
        expect(parseDataFrameRepr("a  b\n0  1\ntrailing junk after the block")).toBeNull();
        expect(parseDataFrameRepr("a  b\n0  1\nName: x, dtype: int64")).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/*  Kernel-side cell magics (4) — the REAL python process               */
/* ------------------------------------------------------------------ */

/** Interpreter for the kernel integration tests — overridable because
 *  `python3` is not guaranteed on every machine that runs the suite. */
const PYTHON = process.env.PRAXIS_TEST_PYTHON ?? "python3";

async function pythonAvailable(cmd: string): Promise<boolean> {
    return await new Promise((resolve) => {
        const p = spawn(cmd, ["--version"], {stdio: "ignore"});
        p.on("error", () => resolve(false));
        p.on("close", (code) => resolve(code === 0));
    });
}

const hasPython = await pythonAvailable(PYTHON);

interface KernelResult {
    stdout: string;
    stderr: string;
    end: Record<string, unknown>;
}

/** Boot the kernel (CONSOLE_KERNEL_PY verbatim — the same string
 *  console-sessions writes to disk) and drive it over stdin/stdout
 *  JSON-lines, exactly like /api/console does. */
async function startKernel() {
    const child = spawn(PYTHON, ["-u", "-c", CONSOLE_KERNEL_PY], {
        stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    const lines: string[] = [];
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (d: string) => {
        buffer += d;
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
            lines.push(buffer.slice(0, idx));
            buffer = buffer.slice(idx + 1);
        }
    });
    let stderrText = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (d: string) => {
        stderrText += d;
    });
    let seq = 0;
    const submit = (code: string, mode = "eval") =>
        new Promise<KernelResult>((resolve, reject) => {
            seq += 1;
            const id = seq;
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            `kernel submission timed out: ${JSON.stringify(code.slice(0, 60))}; kernel stderr: ${stderrText.slice(0, 400)}`
                        )
                    ),
                20_000
            );
            const poll = setInterval(() => {
                let stdout = "";
                let stderr = "";
                let end: Record<string, unknown> | null = null;
                for (const raw of lines) {
                    let obj: Record<string, unknown>;
                    try {
                        obj = JSON.parse(raw) as Record<string, unknown>;
                    } catch {
                        continue;
                    }
                    if (obj.id !== id) continue;
                    if (obj.event === "stdout") stdout += (obj.text as string) ?? "";
                    else if (obj.event === "stderr") stderr += (obj.text as string) ?? "";
                    else if (obj.event === "end") end = obj;
                }
                if (end) {
                    clearTimeout(timer);
                    clearInterval(poll);
                    resolve({stdout, stderr, end});
                }
            }, 20);
            child.stdin.write(JSON.stringify({id, code, mode}) + "\n");
        });
    return {
        submit,
        kill: () => {
            try {
                child.kill();
            } catch {
                /* already dead */
            }
        },
    };
}

describe.skipIf(!hasPython)("console kernel cell magics (real python process)", () => {
    it(
        "%%time times the whole cell and reports wall time",
        async () => {
            const k = await startKernel();
            try {
                const r = await k.submit("%%time\nx = 40 + 2\n");
                expect(r.end.ok).toBe(true);
                expect(r.stdout).toMatch(/Wall time: \d+\.\d+s\n$/);
                // the cell itself ran in the persistent namespace
                const check = await k.submit("x");
                expect(check.stdout).toContain("42");
            } finally {
                k.kill();
            }
        },
        40_000
    );

    it(
        "%%timeit reports best-of-3 and warns that side effects repeat",
        async () => {
            const k = await startKernel();
            try {
                const r = await k.submit("%%timeit\ny = 1\n");
                expect(r.end.ok).toBe(true);
                expect(r.stdout).toMatch(/Best of 3: \d+\.\d+ ms per run \(mean \d+\.\d+ ms\)/);
                expect(r.stdout).toContain("side effects repeat");
            } finally {
                k.kill();
            }
        },
        40_000
    );

    it(
        "%%capture swallows the cell output into _capture (readable later)",
        async () => {
            const k = await startKernel();
            try {
                const r = await k.submit('%%capture\nprint("hello captured")\n');
                expect(r.end.ok).toBe(true);
                expect(r.stdout).not.toContain("hello captured");
                expect(r.stdout).toMatch(/\[%%capture\] \d+ chars of stdout\/stderr stored in _capture\n/);
                const read = await k.submit("_capture");
                expect(read.stdout).toContain("hello captured");
            } finally {
                k.kill();
            }
        },
        40_000
    );

    it(
        "unknown %%token → friendly error, the cell does NOT run",
        async () => {
            const k = await startKernel();
            try {
                const r = await k.submit("%%bash\ncanary = 1\n");
                expect(r.end.ok).toBe(false);
                expect(r.stderr).toContain("Unknown cell magic %%bash");
                expect(r.stderr).toContain("%%time");
                expect(r.stderr).toContain("%%capture");
                // the cell body never executed
                const check = await k.submit("canary");
                expect(check.end.ok).toBe(false);
                expect(check.stderr).toContain("NameError");
            } finally {
                k.kill();
            }
        },
        40_000
    );

    it(
        "%help lists the new cell magics (kept in sync with CONSOLE_MAGIC_HELP)",
        async () => {
            const k = await startKernel();
            try {
                const r = await k.submit("%help");
                expect(r.end.ok).toBe(true);
                expect(r.stdout).toContain("%%time");
                expect(r.stdout).toContain("%%timeit");
                expect(r.stdout).toContain("%%capture");
                // the client-side help mentions them too
                expect(CONSOLE_MAGIC_HELP).toContain("%%capture");
            } finally {
                k.kill();
            }
        },
        40_000
    );
});
