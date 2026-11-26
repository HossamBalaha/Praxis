/**
 * run-output-hints.ts — proactive hints parsed from a run's output.
 *
 * The plan's Section 6 ("Parse error messages and import statements to
 * detect missing packages proactively") plus the field reports:
 *
 * ▸ Scripts that PRE-FLIGHT their own data files print lines like
 * missing: SensorReadings.csv
 * missing: SensorReadings.tsv …
 * — the run exits OK, so nothing else surfaces them. The Output
 * panel now lists the missing files and offers the folder's
 * data-files browser in one click.
 *
 * ▸ Scripts that degrade gracefully PRINT the fix they need:
 * pandas is not installed — this script only prints the file list.
 * pip install pandas openpyxl pyarrow to enable full reading.
 * A `pip install …` line inside the output is a suggestion the
 * script itself is making — surface an Install button for exactly
 * those packages.
 *
 * Pure functions, client- and server-safe (no imports).
 */

/** Data-file extensions the missing-file detector accepts. */
const DATA_FILE_RE = /^[\w.\-/\\]+$/;

/** File extensions worth reporting as "data files". */
const DATA_EXTS = new Set([
    "csv",
    "tsv",
    "xlsx",
    "xls",
    "parquet",
    "feather",
    "json",
    "txt",
    "dat",
    "h5",
    "hdf5",
    "sav",
    "dta",
]);

/**
 * Missing data files named by the script's own output. Recognizes the
 * common self-report shapes:
 *   missing: SensorReadings.csv
 *   missing SensorReadings.csv
 *   not found: SensorReadings.csv
 *   FileNotFoundError: [Errno 2] No such file or directory: 'data/SensorReadings.csv'
 * Deduped, source order, capped (a runaway loop should not grow the
 * bar to hundreds of rows).
 */
export function detectMissingDataFiles(text: string): string[] {
    if (!text) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const lines = text.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.length > 200) continue;
        const m = /^(?:missing|not\s+found|file\s+not\s+found|no\s+such\s+file)\s*[:-]?\s*(.+)$/i.exec(line);
        let candidate: string | null = null;
        if (m) candidate = m[1].trim();
        else if (/FileNotFoundError/i.test(line)) {
            // Python exception form: … 'data/SensorReadings.csv'
            const q = /['"]([^'"]+\.[A-Za-z0-9]{1,5})['"]/.exec(line);
            if (q) candidate = q[1];
        }
        if (!candidate) continue;
        // Normalize quotes / trailing punctuation ("missing: X.csv," lists).
        candidate = candidate.replace(/^['"]|['"]|[,:]$/g, "").trim();
        const base = candidate.split(/[\\/]/).pop() ?? candidate;
        const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
        if (!ext || !DATA_EXTS.has(ext)) continue;
        if (!DATA_FILE_RE.test(base)) continue;
        if (!seen.has(base)) {
            seen.add(base);
            out.push(base);
        }
        if (out.length >= 12) break; // cap — the bar stays readable
    }
    return out;
}

/**
 * Common-English tokens that end a package list — after one of these,
 * the rest of the line is prose ("pip install X to enable full
 * reading"), not package names.
 */
const PIP_STOPWORDS = new Set([
    "to",
    "for",
    "with",
    "then",
    "and",
    "or",
    "in",
    "on",
    "into",
    "enable",
    "enabled",
    "enables",
    "full",
    "reading",
    "read",
    "use",
    "using",
    "from",
    "this",
    "that",
    "it",
    "them",
    "these",
    "those",
    "first",
    "please",
    "you",
    "your",
    "run",
    "rerun",
    "again",
    "after",
    "before",
    "continuing",
    "support",
    "supports",
]);

/** Tokens that are pip OPTIONS, never package names. */
const PIP_OPTIONS = new Set([
    "pip",
    "pip3",
    "install",
    "-u",
    "--upgrade",
    "--user",
    "--force-reinstall",
    "--no-deps",
    "-q",
    "--quiet",
]);

/** True when the token looks like a package name (PyPI name grammar). */
function looksLikePackage(tok: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(tok) && tok.length <= 64;
}

/**
 * `pip install a b c` suggestions found in the output — the script
 * itself is telling the user what to install ("when a pip install is
 * found, suggest installing it by adding like a button"). Returns the
 * package STRING as pip would take it ("pandas openpyxl pyarrow") plus
 * the raw line for context. Deduped by the package string.
 */
export function suggestPipInstalls(text: string): Array<{ packages: string; raw: string }> {
    if (!text) return [];
    const out: Array<{ packages: string; raw: string }> = [];
    const seen = new Set<string>();
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.length > 300) continue;
        // Backtick / quote wrapped commands are still suggestions.
        const m = /^[`'"]?pip3?\s+install\s+(.+)[`'"]?$/i.exec(line);
        if (!m) continue;
        const tokens = m[1].split(/\s+/);
        const pkgs: string[] = [];
        for (const tok of tokens) {
            const t = tok.replace(/[,;:]+$/, "");
            if (!t) break;
            if (PIP_STOPWORDS.has(t.toLowerCase())) break; // prose begins
            if (PIP_OPTIONS.has(t.toLowerCase()) || t.startsWith("-")) continue;
            if (!looksLikePackage(t)) break; // prose begins
            pkgs.push(t);
            if (pkgs.length >= 8) break;
        }
        if (pkgs.length === 0) continue;
        const packages = pkgs.join(" ");
        if (!seen.has(packages)) {
            seen.add(packages);
            out.push({packages, raw: line});
        }
        if (out.length >= 4) break;
    }
    return out;
}
