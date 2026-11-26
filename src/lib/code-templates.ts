/**
 * Insert-block templates for the editor's "Insert" button (edit-mode
 * toolbar) and the editor's right-click menu.
 *
 * A template is plain text with two kinds of markers:
 *
 * - Style tokens: `{v:base}` `{f:base}` `{c:base}` `{d:base}`
 * Rendered per the naming-style settings (variables /
 * functions / classes / dict keys). The base is a canonical
 * snake_case name — applyNamingStyle normalizes any input.
 * - `$0` — the caret position after insertion (may be absent, in
 * which case the caret lands after the inserted text).
 *
 * `renderTemplate` returns the final text plus the caret offset so the
 * editor can place the cursor exactly where the user should continue
 * typing.
 *
 * Blocks are grouped per file type — `blocksForFile(fileName)` picks
 * the right library by extension, so the Insert button offers Python
 * blocks in.py files, Markdown blocks in.md, ignore-presets in
 *.gitignore, etc.
 */
import {applyNamingStyle, type NamingStyleSettings, styleForKind,} from "@/lib/naming-styles";

export interface CodeBlockTemplate {
    id: string;
    /** Menu label. */
    label: string;
    /** Shown as the item's tooltip. */
    description: string;
    /** Rough grouping shown as dropdown labels. */
    category: string;
    /** The template text (with style tokens + optional $0). */
    template: string;
}

/** Render a template: substitute style tokens, resolve the $0 caret. */
export function renderTemplate(
    text: string,
    styles: NamingStyleSettings
): { text: string; caretOffset: number } {
    // Token map: prefix char → NamingKind.
    const kinds: Record<string, "variable" | "function" | "class" | "dictKey"> = {
        v: "variable",
        f: "function",
        c: "class",
        d: "dictKey",
    };
    const renderTokens = (s: string) =>
        s.replace(
            /\{([vfcd]):([^}]+)\}/g,
            (_m, prefix: string, base: string) =>
                applyNamingStyle(styleForKind(styles, kinds[prefix] ?? "variable"), base)
        );
    // $0 handling: render everything before $0 separately so the caret
    // offset is measured on the SUBSTITUTED text (token lengths change).
    const caretIdx = text.indexOf("$0");
    if (caretIdx === -1) {
        return {text: renderTokens(text), caretOffset: -1};
    }
    const renderedPrefix = renderTokens(text.slice(0, caretIdx));
    const renderedSuffix = renderTokens(text.slice(caretIdx + 2));
    return {
        text: renderedPrefix + renderedSuffix,
        caretOffset: renderedPrefix.length,
    };
}

/** Splice a rendered template into a text buffer at the given selection,
 *  preserving the current line's indentation — shared by CodeViewer
 *  (.py) and FileViewer (md / txt / json / yaml / toml / gitignore).
 *
 *  Behavior (editor-snippet UX):
 *   - non-empty selection → the block replaces the selection;
 *   - caret on a blank/whitespace-only line → the block replaces that line;
 *   - caret mid-line → the block starts on a fresh line below.
 *
 *  Returns the new buffer plus the absolute caret position for the
 *  template's $0 marker (or the end of the block). */
export function spliceTemplate(
    content: string,
    start: number,
    end: number,
    rendered: { text: string; caretOffset: number }
): { newContent: string; caretPos: number } {
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = content.indexOf("\n", start);
    const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
    const currentLine = content.slice(lineStart, lineEnd);
    const indent = /^[ \t]*/.exec(currentLine)?.[0] ?? "";

    let insertPos: number;
    let removeLen: number;
    let prefix: string;
    if (start !== end) {
        insertPos = start;
        removeLen = end - start;
        prefix = "";
    } else if (currentLine.trim() === "") {
        insertPos = lineStart;
        removeLen = lineEnd - lineStart;
        prefix = "";
    } else {
        insertPos = lineEnd;
        removeLen = 0;
        prefix = "\n";
    }

    const body = rendered.text.endsWith("\n")
        ? rendered.text.slice(0, -1)
        : rendered.text;
    const indented = body
        .split("\n")
        .map((l) => (l.length ? indent + l : l))
        .join("\n");
    const block = prefix + indented + "\n";
    const newContent =
        content.slice(0, insertPos) + block + content.slice(insertPos + removeLen);
    const caretInBlock =
        rendered.caretOffset >= 0 && rendered.caretOffset <= body.length
            ? rendered.caretOffset
            : indented.length;
    return {
        newContent,
        caretPos: insertPos + prefix.length + caretInBlock,
    };
}

