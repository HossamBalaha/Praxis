# Menus 7–9: Run & Go, AI, Data

Back to the [features overview](./FEATURES-OVERVIEW.md).

## Run & Go — "Run & Go menu — execute scripts, stop, debug, and navigate the project"

Content width `w-64` (the merged former Run + Go menus); groups: Execution / Navigation.

| Item                                             | Shortcut | Action / Event                                                       | Condition                        |
|--------------------------------------------------|----------|----------------------------------------------------------------------|----------------------------------|
| *(group)* **Execution**                          |          |                                                                      |                                  |
| Run Script                                       | ⌘↵       | `onRun` (SSE-live output; Python + any runtime kind)                 | `canRun && caps.canRun && onRun` |
| Stop Running Script                              | ⌘.       | `onStop` (SIGTERM → SIGKILL after 1.5 s)                             | `canStop`                        |
| Run All In Folder                                | —        | `onRunAll` (sequential per-language pipeline)                        | `canRunAll`                      |
| Run With Coverage                                | —        | `onRunWithCoverage` (line-coverage tracing)                          | `canRun && caps.canRun`          |
| Run In Console…                                  | —        | `onRunInConsole` (persistent kernel; state survives)                 | `canRun && caps.canRunInConsole` |
| Debug With Pdb…                                  | —        | `onDebug` (the Diagnostics tab + pdb)                                | `caps.canRun`                    |
| Run With Tutor View…                             | —        | `onRunTutorView` (stack/heap/narration)                              | `caps.canRun`                    |
| Record & Replay…                                 | —        | `onRunTimeTravel` (the time-travel debugger)                         | `caps.canRun`                    |
| Run On Multiple Pythons…                         | —        | `onRunMultiPython` (the interpreter matrix)                          | `caps.canRun`                    |
| Line & Memory Profile…                           | —        | `onRunLineProfile` (gutter heat + tracemalloc)                       | `caps.canRun`                    |
| Run Queue…                                       | —        | `onOpenRunQueue` (the live runs view)                                | —                                |
| Scheduled Runs…                                  | —        | `onOpenScheduler` (the interval scheduler)                           | `caps.canRun`                    |
| Notify On Finish: Off / When Tab Hidden / Always | —        | `onCycleRunNotify` (cycles off → hidden → always; BellOff/Bell icon) | —                                |
| *(group)* **Navigation**                         |          |                                                                      |                                  |
| Go To File…                                      | ⌘K       | `onOpenSearch` (fuzzy-find)                                          | —                                |
| Go To File (Project)…                            | ⌘T       | `onGoToFile` (the project-wide picker)                               | —                                |
| Go To Line…                                      | ⌘G       | `onGoToLine`                                                         | `caps.canGotoLine`               |
| Go To Symbol…                                    | ⌘R       | `onOpenSymbolPalette`                                                | `caps.canGotoLine`               |
| Go To Symbol In Project…                         | —        | `onOpenProjectSymbols`                                               | —                                |
| Back                                             | ⌃-       | `onNavBack`                                                          | `canNavBack`                     |
| Forward                                          | ⌃⇧-      | `onNavForward`                                                       | `canNavForward`                  |
| Recent Files…                                    | —        | `onRecentFiles` (the dialog)                                         | —                                |
| Local File History…                              | —        | `onOpenLocalHistory` (save snapshots)                                | —                                |

## AI — "AI menu — chat, explain, improve, generate tests"

Content width `w-64`; groups: Chat / Code Actions / Developer Tools.

| Item                                               | Shortcut | Action / Event                                                                                                                                                                                                                                                                                                                                                                                                                | Condition                                                               |
|----------------------------------------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| *(group)* **Chat**                                 |          |                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                         |
| Open AI Chat…                                      | ⌘⇧L      | `onOpenAiChat` (the sidebar)                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                       |
| *(group)* **Code Actions**                         |          |                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                         |
| Explain Current File With AI                       | —        | `renderAiAction("explain")`: a plain item → `onAiExplain` when no external endpoints are enabled; **a submenu** when ≥ 1 enabled external endpoint AND `aiExplainQuestion` exists — "Praxis AI (Built-In)" (tag "sidebar") → `onAiExplain`; an "External AI Endpoints" label; per endpoint "Ask {name}" (tag "copies") → `askExternalAi(question, ep, toast)` (clipboard + new tab); "Copy Question Only" → clipboard + toast | `disabled={!onAiExplain}` (page drops it when there is no file/content) |
| Improve Current File With AI                       | —        | `renderAiAction("improve")` — the same structure via `onAiImprove` / `aiImproveQuestion`                                                                                                                                                                                                                                                                                                                                      | same                                                                    |
| *(group)* **Developer Tools**                      |          |                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                         |
| Generate AI Tests… / "Generating Tests…" (spinner) | —        | `onAiGenerateTests`                                                                                                                                                                                                                                                                                                                                                                                                           | disabled while `generatingTests`                                        |
| Agent Mode…                                        | —        | `onOpenAgentMode` (the multi-file AI edit planner)                                                                                                                                                                                                                                                                                                                                                                            | the handler is only passed while a folder is active                     |
| AI Settings… (emerald text)                        | —        | `onOpenSettings("ai")`                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                       |

## Data — "Data menu — profile, chart preview, transform pipeline, SQL workbench"

Content width `w-64`; groups: Profile / Explore & Transform. (Convert/Toolbox entries were
removed — they deduplicated Tools ▸ Developer Toolbox.)

| Item                                 | Action / Event                                                                   | Condition                                      |
|--------------------------------------|----------------------------------------------------------------------------------|------------------------------------------------|
| *(group)* **Profile**                |                                                                                  |                                                |
| Profile This File (tag "stats band") | `onProfileCurrentFile` (the column-stats band: type/min/max/mean/unique/missing) | `dataFileOpen` (a CSV/TSV/spreadsheet is open) |
| *(group)* **Explore & Transform**    |                                                                                  |                                                |
| Chart Preview…                       | `onOpenChartPreview` (X/Y columns → chart + matplotlib snippet)                  | `dataFileOpen`                                 |
| Transform Pipeline…                  | `onOpenTransformPipeline` (filter/sort/select/rename/group/pivot/join chain)     | `dataFileOpen`                                 |
| SQL Workbench…                       | `onOpenSqlWorkbench` (SQLite `.db`, read-only queries)                           | always enabled                                 |
