/**
 * format-any.ts — the ONE shared offline Auto-format / Auto-indent core.
 *
 * The identical per-language dispatch used to live inline inside the
 * FileViewer's formatSource (edit + view modes) while the EXPLORER's
 * right-click could only format Markdown / HTML / TOML / JSON / Python
 * (five hard-coded handlers) — every OTHER formattable language (YAML,
 * CSS, SQL, JS, TS, MATLAB, Java, C, C++, R, shell, Ruby, PHP, Go, Lua,
 * Perl, Rust, Julia, Kotlin, Swift, PowerShell, Batch, Zig, Dart,
 * Groovy, Scala, Elixir, Haskell, Erlang, Clojure, OCaml, F#, GraphQL)
 * had NO tree-level entry. This module is the single source of truth:
 * both the viewer (view + edit + studio + save paths) and the explorer's
 * generic right-click Format ▸ submenu route through it, so a language
 * that can be formatted ANYWHERE can be formatted EVERYWHERE.
 *
 * Pure client-side (no fetch) — mirrors the FORMATTABLE_KINDS registry
 * (lib/formattable-kinds.ts) exactly.
 */

import {
    collapseBlankRuns,
    convertIndentStyle,
    hygieneFrozenRanges,
    normalizeLineEndings,
    trimLeadingBlankLines,
    trimTrailingWhitespace,
    wrapProseLines,
} from "@/lib/format-post";
import {formatMarkdown, reindentMarkdown} from "@/lib/md-format";
import {formatHtml, reindentHtml, wrapLongTagAttrs} from "@/lib/html-format";
import {formatToml, reindentToml} from "@/lib/toml-format";
import {formatJson} from "@/lib/json-format";
import {formatCss, reindentSql, reindentYaml} from "@/lib/misc-format";
import {
    formatC,
    formatJava,
    formatJs,
    reindentBatch,
    reindentClojure,
    reindentDart,
    reindentElixir,
    reindentErlang,
    reindentGo,
    reindentGraphql,
    reindentGroovy,
    reindentJulia,
    reindentKotlin,
    reindentLayoutWidth,
    reindentLua,
    reindentPerl,
    reindentPhp,
    reindentPowershell,
    reindentR,
    reindentRuby,
    reindentRust,
    reindentScala,
    reindentShell,
    reindentSwift,
    reindentZig,
} from "@/lib/code-format";
import {formatMatlab, reindentMatlab} from "@/lib/matlab-format";

/** The settings the formatter reads — the app's full Settings object
 *  (loadSettings() output). Only the format* keys are consulted. */
export type FormatAnySettings = import("@/lib/settings").Settings;

/**
 * Apply the offline Auto-format / Auto-indent for ONE formattable kind.
 *
 * @param kind    the FileKind (must be a FORMATTABLE_KINDS entry —
 *                callers gate on formattableKindFor(kind) first).
 * @param mode    "format" = the full language pass + whole-file hygiene;
 *                "indent" = re-indent only (line content untouched).
 * @param src     the raw source text.
 * @param s       the settings object (loadSettings() output is fine).
 * @returns the transformed source (=== src when nothing changed).
 */
