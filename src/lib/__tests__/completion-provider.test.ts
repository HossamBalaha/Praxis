/**
 * completion-provider.test.ts — unit tests for
 * src/lib/completion-provider.ts (the offline popup's pure core).
 *
 * Covers:
 * - keywordsForKind — every kind in the table resolves, unknown → [];
 * - collectDocumentWords — unique identifier-ish runs, cap;
 * - matchCompletions — 3-char gate, ranking (exact-case prefix →
 * case-insensitive prefix → word-boundary prefix → substring → fuzzy
 * subsequence), document words before keywords, dedupe, no verbatim
 * echo, limit, opt-in score/matchSpans;
 * - identifierPrefixBefore — the trigger word before the caret;
 * - the E19 Python provider — pythonCompletions (locals with def-line
 * signatures + docstrings, curated builtins with signatures, module
 * candidates with auto-import hints, snippet tabstops), importFor /
 * isImported / ensureImport, pythonIdentifierPrefixBefore.
 */
import {describe, expect, it} from "vitest";
import {
    collectDocumentWords,
    collectPythonLocals,
    ensureImport,
    identifierPrefixBefore,
    importFor,
    isImported,
    keywordsForKind,
    matchCompletions,
    pythonBuiltinDoc,
    pythonCompletions,
    pythonIdentifierPrefixBefore,
    snippetHasTabstops,
} from "@/lib/completion-provider";

describe("keywordsForKind", () => {
    it("resolves the registered kinds", () => {
        expect(keywordsForKind("javascript")).toContain("function");
        expect(keywordsForKind("typescript")).toContain("interface");
        expect(keywordsForKind("css")).toContain("align-items");
        expect(keywordsForKind("sql")).toContain("select");
        expect(keywordsForKind("shell")).toContain("elif");
        expect(keywordsForKind("go")).toContain("defer");
    });

    it("python merges the curated keywords AND the builtin table (E19)", () => {
        const kws = keywordsForKind("python");
        expect(kws).toContain("def");
        expect(kws).toContain("yield");
        expect(kws).toContain("print");
        expect(kws).toContain("enumerate");
        expect(kws).toContain("join");
    });

    it("unknown or plain kinds have no keywords", () => {
        expect(keywordsForKind("text")).toEqual([]);
        expect(keywordsForKind("log")).toEqual([]);
        expect(keywordsForKind("nope")).toEqual([]);
    });
});

describe("collectDocumentWords", () => {
    it("collects unique identifier-ish runs", () => {
        const out = collectDocumentWords("foo bar foo baz_foo qux");
        expect(out).toEqual(["foo", "bar", "baz_foo", "qux"]);
    });

    it("ignores runs shorter than 3 chars", () => {
        expect(collectDocumentWords("a bb ccc")).toEqual(["ccc"]);
    });

    it("caps the collection", () => {
        const text = Array.from({length: 50}, (_, i) => `word${i}`).join(" ");
        expect(collectDocumentWords(text, 10)).toHaveLength(10);
    });

    it("keeps hyphenated words whole (CSS-ish documents)", () => {
        expect(collectDocumentWords("align-items align-items")).toEqual(["align-items"]);
    });
});

describe("matchCompletions", () => {
    const words = ["conect", "configuration", "config"];
    const kws = ["const", "continue", "console"];

    it("requires 3+ chars", () => {
        expect(matchCompletions("c", words, kws)).toEqual([]);
        expect(matchCompletions("co", words, kws)).toEqual([]);
    });

    it("prefix matches from both sources, document words first", () => {
        const out = matchCompletions("con", ["conect"], kws);
        expect(out.map((c) => c.label)).toEqual(["conect", "const", "continue", "console"]);
        expect(out.map((c) => c.source)).toEqual(["document", "keyword", "keyword", "keyword"]);
    });

    it("falls back to case-insensitive prefix, then contains", () => {
        const out = matchCompletions("FIG", ["configure"], ["notify"], 5);
        expect(out.map((c) => c.label)).toEqual(["configure"]);
        const out2 = matchCompletions("igur", ["configure"], [], 5);
        expect(out2.map((c) => c.label)).toEqual(["configure"]);
    });

    it("dedupes across sources and skips the verbatim echo", () => {
        // "config" itself equals the prefix — echoed words are dropped;
        // the keyword "configmap" still joins after the document words.
        const out = matchCompletions("config", ["configure", "config"], ["configmap"], 8);
        expect(out.map((c) => c.label)).toEqual(["configure", "configmap"]);
    });

    it("never echoes the typed prefix verbatim", () => {
        const out = matchCompletions("configure", ["configure", "configured"], [], 8);
        expect(out.map((c) => c.label)).toEqual(["configured"]);
    });

    it("respects the limit", () => {
        const words2 = ["conect1", "conect2", "conect3", "conect4", "conect5"];
        const out = matchCompletions("conect", words2, [], 3);
        expect(out).toHaveLength(3);
    });
});

