/**
 * ruff-format-args.test.ts — unit tests for the ruff-invocation arg
 * builders in src/lib/formatter-binaries.ts.
 *
 * The builders are the ONE argv shape every ruff path shares: the
 * standalone-binary layer in formatter-binaries and the
 * `<interpreter> -m ruff` layer in /api/format compose them (the latter
 * prepends ["-m", "ruff"]). These tests pin the exact argv so a stray
 * flag can never drift between the layers — and pin the two invariants
 * the Windows argv guard demands: the SOURCE never appears in argv
 * (stdin only) and every element is a fixed literal / file name.
 */
import {describe, expect, it} from "vitest";
import {
    ruffFormatDiskArgs,
    ruffFormatStdinArgs,
    ruffOrganizeDiskArgs,
    ruffOrganizeStdinArgs,
} from "@/lib/formatter-binaries";

describe("ruff format — stdin argv (black's STDIN mirror)", () => {
    it("bare stdin mode when no file backs the buffer (notebook cell)", () => {
        expect(ruffFormatStdinArgs()).toEqual(["format", "-"]);
    });

    it("carries --stdin-filename so ruff resolves the project config", () => {
        expect(ruffFormatStdinArgs("/work/scripts/main.py")).toEqual([
            "format",
            "--stdin-filename",
            "/work/scripts/main.py",
            "-",
        ]);
    });

    it("the stdin marker is always LAST (the lint route's flag order)", () => {
        const args = ruffFormatStdinArgs("x.py");
        expect(args[args.length - 1]).toBe("-");
    });
});

describe("ruff format — disk argv (in place, black --quiet's mirror)", () => {
    it("formats the file on disk with no extra flags", () => {
        expect(ruffFormatDiskArgs("/work/scripts/main.py")).toEqual([
            "format",
            "/work/scripts/main.py",
        ]);
    });
});

describe("ruff organize-imports — stdin argv (--select I --fix)", () => {
    it("selects only the I rules, fixes, skips the cache, reads stdin", () => {
        expect(ruffOrganizeStdinArgs("/work/scripts/main.py")).toEqual([
            "check",
            "--select",
            "I",
            "--fix",
            "--no-cache",
            "--stdin-filename",
            "/work/scripts/main.py",
            "-",
        ]);
    });

    it("the stdin marker is last", () => {
        const args = ruffOrganizeStdinArgs("x.py");
        expect(args[args.length - 1]).toBe("-");
    });
});

describe("ruff organize-imports — disk argv (in place)", () => {
    it("fixes the file on disk", () => {
        expect(ruffOrganizeDiskArgs("/work/scripts/main.py")).toEqual([
            "check",
            "--select",
            "I",
            "--fix",
            "--no-cache",
            "/work/scripts/main.py",
        ]);
    });
});

describe("argv invariants (Windows / injection guards)", () => {
    it("no argv element ever contains the SOURCE (stdin-only transport)", () => {
        const source = "def f():\n    return 1\n";
        // The builders never take the source at all — assert on the shapes
        // produced for a file that WOULD carry it.
        const all = [
            ...ruffFormatStdinArgs("/p/f.py"),
            ...ruffFormatDiskArgs("/p/f.py"),
            ...ruffOrganizeStdinArgs("/p/f.py"),
            ...ruffOrganizeDiskArgs("/p/f.py"),
        ];
        for (const el of all) {
            expect(el.includes(source)).toBe(false);
        }
    });

    it("the module layer composes by prepending -m ruff (no shell string)", () => {
        // /api/format's runRuffModule prepends ["-m", "ruff"] to these.
        const argv = ["-m", "ruff", ...ruffFormatStdinArgs("/p/f.py")];
        expect(argv).toEqual(["-m", "ruff", "format", "--stdin-filename", "/p/f.py", "-"]);
    });
});