export function formatAnySource(
    kind: string,
    mode: "format" | "indent",
    src: string,
    s: FormatAnySettings
): string {
    const langWidth = s.formatLangIndent ? Number(s.formatLangIndent[kind] ?? 0) : 0;
    const fmtWidth = Math.max(
        1,
        Math.min(8, langWidth > 0 ? langWidth : s.formatIndentWidth || 2)
    );
    const tabWidth = Math.max(2, Math.min(8, s.formatTabWidth ?? 4));
    const indentUnit = s.indentStyle === "tab" ? "\t" : " ".repeat(fmtWidth);

    const apply = (source: string): string => {
        if (kind === "markdown") {
            const opts = {
                indentWidth: fmtWidth,
                formatTables: s.formatMarkdownTables !== false,
                finalNewline: s.formatFinalNewline !== false,
                bulletChar: mode === "format" ? (s.formatMarkdownBulletChar ?? "-") : undefined,
                headingSpace: mode === "format" ? s.formatMarkdownHeadingSpace !== false : true,
            };
            return mode === "format" ? formatMarkdown(source, opts) : reindentMarkdown(source, opts);
        }
        if (kind === "html") {
            if (mode === "format") {
                const beautified = formatHtml(
                    source,
                    fmtWidth,
                    s.formatHtmlAttrQuotes ?? "keep",
                    s.formatHtmlLowercaseTags !== false
                );
                return s.formatHtmlWrapAttrs === true
                    ? wrapLongTagAttrs(beautified, s.formatHtmlWrapAtCols ?? 100)
                    : beautified;
            }
            return reindentHtml(source, indentUnit);
        }
        if (kind === "toml") {
            const opts = {
                indentWidth: fmtWidth,
                alignEquals: s.formatTomlAlignEquals !== false,
                finalNewline: s.formatFinalNewline !== false,
            };
            return mode === "format" ? formatToml(source, opts) : reindentToml(source, opts);
        }
        if (kind === "json") {
            if (s.formatDataExpandMinified === false && !source.includes("\n")) return source;
            return formatJson(source, {
                indentWidth: fmtWidth,
                finalNewline: s.formatFinalNewline !== false,
                sortKeys: s.formatJsonSortKeys === true,
            });
        }
        if (kind === "yaml") {
            if (s.formatDataExpandMinified === false && !source.includes("\n")) return source;
            return reindentYaml(source, {
                indentWidth: fmtWidth,
                finalNewline: s.formatFinalNewline !== false,
            });
        }
        if (kind === "css") {
            if (s.formatCssOneDeclPerLine === false && mode === "format") {
                const lines = source.replace(/\r\n?/g, "\n").split("\n");
                let depth = 0;
                const reindented = lines.map((l) => {
                    const t = l.trim();
                    if (!t) return "";
                    if (t.startsWith("}")) depth = Math.max(0, depth - 1);
                    const padded = " ".repeat(fmtWidth * depth) + t;
                    const opens = (t.match(/\{/g) ?? []).length;
                    const closes = (t.match(/\}/g) ?? []).length;
                    depth = Math.max(0, depth + opens - closes - (t.startsWith("}") ? 1 : 0));
                    return padded;
                });
                return reindented.join("\n");
            }
            return formatCss(source, {
                indentWidth: fmtWidth,
                finalNewline: s.formatFinalNewline !== false,
            });
        }
        // ── the code families ───────────────────────────────────────────
        if (kind === "javascript" || kind === "typescript") {
            const opts = {
                indentWidth: fmtWidth,
                finalNewline: s.formatFinalNewline !== false,
                operatorSpacing: s.formatJsOperatorSpacing !== false,
                bracketSpacing: s.formatJsBracketSpacing !== false,
                quoteStyle:
                    s.formatJsQuoteStyle === "double" || s.formatJsQuoteStyle === "single"
                        ? s.formatJsQuoteStyle
                        : ("keep" as const),
            };
            return mode === "format"
                ? formatJs(source, opts)
                : formatJs(source, {
                    ...opts,
                    operatorSpacing: false,
                    bracketSpacing: false,
                    quoteStyle: "keep" as const
                });
        }
        if (kind === "java") {
            const opts = {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false};
            return mode === "format" ? formatJava(source, opts) : formatJava(source, {...opts, operatorSpacing: false});
        }
        if (kind === "c" || kind === "cpp") {
            const opts = {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false};
            return mode === "format" ? formatC(source, opts) : formatC(source, {...opts, operatorSpacing: false});
        }
        if (kind === "matlab") {
            const opts = {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false};
            const spacing = s.formatMatlabOperatorSpacing !== false;
            return mode === "format" && spacing ? formatMatlab(source, opts) : reindentMatlab(source, opts);
        }
        if (kind === "r") {
            return reindentR(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "shell") {
            return reindentShell(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "ruby") {
            return reindentRuby(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "php") {
            return reindentPhp(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "go") {
            return reindentGo(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "lua") {
            return reindentLua(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "perl") {
            return reindentPerl(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "rust") {
            return reindentRust(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "julia") {
            return reindentJulia(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "kotlin") {
            return reindentKotlin(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "swift") {
            return reindentSwift(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "powershell") {
            return reindentPowershell(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "batch") {
            return reindentBatch(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "zig") {
            return reindentZig(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "dart") {
            return reindentDart(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "groovy") {
            return reindentGroovy(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "scala") {
            return reindentScala(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "elixir") {
            return reindentElixir(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "graphql") {
            return reindentGraphql(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "clojure") {
            return reindentClojure(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "erlang") {
            return reindentErlang(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "haskell" || kind === "ocaml" || kind === "fsharp") {
            return reindentLayoutWidth(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
        }
        if (kind === "sql") {
            const sqlOut = reindentSql(source, {indentWidth: fmtWidth, finalNewline: s.formatFinalNewline !== false});
            const SQL_KEYWORDS_RE =
                /\b(select|from|where|group by|order by|having|limit|offset|insert into|update|set|delete from|create table|alter table|drop table|values|join|inner join|left join|right join|union all|with|distinct|and|or|not null|primary key|foreign key|references|default)\b/gi;
            const sqlCase: "keep" | "upper" | "lower" =
                s.formatSqlKeywordCase ?? (s.formatSqlUppercaseKeywords ? "upper" : "keep");
            if (mode === "format" && sqlCase !== "keep") {
                return sqlOut.replace(SQL_KEYWORDS_RE, (m) => (sqlCase === "upper" ? m.toUpperCase() : m.toLowerCase()));
            }
            return sqlOut;
        }
        return source;
    };

    let result = apply(src);
    // Whole-file hygiene passes — Auto-FORMAT only (Auto-indent keeps
    // every non-structural byte untouched), fenced/raw regions skipped
    // while the fence-aware switch is on.
    if (mode === "format") {
        const frozen =
            s.formatHygieneSkipFences === false ? undefined : hygieneFrozenRanges(result, kind);
        if (s.formatTrimTrailingWs !== false) {
            result = trimTrailingWhitespace(result, frozen);
        }
        if (s.formatCollapseBlankRuns !== false) {
            result = collapseBlankRuns(result, Math.max(1, Math.min(3, s.formatMaxBlankLines ?? 1)), frozen);
        }
        if (s.formatTrimLeadingBlankLines !== false) {
            result = trimLeadingBlankLines(result);
        }
        if (kind !== "yaml") {
            result = convertIndentStyle(result, s.formatIndentStyle, tabWidth);
        }
        // ── the WRAP pass — hard-wrap prose lines to the configured
        // column (Settings → Formatting, "Wrap prose lines on format").
        // Runs AFTER the line-count-stable hygiene passes with FRESH
        // frozen ranges (fences / raw regions) on the current text, so
        // the fence indices are never stale, and BEFORE the final
        // newline / line-ending normalizers so wrapped output is
        // normalized like everything else. Prose kinds only — code,
        // tables, headings, fenced and indented blocks pass through.
        if (s.formatWrapProse === true && (kind === "markdown" || kind === "text")) {
            result = wrapProseLines(
                result,
                Math.max(20, Math.min(120, s.formatWrapColumn ?? 80)),
                s.formatHygieneSkipFences === false ? undefined : hygieneFrozenRanges(result, kind)
            );
        }
        if (s.formatPostFinalNewline !== false) {
            result = result.replace(/\n+$/, "\n");
        }
        result = normalizeLineEndings(result, s.formatNormalizeLineEndings);
    }
    return result;
}
