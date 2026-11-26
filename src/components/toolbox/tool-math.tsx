"use client";

/**
 * tool-math.tsx — the "Math & Calc" toolbox category (30 tools).
 * A real Pratt-style expression parser drives the evaluator; the rest
 * are classic number-theory / statistics / finance / matrix / bit
 * helpers. All offline and deterministic.
 */

import {makeTextTool, roundTo, type TextToolSpec} from "./tool-factory";

/* ─── a small, safe expression evaluator (no eval) ────────────── */
type Tok = { t: "num" | "op" | "lp" | "rp" | "comma" | "name"; v: string };

function tokenize(src: string): Tok[] {
    const toks: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === " ") {
            i++;
            continue;
        }
        if (/[0-9.]/.test(c)) {
            let j = i;
            while (j < src.length && /[0-9._]/.test(src[j])) j++;
            toks.push({t: "num", v: src.slice(i, j).replace(/_/g, "")});
            i = j;
            continue;
        }
        if (/[a-zA-Z]/.test(c)) {
            let j = i;
            while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
            toks.push({t: "name", v: src.slice(i, j).toLowerCase()});
            i = j;
            continue;
        }
        if (c === "(") {
            toks.push({t: "lp", v: c});
            i++;
            continue;
        }
        if (c === ")") {
            toks.push({t: "rp", v: c});
            i++;
            continue;
        }
        if (c === ",") {
            toks.push({t: "comma", v: c});
            i++;
            continue;
        }
        const two = src.slice(i, i + 2);
        if (["**", "//", "==", "!=", "<=", ">="].includes(two)) {
            toks.push({t: "op", v: two});
            i += 2;
            continue;
        }
        if ("+-*/%^".includes(c)) {
            toks.push({t: "op", v: c});
            i++;
            continue;
        }
        throw new Error(`Unexpected character '${c}' at position ${i + 1}`);
    }
    return toks;
}

const FNS: Record<string, { arity: number; fn: (...a: number[]) => number }> = {
    abs: {arity: 1, fn: Math.abs},
    ceil: {arity: 1, fn: Math.ceil},
    floor: {arity: 1, fn: Math.floor},
    round: {arity: 1, fn: (x) => Math.round(x)},
    sqrt: {arity: 1, fn: Math.sqrt},
    cbrt: {arity: 1, fn: Math.cbrt},
    exp: {arity: 1, fn: Math.exp},
    ln: {arity: 1, fn: Math.log},
    log: {arity: 1, fn: Math.log10},
    log2: {arity: 1, fn: Math.log2},
    sin: {arity: 1, fn: Math.sin},
    cos: {arity: 1, fn: Math.cos},
    tan: {arity: 1, fn: Math.tan},
    asin: {arity: 1, fn: Math.asin},
    acos: {arity: 1, fn: Math.acos},
    atan: {arity: 1, fn: Math.atan},
    sinh: {arity: 1, fn: Math.sinh},
    cosh: {arity: 1, fn: Math.cosh},
    tanh: {arity: 1, fn: Math.tanh},
    min: {arity: Infinity, fn: (...a) => Math.min(...a)},
    max: {arity: Infinity, fn: (...a) => Math.max(...a)},
    pow: {arity: 2, fn: (a, b) => Math.pow(a, b)},
    hypot: {arity: Infinity, fn: (...a) => Math.hypot(...a)},
    gcd: {
        arity: Infinity,
        fn: (...a) => a.reduce((x, y) => {
            let g = Math.abs(x);
            let yy = Math.abs(y);
            while (yy) {
                [g, yy] = [yy, g % yy];
            }
            return g;
        }),
    },
    lcm: {
        arity: Infinity,
        fn: (...a) => a.reduce((x, y) => {
            const g = FNS.gcd.fn(x, y);
            return Math.abs(x * y) / (g || 1);
        }),
    },
    fact: {
        arity: 1, fn: (n) => {
            let r = 1;
            for (let i = 2; i <= n; i++) r *= i;
            return r;
        }
    },
    fib: {
        arity: 1, fn: (n) => {
            let a = 0, b = 1;
            for (let i = 0; i < n; i++) [a, b] = [b, a + b];
            return a;
        }
    },
    sign: {arity: 1, fn: Math.sign},
    deg: {arity: 1, fn: (r) => (r * 180) / Math.PI},
    rad: {arity: 1, fn: (d) => (d * Math.PI) / 180},
};
const CONSTS: Record<string, number> = {pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2};

interface Parser {
    toks: Tok[];
    pos: number;
}

function peek(p: Parser): Tok | undefined {
    return p.toks[p.pos];
}

function eat(p: Parser): Tok {
    const t = p.toks[p.pos]!;
    p.pos++;
    return t;
}

function parseExpr(p: Parser): number {
    let left = parseTerm(p);
    for (; ;) {
        const t = peek(p);
        if (t?.t === "op" && "+-".includes(t.v)) {
            eat(p);
            const right = parseTerm(p);
            left = t.v === "+" ? left + right : left - right;
        } else return left;
    }
}

