/**
 * highlight-worker — REAL off-main-thread Prism tokenization.
 *
 * For a long time the "Web worker highlighting" setting existed but
 * gated no worker at all: Prism tokenized on the main thread
 * (~1.8 s per 500-line chunk per the code's own measurements),
 * which was the root cause of the "show full code" freeze on long
 * Python files. This module is the actual Worker: it registers the
 * SAME grammars the main-thread PrismLight build registers (via the
 * refractor language modules react-syntax-highlighter itself uses),
 * tokenizes `code` with Prism.tokenize and posts back a serialized
 * token tree (plain JSON — structured-clone safe).
 *
 * The main thread renders the tree through the SAME
 * react-syntax-highlighter createElement pipeline (see
 * src/components/worker-highlight.tsx), so the painted output is
 * pixel-identical to the main-thread path.
 */

import Prism from "prismjs";
// The grammar set mirrors src/lib/highlighter.ts (PrismLight).
import python from "refractor/lang/python.js";
import bash from "refractor/lang/bash.js";
import json from "refractor/lang/json.js";
import markdown from "refractor/lang/markdown.js";
import yaml from "refractor/lang/yaml.js";
import toml from "refractor/lang/toml.js";
import sql from "refractor/lang/sql.js";
import r from "refractor/lang/r.js";
import javascript from "refractor/lang/javascript.js";
import typescript from "refractor/lang/typescript.js";
import jsx from "refractor/lang/jsx.js";
import tsx from "refractor/lang/tsx.js";
import matlab from "refractor/lang/matlab.js";
import java from "refractor/lang/java.js";
import c from "refractor/lang/c.js";
import cpp from "refractor/lang/cpp.js";
import css from "refractor/lang/css.js";
import ini from "refractor/lang/ini.js";
import ruby from "refractor/lang/ruby.js";
import markupTemplating from "refractor/lang/markup-templating.js";
import php from "refractor/lang/php.js";
import go from "refractor/lang/go.js";
import markup from "refractor/lang/markup.js";
import lua from "refractor/lang/lua.js";
import perl from "refractor/lang/perl.js";
import rust from "refractor/lang/rust.js";
import julia from "refractor/lang/julia.js";
import kotlin from "refractor/lang/kotlin.js";
import swift from "refractor/lang/swift.js";
import powershell from "refractor/lang/powershell.js";
import batch from "refractor/lang/batch.js";
import zig from "refractor/lang/zig.js";
import dart from "refractor/lang/dart.js";
import groovy from "refractor/lang/groovy.js";
import scala from "refractor/lang/scala.js";
import elixir from "refractor/lang/elixir.js";
import haskell from "refractor/lang/haskell.js";
import erlang from "refractor/lang/erlang.js";
import clojure from "refractor/lang/clojure.js";
import ocaml from "refractor/lang/ocaml.js";
import fsharp from "refractor/lang/fsharp.js";
import graphql from "refractor/lang/graphql.js";
import diff from "refractor/lang/diff.js";

type Register = (P: typeof Prism) => void;
// refractor v3 grammar modules (jsx/tsx and friends) call Prism.register(fn)
// for their dependencies — an API raw prismjs does NOT ship (refractor's
// core.js adds it on its own instance). Without this shim the REGISTRY loop
// below dies at import with "Prism.register is not a function", killing the
// whole worker and silently falling highlighting back to the main thread.
// The shim mirrors refractor core's register() exactly: run the grammar
// once, deduped by its displayName.
type RegistrableGrammar = Register & { displayName?: string };
if (typeof (Prism as unknown as { register?: unknown }).register !== "function") {
    (Prism as unknown as {
        register: (grammar: RegistrableGrammar) => void
    }).register = (grammar: RegistrableGrammar): void => {
        if (grammar.displayName && Prism.languages[grammar.displayName] === undefined) {
            grammar(Prism);
        }
    };
}
const REGISTRY: Array<[string, Register | Register[]]> = [
    ["python", python],
    ["bash", bash],
    ["json", json],
    ["markdown", markdown],
    ["yaml", yaml],
    ["toml", toml],
    ["sql", sql],
    ["r", r],
    // jsx/tsx inherit their bases — register in dependency order.
    ["javascript", [javascript, typescript, jsx, tsx]],
    ["typescript", typescript],
    ["jsx", jsx],
    ["tsx", tsx],
    ["matlab", matlab],
    ["java", java],
    ["c", c],
    ["cpp", cpp],
    ["css", css],
    ["ini", ini],
    // php needs markup-templating FIRST (its grammar embeds it).
    ["ruby", ruby],
    ["markup-templating", markupTemplating],
    ["php", php],
    ["go", go],
    ["markup", markup],
    ["html", markup],
    ["xml", markup],
    ["lua", lua],
    ["perl", perl],
    ["rust", rust],
    ["julia", julia],
    ["kotlin", kotlin],
    ["swift", swift],
    ["powershell", powershell],
    ["batch", batch],
    ["zig", zig],
    ["dart", dart],
    ["groovy", groovy],
    ["scala", scala],
    ["elixir", elixir],
    ["haskell", haskell],
    ["erlang", erlang],
    ["clojure", clojure],
    ["ocaml", ocaml],
    ["fsharp", fsharp],
    ["graphql", graphql],
    ["diff", diff],
];
for (const [name, mod] of REGISTRY) {
    if (Array.isArray(mod)) {
        for (const m of mod) m(Prism);
        if (!Prism.languages[name] && Prism.languages[mod[0].name as string]) {
            Prism.languages[name] = Prism.languages[mod[0].name as string];
        }
    } else {
        mod(Prism);
    }
}
// Aliases PrismLight registers on the main thread.
if (Prism.languages.javascript) Prism.languages.js = Prism.languages.javascript;

/** Serialized Prism token — plain JSON (structured-clone safe).
 * Leaf: { types, value }. Branch: { types, children }. */
export interface SerializedToken {
    types: string[];
    value?: string;
    children?: SerializedToken[];
}

/** Prism token tree → plain JSON tree (aliases folded into types). */
function serializeTokens(tokens: unknown[]): SerializedToken[] {
    const out: SerializedToken[] = [];
    for (const t of tokens) {
        if (typeof t === "string") {
            out.push({types: [], value: t});
            continue;
        }
        const tok = t as { type: string; alias?: string | string[]; content: unknown };
        const types = [tok.type];
        if (Array.isArray(tok.alias)) types.push(...tok.alias);
        else if (typeof tok.alias === "string") types.push(tok.alias);
        const content = tok.content;
        if (typeof content === "string") {
            out.push({types, value: content});
        } else {
            const kids = serializeTokens(Array.isArray(content) ? content : [content]);
            if (kids.length === 1 && kids[0].types.length === 0 && kids[0].value !== undefined) {
                // Single plain-text child → collapse to a leaf (fewer nodes).
                out.push({types, value: kids[0].value});
            } else {
                out.push({types, children: kids});
            }
        }
    }
    return out;
}

self.onmessage = (ev: MessageEvent) => {
    const {id, code, language} = ev.data as { id: number; code: string; language?: string };
    try {
        const grammar =
            (language && Prism.languages[language]) || Prism.languages.python;
        const tokens = serializeTokens(Prism.tokenize(code, grammar));
        (self as unknown as Worker).postMessage({id, tokens});
    } catch (err) {
        (self as unknown as Worker).postMessage({
            id,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};
