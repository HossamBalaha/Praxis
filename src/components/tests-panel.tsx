"use client";
import dynamic from "next/dynamic";

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    CircleDashed,
    CircleX,
    Eye,
    FlaskConical,
    Loader2,
    PieChart as PieChartIcon,
    Play,
    RefreshCw,
} from "lucide-react";
import {cn} from "@/lib/utils";
import {loadSettings, saveSettings} from "@/lib/settings";
import {
    affectedTestFiles,
    isTestFileName,
    type TestRunResult,
    WATCH_DEBOUNCE_MS,
    WatchRunner,
    type WatchRunnerState,
    type WatchTestEntry,
} from "@/lib/watch-tests";

export interface TestReportEntry {
    name: string;
    status: "passed" | "failed" | "error" | "skipped";
    message?: string;
    folder?: string;
    folderName?: string;
    file?: string;
    fileSlug?: string;
    line?: number;
}

export interface TestReportData {
    error?: string;
    total?: number;
    passed?: number;
    failed?: number;
    errors?: number;
    skipped?: number;
    durationMs?: number;
    usedPytest?: boolean;
    raw?: string;
    tests?: TestReportEntry[];
}

interface TestsPanelProps {
    /** Live report state from page.tsx (null = never run). */
    report: { loading: boolean; data: TestReportData | null } | null;
    /** Trigger a fresh whole-project test run. */
    onRun: () => void;
    /** Run the ACTIVE python file under the coverage tracer — the
     *  same pipeline as Run ▸ Run With Coverage (per-line gutter
     *  marks + the Coverage tab in Output); surfaced here so the
     *  test suite panel owns every way to execute tests. */
    onRunWithCoverage?: () => void;
    /** Open a test's file (jump to its line when known). */
    onOpenFile: (folderSlug: string, fileSlug: string, line?: number) => void;
    /** Property-based tests (Hypothesis): the active python file — the
     *  "Property" section scaffolds strategies from its signature,
     *  runs with shrink sequences, and promotes regression tests. */
    folderSlug?: string;
    fileSlug?: string;
    fileName?: string;
    code?: string;
    onInsertTest?: (source: string) => void;
    hypothesisEnabled?: boolean;
}

const HypothesisWorkbench = dynamic(() => import("@/components/hypothesis-workbench").then((m) => m.HypothesisWorkbench), {ssr: false});


const STATUS_ICON: Record<string, React.ReactNode> = {
    passed: <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5"/>,
    failed: <CircleX className="size-3.5 text-red-500 shrink-0 mt-0.5"/>,
    error: <CircleAlert className="size-3.5 text-orange-500 shrink-0 mt-0.5"/>,
    skipped: <CircleDashed className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>,
    // A node discovered by the PRE-COLLECTION pass that no run has
    // reached yet — visually quieter than "skipped" so an untouched
    // tree reads as "here is what exists", not "something was deselected".
    notrun: <CircleDashed className="size-3.5 text-muted-foreground/40 shrink-0 mt-0.5"/>,
};

/* ================================================================== */
/*  Test pre-collection (mount-time tree)                             */

/* ================================================================== */

/** One node of the pre-collected tree — the SAME field set the
 *  /api/test run rows use, plus the pytest nodeid, so a real run
 *  overlays pass/fail/skip onto the collected node by
 *  (fileSlug, name) with no renaming layer in between. */
export interface CollectedTestEntry {
    name: string;
    nodeid?: string;
    folder?: string;
    folderName?: string;
    file?: string;
    fileSlug?: string;
}

export interface CollectData {
    ok?: boolean;
    /** false → pytest is not installed: the panel SKIPS pre-collection
     *  silently (no error banner, the plain empty state stands). */
    available?: boolean;
    collectedAt?: number;
    durationMs?: number;
    count?: number;
    tests?: CollectedTestEntry[];
    error?: string;
}

/** Statuses a tree node can carry — the four run statuses plus the
 *  pre-collection "notrun" placeholder. */
type TreeStatus = "passed" | "failed" | "error" | "skipped" | "notrun";

interface TreeNode {
    key: string;
    name: string;
    status: TreeStatus;
    message?: string;
    line?: number;
    folder?: string;
    fileSlug?: string;
    /** The pytest nodeid this node was collected under — the scope key
     *  the row's hover run action sends to /api/test. Absent on nodes
     *  only a real RUN ever reported (nothing was collected for them). */
    nodeid?: string;
}

interface TreeFile {
    fileSlug: string;
    /** Folder SLUG — with fileSlug, the /api/test scope keys the file
     *  group's run action sends (same keys the explorer's per-file
     *  "Run pytest" uses). */
    folder?: string;
    folderName?: string;
    file?: string;
    entries: TreeNode[];
}

/**
 * Build the MERGED test tree: collected nodes (status "notrun") with
 * the real-run rows overlaid onto the same nodes. Files are keyed by
 * fileSlug exactly like the old byFile grouping, so a run fills in
 * the very tree the collection rendered — never a second, parallel
 * list. Files that only the RUN knows about (collection unavailable,
 * a file created since) are appended after the collected ones.
 *
 * Collected nodes keep their pytest nodeid (the per-test run scope
 * key); a run row that REPLACES an already-run node inherits the
 * collected nodeid so the row's run action survives re-runs.
 *
 * Pure + module-scope so it is cheap to memoize and unit-testable.
 */
