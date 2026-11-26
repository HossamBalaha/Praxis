// tags: typescript, web, utilities
// utils.ts — typed utilities the landing page's tooling would share:
// generics, discriminated unions, branded money. Runnable through
// tsx / Node >= 22.6 (type stripping) / deno — see the Run button.

export interface Money {
    cents: number;
    currency: "USD" | "EUR";
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function formatMoney(m: Money): string {
    const symbol = m.currency === "USD" ? "$" : "EUR ";
    const major = Math.trunc(m.cents / 100);
    const minor = Math.abs(m.cents % 100);
    return `${symbol}${major}.${String(minor).padStart(2, "0")}`;
}

export function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
}

export function chunk<T>(xs: T[], size: number): T[][] {
    if (size <= 0) throw new Error("chunk size must be positive");
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
    return out;
}

export function parsePrice(raw: string): Result<Money> {
    const m = /^([0-9]+)(?:[.,]([0-9]{2}))? (USD|EUR)$/.exec(raw.trim());
    if (!m) return {ok: false, error: `"${raw}" is not a price like "29.00 USD"`};
    const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2]) : 0);
    return {ok: true, value: {cents, currency: m[3] as "USD" | "EUR"}};
}

const plans: Money[] = [
    {cents: 0, currency: "USD"},
    {cents: 900, currency: "USD"},
    {cents: 2900, currency: "USD"},
];

console.log("plans:", plans.map(formatMoney).join(" / "));
console.log("chunks of [1..10] by 3:", JSON.stringify(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)));
console.log('parsePrice("9.50 EUR"):', JSON.stringify(parsePrice("9.50 EUR")));
console.log("utils.ts run complete.");