// ─── Python ─────────────────────────────────────────────────────────

export const PYTHON_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "py-function",
        label: "Function",
        description: "def with docstring and TODO body.",
        category: "Definitions",
        template: "def {f:process_data}():\n    \"\"\"TODO: describe what this does.\"\"\"\n    $0\n",
    },
    {
        id: "py-function-args",
        label: "Function with args + return",
        description: "Typed parameters, defaults, and a return statement.",
        category: "Definitions",
        template:
            "def {f:compute_stats}({v:values}, *, {v:precision}: int = 2):\n    \"\"\"TODO: describe what this does.\"\"\"\n    {v:result} = {v:values}\n    return {v:result}\n$0",
    },
    {
        id: "py-class",
        label: "Class",
        description: "Class with __init__ and a method.",
        category: "Definitions",
        template:
            "class {c:DataProcessor}:\n    \"\"\"TODO: describe the responsibility.\"\"\"\n\n    def __init__(self, {v:name}):\n        self.{v:name} = {v:name}\n\n    def {f:run}(self):\n        $0\n",
    },
    {
        id: "py-dataclass",
        label: "Dataclass",
        description: "Immutable-ish record with type hints and defaults.",
        category: "Definitions",
        template:
            "from dataclasses import dataclass\n\n\n@dataclass\nclass {c:ConfigItem}:\n    {v:name}: str\n    {v:value}: float = 0.0\n\n$0",
    },
    {
        id: "py-main",
        label: "main guard",
        description: "if __name__ == \"__main__\": entry point with a run() function.",
        category: "Structure",
        template:
            "def {f:main}() -> None:\n    $0\n\n\nif __name__ == \"__main__\":\n    {f:main}()\n",
    },
    {
        id: "py-if",
        label: "if / elif / else",
        description: "Branching skeleton with TODO markers.",
        category: "Structure",
        template:
            "if {v:condition}:\n    $0\nelif {v:other}:\n    pass\nelse:\n    pass\n",
    },
    {
        id: "py-for",
        label: "for loop",
        description: "Iterate a sequence with a TODO body.",
        category: "Loops",
        template: "for {v:item} in {v:items}:\n    $0\n",
    },
    {
        id: "py-for-enumerate",
        label: "for with enumerate",
        description: "Index + value iteration.",
        category: "Loops",
        template: "for {v:index}, {v:item} in enumerate({v:items}, start=1):\n    $0\n",
    },
    {
        id: "py-for-zip",
        label: "for with zip",
        description: "Parallel iteration over two sequences.",
        category: "Loops",
        template: "for {v:left}, {v:right} in zip({v:names}, {v:values}):\n    $0\n",
    },
    {
        id: "py-while",
        label: "while loop",
        description: "Condition loop with a counter guard.",
        category: "Loops",
        template: "{v:running} = True\nwhile {v:running}:\n    $0\n    {v:running} = False\n",
    },
    {
        id: "py-comprehension-list",
        label: "List comprehension",
        description: "Transform a sequence in one expression.",
        category: "Comprehensions",
        template: "{v:squared} = [{v:x} ** 2 for {v:x} in {v:values} if {v:x} > 0]\n$0",
    },
    {
        id: "py-comprehension-dict",
        label: "Dict comprehension",
        description: "Build a mapping in one expression (keys follow your dict-key style).",
        category: "Comprehensions",
        template: "{v:lookup} = {\"{d:unit_price}\": {v:price} for {v:price} in {v:prices}}\n$0",
    },
    {
        id: "py-try",
        label: "try / except / finally",
        description: "Error handling with a typed exception.",
        category: "Safety",
        template:
            "try:\n    $0\nexcept ValueError as {v:error}:\n    print(f\"failed: {{v:error}}\")\nfinally:\n    pass\n",
    },
    {
        id: "py-with",
        label: "with (context manager)",
        description: "Open a resource safely.",
        category: "Safety",
        template: "with open({v:file_path}, \"r\", encoding=\"utf-8\") as {v:handle}:\n    $0\n",
    },
    {
        id: "py-assert",
        label: "assert + message",
        description: "Debug check with a failure message.",
        category: "Safety",
        template: "assert {v:condition}, \"TODO: failure message\"\n$0",
    },
    {
        id: "py-figure",
        label: "Create figure (matplotlib)",
        description: "Complete matplotlib block — imports, figure, axis labels, tight layout, show.",
        category: "Plotting",
        template:
            "import matplotlib.pyplot as plt\n\n{v:fig}, {v:ax} = plt.subplots(figsize=(7, 4.5))\n{v:ax}.plot({v:x_values}, {v:y_values}, marker=\"o\", linewidth=1.5)\n{v:ax}.set_xlabel(\"x\")\n{v:ax}.set_ylabel(\"y\")\n{v:ax}.set_title(\"TODO: title\")\n{v:fig}.tight_layout()\nplt.show()\n$0",
    },
    {
        id: "py-subplots",
        label: "Grid of subplots",
        description: "1×2 subplot grid sharing a figure.",
        category: "Plotting",
        template:
            "import matplotlib.pyplot as plt\n\n{v:fig}, ({v:ax1}, {v:ax2}) = plt.subplots(1, 2, figsize=(11, 4.5))\n{v:ax1}.plot({v:x_values})\n{v:ax2}.plot({v:y_values})\n{v:fig}.tight_layout()\nplt.show()\n$0",
    },
    {
        id: "py-save-figure",
        label: "Save figure to file",
        description: "Save the current figure as PNG at 200 dpi.",
        category: "Plotting",
        template: "{v:fig}.savefig(\"{f:output_figure}.png\", dpi=200)\n$0",
    },
    {
        id: "py-histogram",
        label: "Histogram",
        description: "Histogram with grid and stats annotation.",
        category: "Plotting",
        template:
            "import matplotlib.pyplot as plt\n\n{v:fig}, {v:ax} = plt.subplots(figsize=(7, 4.5))\n{v:ax}.hist({v:values}, bins=30, edgecolor=\"white\")\n{v:ax}.set_title(\"Distribution\")\n{v:ax}.grid(alpha=0.3)\nplt.show()\n$0",
    },
    {
        id: "py-read-csv",
        label: "Read CSV (pandas)",
        description: "Import pandas, read a CSV, show head + info.",
        category: "Data",
        template:
            "import pandas as pd\n\n{v:df} = pd.read_csv(\"{f:data_file}.csv\")\nprint({v:df}.head())\nprint({v:df}.info())\n$0",
    },
    {
        id: "py-write-csv",
        label: "Write CSV (pandas)",
        description: "Persist a DataFrame to CSV without the index.",
        category: "Data",
        template:
            "import pandas as pd\n\n{v:df}.to_csv(\"{f:output_data}.csv\", index=False)\n$0",
    },
    {
        id: "py-read-json",
        label: "Read JSON",
        description: "Load a JSON config with a context manager.",
        category: "Data",
        template:
            "import json\n\nwith open(\"{f:config_file}.json\", \"r\", encoding=\"utf-8\") as {v:handle}:\n    {v:config} = json.load({v:handle})\n$0",
    },
    {
        id: "py-write-json",
        label: "Write JSON",
        description: "Serialize data with indentation.",
        category: "Data",
        template:
            "import json\n\nwith open(\"{f:output_file}.json\", \"w\", encoding=\"utf-8\") as {v:handle}:\n    json.dump({v:data}, {v:handle}, indent=2)\n$0",
    },
    {
        id: "py-count-words",
        label: "Count occurrences (dict)",
        description: "Classic word/element frequency counter with .get.",
        category: "Data",
        template:
            "{v:counts} = {}\nfor {v:item} in {v:items}:\n    {v:counts}[{v:item}] = {v:counts}.get({v:item}, 0) + 1\nprint({v:counts})\n$0",
    },
    {
        id: "py-argparse",
        label: "Command-line arguments (argparse)",
        description: "CLI parser with positional + optional flags.",
        category: "CLI",
        template:
            "import argparse\n\n\ndef {f:parse_args}():\n    {v:parser} = argparse.ArgumentParser(description=\"TODO: tool description\")\n    {v:parser}.add_argument(\"{v:input_path}\", help=\"TODO\")\n    {v:parser}.add_argument(\"--{v:verbose}\", action=\"store_true\", help=\"print progress\")\n    return {v:parser}.parse_args()\n\n\nif __name__ == \"__main__\":\n    {v:args} = {f:parse_args}()\n    $0",
    },
    {
        id: "py-logging",
        label: "Logging setup",
        description: "Module-level logger with a sensible format.",
        category: "CLI",
        template:
            "import logging\n\nlogging.basicConfig(\n    level=logging.INFO,\n    format=\"%(asctime)s %(levelname)s %(name)s: %(message)s\",\n)\n{v:logger} = logging.getLogger(__name__)\n$0",
    },
    {
        id: "py-fstring",
        label: "f-string print",
        description: "Formatted debug print.",
        category: "Snippets",
        template: "print(f\"{v:name}={{v:name}} $0\")\n",
    },
    {
        id: "py-test",
        label: "pytest test function",
        description: "Arrange-Act-Assert test with a docstring.",
        category: "Snippets",
        template:
            "def test_{f:compute_stats}():\n    \"\"\"TODO: what behavior is asserted.\"\"\"\n    # Arrange\n    {v:given} = None\n    # Act\n    {v:actual} = None\n    # Assert\n    assert {v:actual} == {v:given}\n$0",
    },
];

