/**
 * py-imports.ts — proactive missing-package detection for Python
 * sources (Section 6,.
 *
 * Two detectors live here:
 *
 *  1. missingModuleFrom(text) — scans RUN OUTPUT / terminal text for
 *     `ModuleNotFoundError: No module named 'x'` (also the plain
 *     ImportError form Python raises for missing submodules) and
 *     returns the pip-installable top-level package name. This is the
 *     EXACT-CAUSE detector: whatever it finds IS missing.
 *
 *  2. parsePythonImports(source) + suggestMissingImports(source) —
 *     scans a file's import STATEMENTS and returns the top-level
 *     modules that are NOT in the embedded stdlib allowlist below.
 *     This is a HEURISTIC: it cannot know what is already installed
 *     (site-packages of the selected interpreter), only what is
 *     definitely part of the standard library. The UI labels its
 *     output "heuristic" for exactly that reason.
 *
 * The parser is deliberately small: line-oriented, comment- and
 * string-aware enough for real code (skips # comments, triple-quoted
 * strings, tracks parenthesized from-import continuations), and never
 * throws — a weird file degrades to fewer suggestions, never to an
 * error screen.
 */

/* ================================================================== */
/*  1. ModuleNotFoundError text scanner                                */

/* ================================================================== */

/**
 * Extract the missing module name from run/terminal output.
 * Returns null when the text is not a ModuleNotFoundError /
 * missing-module ImportError. Handles single/double quotes and dotted
 * submodules (`a.b` → installs `a`).
 */
