/**
 * Unit tests for the pdb call-stack + watch helpers exported by the
 * debug route (src/app/api/debug/route.ts).
 *
 * The `where` fixtures below are REAL captures from Python 3.12's
 * `python -u -m pdb` (the route drives that exact protocol), so the
 * parser is pinned against pdb's actual output grammar:
 *
 *   · frames print oldest-first, one `path(line)func()` per line;
 *   · the selected frame is prefixed with `> `, all others with two
 *     spaces;
 *   · every frame line is followed by a `-> source` line (when source
 *     is available) which must never be mistaken for a frame;
 *   · synthetic frames like `<string>(1)<module>()` are valid frames;
 *   · bdb's canonic() LOWERCASES every path on Windows (it applies
 *     os.path.normcase), which canonifyPdbPath() undoes against the
 *     real filesystem.
 */
import {describe, expect, it} from "vitest";
import {canonifyPdbPath, parsePdbWhere, sanitizeWatchExpressions,} from "@/app/api/debug/route";

/** A literal capture of `w` at a stop inside inner() (bdb + <string>
 *  frames included) — the exact bytes pdb 3.12 prints. */
const WHERE_INNER = [
    "  /home/z/.local/share/uv/python/cpython-3.12.16-linux-x86_64-gnu/lib/python3.12/bdb.py(627)run()",
    "-> exec(cmd, globals, locals)",
    "  <string>(1)<module>()",
    "  /tmp/pdbprobe/sample.py(9)<module>()",
    "-> outer()",
    "  /tmp/pdbprobe/sample.py(7)outer()",
    "-> return inner(a)",
    "> /tmp/pdbprobe/sample.py(3)inner()",
    "-> return y",
    "",
].join("\n");

describe("parsePdbWhere", () => {
    it("parses a real pdb 3.12 `where` capture bottom-up with the selected frame last", () => {
        const parsed = parsePdbWhere(WHERE_INNER);
        expect(parsed).not.toBeNull();
        const {frames, current} = parsed!;
        expect(frames).toHaveLength(5);
        expect(frames.map((f) => f.function)).toEqual([
            "run",
            "<module>",
            "<module>",
            "outer",
            "inner",
        ]);
        // Bottom-up: index 0 is the OLDEST frame, last is the innermost.
        expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 4]);
        expect(frames[0].file).toContain("bdb.py");
        expect(frames[0].line).toBe(627);
        expect(frames[1].file).toBe("<string>");
        expect(frames[1].line).toBe(1);
        expect(frames[4].file).toBe("/tmp/pdbprobe/sample.py");
        expect(frames[4].line).toBe(3);
        // Only the innermost frame carries the `>` marker.
        expect(frames.map((f) => f.current)).toEqual([
            false,
            false,
            false,
            false,
            true,
        ]);
        expect(current).toBe(4);
    });

    it("parses a single-frame `up` response (selected frame marked)", () => {
        const parsed = parsePdbWhere(
            "> /tmp/pdbprobe/sample.py(7)outer()\n-> return inner(a)\n"
        );
        expect(parsed).not.toBeNull();
        expect(parsed!.frames).toHaveLength(1);
        expect(parsed!.frames[0].function).toBe("outer");
        expect(parsed!.frames[0].line).toBe(7);
        expect(parsed!.frames[0].current).toBe(true);
        expect(parsed!.current).toBe(0);
    });

    it("falls back to the innermost frame when no `>` marker is present", () => {
        const parsed = parsePdbWhere(
            "  /tmp/a.py(1)<module>()\n  /tmp/a.py(5)f()\n"
        );
        expect(parsed).not.toBeNull();
        expect(parsed!.current).toBe(1);
        expect(parsed!.frames[1].current).toBe(true);
        expect(parsed!.frames[0].current).toBe(false);
    });

    it("never mistakes `->` source lines (even paren-heavy ones) for frames", () => {
        const parsed = parsePdbWhere(
            "  /tmp/a.py(5)f()\n-> foo(bar(1), {baz: 2})\n"
        );
        expect(parsed!.frames).toHaveLength(1);
    });

    it("returns null for non-stack output (pdb errors, empty, garbage)", () => {
        expect(parsePdbWhere("*** NameError: name 'a' is not defined\n")).toBeNull();
        expect(parsePdbWhere("")).toBeNull();
        expect(parsePdbWhere("The program finished and will be restarted\n")).toBeNull();
    });

    it("rejects frame lines with a non-positive line number", () => {
        expect(parsePdbWhere("  /tmp/a.py(0)f()\n")).toBeNull();
    });
});

