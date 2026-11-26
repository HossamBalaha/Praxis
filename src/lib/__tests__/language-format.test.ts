import {describe, expect, it} from "vitest";
import {convertJsQuotes, reindentBatch, reindentPowershell} from "@/lib/code-format";

describe("PowerShell re-indent", () => {
    it("indents brace blocks with else at the opener's level", () => {
        const src = [
            "# comment stays",
            "function Get-Sum($a, $b) {",
            "if ($a -gt $b) {",
            'Write-Host "bigger"',
            "} else {",
            'Write-Host "smaller"',
            "}",
            "}",
            "",
        ].join("\n");
        const out = reindentPowershell(src, {indentWidth: 2});
        expect(out).toBe(
            [
                "# comment stays",
                "function Get-Sum($a, $b) {",
                "  if ($a -gt $b) {",
                '    Write-Host "bigger"',
                "  } else {",
                '    Write-Host "smaller"',
                "  }",
                "}",
                "",
            ].join("\n")
        );
    });

    it("freezes here-string interiors (no depth drift from their braces)", () => {
        const src = [
            "$msg = @\"",
            "plain { text } with ( parens )",
            "\"@",
            "Write-Host $msg",
        ].join("\n");
        const out = reindentPowershell(src, {indentWidth: 2});
        // The interior line must survive VERBATIM and later lines stay level.
        expect(out.split("\n")).toEqual([
            "$msg = @\"",
            "plain { text } with ( parens )",
            "\"@",
            "Write-Host $msg",
            "",
        ]);
    });

    it("freezes <# #> block-comment interiors", () => {
        const src = [
            "<#",
            "  .SYNOPSIS { not a brace }",
            "#>",
            "$x = 1",
        ].join("\n");
        const out = reindentPowershell(src, {indentWidth: 2});
        expect(out.split("\n")).toEqual([
            "<#",
            "  .SYNOPSIS { not a brace }",
            "#>",
            "$x = 1",
            "",
        ]);
    });
});

describe("Batch re-indent", () => {
    it("indents paren blocks, dedents ) else (, pins :labels at column 0", () => {
        const src = [
            "@echo off",
            "if exist file.txt (",
            "echo found",
            ") else (",
            "echo missing",
            ")",
            ":done",
            "echo bye",
        ].join("\n");
        const out = reindentBatch(src, {indentWidth: 2});
        expect(out).toBe(
            [
                "@echo off",
                "if exist file.txt (",
                "  echo found",
                ") else (",
                "  echo missing",
                ")",
                ":done",
                "echo bye",
            ].join("\n") + "\n"
        );
    });

    it("freezes REM comment indentation", () => {
        const out = reindentBatch("rem   spaced comment", {});
        expect(out).toContain("rem   spaced comment");
    });
});

describe("JS quotes (existing behavior, regression)", () => {
    it("converts safe singles to doubles", () => {
        expect(convertJsQuotes(`const a = 'x', b = "y";`, "double")).toBe(`const a = "x", b = "y";`);
    });
    it("never converts a body that would need re-escaping", () => {
        const src = `const a = 'say "hi"'`;
        expect(convertJsQuotes(src, "double")).toBe(src);
    });
});
