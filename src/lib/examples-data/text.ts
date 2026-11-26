/**
 * Plain-text examples. Category groups: Lists, Notes, Data.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const txt = (
    id: string, label: string, description: string, category: string, sub: string, baseName: string,
    body: string,
) => mkExample("text", id, label, description, category, sub, baseName, ".txt", () => body);

export const TXT_EXAMPLES: FileExample[] = [
    // ─── Lists / Tasks ───────────────────────────────────────────────
    txt("txt-ex-todo", "TODO list", "Simple prioritized todo list.", "Lists", "Tasks", "todo_list", `TODO LIST
========

[ ] (high)   TODO — the thing that blocks everything
[ ] (medium) TODO
[ ] (low)    TODO

DONE
----
[x] Set up the project
`),
    txt("txt-ex-checklist", "Release checklist", "Pre-flight checks before shipping a version.", "Lists", "Tasks", "release_checklist", `RELEASE CHECKLIST — v___.___
=================================

Code
  [x] all tests green (n=___)
  [x] linter clean
  [ ] TODO

Docs
  [ ] changelog updated
  [ ] README version badges bumped
  [ ] migration notes written

Packaging
  [ ] version bumped in pyproject.toml
  [ ] tag created and pushed
  [ ] package builds locally

After release
  [ ] verify install from the package index
  [ ] announce in #releases
  [ ] roll back plan: ___
`),
    txt("txt-ex-backlog", "Backlog", "Rough ideas parked for later triage.", "Lists", "Tasks", "backlog", `BACKLOG (unsorted ideas — triage monthly)
==========================================

IDEAS
-----
* export reports as PDF          (effort S, value M)
* remember last-used filters     (effort S, value S)
* TODO — your next idea

NEXT UP (chosen for next iteration)
-----------------------------------
1. full-text search over history
2. TODO

PARKED (deliberately not now)
-----------------------------
* rewrite the runner in Rust    (revisit: never?)
* TODO
`),
    txt("txt-ex-retro", "Sprint retro summary", "What went well / wrong / to try — plain-text retro.", "Lists", "Tasks", "retro_summary", `RETRO — sprint 14 (2026-11-07)
===============================

WENT WELL
---------
* the watcher fix shipped on day 2
* zero rollbacks this sprint
* TODO

WENT WRONG
----------
* the flaky test cost us a full day
* TODO

CONFUSING
---------
* who owns the release checklist?
* TODO

TRY NEXT SPRINT
---------------
1. delete the flaky test (not fix — delete)
2. 10-min daily pairing rotation
3. TODO
`),

    // ─── Lists / Releases ────────────────────────────────────────────
    txt("txt-ex-changelog", "CHANGELOG", "Keep-a-changelog style release history with semver sections.", "Lists", "Releases", "changelog", `CHANGELOG
=========

[Unreleased]
  Added  TODO
  Fixed  TODO

[1.1.0] - YYYY-MM-DD
  Added  The feature everyone asked for
  Changed Default verbosity to info

[1.0.0] - YYYY-MM-DD
  First stable release.
`),
    txt("txt-ex-milestones", "Milestone timeline", "Dated plan with owners and exit criteria.", "Lists", "Releases", "milestones", `MILESTONES — project phoenix
============================

M1  Foundation ...................... due 2026-11-21
    owner: alice
    exit: hello-world runs end to end

M2  Import & browse ................ due 2026-12-05
    owner: bob
    exit: 1k-file project opens < 2s

M3  Run & capture .................. due 2026-12-19
    owner: carol
    exit: figures + tables render in output

M4  Beta ........................... due 2027-01-09
    owner: all
    exit: 5 external users, zero data-loss bugs
`),

    // ─── Notes ───────────────────────────────────────────────────────
    txt("txt-ex-notes", "Plain notes", "Dated free-form notes file with section headers.", "Notes", "Daily", "notes", `NOTES
=====

[YYYY-MM-DD] Session 1
  - TODO: what I did
  - TODO: what to try next

----------------------------------------

[YYYY-MM-DD] Session 2
  - TODO
`),
    txt("txt-ex-daily-log", "Daily work log", "Time-boxed log of what happened, per day.", "Notes", "Daily", "daily_log", `WORK LOG
========

2026-11-07
  09:10  standup — noted the parser bug
  09:30  reproduced bug #312 (10 min)
  10:00  fix + test (45 min)
  11:00  review with alice — approved
  13:00  started watcher refactor (parked at 60%)
  focus score: 4/5

2026-11-08
  09:15  standup
  TODO
`),
    txt("txt-ex-scratchpad", "Scratchpad", "Throwaway thinking space — one idea per line.", "Notes", "Daily", "scratchpad", `SCRATCHPAD (delete freely)
==========================

- if the cache key included mtime we would not need the nonce
- three names for the same thing: watcher / observer / spy
- try: sorted(files, key=name) vs sorted(files) — same?
- remember: shutil.copy2 keeps mtime, copy does not
- TODO
`),
    txt("txt-ex-meeting-minutes", "Meeting minutes (plain)", "Minimal minutes: who, what, decided, next.", "Notes", "Meetings", "meeting_minutes", `MINUTES — sync 2026-11-07, 30 min
present: alice, bob, carol

DECIDED
  1. ship on thursday regardless
  2. alice owns the checklist

DISCUSSED
  - parser bug: fixed, tests added (bob)
  - release notes draft is in docs/ (carol)

NEXT
  - bob: tag the release
  - carol: update the changelog
  - all: be online thursday 10:00
`),

    // ─── Notes / Decisions ───────────────────────────────────────────
    txt("txt-ex-decisions", "Decision record (plain)", "One-file rolling decision register.", "Notes", "Decisions", "decisions", `DECISIONS (append-only)
======================

2026-11-01  use matplotlib over plotly
            why: offline + figures must be static
            revisit: if interactivity is requested

2026-11-03  history in localStorage for now
            why: zero setup; 300 entries is enough
            revisit: at v2 (see ADR-0001)

2026-11-07  drop python 3.10
            why: union syntax everywhere
            revisit: unlikely
`),

    // ─── Data ────────────────────────────────────────────────────────
    txt("txt-ex-env-pairs", "Environment pairs", "KEY=value reference sheet for local runs.", "Data", "Config data", "env_pairs", `# local environment — copy to .env and fill in
APP_HOST=localhost
APP_PORT=8000
APP_DEBUG=false

# secrets (do NOT commit the filled version)
API_KEY=
DB_URL=

# comments start with #; blank lines are ignored
`),
    txt("txt-ex-fixed-width", "Fixed-width report", "Column-aligned report that survives any editor.", "Data", "Tabular", "fixed_width_report", `MONTHLY SUMMARY — 2026-10
==========================

REGION     SALES      UNITS    DELTA
--------------------------------------
north      12,450.00    1,204    +4.2%
south       9,875.50      987    -1.1%
east       11,200.00    1,033    +0.8%
west        8,940.25      902    +2.6%
--------------------------------------
total      42,465.75    4,126    +1.7%

notes: south dipped after the outage on the 14th
`),
    txt("txt-ex-import-list", "Import manifest", "Files to move/migrate with sizes and status.", "Data", "Tabular", "import_manifest", `IMPORT MANIFEST — batch 7
=========================

source                        size      status
------------------------------------------
raw/survey_2026.csv          18.2 MB   ok
raw/survey_2025.csv           9.7 MB   ok
raw/interviews/*.m4a         41.0 MB   pending
raw/notes_old.txt              12 KB   skip (legacy)

checksums: see manifest-sha256.txt
owner: carol
`),
];