// ─── Markdown ───────────────────────────────────────────────────────

export const MARKDOWN_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "md-h2",
        label: "Section heading (##)",
        description: "Numbered second-level heading.",
        category: "Headings",
        template: "## Section — TODO\n\n$0\n",
    },
    {
        id: "md-h3",
        label: "Subsection heading (###)",
        description: "Third-level heading.",
        category: "Headings",
        template: "### Subsection — TODO\n\n$0\n",
    },
    {
        id: "md-toc",
        label: "Table of contents",
        description: "Linked outline with anchors.",
        category: "Structure",
        template:
            "## Contents\n\n- [Introduction](#introduction)\n- [Usage](#usage)\n- [Results](#results)\n- [References](#references)\n\n$0\n",
    },
    {
        id: "md-table",
        label: "Table",
        description: "Three-column table with alignment.",
        category: "Structure",
        template:
            "| Column A | Column B | Column C |\n| --- | :---: | ---: |\n| value | value | value |\n| value | value | value |\n\n$0\n",
    },
    {
        id: "md-code",
        label: "Python code block",
        description: "Fenced code block with language + caption.",
        category: "Code",
        template: "```python\n$0\n```\n\n*Caption: TODO.*\n",
    },
    {
        id: "md-inline-code",
        label: "Inline code span",
        description: "`code` inline.",
        category: "Code",
        template: "`{v:solution}`$0",
    },
    {
        id: "md-math",
        label: "Math block (LaTeX)",
        description: "Display equation fenced with $$.",
        category: "Code",
        template: "$$\nE = mc^2\n$0\n$$\n",
    },
    {
        id: "md-image",
        label: "Image with caption",
        description: "Embedded figure + italic caption.",
        category: "Media",
        template: "![TODO: alt text]({v:figure_path}.png)\n\n*Figure 1: TODO caption.*\n\n$0\n",
    },
    {
        id: "md-link",
        label: "Link",
        description: "Inline hyperlink.",
        category: "Media",
        template: "[TODO: label](https://example.com)$0",
    },
    {
        id: "md-badges",
        label: "Badge row (shields.io)",
        description: "License + version + build badges.",
        category: "Media",
        template:
            "[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)\n[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)\n[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)]()\n\n$0\n",
    },
    {
        id: "md-quote",
        label: "Blockquote",
        description: "Quoted note.",
        category: "Text",
        template: "> TODO: quoted note.\n\n$0\n",
    },
    {
        id: "md-tasklist",
        label: "Task list",
        description: "Checklist with checkboxes.",
        category: "Text",
        template: "- [ ] TODO: first task\n- [ ] TODO: second task\n- [x] Done example\n\n$0\n",
    },
    {
        id: "md-details",
        label: "Collapsible section",
        description: "<details> summary block.",
        category: "Text",
        template: "<details>\n<summary>TODO: click to expand</summary>\n\n$0\n\n</details>\n",
    },
    {
        id: "md-rule",
        label: "Horizontal rule",
        description: "Section separator.",
        category: "Text",
        template: "\n---\n\n$0\n",
    },
    {
        id: "md-admonition",
        label: "Note / warning callout",
        description: "Bold callout paragraph (GitHub style).",
        category: "Text",
        template: "> **Note**\n> TODO: something worth calling out.\n\n$0\n",
    },
];

