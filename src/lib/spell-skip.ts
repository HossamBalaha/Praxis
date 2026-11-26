/**
 * spell-skip.ts — the HTML/CSS markup keyword skip-list.
 *
 * The spell tokenizer on /api/spell checks every letter-run that is
 * not an identifier/camelCase/acronym. Markup vocab is NOT English:
 * `<strog>` vs `<strong>`, `align-contetn`, `sans-serfi` … these are
 * markup keywords and belong to the skip list, so they stop counting
 * as misspellings (the plan's 1g). The list is CLIENT-side on
 * purpose: the viewers apply it to /api/spell results before
 * rendering, so the shared API route stays untouched and every
 * consumer (Python editor + file viewer) gets the same filtering.
 *
 * ~60 common HTML tag/attribute names + ~80 common CSS property /
 * value keywords — a static set, lowercase, matched case-insensitively
 * against the reported word.
 */

/** Common HTML tag names (the ~60 the plan asks for). */
const HTML_TAGS = new Set([
    // Document structure.
    "html", "head", "body", "title", "meta", "link", "style", "script",
    "noscript", "base", "template", "slot",
    // Text containers.
    "div", "span", "p", "br", "hr", "h", "main", "header", "footer",
    "nav", "section", "article", "aside", "figure", "figcaption",
    "address", "details", "summary", "dialog", "search",
    // Text semantics.
    "a", "em", "strong", "b", "i", "u", "s", "small", "mark", "sub",
    "sup", "abbr", "cite", "q", "blockquote", "pre", "code", "kbd",
    "samp", "var", "ins", "del", "dfn", "time", "data", "ruby", "rt",
    "rp", "bdi", "bdo", "wbr",
    // Lists + tables.
    "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody",
    "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    // Forms + media.
    "form", "fieldset", "legend", "label", "input", "textarea",
    "button", "select", "option", "optgroup", "datalist", "output",
    "progress", "meter", "img", "picture", "source", "audio", "video",
    "track", "iframe", "embed", "object", "param", "map", "area",
    "canvas", "svg", "math",
]);

/** Common HTML attribute names (subset of the ~60 total). */
const HTML_ATTRS = new Set([
    "href", "src", "srcset", "alt", "title", "class", "id", "name",
    "type", "value", "placeholder", "for", "action", "method", "target",
    "rel", "charset", "content", "lang", "dir", "width", "height",
    "style", "role", "aria", "colspan", "rowspan", "headers", "scope",
    "disabled", "readonly", "required", "checked", "selected", "hidden",
    "async", "defer", "crossorigin", "integrity", "loading", "decoding",
    "download", "coords", "shape", "poster", "controls", "autoplay",
    "loop", "muted", "preload", "draggable", "contenteditable",
    "tabindex", "viewbox", "xmlns", "fill", "stroke", "points", "path",
]);

/** Common CSS property names + value keywords (~80). */
const CSS_WORDS = new Set([
    // Properties.
    "color", "background", "opacity", "display", "position", "top",
    "right", "bottom", "left", "width", "height", "min", "max",
    "margin", "padding", "border", "outline", "radius", "shadow",
    "font", "size", "weight", "style", "variant", "family", "stretch",
    "line", "letter", "spacing", "word", "wrap", "align", "justify",
    "content", "items", "self", "flex", "order", "grow", "shrink",
    "basis", "grid", "area", "template", "columns", "rows", "gap",
    "auto", "flow", "place", "overflow", "clip", "visibility", "z",
    "index", "cursor", "pointer", "resize", "user", "select",
    "appearance", "list", "transition", "transform", "animation",
    "duration", "timing", "function", "delay", "iteration", "count",
    "direction", "fill", "mode", "state", "will", "change", "filter",
    "backdrop", "blur", "brightness", "contrast", "grayscale",
    "invert", "sepia", "saturate", "hue", "rotate", "scale",
    "translate", "skew", "origin", "perspective", "backface",
    "box", "sizing", "text", "decoration", "indent", "transform",
    "white", "space", "vertical", "writing", "break", "inside",
    "columns", "column", "count", "gap", "rule", "span", "src",
    // Values / keywords.
    "none", "inherit", "initial", "unset", "revert", "static", "fixed",
    "absolute", "relative", "sticky", "block", "inline", "flex",
    "grid", "table", "hidden", "visible", "scroll", "bold", "bolder",
    "lighter", "normal", "italic", "underline", "overline",
    "linethrough", "uppercase", "lowercase", "capitalize", "center",
    "baseline", "start", "end", "stretch", "round", "repeat",
    "serif", "sans", "mono", "cursive", "fantasy", "system", "ui",
    "ease", "linear", "step", "forwards", "backwards", "alternate",
    "infinite", "paused", "running", "both", "border", "content",
    "self", "cross", "safely", "unsafe", "clamp", "minmax", "fit",
    "cover", "contain", "local", "global", "important", "keyframes",
    "media", "supports", "layer", "scope", "root", "host", "part",
    "slotted", "page", "fontface", "viewport", "counterstyle",
    "property", "container", "fontfeaturevalues", "pagecontext",
]);

/** The merged skip list (case-insensitive lookup happens at call). */
export const MARKUP_SKIP_WORDS: ReadonlySet<string> = new Set([
    ...HTML_TAGS,
    ...HTML_ATTRS,
    ...CSS_WORDS,
]);

/** Is this word pure markup vocabulary (never a misspelling)? */
export function isMarkupWord(word: string): boolean {
    return MARKUP_SKIP_WORDS.has(word.toLowerCase());
}

/**
 * Drop every issue whose word is markup vocabulary. Generic over the
 * issue shape so both callers (code-viewer + file-viewer) reuse it.
 */
export function filterMarkupSpellIssues<T extends { word: string }>(issues: T[]): T[] {
    if (issues.length === 0) return issues;
    return issues.filter((iss) => !isMarkupWord(iss.word));
}
