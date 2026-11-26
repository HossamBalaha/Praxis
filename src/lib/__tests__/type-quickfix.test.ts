/**
 * Unit tests for the mypy quick-fix payload computation exported by the
 * diagnostics panel (src/components/diagnostics-panel.tsx):
 *
 * · computeAnnotationFix — `: Any` on assignment targets / `-> Any` on
 *   the enclosing def, with the `from typing import Any` insertion;
 * · computeCastFix — wrap the RHS in `cast("<expected>", …)` with the
 *   `from typing import cast` insertion;
 * · insertTypingImport / hasTypingImport / splitTopLevelAssign — the
 *   building blocks (naive isort placement, top-level `=` scanning).
 *
 * Every null-return case documents an ambiguity guard: when no safe
 * insertion point is computable the panel simply doesn't offer the
 * fix (the button doesn't render).
 */
import {describe, expect, it} from "vitest";
import {
    computeAnnotationFix,
    computeCastFix,
    hasTypingImport,
    insertTypingImport,
    splitTopLevelAssign,
    stripTrailingComment,
} from "@/components/diagnostics-panel";

const ASSIGN_MISMATCH =
    'Incompatible types in assignment (expression has type "int", variable has type "str")  [assignment]';
const RETURNING_ANY =
    'Returning Any from function "compute" (hidden "Any" in return type)  [no-any-return]';
const NEED_ANNOTATION =
    'Need type annotation for "x" (hint: "x = ...")  [var-annotated]';

describe("computeAnnotationFix — assignments", () => {
    it("inserts `: Any` after a simple-name target and adds the typing import", () => {
        const out = computeAnnotationFix(
            {line: 1, col: 1, message: ASSIGN_MISMATCH},
            "x = 1\n"
        );
        expect(out).toBe("from typing import Any\nx: Any = 1\n");
    });

    it("appends the import after an existing import block", () => {
        const out = computeAnnotationFix(
            {line: 3, col: 1, message: ASSIGN_MISMATCH},
            "import os\n\nx = compute()\n"
        );
        expect(out).toBe("import os\nfrom typing import Any\n\nx: Any = compute()\n");
    });

    it("skips the import when `from typing import Any` already exists", () => {
        const out = computeAnnotationFix(
            {line: 3, col: 1, message: ASSIGN_MISMATCH},
            "from typing import Any\n\nx = 1\n"
        );
        expect(out).toBe("from typing import Any\n\nx: Any = 1\n");
    });

    it("annotates `Need type annotation for …` the same way", () => {
        const out = computeAnnotationFix(
            {line: 1, col: 1, message: NEED_ANNOTATION},
            "x = []\n"
        );
        expect(out).toBe("from typing import Any\nx: Any = []\n");
    });

    it("preserves indentation on indented targets", () => {
        const out = computeAnnotationFix(
            {line: 2, col: 5, message: ASSIGN_MISMATCH},
            "def f():\n    total = 0\n"
        );
        expect(out).toBe("from typing import Any\ndef f():\n    total: Any = 0\n");
    });

    it("returns null when the target is already annotated", () => {
        expect(
            computeAnnotationFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "x: int = 5\n"
            )
        ).toBeNull();
    });

    it("returns null for augmented assignments, attribute and tuple targets", () => {
        expect(
            computeAnnotationFix({line: 1, col: 1, message: ASSIGN_MISMATCH}, "x += 1\n")
        ).toBeNull();
        expect(
            computeAnnotationFix({line: 1, col: 1, message: ASSIGN_MISMATCH}, "obj.x = 1\n")
        ).toBeNull();
        expect(
            computeAnnotationFix({line: 1, col: 1, message: ASSIGN_MISMATCH}, "a, b = 1, 2\n")
        ).toBeNull();
    });

    it("returns null for `==` / kwarg lines that carry no top-level `=`", () => {
        expect(
            computeAnnotationFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "if x == y:\n    pass\n"
            )
        ).toBeNull();
        expect(
            computeAnnotationFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "print(x=1)\n"
            )
        ).toBeNull();
    });

    it("returns null when the diagnostic line is out of range", () => {
        expect(
            computeAnnotationFix({line: 99, col: 1, message: ASSIGN_MISMATCH}, "x = 1\n")
        ).toBeNull();
    });
});

