"use client";

/**
 * MarkdownGithub — GitHub-grade markdown rendering for every surface
 * (file viewer classic preview, Markdown studio preview, notebook
 * markdown cells, AI chat).
 *
 * The old stack rendered GFM tables with the typography plugin's
 * defaults — no visible borders, no header row, no zebra striping —
 * and inline code spans (`` `10 20 30` ``) were nearly invisible, so
 * "many items are not rendered correctly". This component mimics
 * github.com's rendering in an intelligent way on top of the SAME
 * packages the app already ships (react-markdown + remark-gfm +
 * remark-math + rehype-katex):
 *
 *   ▸ tables — bordered, header background, striped rows (CSS in
 *     globals.css under `.md-github`);
 *   ▸ inline code — GitHub's rounded chip, so numeric/space spans
 *     read as code, not prose;
 *   ▸ fenced code — syntax-highlighted (registered grammars),
 *     ```mermaid renders the diagram;
 *   ▸ GitHub alerts — [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] /
 *     [!CAUTION] blockquotes become colored callouts;
 *   ▸ task lists — real checkbox glyphs;
 *   ▸ headings — github-slugger anchors (the outline rail links in);
 *   ▸ optional wavy spell marks (same markSpellWords walker).
 */

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {useTheme} from "next-themes";
import {useLazyKatexPlugin} from "@/lib/lazy-katex";
import {SyntaxHighlighter} from "@/lib/highlighter";
import {oneDark as rsOneDark, oneLight as rsOneLight,} from "react-syntax-highlighter/dist/esm/styles/prism";
import {MermaidDiagram} from "@/components/mermaid-diagram";
import {headingAnchor} from "@/lib/markdown-outline";
import {markSpellWords} from "@/lib/spell-marks";
import {cn} from "@/lib/utils";
import {Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert,} from "lucide-react";

/* ── fenced-code info-string → Prism language (shared) ─────────── */

const FENCE_LANGUAGE_ALIAS: Record<string, string> = {
    py: "python", python3: "python", rb: "ruby", jruby: "ruby",
    js: "javascript", node: "javascript", mjs: "javascript",
    ts: "typescript", m: "matlab", octave: "matlab",
    yml: "yaml", sh: "bash", zsh: "bash", shell: "bash", console: "bash",
    jsonc: "json", golang: "go", html: "markup", xml: "markup", svg: "markup",
    diff: "diff", patch: "diff", scss: "css", less: "css", sass: "css",
    ini: "ini", cfg: "ini", conf: "ini", env: "ini", properties: "ini",
    xhtml: "markup", rss: "markup", atom: "markup", plist: "markup",
    lua: "lua", pl: "perl", perl: "perl", pm: "perl",
    rs: "rust", rust: "rust", jl: "julia", julia: "julia",
    kt: "kotlin", kts: "kotlin", kotlin: "kotlin", swift: "swift",
    ps1: "powershell", powershell: "powershell", psm1: "powershell",
    bat: "batch", cmd: "batch", batch: "batch", dos: "batch",
    zig: "zig", dart: "dart", flutter: "dart",
    groovy: "groovy", gy: "groovy", scala: "scala", ex: "elixir", exs: "elixir", elixir: "elixir",
    hs: "haskell", lhs: "haskell", haskell: "haskell",
    erl: "erlang", es: "erlang", erlang: "erlang",
    clj: "clojure", cljs: "clojure", edn: "clojure", clojure: "clojure",
    ml: "ocaml", mli: "ocaml", ocaml: "ocaml",
    fsx: "fsharp", fsharp: "fsharp",
    graphql: "graphql", gql: "graphql",
};
const FENCE_KNOWN_LANGUAGES = new Set([
    "python", "bash", "json", "markdown", "yaml", "toml", "sql", "r",
    "javascript", "typescript", "jsx", "tsx", "matlab", "java", "c", "cpp",
    "css", "ini", "ruby", "php", "go", "markup",
    "lua", "perl", "rust", "julia", "kotlin", "swift",
    "powershell", "batch", "diff",
    "zig", "dart", "groovy", "scala", "elixir",
    "haskell", "erlang", "clojure", "ocaml", "fsharp", "graphql",
]);