function parseTerm(p: Parser): number {
    let left = parseUnary(p);
    for (; ;) {
        const t = peek(p);
        if (t?.t === "op" && "*/%//".includes(t.v.slice(0, 1)) && t.v !== "") {
            eat(p);
            const right = parseUnary(p);
            if (t.v === "*") left = left * right;
            else if (t.v === "/") left = left / right;
            else if (t.v === "//") left = Math.floor(left / right);
            else left = left % right;
        } else return left;
    }
}

function parseUnary(p: Parser): number {
    const t = peek(p);
    if (t?.t === "op" && t.v === "-") {
        eat(p);
        return -parseUnary(p);
    }
    if (t?.t === "op" && t.v === "+") {
        eat(p);
        return parseUnary(p);
    }
    return parsePower(p);
}

function parsePower(p: Parser): number {
    const base = parseAtom(p);
    const t = peek(p);
    if (t?.t === "op" && (t.v === "^" || t.v === "**")) {
        eat(p);
        return Math.pow(base, parseUnary(p)); // right-assoc
    }
    return base;
}

function parseAtom(p: Parser): number {
    const t = eat(p);
    if (t.t === "num") {
        const n = Number(t.v);
        if (!Number.isFinite(n)) throw new Error(`Bad number '${t.v}'`);
        return n;
    }
    if (t.t === "name") {
        const name = t.v;
        if (peek(p)?.t === "lp") {
            eat(p);
            const args: number[] = [];
            if (peek(p)?.t !== "rp") {
                args.push(parseExpr(p));
                while (peek(p)?.t === "comma") {
                    eat(p);
                    args.push(parseExpr(p));
                }
            }
            const rp = eat(p);
            if (rp.t !== "rp") throw new Error("Expected )");
            const f = FNS[name];
            if (!f) throw new Error(`Unknown function '${name}'`);
            if (f.arity !== Infinity && args.length !== f.arity) throw new Error(`${name}() takes ${f.arity} arg(s), got ${args.length}`);
            const r = f.fn(...args);
            if (!Number.isFinite(r)) throw new Error(`${name}() returned a non-finite value`);
            return r;
        }
        if (name in CONSTS) return CONSTS[name];
        throw new Error(`Unknown name '${name}' (constants: pi, e, tau, phi)`);
    }
    if (t.t === "lp") {
        const v = parseExpr(p);
        const rp = eat(p);
        if (rp.t !== "rp") throw new Error("Expected )");
        return v;
    }
    throw new Error(`Unexpected token '${t.v}'`);
}

export function evaluateExpression(src: string): number {
    const p: Parser = {toks: tokenize(src), pos: 0};
    if (p.toks.length === 0) throw new Error("Empty expression");
    const v = parseExpr(p);
    if (p.pos !== p.toks.length) throw new Error(`Unexpected trailing input at token ${p.pos + 1}`);
    return v;
}

/* ─── helpers ────────────────────────────────────────────────── */
const parseNums = (input: string): number[] =>
    input.split(/[\s,;\n\t]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));

const gcd2 = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        [a, b] = [b, a % b];
    }
    return a;
};
const isPrime = (n: number): boolean => {
    if (!Number.isInteger(n) || n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
};
const factorize = (n: number): number[] => {
    const out: number[] = [];
    let m = Math.abs(Math.trunc(n));
    for (let d = 2; d * d <= m; d++) while (m % d === 0) {
        out.push(d);
        m /= d;
    }
    if (m > 1) out.push(m);
    return out;
};
const decimalToFraction = (x: number): [number, number] => {
    const sign = x < 0 ? -1 : 1;
    let num = Math.abs(x);
    let den = 1;
    const MAXD = 1_000_000;
    while (Math.abs(num - Math.round(num)) > 1e-10 && den < MAXD) {
        num *= 10;
        den *= 10;
    }
    const n = Math.round(num);
    const d = den;
    const g = gcd2(n, d) || 1;
    return [sign * (n / g), d / g];
};

const MATRIX_HELP = "Matrices: rows on their own lines, numbers space-separated (e.g. `1 2\\n3 4`).";
const parseMatrix = (input: string): number[][] =>
    input.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => l.trim().split(/\s+/).map(Number));

const matrixToString = (m: number[][]): string =>
    m.map((r) => r.map((v) => roundTo(v, 4)).join("  ")).join("\n");

