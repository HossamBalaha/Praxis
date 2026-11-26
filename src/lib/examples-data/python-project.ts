/**
 * — Python "Project & app" examples: the runnable Python
 * files a modern repo is scaffolded with (entry points, web apps, config
 * and helper modules, test files). User request: "add more example of
 * the commonly used files used nowadays in many projects … many default
 * other one in py and others".
 *
 * Every entry is naming-style aware (identifiers via the f/v/c/k
 * aliases) AND indentation aware — the bodies are authored in the
 * canonical 4-space indent and `reindent` (page.tsx
 * handleCreateExample) converts them to the configured style at
 * creation time.
 *
 * Framework templates (Flask, Streamlit) degrade gracefully when the
 * framework isn't installed: they print what to install and exit 0, so
 * the example stays runnable everywhere while remaining the real
 * template you'd commit. `__main__.py`, `conftest.py`, `test_basic.py`
 * and `py.typed` carry fixedName — their names are load-bearing
 * (python -m, pytest discovery, PEP 561).
 */
import {type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {cl, fn, mkExample, vr} from "./_helpers";

const CAT = "Project & app";

const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string, fixedName?: string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build, fixedName);

export const PY_PROJECT_EXAMPLES: FileExample[] = [
    // ─── Entry points ─────────────────────────────────────────────────
    py("py-ex-main", "main.py — orchestrator", "The repo's front door: wires logging + exit codes + a demo pipeline.", "Entry points", "main",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Entry point — \`python main.py\` (or \`python -m my_project\`).

A real main() earns its keep: it wires up logging, returns a proper
exit code, and stays thin — the work lives in importable functions.
"""
import logging
import sys

${v("logger")} = logging.getLogger("main")


def ${f("run_pipeline")}(source: str = "sample") -> int:
    """Do the actual work. Returns the number of items processed."""
    ${v("rows")} = [
        {"id": 1, "value": 12.5},
        {"id": 2, "value": 18.2},
        {"id": 3, "value": 9.9},
    ]
    for ${v("row")} in ${v("rows")}:
        ${v("logger")}.info("processing %s -> %.1f", ${v("row")}["id"], ${v("row")}["value"])
    return len(${v("rows")})


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
    )
    ${v("count")} = ${f("run_pipeline")}()
    print(f"pipeline finished: {${v("count")}} items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;
        }),
    py("py-ex-dunder-main", "__main__.py", "Makes the folder runnable as `python -m` — the package entry idiom.", "Entry points", "dunder_main",
        (s) => {
            const f = fn(s);
            return `# -*- coding: utf-8 -*-
"""Executed when the package runs as \`python -m my_project\`.

Keep it a shim: import main() from the real module and exit with its
code so \`python -m\` and \`python main.py\` behave identically.
"""
import sys

from my_project.main import main

if __name__ == "__main__":
    sys.exit(main())
`;
        }, "__main__.py"),

    // ─── Web & dashboards ─────────────────────────────────────────────
    py("py-ex-app-flask", "app.py — Flask service", "Minimal Flask API with a health route; prints install advice when Flask is missing.", "Web & dashboards", "flask_app",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A one-file Flask service — the classic app.py.

Run:  flask --app ${v("app")} run   (or python app.py)
"""
try:
    from flask import Flask, jsonify
except ImportError:
    print("Flask is not installed — this is the template anyway.")
    print("Install it with:  pip install flask")
    raise SystemExit(0)


${v("app_instance")} = Flask(__name__)


@${v("app_instance")}.get("/health")
def ${f("health_check")}():
    """Liveness probe — what every k8s/monitor asks for first."""
    return jsonify({"status": "ok"})


@${v("app_instance")}.get("/stats")
def ${f("stats_summary")}():
    """A tiny JSON endpoint doing real work."""
    ${v("values")} = [12.5, 18.2, 9.9, 15.3]
    return jsonify({
        "count": len(${v("values")}),
        "mean": round(sum(${v("values")}) / len(${v("values")}), 3),
    })


if __name__ == "__main__":
    ${v("app_instance")}.run(host="127.0.0.1", port=5000, debug=True)
`;
        }),
    py("py-ex-streamlit", "streamlit_app.py — dashboard", "Streamlit dashboard skeleton; prints install advice when Streamlit is missing.", "Web & dashboards", "streamlit_app",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A Streamlit dashboard — the fastest route from data to UI.

Run:  streamlit run streamlit_app.py
"""
try:
    import streamlit as st
except ImportError:
    print("Streamlit is not installed — this is the template anyway.")
    print("Install it with:  pip install streamlit")
    raise SystemExit(0)

import random

st.set_page_config(page_title="Praxis demo", page_icon="📊", layout="wide")

st.title("Sample dashboard")
st.caption("Replace the random data below with a real loader.")

${v("points")} = [random.gauss(0, 1) for _ in range(500)]

${v("left")}, ${v("right")} = st.columns(2)
with ${v("left")}:
    st.metric("n points", len(${v("points")}))
    st.metric("mean", f"{sum(${v('points')}) / len(${v('points')}):.3f}")
with ${v("right")}:
    st.line_chart(${v("points")})

if st.button("Resample"):
    st.cache_data.clear()
    st.rerun()
`;
        }),
    py("py-ex-api-client", "api_client.py", "stdlib-only REST client: retries, timeouts, JSON, and a clean error type.", "Web & dashboards", "api_client",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""A dependency-free API client — urllib.request + retry + JSON.

requests is the ergonomic choice in real projects; this shows the
pattern (base url, timeout, retries, one error type) with zero deps.
"""
import json
import time
import urllib.error
import urllib.request


class ${c("ApiError")}(RuntimeError):
    """Raised for transport failures and non-2xx responses."""


def ${f("get_json")}(url: str, *, timeout: float = 5.0, retries: int = 2) -> object:
    """GET a URL and parse the JSON body, retrying transient errors."""
    ${v("last_error")}: Exception | None = None
    for ${v("attempt")} in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as ${v("response")}:
                if 200 <= ${v("response")}.status < 300:
                    return json.loads(${v("response")}.read().decode("utf-8"))
                raise ${c("ApiError")}(f"HTTP {${v('response')}.status} from {url}")
        except (urllib.error.URLError, TimeoutError) as ${v("err")}:
            ${v("last_error")} = ${v("err")}
            if ${v("attempt")} < retries:
                time.sleep(0.5 * (2 ** ${v("attempt")}))  # 0.5s, 1s backoff
    raise ${c("ApiError")}(f"failed after {retries + 1} attempts: {${v('last_error')}}")


if __name__ == "__main__":
    # Offline demo: the pattern works; the endpoint is placeholder.
    try:
        ${v("data")} = ${f("get_json")}("http://localhost:1/nope", retries=0, timeout=1)
    except ${c("ApiError")} as ${v("err")}:
        print("client works — got the expected controlled error:")
        print(f"  {${v('err')}}")
`;
        }),

    // ─── Config & helpers ─────────────────────────────────────────────
    py("py-ex-config-module", "config.py — settings module", "Typed settings with defaults + environment overrides — the 12-factor habit.", "Config & helpers", "config_module",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""Central configuration — one dataclass, env-var overrides, no globals.

Usage:  from config import settings; settings.maxWorkers
"""
from dataclasses import dataclass
import os


def ${f("read_int")}(key: str, default: int) -> int:
    """Read an int env var, falling back cleanly on junk."""
    ${v("raw_value")} = os.environ.get(key)
    try:
        return int(${v("raw_value")}) if ${v("raw_value")} is not None else default
    except ValueError:
        return default


@dataclass(frozen=True)
class ${c("Settings")}:
    """Snapshot of every tunable — frozen so nobody mutates it mid-run."""

    dataDir: str = os.environ.get("DATA_DIR", "./data")
    logLevel: str = os.environ.get("LOG_LEVEL", "INFO")
    maxWorkers: int = 2
    cacheTtlSeconds: int = 3600


${v("settings_instance")} = ${c("Settings")}(maxWorkers=${f("read_int")}("MAX_WORKERS", 4))

if __name__ == "__main__":
    print("effective settings:")
    for ${v("field_name")}, ${v("value")} in vars(${v("settings_instance")}).items():
        print(f"  {${v('field_name')}.ljust(16)} = {${v('value')}}")
`;
        }),
    py("py-ex-utils", "utils.py — helper collection", "The repo's junk drawer done right: timing, retries, safe paths, chunking.", "Config & helpers", "utils_module",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Small helpers every project ends up needing.

Each one is importable, typed, and has a docstring — the difference
between utils.py and utils.py people actually trust.
"""
import time
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def ${f("timed_block")}(label: str) -> Iterator[None]:
    """Print how long a block took — the quick profiling habit."""
    ${v("start_time")} = time.perf_counter()
    try:
        yield
    finally:
        ${v("elapsed")} = time.perf_counter() - ${v("start_time")}
        print(f"[{label}] {${v('elapsed')} * 1000:.1f} ms")


def ${f("chunk_into_batches")}(items: list, size: int) -> Iterator[list]:
    """Yield successive size-sized batches from items."""
    if size < 1:
        raise ValueError("size must be >= 1")
    for ${v("index")} in range(0, len(items), size):
        yield items[${v("index")}:${v("index")} + size]


def ${f("safe_output_path")}(base: str, *parts: str) -> Path:
    """Join + create + return a path,mkdir-ing parents once."""
    ${v("target_dir")} = Path(base).joinpath(*parts)
    ${v("target_dir")}.mkdir(parents=True, exist_ok=True)
    return ${v("target_dir")}


def ${f("flatten_once")}(nested: Iterable[Iterable]) -> list:
    """Flatten exactly one level: [[1,2],[3]] -> [1,2,3]."""
    return [item for group in nested for item in group]


if __name__ == "__main__":
    with ${f("timed_block")}("demo"):
        ${v("batches")} = list(${f("chunk_into_batches")}(list(range(10)), 3))
    print("batches:", ${v("batches")})
    print("flattened:", ${f("flatten_once")}(${v("batches")}))
    print("utils demo complete")
`;
        }),
    py("py-ex-logging-setup", "logging_setup.py", "One importable setup_logging() — the logging config every repo copies around.", "Config & helpers", "logging_setup",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Reusable logging setup — import setup_logging and stop copy-pasting.

    from logging_setup import setup_logging
    logger = setup_logging(__name__)
"""
import logging
import sys

FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"


def ${f("setup_logging")}(name: str = "app", *, level: int = logging.INFO) -> logging.Logger:
    """Configure root logging once and return a named logger."""
    ${v("root_logger")} = logging.getLogger()
    if not ${v("root_logger")}.handlers:
        ${v("handler")} = logging.StreamHandler(sys.stderr)
        ${v("handler")}.setFormatter(logging.Formatter(FORMAT))
        ${v("root_logger")}.addHandler(${v("handler")})
        ${v("root_logger")}.setLevel(level)
    return logging.getLogger(name)


if __name__ == "__main__":
    ${v("demo_logger")} = ${f("setup_logging")}("demo", level=logging.DEBUG)
    ${v("demo_logger")}.debug("debug level is visible")
    ${v("demo_logger")}.info("info message")
    ${v("demo_logger")}.warning("warning message")
`;
        }),
    py("py-ex-version", "version.py", "__version__ + a parsed tuple — the single source of truth for the package version.", "Config & helpers", "version_module",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Single source of truth for the version — imported by pyproject and
setup.py via importlib.metadata or a plain import.
"""
from __future__ import annotations

__version__ = "0.1.0"


def ${f("version_tuple")}() -> tuple[int, int, int, str | None]:
    """Parse __version__ into (major, minor, patch, pre-release)."""
    ${v("parts")} = __version__.split("-", 1)
    ${v("numbers")} = tuple(int(part) for part in ${v("parts")}[0].split("."))
    while len(${v("numbers")}) < 3:
        ${v("numbers")} = (*${v("numbers")}, 0)  # type: ignore[misc]
    ${v("pre_release")} = ${v("parts")}[1] if len(${v("parts")}) > 1 else None
    return (*${v("numbers")}, ${v("pre_release")})  # type: ignore[misc]


if __name__ == "__main__":
    print(f"__version__ = {__version__!r}")
    print(f"tuple       = {${f('version_tuple')}()}")
`;
        }),

    // ─── Quality & tests ──────────────────────────────────────────────
    py("py-ex-conftest", "conftest.py — shared fixtures", "pytest fixtures shared by the whole test suite; runs standalone too.", "Quality & tests", "conftest",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Shared pytest fixtures — auto-discovered by every test in the folder.

Runs standalone as well, so the example stays green without pytest.
"""
from __future__ import annotations

try:
    import pytest
except ImportError:  # standalone run — define a no-op decorator
    pytest = None  # type: ignore[assignment]


${v("sample_rows")} = [
    {"id": 1, "region": "north", "value": 12.5},
    {"id": 2, "region": "south", "value": 18.2},
    {"id": 3, "region": "east", "value": 9.9},
]


if pytest is not None:

    @pytest.fixture
    def ${v("rows_fixture")}() -> list[dict]:
        """A small tidy dataset for data-oriented tests."""
        return [dict(row) for row in ${v("sample_rows")}]

    @pytest.fixture
    def ${v("temp_output_dir")}(tmp_path):
        """A per-test output directory (pytest supplies tmp_path)."""
        ${v("output_dir")} = tmp_path / "out"
        ${v("output_dir")}.mkdir()
        return ${v("output_dir")}


if __name__ == "__main__":
    print(f"conftest loaded: {len(${v('sample_rows')})} sample rows ready")
    if pytest is None:
        print("(pytest not installed — fixtures defined only when it is)")
`;
        }, "conftest.py"),
    py("py-ex-test-basic", "test_basic.py — unittest suite", "Runnable both ways: `python test_basic.py` AND `pytest` collects it.", "Quality & tests", "test_basic",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""Smoke tests that need no framework beyond the standard library.

unittest is collected by pytest too, so this single file works under
both \`python test_basic.py\` and \`pytest\`.
"""
import unittest


def ${f("mean_value")}(values: list[float]) -> float:
    return sum(values) / len(values)


class ${c("TestMathHelpers")}(unittest.TestCase):
    """Guard the tiny helpers the rest of the suite leans on."""

    def ${f("test_mean_exact")}(self) -> None:
        self.assertAlmostEqual(${f("mean_value")}([1.0, 2.0, 3.0]), 2.0)

    def ${f("test_mean_empty_raises")}(self) -> None:
        with self.assertRaises(ZeroDivisionError):
            ${f("mean_value")}([])

    def ${f("test_mean_negative")}(self) -> None:
        self.assertAlmostEqual(${f("mean_value")}([-2.0, 2.0]), 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
`;
        }, "test_basic.py"),
    py("py-ex-db-sqlite", "db.py — SQLite layer", "Schema + CRUD behind functions — the stdlib persistence pattern.", "Quality & tests", "db_module",
        (s) => {
            const f = fn(s), v = vr(s), c = cl(s);
            return `# -*- coding: utf-8 -*-
"""A tiny SQLite data layer: schema in one place, CRUD behind functions.

sqlite3 ships with Python — zero setup, one file, transactional.
"""
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script TEXT NOT NULL,
    ok INTEGER NOT NULL,
    duration_ms REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
"""


def ${f("connect_in_memory")}() -> sqlite3.Connection:
    """Open (and initialize) the database."""
    ${v("connection")} = sqlite3.connect(":memory:")
    ${v("connection")}.row_factory = sqlite3.Row
    ${v("connection")}.executescript(SCHEMA)
    return ${v("connection")}


def ${f("record_run")}(connection: sqlite3.Connection, script: str, ok: bool, duration_ms: float) -> int:
    """Insert one run row and return its id."""
    ${v("cursor")} = connection.execute(
        "INSERT INTO runs (script, ok, duration_ms) VALUES (?, ?, ?)",
        (script, int(ok), duration_ms),
    )
    connection.commit()
    return int(${v("cursor")}.lastrowid or 0)


def ${f("recent_runs")}(connection: sqlite3.Connection, limit: int = 5) -> list[sqlite3.Row]:
    """Latest runs, newest first."""
    return connection.execute(
        "SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()


if __name__ == "__main__":
    ${v("database")} = ${f("connect_in_memory")}()
    for ${v("script_name")}, ${v("duration_value")} in [("hello.py", 120.5), ("plot.py", 890.0), ("hello.py", 95.1)]:
        ${f("record_run")}(${v("database")}, ${v("script_name")}, True, ${v("duration_value")})
    for ${v("row")} in ${f("recent_runs")}(${v("database")}):
        print(dict(${v("row")}))
`;
        }),

    // ─── Packaging markers ────────────────────────────────────────────
    py("py-ex-py-typed", "py.typed (PEP 561)", "The zero-byte-ish marker that tells type checkers: this package ships annotations.", "Packaging markers", "py_typed_marker",
        () => `# PEP 561 marker file.
#
# Its PRESENCE is the entire feature: a package containing py.typed
# declares that it ships inline type annotations, so mypy/pyright use
# them directly instead of falling back to stubs or ignoring types.
#
# Ship it inside your package directory (my_project/py.typed) and list
# it in MANIFEST.in / pyproject [tool.setuptools.package-data].
`, "py.typed"),
];
