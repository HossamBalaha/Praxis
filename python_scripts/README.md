# Praxis Example Test Suite

This project is the **testing ground** for every file kind the Praxis
explorer and viewer support — plus a few it must gracefully refuse.

Each folder targets a specific renderer or behavior:

The top level groups the suites so every file is reachable in a
click or two — expand a group, open the folder, open the file:

| Group                    | Folders inside                                                                                                     | What they test                                                                                                                                                                                                                                                                   |
|--------------------------|--------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Getting Started`        | —                                                                                                                  | Runnable Python scripts, Run/output panel, camelCase vars + PascalCase defs                                                                                                                                                                                                      |
| `Python Projects`        | `Algorithms` · `Async Lab` · `CLI Toolbox` · `Interactive Lab` · `Marathon Lab` · `Stress Lab` · `Testing Grounds` | Classic scripts, async pipelines, argparse CLIs, interactive games, long-running runs with live progress, doctest tours + failing suites                                                                                                                                         |
| `Data & Docs`            | `Data Files` · `Documents` · `Long Files`                                                                          | The data-file readers: CSV, TSV, Excel, Parquet, Feather, SQLite, JSON, JSONL, YAML, TOML · Markdown, text, log, INI, CFG, ENV, SQL, R, RMarkdown, shell, HTML, PDF, Jupyter · long codes / logs / catalogs                                                                      |
| `Languages`              | `Language Lab` · `MATLAB Lab`                                                                                      | The non-Python runtimes + highlighting: Java, C, C++, R, shell · MATLAB (matlab -batch / Octave)                                                                                                                                                                                 |
| `Media`                  | `Media Gallery` · `Playback` · `Web Studio`                                                                        | The image renderer (PNG, JPEG, GIF, WebP, SVG, BMP, ICO, AVIF) · video and audio renderers (MP4, WebM, WAV, MP3, OGG) · HTML pages in the sandboxed iframe                                                                                                                       |
| `Structure & Edge Cases` | `Nested Folders` · `Archives` · `Unsupported Types` · `Long Files`                                                 | Names with spaces, mixed types, deep nesting · real compressed fixtures in every format (zip / tar / gz / bz2 / xz / tgz / tbz2 / txz / 7z) · files the viewer must mark **unsupported** (exe, dll, bin, dat, pem, foobar) · a 784-line module for the collapsed/expanded viewer |

> Convention used across every script: **PascalCase** file, class and
> function names; **camelCase** variables — the app's default style.

The math renders too: $E = mc^2$ and

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

```python
greeting = "Hello"
print(f"{greeting}, Praxis!")
```