export function fenceLanguageFor(info: string): string | undefined {
    const tag = info.trim().split(/[\s[{]/)[0]?.toLowerCase() ?? "";
    if (!tag) return undefined;
    const alias = FENCE_LANGUAGE_ALIAS[tag];
    if (alias) return alias;
    return FENCE_KNOWN_LANGUAGES.has(tag) ? tag : undefined;
}

/** Collect the raw TEXT under a react-markdown node (code spans,
 *  paragraphs …) — used for mermaid sources + heading anchors. */
export function collectMarkdownText(node: unknown): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map((n) => collectMarkdownText(n)).join("");
    if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
        return collectMarkdownText((node as { props?: { children?: unknown } }).props?.children);
    }
    return "";
}

/* ── GitHub alerts ([!NOTE] …) ─────────────────────────────────── */

const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

const ALERT_STYLE: Record<string, {
    color: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string
}> = {
    NOTE: {color: "#0969da", icon: Info, label: "Note"},
    TIP: {color: "#1a7f37", icon: Lightbulb, label: "Tip"},
    IMPORTANT: {color: "#8250df", icon: MessageSquareWarning, label: "Important"},
    WARNING: {color: "#9a6700", icon: TriangleAlert, label: "Warning"},
    CAUTION: {color: "#cf222e", icon: OctagonAlert, label: "Caution"},
};

/** Detect a GitHub alert marker in a blockquote's first paragraph and
 *  return the type + the paragraph with the marker stripped. */
function detectAlert(children: React.ReactNode): {
    type: keyof typeof ALERT_STYLE;
    children: React.ReactNode;
} | null {
    const first = Array.isArray(children) ? children[0] : children;
    if (!React.isValidElement(first)) return null;
    const pc = (first.props as { children?: React.ReactNode })?.children;
    const text =
        typeof pc === "string"
            ? pc
            : Array.isArray(pc)
                ? pc.filter((c): c is string => typeof c === "string").join("")
                : "";
    const m = ALERT_RE.exec(text);
    if (!m) return null;
    const type = m[1].toUpperCase() as keyof typeof ALERT_STYLE;
    let newPc: React.ReactNode = pc;
    if (typeof pc === "string") {
        newPc = pc.replace(ALERT_RE, "");
    } else if (Array.isArray(pc)) {
        const idx = pc.findIndex((c) => typeof c === "string" && ALERT_RE.test(c));
        if (idx >= 0) {
            newPc = [...pc.slice(0, idx), (pc[idx] as string).replace(ALERT_RE, ""), ...pc.slice(idx + 1)];
        }
    }
    const newFirst = React.cloneElement(first as React.ReactElement<{ children?: React.ReactNode }>, {
        children: newPc,
    });
    const rest = Array.isArray(children) ? children.slice(1) : [];
    return {type, children: [newFirst, ...rest]};
}

/* ── the component ─────────────────────────────────────────────── */

export interface MarkdownGithubProps {
    /** The raw markdown source. */
    children: string;
    /** Extra classes for the wrapper (max-width, font scale…). */
    className?: string;
    /** Wavy spell marks — the misspelled word forms + ignore handler. */
    spellWords?: Set<string>;
    onIgnoreSpell?: (word: string) => void;
    /** Replace-in-place for the prose marks — swaps every occurrence of
     *  the misspelled word through the host's edit channel. Omitted → the
     *  popover's Replace button stays hidden. */
    onReplaceSpell?: (word: string, suggestion: string) => void;
}

