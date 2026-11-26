/**
 * Shared types for the TIME-TRAVEL execution trace (/api/time-travel).
 *
 * A TraceFile is what `sys.settrace` records for ONE full run of a
 * script: every line/call/return/exception event with a snapshot of
 * the locals (as short reprs), plus the stdout deltas interleaved by
 * event index — enough for the UI to step through a run forward AND
 * backward without re-running anything.
 */

export interface TraceEvent {
    /** 1-indexed source line the event happened on. */
    line: number;
    /** Which kind of step: line executed, function entered/exited, exception raised. */
    event: "line" | "call" | "return" | "exception";
    /** Locals snapshot: name → repr truncated to 80 chars. */
    locals: Record<string, string>;
    /** Enclosing function name (omitted for plain line events when unknown). */
    func?: string;
}

export interface TraceFile {
    /** Basename of the traced file. */
    fileName: string;
    /** Number of events in `events` (== events.length; echoed for convenience). */
    totalEvents: number;
    /** True when the recorder hit maxEvents and stopped recording early. */
    capped: boolean;
    /** stdout deltas keyed by "how many events had been recorded when this text appeared". */
    stdout: Array<{ afterEvent: number; text: string }>;
    events: TraceEvent[];
}

/** One locals diff entry — how a variable changed between two events. */
export interface LocalDiff {
    name: string;
    from?: string;
    to?: string;
    op: "added" | "removed" | "changed";
}

/**
 * Diff two locals snapshots (pure helper — no Node APIs, unit-testable).
 *
 * Ordering is deterministic: names are processed in `a`'s own key order
 * (changed / removed), then `b`'s key order for names that only exist
 * in `b` (added).
 */
export function diffLocals(
    a: Record<string, string>,
    b: Record<string, string>
): LocalDiff[] {
    const out: LocalDiff[] = [];
    for (const name of Object.keys(a)) {
        if (!(name in b)) {
            out.push({name, from: a[name], op: "removed"});
        } else if (a[name] !== b[name]) {
            out.push({name, from: a[name], to: b[name], op: "changed"});
        }
    }
    for (const name of Object.keys(b)) {
        if (!(name in a)) {
            out.push({name, to: b[name], op: "added"});
        }
    }
    return out;
}
