# README — the Markdown viewer test pack

This folder exists to stress the IDE's Markdown rendering. Every file
here is a normal `.md` file in the tree: open it, scroll it, edit it,
save it — the outline, the preview and the editor should all keep up.

| File                                                 | What it stresses                                                                                                                                                                         |
|------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [`Very-Long-README.md`](./Very-Long-README.md)       | A multi-thousand-line document: deep heading nests, wide tables, fenced code in many languages, Mermaid diagrams, KaTeX math, task lists, collapsible details, footnotes, GitHub alerts. |
| [`Examples-README.md`](./Examples-README.md)         | Per-language example walkthroughs — one fenced block per language, with expected-output blocks.                                                                                          |
| [`Architecture-README.md`](./Architecture-README.md) | Architecture documents: Mermaid flowcharts / sequence / class / ER diagrams, ASCII layouts, and numbered ADR records.                                                                    |

## How to verify the viewer

1. Open each file — the first paint should be quick; a long file may
   take a moment to fully render, but the tab must never freeze.
2. Open the outline / table of contents and jump between sections.
3. Scroll to the very bottom and back to the top.
4. Switch to **Edit** and back to **View**.
5. Try the in-file Find (`Ctrl+F`) over the whole document.
