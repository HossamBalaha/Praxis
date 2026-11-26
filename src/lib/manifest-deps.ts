/**
 * manifest-deps.ts — the project's DECLARED dependencies across BOTH
 * manifests (requirements.txt AND pyproject.toml) plus the safe
 * "pin one package" editor used by the Dependency Manager.
 *
 * Why this module exists: the Dependency Manager used to be
 * requirements.txt-only, but modern projects declare their deps in
 * pyproject.toml ([project].dependencies, [project] .optional-dependencies
 * groups, uv-style [tool.uv] dev-dependencies). A manager that only
 * reads requirements.txt is blind to every one of those packages —
 * and a "pin" that always writes requirements.txt drifts away from the
 * manifest the package actually came from.
 *
 * Design rules:
 * ▸ READ side is deliberately tolerant — a best-effort scanner, not a
 *   full TOML parser (no new dependency is allowed in this project).
 *   Every entry it reports carries the manifest it came from.
 * ▸ WRITE side is deliberately paranoid — a pin only ever REPLACES
 *   one quoted string inside an existing dependencies array ("minimal
 *   correct TOML edit"); it never rewrites, reflows or re-orders the
 *   file. Every edit is validated by re-parsing the result, and the
 *   route keeps the original content to RESTORE the file when the
 *   post-write re-parse fails — a pyproject.toml must never end up
 *   corrupted.
 * ▸ When a safe TOML edit is not possible, the pin degrades to a
 *   requirements.txt line and says so (the UI surfaces the reason) —
 *   a pin that lands somewhere is still better than an error.
 */

/* ── name/spec helpers ───────────────────────────────────────────── */

/** PEP 503 name normalization — declared names, installed names and
 *  PyPI names must compare equal no matter the -/_/. spelling. */
export function normalizePep503(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** Parse one dependency requirement string ("requests>=2,<3 ; python_version …"
 *  → name + spec) — shared by the requirements.txt and pyproject paths
 *  so both manifests report the SAME shape. */
export function parseRequirementEntry(
    raw: string
): { name: string; spec?: string } | null {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)([\s\S]*)$/.exec(cleaned);
    if (!m) return null;
    const spec = m[2].trim();
    return {name: m[1], spec: spec.length > 0 ? spec : undefined};
}

/* ── requirements.txt (read side) ─────────────────────────────────── */

/** Declared entries of a requirements.txt (comments, blank lines,
 *  `-r`/`--` option lines and pip-style `--hash` continuations are
 *  skipped — only package requirements are reported). */
export function parseRequirementsDependencies(
    content: string | null
): Array<{ name: string; spec?: string }> {
    if (!content) return [];
    const out: Array<{ name: string; spec?: string }> = [];
    for (const raw of content.split(/\r?\n/)) {
        let line = raw.trim();
        const hash = line.indexOf(" #");
        if (hash !== -1) line = line.slice(0, hash).trim();
        if (!line || line.startsWith("#") || line.startsWith("-")) continue;
        const parsed = parseRequirementEntry(line);
        if (parsed) out.push(parsed);
    }
    return out;
}

/* ── pyproject.toml (read side) ──────────────────────────────────── */

/** Where one declared dependency came from. */
export type ManifestSource =
    | "requirements"
    | "pyproject"
    | "pyproject-optional"
    | "pyproject-uv";

export interface DeclaredDependency {
    name: string;
    spec?: string;
    source: ManifestSource;
    /** The optional-dependencies group ("dev", "test", …) when the entry
     *  came from [project].optional-dependencies. */
    group?: string;
}

/** Split a TOML table header path: `[project.optional-dependencies]`
 *  → ["project", "optional-dependencies"] (quoted segments are
 *  stripped — best effort, PEP 621 headers are plain). */