// ─── .gitignore & friends ───────────────────────────────────────────

export const IGNORE_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "ig-python",
        label: "Python",
        description: "Bytecode, caches, packaging, tests, type-check artifacts.",
        category: "Presets",
        template:
            "# Python\n__pycache__/\n*.py[cod]\n*$py.class\n*.so\n.Python\nbuild/\ndist/\n*.egg-info/\n.eggs/\n\n# Unit tests / coverage\n.pytest_cache/\n.coverage\nhtmlcov/\n.tox/\n\n# Type checkers\n.mypy_cache/\n.ruff_cache/\n",
    },
    {
        id: "ig-venv",
        label: "Virtual environments",
        description: "Common venv directory names.",
        category: "Presets",
        template:
            "# Virtual environments\n.venv/\nvenv/\nenv/\nENV/\nenv.bak/\nvenv.bak/\n",
    },
    {
        id: "ig-node",
        label: "Node / JS",
        description: "node_modules, build output, lockfile caches.",
        category: "Presets",
        template:
            "# Node\nnode_modules/\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n.pnpm-debug.log*\n\n# Build output\n.next/\nout/\nbuild/\ndist/\n.vite/\n",
    },
    {
        id: "ig-ide",
        label: "Editors / IDE",
        description: "VS Code, JetBrains, Sublime.",
        category: "Presets",
        template:
            "# Editors\n.vscode/\n.idea/\n*.swp\n*.swo\n*~\n.sublime-project\n.sublime-workspace\n",
    },
    {
        id: "ig-os",
        label: "Operating systems",
        description: ".DS_Store, Thumbs.db, desktop.ini.",
        category: "Presets",
        template:
            "# OS\n.DS_Store\n.DS_Store?\n._*\n.Spotlight-V100\n.Trashes\nThumbs.db\ndesktop.ini\n",
    },
    {
        id: "ig-jupyter",
        label: "Jupyter / IPython",
        description: "Checkpoints and profiles.",
        category: "Presets",
        template:
            "# Jupyter\n.ipynb_checkpoints\n.ipython/profile_default/history.sqlite\n",
    },
    {
        id: "ig-data",
        label: "Data & secrets",
        description: "Scratch data, logs, env files with credentials.",
        category: "Presets",
        template:
            "# Data / scratch\n*.log\ndata/raw/\n*.tmp\n\n# Secrets — never commit\n.env\n.env.local\n*.pem\n*.key\n",
    },
    {
        id: "ig-negate",
        label: "Re-include pattern (!)",
        description: "Un-ignore a specific path after a broad pattern.",
        category: "Patterns",
        template: "!{v:keep_path}$0\n",
    },
];