describe("computeAnnotationFix — Returning Any from function", () => {
    it("inserts `-> Any` after the enclosing def's closing paren", () => {
        const src = "def compute(x):\n    return x\n\ny = compute(1)\n";
        const out = computeAnnotationFix(
            {line: 2, col: 5, message: RETURNING_ANY},
            src
        );
        expect(out).toBe(
            "from typing import Any\ndef compute(x) -> Any:\n    return x\n\ny = compute(1)\n"
        );
    });

    it("skips the import when typing.Any is already imported", () => {
        const src = "from typing import Any\n\n\ndef compute(x):\n    return x\n";
        const out = computeAnnotationFix({line: 5, col: 5, message: RETURNING_ANY}, src);
        expect(out).toBe(
            "from typing import Any\n\n\ndef compute(x) -> Any:\n    return x\n"
        );
    });

    it("handles async defs and multi-line signatures", () => {
        const src = [
            "async def compute(",
            "    a,",
            "    b,",
            "):",
            "    return a",
            "",
        ].join("\n");
        const out = computeAnnotationFix({line: 5, col: 5, message: RETURNING_ANY}, src);
        expect(out).not.toBeNull();
        const lines = out!.split("\n");
        // The import goes on top; the `-> Any` lands on the signature's
        // closing-paren line (`):` becomes `) -> Any:`).
        expect(lines[0]).toBe("from typing import Any");
        expect(lines[4]).toBe(") -> Any:");
    });

    it("returns null when the function already has a `->` annotation", () => {
        expect(
            computeAnnotationFix(
                {line: 2, col: 5, message: RETURNING_ANY},
                "def compute(x) -> int:\n    return x\n"
            )
        ).toBeNull();
    });

    it("returns null when no enclosing def exists above the return", () => {
        expect(
            computeAnnotationFix({line: 1, col: 1, message: RETURNING_ANY}, "return x\n")
        ).toBeNull();
    });
});

describe("computeCastFix", () => {
    it("wraps the RHS in cast(expected, …) and adds the import", () => {
        const out = computeCastFix(
            {line: 1, col: 1, message: ASSIGN_MISMATCH},
            "x = compute()\n"
        );
        expect(out).toBe('from typing import cast\nx = cast("str", compute())\n');
    });

    it("extracts the expected type from the newer `target has type` phrasing", () => {
        const out = computeCastFix(
            {
                line: 1,
                col: 1,
                message:
                    'Incompatible types in assignment (expression has type "str", target has type "int")  [assignment]',
            },
            "x = input()\n"
        );
        expect(out).toBe('from typing import cast\nx = cast("int", input())\n');
    });

    it("quotes generic expected types so the cast never NameErrors", () => {
        const out = computeCastFix(
            {
                line: 1,
                col: 1,
                message:
                    'Incompatible types in assignment (expression has type "int", variable has type "list[int]")',
            },
            "x = count()\n"
        );
        expect(out).toBe('from typing import cast\nx = cast("list[int]", count())\n');
    });

    it("preserves indentation and trailing comments", () => {
        const out = computeCastFix(
            {line: 2, col: 5, message: ASSIGN_MISMATCH},
            "def f():\n    total = compute()  # legacy call\n"
        );
        expect(out).toBe(
            'from typing import cast\ndef f():\n    total = cast("str", compute())  # legacy call\n'
        );
    });

    it("skips the import when `from typing import cast` already exists", () => {
        const out = computeCastFix(
            {line: 3, col: 1, message: ASSIGN_MISMATCH},
            "from typing import cast\n\nx = compute()\n"
        );
        expect(out).toBe('from typing import cast\n\nx = cast("str", compute())\n');
    });

    it("returns null when the RHS boundary is ambiguous", () => {
        // Statement continues on the next line (unbalanced brackets).
        expect(
            computeCastFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "x = compute(1,\n    2)\n"
            )
        ).toBeNull();
        // Explicit line continuation.
        expect(
            computeCastFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "x = compute() \\\n    + 1\n"
            )
        ).toBeNull();
        // Two statements share the line.
        expect(
            computeCastFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "x = compute(); y = 1\n"
            )
        ).toBeNull();
        // Bare yield is not an expression argument.
        expect(
            computeCastFix(
                {line: 1, col: 1, message: ASSIGN_MISMATCH},
                "x = yield v\n"
            )
        ).toBeNull();
    });

    it("returns null when the expected type is missing or is Any", () => {
        expect(
            computeCastFix({line: 1, col: 1, message: RETURNING_ANY}, "x = 1\n")
        ).toBeNull();
        expect(
            computeCastFix(
                {
                    line: 1,
                    col: 1,
                    message:
                        'Incompatible types in assignment (expression has type "int", variable has type "Any")',
                },
                "x = 1\n"
            )
        ).toBeNull();
    });

    it("returns null for non-assignment lines and non-simple targets", () => {
        expect(
            computeCastFix({line: 1, col: 1, message: ASSIGN_MISMATCH}, "print(1)\n")
        ).toBeNull();
        expect(
            computeCastFix({line: 1, col: 1, message: ASSIGN_MISMATCH}, "obj.x = 1\n")
        ).toBeNull();
    });
});