describe("sanitizeWatchExpressions", () => {
    it("accepts a plain list of expressions, trimmed and de-duplicated", () => {
        expect(
            sanitizeWatchExpressions(["x + 1", " x + 1 ", "len(data)", "x + 1"])
        ).toEqual(["x + 1", "len(data)"]);
    });

    it("returns [] for non-array input", () => {
        expect(sanitizeWatchExpressions(undefined)).toEqual([]);
        expect(sanitizeWatchExpressions("x + 1")).toEqual([]);
        expect(sanitizeWatchExpressions(null)).toEqual([]);
    });

    it("flattens newlines — a newline could smuggle a second pdb command", () => {
        // The route writes `p (<expr>)` as ONE pdb command line; embedded
        // newlines must never survive sanitization.
        expect(sanitizeWatchExpressions(["a\nq\n"])).toEqual(["a q"]);
        expect(sanitizeWatchExpressions(["a\r\nq"])).toEqual(["a q"]);
    });

    it("drops non-strings, blanks and over-long expressions", () => {
        expect(
            sanitizeWatchExpressions([42, "", "   ", "x".repeat(201), "ok"])
        ).toEqual(["ok"]);
    });

    it("caps the list at 32 entries", () => {
        const many = Array.from({length: 50}, (_, i) => `w${i}`);
        const out = sanitizeWatchExpressions(many);
        expect(out).toHaveLength(32);
        expect(out[0]).toBe("w0");
        expect(out[31]).toBe("w31");
    });
});

describe("canonifyPdbPath", () => {
    it("restores the true on-disk casing of a Windows-mangled pdb path", () => {
        // bdb's canonic() lowercases on Windows: pdb prints
        // `d:\praxis\...\smokestack.py` even when the file is SmokeStack.py.
        const real = canonifyPdbPath(
            "d:\\praxis\\python_scripts\\debugger smoke test\\smokestack.py",
            () =>
                "D:\\Praxis\\python_scripts\\Debugger Smoke Test\\SmokeStack.py",
            "win32"
        );
        expect(real).toBe(
            "D:\\Praxis\\python_scripts\\Debugger Smoke Test\\SmokeStack.py"
        );
    });

    it("passes pdb's path through untouched when realpath fails (file gone)", () => {
        const raw = "d:\\gone\\deleted.py";
        const out = canonifyPdbPath(
            raw,
            () => {
                throw new Error("ENOENT");
            },
            "win32"
        );
        expect(out).toBe(raw);
    });

    it("never consults the filesystem for synthetic pdb frame names", () => {
        const seen: string[] = [];
        const out = canonifyPdbPath(
            "<string>",
            (p) => {
                seen.push(p);
                return p.toUpperCase();
            },
            "win32"
        );
        expect(out).toBe("<string>");
        expect(seen).toEqual([]);
    });

    it("is the identity on POSIX (normcase is a no-op there)", () => {
        const seen: string[] = [];
        const raw = "/tmp/pdbprobe/Sample.py";
        const out = canonifyPdbPath(
            raw,
            (p) => {
                seen.push(p);
                return p;
            },
            "linux"
        );
        expect(out).toBe(raw);
        expect(seen).toEqual([]);
    });
});