describe("identifierPrefixBefore", () => {
    it("returns the identifier run ending at the caret", () => {
        expect(identifierPrefixBefore("const con", 9)).toBe("con");
        expect(identifierPrefixBefore("align-items", 7)).toBe("align-i");
    });

    it("stops at separators", () => {
        expect(identifierPrefixBefore("foo.bar", 7)).toBe("bar");
        expect(identifierPrefixBefore("foo bar", 7)).toBe("bar");
    });

    it("returns '' when there is no 3+ run", () => {
        expect(identifierPrefixBefore("ab", 2)).toBe("");
        expect(identifierPrefixBefore("  ", 2)).toBe("");
        expect(identifierPrefixBefore("", 0)).toBe("");
    });

    it("minLen lets hosts ask for shorter runs (default stays 3)", () => {
        expect(identifierPrefixBefore("ab", 2, 1)).toBe("ab");
        expect(identifierPrefixBefore("c", 1, 1)).toBe("c");
        expect(identifierPrefixBefore("ab", 2)).toBe(""); // unchanged default
    });
});

describe("fuzzy matching (E19)", () => {
    it("subsequence-matches: prnt → print, dbcn → db_connect", () => {
        expect(matchCompletions("prnt", [], ["print", "input"], 8).map((c) => c.label)).toContain("print");
        expect(matchCompletions("dbcn", ["db_connect"], [], 8).map((c) => c.label)).toEqual(["db_connect"]);
    });

    it("ranks exact prefix > word-boundary prefix > substring > subsequence", () => {
        const out = matchCompletions("conn", ["db_connect", "connector", "reconnect"], [], 8);
        // connector: prefix; db_connect: the "connect" segment; reconnect: contains.
        expect(out.map((c) => c.label)).toEqual(["connector", "db_connect", "reconnect"]);
    });

    it("attaches score + matchSpans only when the host asks", () => {
        const plain = matchCompletions("prnt", [], ["print"], 8);
        expect(plain).toHaveLength(1);
        expect(plain[0].score).toBeUndefined();
        expect(plain[0].matchSpans).toBeUndefined();
        const rich = matchCompletions("prnt", [], ["print"], 8, {withScore: true, withSpans: true});
        expect(rich[0].score).toBeGreaterThan(0);
        // p(0) r(1) n(3) t(4) → two coalesced runs.
        expect(rich[0].matchSpans).toEqual([
            {start: 0, end: 2},
            {start: 3, end: 5},
        ]);
    });

    it("can disable the fuzzy tier", () => {
        expect(matchCompletions("prnt", [], ["print"], 8, {fuzzy: false})).toEqual([]);
    });
});

describe("pythonBuiltinDoc (E19)", () => {
    it("returns the curated signature + doc for known builtins", () => {
        expect(pythonBuiltinDoc("len")?.signature).toBe("len(obj)");
        const d = pythonBuiltinDoc("print");
        expect(d?.signature).toContain("print(");
        expect(d?.signature).toContain("sep=' '");
        expect(d?.doc.length).toBeGreaterThan(0);
        expect(pythonBuiltinDoc("join")?.signature).toBe("separator.join(iterable)");
    });

    it("returns null for unknown names", () => {
        expect(pythonBuiltinDoc("not_a_builtin_xyz")).toBeNull();
    });
});

