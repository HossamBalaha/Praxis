/**
 * Developer validation utility (NOT part of the shipped app).
 * Renders every example with the default naming styles and writes
 * each body to /tmp/example-check/<id>.<ext> so a wrapper can
 * py_compile / execute them.
 *
 * contract (user request):
 *   - Python: exactly 1,000 examples ("1000 py examples with more sub cats")
 *   - Every Markdown / Text / Other category: exactly 50 entries
 *     ("50 in each cat other")
 *   - Five new language groups — R, SQL, JSON, YAML, Shell — exactly
 *     50 entries each ("add 5 more cats")
 *
 * Run:  npx tsx scripts/check-examples.ts
 */
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {ALL_EXAMPLES, exampleGroups} from "../src/lib/examples";
import {DEFAULT_SETTINGS} from "../src/lib/settings";

const OUT_DIR = "/tmp/example-check";

/** added the registry languages; topped every one
 *  of them up to exactly 50 ("at least 50 like others") and added the
 *  Windows-native scripting pair (powershell / batch, 50 each). */
const LANGUAGE_EXAMPLE_COUNTS: Record<string, number> = {
    java: 50, c: 50, cpp: 50, ruby: 50, php: 50, go: 50,
    lua: 50, perl: 50, rust: 50, julia: 50, kotlin: 50, swift: 50,
    // the Windows-native scripting pair.
    powershell: 50, batch: 50,
};

function main() {
    mkdirSync(OUT_DIR, {recursive: true});
    // Build the naming-style bundle exactly like the app does
    const namingStyles = {
        variables: DEFAULT_SETTINGS.namingStyleVariables,
        functions: DEFAULT_SETTINGS.namingStyleFunctions,
        classes: DEFAULT_SETTINGS.namingStyleClasses,
        dictKeys: DEFAULT_SETTINGS.namingStyleDictKeys,
        files: DEFAULT_SETTINGS.namingStyleFiles,
    };
    const report: { id: string; file: string; lang: string; cat: string; sub: string }[] = [];
    const seen = new Set<string>();
    for (const ex of ALL_EXAMPLES) {
        if (seen.has(ex.id)) {
            console.error(`DUPLICATE ID: ${ex.id}`);
            process.exitCode = 1;
        }
        seen.add(ex.id);
        const body = ex.build(namingStyles);
        const file = `${OUT_DIR}/${ex.id}${ex.extension === ".gitignore" ? ".txt" : ex.extension}`;
        writeFileSync(file, body);
        report.push({id: ex.id, file, lang: ex.language, cat: ex.category, sub: ex.subcategory});
    }
    writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(report, null, 2));

    // ── Per-language / per-category tallies ──────────────────────────
    const perLang = new Map<string, number>();
    const perCat = new Map<string, number>();
    for (const r of report) {
        perLang.set(r.lang, (perLang.get(r.lang) ?? 0) + 1);
        perCat.set(`${r.lang}/${r.cat}`, (perCat.get(`${r.lang}/${r.cat}`) ?? 0) + 1);
    }
    console.log(`total examples: ${report.length}`);
    for (const [k, n] of [...perLang.entries()].sort()) console.log(`  lang ${k}: ${n}`);
    for (const [k, n] of [...perCat.entries()].sort()) console.log(`    ${k}: ${n}`);

    // ── contract assertions ──────────────────────────────────
    const fail = (msg: string) => {
        console.error(`CONTRACT VIOLATION: ${msg}`);
        process.exitCode = 1;
    };
    // Contract: 1,000 starter examples + 800 more across
    // four generated categories (200 each).
    // Contract: +200 across eight more generated categories
    // (25 each) — Async & Concurrency, Regex Cookbook, Web Scraping,
    // Seaborn & Plotly, CLI Applications, SQLite & Databases,
    // Decorators & Metaclasses, Itertools Recipes.
    // Contract: +150 across six more generated categories
    // (25 each) — Type Hints & Protocols, Errors & Exceptions, Testing
    // & Doctests, Logging & Debugging, Dates & Times, Hashing & Crypto —
    // Python total becomes exactly 2,150.
    if (perLang.get("python") !== 2150) fail(`python has ${perLang.get("python")}, expected exactly 2150`);
    for (const cat of ["Machine Learning", "Medical Image Analysis", "Image Processing & Vision", "Calibration & Forecasting"]) {
        const n = perCat.get(`python/${cat}`);
        if (n !== 200) fail(`python/${cat} has ${n ?? 0}, expected exactly 200`);
    }
    for (const cat of [
        "Async & Concurrency", "Regex Cookbook", "Web Scraping", "Seaborn & Plotly",
        "CLI Applications", "SQLite & Databases", "Decorators & Metaclasses", "Itertools Recipes",
        "Type Hints & Protocols", "Errors & Exceptions", "Testing & Doctests",
        "Logging & Debugging", "Dates & Times", "Hashing & Crypto",
    ]) {
        const n = perCat.get(`python/${cat}`);
        if (n !== 25) fail(`python/${cat} has ${n ?? 0}, expected exactly 25`);
    }
    for (const [key, n] of perCat) {
        const lang = key.split("/")[0];
        if (lang === "python") continue;
        // EVERY non-python language now carries exactly 50
        // entries (the "at least 50 like others" contract) — the     // 10/8 counts are gone.
        if (n !== 50) fail(`${key} has ${n} entries, expected exactly 50`);
    }
    for (const lang of ["r", "sql", "json", "yaml", "shell"]) {
        if (perLang.get(lang) !== 50) fail(`language ${lang} has ${perLang.get(lang) ?? 0}, expected exactly 50`);
    }
    // the registry languages + the Windows pair are each exactly 50.
    for (const [lang, expected] of Object.entries(LANGUAGE_EXAMPLE_COUNTS)) {
        if (perLang.get(lang) !== expected) {
            fail(`language ${lang} has ${perLang.get(lang) ?? 0}, expected exactly ${expected}`);
        }
    }
    // Grouped menu structure must agree with the flat registry.
    const groups = exampleGroups();
    const groupedTotal = groups.reduce(
        (n, g) => n + g.categories.reduce((m, c) => m + c.examples.length, 0),
        0
    );
    if (groupedTotal !== ALL_EXAMPLES.length) {
        fail(`exampleGroups() covers ${groupedTotal} of ${ALL_EXAMPLES.length} entries`);
    }
    console.log(
        `groups: ${groups.map((g) => `${g.label}=${g.categories.reduce((n, c) => n + c.examples.length, 0)}`).join(", ")}`
    );
    if (!existsSync(OUT_DIR)) process.exitCode = 1;
    if (!process.exitCode) console.log("EXAMPLES CONTRACT OK");
}

main();