export const MATH_TOOLS: TextToolSpec[] = [
    {
        id: "calc-eval",
        label: "Expression Evaluator",
        description: "Evaluate arithmetic expressions safely (no eval) — + - * / % ^ ** //, parentheses, functions and constants.",
        sample: "2^10 + sqrt(144)\n(1+2)*3!\nsin(rad(30)) + pi/4",
        transform: (input) =>
            input
                .split(/\r?\n/)
                .filter((l) => l.trim() !== "")
                .map((l) => {
                    try {
                        return `${l.trim()}  =  ${roundTo(evaluateExpression(l), 10)}`;
                    } catch (e) {
                        return `${l.trim()}  →  ${e instanceof Error ? e.message : "error"}`;
                    }
                })
                .join("\n"),
        note: "Functions: abs ceil floor round sqrt cbrt exp ln log log2 sin cos tan asin acos atan sinh cosh tanh deg rad min max pow hypot gcd lcm fact fib sign. Constants: pi e tau phi. `fact(5)` = 5!, `//` is integer division.",
    },
    {
        id: "stat-summary",
        label: "Statistics Summary",
        description: "One paste of numbers → count, sum, mean, median, mode, min, max, range, variance (sample+population), std dev, quartiles, outliers.",
        sample: "4 8 15 16 23 42",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length === 0) return "Error: no numbers found.";
            const sorted = nums.slice().sort((a, b) => a - b);
            const sum = nums.reduce((a, b) => a + b, 0);
            const mean = sum / nums.length;
            const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
            const counts = new Map<number, number>();
            for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
            const maxCount = Math.max(...counts.values());
            const mode = maxCount > 1 ? [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v).join(", ") : "—";
            const varS = nums.length > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1) : 0;
            const varP = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
            const q = (p: number) => {
                const idx = (sorted.length - 1) * p;
                const lo = Math.floor(idx);
                return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (idx - lo);
            };
            const iqr = q(0.75) - q(0.25);
            const outliers = sorted.filter((v) => v < q(0.25) - 1.5 * iqr || v > q(0.75) + 1.5 * iqr);
            return [
                `count      ${nums.length}`,
                `sum        ${roundTo(sum, 6)}`,
                `mean       ${roundTo(mean, 6)}`,
                `median     ${roundTo(median, 6)}`,
                `mode       ${mode}`,
                `min        ${roundTo(sorted[0], 6)}`,
                `max        ${roundTo(sorted[sorted.length - 1], 6)}`,
                `range      ${roundTo(sorted[sorted.length - 1] - sorted[0], 6)}`,
                `q1 / q3    ${roundTo(q(0.25), 6)} / ${roundTo(q(0.75), 6)}`,
                `var(s/p)   ${roundTo(varS, 6)} / ${roundTo(varP, 6)}`,
                `std(s/p)   ${roundTo(Math.sqrt(varS), 6)} / ${roundTo(Math.sqrt(varP), 6)}`,
                `outliers   ${outliers.length ? outliers.join(", ") : "none (1.5·IQR rule)"}`,
            ].join("\n");
        },
    },
    {
        id: "stat-sum-product",
        label: "Sum / Product / Average",
        description: "Quick aggregate of a number list — sum, product and three averages in one shot.",
        sample: "2, 3, 5, 7",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length === 0) return "Error: no numbers found.";
            const sum = nums.reduce((a, b) => a + b, 0);
            const product = nums.reduce((a, b) => a * b, 1);
            const geo = Math.pow(Math.abs(product), 1 / nums.length);
            const harm = nums.length / nums.reduce((a, b) => a + (b === 0 ? Infinity : 1 / b), 0);
            return [
                `sum        ${roundTo(sum, 8)}`,
                `product    ${roundTo(product, 8)}`,
                `arith mean ${roundTo(sum / nums.length, 8)}`,
                `geo mean   ${Number.isFinite(geo) ? roundTo(geo, 8) : "undefined (negative values / zero)"}`,
                `harm mean  ${Number.isFinite(harm) && harm !== Infinity ? roundTo(harm, 8) : "undefined (zero present)"}`,
            ].join("\n");
        },
    },
    {
        id: "num-percentage",
        label: "Percentage Calculator",
        description: "Three modes: what is X% of Y · X is what % of Y · % change from X to Y.",
        sample: "5 200\n5 200\n80 100",
        options: [
            {
                key: "mode",
                label: "Mode",
                kind: "select",
                choices: [["of", "X% of Y"], ["is", "X is what % of Y"], ["change", "% change X → Y"]],
                default: "of"
            },
        ],
        transform: (input, o) => {
            const pairs = input.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => parseNums(l));
            const out: string[] = [];
            for (const p of pairs) {
                if (p.length < 2) continue;
                const [x, y] = p;
                if (o.mode === "of") out.push(`${x}% of ${y} = ${roundTo((x / 100) * y, 6)}`);
                else if (o.mode === "is") out.push(`${x} is ${roundTo((x / y) * 100, 4)}% of ${y}`);
                else out.push(`${x} → ${y} = ${roundTo(((y - x) / Math.abs(x || 1)) * 100, 4)}% change`);
            }
            return out.length ? out.join("\n") : "Error: one pair per line (X Y).";
        },
        note: "One pair per line: `X Y`.",
    },
    {
        id: "num-fraction",
        label: "Fraction ⇄ Decimal",
        description: "Decimals become reduced fractions; fractions become exact decimals.",
        sample: "0.375\n3/8\n2.75",
        options: [{
            key: "mode",
            label: "Direction",
            kind: "select",
            choices: [["toFraction", "→ fraction"], ["toDecimal", "→ decimal"]],
            default: "toFraction"
        }],
        transform: (input, o) =>
            input.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => {
                const s = l.trim();
                try {
                    if (o.mode === "toDecimal") {
                        const m = s.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
                        if (!m) return `${s} → not a fraction (a/b form)`;
                        return `${s} = ${roundTo(Number(m[1]) / Number(m[2]), 10)}`;
                    }
                    const n = Number(s);
                    if (!Number.isFinite(n)) return `${s} → not a number`;
                    const [num, den] = decimalToFraction(n);
                    return `${s} = ${num}/${den}`;
                } catch {
                    return `${s} → error`;
                }
            }).join("\n"),
    },
    {
        id: "num-gcd-lcm",
        label: "GCD & LCM",
        description: "Greatest common divisor and least common multiple of any number list.",
        sample: "12, 18, 30",
        transform: (input) => {
            const nums = parseNums(input).filter((n) => Number.isInteger(n) && n !== 0);
            if (nums.length < 2) return "Error: need at least two non-zero integers.";
            const gcd = nums.reduce((a, b) => gcd2(a, b));
            const lcm = nums.reduce((a, b) => Math.abs(a * b) / (gcd2(a, b) || 1));
            return `gcd = ${gcd}\nlcm = ${lcm}`;
        },
    },
    {
        id: "num-prime",
        label: "Prime Check & Factorization",
        description: "For every number: prime verdict, factorization and divisor list.",
        sample: "91\n97\n360",
        transform: (input) =>
            parseNums(input).map((n) => {
                if (!Number.isInteger(n) || n < 2) return `${n}: neither (below 2 or not an integer)`;
                const prime = isPrime(n);
                const factors = factorize(n);
                const divisors: number[] = [];
                for (let d = 1; d * d <= Math.abs(n); d++) if (Math.abs(n) % d === 0) {
                    divisors.push(d);
                    if (d !== Math.abs(n) / d) divisors.push(Math.abs(n) / d);
                }
                return [
                    `${n}: ${prime ? "PRIME" : "composite"}`,
                    prime ? "" : `  = ${factors.join(" × ")}`,
                    `  divisors: ${divisors.sort((a, b) => a - b).join(", ")}`,
                ].filter(Boolean).join("\n");
            }).join("\n"),
    },
    {
        id: "num-primes-range",
        label: "Primes in Range",
        description: "Every prime between two bounds (Sieve of Eratosthenes).",
        sample: "10 60",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 2) return "Error: two numbers — the range bounds.";
            const lo = Math.max(2, Math.min(nums[0], nums[1]));
            const hi = Math.max(nums[0], nums[1]);
            if (hi - lo > 100_000) return "Error: range too wide (max 100,000 numbers).";
            const sieve = new Uint8Array(hi + 1);
            const primes: number[] = [];
            for (let n = lo; n <= hi; n++) {
                if (sieve[n] === 0) {
                    primes.push(n);
                    for (let m = n * n; m <= hi; m += n) sieve[m] = 1;
                }
            }
            return `${primes.length} primes in [${lo}, ${hi}]:\n${primes.join(", ")}`;
        },
    },
    {
        id: "num-fibonacci",
        label: "Fibonacci Sequence",
        description: "The first N Fibonacci numbers (or the single Nth).",
        sample: "12",
        options: [{
            key: "mode",
            label: "Mode",
            kind: "select",
            choices: [["seq", "first N"], ["nth", "Nth only"]],
            default: "seq"
        }],
        transform: (input, o) => {
            const n = Math.min(90, Math.max(1, Math.trunc(Number(input.trim()) || 10)));
            const fibs: number[] = [0, 1];
            while (fibs.length < n + 1) fibs.push(fibs[fibs.length - 1] + fibs[fibs.length - 2]);
            if (o.mode === "nth") return `F(${n}) = ${fibs[n]}`;
            return fibs.slice(0, n).map((f, i) => `F(${i}) = ${f}`).join("\n");
        },
    },
    {
        id: "num-pascal",
        label: "Pascal's Triangle",
        description: "N rows of the binomial coefficients.",
        sample: "8",
        transform: (input) => {
            const n = Math.min(30, Math.max(1, Math.trunc(Number(input.trim()) || 6)));
            const rows: string[][] = [];
            let row: number[] = [1];
            for (let i = 0; i < n; i++) {
                rows.push(row.map(String));
                row = [1, ...row.slice(0, -1).map((v, j) => v + row[j + 1]), 1];
            }
            const widths = rows.map((r) => r.join(" ").length);
            const maxW = Math.max(...widths);
            return rows.map((r, i) => r.join(" ").padStart(Math.floor((maxW + widths[i]) / 2))).join("\n");
        },
        note: "Centered rows, one per line — the classic triangle.",
    },
    {
        id: "num-binary-arith",
        label: "Binary / Hex Arithmetic",
        description: "Bitwise ops on two numbers — paste `A op B` per line (ops: + - * & | ^ << >>).",
        sample: "0b1011 & 0b1101\n0xFF | 0x0F\n8 << 2",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim() !== "").map((line) => {
                const m = line.trim().match(/^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)\s*([+\-*&|^]|<<|>>)\s*(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)$/);
                if (!m) return `${line} → syntax: A op B (ops + - * & | ^ << >>)`;
                const a = Number(m[1]);
                const b = Number(m[3]);
                let r: number;
                switch (m[2]) {
                    case "+":
                        r = a + b;
                        break;
                    case "-":
                        r = a - b;
                        break;
                    case "*":
                        r = a * b;
                        break;
                    case "&":
                        r = a & b;
                        break;
                    case "|":
                        r = a | b;
                        break;
                    case "^":
                        r = a ^ b;
                        break;
                    case "<<":
                        r = a << b;
                        break;
                    default:
                        r = a >> b;
                        break;
                }
                const unsigned = r >>> 0;
                return `${line} = ${r}  ·  0x${unsigned.toString(16).toUpperCase()}  ·  0b${unsigned.toString(2)}`;
            }).join("\n"),
    },
    {
        id: "num-bit-count",
        label: "Bit Counter (Popcount)",
        description: "Set-bit count, binary form and trailing zeros of each number.",
        sample: "255\n0b1011\n0xF0",
        transform: (input) =>
            parseNums(input).map((n) => {
                const u = n >>> 0;
                return `${n} → ${u.toString(2).padStart(8, "0")} · ${u.toString(2).split("").filter((c) => c === "1").length} set bit(s)`;
            }).join("\n"),
    },
    {
        id: "num-two-comp",
        label: "Two's Complement",
        description: "Encode a signed integer in a chosen width (8/16/32) — the debug view of negative bytes.",
        sample: "-1\n-128\n300",
        options: [{
            key: "bits",
            label: "Width",
            kind: "select",
            choices: [["8", "8-bit"], ["16", "16-bit"], ["32", "32-bit"]],
            default: "8"
        }],
        transform: (input, o) => {
            const bits = parseInt(String(o.bits), 10) as 8 | 16 | 32;
            const range = 2 ** (bits - 1);
            return parseNums(input).map((n) => {
                if (n < -range || n >= range) return `${n} → out of ${bits}-bit range (${-range}..${range - 1})`;
                const enc = n < 0 ? (2 ** bits + n) : n;
                return `${n} → 0b${enc.toString(2).padStart(bits, "0")} · 0x${enc.toString(16).toUpperCase().padStart(bits / 4, "0")}`;
            }).join("\n");
        },
    },
    {
        id: "matrix-add-mul",
        label: "Matrix Add / Multiply / Transpose",
        description: "Two matrices (separated by a `---` line) added / multiplied; one matrix transposes. " + MATRIX_HELP,
        sample: "1 2\n3 4\n---\n5 6\n7 8",
        options: [{
            key: "op",
            label: "Op",
            kind: "select",
            choices: [["add", "A + B"], ["sub", "A − B"], ["mul", "A × B"], ["transpose", "Aᵀ"]],
            default: "mul"
        }],
        transform: (input, o) => {
            const parts = input.split(/^---\s*$/m);
            const A = parseMatrix(parts[0] ?? "");
            if (A.length === 0) return "Error: matrix A is empty.";
            if (o.op === "transpose") {
                const cols = Math.max(...A.map((r) => r.length));
                const out: number[][] = [];
                for (let c = 0; c < cols; c++) out.push(A.map((r) => r[c] ?? 0));
                return matrixToString(out);
            }
            const B = parseMatrix(parts[1] ?? "");
            if (B.length === 0) return "Error: add a `---` line then matrix B.";
            const colsA = Math.max(...A.map((r) => r.length));
            const rowsB = B.length;
            if (o.op === "mul" && colsA !== rowsB) return `Error: A has ${colsA} columns but B has ${rowsB} rows — cannot multiply.`;
            if (o.op !== "mul" && (A.length !== B.length || colsA !== Math.max(...B.map((r) => r.length)))) {
                return "Error: add/subtract need identical shapes.";
            }
            if (o.op === "add" || o.op === "sub") {
                return matrixToString(A.map((r, i) => r.map((v, j) => (o.op === "add" ? v + (B[i][j] ?? 0) : v - (B[i][j] ?? 0)))));
            }
            const out: number[][] = [];
            for (let i = 0; i < A.length; i++) {
                const row: number[] = [];
                for (let j = 0; j < (B[0]?.length ?? 0); j++) {
                    let s = 0;
                    for (let k = 0; k < colsA; k++) s += (A[i][k] ?? 0) * (B[k][j] ?? 0);
                    row.push(s);
                }
                out.push(row);
            }
            return matrixToString(out);
        },
    },
    {
        id: "matrix-det",
        label: "Matrix Determinant",
        description: "Determinant of a square matrix (Gaussian elimination with pivoting). " + MATRIX_HELP,
        sample: "4 3\n6 3",
        transform: (input) => {
            const m = parseMatrix(input);
            const n = m.length;
            if (n === 0 || m.some((r) => r.length !== n)) return "Error: need a SQUARE matrix (same row length as row count).";
            const a = m.map((r) => r.slice());
            let det = 1;
            for (let c = 0; c < n; c++) {
                let pivot = c;
                for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
                if (Math.abs(a[pivot][c]) < 1e-12) return "det = 0";
                if (pivot !== c) {
                    [a[c], a[pivot]] = [a[pivot], a[c]];
                    det = -det;
                }
                det *= a[c][c];
                for (let r = c + 1; r < n; r++) {
                    const f = a[r][c] / a[c][c];
                    for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
                }
            }
            return `det = ${roundTo(det, 8)}`;
        },
    },
    {
        id: "matrix-inverse",
        label: "Matrix Inverse (2×2)",
        description: "The inverse of a 2×2 matrix with its determinant.",
        sample: "4 7\n2 6",
        transform: (input) => {
            const m = parseMatrix(input);
            if (m.length !== 2 || m.some((r) => r.length !== 2)) return "Error: need a 2×2 matrix (two lines, two numbers).";
            const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
            if (Math.abs(det) < 1e-12) return "det = 0 → the matrix is singular (no inverse).";
            const inv = [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]];
            return `det = ${roundTo(det, 8)}\ninverse:\n${matrixToString(inv)}`;
        },
    },
    {
        id: "solve-quadratic",
        label: "Quadratic Solver",
        description: "Roots of ax² + bx + c = 0 — real or complex, with the discriminant and vertex.",
        sample: "1 -3 2",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 3) return "Error: coefficients a b c.";
            const [a, b, c] = nums;
            if (a === 0) return b === 0 ? "Not an equation (a = b = 0)." : `Linear: x = ${roundTo(-c / b, 8)}`;
            const disc = b * b - 4 * a * c;
            const vx = -b / (2 * a);
            const vy = c - (b * b) / (4 * a);
            const header = `a=${a} b=${b} c=${c} · discriminant = ${roundTo(disc, 8)} · vertex (${roundTo(vx, 6)}, ${roundTo(vy, 6)})`;
            if (disc >= 0) {
                const r1 = (-b + Math.sqrt(disc)) / (2 * a);
                const r2 = (-b - Math.sqrt(disc)) / (2 * a);
                return `${header}\nx₁ = ${roundTo(r1, 8)}\nx₂ = ${roundTo(r2, 8)}`;
            }
            const re = -b / (2 * a);
            const im = Math.sqrt(-disc) / (2 * a);
            return `${header}\nx₁ = ${roundTo(re, 8)} + ${roundTo(im, 8)}i\nx₂ = ${roundTo(re, 8)} − ${roundTo(im, 8)}i`;
        },
    },
    {
        id: "solve-linear2",
        label: "Linear System 2×2 Solver",
        description: "Solve a·x + b·y = e and c·x + d·y = f (Cramer's rule).",
        sample: "2 3 8\n1 -1 1",
        transform: (input) => {
            const rows = input.split(/\r?\n/).filter((l) => l.trim()).map((l) => parseNums(l));
            if (rows.length < 2 || rows.some((r) => r.length < 3)) return "Error: two lines, each `a b c` for a·x + b·y = c.";
            const [a, b, e] = rows[0];
            const [c, d, f] = rows[1];
            const det = a * d - b * c;
            if (Math.abs(det) < 1e-12) return `det = 0 → no unique solution (parallel or identical lines).`;
            return `det = ${roundTo(det, 8)}\nx = ${roundTo((e * d - b * f) / det, 8)}\ny = ${roundTo((a * f - e * c) / det, 8)}`;
        },
    },
    {
        id: "geom-distance",
        label: "Distance & Midpoint",
        description: "Euclidean distance + midpoint of two points (2D or 3D).",
        sample: "0 0\n3 4",
        transform: (input) => {
            const pts = input.split(/\r?\n/).filter((l) => l.trim()).map((l) => parseNums(l));
            if (pts.length < 2) return "Error: two lines — one point per line (2 or 3 coordinates).";
            const [p, q] = pts;
            if (p.length !== q.length) return "Error: points need the same dimension.";
            const dist = Math.sqrt(p.reduce((a, v, i) => a + (v - q[i]) ** 2, 0));
            const mid = p.map((v, i) => (v + q[i]) / 2);
            return `distance = ${roundTo(dist, 8)}\nmidpoint = (${mid.map((v) => roundTo(v, 6)).join(", ")})`;
        },
    },
    {
        id: "geom-pythagoras",
        label: "Pythagoras (a² + b² = c²)",
        description: "Solve the right-triangle sides: give two known sides, get the third.",
        sample: "3 4",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 2) return "Error: two values — a b (legs), or c plus one leg marked 0.";
            const [x, y] = nums;
            if (x > 0 && y > 0) {
                return `legs a=${x}, b=${y}\nc = √(a²+b²) = ${roundTo(Math.sqrt(x * x + y * y), 8)}\narea = ${roundTo((x * y) / 2, 8)}\nperimeter (with c) = ${roundTo(x + y + Math.sqrt(x * x + y * y), 8)}`;
            }
            const c = Math.max(x, y);
            const leg = Math.min(x, y);
            return `hypotenuse c=${c}, leg a=${leg}\nother leg b = √(c²−a²) = ${roundTo(Math.sqrt(c * c - leg * leg), 8)}`;
        },
        note: "Both > 0 → treated as the two legs. One 0 → the other is the hypotenuse and the missing leg is computed.",
    },
    {
        id: "geom-circle",
        label: "Circle From Radius / Diameter",
        description: "Area, circumference and diameter from the radius (or diameter mode).",
        sample: "5",
        options: [{
            key: "mode",
            label: "Input is",
            kind: "select",
            choices: [["r", "radius"], ["d", "diameter"]],
            default: "r"
        }],
        transform: (input, o) => {
            const v = Number(input.trim());
            if (!Number.isFinite(v) || v <= 0) return "Error: one positive number.";
            const r = o.mode === "d" ? v / 2 : v;
            return [
                `radius     ${roundTo(r, 8)}`,
                `diameter   ${roundTo(2 * r, 8)}`,
                `area       ${roundTo(Math.PI * r * r, 8)}`,
                `circumf.   ${roundTo(2 * Math.PI * r, 8)}`,
            ].join("\n");
        },
    },
    {
        id: "fin-compound",
        label: "Compound Interest",
        description: "Future value of a principal — P, r% per period, n periods, optional per-period deposit.",
        sample: "1000 5 10",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 3) return "Error: `P rate% periods` per line (optionally `P rate periods deposit`).";
            const [p, rate, n] = nums;
            const deposit = nums.length > 3 ? nums[3] : 0;
            const r = rate / 100;
            const fv = p * Math.pow(1 + r, n) + (deposit > 0 ? deposit * ((Math.pow(1 + r, n) - 1) / (r || 1)) : 0);
            return `principal ${p} @ ${rate}% × ${n} periods${deposit ? ` + ${deposit} per period` : ""}\nfuture value = ${roundTo(fv, 2)}\ninterest earned = ${roundTo(fv - p - deposit * n, 2)}`;
        },
    },
    {
        id: "fin-loan",
        label: "Loan / Mortgage Payment",
        description: "Monthly payment + total interest for an amortizing loan.",
        sample: "250000 6.5 30",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 3) return "Error: `amount annual_rate% years`.";
            const [amount, annualRate, years] = nums;
            const months = Math.round(years * 12);
            const r = annualRate / 100 / 12;
            const pay = r === 0 ? amount / months : (amount * r) / (1 - Math.pow(1 + r, -months));
            return [
                `loan ${roundTo(amount, 2)} · ${annualRate}% · ${months} months`,
                `monthly payment = ${roundTo(pay, 2)}`,
                `total paid = ${roundTo(pay * months, 2)}`,
                `total interest = ${roundTo(pay * months - amount, 2)}`,
            ].join("\n");
        },
    },
    {
        id: "fin-tip-split",
        label: "Tip & Bill Split",
        description: "Tip amounts and per-person shares for a bill.",
        sample: "84.50 15 3",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 2) return "Error: `bill tip% [people]`.";
            const [bill, tipPct, people = 1] = nums;
            const tip = bill * (tipPct / 100);
            const total = bill + tip;
            return [
                `bill ${roundTo(bill, 2)} + ${roundTo(tipPct, 2)}% tip`,
                `tip        ${roundTo(tip, 2)}`,
                `total      ${roundTo(total, 2)}`,
                `per person ${roundTo(total / Math.max(1, people), 2)} (${Math.max(1, Math.round(people))} ways)`,
            ].join("\n");
        },
    },
    {
        id: "fin-bmi",
        label: "BMI & BMR",
        description: "Body-mass index (metric/imperial) and the basal metabolic rate (Mifflin–St Jeor).",
        sample: "178 74 32",
        options: [{
            key: "unit",
            label: "Units",
            kind: "select",
            choices: [["metric", "kg / cm"], ["imperial", "lb / in"]],
            default: "metric"
        }],
        transform: (input, o) => {
            const nums = parseNums(input);
            if (nums.length < 3) return "Error: `weight height age` (+ optional 4th value = sex 1 male / 0 female).";
            let [w, h] = nums;
            const age = nums[2];
            const male = nums.length > 3 ? nums[3] === 1 : true;
            if (o.unit === "imperial") {
                w *= 0.45359237;
                h *= 2.54;
            }
            const m = h / 100;
            const bmi = w / (m * m);
            const bmr = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
            const cat = bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese";
            return `BMI = ${roundTo(bmi, 1)} (${cat})\nBMR ≈ ${roundTo(bmr, 0)} kcal/day (${male ? "male" : "female"}, Mifflin–St Jeor)`;
        },
    },
    {
        id: "num-round",
        label: "Round / Truncate / Significant",
        description: "Round to N decimals, truncate, or force N significant digits.",
        sample: "3.14159",
        options: [
            {
                key: "mode",
                label: "Mode",
                kind: "select",
                choices: [["round", "round"], ["floor", "floor"], ["ceil", "ceil"], ["trunc", "truncate"], ["sig", "significant"]],
                default: "round"
            },
            {
                key: "n",
                label: "N",
                kind: "select",
                choices: [["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"]],
                default: "2"
            },
        ],
        transform: (input, o) => {
            const n = parseInt(String(o.n), 10) || 0;
            return parseNums(input).map((x) => {
                if (o.mode === "sig") {
                    if (x === 0) return "0";
                    const d = n - 1 - Math.floor(Math.log10(Math.abs(x)));
                    return String(Number(x.toFixed(Math.max(0, d))));
                }
                if (o.mode === "round") return String(Number(x.toFixed(n)));
                if (o.mode === "floor") return String(Math.floor(x * 10 ** n) / 10 ** n);
                if (o.mode === "ceil") return String(Math.ceil(x * 10 ** n) / 10 ** n);
                return String(Math.trunc(x * 10 ** n) / 10 ** n);
            }).join("\n");
        },
    },
    {
        id: "num-random",
        label: "Random Numbers",
        description: "Random integers in a range, N at a time — unique or with repeats.",
        sample: "1 100 10",
        options: [{key: "unique", label: "Unique", kind: "toggle", default: true}],
        transform: (input, o) => {
            const nums = parseNums(input);
            const lo = nums.length > 0 ? nums[0] : 1;
            const hi = nums.length > 1 ? nums[1] : 100;
            const count = Math.min(1000, Math.max(1, nums.length > 2 ? Math.trunc(nums[2]) : 10));
            const span = Math.abs(hi - lo) + 1;
            const out: number[] = [];
            if (o.unique === true) {
                if (count > span) return `Error: ${count} unique values don't fit the range of ${span}.`;
                const pool = Array.from({length: span}, (_, i) => Math.min(lo, hi) + i);
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                out.push(...pool.slice(0, count));
            } else {
                for (let i = 0; i < count; i++) out.push(Math.min(lo, hi) + Math.floor(Math.random() * span));
            }
            return out.join("\n");
        },
        note: "Input: `min max count` (defaults 1 100 10).",
    },
    {
        id: "num-base-table",
        label: "One Number, All Bases",
        description: "A number in bin / oct / dec / hex at once (+ ASCII char when it fits).",
        sample: "65",
        transform: (input) =>
            parseNums(input).map((n) => {
                const u = Math.trunc(n) >>> 0;
                const ascii = u >= 32 && u < 127 ? `'${String.fromCharCode(u)}'` : "—";
                return `${n}\n  bin 0b${u.toString(2)}\n  oct 0o${u.toString(8)}\n  hex 0x${u.toString(16).toUpperCase()}\n  ascii ${ascii}`;
            }).join("\n\n"),
    },
    {
        id: "num-tolerance",
        label: "Number Compare (≈)",
        description: "Compare two numbers with a tolerance — the float-equality verdict tests never get right.",
        sample: "0.1+0.2 0.3 1e-9",
        transform: (input) => {
            const nums = parseNums(input);
            if (nums.length < 2) return "Error: `a b [tolerance]`.";
            const [a, b] = nums;
            const tol = nums.length > 2 ? nums[2] : 1e-9;
            const diff = Math.abs(a - b);
            return `|${roundTo(a, 12)} − ${roundTo(b, 12)}| = ${diff.toExponential(3)}\ntolerance = ${tol.toExponential(3)}\nverdict: ${diff <= tol ? "EQUAL within tolerance" : "NOT equal"}`;
        },
    },
    {
        id: "num-si-convert",
        label: "SI Prefix Converter",
        description: "Convert between metric prefixes — nano … giga for any unit name.",
        sample: "2500 m -> km\n3.2 kg -> g",
        transform: (input) => {
            const PRE: Record<string, number> = {
                y: 1e-24,
                z: 1e-21,
                a: 1e-18,
                f: 1e-15,
                p: 1e-12,
                n: 1e-9,
                u: 1e-6,
                m: 1e-3,
                c: 1e-2,
                d: 1e-1,
                "": 1,
                da: 10,
                h: 1e2,
                k: 1e3,
                M: 1e6,
                G: 1e9,
                T: 1e12,
                P: 1e15,
                E: 1e18,
                Z: 1e21,
                Y: 1e24
            };
            return input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const m = line.trim().match(/^([\d.]+)\s*(\S*)\s*(?:->|→|=)\s*(\S+)$/);
                if (!m) return `${line} → syntax: value unit -> target (e.g. 2500 m -> km)`;
                const n = Number(m[1]);
                const fromUnit = m[2] || m[3].replace(/^[a-zA-Z]*/, "") || "";
                const target = m[3];
                const base = (target.match(/^(da|[yzafpnumcdhkMGTPEZY]?)(.*)$/) ?? ["", "", target]);
                const from = fromUnit.match(/^(da|[yzafpnumcdhkMGTPEZY]?)(.*)$/);
                const fromPre = from?.[1] ?? "";
                const fromBase = from?.[2] ?? fromUnit;
                const toPre = base[1] ?? "";
                const toBase = base[2] ?? target;
                if (fromBase !== toBase) return `${line} → unit mismatch (${fromBase} vs ${toBase})`;
                const fp = PRE[fromPre] ?? 1;
                const tp = PRE[toPre] ?? 1;
                return `${line} = ${roundTo((n * fp) / tp, 10)} ${target}`;
            }).join("\n");
        },
        note: "Prefixes: y z a f p n µ m c d da h k M G T P E Z Y. Same base unit required.",
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const MATH_TOOL_ENTRIES = MATH_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