describe("pythonCompletions (E19)", () => {
    const src = [
        "import numpy as np",
        "from datetime import datetime",
        "",
        "def load_data(path, cache=True):",
        '    """Load the dataset from disk."""',
        "    rows = []",
        "    for line in open(path):",
        "        name, value = line.split(',')",
        "        total += int(value)",
        "    return rows",
        "",
        "class Model:",
        '    """A tiny model."""',
        "    pass",
        "",
        "print(datetime.now())",
    ].join("\n");

    it("offers locals with the def line + docstring as signature context", () => {
        const out = pythonCompletions("loa", {source: src});
        expect(out.map((c) => c.label)).toContain("load_data");
        const local = out.find((c) => c.label === "load_data")!;
        expect(local.source).toBe("local");
        expect(local.detail).toBe("def load_data(path, cache=True)");
        expect(local.documentation).toBe("Load the dataset from disk.");
        // the curated builtin table joins after the locals
        expect(out.map((c) => c.label)).toContain("locals");
    });

    it("fuzzy-matches builtins and attaches score/spans on request", () => {
        const out = pythonCompletions("prnt", {
            source: src,
            withScore: true,
            withSpans: true,
            limit: 8,
        });
        const print = out.find((c) => c.label === "print");
        expect(print).toBeDefined();
        expect(print?.source).toBe("builtin");
        expect(print?.detail).toContain("print(");
        expect(print?.documentation).toBeTruthy();
        expect(print?.matchSpans).toEqual([
            {start: 0, end: 2},
            {start: 3, end: 5},
        ]);
        expect(print?.score).toBeGreaterThan(0);
    });

    it("surfaces module candidates with the import to insert", () => {
        const out = pythonCompletions("reque", {source: src});
        const req = out.find((c) => c.label === "requests");
        expect(req?.source).toBe("module");
        expect(req?.importModule).toBe("requests");
        expect(req?.detail).toBe("import requests");
    });

    it("keeps an exactly-typed module name offerable (import pending)", () => {
        const out = pythonCompletions("np", {source: "x = 1\n"});
        expect(out.map((c) => c.label)).toContain("np");
        const np = out.find((c) => c.label === "np")!;
        expect(np.importModule).toBe("numpy");
    });

    it("drops module candidates whose names are already imported", () => {
        // src binds np + datetime — the MODULE pool must not re-offer them,
        // but the local binding (from the import line) is still offered.
        const out = pythonCompletions("dateti", {source: src});
        expect(out.filter((c) => c.source === "module").map((c) => c.label)).not.toContain("datetime");
        const local = out.find((c) => c.label === "datetime");
        expect(local?.source).toBe("local");
        expect(local?.detail).toBe("from datetime import datetime");
    });

    it("surfaces host snippets with tabstop markers", () => {
        const out = pythonCompletions("de", {
            source: "",
            snippets: [{label: "def", insertText: "def ${1:name}($2):\n    $0\n"}],
        });
        const def = out.find((c) => c.label === "def");
        expect(def?.source).toBe("snippet");
        expect(def?.insertText).toBe("def ${1:name}($2):\n    $0\n");
        expect(def?.hasTabstops).toBe(true);
    });

    it("ranks keywords before locals before builtins, then shorter first", () => {
        const out = pythonCompletions("s", {source: src, limit: 5});
        expect(out).toHaveLength(5);
        expect(out[0].source).toBe("keyword"); // "self"
    });

    it("respects the limit and the 1-char gate", () => {
        expect(pythonCompletions("")).toEqual([]);
        expect(pythonCompletions("x", {limit: 3})).toHaveLength(3);
    });
});

describe("collectPythonLocals (E19)", () => {
    it("collects defs/classes, assignments, targets, and imports", () => {
        const locals = collectPythonLocals(
            [
                "import numpy as np",
                "total = 0",
                "for idx, row in rows:",
                "    with open(p) as fh:",
                "        scores[idx] = row",
            ].join("\n")
        );
        const labels = locals.map((c) => c.label);
        expect(labels).toContain("np");
        expect(labels).toContain("total");
        expect(labels).toContain("idx");
        expect(labels).toContain("row");
        expect(labels).toContain("fh");
        expect(labels).not.toContain("scores"); // subscripted target — skipped
        const np = locals.find((c) => c.label === "np")!;
        expect(np.detail).toBe("import numpy as np");
    });

    it("ignores comparison operators and call keywords", () => {
        const locals = collectPythonLocals(
            ["if x == 1:", "    result = foo(a=1)", "while y <= 2:", "    z = x >= 2"].join("\n")
        );
        const labels = locals.map((c) => c.label);
        expect(labels).toContain("result");
        expect(labels).toContain("z");
        expect(labels).not.toContain("a"); // foo(a=1) is a call, not an assignment
        expect(labels).not.toContain("x");
        expect(labels).not.toContain("y");
    });
});