// ─── Plain text ─────────────────────────────────────────────────────

export const TEXT_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "txt-header",
        label: "Section header",
        description: "Underlined title line.",
        category: "Structure",
        template: "TODO SECTION\n============\n\n$0\n",
    },
    {
        id: "txt-subheader",
        label: "Subsection header",
        description: "Dashed underline.",
        category: "Structure",
        template: "TODO Subsection\n---------------\n\n$0\n",
    },
    {
        id: "txt-bullets",
        label: "Bullet list",
        description: "Dash list.",
        category: "Structure",
        template: "- TODO: first point\n- TODO: second point\n- TODO: third point\n\n$0\n",
    },
    {
        id: "txt-note",
        label: "Date-stamped note",
        description: "Timestamped entry with tags.",
        category: "Journal",
        template: "[YYYY-MM-DD HH:MM] TODO: what happened\n  - tags: todo\n\n$0\n",
    },
    {
        id: "txt-separator",
        label: "Separator",
        description: "Visual divider line.",
        category: "Journal",
        template: "\n----------------------------------------\n\n$0\n",
    },
];

// ─── JSON / YAML / TOML / CSV ────────────────────────────────────────

export const JSON_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "json-object",
        label: "Object skeleton",
        description: "Nested object with common value types.",
        category: "Structure",
        template:
            "{\n  \"{d:config_name}\": \"value\",\n  \"{d:version}\": 1,\n  \"{d:enabled}\": true,\n  \"{d:tags}\": [\"a\", \"b\"],\n  \"{d:nested}\": {\n    \"key\": null\n  }\n}\n$0",
    },
    {
        id: "json-array",
        label: "Array of objects",
        description: "List-of-records skeleton.",
        category: "Structure",
        template:
            "[\n  {\n    \"{d:item_id}\": 1,\n    \"{d:label}\": \"first\"\n  },\n  {\n    \"{d:item_id}\": 2,\n    \"{d:label}\": \"second\"\n  }\n]\n$0",
    },
];

