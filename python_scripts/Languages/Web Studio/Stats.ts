// tags: typescript, getting-started
/** Stats.ts — TypeScript with real type annotations.
 *
 * Runs through tsx when installed, or natively on Node >= 22.6 (type
 * stripping), or deno — whichever the runtime registry finds first.
 */
interface Reading {
    sensor: string;
    value: number;
    at: number;
}

function mean(xs: number[]): number {
    return xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a: number, b: number) => a + (b - m) ** 2, 0) / xs.length);
}

const readings: Reading[] = [
    {sensor: "A", value: 3.1, at: 1},
    {sensor: "A", value: 3.4, at: 2},
    {sensor: "B", value: 9.9, at: 3},
    {sensor: "B", value: 10.2, at: 4},
];

const bySensor = new Map<string, number[]>();
for (const r of readings) {
    const list = bySensor.get(r.sensor) ?? [];
    list.push(r.value);
    bySensor.set(r.sensor, list);
}

for (const [sensor, values] of bySensor) {
    console.log(`${sensor}: n=${values.length} mean=${mean(values).toFixed(2)} stdev=${stdev(values).toFixed(2)}`);
}
console.log("TypeScript run complete.");