describe("importFor / isImported / ensureImport (E19)", () => {
    it("maps curated symbols to import statements", () => {
        expect(importFor("np")).toEqual({module: "numpy", statement: "import numpy as np"});
        expect(importFor("plt")).toEqual({
            module: "matplotlib.pyplot",
            statement: "import matplotlib.pyplot as plt",
        });
        expect(importFor("datetime")).toEqual({
            module: "datetime",
            statement: "from datetime import datetime",
        });
        expect(importFor("nope_xyz")).toBeNull();
    });

    it("isImported detects plain, aliased, dotted, and from-imports", () => {
        expect(isImported("import os\n", "os")).toBe(true);
        expect(isImported("import numpy as np\n", "np")).toBe(true);
        expect(isImported("import numpy as np\n", "numpy")).toBe(false);
        expect(isImported("from datetime import datetime\n", "datetime")).toBe(true);
        expect(isImported("from datetime import date, timedelta\n", "timedelta")).toBe(true);
        expect(isImported("from collections import Counter as C\n", "C")).toBe(true);
        expect(isImported("from collections import Counter as C\n", "Counter")).toBe(false);
        expect(isImported("import urllib.request\n", "urllib")).toBe(true);
        expect(isImported("x = 1\n", "os")).toBe(false);
    });

    it("ensureImport returns null for unknown or already-imported symbols", () => {
        expect(ensureImport("x = 1\n", "unknown_symbol")).toBeNull();
        expect(ensureImport("import numpy as np\n", "np")).toBeNull();
        expect(ensureImport("from datetime import datetime\n", "datetime")).toBeNull();
    });

    it("inserts after the existing import block", () => {
        expect(ensureImport("import os\nimport sys\n\nx = 1\n", "math")).toBe(
            "import os\nimport sys\nimport math\n\nx = 1\n"
        );
    });

    it("inserts below a shebang, and below a module docstring", () => {
        expect(ensureImport("#!/usr/bin/env python3\nprint('hi')\n", "math")).toBe(
            "#!/usr/bin/env python3\nimport math\nprint('hi')\n"
        );
        expect(ensureImport('"""Module doc."""\n\nx = 1\n', "math")).toBe(
            '"""Module doc."""\nimport math\n\nx = 1\n'
        );
    });

    it("handles multi-line docstrings and existing imports", () => {
        const multi = '"""Two\nlines."""\n\nimport os\n\n\nx = 1\n';
        expect(ensureImport(multi, "math")).toBe(
            '"""Two\nlines."""\n\nimport os\nimport math\n\n\nx = 1\n'
        );
    });

    it("handles empty, code-only, and comment-only sources", () => {
        expect(ensureImport("", "math")).toBe("import math\n");
        expect(ensureImport("x = 1\n", "math")).toBe("import math\nx = 1\n");
        expect(ensureImport("# header comment\n", "math")).toBe("# header comment\nimport math\n");
    });

    it("appends the aliased form when only the bare module is imported", () => {
        // `import numpy` binds "numpy", NOT "np" — so accepting np still
        // needs the alias import.
        expect(ensureImport("import numpy\nx = 1\n", "np")).toBe(
            "import numpy\nimport numpy as np\nx = 1\n"
        );
    });
});

describe("snippetHasTabstops (E19)", () => {
    it("detects the code-viewer tabstop syntax", () => {
        expect(snippetHasTabstops("if $1:")).toBe(true);
        expect(snippetHasTabstops("${2:default}")).toBe(true);
        expect(snippetHasTabstops("def ${1:name}($2):\n    $0\n")).toBe(true);
    });

    it("rejects plain text and non-tabstop dollars", () => {
        expect(snippetHasTabstops("plain text")).toBe(false);
        expect(snippetHasTabstops("$x")).toBe(false);
        expect(snippetHasTabstops("")).toBe(false);
    });
});

describe("pythonIdentifierPrefixBefore (E19)", () => {
    it("returns the identifier run ending at the caret", () => {
        expect(pythonIdentifierPrefixBefore("loa", 3)).toBe("loa");
        expect(pythonIdentifierPrefixBefore("def d", 5)).toBe("d");
        expect(pythonIdentifierPrefixBefore("x = load_data", 13)).toBe("load_data");
    });

    it("stops at dots, spaces, and hyphens; empty prefix at the caret", () => {
        expect(pythonIdentifierPrefixBefore("np.", 3)).toBe("");
        expect(pythonIdentifierPrefixBefore("foo-bar", 7)).toBe("bar");
        expect(pythonIdentifierPrefixBefore("", 0)).toBe("");
    });
});
