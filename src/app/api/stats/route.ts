import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import {runningChildren} from "@/lib/run-registry";

/**
 * GET /api/stats?runId=<runId>
 *
 * Returns the current CPU% and RSS (resident set size, in MB) of the
 * running Python child process identified by runId. If no process is
 * running (or the OS doesn't expose /proc), returns zeros.
 *
 * Response: { ok, cpuPercent, rssMb, pid }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lastCpuByPid = new Map<number, { pid: number; cpuTime: number; ts: number }>();

async function readProcStat(pid: number): Promise<{
    utime: number;
    stime: number;
    rssPages: number;
} | null> {
    if (process.platform !== "linux") return null;
    try {
        const stat = await fs.readFile(`/proc/${pid}/stat`, "utf-8");
        // The comm field (field 2) is wrapped in parentheses and may itself
        // contain spaces or parentheses, so a naive split on /\s+/ breaks.
        // Find the LAST ')' and parse only what comes after it.
        const closeParen = stat.lastIndexOf(")");
        if (closeParen < 0) return null;
        const afterComm = stat.slice(closeParen + 2).trim().split(/\s+/);
        // afterComm[0] = state (field 3), afterComm[11] = utime (field 14),
        // afterComm[12] = stime (field 15), afterComm[21] = rss (field 24)
        const utime = parseInt(afterComm[11] ?? "0", 10);
        const stime = parseInt(afterComm[12] ?? "0", 10);
        const rssPages = parseInt(afterComm[21] ?? "0", 10);
        return {utime, stime, rssPages};
    } catch {
        return null;
    }
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const runId = searchParams.get("runId");
    if (!runId) {
        return NextResponse.json({error: "Missing 'runId'."}, {status: 400});
    }
    const child = runningChildren.get(runId);
    if (!child || child.killed) {
        if (child && child.pid) lastCpuByPid.delete(child.pid);
        return NextResponse.json({ok: true, cpuPercent: 0, rssMb: 0, pid: 0, running: false});
    }
    const pid = child.pid;
    if (!pid) {
        return NextResponse.json({ok: true, cpuPercent: 0, rssMb: 0, pid: 0, running: false});
    }

    const proc = await readProcStat(pid);
    if (!proc) {
        // Non-Linux or process just exited.
        return NextResponse.json({
            ok: true,
            cpuPercent: 0,
            rssMb: 0,
            pid,
            running: true,
            hint: process.platform !== "linux" ? "CPU/RSS only available on Linux." : undefined,
        });
    }

    const now = Date.now();
    const totalTicks = proc.utime + proc.stime;
    let cpuPercent = 0;
    const prev = lastCpuByPid.get(pid);
    if (prev && prev.pid === pid) {
        const dticks = totalTicks - prev.cpuTime;
        const dtime = (now - prev.ts) / 1000; // seconds
        // Assume 100 Hz clock ticks (standard on Linux).
        cpuPercent = dtime > 0 ? (dticks / 100 / dtime) * 100 : 0;
    }
    lastCpuByPid.set(pid, {pid, cpuTime: totalTicks, ts: now});

    // RSS is in pages; convert to MB (page size = 4096 bytes on x86_64).
    const rssMb = proc.rssPages * 4096 / (1024 * 1024);

    return NextResponse.json({
        ok: true,
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        rssMb: Math.round(rssMb * 10) / 10,
        pid,
        running: true,
    });
}
