"use client";

import * as React from "react";
import {Sigma} from "lucide-react";
import {cn} from "@/lib/utils";

/**
 * the column-stats band — one collapsible strip above
 * every data table (CSV view, Excel/parquet sheets) showing per-column
 * type / min / max / mean / unique / missing badges. Clicking the
 * MISSING badge filters the table to the rows missing that column
 * (click again to clear) — one-click data QA.
 */

export interface ColumnStats {
    index: number;
    header: string;
    kind: "numeric" | "text" | "boolean" | "mixed";
    min?: number;
    max?: number;
    mean?: number;
    /** Sum of the numeric cells (numeric columns only). */
    sum?: number;
    unique: number;
    missing: number;
    total: number;
}

interface ColumnStatsBandProps {
    stats: ColumnStats[];
    /** Column currently filtering by missing (index) — null when off. */
    missingFilter: number | null;
    onToggleMissing: (index: number) => void;
}

function fmt(n: number): string {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, {maximumFractionDigits: 1});
    return String(Math.round(n * 100) / 100);
}

export function ColumnStatsBand({stats, missingFilter, onToggleMissing}: ColumnStatsBandProps) {
    const [open, setOpen] = React.useState(true);
    if (stats.length === 0) return null;
    return (
        <div className="border-b bg-muted/10">
            <button
                type="button"
                className="flex items-center gap-1.5 w-full px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
            >
                <Sigma className="size-3"/>
                Column statistics ({stats.length})
                <span className="ml-auto">{open ? "hide" : "show"}</span>
            </button>
            {open && (
                <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
                    {stats.map((s) => (
                        <div
                            key={s.index}
                            className="shrink-0 rounded-md border bg-card px-2 py-1 min-w-32 max-w-56"
                            title={`${s.header} — ${s.kind}, ${s.unique} unique, ${s.missing} missing of ${s.total}`}
                        >
                            <p className="text-[10px] font-medium truncate">{s.header || `col ${s.index}`}</p>
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.kind}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-muted-foreground">
                                {s.kind === "numeric" && s.min !== undefined && (
                                    <span title="min">min <span
                                        className="text-red-600 dark:text-red-400 font-mono">{fmt(s.min)}</span></span>
                                )}
                                {s.kind === "numeric" && s.max !== undefined && (
                                    <span title="max">max <span
                                        className="text-emerald-600 dark:text-emerald-400 font-mono">{fmt(s.max)}</span></span>
                                )}
                                {s.kind === "numeric" && s.mean !== undefined && (
                                    <span title="mean">μ <span className="font-mono">{fmt(s.mean)}</span></span>
                                )}
                                {s.kind === "numeric" && s.sum !== undefined && (
                                    <span title="sum">Σ <span className="font-mono">{fmt(s.sum)}</span></span>
                                )}
                                <span title="unique values">uniq <span className="font-mono">{s.unique}</span></span>
                                <button
                                    type="button"
                                    className={cn(
                                        "rounded px-1 -mx-1 transition",
                                        s.missing > 0 && "hover:bg-muted",
                                        missingFilter === s.index && "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                    )}
                                    disabled={s.missing === 0}
                                    onClick={() => onToggleMissing(s.index)}
                                    title={
                                        s.missing === 0
                                            ? "No missing values"
                                            : missingFilter === s.index
                                                ? "Clear the missing-value filter"
                                                : `Show only the ${s.missing} row(s) missing this column`
                                    }
                                >
                                    missing <span className="font-mono">{s.missing}</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Compute stats for string-matrix tables (CSV view path). */
export function computeStats(headers: string[], rows: string[][]): ColumnStats[] {
    return headers.map((header, index) => {
        let numeric = 0;
        let boolean = 0;
        let missing = 0;
        const uniques = new Set<string>();
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let numericCount = 0;
        for (const row of rows) {
            const cell = (row[index] ?? "").trim();
            if (cell === "" || cell === "NaN" || cell === "None" || cell === "null" || cell === "—") {
                missing++;
                continue;
            }
            uniques.add(cell);
            const n = Number(cell);
            if (Number.isFinite(n) && /^[-+]?[\d.,eE]+$/.test(cell.replace(/,/g, ""))) {
                numeric++;
                min = Math.min(min, n);
                max = Math.max(max, n);
                sum += n;
                numericCount++;
            } else if (cell === "true" || cell === "false" || cell === "True" || cell === "False") {
                boolean++;
            }
        }
        const kind: ColumnStats["kind"] =
            missing === rows.length ? "text"
                : numeric === rows.length - missing ? "numeric"
                    : boolean === rows.length - missing ? "boolean"
                        : numeric > 0 ? "mixed" : "text";
        return {
            index,
            header,
            kind,
            min: numericCount > 0 ? min : undefined,
            max: numericCount > 0 ? max : undefined,
            mean: numericCount > 0 ? sum / numericCount : undefined,
            sum: numericCount > 0 ? sum : undefined,
            unique: uniques.size,
            missing,
            total: rows.length,
        };
    });
}

/** Compute stats for typed sheet tables (pandas values path). */
export function computeStatsForValues(headers: string[], rows: unknown[][]): ColumnStats[] {
    const asText = rows.map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
    const stats = computeStats(headers, asText);
    // Numbers that arrived as real numbers (not parseable strings) still
    // count — computeStats already parses numeric strings.
    return stats;
}