describe("insertTypingImport", () => {
    it("places the import after the module docstring and import block", () => {
        const src = [
            '"""Module docstring."""',
            "",
            "import os",
            "import sys",
            "",
            "x = 1",
            "",
        ].join("\n");
        expect(insertTypingImport(src, "Any")).toBe(
            [
                '"""Module docstring."""',
                "",
                "import os",
                "import sys",
                "from typing import Any",
                "",
                "x = 1",
                "",
            ].join("\n")
        );
    });

    it("skips a multi-line docstring", () => {
        const src = ['"""Header', "body", '"""', "", "x = 1", ""].join("\n");
        const out = insertTypingImport(src, "Any");
        expect(out.split("\n")[0]).toBe('"""Header');
        expect(out.split("\n")[4]).toBe("from typing import Any");
    });

    it("keeps __future__ first (inserted after it)", () => {
        const src = "from __future__ import annotations\n\nx = 1\n";
        expect(insertTypingImport(src, "Any")).toBe(
            "from __future__ import annotations\nfrom typing import Any\n\nx = 1\n"
        );
    });

    it("appends after the closing paren of a paren multi-line import", () => {
        const src = ["from typing import (", "    List,", ")", "", "x = 1", ""].join("\n");
        expect(insertTypingImport(src, "Any")).toBe(
            [
                "from typing import (",
                "    List,",
                ")",
                "from typing import Any",
                "",
                "x = 1",
                "",
            ].join("\n")
        );
    });

    it("returns the content unchanged when the name is already imported", () => {
        expect(insertTypingImport("from typing import Any\n", "Any")).toBe(
            "from typing import Any\n"
        );
        expect(insertTypingImport("from typing import List, Any\n", "Any")).toBe(
            "from typing import List, Any\n"
        );
        expect(
            insertTypingImport("from typing import (\n    Any,\n)\n", "Any")
        ).toBe("from typing import (\n    Any,\n)\n");
        expect(insertTypingImport("from typing import *\n", "Any")).toBe(
            "from typing import *\n"
        );
    });

    it("inserts before the first code line when there are no imports", () => {
        expect(insertTypingImport("x = 1\n", "cast")).toBe(
            "from typing import cast\nx = 1\n"
        );
    });
});

describe("hasTypingImport", () => {
    it("detects line-form, paren-form and star imports", () => {
        expect(hasTypingImport("from typing import Any\n", "Any")).toBe(true);
        expect(hasTypingImport("from typing import List, cast\n", "cast")).toBe(true);
        expect(hasTypingImport("from typing import (\n    List,\n    cast,\n)\n", "cast")).toBe(true);
        expect(hasTypingImport("from typing import *\n", "Any")).toBe(true);
        // A name that merely CONTAINS the word doesn't count.
        expect(hasTypingImport("from typing import AnyStr\n", "Any")).toBe(false);
        expect(hasTypingImport("from os import path\n", "Any")).toBe(false);
    });
});

describe("splitTopLevelAssign", () => {
    it("splits a plain assignment", () => {
        const parts = splitTopLevelAssign("x = 1 + 2");
        expect(parts).not.toBeNull();
        expect(parts!.target).toBe("x");
        expect(parts!.rhs).toBe("1 + 2");
        expect(parts!.indent).toBe("");
        expect(parts!.trailingComment).toBeNull();
    });

    it("splits with indentation and trailing comment", () => {
        const parts = splitTopLevelAssign("    total = compute()  # legacy");
        expect(parts!.target).toBe("total");
        expect(parts!.rhs).toBe("compute()");
        expect(parts!.trailingComment).toBe("# legacy");
    });

    it("does not split kwarg defaults, comparisons or augmented forms", () => {
        expect(splitTopLevelAssign("print(a=1)")).toBeNull();
        expect(splitTopLevelAssign("if a == b:")).toBeNull();
        expect(splitTopLevelAssign("a += 1")).toBeNull();
        expect(splitTopLevelAssign("a //= 2")).toBeNull();
        expect(splitTopLevelAssign("a := 3")).toBeNull();
        expect(splitTopLevelAssign("a.b = 1")).toBeNull();
        expect(splitTopLevelAssign("a, b = 1, 2")).toBeNull();
        // `#` inside a string literal is not a comment — the string's `=` count.
        expect(splitTopLevelAssign('s = "x # not a comment"')).not.toBeNull();
    });
});

describe("stripTrailingComment", () => {
    it("splits code from comment, quote-aware", () => {
        expect(stripTrailingComment("x = 1  # note")).toEqual({
            code: "x = 1  ",
            comment: "# note",
        });
        expect(stripTrailingComment('s = "a # b"')).toEqual({
            code: 's = "a # b"',
            comment: null,
        });
        expect(stripTrailingComment("x = 1")).toEqual({
            code: "x = 1",
            comment: null,
        });
    });
});
