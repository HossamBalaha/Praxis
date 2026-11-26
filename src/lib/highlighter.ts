/**
 * shared syntax highlighter built on PrismLight.
 *
 * The components used to import the FULL Prism build
 * (`import { Prism } from "react-syntax-highlighter"`), which bundles
 * every registered Prism language and was the single largest chunk in
 * the client bundle (~670 KB of JS on first load). PrismLight starts
 * empty and only the languages registered below are bundled.
 *
 * Additions: javascript / typescript / jsx / tsx / matlab /
 * java / c / cpp / css — the web-dev + engineering file kinds the
 * viewer renders.
 *
 * Additions:
 * ▸ markup (HTML) — required by the HTML view/edit modes (without
 * it .html files render plain gray);
 * ▸ markdown — the markdown SOURCE view + the edit-mode backdrop;
 * ▸ the six new registry languages: lua / perl / rust / julia /
 * kotlin / swift.
 *
 * Use `language={undefined}` (not "text") for plain, unhighlighted
 * content — PrismLight has no "text" grammar registered.
 */
import {PrismLight as SyntaxHighlighter} from "react-syntax-highlighter";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import r from "react-syntax-highlighter/dist/esm/languages/prism/r";
// the new language kinds.
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import matlab from "react-syntax-highlighter/dist/esm/languages/prism/matlab";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import ini from "react-syntax-highlighter/dist/esm/languages/prism/ini";
// ruby / php / go joined the highlighted kinds (their Run
// support landed at the same time). php needs markup-templating (its
// grammar embeds HTML templating) — registered FIRST.
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import markupTemplating from "react-syntax-highlighter/dist/esm/languages/prism/markup-templating";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
// markup (HTML!), plus the six new registry languages.
// markup must come BEFORE anything that depends on it.
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import perl from "react-syntax-highlighter/dist/esm/languages/prism/perl";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import julia from "react-syntax-highlighter/dist/esm/languages/prism/julia";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
// the Windows-native scripting pair.
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import batch from "react-syntax-highlighter/dist/esm/languages/prism/batch";
// the added registry languages.
import zig from "react-syntax-highlighter/dist/esm/languages/prism/zig";
import dart from "react-syntax-highlighter/dist/esm/languages/prism/dart";
import groovy from "react-syntax-highlighter/dist/esm/languages/prism/groovy";
import scala from "react-syntax-highlighter/dist/esm/languages/prism/scala";
import elixir from "react-syntax-highlighter/dist/esm/languages/prism/elixir";
// the functional-language wave — grammars for the new kinds.
import haskell from "react-syntax-highlighter/dist/esm/languages/prism/haskell";
import erlang from "react-syntax-highlighter/dist/esm/languages/prism/erlang";
import clojure from "react-syntax-highlighter/dist/esm/languages/prism/clojure";
import ocaml from "react-syntax-highlighter/dist/esm/languages/prism/ocaml";
import fsharp from "react-syntax-highlighter/dist/esm/languages/prism/fsharp";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
// unified diffs / patches (the "coloring … also some other
// languages and formats" batch): .diff / .patch files render as text
// with the diff grammar (+/- lines, hunk headers, file headers).
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";

SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("toml", toml);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("r", r);
// registrations (jsx/tsx inherit their bases).
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("matlab", matlab);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("ini", ini);
// registrations (php after its markup-templating dependency).
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("markup-templating", markupTemplating);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("go", go);
// registrations — markup first (php's grammar and every
// fenced ```html block resolve through it), then the new languages.
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("lua", lua);
SyntaxHighlighter.registerLanguage("perl", perl);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("julia", julia);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("swift", swift);
// the Windows-native scripting pair.
SyntaxHighlighter.registerLanguage("powershell", powershell);
SyntaxHighlighter.registerLanguage("batch", batch);
// the added registry languages.
SyntaxHighlighter.registerLanguage("zig", zig);
SyntaxHighlighter.registerLanguage("dart", dart);
SyntaxHighlighter.registerLanguage("groovy", groovy);
SyntaxHighlighter.registerLanguage("scala", scala);
SyntaxHighlighter.registerLanguage("elixir", elixir);
// registrations — the functional-language wave.
SyntaxHighlighter.registerLanguage("haskell", haskell);
SyntaxHighlighter.registerLanguage("erlang", erlang);
SyntaxHighlighter.registerLanguage("clojure", clojure);
SyntaxHighlighter.registerLanguage("ocaml", ocaml);
SyntaxHighlighter.registerLanguage("fsharp", fsharp);
SyntaxHighlighter.registerLanguage("graphql", graphql);
// diffs / patches.
SyntaxHighlighter.registerLanguage("diff", diff);

export {SyntaxHighlighter};