export function missingModuleFrom(text: string): string | null {
    if (!text) return null;
    // The canonical CPython wording:
    //   ModuleNotFoundError: No module named 'numpy'
    // plus the Windows/macOS install layouts sometimes seen in
    // tracebacks (indented continuation lines), hence the unanchored
    // regex.
    const m = /No module named\s+['"]([A-Za-z0-9_.-]+)['"]/.exec(text);
    if (!m) return null;
    // A dotted import (`import a.b`) fails on the PACKAGE `a` — pip
    // installs the first segment.
    return m[1].split(".")[0] || null;
}

/**
 * ALL distinct missing modules in a chunk of text (a re-run can fail
 * on several imports in sequence; the tail of the output carries the
 * last one, but Run-All output concatenates many). Deduped, in
 * first-appearance order.
 */
export function allMissingModules(text: string): string[] {
    if (!text) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const re = /No module named\s+['"]([A-Za-z0-9_.-]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const top = m[1].split(".")[0];
        if (top && !seen.has(top)) {
            seen.add(top);
            out.push(top);
        }
    }
    return out;
}

/* ================================================================== */
/*  2. Import-statement scanner                                        */

/* ================================================================== */

export interface ImportStatement {
    /** Top-level module name as written (`import a.b.c` → "a"). */
    module: string;
    /** 1-based line number of the statement's first line. */
    lineno: number;
    /** Statement form. */
    kind: "import" | "from";
    /** True for relative imports (`from . import x`) — never pip. */
    relative: boolean;
}

/**
 * Scan Python source for import statements. Handles:
 *   import a, b.c as d          → modules a, b
 *   from e.f import g, h as i   → module e
 *   from . import sibling       → relative (module "")
 *   from ..pkg import x         → relative
 *   from __future__ import …    → stdlib pseudo-module (kept, filtered
 *                                  later by the allowlist)
 *   multi-line `from x import (a,\n b)` continuations
 * Ignores # comments and triple-quoted strings (module/class/function
 * docstrings commonly contain example `import foo` lines that must NOT
 * be offered as installs).
 */
export function parsePythonImports(source: string): ImportStatement[] {
    const out: ImportStatement[] = [];
    if (!source) return out;
    const lines = source.split("\n");

    // String state across lines: "", '' (single-line, but a stray opener
    // inside a comment line is common), """ and ''' blocks.
    let triple: '"""' | "'''" | null = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Inside a triple-quoted block: only look for the terminator; the
        // content is documentation, not code.
        if (triple) {
            const end = line.indexOf(triple);
            if (end !== -1) {
                // Code may follow the closing quotes on the same line — rare;
                // treat the remainder as code but imports after a docstring
                // terminator on the same line are vanishingly rare, keep simple.
                line = line.slice(end + 3);
                triple = null;
            } else {
                continue;
            }
        }

        // Strip trailing comments (naive: a # inside a string literal on
        // the same line would over-strip — but an import statement never
        // contains a string, and the non-import lines just parse to
        // nothing, so the heuristic stays safe).
        const hash = commentHashIndex(line);
        if (hash !== -1) line = line.slice(0, hash);
        const trimmed = line.trim();
        if (!trimmed) continue;

        // A triple-quote OPENING on this line (docstring / string start).
        const openIdx = findTripleOpen(trimmed);
        if (openIdx !== -1) {
            const marker = trimmed.slice(openIdx, openIdx + 3) as '"""' | "'''";
            // Docstring-only line → consume until the terminator.
            const after = trimmed.slice(openIdx + 3);
            const close = after.indexOf(marker);
            if (close === -1) {
                triple = marker; // continues on later lines
                continue;
            }
            continue; // complete inline triple-quoted string — no code
        }

        // ── import a, b.c as d ──────────────────────────────────────
        const impMatch = /^import\s+(.+)$/.exec(trimmed);
        if (impMatch) {
            for (const piece of impMatch[1].split(",")) {
                const name = piece.trim().split(/\s+as\s+/i)[0].trim();
                if (!name) continue;
                if (name.startsWith(".")) continue; // relative import — n/a here
                const top = name.split(".")[0];
                if (isValidPyModule(top)) {
                    out.push({module: top, lineno: i + 1, kind: "import", relative: false});
                }
            }
            continue;
        }

        // ── from X import … (possibly multi-line with parens) ───────
        const fromMatch = /^from\s+([.\w]*)\s+import\s+(.*)$/.exec(trimmed);
        if (fromMatch) {
            const target = fromMatch[1];
            let body = fromMatch[2];
            // Parenthesized continuation: `from x import (\n  a,\n  b\n)`.
            if (body.startsWith("(") && !body.includes(")")) {
                let j = i + 1;
                while (j < lines.length) {
                    const next = lines[j];
                    body += "\n" + next;
                    if (next.includes(")")) break;
                    j++;
                }
                i = j; // consumed continuation lines
            }
            const relative = target.startsWith(".");
            const top = target.replace(/^\.+/, "").split(".")[0];
            if (!relative && top && isValidPyModule(top)) {
                out.push({module: top, lineno: i + 1, kind: "from", relative: false});
            } else if (relative) {
                out.push({module: top, lineno: i + 1, kind: "from", relative: true});
            }
            continue;
        }
    }
    return out;
}

/** A # that is not inside a string literal (single/double quoted).
 *  Returns -1 when there is none. */
function commentHashIndex(line: string): number {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
            if (ch === quote) quote = null; // closing quote
            else if (ch === "\\") i++; // escaped char — skip the next
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "#") {
            return i;
        }
    }
    return -1;
}

/** Index of a triple-quote opener on the line, or -1. */
function findTripleOpen(line: string): number {
    const dq = line.indexOf('"""');
    const sq = line.indexOf("'''");
    if (dq === -1) return sq;
    if (sq === -1) return dq;
    return Math.min(dq, sq);
}

/** Module names are identifiers (letters, digits, underscore, not
 *  starting with a digit). */