/* PERF: React.memo — the parent file viewer re-renders on unrelated
 * state (the outline's active-heading chip, zoom, panels…) while this
 * component's inputs (the markdown source, the spell-word set, the
 * ignore handler) stay referentially stable; memo keeps those
 * re-renders from re-parsing and re-building the ENTIRE document
 * tree, which on a multi-thousand-line README cost hundreds of ms per
 * scroll frame. */
export const MarkdownGithub = React.memo(function MarkdownGithub({
                                                                     children,
                                                                     className,
                                                                     spellWords,
                                                                     onIgnoreSpell,
                                                                     onReplaceSpell
                                                                 }: MarkdownGithubProps) {
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === "dark";
    const lazyKatexPlugins = useLazyKatexPlugin();
    const spellOn = !!spellWords && spellWords.size > 0 && !!onIgnoreSpell;

    const components = React.useMemo(() => {
        const comps: Record<string, unknown> = {
            /* ── fenced code: mermaid → diagram, known grammar →
             *   highlighted, else a plain GitHub-style pre. ── */
            pre: (props: { children?: React.ReactNode }) => {
                const child = Array.isArray(props.children) ? props.children[0] : props.children;
                const className =
                    (child as { props?: { className?: unknown } } | undefined)?.props?.className;
                if (typeof className === "string" && className.includes("language-mermaid")) {
                    const code = collectMarkdownText(
                        (child as { props?: { children?: unknown } }).props?.children
                    ).replace(/\n+$/, "");
                    return <MermaidDiagram code={code}/>;
                }
                if (typeof className === "string") {
                    const m = /language-([\w+-]+)/.exec(className);
                    const fenceLang = m ? fenceLanguageFor(m[1]) : undefined;
                    if (fenceLang) {
                        const code = collectMarkdownText(
                            (child as { props?: { children?: unknown } }).props?.children
                        );
                        return (
                            <SyntaxHighlighter
                                language={fenceLang}
                                style={isDark ? rsOneDark : rsOneLight}
                                showLineNumbers={false}
                                wrapLongLines={false}
                                customStyle={{
                                    margin: 0,
                                    borderRadius: "0.5rem",
                                    fontSize: "12.5px",
                                    lineHeight: "1.55",
                                    padding: "0.85rem",
                                    background: isDark ? "#282c34" : "#fafafa",
                                }}
                                codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                            >{code.replace(/\n+$/, "")}</SyntaxHighlighter>
                        );
                    }
                }
                return <pre>{props.children}</pre>;
            },
            /* ── links open in a new tab, like GitHub. ── */
            a: (props: { href?: string; children?: React.ReactNode }) => {
                const {href, children: kids} = props;
                const external = /^https?:\/\//i.test(href ?? "");
                return (
                    <a
                        href={href}
                        {...(external ? {target: "_blank", rel: "noreferrer noopener"} : {})}
                    >
                        {kids}
                    </a>
                );
            },
            /* ── blockquote → GitHub alert when the first paragraph starts
             *   with [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] /
             *   [!CAUTION]; otherwise the classic left-bar quote. ── */
            blockquote: (props: { children?: React.ReactNode }) => {
                const kids = props.children;
                const alert = detectAlert(kids);
                if (alert) {
                    const {color, icon: Icon, label} = ALERT_STYLE[alert.type];
                    return (
                        <div
                            className="md-alert"
                            style={{["--md-alert-color" as string]: color}}
                        >
              <span className="md-alert-title">
                <Icon className="size-4"/>
                  {label}
              </span>
                            {alert.children}
                        </div>
                    );
                }
                return <blockquote>{kids}</blockquote>;
            },
            /* ── task lists — checkbox items align like GitHub's. ── */
            li: (props: { children?: React.ReactNode; [k: string]: unknown }) => {
                const {children: kids, ...rest} = props;
                const first = Array.isArray(kids) ? kids.find((c) => c != null && c !== false) : kids;
                const isTask =
                    React.isValidElement(first) &&
                    (first.type === "input" ||
                        (first.props as { type?: string } | undefined)?.type === "checkbox");
                return (
                    <li {...rest} className={isTask ? "md-task" : undefined}>
                        {kids}
                    </li>
                );
            },
            input: (props: { type?: string; checked?: boolean; disabled?: boolean; [k: string]: unknown }) => {
                if (props.type === "checkbox") {
                    return (
                        <input
                            type="checkbox"
                            checked={props.checked === true}
                            disabled
                            readOnly
                            className="size-3.5 accent-emerald-500 align-baseline"
                            aria-label="task list item"
                        />
                    );
                }
                return <input {...props} />;
            },
            /* ── headings carry github-slugger anchors (outline rail). ── */
            ...Object.fromEntries(
                [1, 2, 3, 4, 5, 6].map((lvl) => {
                    const Tag = `h${lvl}` as keyof React.JSX.IntrinsicElements;
                    const Heading = (props: { children?: React.ReactNode; [k: string]: unknown }) => {
                        const {children: kids, ...rest} = props;
                        const text = collectMarkdownText(kids);
                        const id = text ? headingAnchor(text) : undefined;
                        return React.createElement(Tag, id ? {...rest, id} : rest, kids);
                    };
                    return [`h${lvl}`, Heading];
                })
            ),
        };

        /* ── optional spell marks over the prose elements. ── */
        if (spellOn) {
            const words = spellWords!;
            const onIgnore = onIgnoreSpell!;
            const wrap = (Tag: string) => {
                const C = (props: { children?: React.ReactNode; [k: string]: unknown }) => {
                    const {children: kids, ...rest} = props;
                    return React.createElement(Tag, rest, markSpellWords(kids, words, onIgnore, onReplaceSpell));
                };
                return C;
            };
            const wrapHeading = (lvl: number) => {
                const Tag = `h${lvl}`;
                const C = (props: { children?: React.ReactNode; [k: string]: unknown }) => {
                    const {children: kids, ...rest} = props;
                    const text = collectMarkdownText(kids);
                    const id = text ? headingAnchor(text) : undefined;
                    return React.createElement(
                        Tag,
                        id ? {...rest, id} : rest,
                        markSpellWords(kids, words, onIgnore)
                    );
                };
                return C;
            };
            Object.assign(comps, {
                p: wrap("p"),
                li: (props: { children?: React.ReactNode; [k: string]: unknown }) => {
                    const {children: kids, ...rest} = props;
                    const first = Array.isArray(kids) ? kids.find((c) => c != null && c !== false) : kids;
                    const isTask =
                        React.isValidElement(first) &&
                        (first.type === "input" ||
                            (first.props as { type?: string } | undefined)?.type === "checkbox");
                    return (
                        <li {...rest} className={isTask ? "md-task" : undefined}>
                            {markSpellWords(kids, words, onIgnore)}
                        </li>
                    );
                },
                h1: wrapHeading(1),
                h2: wrapHeading(2),
                h3: wrapHeading(3),
                h4: wrapHeading(4),
                h5: wrapHeading(5),
                h6: wrapHeading(6),
                blockquote: (props: { children?: React.ReactNode }) => {
                    const kids = props.children;
                    const alert = detectAlert(kids);
                    if (alert) {
                        const {color, icon: Icon, label} = ALERT_STYLE[alert.type];
                        return (
                            <div className="md-alert" style={{["--md-alert-color" as string]: color}}>
                <span className="md-alert-title">
                  <Icon className="size-4"/>
                    {label}
                </span>
                                {markSpellWords(alert.children, words, onIgnore)}
                            </div>
                        );
                    }
                    return <blockquote>{markSpellWords(kids, words, onIgnore)}</blockquote>;
                },
                td: wrap("td"),
                th: wrap("th"),
                strong: wrap("strong"),
                em: wrap("em"),
            });
        }
        return comps as any;
    }, [isDark, spellOn, spellWords, onIgnoreSpell, onReplaceSpell]);

    return (
        <div className={cn("md-github", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={lazyKatexPlugins}
                components={components}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
});
