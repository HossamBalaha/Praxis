/**
 * a small standard-5-field cron parser
 * with next-run computation (minute hour day-of-month month
 * day-of-week; 6-field forms accept a leading second field and are
 * checked at whole minutes). Supports:
 *   - numbers, ranges (1-5), lists (1,3,5), steps ("star slash 10"
 *     style — every Nth), e.g. every 10 minutes or 1-30 stepping by 5
 *   - names for months (JAN…) and weekdays (MON…; 0 and 7 = Sunday)
 *   - day-of-month OR day-of-week semantics (standard cron: when both
 *     are restricted, EITHER may match — Vixie cron behavior)
 */

export interface CronField {
    /** Sorted, unique allowed values (already mapped to numbers). */
    values: Set<number>;
    /** "*" style unrestricted. */
    any: boolean;
}

export interface ParsedCron {
    minute: CronField;
    hour: CronField;
    dom: CronField;
    month: CronField;
    dow: CronField;
    /** True when the original expression had a leading seconds field. */
    hasSeconds: boolean;
    /** Pretty English summary. */
    summary: string;
}

const MONTH_NAMES: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DOW_NAMES: Record<string, number> = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

export function parseCronField(
    raw: string,
    min: number,
    max: number,
    names?: Record<string, number>
): CronField {
    const values = new Set<number>();
    let any = false;
    for (const part of raw.split(",")) {
        const stepMatch = /^(.+?)\/(\d+)$/.exec(part);
        const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
        const base = stepMatch ? stepMatch[1] : part;
        let lo: number;
        let hi: number;
        if (base === "*") {
            lo = min;
            hi = max;
            if (!stepMatch) any = true;
        } else {
            const range = base.includes("-")
                ? base.split("-")
                : [base, base];
            const toNum = (s: string): number => {
                const t = s.trim().toUpperCase();
                if (names && names[t] !== undefined) return names[t];
                const n = parseInt(t, 10);
                if (Number.isNaN(n)) throw new Error(`Bad value "${s}" in cron field.`);
                return n;
            };
            lo = toNum(range[0]);
            hi = toNum(range[1]);
        }
        if (lo < min || hi > max || lo > hi) {
            throw new Error(`Value out of range (${min}-${max}): "${part}".`);
        }
        if (step <= 0) throw new Error("Step must be positive.");
        for (let v = lo; v <= hi; v += step) values.add(v);
    }
    return {values, any};
}

export function parseCron(expr: string): ParsedCron {
    const parts = expr.trim().split(/\s+/);
    let fields = parts;
    let hasSeconds = false;
    if (fields.length === 6) {
        hasSeconds = true;
        fields = fields.slice(1); // seconds checked at 0 (whole minutes)
    } else if (fields.length !== 5) {
        throw new Error("Cron needs 5 fields (minute hour dom month dow) — or 6 with seconds.");
    }
    const minute = parseCronField(fields[0], 0, 59);
    const hour = parseCronField(fields[1], 0, 23);
    const dom = parseCronField(fields[2], 1, 31);
    const month = parseCronField(fields[3], 1, 12, MONTH_NAMES);
    let dow = parseCronField(fields[4], 0, 7, DOW_NAMES);
    // Normalize Sunday: 7 → 0.
    if (dow.values.has(7)) {
        dow = {values: new Set([...dow.values].filter((v) => v !== 7).concat(0)), any: dow.any};
    }
    return {minute, hour, dom, month, dow, hasSeconds, summary: describeCron(minute, hour, dom, month, dow)};
}

function fieldValues(f: CronField): number[] {
    return [...f.values].sort((a, b) => a - b);
}

/** Rough English description of the schedule. */
export function describeCron(
    minute: CronField,
    hour: CronField,
    dom: CronField,
    month: CronField,
    dow: CronField
): string {
    const mins = fieldValues(minute);
    const hours = fieldValues(hour);
    let when: string;
    if (minute.any && hour.any) when = "every minute";
    else if (mins.length === 1 && hour.any) when = `at minute ${mins[0]} of every hour`;
    else if (mins.length === 1 && hours.length === 1) when = `at ${String(hours[0]).padStart(2, "0")}:${String(mins[0]).padStart(2, "0")}`;
    else if (minute.any && hours.length === 1) when = `every minute during hour ${hours[0]}`;
    else if (mins.length >= 2 && hour.any) {
        const step = mins[1] - mins[0];
        const even = mins.every((m, i) => i === 0 || m - mins[i - 1] === step);
        when = even ? `every ${step} minutes` : `at minutes ${mins.join(", ")}`;
    } else when = `at minutes ${mins.join(", ")} of hours ${hours.join(", ")}`;
    let day = "";
    if (!dow.any) {
        const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        day = dow.values.size === 7 ? "" : ` on ${fieldValues(dow).map((d) => names[d]).join(", ")}`;
    }
    if (!dom.any && dow.any) day += ` on day(s) ${fieldValues(dom).join(", ")} of the month`;
    const mon = month.any
        ? ""
        : ` in ${fieldValues(month)
            .map((m) => {
                const key = Object.keys(MONTH_NAMES).find((k) => MONTH_NAMES[k] === m);
                return key ?? String(m);
            })
            .join(", ")}`;
    return `${when}${day}${mon}`.replace(/\s+/g, " ").trim();
}

/** The next matching time at/after `from` (whole minutes). */
export function nextCronRun(parsed: ParsedCron, from: Date): Date | null {
    const cursor = new Date(from);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1); // strictly after `from`
    const limit = new Date(from.getTime() + 366 * 24 * 3600 * 1000);
    while (cursor <= limit) {
        if (!parsed.month.values.has(cursor.getMonth() + 1)) {
            cursor.setMonth(cursor.getMonth() + 1, 1);
            cursor.setHours(0, 0, 0, 0);
            continue;
        }
        const domOk = parsed.dom.values.has(cursor.getDate());
        const dowOk = parsed.dow.values.has(cursor.getDay());
        // Standard cron: both restricted → EITHER matches; one restricted
        // → that one must match; neither → any day.
        const dayOk =
            !parsed.dom.any && !parsed.dow.any
                ? domOk || dowOk
                : parsed.dom.any && !parsed.dow.any
                    ? dowOk
                    : !parsed.dom.any && parsed.dow.any
                        ? domOk
                        : true;
        if (!dayOk) {
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
            continue;
        }
        if (!parsed.hour.values.has(cursor.getHours())) {
            cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
            continue;
        }
        if (!parsed.minute.values.has(cursor.getMinutes())) {
            cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
            continue;
        }
        return new Date(cursor);
    }
    return null;
}

/** The next `count` runs (for the builder's preview). */
export function nextCronRuns(parsed: ParsedCron, count = 5, from = new Date()): Date[] {
    const out: Date[] = [];
    let cursor = from;
    for (let i = 0; i < count; i++) {
        const next = nextCronRun(parsed, cursor);
        if (!next) break;
        out.push(next);
        cursor = next;
    }
    return out;
}