export function buildTestTree(
    collected: CollectedTestEntry[] | undefined,
    runRows: TestReportEntry[] | undefined
): TreeFile[] {
    const files = new Map<
        string,
        {
            fileSlug: string;
            folder?: string;
            folderName?: string;
            file?: string;
            entries: Map<string, TreeNode>;
        }
    >();
    const fileGroup = (
        fileSlug: string,
        folderName?: string,
        file?: string,
        folder?: string
    ) => {
        let g = files.get(fileSlug);
        if (!g) {
            g = {fileSlug, folderName, file, folder, entries: new Map()};
            files.set(fileSlug, g);
        } else {
            // First writer wins the display names (collected pass runs
            // first below); undefined fields keep whatever landed earlier.
            if (!g.folderName && folderName) g.folderName = folderName;
            if (!g.file && file) g.file = file;
            if (!g.folder && folder) g.folder = folder;
        }
        return g;
    };

    // 1) the collected tree — every node starts "notrun".
    for (const c of collected ?? []) {
        const fileSlug = c.fileSlug ?? c.nodeid ?? c.name;
        const g = fileGroup(fileSlug, c.folderName, c.file, c.folder);
        g.entries.set(c.name, {
            key: c.name,
            name: c.name,
            status: "notrun",
            folder: c.folder,
            fileSlug: c.fileSlug,
            nodeid: c.nodeid,
        });
    }

    // 2) overlay the run rows — a row lands on the collected node with
    // the same (fileSlug, name), or is appended as its own node.
    for (const t of runRows ?? []) {
        const fileSlug = t.fileSlug ?? t.name;
        const g = fileGroup(fileSlug, t.folderName, t.file, t.folder);
        const existing = g.entries.get(t.name);
        if (existing && existing.status === "notrun") {
            existing.status = t.status;
            existing.message = t.message;
            existing.line = t.line;
        } else {
            g.entries.set(t.name, {
                key: t.name,
                name: t.name,
                status: t.status,
                message: t.message,
                line: t.line,
                // Inherit the collected node's identity fields so a re-run row
                // keeps its run action + click-to-open target even after the
                // collected "notrun" node it first replaced.
                folder: t.folder ?? existing?.folder,
                fileSlug: t.fileSlug ?? existing?.fileSlug,
                nodeid: existing?.nodeid,
            });
        }
    }

    return [...files.values()].map((g) => ({
        fileSlug: g.fileSlug,
        folder: g.folder,
        folderName: g.folderName,
        file: g.file,
        entries: [...g.entries.values()],
    }));
}

/**
 * Overlay newer scoped-run rows (a single test / a single file run
 * from a tree row action) over older ones, keyed by (fileSlug, name):
 * consecutive single-test runs each update their own row while the
 * EARLIER overlays survive, and a later run of the same test/file
 * replaces its own previous rows. Pure — module scope, unit-tested.
 */
export function mergeScopedRows(
    prev: TestReportEntry[],
    next: TestReportEntry[]
): TestReportEntry[] {
    if (next.length === 0) return prev;
    const fresh = new Set(
        next.map((t) => `${t.fileSlug ?? ""}::${t.name}`)
    );
    return [
        ...prev.filter(
            (t) => !fresh.has(`${t.fileSlug ?? ""}::${t.name}`)
        ),
        ...next,
    ];
}

/* ================================================================== */
/*  Watch-mode internals (item G24)                                    */
/* ================================================================== */

/** Matches /api/test's own discovery cap — never fetch more sources. */
const MAX_WATCH_TEST_FILES = 60;

/**
 * SAVE SIGNAL contract — how the panel learns a file was saved:
 *
 *  1. `praxis:file-saved` (PRIMARY, dispatched by the HOST): the page
 *     / editor dispatches it after every successful write with
 *     `detail: { fileName?, file?, fileSlug?, folder? }`. The panel
 *     reads `fileName ?? file ?? fileSlug` and only reacts to
 *     `*.py` / `*.pyw`.
 *
 *  2. FALLBACK — the existing watcher path, no host wiring needed:
 *     the panel opens its OWN /api/watch-dir SSE stream (the same
 *     endpoint the Explorer auto-refresh uses; the server already
 *     debounces 800 ms and reconnect-caps at 10 min). On each
 *     `{type:"changed"}` it re-fetches /api/folders and DIFFS the
 *     python files' mtimes against its snapshot — only files whose
 *     mtime advanced (or that are new) trigger a watched rerun, so a
 *     .csv import or image write never fires the suite.
 *
 *  3. `praxis:refresh-folders` (post-mutation refreshes) is treated
 *     exactly like (2): mtime-diff, then rerun the affected tests.
 *
 * Every signal funnels into `WatchRunner.notifySave(file)` which
 * debounces bursts (800 ms) and unions the affected test files into
 * ONE scoped run.
 */

/** A python file discovered via GET /api/folders. */
interface WatchFolderFile {
    folder: string;
    folderName: string;
    file: string;
    fileSlug: string;
    mtime: number;
}

/** The slice of /api/folders' response the watch engine reads. */
interface FoldersResponse {
    folders?: Array<{
        slug?: string;
        name?: string;
        files?: Array<{
            name?: string;
            slug?: string;
            mtime?: number;
            kind?: string;
        }>;
    }>;
}

/** Fetch one test file's source into the import-analysis map. */
const fetchTestSource = async (entry: WatchFolderFile): Promise<void> => {
    try {
        const res = await fetch(
            `/api/file?folder=${encodeURIComponent(entry.folder)}&file=${encodeURIComponent(entry.fileSlug)}`,
            {cache: "no-store"}
        );
        if (!res.ok) return;
        watchSources.set(entry.file, await res.text());
    } catch {
        /* offline — the stale source keeps the analysis conservative */
    }
};

/**
 * The import-analysis source map lives at module scope so the runner's
 * `affected` resolver (created inside an effect) always reads the LIVE
 * map without re-subscribing. Keyed by test-file NAME — the same keys
 * `affectedTestFiles` matches on. Only the (single) Tests panel writes
 * it, only while watch mode is armed.
 */
const watchSources = new Map<string, string>();

/**
 * Map the panel's own /api/test response (TestReportData) into the
 * watch engine's TestRunResult, SCOPED to the affected files. The
 * route currently ignores the per-file `folder`/`file` payload keys
 * (it runs every test file), so the scoping happens here: entries
 * whose fileSlug or file NAME is in the scope set are kept, everything
 * else is dropped. When the route grows a real path filter this
 * mapping becomes a pass-through.
 */
