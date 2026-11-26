/**
 * Python — Basics examples. Category: "Basics".
 * These entries are carried over; each now carries a subcategory so
 * the menus nest: Python → Basics → <sub> → examples.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {cl, fn, mkExample, vr} from "./_helpers";

const CAT = "Basics";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_BASICS_EXAMPLES: FileExample[] = [
    // ─── Hello & output ──────────────────────────────────────────────
    py("py-ex-hello", "Hello, Praxis", "Minimal runnable script with a typed main() — the classic first program.", "Hello & output", "hello_praxis",
        (s) => `# -*- coding: utf-8 -*-
"""Say hello — the smallest complete Praxis script."""

NAME = "Praxis"


def ${applyNamingStyle(s.functions, "greet")}(who: str) -> str:
    """Return a greeting for the given name."""
    return f"Hello, {who}!"


def main() -> None:
    print(${applyNamingStyle(s.functions, "greet")}(NAME))


if __name__ == "__main__":
    main()
`),
    py("py-ex-print-banner", "Boxed print banner", "A framed text banner printed with pure string repetition.", "Hello & output", "print_banner",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Print a title inside an ASCII box sized to the text."""


def ${f("draw_banner")}(title: str, pad: int = 4) -> None:
    ${v("width")} = len(title) + 2 * pad
    ${v("horizontal")} = "+" + "-" * (${v("width")} - 2) + "+"
    print(${v("horizontal")})
    print("|" + " " * (${v("width")} - 2) + "|")
    print("|" + title.center(${v("width")} - 2) + "|")
    print("|" + " " * (${v("width")} - 2) + "|")
    print(${v("horizontal")})


${f("draw_banner")}("Praxis basics")
${f("draw_banner")}("statistics book", pad=8)
`;
        }),
    py("py-ex-print-tricks", "print() tricks", "sep/end, file=stderr, flushing, and column-aligned reports.", "Hello & output", "print_tricks",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Everything print() can do that people forget."""
import sys

print("a", "b", "c", sep=" | ")
print("no newline…", end=" ")
print("same line")

${v("rows")} = [("sensor-1", 21.4), ("sensor-2", 22.1), ("sensor-3", 18.9)]
for ${v("name")}, ${v("value")} in ${v("rows")}:
    print(f"{${v("name")}:>10} {${v("value")}:>7.2f} C")

print("to stderr only", file=sys.stderr)
print("progress…", flush=True)
`;
        }),

    // ─── Strings ─────────────────────────────────────────────────────
    py("py-ex-formatting", "String formatting tour", "f-strings: alignment, padding, number formats, dates, nested debug =.", "Strings", "string_formatting",
        (s) => `# -*- coding: utf-8 -*-
"""f-string formatting features worth knowing."""
import math
from datetime import date

${applyNamingStyle(s.variables, "name")} = "Praxis"
${applyNamingStyle(s.variables, "value")} = math.pi
${applyNamingStyle(s.variables, "today")} = date.today()

print(f"hello, {${applyNamingStyle(s.variables, "name")}}!")
print(f"pi        = {${applyNamingStyle(s.variables, "value")}:.4f}")
print(f"pi (wide) = {${applyNamingStyle(s.variables, "value")}:12.4f}|")
print(f"pad left  = |{${applyNamingStyle(s.variables, "name")}:>12}|")
print(f"pad ctr   = |{${applyNamingStyle(s.variables, "name")}:^12}|")
print(f"thousands = {1234567:,}")
print(f"percent   = {0.8734:.1%}")
print(f"binary    = {0b1011:08b}  hex = {255:#04x}")
print(f"date      = {${applyNamingStyle(s.variables, "today")}:%Y-%m-%d (week %U)}")
print(f"debug     = {${applyNamingStyle(s.variables, "value")}=:.3f}")
print(f"nested    = {f"{${applyNamingStyle(s.variables, "value")}:.2f} radians"}")
`),
    py("py-ex-string-methods", "String methods tour", "split/join/strip/partition/replace and chained cleanup.", "Strings", "string_methods",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The string methods that do 90% of text cleanup."""

${v("line")} = "  Alice Smith,35,Engineer  "

${v("clean")} = ${v("line")}.strip()
print(f"stripped   : {${v("clean")}!r}")

${v("parts")} = ${v("clean")}.split(",")
print(f"split      : {${v("parts")}}")

${v("first")}, _, ${v("role")} = ${v("clean")}.partition(",")
print(f"partition  : first={${v("first")}!r} role={${v("role")}!r}")

print(f"joined     : {' -> '.join(${v("parts")})}")

print(f"title      : {${v("clean")}.title()}")

${v("upper_snake")} = ${v("clean")}.replace(" ", "_").upper()
print(f"upper snake: {${v("upper_snake")}}")

print(f"find 'Eng' : {${v("clean")}.find('Eng')}")
print(f"count 'i'  : {${v("clean")}.lower().count('i')}")
`;
        }),
    py("py-ex-slicing", "Slicing & reversal", "Every slice pattern: steps, negatives, reversal, and copies.", "Strings", "slicing_tour",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Slicing syntax on strings (lists work identically)."""

${v("text")} = "0123456789"

print(f"full       : {${v("text")}}")
print(f"first 3    : {${v("text")}[:3]}")
print(f"last 3     : {${v("text")}[-3:]}")
print(f"middle     : {${v("text")}[3:7]}")
print(f"every 2nd  : {${v("text")}[::2]}")
print(f"odd chars  : {${v("text")}[1::2]}")
print(f"reversed   : {${v("text")}[::-1]}")
print(f"copy       : {${v("text")}[:]}")

${v("sentence")} = "a man a plan a canal panama"
${v("initials")} = "".join(${v("word")}[0] for ${v("word")} in ${v("sentence")}.split() if ${v("word")} != "a")
print(f"acronym    : {${v("initials")}.upper()}")
`;
        }),

    // ─── Numbers & math ──────────────────────────────────────────────
    py("py-ex-number-types", "int / float / complex", "Numeric types, their limits, division flavors, and complex numbers.", "Numbers & math", "number_types",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Python's numeric types in one tour."""

${v("big")} = 2 ** 128
print(f"2**128     : {${v("big")}}")

${v("ratio")} = 22 / 7
print(f"true div   : {${v("ratio")}:.6f}")
print(f"floor div  : {22 // 7}   mod: {22 % 7}")
print(f"divmod     : {divmod(22, 7)}")

${v("f")} = 0.1 + 0.2
print(f"0.1+0.2    : {${v("f")}:.20f}  == 0.3? {${v("f")} == 0.3}")

${v("z")} = 3 + 4j
print(f"complex    : {${v("z")}}  abs: {abs(${v("z")})}")
print(f"conjugate  : {${v("z")}.conjugate()}")

print(f"types      : {type(1).__name__}, {type(1.0).__name__}, {type(1j).__name__}")
`;
        }),
    py("py-ex-math-module", "math module tour", "ceil/floor/hypot/log/gcd + inf/nan handling with math.isfinite.", "Numbers & math", "math_module",
        () => `# -*- coding: utf-8 -*-
"""The math module essentials."""
import math

print(f"ceil/floor : {math.ceil(4.2)} / {math.floor(4.8)}")
print(f"hypot 3,4  : {math.hypot(3, 4)}")
print(f"log2 1024  : {math.log2(1024)}")
print(f"gcd/lcm    : {math.gcd(12, 18)} / {math.lcm(4, 6)}")
print(f"factorial  : {math.factorial(10)}")
print(f"isqrt 99   : {math.isqrt(99)}")
print(f"inf + 1    : {math.inf + 1}")
print(f"nan == nan : {math.nan == math.nan}  isnan: {math.isnan(math.nan)}")
print(f"degrees    : {math.degrees(math.pi):.1f}")
print(f"dist       : {math.dist((0, 0), (3, 4))}")
`),
    py("py-ex-rounding", "Rounding & Decimal", "round() banker's rounding vs the Decimal module for money.", "Numbers & math", "rounding_decimal",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Why money should never use float rounding."""
from decimal import Decimal, ROUND_HALF_UP

print("round() uses banker's rounding:")
for ${v("x")} in [0.5, 1.5, 2.5, 3.5]:
    print(f"  round({${v("x")}}) = {round(${v("x")})}")

${v("price")} = Decimal("19.995")
print(f"float round      : {round(19.995, 2)}")
print(f"Decimal HALF_UP  : {${v("price")}.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}")

${v("total")} = sum(Decimal(p) for p in ["10.10", "20.20", "30.30"])
print(f"Decimal sum exact: {${v("total")}}")
print(f"float sum        : {10.10 + 20.20 + 30.30}")
`;
        }),
    py("py-ex-fractions", "Fractions (exact)", "Rational arithmetic with no floating-point error.", "Numbers & math", "fractions_tour",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Exact rational arithmetic with fractions.Fraction."""
from fractions import Fraction

${v("a")} = Fraction(1, 3)
${v("b")} = Fraction(1, 6)

print(f"1/3 + 1/6        = {${v("a")} + ${v("b")}}")
print(f"1/3 * 3          = {${v("a")} * 3}")
print(f"float(1/3)       : {float(${v("a")}):.6f}")

${v("series")} = sum(Fraction(1, k) for k in range(1, 11))
print(f"H_10 harmonic    = {${v("series")}}")
print(f"  as decimal     : {float(${v("series")}):.3f}")

print(f"from '0.125'     : {Fraction('0.125')}")
print(f"limit_denominator: {Fraction(1, 7).limit_denominator(10)}")
`;
        }),

    // ─── Control flow ────────────────────────────────────────────────
    py("py-ex-fizzbuzz", "FizzBuzz", "The classic divisibility drill — plus a branch-free variant.", "Control flow", "fizzbuzz",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""FizzBuzz, both the obvious and the clever way."""


def ${f("fizzbuzz")}(n: int) -> str:
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)


for ${v("n")} in range(1, 21):
    print(f"{${v("n")}:>3}  {${f("fizzbuzz")}(${v("n")})}")

${v("labels")} = {3: "Fizz", 5: "Buzz"}
print("branch-free 1..15:")
for ${v("n")} in range(1, 16):
    ${v("word")} = "".join(${v("labels")}[${v("d")}] for ${v("d")} in (3, 5) if ${v("n")} % ${v("d")} == 0)
    print(f"  {${v("n")}:>3}  {${v("word")} or ${v("n")}}")
`;
        }),
    py("py-ex-guessing", "Number guessing loop", "while + break + input validation against a seeded secret.", "Control flow", "guessing_loop",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Guess-the-number with a scripted opponent (no typing needed)."""
import random

random.seed(42)
${v("secret")} = random.randint(1, 100)
${v("guesses")} = ["50", "25", "37", "31", "34"]
${v("tries")} = 0

for ${v("guess_text")} in ${v("guesses")}:
    ${v("tries")} += 1
    if not ${v("guess_text")}.isdigit():
        print(f"{${v("guess_text")}!r} is not a number — skipped")
        continue
    ${v("guess")} = int(${v("guess_text")})
    if ${v("guess")} < ${v("secret")}:
        print(f"{${v("guess")}:>3}  too low")
    elif ${v("guess")} > ${v("secret")}:
        print(f"{${v("guess")}:>3}  too high")
    else:
        print(f"{${v("guess")}:>3}  correct! found in {${v("tries")}} tries")
        break
else:
    print(f"ran out of guesses — the secret was {${v("secret")}}")
`;
        }),
    py("py-ex-grade-classifier", "Grade classifier", "if / elif / else ladder over score boundaries with a lookup-table variant.", "Control flow", "grade_classifier",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Map numeric scores to letter grades — two styles."""


def ${f("grade_ladder")}(score: float) -> str:
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    return "F"


def ${f("grade_lookup")}(score: float) -> str:
    ${v("bounds")} = [(90, "A"), (80, "B"), (70, "C"), (60, "D")]
    for ${v("cut")}, ${v("letter")} in ${v("bounds")}:
        if score >= ${v("cut")}:
            return ${v("letter")}
    return "F"


for ${v("score")} in [98, 84, 71, 65, 42]:
    ${v("a")} = ${f("grade_ladder")}(${v("score")})
    ${v("b")} = ${f("grade_lookup")}(${v("score")})
    ${v("match")} = "ok" if ${v("a")} == ${v("b")} else "MISMATCH"
    print(f"score {${v("score")}:>3} -> {${v("a")}} ({${v("match")}})")
`;
        }),
    py("py-ex-match-case", "match-case dispatch", "Structural pattern matching over commands, literals and mappings.", "Control flow", "match_case",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""match/case: literal, capture, guard, and mapping patterns."""

${v("commands")} = [
    ("add", 3, 4),
    ("mul", 5, 6),
    ("neg", 9),
    ("help",),
    ("oops", 1),
]

for ${v("cmd")} in ${v("commands")}:
    match ${v("cmd")}:
        case ("add", ${v("a")}, ${v("b")}):
            print(f"add: {${v("a")} + ${v("b")}}")
        case ("mul", ${v("a")}, ${v("b")}):
            print(f"mul: {${v("a")} * ${v("b")}}")
        case ("neg", ${v("n")}) if ${v("n")} >= 0:
            print(f"neg: {-${v("n")}}")
        case ("help",):
            print("commands: add a b | mul a b | neg n")
        case _:
            print(f"unknown: {${v("cmd")}!r}")

${v("point")} = {"x": 1, "y": 2}
match ${v("point")}:
    case {"x": ${v("x")}, "y": ${v("y")}}:
        print(f"point -> ({${v("x")}}, {${v("y")}})")
    case _:
        print("not a point")
`;
        }),

    // ─── Collections ─────────────────────────────────────────────────
    py("py-ex-collections", "Collections tour", "Counter, defaultdict, deque, heapq — the stdlib power tools.", "Collections", "collections_tour",
        (s) => `# -*- coding: utf-8 -*-
"""Counter, defaultdict, deque and heapq in one tour."""
from collections import Counter, defaultdict, deque
import heapq

${applyNamingStyle(s.variables, "words")} = "the quick brown fox jumps over the lazy dog the end".split()

${applyNamingStyle(s.variables, "counts")} = Counter(${applyNamingStyle(s.variables, "words")})
print("top words :", ${applyNamingStyle(s.variables, "counts")}.most_common(3))
print("fox count :", ${applyNamingStyle(s.variables, "counts")}["fox"])

${applyNamingStyle(s.variables, "by_letter")} = defaultdict(list)
for ${applyNamingStyle(s.variables, "word")} in ${applyNamingStyle(s.variables, "words")}:
    ${applyNamingStyle(s.variables, "by_letter")}[${applyNamingStyle(s.variables, "word")}[0]].append(${applyNamingStyle(s.variables, "word")})
print("by letter :", dict(${applyNamingStyle(s.variables, "by_letter")}))

${applyNamingStyle(s.variables, "history")} = deque(maxlen=3)
for ${applyNamingStyle(s.variables, "value")} in [1, 2, 3, 4, 5]:
    ${applyNamingStyle(s.variables, "history")}.append(${applyNamingStyle(s.variables, "value")})
print("last 3    :", list(${applyNamingStyle(s.variables, "history")}))

${applyNamingStyle(s.variables, "scores")} = [88, 95, 70, 99, 61]
print("top 3     :", heapq.nlargest(3, ${applyNamingStyle(s.variables, "scores")}))
print("smallest  :", heapq.nsmallest(2, ${applyNamingStyle(s.variables, "scores")}))
`),
    py("py-ex-list-comp", "List/dict/set comprehensions", "Comprehensions with conditions, nesting, and the walrus operator.", "Collections", "comprehensions_tour",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Comprehension patterns worth having in muscle memory."""

${v("numbers")} = list(range(1, 16))

${v("squares")} = [${v("n")} ** 2 for ${v("n")} in ${v("numbers")}]
print(f"squares      : {${v("squares")}}")

${v("evens")} = [${v("n")} for ${v("n")} in ${v("numbers")} if ${v("n")} % 2 == 0]
print(f"evens        : {${v("evens")}}")

${v("pairs")} = [(${v("a")}, ${v("b")}) for ${v("a")} in range(1, 4) for ${v("b")} in range(1, 4) if ${v("a")} < ${v("b")}]
print(f"pairs a<b    : {${v("pairs")}}")

${v("parity")} = {${v("n")}: "even" if ${v("n")} % 2 == 0 else "odd" for ${v("n")} in ${v("numbers")}}
print(f"parity dict  : {${v("parity")}}")

${v("unique_lengths")} = {len(${v("word")}) for ${v("word")} in ["do", "re", "mi", "fa"]}
print(f"set comp     : {${v("unique_lengths")}}")

${v("big_squares")} = [(${v("n")}, ${v("sq")}) for ${v("n")} in ${v("numbers")} if (${v("sq")} := ${v("n")} ** 2) > 100]
print(f"walrus       : {${v("big_squares")}}")
`;
        }),
    py("py-ex-dict-merge", "Dict merge & unpack", "dict | merge, ** unpacking, setdefault, and get-based counting.", "Collections", "dict_merge",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Three ways to merge dicts + in-place patterns."""

${v("defaults")} = {"host": "localhost", "port": 8000, "debug": False}
${v("overrides")} = {"port": 9000, "debug": True}

${v("merged_pipe")} = ${v("defaults")} | ${v("overrides")}
print(f"| merge       : {${v("merged_pipe")}}")

${v("merged_unpack")} = {**${v("defaults")}, **${v("overrides")}}
print(f"** unpack    : {${v("merged_unpack")}}")

${v("mutable_copy")} = ${v("defaults")}.copy()
${v("mutable_copy")}.update(${v("overrides")})
print(f".update()    : {${v("mutable_copy")}}")

${v("counts")} = {}
for ${v("word")} in "a b a c b a".split():
    ${v("counts")}[${v("word")}] = ${v("counts")}.get(${v("word")}, 0) + 1
print(f"counting     : {${v("counts")}}")

${v("grouped")} = {}
for ${v("word")} in "apple ant pear plum".split():
    ${v("grouped")}.setdefault(${v("word")}[0], []).append(${v("word")})
print(f"setdefault   : {${v("grouped")}}")
`;
        }),
    py("py-ex-set-ops", "Set operations", "union, intersection, difference, symmetric difference, subset checks.", "Collections", "set_operations",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Set algebra on two groups of students."""

${v("python_class")} = {"alice", "bob", "carol", "dave"}
${v("stats_class")} = {"carol", "dave", "eve", "frank"}

print(f"python          : {sorted(${v("python_class")})}")
print(f"stats           : {sorted(${v("stats_class")})}")
print(f"union           : {sorted(${v("python_class")} | ${v("stats_class")})}")
print(f"intersection    : {sorted(${v("python_class")} & ${v("stats_class")})}")
print(f"only python     : {sorted(${v("python_class")} - ${v("stats_class")})}")
print(f"either, not both: {sorted(${v("python_class")} ^ ${v("stats_class")})}")

${v("small")} = {"alice", "bob"}
print(f"subset?         : {${v("small")} <= ${v("python_class")}}")

${v("other")} = {"zoe"}
print(f"disjoint?       : {${v("other")}.isdisjoint(${v("python_class")})}")

${v("phrase")} = "the quick brown fox"
${v("letters")} = len(set(${v("phrase")})) - ${v("phrase")}.count(" ")
print(f"unique letters  : {${v("letters")}}")
`;
        }),
    py("py-ex-tuple-unpack", "Tuple unpacking", "Swap, star-args unpack, nested destructuring, named tuples.", "Collections", "tuple_unpacking",
        (s) => {
            const v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""Tuple unpacking patterns + namedtuple records."""
from collections import namedtuple

${v("a")}, ${v("b")} = 1, 2
${v("a")}, ${v("b")} = ${v("b")}, ${v("a")}
print(f"swapped     : {${v("a")}, ${v("b")}}")

${v("first")}, *${v("middle")}, ${v("last")} = [1, 2, 3, 4, 5]
print(f"star unpack : {${v("first")}, ${v("middle")}, ${v("last")}}")

(${v("x")}, ${v("y")}), ${v("label")} = ((3, 4), "point")
print(f"nested      : {${v("x")}, ${v("y")}} labeled {${v("label")}!r}")

${c("Measurement")} = namedtuple("${c("Measurement")}", ["name", "value", "unit"])
${v("readings")} = [
    ${c("Measurement")}("temp", 21.4, "C"),
    ${c("Measurement")}("pressure", 1013.2, "hPa"),
]
for ${v("m")} in ${v("readings")}:
    print(f"{${v("m")}.name:<9} {${v("m")}.value:>8.1f} {${v("m")}.unit}")

print(f"as dict     : {${v("readings")}[0]._asdict()}")
`;
        }),
    py("py-ex-enumerate-zip", "enumerate & zip", "Indexing loops, parallel iteration, strict zip, and transpose.", "Collections", "enumerate_zip",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""enumerate + zip: the two workhorses of clean loops."""

${v("names")} = ["alice", "bob", "carol"]
${v("scores")} = [92, 85, 78]

print("enumerate with start=1:")
for ${v("i")}, ${v("name")} in enumerate(${v("names")}, start=1):
    print(f"  {${v("i")}}. {${v("name")}}")

print("zip (parallel):")
for ${v("name")}, ${v("score")} in zip(${v("names")}, ${v("scores")}):
    print(f"  {${v("name")}:<7} {${v("score")}}")

print(f"zip to dict : {dict(zip(${v("names")}, ${v("scores")}))}")

${v("matrix")} = [(1, 2), (3, 4), (5, 6)]
${v("cols")} = list(zip(*${v("matrix")}))
print(f"transpose   : {${v("cols")}}")

try:
    zip(${v("names")}, [1, 2], strict=True)
except ValueError as ${v("err")}:
    print(f"strict zip  : {${v("err")}}")
`;
        }),

    // ─── Functions ───────────────────────────────────────────────────
    py("py-ex-args-kwargs", "Default, *args, **kwargs", "Every parameter flavor in one signature + call styles.", "Functions", "args_kwargs",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Parameter kinds: positional, default, *args, keyword-only, **kwargs."""


def ${f("report")}(title: str, *values: float, unit: str = "-", **tags: str) -> None:
    print(f"[{title}] unit={unit}")
    for ${v("i")}, ${v("val")} in enumerate(values, 1):
        print(f"  {${v("i")}:>2}: {${v("val")}:>8.2f}")
    if tags:
        print(f"  tags: {tags}")


${f("report")}("baseline", 12.5, 13.1, 14.9, unit="C", source="lab", run="r2")
${f("report")}("empty")
${f("report")}("unpacked", *[1.1, 2.2], **{"source": "synthetic"})
`;
        }),
    py("py-ex-lambda", "lambda & higher-order", "sorted key=, map/filter, and functions returning functions.", "Functions", "lambda_higher_order",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""First-class functions: lambda, sorted, map, filter."""


def ${fn(s)("make_power")}(base: float):
    def ${fn(s)("raise_to")}(exp: float) -> float:
        return base ** exp
    return ${fn(s)("raise_to")}


${v("people")} = [
    {"name": "alice", "age": 34},
    {"name": "bob", "age": 28},
    {"name": "carol", "age": 41},
]

${v("by_age")} = sorted(${v("people")}, key=lambda ${v("p")}: ${v("p")}["age"])
print(f"by age     : {[${v("p")}['name'] for ${v("p")} in ${v("by_age")}]}")

${v("names_upper")} = list(map(str.upper, [${v("p")}["name"] for ${v("p")} in ${v("people")}]))
print(f"map upper  : {${v("names_upper")}}")

${v("seniors")} = [${v("p")}["name"] for ${v("p")} in ${v("people")} if ${v("p")}["age"] >= 35]
print(f"filter 35+ : {${v("seniors")}}")

${v("oldest")} = max(${v("people")}, key=lambda ${v("p")}: ${v("p")}["age"])
print(f"max by age : {${v("oldest")}['name']}")

${v("two_pow")} = ${fn(s)("make_power")}(2)
print(f"closure    : 2**10 = {${v("two_pow")}(10)}")
`;
        }),
    py("py-ex-closures", "Closures & counters", "Functions that remember state — plus the late-binding gotcha.", "Functions", "closures_counters",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Closures capture variables, not values."""


def ${f("make_counter")}(start: int = 0, step: int = 1):
    ${v("count")} = start

    def ${f("tick")}() -> int:
        nonlocal ${v("count")}
        ${v("count")} += ${v("step")}
        return ${v("count")}

    return ${f("tick")}


${v("counter_a")} = ${f("make_counter")}()
${v("counter_b")} = ${f("make_counter")}(start=100, step=5)
print(f"a ticks: {[${v("counter_a")}() for _ in range(3)]}")
print(f"b ticks: {[${v("counter_b")}() for _ in range(3)]}")

${v("late")} = [lambda: ${v("i")} for ${v("i")} in range(3)]
${v("early")} = [lambda ${v("i")}=${v("i")}: ${v("i")} for ${v("i")} in range(3)]
print(f"late binding  : {[f() for f in ${v("late")}]}")
print(f"default-arg   : {[f() for f in ${v("early")}]}")
`;
        }),
    py("py-ex-generators", "Generators & yield", "Lazy sequences, generator expressions, and pipeline stages.", "Functions", "generators_yield",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Generators: produce values one at a time, on demand."""


def ${f("fibonacci_stream")}(limit: int):
    ${v("a")}, ${v("b")} = 0, 1
    while ${v("a")} < limit:
        yield ${v("a")}
        ${v("a")}, ${v("b")} = ${v("b")}, ${v("a")} + ${v("b")}


print(f"fibs < 100 : {list(${f("fibonacci_stream")}(100))}")

${v("pipeline")} = (line.strip().lower() for line in ["  Alice  ", "  BOB ", " carol"])
${v("names")} = [${v("n")}.title() for ${v("n")} in ${v("pipeline")}]
print(f"cleaned    : {${v("names")}}")


def ${f("chunks")}(items: list, size: int):
    for ${v("i")} in range(0, len(items), size):
        yield items[${v("i")}:${v("i")} + size]


print(f"chunks of 2: {list(${f("chunks")}([1, 2, 3, 4, 5], 2))}")

${v("stream")} = ${f("fibonacci_stream")}(10_000_000)
print(f"first 3    : {next(${v("stream")})}, {next(${v("stream")})}, {next(${v("stream")})}")
`;
        }),
    py("py-ex-recursion", "Recursion basics", "Factorial, digit sums, and a memoized grid-path counter.", "Functions", "recursion_basics",
        (s) => {
            const f = fn(s);
            return `# -*- coding: utf-8 -*-
"""Recursion with a base case, plus functools.cache speedup."""
import sys
from functools import cache


def ${f("factorial")}(n: int) -> int:
    if n < 0:
        raise ValueError("factorial needs n >= 0")
    return 1 if n <= 1 else n * ${f("factorial")}(n - 1)


def ${f("digit_sum")}(n: int) -> int:
    return n if n < 10 else n % 10 + ${f("digit_sum")}(n // 10)


@cache
def ${f("grid_paths")}(rows: int, cols: int) -> int:
    if rows == 1 or cols == 1:
        return 1
    return ${f("grid_paths")}(rows - 1, cols) + ${f("grid_paths")}(rows, cols - 1)


print(f"10!             : {${f("factorial")}(10)}")
print(f"digit_sum(2**64): {${f("digit_sum")}(2 ** 64)}")
print(f"grid paths 4x4  : {${f("grid_paths")}(4, 4)}")
print(f"recursion limit : {sys.getrecursionlimit()}")
`;
        }),
];
