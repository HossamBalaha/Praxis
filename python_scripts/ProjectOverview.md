# Project overview

This file sits in the project ROOT — at the same level as the folders,
not inside a new sub-folder — which is exactly where the explorer's
first (drive-icon) entry looks for root files.

What this suite exercises:

| Group                    | Folder                                          | Purpose                                                                                                                            |
|--------------------------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| —                        | `Getting Started`                               | First-run basics of the run panel                                                                                                  |
| `Python Projects`        | `Algorithms`                                    | Classic algorithm scripts (flat — every file one click deep)                                                                       |
| `Python Projects`        | `Async Lab` / `CLI Toolbox` / `Interactive Lab` | async pipelines, argparse CLIs, input()-driven games                                                                               |
| `Python Projects`        | `Marathon Lab` / `Stress Lab`                   | Long-running scripts (~10 s → ~60 s) with live progress                                                                            |
| `Python Projects`        | `Testing Grounds`                               | doctest tours + failing suites for the diagnostics panel                                                                           |
| `Data & Docs`            | `Data Files`                                    | Every data-file reader (CSV → SQLite)                                                                                              |
| `Data & Docs`            | `Documents`                                     | Text-ish renderers incl. PDF & notebook                                                                                            |
| `Data & Docs`            | `Long Files`                                    | Long codes / logs / CSV / SQL / PDF                                                                                                |
| `Languages`              | `Language Lab`                                  | Java / C / C++ / R / shell runtimes + highlighting                                                                                 |
| `Languages`              | `MATLAB Lab`                                    | MATLAB scripts (matlab -batch / Octave)                                                                                            |
| `Media`                  | `Media Gallery`                                 | The image renderer                                                                                                                 |
| `Media`                  | `Playback`                                      | The video / audio renderers                                                                                                        |
| `Media`                  | `Web Studio`                                    | HTML pages + a linked stylesheet (the iframe preview)                                                                              |
| `Structure & Edge Cases` | `Nested Folders`                                | Files with spaced names + a mix of types (flat — one click deep)                                                                   |
| `Structure & Edge Cases` | `Archives`                                      | Real compressed fixtures (zip / tar / tar.gz / tgz / tar.bz2 / tbz2 / tar.xz / txz / gz / xz / bz2 / 7z) with images + text inside |
| `Structure & Edge Cases` | `Unsupported Types`                             | Files marked unsupported (archives moved to `Archives`)                                                                            |

Added in `Stress Lab/` (runs of ~10 s, ~20 s and ~60 s with
live progress output) and `Long Files/` (a ~950-line module, a ~700-line
markdown report, a ~2,600-line log, a ~4,000-row CSV, a deep JSON
catalog, a 16-table SQL schema and a 40-page PDF).
