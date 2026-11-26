import {NextRequest, NextResponse} from "next/server";
import {
    type ConsoleSession,
    getConsoleSession,
    killConsoleSession,
    pruneConsoleSessions,
} from "@/lib/console-sessions";

/**
 * POST /api/console/variable — the console's "open in grid" data bridge.
 *
 * Body: { id | session, expr, rowCap?, colCap? }
 *   → { ok, kind, columns, rows, totalRows, totalCols }
 *
 * Resolves ONE guarded expression (`df`, `results[0]`, `cfg.paths["x"]`
 * — names/attributes/subscripts only, never executed code) against the
 * LIVE kernel session's namespace and returns the object serialized as
 * strict-JSON grid records for the app's grid viewer:
 *   DataFrames → to_dict("records"); Series → [index, value]; ndarray →
 *   matrix / one column; dict → column-oriented or one-row; list/tuple/set
 * → of dicts / sequences / one value column.
 *
 * Caps keep the round-trip fast: rowCap/colCap clamp to [1, 2000]/[1, 100]
 * (defaults 2000/100 — the sizes the grid viewer paginates well), cells
 * are text-capped kernel-side, and a final payload-size guard refuses
 * pathologically wide data (413) instead of shipping megabytes.
 *
 * Error contracts (the console panel degrades ALL of them to a toast):
 *   400 bad body / missing expr · 409 a submission is still running ·
 *   410 session dead ({ dead: true }) · 422 not table-like / kernel error ·
 *   413 payload too large · 500 watchdog (session killed, { died: true })
 *
 * The kernel round-trip mirrors /api/console's inspect/tasks actions: ONE
 * stdin line (mode "griddata"), ONE matching stdout reply, a watchdog
 * that kills a hung session (a stuck serialization cannot be interrupted
 * from Python), and the same one-at-a-time busy rule.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Row cap default AND clamp ceiling (~2000 rows per the grid viewer). */
const ROW_CAP_DEFAULT = 2000;
const ROW_CAP_MAX = 2000;
/** Column cap default AND clamp ceiling (~100 columns per the grid viewer). */
const COL_CAP_DEFAULT = 100;
const COL_CAP_MAX = 100;
/** Refuse replies whose JSON would exceed ~4 MB (pathologically wide
 * all-text frames) — the client toasts "too large, slice it first". */
const PAYLOAD_CHAR_LIMIT = 4_000_000;

interface VariableBody {
    id?: unknown;
    /** Alias for `id` (matches the inspect/tasks contract). */
    session?: unknown;
    expr?: unknown;
    rowCap?: unknown;
    colCap?: unknown;
}

/** Clamp a cap request to [1, max] with a default — non-numbers fall back. */
function clampCap(value: unknown, fallback: number, max: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
        return fallback;
    }
    return Math.min(Math.floor(value), max);
}

export async function POST(request: NextRequest) {
    let body: VariableBody;
    try {
        body = (await request.json()) as VariableBody;
    } catch {
        return NextResponse.json(
            {ok: false, error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const id =
        typeof body.id === "string" && body.id
            ? body.id
            : typeof body.session === "string" && body.session
                ? body.session
                : "";
    if (!id) {
        return NextResponse.json(
            {ok: false, error: "Missing session id."},
            {status: 400}
        );
    }
    if (typeof body.expr !== "string" || !body.expr.trim()) {
        return NextResponse.json(
            {ok: false, error: "Missing 'expr' — the namespace expression to serialize."},
            {status: 400}
        );
    }
    const rowCap = clampCap(body.rowCap, ROW_CAP_DEFAULT, ROW_CAP_MAX);
    const colCap = clampCap(body.colCap, COL_CAP_DEFAULT, COL_CAP_MAX);

    pruneConsoleSessions();
    const session: ConsoleSession | undefined = getConsoleSession(id);
    if (!session || session.closed) {
        return NextResponse.json(
            {
                ok: false,
                error: "The console session has ended — it restarts on the next submission.",
                dead: true,
            },
            {status: 410}
        );
    }
    if (session.busy) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    "A submission is still running in this console — wait for it to finish or restart the session.",
            },
            {status: 409}
        );
    }

    session.seq += 1;
    session.busy = true;
    session.lastUsedAt = Date.now();
    const seq = session.seq;

    // Watchdog: a serialization that hangs (locked frame, pathological
    // __repr__) cannot be interrupted from Python — kill the whole session
    // at the timeout, exactly like a stuck exec submission.
    const reply = await new Promise<Record<string, unknown> | null>(
        (resolve) => {
            let watchdog: ReturnType<typeof setTimeout> | null = null;
            const finish = (obj: Record<string, unknown> | null) => {
                if (watchdog) clearTimeout(watchdog);
                session.onLine = null;
                resolve(obj);
            };
            session.onLine = (obj) => {
                if (obj.id === seq && obj.kind === "griddata") {
                    finish(obj);
                } else if (obj.event === "exit") {
                    session.closed = true;
                    finish(null);
                } else if (obj.event === "end") {
                    // Kernel/session death — console-sessions.ts synthesizes an
                    // `end` event on close; nothing will ever answer us.
                    finish(null);
                }
            };
            watchdog = setTimeout(() => {
                killConsoleSession(session);
                finish(null);
            }, DEFAULT_TIMEOUT_MS);
            try {
                const line =
                    JSON.stringify({id: seq, mode: "griddata", expr: body.expr, rows: rowCap, cols: colCap}) + "\n";
                session.child.stdin?.write(line, "utf-8");
            } catch {
                finish(null);
            }
        }
    );

    session.busy = false;
    session.lastUsedAt = Date.now();

    if (!reply) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    "The kernel did not answer in time — the session was killed and restarts on the next submission.",
                died: true,
            },
            {status: 500}
        );
    }
    if (typeof reply.error === "string" && reply.error) {
        // Kernel-side resolution/serialization failure (name not defined,
        // not table-like, guarded-resolver rejection) — 422 so the client
        // can tell it apart from protocol failures.
        return NextResponse.json({ok: false, error: reply.error}, {status: 422});
    }
    const columns = reply.columns;
    const rows = reply.rows;
    if (
        !Array.isArray(columns) ||
        !columns.every((c) => typeof c === "string") ||
        !Array.isArray(rows) ||
        !rows.every((r) => Array.isArray(r))
    ) {
        return NextResponse.json(
            {ok: false, error: "The kernel reply was malformed (columns/rows missing)."},
            {status: 422}
        );
    }
    // Payload-size guard: the caps bound COUNT, not WIDTH — an all-text
    // frame with ~300-char cells could still exceed the budget. Refuse
    // instead of shipping megabytes to the browser.
    let charSize = 0;
    try {
        charSize = JSON.stringify(reply).length;
    } catch {
        charSize = 0;
    }
    if (charSize > PAYLOAD_CHAR_LIMIT) {
        return NextResponse.json(
            {
                ok: false,
                error: `The grid payload is too large (${(charSize / 1_000_000).toFixed(1)} MB) — slice the object first, e.g. a smaller df or df.head(500).`,
            },
            {status: 413}
        );
    }

    return NextResponse.json({
        ok: true,
        kind: typeof reply.shape === "string" ? reply.shape : undefined,
        columns,
        rows,
        totalRows: typeof reply.totalRows === "number" ? reply.totalRows : null,
        totalCols: typeof reply.totalCols === "number" ? reply.totalCols : null,
        expr: body.expr,
        rowCap,
        colCap,
    });
}
