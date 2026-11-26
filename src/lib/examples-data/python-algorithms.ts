/**
 * Python — Algorithms examples. Category: "Algorithms".
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {fn, mkExample, vr} from "./_helpers";

const CAT = "Algorithms";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_ALGORITHMS_EXAMPLES: FileExample[] = [
    // ─── Numbers & math ──────────────────────────────────────────────
    py("py-ex-gcd-lcm", "GCD & LCM", "Euclid's algorithm by hand vs math.gcd/lcm.", "Numbers & math", "gcd_lcm",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Euclid's algorithm — the oldest algorithm still in daily use."""
import math


def ${f("gcd_euclid")}(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


def ${f("lcm_pair")}(a: int, b: int) -> int:
    return a * b // ${f("gcd_euclid")}(a, b)


${v("pairs")} = [(48, 18), (270, 192), (17, 5), (120, 120)]
for ${v("a")}, ${v("b")} in ${v("pairs")}:
    ${v("mine")} = ${f("gcd_euclid")}(${v("a")}, ${v("b")})
    ${v("stdlib")} = math.gcd(${v("a")}, ${v("b")})
    ${v("ok")} = "ok" if ${v("mine")} == ${v("stdlib")} else "MISMATCH"
    print(f"gcd({${v('a')}}, {${v('b')}}) = {${v('mine')}:<4} lcm = {${f('lcm_pair')}(${v('a')}, ${v('b')}):<5} {${v('ok')}}")
`;
        }),
    py("py-ex-prime-sieve", "Sieve of Eratosthenes", "All primes below 100 in 15 lines — plus a density check.", "Numbers & math", "prime_sieve",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The sieve: strike out every multiple, what remains is prime."""


def ${f("sieve")}(limit: int) -> list[int]:
    ${v("is_prime")} = [True] * limit
    ${v("is_prime")}[0:2] = [False, False]
    for ${v("n")} in range(2, int(limit ** 0.5) + 1):
        if ${v("is_prime")}[${v("n")}]:
            for ${v("multiple")} in range(${v("n")} * ${v("n")}, limit, ${v("n")}):
                ${v("is_prime")}[${v("multiple")}] = False
    return [n for n, prime in enumerate(${v("is_prime")}) if prime]


${v("primes")} = ${f("sieve")}(100)
print(f"primes < 100 : {${v("primes")}}")
print(f"count        : {len(${v("primes")})}  (pi(100) = 25)")

${v("big_primes")} = ${f("sieve")}(1_000_000)
${v("share")} = len(${v("big_primes")}) / 1_000_000
print(f"primes < 1M : {len(${v("big_primes")})}  (density {${v("share")}:.4f} ~ 1/ln(1M) = {0.0648:.4f})")
`;
        }),
    py("py-ex-prime-factors", "Prime factorization", "Trial division with a wheel — factor any int64 in a blink.", "Numbers & math", "prime_factors",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Prime factorization by trial division."""


def ${f("factorize")}(n: int) -> list[int]:
    ${v("factors")} = []
    ${v("d")} = 2
    while ${v("d")} * ${v("d")} <= n:
        while n % ${v("d")} == 0:
            ${v("factors")}.append(${v("d")})
            n //= ${v("d")}
        ${v("d")} += 1 if ${v("d")} == 2 else 2
    if n > 1:
        ${v("factors")}.append(n)
    return ${v("factors")}


for ${v("n")} in [360, 1024, 9991, 2 ** 5 * 3 ** 4 * 5 ** 2, 10 ** 12 + 39]:
    ${v("factors")} = ${f("factorize")}(${v("n")})
    ${v("product")} = 1
    for f in ${v("factors")}:
        ${v("product")} *= f
    ${v("ok")} = "ok" if ${v("product")} == ${v("n")} else "MISMATCH"
    print(f"{${v("n")}:>15} = {' × '.join(str(f) for f in ${v("factors")})}  [{${v("ok")}}]")
`;
        }),
    py("py-ex-fast-power", "Fast exponentiation", "Square-and-multiply: a**b mod m in O(log b) — big-M fermat test.", "Numbers & math", "fast_power",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Modular exponentiation without ever building a huge number."""


def ${f("power_mod")}(base: int, exp: int, mod: int) -> int:
    ${v("result")} = 1
    ${v("base")} %= mod
    while exp > 0:
        if exp & 1:
            ${v("result")} = ${v("result")} * ${v("base")} % mod
        ${v("base")} = ${v("base")} * ${v("base")} % mod
        exp >>= 1
    return ${v("result")}


print(f"3^100 mod 7   : {${f("power_mod")}(3, 100, 7)}  (pow: {pow(3, 100, 7)})")
print(f"2^1000 mod 101: {${f("power_mod")}(2, 1000, 101)}  (pow: {pow(2, 1000, 101)})")

${v("prime_candidate")} = 1_000_000_007
${v("witness")} = 2
${v("residue")} = ${f("power_mod")}(${v("witness")}, ${v("prime_candidate")} - 1, ${v("prime_candidate")})
print(f"2^(p-1) mod {${v("prime_candidate")}} = {${v("residue")}}  -> Fermat probable prime: {${v("residue")} == 1}")
`;
        }),
    py("py-ex-newton-sqrt", "Newton's square root", "Iterative refinement vs math.sqrt — converge in 6 steps.", "Numbers & math", "newton_sqrt",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Newton's method: x_{n+1} = (x_n + N/x_n) / 2."""
import math


def ${f("newton_sqrt")}(n: float, tolerance: float = 1e-12) -> tuple[float, int]:
    if n < 0:
        raise ValueError("negative input")
    ${v("guess")} = n if n >= 1 else 1.0
    ${v("steps")} = 0
    while ${v("steps")} < 100:
        ${v("next_guess")} = (${v("guess")} + n / ${v("guess")}) / 2
        if ${v("next_guess")} == ${v("guess")}:
            break  # float resolution reached
        ${v("guess")} = ${v("next_guess")}
        ${v("steps")} += 1
    return ${v("guess")}, ${v("steps")}


for ${v("n")} in [2, 25, 1e6, 12345.678]:
    ${v("root")}, ${v("steps")} = ${f("newton_sqrt")}(${v("n")})
    ${v("error")} = abs(${v("root")} - math.sqrt(${v("n")}))
    print(f"sqrt({${v("n")}}) = {${v("root")}:>12.6f}  in {${v("steps")}} steps  (error {${v("error")}:.2e})")
`;
        }),
    py("py-ex-collatz", "Collatz conjecture", "The 3n+1 sequence — every start tested so far falls to 1.", "Numbers & math", "collatz",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Collatz: halve if even, 3n+1 if odd. Nobody has escaped."""


def ${f("collatz_length")}(start: int) -> int:
    ${v("n")} = start
    ${v("steps")} = 0
    while ${v("n")} != 1:
        ${v("n")} = ${v("n")} // 2 if ${v("n")} % 2 == 0 else 3 * ${v("n")} + 1
        ${v("steps")} += 1
    return ${v("steps")}


${v("longest_start")}, ${v("longest_length")} = 1, 0
for ${v("start")} in range(1, 10_001):
    ${v("length")} = ${f("collatz_length")}(${v("start")})
    if ${v("length")} > ${v("longest_length")}:
        ${v("longest_start")}, ${v("longest_length")} = ${v("start")}, ${v("length")}

print(f"longest chain below 10,000: starts at {${v("longest_start")}}, {${v("longest_length")}} steps")
${v("sequence")} = [27]
while ${v("sequence")}[-1] != 1:
    ${v("n")} = ${v("sequence")}[-1]
    ${v("sequence")}.append(${v("n")} // 2 if ${v("n")} % 2 == 0 else 3 * ${v("n")} + 1)
print(f"n=27 peaks at {max(${v("sequence")})} over {len(${v("sequence")}) - 1} steps")
`;
        }),
    py("py-ex-perfect-numbers", "Perfect numbers", "Numbers equal to the sum of their divisors — Euclid's formula finds them.", "Numbers & math", "perfect_numbers",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Perfect numbers via Euclid: 2^(p-1) * (2^p - 1) for prime p."""


def ${f("is_perfect")}(n: int) -> bool:
    if n < 2:
        return False
    ${v("total")} = 1
    for ${v("d")} in range(2, int(n ** 0.5) + 1):
        if n % ${v("d")} == 0:
            ${v("total")} += ${v("d")} + n // ${v("d")}
    return ${v("total")} == n


def ${f("mersenne_primes")}(limit_p: int) -> list[int]:
    ${v("found")} = []
    for p in range(2, limit_p):
        ${v("candidate")} = 2 ** p - 1
        if all(${v("candidate")} % d for d in range(2, int(${v("candidate")} ** 0.5) + 1)):
            ${v("found")}.append(2 ** (p - 1) * ${v("candidate")})
    return ${v("found")}


print(f"by definition   : {[n for n in range(2, 10_000) if ${f("is_perfect")}(n)]}")
print(f"Euclid's formula: {${f("mersenne_primes")}(14)}")
`;
        }),

    // ─── Searching & sorting ─────────────────────────────────────────
    py("py-ex-fibonacci", "Fibonacci (memoized)", "Recursion + functools cache + an iterative variant for contrast.", "Searching & sorting", "fibonacci",
        (s) => `# -*- coding: utf-8 -*-
"""Fibonacci three ways: naive recursion, memoized, iterative."""
from functools import lru_cache


def ${applyNamingStyle(s.functions, "fib_naive")}(n: int) -> int:
    if n < 2:
        return n
    return ${applyNamingStyle(s.functions, "fib_naive")}(n - 1) + ${applyNamingStyle(s.functions, "fib_naive")}(n - 2)


@lru_cache(maxsize=None)
def ${applyNamingStyle(s.functions, "fib_cached")}(n: int) -> int:
    if n < 2:
        return n
    return ${applyNamingStyle(s.functions, "fib_cached")}(n - 1) + ${applyNamingStyle(s.functions, "fib_cached")}(n - 2)


def ${applyNamingStyle(s.functions, "fib_iterative")}(n: int) -> int:
    ${applyNamingStyle(s.variables, "a")}, ${applyNamingStyle(s.variables, "b")} = 0, 1
    for _ in range(n):
        ${applyNamingStyle(s.variables, "a")}, ${applyNamingStyle(s.variables, "b")} = ${applyNamingStyle(s.variables, "b")}, ${applyNamingStyle(s.variables, "a")} + ${applyNamingStyle(s.variables, "b")}
    return ${applyNamingStyle(s.variables, "a")}


for i in range(15):
    print(f"fib({i:>2}) = {${applyNamingStyle(s.functions, "fib_iterative")}(i)}")

print(f"cached fib(90) = {${applyNamingStyle(s.functions, "fib_cached")}(90)}")
`),
    py("py-ex-binary-search", "Binary search (bisect)", "bisect-based insert + search on a sorted list, with a step trace.", "Searching & sorting", "binary_search",
        (s) => `# -*- coding: utf-8 -*-
"""Binary search with the bisect module + a manual trace."""
import bisect

${applyNamingStyle(s.variables, "sorted_values")} = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]


def ${applyNamingStyle(s.functions, "contains")}(values: list[int], target: int) -> bool:
    ${applyNamingStyle(s.variables, "pos")} = bisect.bisect_left(values, target)
    return ${applyNamingStyle(s.variables, "pos")} < len(values) and values[${applyNamingStyle(s.variables, "pos")}] == target


for ${applyNamingStyle(s.variables, "target")} in [23, 24, 1, 91, 100]:
    print(f"{${applyNamingStyle(s.variables, "target")}:>3} in list: {${applyNamingStyle(s.functions, "contains")}(${applyNamingStyle(s.variables, "sorted_values")}, ${applyNamingStyle(s.variables, "target")})}")

${applyNamingStyle(s.variables, "insert_at")} = bisect.bisect(${applyNamingStyle(s.variables, "sorted_values")}, 30)
${applyNamingStyle(s.variables, "sorted_values")}.insert(${applyNamingStyle(s.variables, "insert_at")}, 30)
print("after insert:", ${applyNamingStyle(s.variables, "sorted_values")})


def ${applyNamingStyle(s.functions, "binary_search_trace")}(values: list[int], target: int) -> int:
    ${applyNamingStyle(s.variables, "lo")}, ${applyNamingStyle(s.variables, "hi")} = 0, len(values) - 1
    while ${applyNamingStyle(s.variables, "lo")} <= ${applyNamingStyle(s.variables, "hi")}:
        ${applyNamingStyle(s.variables, "mid")} = (${applyNamingStyle(s.variables, "lo")} + ${applyNamingStyle(s.variables, "hi")}) // 2
        print(f"  lo={${applyNamingStyle(s.variables, "lo")}} hi={${applyNamingStyle(s.variables, "hi")}} mid={${applyNamingStyle(s.variables, "mid")}} -> {values[${applyNamingStyle(s.variables, "mid")}]}"${applyNamingStyle(s.variables, "")})
        if values[${applyNamingStyle(s.variables, "mid")}] == target:
            return ${applyNamingStyle(s.variables, "mid")}
        if values[${applyNamingStyle(s.variables, "mid")}] < target:
            ${applyNamingStyle(s.variables, "lo")} = ${applyNamingStyle(s.variables, "mid")} + 1
        else:
            ${applyNamingStyle(s.variables, "hi")} = ${applyNamingStyle(s.variables, "mid")} - 1
    return -1


print("trace for 72:")
print("  found at index", ${applyNamingStyle(s.functions, "binary_search_trace")}(${applyNamingStyle(s.variables, "sorted_values")}, 72))
`),
    py("py-ex-quicksort", "Quicksort", "In-place partition quicksort with a comparison counter.", "Searching & sorting", "quicksort",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Quicksort with Lomuto partition + instrumented comparisons."""
import random


def ${f("quicksort")}(items: list, lo: int = 0, hi: int | None = None) -> None:
    ${v("count_ref")} = globals().get("comparisons", [0])
    if hi is None:
        hi = len(items) - 1
    if lo >= hi:
        return
    ${v("pivot")} = items[hi]
    ${v("store")} = lo
    for ${v("i")} in range(lo, hi):
        globals()["comparisons"][0] += 1
        if items[${v("i")}] <= ${v("pivot")}:
            items[${v("store")}], items[${v("i")}] = items[${v("i")}], items[${v("store")}]
            ${v("store")} += 1
        items[${v("store")}], items[${v("i")}] = items[${v("i")}], items[${v("store")}]
    ${f("quicksort")}(items, lo, ${v("store")} - 1)
    ${f("quicksort")}(items, ${v("store")} + 1, hi)


random.seed(4)
${v("data")} = [random.randint(0, 99) for _ in range(25)]
globals()["comparisons"] = [0]
${f("quicksort")}(${v("data")})
print(f"sorted   : {${v("data")}}")
print(f"correct? : {${v("data")} == sorted(${v("data")})}")
print(f"comparisons: {globals()['comparisons'][0]} (n log n ~ {25 * 5:.0f})")
`;
        }),
    py("py-ex-mergesort", "Mergesort", "Stable divide-and-conquer sort — the database workhorse.", "Searching & sorting", "mergesort",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Mergesort: split, sort halves, merge with stability."""


def ${f("mergesort")}(items: list) -> list:
    if len(items) <= 1:
        return items
    ${v("mid")} = len(items) // 2
    ${v("left")} = ${f("mergesort")}(items[:${v("mid")}])
    ${v("right")} = ${f("mergesort")}(items[${v("mid")}:])
    return ${f("merge")}(${v("left")}, ${v("right")})


def ${f("merge")}(left: list, right: list) -> list:
    ${v("result")} = []
    ${v("i")} = ${v("j")} = 0
    while ${v("i")} < len(left) and ${v("j")} < len(right):
        if left[${v("i")}] <= right[${v("j")}]:  # <= keeps it stable
            ${v("result")}.append(left[${v("i")}])
            ${v("i")} += 1
        else:
            ${v("result")}.append(right[${v("j")}])
            ${v("j")} += 1
    ${v("result")}.extend(left[${v("i")}:])
    ${v("result")}.extend(right[${v("j")}:])
    return ${v("result")}


${v("data")} = [38, 27, 43, 3, 9, 82, 10, 3]
print(f"input  : {${v("data")}}")
print(f"sorted : {${f("mergesort")}(${v("data")})}")

${v("pairs")} = [(3, "a"), (1, "b"), (3, "c"), (1, "d")]
${v("stable")} = ${f("mergesort")}((${v("pairs")}))
print(f"stable : {${v("stable")}}  (equal keys keep their order)")
`;
        }),
    py("py-ex-insertion-bubble", "Insertion & bubble sort", "The two teaching sorts — small n, big clarity.", "Searching & sorting", "insertion_bubble",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Insertion sort and bubble sort, side by side."""


def ${f("insertion_sort")}(items: list) -> list:
    for ${v("i")} in range(1, len(items)):
        ${v("key")} = items[${v("i")}]
        ${v("j")} = ${v("i")} - 1
        while ${v("j")} >= 0 and items[${v("j")}] > ${v("key")}:
            items[${v("j")} + 1] = items[${v("j")}]
            ${v("j")} -= 1
        items[${v("j")} + 1] = ${v("key")}
    return items


def ${f("bubble_sort")}(items: list) -> list:
    ${v("n")} = len(items)
    for ${v("pass_num")} in range(${v("n")} - 1):
        ${v("swapped")} = False
        for ${v("i")} in range(${v("n")} - 1 - ${v("pass_num")}):
            if items[${v("i")}] > items[${v("i")} + 1]:
                items[${v("i")}], items[${v("i")} + 1] = items[${v("i")} + 1], items[${v("i")}]
                ${v("swapped")} = True
        if not ${v("swapped")}:
            break
    return items


${v("data")} = [5, 1, 4, 2, 8, 0, 3]
print(f"original : {${v("data")}}")
print(f"insertion: {${f("insertion_sort")}(${v("data")}.copy())}")
print(f"bubble   : {${f("bubble_sort")}(${v("data")}.copy())}")
`;
        }),
    py("py-ex-counting-sort", "Counting sort", "O(n+k) sorting for small integer ranges — beats comparison sorts.", "Searching & sorting", "counting_sort",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Counting sort: tally, then rebuild — no comparisons at all."""


def ${f("counting_sort")}(items: list[int]) -> list[int]:
    if not items:
        return []
    ${v("lo")}, ${v("hi")} = min(items), max(items)
    ${v("counts")} = [0] * (${v("hi")} - ${v("lo")} + 1)
    for x in items:
        ${v("counts")}[x - ${v("lo")}] += 1
    ${v("result")} = []
    for ${v("value")}, ${v("count")} in enumerate(${v("counts")}):
        ${v("result")}.extend([${v("value")} + ${v("lo")}] * ${v("count")})
    return ${v("result")}


import random
random.seed(9)
${v("scores")} = [random.randint(40, 100) for _ in range(30)]
print(f"input : {${v("scores")}}")
print(f"sorted: {${f("counting_sort")}(${v("scores")})}")
print(f"match : {${f("counting_sort")}(${v("scores")}) == sorted(${v("scores")})}")
`;
        }),
    py("py-ex-heapq", "Priority queue (heapq)", "Heaps: top-k, streaming medians, and scheduling order.", "Searching & sorting", "priority_queue",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""heapq — the priority queue in the standard library."""
import heapq
import random

random.seed(6)
${v("tasks")} = [
    (2, "compile"),
    (1, "fetch"),
    (5, "deploy"),
    (1, "clean"),
    (3, "test"),
]

${v("heap")} = list(${v("tasks")})
heapq.heapify(${v("heap")})
print("execution order:")
while ${v("heap")}:
    ${v("priority")}, ${v("task")} = heapq.heappop(${v("heap")})
    print(f"  [{${v("priority")}}] {${v("task")}}")

${v("stream")} = [random.gauss(50, 10) for _ in range(15)]
${v("top3")} = heapq.nlargest(3, ${v("stream")})
print(f"top 3 of stream: {[round(x, 1) for x in ${v("top3")}]}")

${v("low")} = []
${v("high")} = []
for x in ${v("stream")}:
    if not ${v("low")} or x <= -${v("low")}[0]:
        heapq.heappush(${v("low")}, -x)
    else:
        heapq.heappush(${v("high")}, x)
    if len(${v("low")}) > len(${v("high")}) + 1:
        heapq.heappush(${v("high")}, -heapq.heappop(${v("low")}))
    elif len(${v("high")}) > len(${v("low")}):
        heapq.heappush(${v("low")}, -heapq.heappop(${v("high")}))
print(f"streaming median: {-${v("low")}[0]:.1f}  (sorted median: {sorted(${v("stream")})[7]:.1f})")
`;
        }),

    // ─── Dynamic programming ─────────────────────────────────────────
    py("py-ex-knapsack", "0/1 knapsack (DP)", "Bottom-up DP table for the classic capacity problem.", "Dynamic programming", "knapsack",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""0/1 knapsack: take it or leave it, capacity 10."""


def ${f("knapsack")}(weights: list[int], values: list[int], capacity: int) -> int:
    ${v("n")} = len(weights)
    ${v("table")} = [[0] * (capacity + 1) for _ in range(${v("n")} + 1)]
    for ${v("i")} in range(1, ${v("n")} + 1):
        for ${v("w")} in range(capacity + 1):
            ${v("table")}[${v("i")}][${v("w")}] = ${v("table")}[${v("i")} - 1][${v("w")}]
            if weights[${v("i")} - 1] <= ${v("w")}:
                ${v("candidate")} = ${v("table")}[${v("i")} - 1][${v("w")} - weights[${v("i")} - 1]] + values[${v("i")} - 1]
                ${v("table")}[${v("i")}][${v("w")}] = max(${v("table")}[${v("i")}][${v("w")}], ${v("candidate")})
    return ${v("table")}[${v("n")}][capacity]


def ${f("knapsack_items")}(weights: list[int], values: list[int], capacity: int) -> list[int]:
    ${v("n")} = len(weights)
    ${v("table")} = [[0] * (capacity + 1) for _ in range(${v("n")} + 1)]
    for ${v("i")} in range(1, ${v("n")} + 1):
        for ${v("w")} in range(capacity + 1):
            ${v("table")}[${v("i")}][${v("w")}] = ${v("table")}[${v("i")} - 1][${v("w")}]
            if weights[${v("i")} - 1] <= ${v("w")}:
                ${v("candidate")} = ${v("table")}[${v("i")} - 1][${v("w")} - weights[${v("i")} - 1]] + values[${v("i")} - 1]
                ${v("table")}[${v("i")}][${v("w")}] = max(${v("table")}[${v("i")}][${v("w")}], ${v("candidate")})
    ${v("chosen")} = []
    ${v("w")} = capacity
    for ${v("i")} in range(${v("n")}, 0, -1):
        if ${v("table")}[${v("i")}][${v("w")}] != ${v("table")}[${v("i")} - 1][${v("w")}]:
            ${v("chosen")}.append(${v("i")} - 1)
            ${v("w")} -= weights[${v("i")} - 1]
    return list(reversed(${v("chosen")}))


${v("weights")} = [3, 4, 5, 8, 10]
${v("values")} = [4, 5, 6, 10, 12]
print(f"weights : {${v("weights")}}")
print(f"values  : {${v("values")}}")
print(f"best value for capacity 10: {${f("knapsack")}(${v("weights")}, ${v("values")}, 10)}")
print(f"items taken: {${f("knapsack_items")}(${v("weights")}, ${v("values")}, 10)}")
`;
        }),
    py("py-ex-lcs", "Longest common subsequence", "DP table + backtrace for the diff-tool core algorithm.", "Dynamic programming", "lcs",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""LCS — what git diff computes between two versions."""


def ${f("lcs_length")}(a: str, b: str) -> list[list[int]]:
    ${v("table")} = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for ${v("i")} in range(1, len(a) + 1):
        for ${v("j")} in range(1, len(b) + 1):
            if a[${v("i")} - 1] == b[${v("j")} - 1]:
                ${v("table")}[${v("i")}][${v("j")}] = ${v("table")}[${v("i")} - 1][${v("j")} - 1] + 1
            else:
                ${v("table")}[${v("i")}][${v("j")}] = max(${v("table")}[${v("i")} - 1][${v("j")}], ${v("table")}[${v("i")}][${v("j")} - 1])
    return ${v("table")}


def ${f("lcs_string")}(a: str, b: str) -> str:
    ${v("table")} = ${f("lcs_length")}(a, b)
    ${v("result")} = []
    ${v("i")}, ${v("j")} = len(a), len(b)
    while ${v("i")} > 0 and ${v("j")} > 0:
        if a[${v("i")} - 1] == b[${v("j")} - 1]:
            ${v("result")}.append(a[${v("i")} - 1])
            ${v("i")} -= 1
            ${v("j")} -= 1
        elif ${v("table")}[${v("i")} - 1][${v("j")}] >= ${v("table")}[${v("i")}][${v("j")} - 1]:
            ${v("i")} -= 1
        else:
            ${v("j")} -= 1
    return "".join(reversed(${v("result")}))


${v("old")} = "praxis ide"
${v("new")} = "practical ideas"
print(f"a: {${v("old")}!r}")
print(f"b: {${v("new")}!r}")
print(f"LCS: {${f("lcs_string")}(${v("old")}, ${v("new")})!r}  (length {len(${f("lcs_string")}(${v("old")}, ${v("new")}))})")
`;
        }),
    py("py-ex-edit-distance", "Edit distance (Levenshtein)", "Minimum insert/delete/substitute operations between two words.", "Dynamic programming", "edit_distance",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Levenshtein distance with a space-optimized DP row."""


def ${f("edit_distance")}(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    ${v("previous")} = list(range(len(b) + 1))
    for ${v("i")}, ${v("ca")} in enumerate(a, start=1):
        ${v("current")} = [${v("i")}]
        for ${v("j")}, ${v("cb")} in enumerate(b, start=1):
            ${v("cost")} = 0 if ${v("ca")} == ${v("cb")} else 1
            ${v("current")}.append(min(
                ${v("previous")}[${v("j")}] + 1,
                ${v("current")}[${v("j")} - 1] + 1,
                ${v("previous")}[${v("j")} - 1] + ${v("cost")},
            ))
        ${v("previous")} = ${v("current")}
    return ${v("previous")}[-1]


${v("tests")} = [("kitten", "sitting"), ("flaw", "lawn"), ("praxis", "practical"), ("", "abc")]
for ${v("a")}, ${v("b")} in ${v("tests")}:
    print(f"distance({${v("a")}!r:>11}, {${v("b")}!r:>12}) = {${f("edit_distance")}(${v("a")}, ${v("b")})}")
`;
        }),
    py("py-ex-coin-change", "Coin change (DP)", "Fewest coins to make an amount — greedy fails, DP doesn't.", "Dynamic programming", "coin_change",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Coin change: why greedy needs checking before trusting."""


def ${f("min_coins")}(coins: list[int], amount: int) -> int | None:
    ${v("best")} = [0] + [None] * amount
    for ${v("target")} in range(1, amount + 1):
        for ${v("coin")} in coins:
            if ${v("coin")} <= ${v("target")} and ${v("best")}[${v("target")} - ${v("coin")}] is not None:
                ${v("candidate")} = ${v("best")}[${v("target")} - ${v("coin")}] + 1
                if ${v("best")}[${v("target")}] is None or ${v("candidate")} < ${v("best")}[${v("target")}]:
                    ${v("best")}[${v("target")}] = ${v("candidate")}
    return ${v("best")}[amount]


def ${f("greedy_coins")}(coins: list[int], amount: int) -> list[int]:
    ${v("picked")} = []
    for ${v("coin")} in sorted(coins, reverse=True):
        while ${v("coin")} <= amount:
            ${v("picked")}.append(${v("coin")})
            amount -= ${v("coin")}
    return ${v("picked")}


${v("coins")} = [1, 4, 5]
${v("amount")} = 13
print(f"coins: {${v("coins")}}, amount: {${v("amount")}}")
print(f"greedy picks : {${f("greedy_coins")}(${v("coins")}, ${v("amount")})} -> {len(${f("greedy_coins")}(${v("coins")}, ${v("amount")}))} coins")
print(f"DP optimum   : {${f("min_coins")}(${v("coins")}, ${v("amount")})} coins  (4+4+5)")
print(f"greedy is optimal for US coins: {len(${f("greedy_coins")}([1, 5, 10, 25], 63))} == {${f("min_coins")}([1, 5, 10, 25], 63)}")
`;
        }),
    py("py-ex-lis", "Longest increasing subsequence", "O(n log n) patience-sorting version of the classic.", "Dynamic programming", "lis",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""LIS in O(n log n) with binary search."""


def ${f("lis_length")}(items: list[int]) -> int:
    ${v("tails")} = []
    for x in items:
        ${v("lo")}, ${v("hi")} = 0, len(${v("tails")})
        while ${v("lo")} < ${v("hi")}:
            ${v("mid")} = (${v("lo")} + ${v("hi")}) // 2
            if ${v("tails")}[${v("mid")}] < x:
                ${v("lo")} = ${v("mid")} + 1
            else:
                ${v("hi")} = ${v("mid")}
        if ${v("lo")} == len(${v("tails")}):
            ${v("tails")}.append(x)
        else:
            ${v("tails")}[${v("lo")}] = x
    return len(${v("tails")})


${v("sequences")} = [
    [10, 9, 2, 5, 3, 7, 101, 18],
    [3, 10, 2, 1, 20],
    [50, 3, 10, 7, 40, 80],
    list(range(10, 0, -1)),
]
for ${v("seq")} in ${v("sequences")}:
    print(f"{str(${v("seq")}):<32} LIS length = {${f("lis_length")}(${v("seq")})}")
`;
        }),

    // ─── Graphs ──────────────────────────────────────────────────────
    py("py-ex-bfs", "BFS on a grid", "Breadth-first flood fill — shortest paths on an unweighted maze.", "Graphs", "bfs_grid",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""BFS shortest path across a text maze."""
from collections import deque

${v("maze")} = [
    "S.#........",
    ".#.#.####.#",
    ".#...#....#",
    ".#####.##.#",
    ".......#..G",
]


def ${f("bfs_path")}(maze: list[str]) -> list[tuple[int, int]] | None:
    ${v("rows")}, ${v("cols")} = len(maze), len(maze[0])
    ${v("start")} = next((r, c) for r in range(${v("rows")}) for c in range(${v("cols")}) if maze[r][c] == "S")
    ${v("goal")} = next((r, c) for r in range(${v("rows")}) for c in range(${v("cols")}) if maze[r][c] == "G")

    ${v("queue")} = deque([${v("start")}])
    ${v("came_from")} = {${v("start")}: None}
    while ${v("queue")}:
        ${v("current")} = ${v("queue")}.popleft()
        if ${v("current")} == ${v("goal")}:
            ${v("path")} = []
            while ${v("current")} is not None:
                ${v("path")}.append(${v("current")})
                ${v("current")} = ${v("came_from")}[${v("current")}]
            return list(reversed(${v("path")}))
        ${v("r")}, ${v("c")} = ${v("current")}
        for ${v("dr")}, ${v("dc")} in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ${v("nr")}, ${v("nc")} = ${v("r")} + ${v("dr")}, ${v("c")} + ${v("dc")}
            if 0 <= ${v("nr")} < ${v("rows")} and 0 <= ${v("nc")} < ${v("cols")} and maze[${v("nr")}][${v("nc")}] != "#" and (${v("nr")}, ${v("nc")}) not in ${v("came_from")}:
                ${v("came_from")}[${v("nr")}, ${v("nc")}] = ${v("current")}
                ${v("queue")}.append((${v("nr")}, ${v("nc")}))
    return None


${v("path")} = ${f("bfs_path")}(${v("maze")})
print(f"shortest path: {len(${v("path")}) - 1} moves")
${v("grid")} = [list(row) for row in ${v("maze")}]
for ${v("r")}, ${v("c")} in ${v("path")}:
    if ${v("grid")}[${v("r")}][${v("c")}] == ".":
        ${v("grid")}[${v("r")}][${v("c")}] = "*"
print("\\n".join("".join(row) for row in ${v("grid")}))
`;
        }),
    py("py-ex-dfs", "DFS traversal", "Depth-first search with recursion and an explicit stack.", "Graphs", "dfs_traversal",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""DFS two ways: recursive and iterative."""


def ${f("dfs_recursive")}(graph: dict, node: str, visited: set | None = None, order: list | None = None) -> list:
    if visited is None:
        visited, order = set(), []
    visited.add(node)
    order.append(node)
    for ${v("neighbor")} in sorted(graph.get(node, [])):
        if ${v("neighbor")} not in visited:
            ${f("dfs_recursive")}(graph, ${v("neighbor")}, visited, order)
    return order


def ${f("dfs_iterative")}(graph: dict, start: str) -> list:
    ${v("visited")} = set()
    ${v("order")} = []
    ${v("stack")} = [start]
    while ${v("stack")}:
        ${v("node")} = ${v("stack")}.pop()
        if ${v("node")} in ${v("visited")}:
            continue
        ${v("visited")}.add(${v("node")})
        ${v("order")}.append(${v("node")})
        ${v("stack")}.extend(sorted(graph.get(${v("node")}, []), reverse=True))
    return ${v("order")}


${v("graph")} = {
    "A": ["B", "C"],
    "B": ["D", "E"],
    "C": ["F"],
    "D": [],
    "E": ["F"],
    "F": [],
}
print(f"recursive: {' -> '.join(${f("dfs_recursive")}(${v("graph")}, 'A'))}")
print(f"iterative: {' -> '.join(${f("dfs_iterative")}(${v("graph")}, 'A'))}")
`;
        }),
    py("py-ex-dijkstra", "Dijkstra shortest paths", "Priority-queue shortest path over a weighted graph.", "Graphs", "dijkstra",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Dijkstra with a heap — weighted shortest paths."""
import heapq

${v("graph")} = {
    "A": {"B": 4, "C": 2},
    "B": {"D": 5},
    "C": {"B": 1, "D": 8, "E": 10},
    "D": {"E": 2},
    "E": {},
}


def ${f("dijkstra")}(graph: dict, start: str) -> tuple[dict, dict]:
    ${v("distances")} = {start: 0}
    ${v("previous")} = {start: None}
    ${v("heap")} = [(0, start)]
    ${v("visited")} = set()
    while ${v("heap")}:
        ${v("distance")}, ${v("node")} = heapq.heappop(${v("heap")})
        if ${v("node")} in ${v("visited")}:
            continue
        ${v("visited")}.add(${v("node")})
        for ${v("neighbor")}, ${v("weight")} in graph.get(${v("node")}, {}).items():
            ${v("new_distance")} = ${v("distance")} + ${v("weight")}
            if ${v("new_distance")} < ${v("distances")}.get(${v("neighbor")}, float("inf")):
                ${v("distances")}[${v("neighbor")}] = ${v("new_distance")}
                ${v("previous")}[${v("neighbor")}] = ${v("node")}
                heapq.heappush(${v("heap")}, (${v("new_distance")}, ${v("neighbor")}))
    return ${v("distances")}, ${v("previous")}


def ${f("rebuild_path")}(previous: dict, target: str) -> list:
    ${v("path")} = [target]
    while ${v("previous")}[${v("path")}[-1]] is not None:
        ${v("path")}.append(${v("previous")}[${v("path")}[-1]])
    return list(reversed(${v("path")}))


${v("distances")}, ${v("previous")} = ${f("dijkstra")}(${v("graph")}, "A")
print("distances from A:")
for ${v("node")} in sorted(${v("distances")}):
    print(f"  {${v("node")}}: {${v("distances")}[${v("node")}]}")
${v("path")} = ${f("rebuild_path")}(${v("previous")}, "E")
print(f"path A->E: {' -> '.join(${v("path")})}  (cost {${v("distances")}['E']})")
`;
        }),
    py("py-ex-topological-sort", "Topological sort", "Kahn's algorithm — build order for dependency graphs.", "Graphs", "topological_sort",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Topological order: build dependencies before dependents."""
from collections import deque

${v("tasks")} = {
    "install": [],
    "download": ["install"],
    "parse": ["download"],
    "lint": ["parse"],
    "test": ["parse", "lint"],
    "package": ["test"],
    "docs": ["parse"],
}


def ${f("topological_order")}(graph: dict) -> list:
    ${v("indegree")} = {node: 0 for node in graph}
    for ${v("node")}, ${v("deps")} in graph.items():
        for ${v("dep")} in ${v("deps")}:
            ${v("indegree")}[${v("node")}] += 0  # placeholder
    # count incoming edges properly
    ${v("indegree")} = {node: 0 for node in graph}
    for ${v("node")}, ${v("deps")} in graph.items():
        for ${v("dep")} in ${v("deps")}:
            ${v("indegree")}[${v("node")}] += 1
    ${v("ready")} = deque(sorted(node for node, deg in ${v("indegree")}.items() if deg == 0))
    ${v("order")} = []
    while ${v("ready")}:
        ${v("node")} = ${v("ready")}.popleft()
        ${v("order")}.append(${v("node")})
        for ${v("dependent")}, ${v("deps")} in graph.items():
            if ${v("node")} in ${v("deps")}:
                ${v("indegree")}[${v("dependent")}] -= 1
                if ${v("indegree")}[${v("dependent")}] == 0:
                    ${v("ready")}.append(${v("dependent")})
    if len(${v("order")}) != len(graph):
        raise ValueError("cycle detected")
    return ${v("order")}


print(f"build order: {' -> '.join(${f("topological_order")}(${v("tasks")}))}")
`;
        }),
    py("py-ex-union-find", "Union-Find", "Disjoint sets with path compression — connected components fast.", "Graphs", "union_find",
        (s) => {
            const c = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Union-Find with path compression + union by rank."""


class ${c("UnionFind")}:
    def __init__(self, size: int):
        ${v("parent")} = list(range(size))
        ${v("rank")} = [0] * size
        self.parent = ${v("parent")}
        self.rank = ${v("rank")}

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]  # path halving
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> bool:
        ${v("ra")}, ${v("rb")} = self.find(a), self.find(b)
        if ${v("ra")} == ${v("rb")}:
            return False
        if self.rank[${v("ra")}] < self.rank[${v("rb")}]:
            ${v("ra")}, ${v("rb")} = ${v("rb")}, ${v("ra")}
        self.parent[${v("rb")}] = ${v("ra")}
        if self.rank[${v("ra")}] == self.rank[${v("rb")}]:
            self.rank[${v("ra")}] += 1
        return True

    def count_groups(self) -> int:
        return len({self.find(x) for x in range(len(self.parent))})


${v("edges")} = [(0, 1), (1, 2), (3, 4), (5, 6), (0, 2)]
${v("uf")} = ${c("UnionFind")}(7)
for ${v("a")}, ${v("b")} in ${v("edges")}:
    ${v("merged")} = ${v("uf")}.union(${v("a")}, ${v("b")})
    print(f"union({${v("a")}}, {${v("b")}}) -> {'merged' if ${v("merged")} else 'already connected'}")
print(f"components: {${v("uf")}.count_groups()}")
`;
        }),
];