function tablePath(headerInner: string): string[] {
    return headerInner
        .split(".")
        .map((seg) => seg.trim().replace(/^["']|["']$/g, ""))
        .filter((seg) => seg.length > 0);
}

/** Extract the quoted string entries of one TOML array body (the text
 *  BETWEEN the outer `[` and `]`). Skips comments and non-string
 *  values; handles both quote styles and basic escapes. */
function quotedStringsOfArray(body: string): Array<{ text: string; start: number; end: number; quote: string }> {
    const out: Array<{ text: string; start: number; end: number; quote: string }> = [];
    let i = 0;
    while (i < body.length) {
        const ch = body[i];
        if (ch === "#") {
            while (i < body.length && body[i] !== "\n") i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch;
            const start = i;
            let j = i + 1;
            let text = "";
            while (j < body.length && body[j] !== quote) {
                if (quote === '"' && body[j] === "\\") {
                    // basic string escape — keep the pair verbatim.
                    text += body.slice(j, j + 2);
                    j += 2;
                    continue;
                }
                if (body[j] === "\n") break; // unterminated — stop at the line
                text += body[j];
                j++;
            }
            if (j < body.length && body[j] === quote) {
                out.push({text, start, end: j + 1, quote});
                i = j + 1;
                continue;
            }
            i = j;
            continue;
        }
        i++;
    }
    return out;
}

interface TomlArraySpan {
    /** Index of the opening `[` in the ORIGINAL document. */
    open: number;
    /** Index just past the matching `]`. */
    close: number;
}

/** Given the document and the offset of the `=` for a key whose value
 *  starts an array, find the matching `]` (string- and
 *  comment-aware). Returns null when unbalanced — the caller treats
 *  that as "unsafe to edit". */
function findArraySpan(content: string, eqIndex: number): TomlArraySpan | null {
    let i = eqIndex + 1;
    while (i < content.length && /\s/.test(content[i])) i++;
    if (content[i] !== "[") return null;
    const open = i;
    let depth = 1;
    i++;
    while (i < content.length) {
        const ch = content[i];
        if (ch === "#") {
            while (i < content.length && content[i] !== "\n") i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch;
            i++;
            while (i < content.length) {
                if (quote === '"' && content[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (content[i] === quote || content[i] === "\n") {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (ch === "[") depth++;
        else if (ch === "]") {
            depth--;
            if (depth === 0) return {open, close: i + 1};
        }
        i++;
    }
    return null;
}

/** Every dependency-array location worth reading/pinning in a
 *  pyproject.toml, in document order: [project].dependencies,
 *  [project.optional-dependencies.<group>] (any key in the table, or
 *  dotted sub-tables), and uv-style [tool.uv].dev-dependencies. */
function dependencyArrays(content: string): Array<{
    eqIndex: number;
    span: TomlArraySpan;
    source: ManifestSource;
    group?: string;
}> {
    const found: Array<{
        eqIndex: number;
        span: TomlArraySpan;
        source: ManifestSource;
        group?: string;
    }> = [];
    let table: string[] = [];
    // Manual line walk (NOT a /gm regex-exec loop — a zero-width match on
    // an EMPTY line never advances lastIndex and would spin forever).
    // Offsets are preserved exactly so findArraySpan/quotedStringsOfArray
    // see the same indices the original document uses; a trailing \r is
    // part of the line text and never shifts anything.
    let pos = 0;
    while (pos <= content.length) {
        const nl = content.indexOf("\n", pos);
        const lineEnd = nl < 0 ? content.length : nl;
        const line = content.slice(pos, lineEnd);
        const lineStart = pos;
        pos = nl < 0 ? content.length + 1 : nl + 1;
        const header = /^\s*\[\s*([^\]]+?)\s*\]\s*(?:#.*)?$/.exec(line);
        if (header) {
            // array-of-tables ([[...]]) are normalized to their inner path —
            // dependency arrays never live there, but the parser must not
            // lose track of the current table.
            table = tablePath(header[1]);
            continue;
        }
        const kv = /^\s*([A-Za-z0-9_-]+)\s*=\s*(?=\[)/.exec(line);
        if (!kv) continue;
        const key = kv[1];
        const eqIndex = lineStart + line.indexOf("=");
        const span = findArraySpan(content, eqIndex);
        if (!span) continue;
        if (table.length === 1 && table[0] === "project" && key === "dependencies") {
            found.push({eqIndex, span, source: "pyproject"});
            continue;
        }
        if (
            table.length === 2 &&
            table[0] === "project" &&
            table[1] === "optional-dependencies"
        ) {
            found.push({eqIndex, span, source: "pyproject-optional", group: key});
            continue;
        }
        if (
            table.length === 3 &&
            table[0] === "project" &&
            table[1] === "optional-dependencies"
        ) {
            // [project.optional-dependencies.<group>] then `key = [ ... ]`
            // (uv-style nested groups) — the TABLE segment names the group.
            found.push({eqIndex, span, source: "pyproject-optional", group: table[2]});
            continue;
        }
        if (table.length === 2 && table[0] === "tool" && table[1] === "uv" && key === "dev-dependencies") {
            found.push({eqIndex, span, source: "pyproject-uv", group: "dev"});
            continue;
        }
    }
    return found;
}

/** Declared entries of a pyproject.toml — [project].dependencies,
 *  [project] .optional-dependencies groups and uv-style
 *  [tool.uv].dev-dependencies. Tolerant: anything that does not scan
 *  as one of those arrays is simply not reported. */
export function parsePyprojectDependencies(
    content: string | null
): DeclaredDependency[] {
    if (!content) return [];
    const out: DeclaredDependency[] = [];
    for (const arr of dependencyArrays(content)) {
        const body = content.slice(arr.span.open + 1, arr.span.close - 1);
        for (const q of quotedStringsOfArray(body)) {
            const parsed = parseRequirementEntry(q.text);
            if (!parsed) continue;
            out.push({
                name: parsed.name,
                spec: parsed.spec,
                source: arr.source,
                ...(arr.group ? {group: arr.group} : {}),
            });
        }
    }
    return out;
}

/** The full declared list across BOTH manifests — requirements.txt
 *  first (its entries win dedupe priority), pyproject entries after,
 *  with a PEP 503-normalized de-dup so one package is reported once
 *  per manifest it appears in (the source badge shows where). */
export function parseDeclaredDependencies(
    requirements: string | null,
    pyproject: string | null
): DeclaredDependency[] {
    const out: DeclaredDependency[] = [];
    const seen = new Map<string, Set<ManifestSource>>();
    const push = (dep: DeclaredDependency) => {
        const norm = normalizePep503(dep.name);
        const sources = seen.get(norm) ?? new Set<ManifestSource>();
        if (sources.has(dep.source)) return;
        sources.add(dep.source);
        seen.set(norm, sources);
        out.push(dep);
    };
    for (const d of parseRequirementsDependencies(requirements)) {
        push({name: d.name, spec: d.spec, source: "requirements"});
    }
    for (const d of parsePyprojectDependencies(pyproject)) {
        push(d);
    }
    return out;
}

/* ── structural validation (the "never corrupt a pyproject" guard) ─ */

/** Char-level soundness check for a TOML document: brackets balanced
 *  OUTSIDE every string/comment, no unterminated single-line string,
 *  triple-quoted blocks consumed whole. Not a full TOML parser — it
 *  exists to prove an EDIT did not break the document's skeleton. */
export function tomlStructurallySound(content: string): boolean {
    let i = 0;
    const n = content.length;
    let depth = 0;
    while (i < n) {
        const ch = content[i];
        if (ch === "#") {
            while (i < n && content[i] !== "\n") i++;
            continue;
        }
        if (ch === '"') {
            if (content.startsWith('"""', i)) {
                const close = content.indexOf('"""', i + 3);
                if (close < 0) return false;
                i = close + 3;
                continue;
            }
            i++;
            let closed = false;
            while (i < n) {
                if (content[i] === "\\") {
                    i += 2;
                    continue;
                }
                if (content[i] === "\n") break; // unterminated basic string
                if (content[i] === '"') {
                    i++;
                    closed = true;
                    break;
                }
                i++;
            }
            if (!closed) return false;
            continue;
        }
        if (ch === "'") {
            if (content.startsWith("'''", i)) {
                const close = content.indexOf("'''", i + 3);
                if (close < 0) return false;
                i = close + 3;
                continue;
            }
            i++;
            let closed = false;
            while (i < n) {
                if (content[i] === "\n") break; // unterminated literal string
                if (content[i] === "'") {
                    i++;
                    closed = true;
                    break;
                }
                i++;
            }
            if (!closed) return false;
            continue;
        }
        if (ch === "[") depth++;
        else if (ch === "]") {
            depth--;
            if (depth < 0) return false;
        }
        i++;
    }
    return depth === 0;
}

/** Re-parse an EDITED pyproject and prove the pin landed without
 *  losing anything: structure sound, the pinned `name==version`
 *  present, and at least as many declared entries as before the
 *  edit (a truncation or eaten array drops entries). */
export function validatePyprojectPin(
    edited: string,
    original: string,
    name: string,
    version: string
): boolean {
    if (!tomlStructurallySound(edited)) return false;
    const want = `==${version}`;
    const after = parsePyprojectDependencies(edited);
    const before = parsePyprojectDependencies(original);
    const pinned = after.find(
        (d) =>
            normalizePep503(d.name) === normalizePep503(name) &&
            d.spec != null &&
            d.spec.replace(/\s+/g, "") === want
    );
    if (!pinned) return false;
    return after.length >= before.length;
}

/* ── pinning (write side) ─────────────────────────────────────────── */

/** A pin landed in requirements.txt only. */
export interface ManifestPinPlan {
    ok: boolean;
    /** The manifest the pinned spec was written into (the one it "came
     *  from" when declared; requirements.txt otherwise). */
    wrote: "requirements.txt" | "pyproject.toml";
    /** New requirements.txt content — null when that file is untouched. */
    requirements: string | null;
    /** New pyproject.toml content — null when that file is untouched. */
    pyproject: string | null;
    /** True when the package was declared in pyproject.toml but the
     *  TOML edit was judged unsafe, so the pin degraded to a
     *  requirements.txt line — the UI MUST say so. */
    fellBack: boolean;
    /** Why the pyproject edit was refused (when it was). */
    reason?: string;
    /** Manifests the package was declared in before the pin. */
    declaredIn: ManifestSource[];
}

/** Merge `name==version` into a requirements.txt: replace the line
 *  that currently declares the name (whatever spec it carried) or
 *  append one when absent; create the file (with a small header) when
 *  the project has none yet. Pure — the caller writes it to disk. */
export function pinIntoRequirements(
    content: string | null,
    name: string,
    version: string
): string {
    const line = `${name}==${version}`;
    if (content == null) {
        return (
            `# Pinned by Praxis Dependency Manager on ${new Date().toISOString().slice(0, 10)}\n` +
            `${line}\n`
        );
    }
    const lines = content.split(/\r?\n/);
    const norm = normalizePep503(name);
    let replaced = false;
    const out = lines.map((raw) => {
        let probe = raw.trim();
        const hash = probe.indexOf(" #");
        if (hash !== -1) probe = probe.slice(0, hash).trim();
        if (!probe || probe.startsWith("#") || probe.startsWith("-")) return raw;
        const parsed = parseRequirementEntry(probe);
        if (parsed && normalizePep503(parsed.name) === norm) {
            replaced = true;
            return line;
        }
        return raw;
    });
    if (!replaced) {
        // Append at the END of the file: drop any trailing blank lines the
        // split produced (the original file's final newline becomes a ""
        // element) so the new line lands flush after the last real entry.
        while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
        out.push(line);
    }
    // Exactly one trailing newline at EOF — the replace path already
    // carries one (the original split's trailing "" element), the append
    // path just added a line without one.
    const joined = out.join("\n");
    return joined.endsWith("\n") || joined.trim() === "" ? joined : `${joined}\n`;
}

/** Replace every matching quoted entry inside the pyproject dependency
 *  arrays with `"name==version"` — a MINIMAL edit: only the entry's
 *  characters change, the array's layout, order, indentation and
 *  every other entry stay byte-identical. Returns null when anything
 *  about the document makes the edit unsafe (unbalanced array, no
 *  quoted-string entry for the name, or the resulting document
 *  failing validation) — the caller then pins into requirements.txt
 *  and reports why. */
export function pinIntoPyproject(
    content: string,
    name: string,
    version: string
): string | null {
    const norm = normalizePep503(name);
    let edited = content;
    let hits = 0;
    // Walk the arrays LAST-FIRST so every replacement's offsets stay
    // valid for the arrays before it.
    const arrays = dependencyArrays(content);
    for (let a = arrays.length - 1; a >= 0; a--) {
        const arr = arrays[a];
        const body = content.slice(arr.span.open + 1, arr.span.close - 1);
        const entries = quotedStringsOfArray(body);
        for (let e = entries.length - 1; e >= 0; e--) {
            const entry = entries[e];
            const parsed = parseRequirementEntry(entry.text);
            if (!parsed || normalizePep503(parsed.name) !== norm) continue;
            // Keep the entry's original quote style when the pinned spec is
            // representable in it (it always is — PEP 440 strings have no
            // quotes/backslashes).
            const replacement = `${entry.quote}${name}==${version}${entry.quote}`;
            const absStart = arr.span.open + 1 + entry.start;
            const absEnd = arr.span.open + 1 + entry.end;
            edited = edited.slice(0, absStart) + replacement + edited.slice(absEnd);
            hits++;
        }
    }
    if (hits === 0) return null;
    if (!validatePyprojectPin(edited, content, name, version)) {
        return null;
    }
    return edited;
}

/** Plan the pin for one package at one version against the project's
 *  CURRENT manifest contents (pure — the route performs the writes
 *  and the post-write re-parse). */
export function planPinPackage(opts: {
    name: string;
    version: string;
    requirements: string | null;
    pyproject: string | null;
}): ManifestPinPlan {
    const {name, version, requirements, pyproject} = opts;
    const norm = normalizePep503(name);
    const declaredIn: ManifestSource[] = [];
    let inRequirements = false;
    let inPyproject = false;
    for (const d of parseDeclaredDependencies(requirements, pyproject)) {
        if (normalizePep503(d.name) !== norm) continue;
        if (d.source === "requirements") inRequirements = true;
        else inPyproject = true;
        declaredIn.push(d.source);
    }

    // The manifest it "came from" is pyproject.toml → the TOML array is
    // the primary target. requirements.txt follows ONLY when the same
    // package is ALSO declared there (both manifests stay in sync);
    // a package declared nowhere pins to requirements.txt — creating
    // it is the least surprising behavior for a reproducibility pin.
    if (inPyproject && pyproject) {
        const edited = pinIntoPyproject(pyproject, name, version);
        if (edited != null) {
            return {
                ok: true,
                wrote: "pyproject.toml",
                pyproject: edited,
                requirements: inRequirements
                    ? pinIntoRequirements(requirements, name, version)
                    : null,
                fellBack: false,
                declaredIn,
            };
        }
        // Degraded pin — say why in the UI.
        return {
            ok: true,
            wrote: "requirements.txt",
            requirements: pinIntoRequirements(requirements, name, version),
            pyproject: null,
            fellBack: true,
            reason:
                "the dependencies array in pyproject.toml could not be edited safely " +
                "(unbalanced array or no matching quoted entry) — pinned into requirements.txt instead",
            declaredIn,
        };
    }
    return {
        ok: true,
        wrote: "requirements.txt",
        requirements: pinIntoRequirements(requirements, name, version),
        pyproject: null,
        fellBack: false,
        declaredIn,
    };
}
