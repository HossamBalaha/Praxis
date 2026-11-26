import type {ChildProcess} from "node:child_process";
import type {Writable} from "node:stream";

/**
 * In-process registry of running Python child processes, keyed by runId.
 *
 * Stored on `globalThis` so it survives module reloads in dev mode
 * (Turbopack creates a new module instance for each route on every
 * code change, which would otherwise reset the Map and make the stop
 * endpoint unable to find running children).
 */

export interface RunMeta {
    /** What is running — display info for the run queue. */
    label: string;
    kind: "run" | "run-all" | "debug" | "test" | "profile";
    startedAt: number;
    pid?: number;
    interpreter?: string;
}

interface RunRegistry {
    children: Map<string, ChildProcess>;
    stopRequested: Set<string>;
    /** — display metadata for the Run Queue (keyed by runId). */
    meta: Map<string, RunMeta>;
    /**
     * open stdin streams of runs started with
     * `interactive: true`, so /api/run-input can feed input calls
     * while the script is streaming. Entries are removed by the run
     * route's finalize/cancel paths.
     */
    openStdins: Map<string, Writable>;
    /**
     * interactive runs' hard-kill TIMER resetters, keyed by
     * runId. Each /api/run-input write calls the resetter, re-arming the
     * run's timeout so a script waiting at input is never killed
     * mid-conversation by the idle-timeout (an abandoned session is
     * still reaped once the user stops answering for a full window).
     */
    stdinTimeoutResets: Map<string, () => void>;
}

const GLOBAL_KEY = "__statcomp_run_registry__";

function getRegistry(): RunRegistry {
    const g = globalThis as unknown as { [k: string]: unknown };
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {
            children: new Map<string, ChildProcess>(),
            stopRequested: new Set<string>(),
            meta: new Map<string, RunMeta>(),
            openStdins: new Map<string, Writable>(),
            stdinTimeoutResets: new Map<string, () => void>(),
        };
    }
    /* the registry DELIBERATELY survives module reloads on
        globalThis — which means a dev-mode server can still be holding an
        object created by an OLDER build of this module. Backfill any
        key a newer shape expects, or the run route would read `undefined`
        and crash on the first .set call (missing stdinTimeoutResets did
        exactly that). */
    const reg = g[GLOBAL_KEY] as RunRegistry;
    if (!reg.stdinTimeoutResets) reg.stdinTimeoutResets = new Map();
    return reg;
}

/** Map of runId → running child process. Shared across all routes. */
export const runningChildren = getRegistry().children;

/**
 * Set of runIds that the user has asked to stop. The run handler checks
 * this on `close` so it can report `killed: true` even when SIGTERM
 * lets the child exit cleanly with code 0.
 */
export const stopRequested = getRegistry().stopRequested;

/** — run display metadata (Run Queue panel). */
export const runMeta = getRegistry().meta;

/** — interactive runs' open stdin streams. */
export const openStdins = getRegistry().openStdins;

/** — interactive runs' timeout resetters (see RunRegistry). */
export const stdinTimeoutResets = getRegistry().stdinTimeoutResets;
