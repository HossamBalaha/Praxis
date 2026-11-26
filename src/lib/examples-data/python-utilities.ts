/**
 * Python — Utilities examples. Category: "Utilities".
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {cl, fn, mkExample, vr} from "./_helpers";

const CAT = "Utilities";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_UTILITIES_EXAMPLES: FileExample[] = [
    // ─── CLI & sys ───────────────────────────────────────────────────
    py("py-ex-cli-tool", "CLI tool (argparse)", "Command-line greeter with positional args and flags — run it with arguments.", "CLI & sys", "cli_greeter",
        (s) => `# -*- coding: utf-8 -*-
"""A tiny argparse CLI — pass arguments in the Stdin/args box above."""
import argparse


def ${applyNamingStyle(s.functions, "parse_args")}(argv: list[str] | None = None) -> argparse.Namespace:
    ${applyNamingStyle(s.variables, "parser")} = argparse.ArgumentParser(description="Greet people from the command line.")
    ${applyNamingStyle(s.variables, "parser")}.add_argument("${applyNamingStyle(s.variables, "names")}", nargs="+", help="who to greet")
    ${applyNamingStyle(s.variables, "parser")}.add_argument("--${applyNamingStyle(s.variables, "shout")}", action="store_true", help="UPPERCASE the greeting")
    ${applyNamingStyle(s.variables, "parser")}.add_argument("--${applyNamingStyle(s.variables, "punctuation")}", default="!", help="punctuation to end with")
    return ${applyNamingStyle(s.variables, "parser")}.parse_args(argv)


def main() -> None:
    import sys

    if len(sys.argv) > 1:
        ${applyNamingStyle(s.variables, "args")} = ${applyNamingStyle(s.functions, "parse_args")}()
    else:
        # No CLI arguments were passed — run the demo with defaults so
        # the script stays runnable inside Praxis (add names in the
        # Args box above to drive the real parser).
        print("no CLI args — demo run (pass names via the Args box)")
        ${applyNamingStyle(s.variables, "args")} = ${applyNamingStyle(s.functions, "parse_args")}(["Praxis", "World"])
    for ${applyNamingStyle(s.variables, "name")} in ${applyNamingStyle(s.variables, "args")}.${applyNamingStyle(s.variables, "names")}:
        ${applyNamingStyle(s.variables, "greeting")} = f"Hello, {${applyNamingStyle(s.variables, "name")}}{${applyNamingStyle(s.variables, "args")}.${applyNamingStyle(s.variables, "punctuation")}}"
        if ${applyNamingStyle(s.variables, "args")}.${applyNamingStyle(s.variables, "shout")}:
            ${applyNamingStyle(s.variables, "greeting")} = ${applyNamingStyle(s.variables, "greeting")}.upper()
        print(${applyNamingStyle(s.variables, "greeting")})


if __name__ == "__main__":
    main()
`),
    py("py-ex-argparse-subcommands", "argparse subcommands", "git-style CLI: add / list / remove under one program.", "CLI & sys", "cli_subcommands",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Subcommands like git: add, list, remove."""
import argparse
import sys

${v("tasks")} = []


def ${f("build_parser")}(argv: list[str] | None = None) -> argparse.Namespace:
    ${v("parser")} = argparse.ArgumentParser(prog="tasks")
    ${v("sub")} = ${v("parser")}.add_subparsers(dest="command", required=True)

    ${v("add_cmd")} = ${v("sub")}.add_parser("add", help="add a task")
    ${v("add_cmd")}.add_argument("title")
    ${v("add_cmd")}.add_argument("--priority", type=int, default=2, choices=[1, 2, 3])

    ${v("list_cmd")} = ${v("sub")}.add_parser("list", help="list tasks")
    ${v("list_cmd")}.add_argument("--sort", default="added", choices=["added", "priority"])

    ${v("remove_cmd")} = ${v("sub")}.add_parser("remove", help="remove a task")
    ${v("remove_cmd")}.add_argument("index", type=int)

    return ${v("parser")}.parse_args(argv)


def ${f("run_cli")}(argv: list[str]) -> None:
    ${v("args")} = ${f("build_parser")}(argv)
    if ${v("args")}.command == "add":
        ${v("tasks")}.append((${v("args")}.title, ${v("args")}.priority))
        print(f"added: {${v("args")}.title} (priority {${v("args")}.priority})")
    elif ${v("args")}.command == "list":
        ${v("ordered")} = ${v("tasks")} if ${v("args")}.sort == "added" else sorted(${v("tasks")}, key=lambda t: t[1])
        for ${v("i")}, (${v("title")}, ${v("priority")}) in enumerate(${v("ordered")}):
            print(f"  {${v("i")}:>2}. [{'!' * ${v("priority")}}] {${v("title")}}")
    elif ${v("args")}.command == "remove":
        ${v("removed")} = ${v("tasks")}.pop(${v("args")}.index)
        print(f"removed: {${v("removed")}[0]}")


${f("run_cli")}(["add", "write report", "--priority", "1"])
${f("run_cli")}(["add", "email team"])
${f("run_cli")}(["add", "backup disk", "--priority", "3"])
${f("run_cli")}(["list", "--sort", "priority"])
${f("run_cli")}(["remove", "0"])
${f("run_cli")}(["list"])
`;
        }),
    py("py-ex-sys-argv", "sys.argv quick script", "No argparse needed — one-liner argument handling.", "CLI & sys", "sys_argv",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Bare-metal argv handling for tiny scripts."""
import sys

print(f"script   : {sys.argv[0]}")
${v("arg_list")} = sys.argv[1:] or ["(none — use the Args box above)"]
print(f"args     : {${v('arg_list')}}")
print(f"python   : {sys.version.split()[0]}")
print(f"platform : {sys.platform}")

${v("args")} = sys.argv[1:]
if ${v("args")} and ${v("args")}[0].isdigit():
    ${v("n")} = int(${v("args")}[0])
    print(f"\\nmultiplication table for {${v('n')}}:")
    for ${v("i")} in range(1, 11):
        print(f"  {${v('n')}} x {${v('i')}:>2} = {${v('n')} * ${v('i')}:>4}")
else:
    print("\\npass a number as the first argument to get its times table")
`;
        }),
    py("py-ex-env-vars", "Environment variables", "os.environ, defaults, typed parsing, and required keys.", "CLI & sys", "env_vars",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Config from the environment — the 12-factor way."""
import os


def ${f("get_int")}(key: str, default: int) -> int:
    ${v("raw")} = os.environ.get(key)
    if ${v("raw")} is None:
        return default
    try:
        return int(${v("raw")})
    except ValueError:
        print(f"warning: {key}={${v("raw")}!r} is not an int, using {default}")
        return default


${v("settings")} = {
    "host": os.environ.get("APP_HOST", "localhost"),
    "port": ${f("get_int")}("APP_PORT", 8000),
    "debug": os.environ.get("APP_DEBUG", "false").lower() in ("1", "true", "yes"),
    "workers": ${f("get_int")}("APP_WORKERS", 4),
}

for ${v("key")}, ${v("value")} in ${v("settings")}.items():
    print(f"{${v("key")}:<9} = {${v("value")}}")

${v("required_missing")} = [k for k in ("DB_URL", "API_KEY") if k not in os.environ]
print(f"\\nmissing required keys: {${v("required_missing")} or 'none set — defaults shown above'}")
print(f"env var count: {len(os.environ)}")
`;
        }),

    // ─── Timing & profiling ──────────────────────────────────────────
    py("py-ex-timeit", "timeit micro-benchmarks", "String joining, list building, dict lookups — measured.", "Timing & profiling", "timeit_benchmarks",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Time competing implementations with timeit."""
import timeit

${v("results")} = {
    "join with list": '"".join(str(i) for i in range(100))',
    "join with comprehension": '"".join([str(i) for i in range(100)])',
    "f-string loop": '"x" * 100',
    "list append": """
[${v("out")}.append(i) for ${v("out")} in ([],)][0] or None
""".strip(),
}

print(f"{'variant':<28} {'per call':>12}")
for ${v("name")}, ${v("stmt")} in [
    ("join generator", '"".join(str(i) for i in range(100))'),
    ("join comprehension", '"".join([str(i) for i in range(100)])'),
    ("list comprehension", '[i * 2 for i in range(100)]'),
    ("map call", 'list(map(lambda i: i * 2, range(100)))'),
]:
    ${v("seconds")} = timeit.timeit(${v("stmt")}, number=5_000) / 5_000
    ${v("micro")} = ${v("seconds")} * 1_000_000
    print(f"{${v("name")}:<28} {${v("micro")}:>10.2f} us")
`;
        }),
    py("py-ex-perf-counter", "perf_counter benchmark", "Wall-clock comparison of search strategies.", "Timing & profiling", "perf_counter",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""time.perf_counter: honest wall-clock timing."""
import random
import time
from bisect import bisect_left

random.seed(2)
${v("haystack")} = sorted(random.uniform(0.0, 1000.0) for _ in range(200_000))
${v("needles")} = [random.uniform(0.0, 1000.0) for _ in range(1_000)]


def ${f("linear_contains")}(values: list[float], target: float) -> bool:
    for ${v("value")} in values:
        if ${v("value")} == target:
            return True
    return False


def ${f("binary_contains")}(values: list[float], target: float) -> bool:
    ${v("pos")} = bisect_left(values, target)
    return ${v("pos")} < len(values) and values[${v("pos")}] == target


${v("start")} = time.perf_counter()
${v("linear_hits")} = sum(1 for ${v("n")} in ${v("needles")} if ${f("linear_contains")}(${v("haystack")}, ${v("n")}))
${v("linear_time")} = time.perf_counter() - ${v("start")}

${v("start")} = time.perf_counter()
${v("binary_hits")} = sum(1 for ${v("n")} in ${v("needles")} if ${f("binary_contains")}(${v("haystack")}, ${v("n")}))
${v("binary_time")} = time.perf_counter() - ${v("start")}

print(f"linear search : {${v('linear_time')}:.3f} s  ({${v('linear_hits')}} hits)")
print(f"binary search : {${v('binary_time')}:.4f} s  ({${v('binary_hits')}} hits)")
print(f"speedup       : {${v("linear_time")} / max(${v("binary_time")}, 1e-9):,.0f}x on 200k items")
`;
        }),
    py("py-ex-progress-bar", "Manual progress bar", "A 20-line tqdm — ETA, percentage, and bar rendering.", "Timing & profiling", "progress_bar",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A dependency-free progress bar."""
import sys
import time


def ${f("progress_iter")}(items, width: int = 28):
    ${v("total")} = len(items)
    ${v("start")} = time.perf_counter()
    for ${v("i")}, ${v("item")} in enumerate(items, start=1):
        yield ${v("item")}
        ${v("elapsed")} = time.perf_counter() - ${v("start")}
        ${v("done")} = ${v("i")} / ${v("total")}
        ${v("filled")} = int(${v("width")} * ${v("done")})
        ${v("bar")} = "#" * ${v("filled")} + "-" * (${v("width")} - ${v("filled")})
        ${v("eta")} = ${v("elapsed")} / ${v("i")} * (${v("total")} - ${v("i")}) if ${v("i")} > 0 else 0
        sys.stdout.write(f"\\r[{${v('bar')}}] {${v('done')}:>4.0%} eta {${v('eta')}:>4.1f}s")
        sys.stdout.flush()
    sys.stdout.write("\\n")


${v("work")} = 0
for ${v("chunk")} in ${f("progress_iter")}(range(60)):
    time.sleep(0.01)
    ${v("work")} += ${v("chunk")}
print(f"processed 60 chunks, sum={${v("work")}}")
`;
        }),
    py("py-ex-cache-speedup", "functools.cache speedup", "Same recursive call, with and without memoization.", "Timing & profiling", "cache_speedup",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Measure what memoization actually buys you."""
import time
from functools import cache


def ${f("count_paths_slow")}(rows: int, cols: int) -> int:
    if rows == 1 or cols == 1:
        return 1
    return ${f("count_paths_slow")}(rows - 1, cols) + ${f("count_paths_slow")}(rows, cols - 1)


@cache
def ${f("count_paths_fast")}(rows: int, cols: int) -> int:
    if rows == 1 or cols == 1:
        return 1
    return ${f("count_paths_fast")}(rows - 1, cols) + ${f("count_paths_fast")}(rows, cols - 1)


${v("start")} = time.perf_counter()
${v("slow_result")} = ${f("count_paths_slow")}(11, 8)
${v("slow_time")} = time.perf_counter() - ${v("start")}

${v("start")} = time.perf_counter()
${v("fast_result")} = ${f("count_paths_fast")}(18, 18)
${v("fast_time")} = time.perf_counter() - ${v("start")}

print(f"slow (11x8) : {${v("slow_result")}:,} paths in {${v("slow_time")}:.3f} s")
print(f"fast (18x18): {${v("fast_result")}:,} paths in {${v("fast_time")}:.4f} s")
print(f"agreement   : {${f("count_paths_fast")}(11, 8) == ${v("slow_result")}}")
print(f"cache entries: {${f("count_paths_fast")}.cache_info().currsize}")
`;
        }),

    // ─── Logging & debugging ──────────────────────────────────────────
    py("py-ex-logging-basics", "logging basics", "Levels, handlers, and format strings — print's professional sibling.", "Logging & debugging", "logging_basics",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Structured logging in 20 lines."""
import logging

${v("logger")} = logging.getLogger("praxis.demo")
${v("logger")}.setLevel(logging.DEBUG)

${v("handler")} = logging.StreamHandler()
${v("handler")}.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
))
${v("logger")}.addHandler(${v("handler")})

${v("logger")}.debug("verbose detail — visible at DEBUG level")
${v("logger")}.info("normal operation")
${v("logger")}.warning("something looks odd")
${v("logger")}.error("an operation failed")

try:
    1 / 0
except ZeroDivisionError:
    ${v("logger")}.exception("caught a division error")  # appends the traceback

${v("logger")}.info("task %s finished in %.2fs", "benchmark", 1.25)  # lazy % formatting
print("root level captures:", logging.getLevelName(logging.root.level))
`;
        }),
    py("py-ex-logging-file", "Logging to a file", "File handler + rotation, with a severity filter.", "Logging & debugging", "logging_file",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Persistent logs with a rotating file handler."""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

${v("log_path")} = Path("${fn(s)("app")}.log")
${v("logger")} = logging.getLogger("praxis.file")
${v("logger")}.setLevel(logging.INFO)

${v("handler")} = RotatingFileHandler(${v("log_path")}, maxBytes=2048, backupCount=2)
${v("handler")}.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s"))
${v("logger")}.addHandler(${v("handler")})

for ${v("i")} in range(40):
    ${v("logger")}.info("event %03d processed", ${v("i")})
${v("logger")}.warning("disk usage at 85%")

print(f"log file   : {${v('log_path')}} ({${v('log_path')}.stat().st_size} bytes)")
print(f"rotations : {len(list(Path.cwd().glob('${fn(s)("app")}.log*')))} files")
${v("tail")} = ${v("log_path")}.read_text().strip().split("\\n")[-3:]
print("last lines:")
for ${v("line")} in ${v("tail")}:
    print(f"  {${v("line")}}")
`;
        }),
    py("py-ex-traceback", "Pretty tracebacks", "Read and reshape exceptions instead of fearing them.", "Logging & debugging", "pretty_tracebacks",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Traceback surgery: extract, shorten, and re-raise."""
import traceback


def ${fn(s)("inner_function")}(value: int) -> float:
    return 100 / value


def ${fn(s)("middle_function")}(value: int) -> float:
    return ${fn(s)("inner_function")}(value) * 2


def ${fn(s)("outer_function")}(value: int) -> float:
    return ${fn(s)("middle_function")}(value) + 1


try:
    ${fn(s)("outer_function")}(0)
except ZeroDivisionError:
    ${v("tb")} = traceback.format_exc()
    print("--- full traceback ---")
    print(${v("tb")})

try:
    ${fn(s)("outer_function")}(0)
except ZeroDivisionError as ${v("err")}:
    ${v("summary")} = traceback.format_exception_only(type(${v("err")}), ${v("err")})
    ${v("frames")} = traceback.extract_tb(${v("err")}.__traceback__)
    print("--- short form ---")
    for ${v("frame")} in ${v("frames")}:
        print(f"  {${v("frame")}.filename.split('/')[-1]}:{${v("frame")}.lineno} in {${v("frame")}.name}")
    print("  " + ${v("summary")}[0].strip())

print(f"\\nrecovered: outer_function(4) = {${fn(s)("outer_function")}(4)}")
`;
        }),

    // ─── Robustness ──────────────────────────────────────────────────
    py("py-ex-error-handling", "Error handling patterns", "try/except/else/finally, custom exceptions, and validation.", "Robustness", "error_handling",
        (s) => `# -*- coding: utf-8 -*-
"""Robust error handling: custom exceptions + the full try block."""


class ${applyNamingStyle(s.classes, "ValidationError")}(ValueError):
    """Raised when user input fails domain validation."""


def ${applyNamingStyle(s.functions, "parse_age")}(raw: str) -> int:
    try:
        ${applyNamingStyle(s.variables, "age")} = int(raw)
    except ValueError as ${applyNamingStyle(s.variables, "err")}:
        raise ${applyNamingStyle(s.classes, "ValidationError")}(f"age must be an integer, got {raw!r}") from ${applyNamingStyle(s.variables, "err")}
    if not 0 <= ${applyNamingStyle(s.variables, "age")} <= 130:
        raise ${applyNamingStyle(s.classes, "ValidationError")}(f"age {${applyNamingStyle(s.variables, "age")}} out of range 0-130")
    return ${applyNamingStyle(s.variables, "age")}


for ${applyNamingStyle(s.variables, "raw")} in ["42", "9x", "999", "7"]:
    try:
        ${applyNamingStyle(s.variables, "age")} = ${applyNamingStyle(s.functions, "parse_age")}(${applyNamingStyle(s.variables, "raw")})
    except ${applyNamingStyle(s.classes, "ValidationError")} as ${applyNamingStyle(s.variables, "err")}:
        print(f"REJECT {${applyNamingStyle(s.variables, "raw")}!r:>6}: {${applyNamingStyle(s.variables, "err")}}")
    else:
        print(f"accept {${applyNamingStyle(s.variables, "raw")}!r:>6}: age {${applyNamingStyle(s.variables, "age")}}")
    finally:
        print("        (one attempt processed)")
`),
    py("py-ex-retry", "Retry with backoff", "Exponential backoff on flaky operations — deterministic demo.", "Robustness", "retry_backoff",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Retry loop with exponential backoff (deterministic)."""
import random
import time


def ${f("flaky_service")}(attempt: int) -> str:
    """Fails twice, then succeeds — like a real flaky endpoint."""
    if attempt < 3:
        raise ConnectionError(f"attempt {attempt}: service unavailable")
    return "200 OK"


def ${f("retry_call")}(max_attempts: int = 5, base_delay: float = 0.05) -> str:
    for ${v("attempt")} in range(1, max_attempts + 1):
        try:
            return ${f("flaky_service")}(${v("attempt")})
        except ConnectionError as ${v("err")}:
            if ${v("attempt")} == max_attempts:
                raise
            ${v("delay")} = base_delay * 2 ** (${v("attempt")} - 1)
            print(f"  {${v('err')}} — retrying in {${v('delay')}:.2f}s")
            time.sleep(0)  # keep the demo instant
    raise AssertionError("unreachable")


print("calling flaky service with retries:")
${v("result")} = ${f("retry_call")}()
print(f"final: {${v("result")}}")

random.seed(0)
print("\\nsimulated backoff schedule:")
${v("delay")} = 0.05
for ${v("i")} in range(6):
    ${v("jitter")} = random.uniform(0, ${v("delay")} / 2)
    print(f"  attempt {${v('i')} + 1}: delay {${v('delay')}:.3f}s + jitter {${v('jitter')}:.3f}s")
    ${v("delay")} *= 2
`;
        }),
    py("py-ex-validation-helpers", "Validation helpers", "Reusable guards: require, one_of, is_positive.", "Robustness", "validation_helpers",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Small validation toolkit for function arguments."""


def ${f("require")}(value, name: str):
    if value is None:
        raise ValueError(f"{name} is required")
    return value


def ${f("one_of")}(value, options, name: str):
    if value not in options:
        raise ValueError(f"{name} must be one of {sorted(options)}, got {value!r}")
    return value


def ${f("is_positive")}(value: float, name: str) -> float:
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {value}")
    return value


def ${f("place_order")}(item: str | None, quantity: int, currency: str) -> dict:
    ${f("require")}(item, "item")
    ${f("is_positive")}(quantity, "quantity")
    ${f("one_of")}(currency, {"USD", "EUR", "GBP"}, "currency")
    return {"item": item, "quantity": quantity, "currency": currency}


${v("attempts")} = [
    ("widget", 3, "USD"),
    (None, 3, "USD"),
    ("widget", 0, "USD"),
    ("widget", 3, "EGP"),
]
for ${v("args")} in ${v("attempts")}:
    try:
        print(f"ok: {${f("place_order")}(*${v("args")})}")
    except ValueError as ${v("err")}:
        print(f"reject: {${v("err")}}")
`;
        }),
    py("py-ex-contextlib", "contextlib toolbox", "suppress, closing, ExitStack — composable cleanup.", "Robustness", "contextlib_tools",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""contextlib: cleanup without boilerplate."""
import contextlib
from pathlib import Path

print("suppress:")
with contextlib.suppress(FileNotFoundError):
    Path("does-not-exist.txt").read_text()
    print("  never reached")
print("  missing file ignored cleanly")

print("\\nclosing (objects without a context manager):")


class ${cl(s)("Connection")}:
    def close(self) -> None:
        print("  connection closed")


with contextlib.closing(${cl(s)("Connection")}()) as ${v("conn")}:
    print(f"  using {${v("conn")}}")

print("\\nExitStack (dynamic cleanup):")
with contextlib.ExitStack() as ${v("stack")}:
    for ${v("i")} in range(3):
        ${v("path")} = Path(f"temp-{${v('i')}}.txt")
        ${v("path")}.write_text("scratch", encoding="utf-8")
        ${v("stack")}.callback(${v("path")}.unlink)
        print(f"  created {${v("path")}}")
print(f"  leftovers: {len(list(Path('.').glob('temp-*.txt')))}")

print("\\nredirect_stdout:")
import io
${v("buffer")} = io.StringIO()
with contextlib.redirect_stdout(${v("buffer")}):
    print("captured!")
print(f"  buffer now holds: {${v("buffer")}.getvalue()!r}")
`;
        }),

    // ─── Helpers & extras ────────────────────────────────────────────
    py("py-ex-slugify", "slugify utility", "Titles to URL slugs: unicode-aware, separator-safe.", "Helpers & extras", "slugify",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Turn any title into a URL-safe slug."""
import re
import unicodedata

${v("replacements")} = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}


def ${f("slugify")}(title: str, separator: str = "-") -> str:
    ${v("normalized")} = unicodedata.normalize("NFKD", title)
    ${v("decomposed")} = "".join(${v("replacements")}.get(c, c) for c in ${v("normalized")})
    ${v("ascii_only")} = ${v("decomposed")}.encode("ascii", "ignore").decode()
    ${v("cleaned")} = re.sub(r"[^a-zA-Z0-9]+", separator, ${v("ascii_only")}).lower()
    return re.sub(rf"{separator}+", separator, ${v("cleaned")}).strip(separator)


${v("titles")} = [
    "Hello, Praxis World!",
    "  Über-cool   features  ",
    "Café & Croissants (2026)",
    "Capitalized WORDS    everywhere",
    "already-slugified",
]
for ${v("title")} in ${v("titles")}:
    print(f"{${v('title')}!r:<40} -> {${f('slugify')}(${v('title')})!r}")
`;
        }),
    py("py-ex-human-sizes", "Human-readable sizes", "Bytes to KiB/MiB/GiB and durations to h:m:s.", "Helpers & extras", "human_readable",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Format numbers the way humans read them."""


def ${f("human_size")}(num_bytes: int) -> str:
    ${v("units")} = ["B", "KiB", "MiB", "GiB", "TiB"]
    ${v("value")} = float(num_bytes)
    for ${v("unit")} in ${v("units")}:
        if ${v("value")} < 1024 or ${v("unit")} == ${v("units")}[-1]:
            return f"{${v('value')}:.1f} {${v('unit')}}"
        ${v("value")} /= 1024
    return f"{${v("value")}:.1f} PiB"


def ${f("human_duration")}(seconds: float) -> str:
    ${v("total")} = int(round(seconds))
    ${v("hours")}, ${v("remainder")} = divmod(${v("total")}, 3600)
    ${v("minutes")}, ${v("secs")} = divmod(${v("remainder")}, 60)
    return f"{${v('hours')}}h {${v('minutes')}}m {${v('secs')}}s"


${v("sizes")} = [0, 512, 2_048, 1_500_000, 2**31, 2**40 + 2**30]
print("sizes:")
for ${v("size")} in ${v("sizes")}:
    print(f"  {${v("size")}:>13,} -> {${f("human_size")}(${v("size")})}")

${v("durations")} = [5, 65, 3_725, 86_400 + 125, 0.4]
print("durations:")
for ${v("d")} in ${v("durations")}:
    print(f"  {${v("d")}:>10} s -> {${f("human_duration")}(${v("d")})}")
`;
        }),
    py("py-ex-uuid-hashing", "UUIDs & hashing", "Identity via uuid, integrity via hashlib digests.", "Helpers & extras", "uuid_hashing",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""IDs and fingerprints."""
import hashlib
import uuid

${v("id1")} = uuid.uuid4()
${v("id2")} = uuid.uuid4()
print(f"uuid4  : {${v("id1")}}")
print(f"unique : {${v("id1")} != ${v("id2")}}")
print(f"fields : version={${v("id1")}.version}, variant={${v("id1")}.variant}")

${v("content_a")} = "the same text".encode("utf-8")
${v("content_b")} = "the same text".encode("utf-8")
${v("content_c")} = "the same tex t".encode("utf-8")

${v("algorithms")} = ["md5", "sha1", "sha256"]
print("\\ndigests:")
for ${v("algorithm")} in ${v("algorithms")}:
    ${v("digest")} = hashlib.new(${v("algorithm")}, ${v("content_a")}).hexdigest()
    print(f"  {${v("algorithm")}:<7} {${v("digest")}}")

print("\\nintegrity:")
for ${v("algorithm")} in ${v("algorithms")}:
    ${v("matches")} = hashlib.new(${v("algorithm")}, ${v("content_a")}).digest() == hashlib.new(${v("algorithm")}, ${v("content_b")}).digest()
    ${v("differs")} = hashlib.new(${v("algorithm")}, ${v("content_a")}).digest() != hashlib.new(${v("algorithm")}, ${v("content_c")}).digest()
    print(f"  {${v('algorithm')}:<7} match={${v('matches')}} differs={${v('differs')}}")
`;
        }),
    py("py-ex-sysinfo", "System report", "Platform, cpu, memory, and paths — a portable sysinfo.", "Helpers & extras", "system_report",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A portable little system report."""
import os
import platform
import sys
from pathlib import Path


def ${fn(s)("memory_gib")}(path: Path) -> float | None:
    try:
        ${v("usage")} = os.statvfs(str(path))
        return ${v("usage")}.f_bsize * ${v("usage")}.f_blocks / 2**30
    except (OSError, AttributeError):
        return None


print(f"python    : {sys.version.split()[0]} ({platform.python_implementation()})")
print(f"platform  : {platform.platform()}")
print(f"machine   : {platform.machine()}")
print(f"processor : {platform.processor() or 'n/a'}")
print(f"cwd       : {Path.cwd()}")
print(f"temp dir  : {Path(os.environ.get('TMPDIR', '/tmp'))}")
${v("total_disk")} = ${fn(s)("memory_gib")}(Path.cwd())
if ${v("total_disk")}:
    print(f"disk total: {${v("total_disk")}:.1f} GiB")
print(f"cpu count : {os.cpu_count()}")
print(f"loadavg   : {tuple(round(x, 2) for x in os.getloadavg()) if hasattr(os, 'getloadavg') else 'n/a'}")
`;
        }),

    py("py-ex-pretty-table", "Manual pretty-printer", "Column-aware table printing without any dependency.", "Helpers & extras", "pretty_table",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A tiny table formatter: measure, pad, print."""


def ${f("format_table")}(headers: list[str], rows: list[list]) -> str:
    ${v("widths")} = [len(h) for h in headers]
    for ${v("row")} in rows:
        for ${v("i")}, ${v("cell")} in enumerate(${v("row")}):
            ${v("widths")}[${v("i")}] = max(${v("widths")}[${v("i")}], len(str(${v("cell")})))

    ${v("separator")} = "-+-".join("-" * w for w in ${v("widths")})
    ${v("lines")} = [
        " | ".join(h.ljust(w) for h, w in zip(headers, ${v("widths")})),
        ${v("separator")},
    ]
    for ${v("row")} in rows:
        ${v("lines")}.append(" | ".join(str(c).ljust(w) for c, w in zip(${v("row")}, ${v("widths")})))
    return "\\n".join(${v("lines")})


${v("headers")} = ["metric", "baseline", "improved", "delta"]
${v("rows")} = [
    ["accuracy", "0.842", "0.861", "+0.019"],
    ["latency_ms", "182", "154", "-28"],
    ["memory_mib", "72.4", "69.9", "-2.5"],
]

print(${f("format_table")}(${v("headers")}, ${v("rows")}))
`;
        }),
];