const summaryFromReport = (
    data: TestReportData,
    scope: string[]
): TestRunResult => {
    const inScope = new Set(scope);
    const all = data.tests ?? [];
    const scoped =
        scope.length > 0
            ? all.filter((t) => inScope.has(t.fileSlug ?? "") || inScope.has(t.file ?? ""))
            : all;

    const perFile: Record<string, { passed: number; failed: number }> = {};
    const perTest: WatchTestEntry[] = [];
    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const t of scoped) {
        const key = t.fileSlug ?? t.file ?? t.name;
        const agg = perFile[key] ?? (perFile[key] = {passed: 0, failed: 0});
        if (t.status === "passed") {
            passed++;
            agg.passed++;
        } else if (t.status === "failed") {
            failed++;
            agg.failed++;
        } else if (t.status === "error") {
            errors++;
            agg.failed++;
        }
        // skipped tests stay in `total` but carry no gutter mark
        if (t.status === "passed" || t.status === "failed" || t.status === "error") {
            perTest.push({
                id: `${key}::${t.name}`,
                file: t.file ?? key,
                name: t.name,
                status: t.status,
                fileSlug: t.fileSlug,
                folder: t.folder,
                line: t.line,
            });
        }
    }

    return {
        total: scoped.length,
        passed,
        failed,
        errors,
        durationMs: data.durationMs ?? 0,
        perFile,
        perTest,
    };
};

/**
 * Persistent test report panel (Run all tests) + pytest WATCH MODE.
 *
 * The report side is unchanged: summary chips, per-test ✔/✗ rows,
 * failure messages, one-click jump to the failing line.
 *
 * PRE-COLLECTION: on mount (and whenever the ACTIVE PROJECT changes —
 * folder-tree's `praxis:project-switched` event) the panel fires ONE
 * /api/test/collect pass (`pytest --collect-only -q` with the same
 * scope honoring as the real run) and renders the discovered tree
 * BEFORE anything has run, every node marked "not run". Real runs
 * (this panel's Run tests button, watch mode, the explorer) overlay
 * their pass/fail/skip states onto the very same nodes. The pass is
 * cheap (a single subprocess), never blocks the panel (skeleton
 * rows while it is in flight), and is SKIPPED SILENTLY when pytest
 * is not installed (the server answers `available: false` and the
 * panel keeps its plain empty state).
 *
 * Watch mode (G24): the header's eye switch (persisted as the
 * `testWatchOnSave` setting) re-runs the test files AFFECTED by each
 * saved Python file — the saved test file itself, or the test files
 * whose imports reference the changed module — through the panel's
 * existing /api/test call. Results land in the module-level watch
 * store (src/lib/watch-tests.ts) for the editor gutter marks + the
 * footer TestStatusBadge; a "watching" chip + spinner + last-run
 * summary live in this header.
 */