function isValidPyModule(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/* ================================================================== */
/*  3. Stdlib allowlist + suggestions                                  */
/* ================================================================== */

/**
 * Top-level modules of the Python 3 standard library (the 3.10–3.12
 * union; platform-specific and deprecated-but-present entries kept —
 * over-listing only means we fail to OFFER an install for a package
 * that shadows a stdlib name, which is the safe direction).
 *
 * HEURISTIC by nature: the selected interpreter's site-packages are
 * NOT consulted (that would need a server round-trip per keystroke).
 */
export const PYTHON_STDLIB_MODULES: ReadonlySet<string> = new Set([
    "__future__", "_thread", "abc", "aifc", "argparse", "array", "ast",
    "asynchat", "asyncio", "asyncore", "atexit", "audioop", "base64",
    "bdb", "binascii", "binhex", "bisect", "builtins", "bz2", "calendar",
    "cgi", "cgitb", "chunk", "cmath", "cmd", "code", "codecs", "codeop",
    "collections", "colorsys", "compileall", "concurrent", "configparser",
    "contextlib", "contextvars", "copy", "copyreg", "cProfile", "crypt",
    "csv", "ctypes", "curses", "dataclasses", "datetime", "dbm",
    "decimal", "difflib", "dis", "distutils", "doctest", "email",
    "encodings", "enum", "errno", "faulthandler", "fcntl", "filecmp",
    "fileinput", "fnmatch", "fractions", "ftplib", "functools", "gc",
    "getopt", "getpass", "gettext", "glob", "graphlib", "grp", "gzip",
    "hashlib", "heapq", "hmac", "html", "http", "imaplib", "imghdr",
    "imp", "importlib", "inspect", "io", "ipaddress", "itertools", "json",
    "keyword", "lib2to3", "linecache", "locale", "logging", "lzma",
    "mailbox", "mailcap", "marshal", "math", "mimetypes", "mmap",
    "modulefinder", "msilib", "msvcrt", "multiprocessing", "netrc",
    "nis", "nntplib", "numbers", "operator", "optparse", "os", "ossaudiodev",
    "pathlib", "pdb", "pickle", "pickletools", "pipes", "pkgutil",
    "platform", "plistlib", "poplib", "posix", "posixpath", "pprint",
    "profile", "pstats", "pty", "pwd", "py_compile", "pyclbr", "pydoc",
    "queue", "quopri", "random", "re", "readline", "reprlib", "resource",
    "rlcompleter", "runpy", "sched", "secrets", "select", "selectors",
    "shelve", "shlex", "shutil", "signal", "site", "smtpd", "smtplib",
    "sndhdr", "socket", "socketserver", "spwd", "sqlite3", "ssl", "stat",
    "statistics", "string", "stringprep", "struct", "subprocess", "sunau",
    "symtable", "sys", "sysconfig", "syslog", "tabnanny", "tarfile", "telnetlib",
    "tempfile", "termios", "textwrap", "threading", "time", "timeit",
    "tkinter", "token", "tokenize", "tomllib", "trace", "traceback",
    "tracemalloc", "tty", "turtle", "types", "typing", "tzdata",
    "unicodedata", "unittest", "urllib", "uu", "uuid", "venv", "warnings",
    "wave", "weakref", "webbrowser", "winreg", "winsound", "wsgiref",
    "xml", "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib", "zoneinfo",
    // Common aliases / umbrella entries seen in the wild:
    "setuptools", "pip", "pkg_resources", "typing_extensions",
]);

/** True when the top-level module is (very likely) stdlib. */
export function isStdlibModule(name: string): boolean {
    return PYTHON_STDLIB_MODULES.has(name);
}

export interface ImportSuggestion {
    module: string;
    /** First line the module is imported on. */
    lineno: number;
}

/**
 * HEURISTIC missing-package suggestions: the distinct top-level import
 * modules of `source` that are NOT stdlib. Relative imports and the
 * stdlib allowlist are filtered; the caller must clearly label the
 * result as heuristic (installed site-packages are not consulted).
 */
export function suggestMissingImports(source: string): ImportSuggestion[] {
    const seen = new Map<string, number>();
    for (const imp of parsePythonImports(source)) {
        if (imp.relative) continue;
        if (isStdlibModule(imp.module)) continue;
        if (!seen.has(imp.module)) seen.set(imp.module, imp.lineno);
    }
    return [...seen.entries()]
        .map(([module, lineno]) => ({module, lineno}))
        .sort((a, b) => a.lineno - b.lineno);
}

/**
 * Guard for pip package names (mirrors /api/pip-install's validator,
 * minus version specs — suggestions are bare names): letters, digits,
 * dot, underscore, hyphen; must start alphanumeric; NEVER a leading
 * dash so the value can never impersonate a pip flag.
 */
export function isValidPipName(name: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(name);
}