export const YAML_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "yaml-mapping",
        label: "Mapping + list",
        description: "Top-level keys with a nested list.",
        category: "Structure",
        template:
            "{d:service_name}: praxis\n{d:version}: \"1.0\"\n{d:options}:\n  - alpha\n  - beta\n{d:settings}:\n  {d:debug}: false\n$0",
    },
];

export const TOML_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "toml-section",
        label: "Section + keys",
        description: "[table] header with typed values.",
        category: "Structure",
        template:
            "[{d:tool_section}]\n{d:name} = \"value\"\n{d:enabled} = true\n{d:retries} = 3\n$0",
    },
];

export const CSV_BLOCKS: CodeBlockTemplate[] = [
    {
        id: "csv-header",
        label: "Header + sample rows",
        description: "Column header and two example data rows.",
        category: "Structure",
        template: "{d:id},{d:label},{d:value}\n1,alpha,10.5\n2,beta,20.25\n$0",
    },
];

// ─── Dispatch by file name ───────────────────────────────────────────

/** File names that get the ignore-preset blocks. */
const IGNORE_FILES = new Set([
    ".gitignore",
    ".gitattributes",
    ".dockerignore",
    ".eslintignore",
    ".npmignore",
]);

/** All insert-block libraries for one file, keyed by its extension. */
export function blocksForFile(fileName: string | undefined): CodeBlockTemplate[] {
    const name = (fileName ?? "").toLowerCase();
    if (IGNORE_FILES.has(name)) return IGNORE_BLOCKS;
    if (name.endsWith(".py") || name.endsWith(".pyw")) return PYTHON_BLOCKS;
    if (name.endsWith(".md") || name.endsWith(".markdown")) return MARKDOWN_BLOCKS;
    if (name.endsWith(".json")) return JSON_BLOCKS;
    if (name.endsWith(".yaml") || name.endsWith(".yml")) return YAML_BLOCKS;
    if (name.endsWith(".toml")) return TOML_BLOCKS;
    if (name.endsWith(".csv")) return CSV_BLOCKS;
    if (name.endsWith(".txt") || name.endsWith(".log")) return TEXT_BLOCKS;
    return [];
}

/** Unique categories in display order for a block list. */
export function blockCategories(blocks: CodeBlockTemplate[]): string[] {
    const seen: string[] = [];
    for (const b of blocks) if (!seen.includes(b.category)) seen.push(b.category);
    return seen;
}
