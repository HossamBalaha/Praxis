/**
 * Markdown examples. Category groups: Documentation, Notes, Reference.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const md = (
    id: string, label: string, description: string, category: string, sub: string, baseName: string,
    body: string,
) => mkExample("markdown", id, label, description, category, sub, baseName, ".md", () => body);

export const MD_EXAMPLES: FileExample[] = [
    // ─── Documentation ───────────────────────────────────────────────
    md("md-ex-readme", "README (project)", "Full project readme skeleton: badges, TOC, install, usage, license.", "Documentation", "Project files", "readme", `# Project Title

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)

One-sentence description of what this project does and why it exists.

## Contents

- [Installation](#installation)
- [Usage](#usage)
- [Results](#results)
- [Contributing](#contributing)
- [License](#license)

## Installation

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Usage

\`\`\`python
python main.py --input data.csv
\`\`\`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| \`--input\` | path | — | input file |
| \`--verbose\` | flag | off | print progress |

## Results

![Example figure](figure.png)

*Figure 1: TODO caption.*

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
`),
    md("md-ex-contributing", "CONTRIBUTING guide", "Repo contribution guide: workflow, style, PR checklist.", "Documentation", "Project files", "contributing", `# Contributing

Thanks for considering a contribution!

## Workflow

1. Fork + create a branch from \`main\`.
2. Make your change with tests.
3. Run \`make check\` (lint + tests) locally.
4. Open a pull request describing the **what** and the **why**.

## Style

- Code: PEP 8, type hints on public functions.
- Commit messages: imperative mood ("Add …", not "Added …").

## Pull-request checklist

- [ ] Tests added or updated
- [ ] Docs updated (README / CHANGELOG)
- [ ] \`make check\` passes locally
- [ ] No unrelated reformatting

## Reporting bugs

Open an issue with: OS, Python version, minimal reproduction snippet, and what you expected instead.
`),
    md("md-ex-api-reference", "API reference", "Endpoint-by-endpoint reference with request/response examples.", "Documentation", "Project files", "api_reference", `# API Reference

Base URL: \`https://api.example.com/v1\`

Authentication: \`Authorization: Bearer <token>\` on every request.

## Endpoints

### GET /reports

List saved reports.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| \`limit\` | int | no | page size (default 20) |
| \`cursor\` | string | no | pagination cursor |

**Response 200**

\`\`\`json
{
  "items": [{"id": "r-1", "title": "Q3", "rows": 120}],
  "next_cursor": null
}
\`\`\`

### POST /reports

Create a report.

**Request body**

\`\`\`json
{"title": "Q4", "source": "sheet-42"}
\`\`\`

**Errors**

| Code | Meaning |
| --- | --- |
| 400 | validation failed — see \`message\` |
| 401 | missing/invalid token |
| 429 | rate limit (10 req/min) |
`),
    md("md-ex-user-guide", "User guide / tutorial", "Step-by-step first-session walkthrough with checkpoints.", "Documentation", "Guides", "user_guide", `# Getting Started

A 10-minute tour from install to your first result.

## 1. Install

\`\`\`bash
pip install praxis-toolkit
\`\`\`

Checkpoints along the way are marked like this:

> ✅ **Checkpoint** — \`praxis --version\` prints a version number.

## 2. Configure

Create \`config.toml\`:

\`\`\`toml
[run]
timeout = 60
workers = 4
\`\`\`

## 3. Run your first analysis

\`\`\`bash
praxis run examples/survey.py
\`\`\`

Expected output:

\`\`\`
n=212 respondents
mean score 7.4 (sd 1.9)
wrote results/survey-report.md
\`\`\`

> ✅ **Checkpoint** — the report file exists and opens.

## Where to go next

- [Troubleshooting](#troubleshooting)
- [Command reference](commands.md)

## Troubleshooting

**"module not found"** — activate your virtual environment first.
`),
    md("md-ex-release-notes", "Release notes", "User-facing changelog with highlights and breaking changes.", "Documentation", "Guides", "release_notes", `# Release Notes — v2.1.0

Released: 2026-11-07

## Highlights

- **3× faster parsing** of large CSV files (see #412)
- New \`praxis doctor\` command diagnoses environment problems
- Dark mode for exported HTML reports

## New

- \`--quiet\` flag suppresses progress output
- Reports remember their last-used filter

## Improved

- Startup time down from 1.8s to 0.7s
- Clearer error messages for missing columns

## Fixed

- Figures with non-ASCII titles export correctly
- Race condition when two runs write the same CSV

## Breaking changes

- \`run(timeout=…)\` now takes seconds (was minutes)
- Python 3.11 is the minimum supported version

## Upgrade guide

\`\`\`bash
pip install --upgrade praxis-toolkit==2.1.0
\`\`\`

Rename any \`timeout\` values in your config from minutes to seconds.
`),
    md("md-ex-adr", "Architecture decision record", "ADR: context, options considered, and the decision with consequences.", "Documentation", "Guides", "adr_0001", `# ADR-0001: Store run history in SQLite

- **Status:** accepted
- **Date:** 2026-11-07
- **Deciders:** backend team

## Context

Run history outgrew the 5 MB localStorage cap at ~300 entries.
Users asked for cross-session history and full-text search over stdout.

## Options considered

| | localStorage | SQLite | Server DB |
| --- | --- | --- | --- |
| Capacity | ~300 runs | millions | millions |
| Search | manual | FTS5 | full |
| Offline | yes | yes | no |
| Setup cost | none | small | large |

## Decision

Use SQLite via the stdlib \`sqlite3\` module, file placed under
\`.praxis/history.db\`, with an FTS5 index over stdout text.

## Consequences

- **Positive:** unlimited history, fast search, no server dependency.
- **Positive:** one file to back up or delete.
- **Negative:** schema migrations now needed (keep them additive).
- **Mitigation:** history is disposable — a corrupt file is recreated.
`),
    md("md-ex-architecture", "Architecture overview", "Component diagram in text + data-flow walkthrough.", "Documentation", "Guides", "architecture", `# Architecture Overview

## Components

\`\`\`
┌──────────┐     HTTP/SSE      ┌──────────────┐
│  Browser │ ────────────────▶ │  Next.js app │
│  (React) │ ◀──────────────── │  (this repo) │
└──────────┘   stream + JSON   └──────┬───────┘
                                      │ spawn
                                      ▼
                              ┌──────────────┐
                              │   Python     │
                              │  interpreter │
                              └──────┬───────┘
                                     │ writes
                                     ▼
                              ┌──────────────┐
                              │  chapter     │
                              │  folder      │
                              └──────────────┘
\`\`\`

## Request lifecycle

1. The browser POSTs to \`/api/run\` with the chapter + file slug.
2. The route spawns the configured interpreter with a capture prelude.
3. stdout/stderr stream back as SSE events; figures are intercepted.
4. The watcher emits a silent chapter refresh when new files appear.

## Invariants

- The Python process never runs with the server's privileges.
- Every file write goes through the same validation helper.
`),
    md("md-ex-style-guide", "Style guide", "Writing/naming conventions with good-vs-bad examples.", "Documentation", "Project files", "style_guide", `# Project Style Guide

## Python

| Rule | Good | Bad |
| --- | --- | --- |
| function names | \`load_config\` | \`loadConfig\` |
| constants | \`MAX_RETRIES\` | \`maxRetries\` |
| boolean reads | \`if items:\` | \`if len(items) > 0:\` |
| errors | raise specific classes | \`raise Exception\` |

- Type hints on public functions, optional internally.
- Docstrings: one summary line, then details only when non-obvious.

## Commits

\`<type>(<scope>): <subject>\` — e.g. \`fix(runner): clamp timeout\`

Types: \`feat\`, \`fix\`, \`docs\`, \`refactor\`, \`test\`, \`chore\`.

## Markdown

- \`-\` bullets, \`#\` headings with one blank line around blocks.
- Tables for comparisons, lists for steps, prose for explanation.

## What we optimize for

1. Readability by a newcomer six months from now.
2. Diff noise (small, mechanical changes preferred).
3. Everything else.
`),

    // ─── Notes ───────────────────────────────────────────────────────
    md("md-ex-chapter-notes", "Chapter notes", "Structured study notes with theory, formulas and a summary table.", "Notes", "Study", "chapter_notes", `# Chapter N — Topic

> **TL;DR** — one-paragraph summary of the chapter.

## Motivation

Why does this topic exist? What problem does it solve?

## Key ideas

1. **Idea one** — explanation.
2. **Idea two** — explanation.

## Formulas

$$
\\text{Var}(X) = E[X^2] - (E[X])^2
$$

## Worked example

\`\`\`python
# The script that demonstrates this chapter
\`\`\`

## Summary

| Concept | Definition | Where used |
| --- | --- | --- |
| TODO | TODO | TODO |

## Open questions

- [ ] TODO
`),
    md("md-ex-meeting-notes", "Meeting notes", "Attendees, agenda, decisions, action items with owners.", "Notes", "Meetings", "meeting_notes", `# Meeting — YYYY-MM-DD

**Attendees:** Alice, Bob, Carol

## Agenda

1. Status
2. Blockers
3. Next steps

## Decisions

| # | Decision | Owner |
| --- | --- | --- |
| 1 | TODO | TODO |

## Action items

- [ ] Alice — TODO
- [ ] Bob — TODO
- [ ] Carol — TODO

<details>
<summary>Raw notes</summary>

TODO — anything not yet structured.

</details>
`),
    md("md-ex-experiment-log", "Experiment log", "Reproducible-experiment records: setup, results, conclusions.", "Notes", "Research", "experiment_log", `# Experiment log

| # | Date | Question | Status |
| --- | --- | --- | --- |
| 1 | YYYY-MM-DD | Does X improve Y? | done |
| 2 | YYYY-MM-DD | … | running |

## Experiment 1 — TODO title

**Question.** What are we trying to learn?

**Setup.**

- Data: …
- Model / method: …
- Fixed parameters: …
- Random seed: 42

**Results.**

| Variant | Metric A | Metric B |
| --- | --- | --- |
| baseline | TODO | TODO |
| ours | TODO | TODO |

**Conclusion.** One or two sentences — accept / reject the hypothesis.

**Follow-ups.**

- [ ] TODO
`),
    md("md-ex-lab-notebook", "Lab notebook entry", "Dated bench record: what was measured, how, and the raw numbers.", "Notes", "Research", "lab_notebook", `# Lab Notebook

## 2026-11-07 — Sensor calibration 

**Goal.** Re-calibrate after the firmware update.

### Setup

- Instrument: sensor unit #3, firmware 2.4
- Reference: calibrated thermometer ±0.1 °C
- Environment: 21.0 °C room, 45% RH

### Measurements

| Setpoint | Unit #3 | Reference | Error |
| ---: | ---: | ---: | ---: |
| 0.0 | 0.4 | 0.0 | +0.4 |
| 25.0 | 25.3 | 24.9 | +0.4 |
| 50.0 | 50.6 | 50.1 | +0.5 |

### Notes

- Error is now a consistent +0.45 offset (was drifting before).
- Action: add −0.45 to the firmware offset table.

### Follow-up

- [ ] Re-check at 75/100 °C tomorrow
- [ ] Log the firmware change in the change register
`),
    md("md-ex-reading-notes", "Reading notes", "Paper/book notes with quotes, takeaways, and a verdict.", "Notes", "Study", "reading_notes", `# Reading Notes

**Title:** *TODO — paper or book title*
**Read:** YYYY-MM-DD · **Rating:** ★★★☆☆

## One-line summary

What the work claims, in a sentence.

## Key takeaways

1. Takeaway one.
2. Takeaway two.
3. Takeaway three.

## Quotes worth keeping

> "TODO — the sentence you keep coming back to." (p. 42)

## Method (if a paper)

- Data: …
- Approach: …
- Evaluation: …

## How it connects

- Contradicts / extends [another paper or chapter]…

## Verdict

Worth re-reading? **Yes / No** — and why in one sentence.
`),
    md("md-ex-daily-journal", "Daily journal", "A dated reflection template: focus, wins, friction, tomorrow.", "Notes", "Personal", "daily_journal", `# Journal — YYYY-MM-DD

## Focus of the day

One sentence: what today was *about*.

## Wins

- [x] TODO — something that worked
- [x] TODO

## Friction

- TODO — what slowed me down, and the first idea to remove it

## Learned

> TODO — one thing worth remembering

## Tomorrow

1. TODO — the single most important task
2. TODO

## Mood

🙁 😐 🙂 😄 — circle one, no judgment.
`),

    // ─── Reference ───────────────────────────────────────────────────
    md("md-ex-cheatsheet", "Cheat sheet", "Dense reference sheet grouped by topic with code examples.", "Reference", "Quick reference", "cheat_sheet", `# Cheat Sheet — Topic

## Basics

\`\`\`python
# TODO — the one-liner you always forget
\`\`\`

## Gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| TODO | TODO | TODO |

## Links

- [Official docs](https://example.com)
- [Good tutorial](https://example.com)
`),
    md("md-ex-glossary", "Glossary", "Alphabetical terms with cross-references.", "Reference", "Quick reference", "glossary", `# Glossary

| Term | Definition | See also |
| --- | --- | --- |
| API | application programming interface | SDK |
| CI | continuous integration | CD, pipeline |
| idempotent | repeating an operation changes nothing after the first run | retry |
| TODO | define your domain's terms here | — |

## By letter

### A

**API** — the contract a program exposes to other programs.

### I

**idempotent** — safe to retry. \`PUT /users/7\` is; \`POST /users\` is not.

### T

**TODO** — keep entries short; link long explanations elsewhere.
`),
    md("md-ex-faq", "FAQ", "Question-driven doc grouped by audience.", "Reference", "Quick reference", "faq", `# FAQ

## For everyone

### Is my data uploaded anywhere?

No. Everything runs locally; the only network calls are ones you make
yourself in your scripts.

### Does it work offline?

Yes, after the first load. Results are cached in your browser.

## For beginners

### I see "module not found" when running an example

Install the requirements first:

\`\`\`bash
pip install -r requirements.txt
\`\`\`

### Where did my figure go?

Figures appear in the Output panel below the code. Check that your
script actually calls \`plt.show()\`.

## For power users

### Can I change the Python interpreter?

Yes — Settings → Python → *Python interpreter*.

### How do I reset all settings?

Settings → Advanced → *Reset to defaults* (there is a confirm step).
`),
    md("md-ex-data-dictionary", "Data dictionary", "Column-by-column schema for a dataset.", "Reference", "Data docs", "data_dictionary", `# Data Dictionary — survey_responses.csv

| Column | Type | Unit / values | Missing | Description |
| --- | --- | --- | --- | --- |
| \`respondent_id\` | int | — | no | unique per person |
| \`age\` | int | years | 2% | self-reported |
| \`satisfaction\` | int | 1–5 | no | 5 = very satisfied |
| \`channel\` | enum | web, mobile, desktop | no | acquisition source |
| \`comments\` | text | free | 61% | optional |

## Value counts worth knowing

- \`channel\`: web 48%, mobile 39%, desktop 13%
- \`satisfaction\`: median 4, mean 3.7

## Notes for analysis

- Weight \`channel\` if you generalize to all users (sampling differs).
- \`comments\` missingness is *plausibly random* — dropping rows is safe.
`),
    md("md-ex-command-reference", "Command reference", "CLI subcommands with flags and examples.", "Reference", "Quick reference", "command_reference", `# Command Reference

## \`praxis run\`

Run a script with live output.

\`\`\`bash
praxis run chapter01/survey.py --timeout 120
\`\`\`

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| \`--timeout\` | seconds | 60 | kill the process after this |
| \`--stdin\` | path | — | pipe a file to stdin |
| \`--no-cache\` | flag | off | always re-run |

## \`praxis run-all\`

Run every script in a chapter, stopping at the first failure.

## \`praxis history\`

\`\`\`bash
praxis history --last 10 --grep "error"
\`\`\`

## \`praxis doctor\`

Diagnose the environment: interpreter, packages, permissions.
`),
    md("md-ex-decision-log", "Decision log", "Lightweight decision tracker — the ADR's little sibling.", "Reference", "Data docs", "decision_log", `# Decision Log

| ID | Date | Decision | Reversible? |
| --- | --- | --- | --- |
| D-001 | 2026-11-01 | Use matplotlib, not plotly | hard |
| D-002 | 2026-11-03 | History in localStorage | easy — revisit at v2 |
| D-003 | 2026-11-07 | Drop Python 3.10 support | hard |

## D-003 — Drop Python 3.10 support

- **Trigger:** typing syntax we want (\`X | None\`) needs 3.10+ at runtime
  and 3.12 for full fidelity.
- **Alternatives:** keep compat shims (rejected: 3 files of \`TYPE_CHECKING\`
  gymnastics).
- **Revisit when:** a major user asks.
`),
    md("md-ex-lesson-plan", "Lesson plan", "Session plan with objectives, timing, and materials.", "Reference", "Teaching", "lesson_plan", `# Lesson Plan — Descriptive Statistics

**Level:** intro · **Length:** 90 min · **Group:** up to 20

## Objectives

By the end, students can:

1. Compute mean, median, and mode for a small sample.
2. Explain *when* the median beats the mean.
3. Read a box plot.

## Materials

- Slides 1–12
- \`heights.csv\` (one column, 40 rows)
- Worksheet "which average?"

## Timing

| Minutes | Segment | Method |
| ---: | --- | --- |
| 10 | warm-up: guess the average height | poll |
| 20 | mean vs median with the outlier demo | live code |
| 15 | worksheet in pairs | group |
| 20 | box plots from the same data | live code |
| 15 | exercise: compare two classes | solo |
| 10 | recap + quiz (3 questions) | plenary |

## Assessment

Exit ticket: one question mixing a skewed distribution with a mean/median
choice.
`),
    md("md-ex-tutorial-outline", "Tutorial / course outline", "Multi-session curriculum with prerequisites and projects.", "Reference", "Teaching", "course_outline", `# Course Outline — Python for Data Analysis

**Sessions:** 8 × 2h · **Prerequisites:** basic Python

| # | Topic | Project |
| -: | --- | --- |
| 1 | numpy arrays & vectorization | image as numbers |
| 2 | pandas: load, filter, groupby | survey cleanup |
| 3 | joins & reshaping | sales warehouse |
| 4 | visualization grammar | chart a day, day 1 |
| 5 | distributions & summaries | describe your data |
| 6 | correlation & regression | predict apartment prices |
| 7 | bootstrap & intervals | margin of error, honestly |
| 8 | capstone workshop | own dataset, peer review |

## Grading

- 60% weekly projects (drop the lowest)
- 40% capstone + short presentation

## Policies

- Pair programming encouraged on projects, not on the capstone.
- Late days: 4 free ones, no questions asked.
`),
];