export function TestsPanel({
                               report,
                               onRun,
                               onRunWithCoverage,
                               onOpenFile,
                               folderSlug,
                               fileSlug,
                               fileName,
                               code,
                               onInsertTest,
                               hypothesisEnabled = true,
                           }: TestsPanelProps) {
    const [collapsedFiles, setCollapsedFiles] = React.useState<Set<string>>(new Set());

    /* ── "Generate Property Tests…" from the editor's right-click Inspect
       ▸ menu — the page opens this panel (bottom tab "tests") and
       dispatches praxis:open-hypothesis; here we expand the Property
       tests <details> and scroll it into view. */
    const hypothesisSectionRef = React.useRef<HTMLDetailsElement | null>(null);
    React.useEffect(() => {
        const onOpen = () => {
            const el = hypothesisSectionRef.current;
            if (!el) return;
            el.open = true;
            el.scrollIntoView({block: "nearest", behavior: "smooth"});
        };
        window.addEventListener("praxis:open-hypothesis", onOpen);
        return () => window.removeEventListener("praxis:open-hypothesis", onOpen);
    }, []);

    /* ── watch mode state ─────────────────────────────────────────── */
    /** The persisted toggle (synced from localStorage + settings-saved). */
    const [watchOn, setWatchOn] = React.useState(false);
    /** Mirror of the runner's {running, lastResult, watchedAt}. */
    const [watchUi, setWatchUi] = React.useState<WatchRunnerState>({
        running: false,
        lastResult: null,
        watchedAt: 0,
    });

    const testFilesRef = React.useRef<WatchFolderFile[]>([]);
    const mtimeRef = React.useRef<Map<string, number>>(new Map());

    /* ── pre-collection state ───────────────────────────────────── */
    /** The tree pass: {loading, data}. `data.available === false`
     *  (no pytest) renders NOTHING extra — silent skip by design. */
    const [collectUi, setCollectUi] = React.useState<{
        loading: boolean;
        data: CollectData | null;
    }>({loading: false, data: null});
    /** Latest in-flight collect request — a newer pass aborts the
     *  previous one so a stale response can never overwrite a fresh
     *  tree (same pattern as LocalHistoryPanel's list refresh). */
    const collectAbortRef = React.useRef<AbortController | null>(null);

    /**
     * Fire one pre-collection pass (POST /api/test/collect with the
     * configured interpreter — the same body the watch-mode runner
     * sends to /api/test). Mount/refresh/project-switch all funnel
     * through here; each call REPLACES the in-flight one. Returns the
     * AbortController so a caller's cleanup can cancel its own pass.
     */
    const runCollectPass = React.useCallback((): AbortController => {
        collectAbortRef.current?.abort();
        const controller = new AbortController();
        collectAbortRef.current = controller;
        setCollectUi((c) => ({...c, loading: true}));
        const interpreter = loadSettings().pythonInterpreter || undefined;
        fetch("/api/test/collect", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({interpreter}),
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (res) => {
                const data = (await res.json()) as CollectData;
                if (!res.ok) {
                    throw new Error(
                        (data as { error?: string }).error ?? `HTTP ${res.status}`
                    );
                }
                if (!controller.signal.aborted) setCollectUi({loading: false, data});
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return; // superseded by a newer pass
                setCollectUi({loading: false, data: {error: err.message}});
            });
        return controller;
    }, []);

    /**
     * ONE pass on mount + a re-pass whenever the ACTIVE PROJECT
     * switches (folder-tree dispatches `praxis:project-switched` after
     * /api/projects lands the new root — the tree belongs to whichever
     * project is open). StrictMode's double-mount is handled by the
     * abort-and-replace above; no per-keystroke work ever happens here.
     */
    React.useEffect(() => {
        const controller = runCollectPass();
        const onProjectSwitched = () => runCollectPass();
        window.addEventListener("praxis:project-switched", onProjectSwitched);
        return () => {
            window.removeEventListener("praxis:project-switched", onProjectSwitched);
            controller.abort();
            collectAbortRef.current?.abort();
        };
    }, [runCollectPass]);

    /* ── scoped single-test / single-file runs (tree row actions) ── */

    /**
     * The panel's OWN run machinery for the row actions — it fetches
     * /api/test directly (the same route the Run-tests button, the
     * explorer's "Run pytest" and the watch runner use) with the node's
     * folder/file scope keys, plus `nodeids` for a single test. The
     * response is the SAME TestReportData shape, so results render
     * through the panel's existing paths: the summary chips read the
     * scoped summary (the LAST completed run — page-level or scoped —
     * wins, see viewData below) and the tree rows overlay the scoped
     * entries onto the very collected nodes that were clicked.
     */
    const [scopedRows, setScopedRows] = React.useState<TestReportEntry[]>([]);
    /** Summary of the LAST completed scoped run (subset report). */
    const [scopedSummary, setScopedSummary] = React.useState<TestReportData | null>(null);
    /** True while a scoped run is in flight (the row's play → spinner). */
    const [scopedLoading, setScopedLoading] = React.useState(false);
    /** The in-flight run's key — the nodeid (single test) or fileSlug
     *  (whole file/module) whose row shows the spinner. */
    const [scopedRunKey, setScopedRunKey] = React.useState<string | null>(null);
    /** Latest in-flight scoped request — a newer one aborts the previous
     *  so a stale response can never overwrite a fresh row state (the
     *  same pattern runCollectPass uses). */
    const scopedAbortRef = React.useRef<AbortController | null>(null);

    /**
     * Fire ONE scoped run. `nodeids` present → pytest runs exactly those
     * tests (route-side scope guard: the id must belong to the requested
     * folder/file scope); absent → the whole file/module, exactly the
     * explorer's per-file "Run pytest" semantics. Errors land in the
     * scoped summary as {error} — rendered through the same red error
     * line the page-level report uses.
     */
    const runScopedTests = React.useCallback(
        (opts: {
            folder?: string;
            file?: string;
            nodeids?: string[];
            /** Row key whose play button flips to a spinner. */
            runKey: string;
        }): void => {
            scopedAbortRef.current?.abort();
            const controller = new AbortController();
            scopedAbortRef.current = controller;
            setScopedLoading(true);
            setScopedRunKey(opts.runKey);
            const interpreter = loadSettings().pythonInterpreter || undefined;
            const body: Record<string, unknown> = {interpreter};
            if (opts.folder) body.folder = opts.folder;
            if (opts.file) body.file = opts.file;
            if (opts.nodeids && opts.nodeids.length > 0) body.nodeids = opts.nodeids;
            fetch("/api/test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
                signal: controller.signal,
                cache: "no-store",
            })
                .then(async (res) => {
                    const data = (await res
                        .json()
                        .catch(() => ({}))) as TestReportData;
                    if (controller.signal.aborted) return; // superseded run
                    if (!res.ok) {
                        setScopedSummary({error: data.error ?? `HTTP ${res.status}`});
                    } else {
                        setScopedSummary(data);
                        // Overlay the subset report's rows onto the tree — each
                        // scoped run updates its own rows while earlier scoped
                        // rows survive (mergeScopedRows dedupes by file+name).
                        if (data.tests && data.tests.length > 0) {
                            setScopedRows((prev) => mergeScopedRows(prev, data.tests!));
                        }
                    }
                    setScopedLoading(false);
                    setScopedRunKey(null);
                })
                .catch((err: Error) => {
                    if (err.name === "AbortError") return; // superseded run
                    if (controller.signal.aborted) return;
                    setScopedSummary({error: err.message});
                    setScopedLoading(false);
                    setScopedRunKey(null);
                });
        },
        []
    );

    /** Abort any in-flight scoped run on unmount. */
    React.useEffect(() => {
        return () => scopedAbortRef.current?.abort();
    }, []);

    /** Run this single test — the leaf row's hover play action. */
    const runSingleNode = React.useCallback(
        (node: { folder?: string; fileSlug?: string; nodeid?: string }): void => {
            if (!node.nodeid || !node.folder || !node.fileSlug) return;
            runScopedTests({
                folder: node.folder,
                file: node.fileSlug,
                nodeids: [node.nodeid],
                runKey: node.nodeid,
            });
        },
        [runScopedTests]
    );

    /** Run this whole file/module — the file group row's play action. */
    const runSingleFile = React.useCallback(
        (file: { folder?: string; fileSlug: string }): void => {
            if (!file.folder) return;
            runScopedTests({
                folder: file.folder,
                file: file.fileSlug,
                runKey: file.fileSlug,
            });
        },
        [runScopedTests]
    );

    /**
     * A page-level whole run supersedes the scoped runs: when it STARTS
     * the scoped chips/rows clear (the "Running tests…" state takes
     * over), and when its data LANDS the fresh whole-run statuses
     * replace the scoped overlays (a scoped row must never keep
     * overriding a NEWER whole-run row).
     */
    const pageDataRef = React.useRef<TestReportData | null>(null);
    React.useEffect(() => {
        if (report?.loading) {
            scopedAbortRef.current?.abort();
            setScopedLoading(false);
            setScopedRunKey(null);
            setScopedSummary(null);
            return;
        }
        const landed = report?.data ?? null;
        if (landed && landed !== pageDataRef.current) {
            pageDataRef.current = landed;
            setScopedRows([]);
            setScopedSummary(null);
        }
    }, [report]);

    /** Read + follow the persisted setting. */
    React.useEffect(() => {
        const read = () => setWatchOn(loadSettings().testWatchOnSave === true);
        read();
        window.addEventListener("praxis:settings-saved", read);
        return () => window.removeEventListener("praxis:settings-saved", read);
    }, []);

    /** Toggle handler — persist + broadcast so the Settings dialog's
     *  "Watch tests on save" row (and the host) stay in sync. */
    const toggleWatch = (v: boolean): void => {
        setWatchOn(v);
        const s = loadSettings();
        if (s.testWatchOnSave !== v) {
            saveSettings({...s, testWatchOnSave: v});
            window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
        }
    };

    /**
     * Re-fetch /api/folders and diff python mtimes against the snapshot.
     * `notify: false` is the bootstrap pass (every file looks "new" the
     * first time — that must NOT fire the suite); later passes notify
     * the runner for every file whose mtime advanced or that appeared.
     * Also refreshes the import-analysis sources of changed test files.
     */
    const syncWatchData = React.useCallback(
        async (opts: { notify: boolean; runner: WatchRunner | null }): Promise<void> => {
            try {
                const res = await fetch("/api/folders", {cache: "no-store"});
                if (!res.ok) return;
                const data = (await res.json()) as FoldersResponse;

                const pyFiles: WatchFolderFile[] = [];
                for (const folder of data.folders ?? []) {
                    if (!folder?.slug) continue;
                    for (const f of folder.files ?? []) {
                        if (!f?.name || !f.slug) continue;
                        if (!/\.pyw?$/i.test(f.name) && f.kind !== "python") continue;
                        pyFiles.push({
                            folder: folder.slug,
                            folderName: folder.name ?? folder.slug,
                            file: f.name,
                            fileSlug: f.slug,
                            mtime: f.mtime ?? 0,
                        });
                    }
                }

                const changed: string[] = [];
                for (const p of pyFiles) {
                    const prev = mtimeRef.current.get(`${p.folder}/${p.fileSlug}`);
                    if (prev === undefined || p.mtime > prev) changed.push(p.file);
                }

                const nextMtime = new Map<string, number>();
                for (const p of pyFiles) nextMtime.set(`${p.folder}/${p.fileSlug}`, p.mtime);
                mtimeRef.current = nextMtime;
                testFilesRef.current = pyFiles.filter((p) => isTestFileName(p.file));

                // Keep the import-analysis sources fresh: changed test files
                // (and any the map hasn't seen yet) re-fetch their content.
                const changedSet = new Set(changed);
                await Promise.all(
                    testFilesRef.current
                        .filter((p) => changedSet.has(p.file) || !watchSources.has(p.file))
                        .slice(0, MAX_WATCH_TEST_FILES)
                        .map(fetchTestSource)
                );

                if (opts.notify) {
                    for (const name of changed) opts.runner?.notifySave(name);
                }
            } catch {
                /* offline — keep the previous snapshot */
            }
        },
        []
    );

    /* ── the watch effect: runner + save signals + SSE fallback ───── */
    React.useEffect(() => {
        if (!watchOn) return;
        const runner = new WatchRunner();
        runner.subscribe(setWatchUi);
        runner.start({
            debounceMs: WATCH_DEBOUNCE_MS,

            /** The panel's EXISTING run machinery: POST /api/test (the same
             *  route the Run-tests button + the explorer's per-file "Run
             *  pytest" use), payload `{interpreter, folder?, file?}` — the
             *  per-file keys keep folder-tree's call shape so a route-side
             *  filter lands for free. The response is scoped client-side to
             *  the affected files (see summaryFromReport). */
            runTests: async (files: string[]): Promise<TestRunResult> => {
                const interpreter = loadSettings().pythonInterpreter || undefined;
                const single =
                    files.length === 1
                        ? testFilesRef.current.find(
                            (t) => t.fileSlug === files[0] || t.file === files[0]
                        )
                        : undefined;
                const body: Record<string, unknown> = {interpreter};
                if (single) {
                    body.folder = single.folder;
                    body.file = single.fileSlug;
                }
                const res = await fetch("/api/test", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                });
                const data = (await res.json().catch(() => ({}))) as TestReportData;
                if (!res.ok) {
                    return {
                        total: 0,
                        passed: 0,
                        failed: 0,
                        errors: 0,
                        durationMs: 0,
                        perFile: {},
                        perTest: [],
                        error: data.error ?? `HTTP ${res.status}`,
                    };
                }
                return summaryFromReport(data, files);
            },

            /** changed file → affected TEST files (slugs), via the pure
             *  affectedTestFiles resolver over the live source map. */
            affected: (changed: string): string[] => {
                const testFiles = testFilesRef.current;
                if (testFiles.length === 0) {
                    return isTestFileName(changed) ? [changed] : [];
                }
                const names = testFiles.map((t) => t.file);
                const affectedNames = affectedTestFiles(changed, names, watchSources);
                const out: string[] = [];
                const seen = new Set<string>();
                for (const n of affectedNames) {
                    for (const t of testFiles) {
                        if (t.file !== n || seen.has(t.fileSlug)) continue;
                        seen.add(t.fileSlug);
                        out.push(t.fileSlug);
                    }
                }
                // A just-created test file the snapshot hasn't seen yet — run
                // it by NAME (the response is matched by name as well).
                if (
                    out.length === 0 &&
                    isTestFileName(changed) &&
                    !testFiles.some((t) => t.file === changed)
                ) {
                    return [changed];
                }
                return out;
            },
        });

        // Bootstrap the snapshot WITHOUT firing a run.
        void syncWatchData({notify: false, runner});

        // 1. PRIMARY save signal — dispatched by the host after saves:
        //    detail: { fileName?, file?, fileSlug?, folder? }.
        const onFileSaved = (e: Event) => {
            const d = (e as CustomEvent).detail as
                | { fileName?: string; file?: string; fileSlug?: string }
                | undefined;
            const name = d?.fileName ?? d?.file ?? d?.fileSlug;
            if (!name || !/\.pyw?$/i.test(name)) return;
            runner.notifySave(name);
            if (isTestFileName(name)) {
                const entry = testFilesRef.current.find((t) => t.file === name);
                if (entry) void fetchTestSource(entry);
            }
        };
        // 3. Post-mutation refresh signal → mtime-diff → affected rerun.
        const onRefreshFolders = () => void syncWatchData({notify: true, runner});
        window.addEventListener("praxis:file-saved", onFileSaved);
        window.addEventListener("praxis:refresh-folders", onRefreshFolders);

        // 2. FALLBACK — the panel's own /api/watch-dir SSE stream (the
        //    existing watcher path; server-debounced 800 ms, capped at
        //    10 min → the loop reconnects with a small backoff, mirroring
        //    the page's own dir-watcher reconnect pattern).
        const controller = new AbortController();
        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, ms);
            });
        void (async () => {
            while (!controller.signal.aborted) {
                try {
                    const res = await fetch("/api/watch-dir", {
                        method: "POST",
                        signal: controller.signal,
                    });
                    if (!res.ok || !res.body) {
                        await sleep(2000);
                        continue;
                    }
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, {stream: true});
                        const parts = buffer.split("\n\n");
                        buffer = parts.pop() ?? "";
                        for (const part of parts) {
                            for (const line of part.split("\n")) {
                                if (!line.startsWith("data: ")) continue;
                                try {
                                    const evt = JSON.parse(line.slice(6)) as { type?: string };
                                    if (evt.type === "changed") {
                                        void syncWatchData({notify: true, runner});
                                    }
                                    // "timeout" → the server closed after its cap; the
                                    // outer loop reconnects below.
                                } catch {
                                    /* ignore malformed frames */
                                }
                            }
                        }
                    }
                    await sleep(1500); // stream ended — reconnect
                } catch {
                    if (controller.signal.aborted) break;
                    await sleep(2000);
                }
            }
        })();

        return () => {
            window.removeEventListener("praxis:file-saved", onFileSaved);
            window.removeEventListener("praxis:refresh-folders", onRefreshFolders);
            controller.abort();
            runner.stop();
        };
    }, [watchOn, syncWatchData]);

    const data = report?.data ?? null;

    // The report the RESULTS view renders: the LAST completed run — a
    // scoped single-test/single-file run (tree row action) while it is
    // the newest, the page-level whole-run report otherwise (the
    // supersede effect above keeps this from ever going stale).
    const viewData = scopedSummary ?? data ?? null;

    // The merged tree: collected nodes ("notrun") + the real-run rows
    // overlaid — page-level rows first, scoped row-action rows LAST so
    // the newest scoped statuses win for their own nodes — recomputed
    // ONLY when a source changes (memoized, no per-keystroke work; the
    // collection pass runs on mount / project switch / refresh only).
    const treeFiles = React.useMemo(
        () =>
            buildTestTree(
                collectUi.data && collectUi.data.available !== false
                    ? collectUi.data.tests
                    : undefined,
                [...(data?.tests ?? []), ...scopedRows]
            ),
        [collectUi.data, data, scopedRows]
    );
    /** Node count of the pre-collected tree (0 = nothing collected —
     *  collection unavailable, no test files, or the pass failed). */
    const collectedCount = React.useMemo(
        () =>
            collectUi.data && collectUi.data.available !== false
                ? (collectUi.data.tests?.length ?? 0)
                : 0,
        [collectUi.data]
    );

    const toggleFile = (key: string) => {
        setCollapsedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const lastWatch = watchUi.lastResult;
    const watchFailing = lastWatch ? lastWatch.failed + lastWatch.errors : 0;
    const watchTitle = lastWatch
        ? `Watched run · ${(lastWatch.durationMs / 1000).toFixed(2)}s · ${new Date(
            watchUi.watchedAt
        ).toLocaleTimeString()}`
        : "";

    /** THE tree render — one shared JSX element used by BOTH the
     *  pre-collected view (all nodes "not run") and the post-run view
     *  (statuses overlaid), so a run always fills in the very tree the
     *  collection rendered, never a second parallel list.
     *
     *  Every row also carries its run action (hover Play): leaf rows run
     *  their single pytest nodeid, file group rows run the whole
     *  module — both through the panel's own /api/test machinery, so
     *  the results land in THIS tree (rows + summary chips). */
    const treeRows = (
        <div className="space-y-1">
            {treeFiles.map((f) => {
                const isCollapsed = collapsedFiles.has(f.fileSlug);
                const failedCount = f.entries.filter(
                    (t) => t.status === "failed" || t.status === "error"
                ).length;
                const ranCount = f.entries.filter((t) => t.status !== "notrun").length;
                const fileRunning = scopedLoading && scopedRunKey === f.fileSlug;
                return (
                    <div key={f.fileSlug} className="rounded-md border overflow-hidden group/file">
                        <div
                            className={cn(
                                "flex items-center",
                                failedCount > 0
                                    ? "bg-red-500/5"
                                    : ranCount > 0
                                        ? "bg-emerald-500/5"
                                        : undefined
                            )}
                        >
                            <button
                                onClick={() => toggleFile(f.fileSlug)}
                                className="flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/40"
                                aria-expanded={!isCollapsed}
                            >
                                {isCollapsed ? (
                                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0"/>
                                ) : (
                                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0"/>
                                )}
                                <span className="font-mono text-[11px] truncate flex-1">
                  {f.folderName ? `${f.folderName} › ` : ""}
                                    {f.file ?? f.fileSlug}
                </span>
                                <span
                                    className="text-[10px] tabular-nums text-muted-foreground shrink-0"
                                    title={`${ranCount} of ${f.entries.length} node(s) reached by runs`}
                                >
                  {ranCount}/{f.entries.length}
                </span>
                            </button>
                            {f.folder && (
                                <button
                                    type="button"
                                    onClick={() => runSingleFile({folder: f.folder, fileSlug: f.fileSlug})}
                                    disabled={scopedLoading}
                                    className="shrink-0 mr-1.5 rounded p-1 text-muted-foreground opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground disabled:opacity-40 transition-opacity"
                                    title={`Run every test in ${f.file ?? f.fileSlug} (pytest — file scope)`}
                                    aria-label={`Run every test in ${f.file ?? f.fileSlug}`}
                                >
                                    {fileRunning ? (
                                        <Loader2 className="size-3.5 animate-spin"/>
                                    ) : (
                                        <Play className="size-3.5"/>
                                    )}
                                </button>
                            )}
                        </div>
                        {!isCollapsed &&
                            f.entries.map((t) => {
                                const nodeRunning = scopedLoading && scopedRunKey === t.nodeid;
                                return (
                                    <div
                                        key={t.name}
                                        className={cn(
                                            "flex items-start border-t group/test",
                                            (t.status === "failed" || t.status === "error") &&
                                            "bg-red-500/5"
                                        )}
                                    >
                                        <button
                                            onClick={() => {
                                                if (t.folder && t.fileSlug) {
                                                    onOpenFile(t.folder, t.fileSlug, t.line);
                                                }
                                            }}
                                            className="flex-1 min-w-0 flex items-start gap-2 px-3 py-1.5 text-left hover:bg-muted/40"
                                            title={
                                                t.status === "notrun"
                                                    ? `${t.name} — not run yet`
                                                    : (t.message ?? t.name)
                                            }
                                        >
                                            {STATUS_ICON[t.status] ?? STATUS_ICON.skipped}
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[11px] font-mono truncate">{t.name}</div>
                                                {t.message && (
                                                    <pre
                                                        className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-24 overflow-y-auto">
                            {t.message}
                          </pre>
                                                )}
                                            </div>
                                        </button>
                                        {t.nodeid && t.folder && t.fileSlug && (
                                            <button
                                                type="button"
                                                onClick={() => runSingleNode(t)}
                                                disabled={scopedLoading}
                                                className="shrink-0 mr-1.5 mt-0.5 rounded p-1 text-muted-foreground opacity-0 group-hover/test:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground disabled:opacity-40 transition-opacity"
                                                title={`Run this test only (pytest ${t.nodeid})`}
                                                aria-label={`Run ${t.name} only`}
                                            >
                                                {nodeRunning ? (
                                                    <Loader2 className="size-3.5 animate-spin"/>
                                                ) : (
                                                    <Play className="size-3.5"/>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden" data-tutorial="tests-panel">
            {/* ── Property tests (Hypothesis) — a collapsible section above
          the regular suite list: scaffold strategies from a function's
          signature, run with shrink sequences, promote counterexamples
          to pinned regression tests. */}
            {hypothesisEnabled && folderSlug && fileSlug && fileName && (
                <details ref={hypothesisSectionRef}
                         className="group border-b bg-muted/20 open:bg-muted/30 transition-colors shrink-0">
                    <summary
                        className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium cursor-pointer select-none">
                        <ChevronDown
                            className="size-3.5 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90"/>
                        Property tests
                        <span
                            className="ml-auto text-[10px] text-muted-foreground">Hypothesis · shrinks · regression</span>
                    </summary>
                    <div className="max-h-[45%] overflow-y-auto px-2 pb-2">
                        <HypothesisWorkbench
                            folderSlug={folderSlug}
                            fileSlug={fileSlug}
                            fileName={fileName}
                            code={code}
                            onInsertTest={(src) => onInsertTest?.(src)}
                        />
                    </div>
                </details>
            )}
            {/* Toolbar */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30 shrink-0 flex-wrap">
                <FlaskConical className="size-3.5 text-muted-foreground"/>
                <span className="text-xs font-medium">Tests</span>
                {viewData?.usedPytest === false && (
                    <span
                        className="text-[10px] text-amber-600 dark:text-amber-400"
                        title="pytest isn't installed — each test file was executed directly (whole-file pass/fail)."
                    >
            no pytest — file-level
          </span>
                )}

                {/* ── pre-collection chip: how many nodes the tree pass found.
            Hidden when zero (unavailable / empty project) so the
            toolbar stays exactly as quiet as before. */}
                {collectedCount > 0 && (
                    <span
                        className="text-[10px] tabular-nums text-muted-foreground"
                        title={`Pre-collected with pytest --collect-only${
                            typeof collectUi.data?.durationMs === "number"
                                ? ` in ${(collectUi.data.durationMs / 1000).toFixed(2)}s`
                                : ""
                        } — real runs fill in pass/fail on these nodes.`}
                    >
            {collectedCount} in tree
          </span>
                )}

                {/* ── scoped row-action run in flight: which test/file the
            hover play action is running right now (the row itself
            already shows its spinner; this stays visible when the
            row scrolls out of view). */}
                {scopedLoading && scopedRunKey && (
                    <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-mono max-w-48 truncate"
                        title={`Running ${scopedRunKey}`}
                    >
            <Loader2 className="size-3 animate-spin shrink-0"/>
            <span className="truncate">{scopedRunKey}</span>
          </span>
                )}

                {/* ── Watch on save (G24) ── eye toggle + status chips ──── */}
                <div className="flex items-center gap-1.5 ml-1">
                    <button
                        type="button"
                        onClick={() => toggleWatch(!watchOn)}
                        aria-pressed={watchOn}
                        className={cn(
                            "flex items-center gap-1 text-[10px] transition-colors",
                            watchOn
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                        title={
                            watchOn
                                ? "Watch on save is ON — the test files affected by each Python save re-run automatically (debounced 800 ms). Click to stop watching."
                                : "Watch on save — re-run the test files affected by every Python save (the saved test file, or tests that import the changed module). Click to start watching."
                        }
                    >
                        <Eye className="size-3.5"/>
                        <span className="hidden sm:inline">Watch on save</span>
                    </button>
                    <Switch
                        checked={watchOn}
                        onCheckedChange={toggleWatch}
                        className="scale-90"
                        aria-label="Watch tests on save"
                    />
                    {watchOn && (
                        <>
                            {watchUi.running ? (
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]"
                                    title="Re-running the affected tests…"
                                >
                  <Loader2 className="size-3 animate-spin"/>
                  running…
                </span>
                            ) : (
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]"
                                    title="Watching for Python saves · mtime diff via /api/watch-dir (debounced)"
                                >
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                  watching
                </span>
                            )}
                            {lastWatch && !lastWatch.error && (
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums",
                                        watchFailing > 0
                                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    )}
                                    title={watchTitle}
                                >
                  {watchFailing > 0 ? (
                      <CircleX className="size-3"/>
                  ) : (
                      <CheckCircle2 className="size-3"/>
                  )}
                                    {lastWatch.passed}/{lastWatch.total}
                </span>
                            )}
                            {lastWatch?.error && (
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-[10px]"
                                    title={`${watchTitle} — ${lastWatch.error}`}
                                >
                  <CircleX className="size-3"/>
                  run failed
                </span>
                            )}
                        </>
                    )}
                </div>

                <div className="flex-1"/>
                {/* ── pre-collection refresh: re-run the (cheap) collect-only
            pass — e.g. after creating a test file — WITHOUT running
            anything. */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={runCollectPass}
                    disabled={collectUi.loading}
                    className="h-6 px-2 gap-1 text-[10px]"
                    title="Re-scan the test tree without running anything (pytest --collect-only)"
                >
                    <RefreshCw
                        className={cn("size-3", collectUi.loading && "animate-spin")}
                    />
                    <span className="hidden sm:inline">Refresh tree</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRun}
                    disabled={report?.loading}
                    className="h-6 px-2 gap-1 text-[10px]"
                    title="Run every test_*.py / *_test.py file in the project"
                >
                    {report?.loading ? (
                        <Loader2 className="size-3 animate-spin"/>
                    ) : (
                        <Play className="size-3"/>
                    )}
                    Run tests
                </Button>
                {/* ── coverage run: the active file through the sys.settrace
            tracer — green/red per-line gutter marks land in the
            editor and the breakdown opens in Output ▸ Coverage. */}
                {onRunWithCoverage && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRunWithCoverage}
                        disabled={report?.loading}
                        className="h-6 px-2 gap-1 text-[10px]"
                        title="Run the active python file with coverage — per-line gutter marks (covered / uncovered) plus the Coverage tab in the Output panel"
                    >
                        <PieChartIcon className="size-3"/>
                        <span className="hidden sm:inline">Run with coverage</span>
                    </Button>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto text-xs">
                {/* ── pre-collection skeleton: ONE cheap subprocess in flight;
            the panel stays fully interactive (Run tests / watch mode
            / property tests all work the whole time). */}
                {collectUi.loading && !collectUi.data && !viewData && (
                    <div
                        className="p-2 space-y-1"
                        aria-busy="true"
                        aria-label="Collecting the test tree"
                    >
                        <div className="flex items-center gap-2 px-1 py-1 text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin"/>
                            <span>Collecting test tree…</span>
                            <span className="ml-auto text-[10px]">pytest --collect-only</span>
                        </div>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className="h-7 rounded-md border bg-muted/30 animate-pulse"
                                style={{animationDelay: `${i * 120}ms`, opacity: 1 - i * 0.16}}
                            />
                        ))}
                    </div>
                )}

                {/* soft collection error (import errors inside a test file…):
            never an HTTP error — the healthy files' nodes still render
            below; full detail on the title. */}
                {collectUi.data?.error && !viewData && (
                    <p
                        className="px-3 py-1.5 text-[10px] text-amber-600 dark:text-amber-400"
                        title={collectUi.data.error}
                    >
                        collection: {collectUi.data.error.split("\n")[0]}
                    </p>
                )}

                {/* ── the PRE-COLLECTED tree — BEFORE any run: every discovered
            node marked "not run"; clicking a node opens its file. */}
                {!viewData && collectedCount > 0 && (
                    <div className="space-y-2 p-2">
                        <p className="text-[11px] text-muted-foreground text-center">
                            {collectedCount} test{collectedCount === 1 ? "" : "s"} discovered —
                            not run yet
                            {typeof collectUi.data?.durationMs === "number" &&
                                collectUi.data.durationMs > 0 &&
                                ` · collected in ${(collectUi.data.durationMs / 1000).toFixed(2)}s`}
                        </p>
                        {treeRows}
                    </div>
                )}

                {/* nothing collected and nothing running — the panel's plain
            empty state (also covers pytest-missing: the silent skip). */}
                {!viewData && collectedCount === 0 && !collectUi.loading && !report?.loading && (
                    <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-muted-foreground">
                        <FlaskConical className="size-6 opacity-40"/>
                        <p className="text-xs">No test run yet.</p>
                        <p className="text-[10px]">
                            Click Run tests to execute every test_*.py / *_test.py file.
                        </p>
                    </div>
                )}
                {report?.loading && !viewData && (
                    <div className="flex items-center gap-2 px-3 py-3 text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin"/> Running tests…
                    </div>
                )}
                {viewData?.error && (
                    <p className="px-3 py-2 text-red-600 dark:text-red-400">{viewData.error}</p>
                )}
                {viewData && !viewData.error && (
                    <div className="space-y-2 p-2">
                        {/* Summary chips — the LAST completed run's report (a
                scoped single-test run included: a subset report). */}
                        <div className="grid grid-cols-5 gap-1.5 text-center">
                            {[
                                {label: "Total", value: viewData.total ?? 0, cls: "text-foreground"},
                                {
                                    label: "Passed",
                                    value: viewData.passed ?? 0,
                                    cls: "text-emerald-600 dark:text-emerald-400"
                                },
                                {label: "Failed", value: viewData.failed ?? 0, cls: "text-red-600 dark:text-red-400"},
                                {
                                    label: "Errors",
                                    value: viewData.errors ?? 0,
                                    cls: "text-orange-600 dark:text-orange-400"
                                },
                                {label: "Skipped", value: viewData.skipped ?? 0, cls: "text-muted-foreground"},
                            ].map((s) => (
                                <div key={s.label} className="rounded-md border bg-muted/30 py-1.5">
                                    <div className={cn("text-lg font-semibold tabular-nums", s.cls)}>
                                        {s.value}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {s.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {typeof viewData.durationMs === "number" && viewData.durationMs > 0 && (
                            <p className="text-[11px] text-muted-foreground text-center">
                                Finished in {(viewData.durationMs / 1000).toFixed(2)}s
                            </p>
                        )}

                        {/* The merged tree: pre-collected nodes + this run's rows
                overlaid onto the same nodes (not-run nodes stay
                visible so a scoped run never hides the rest). */}
                        {treeFiles.length > 0 ? (
                            treeRows
                        ) : (
                            <p className="text-xs text-muted-foreground px-1">
                                {viewData.raw
                                    ? String(viewData.raw).slice(0, 600)
                                    : "No tests were discovered in the project."}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
