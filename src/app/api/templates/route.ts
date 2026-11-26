import {NextResponse} from "next/server";

/**
 * GET /api/templates
 *
 * Returns a list of script templates the user can choose from when
 * creating a new script. Templates are static strings defined here —
 * they're not user-editable (yet).
 *
 * the library grew from 5 to 15 templates and every snippet
 * now follows the house style — PascalCase file names, camelCase
 * identifiers — so "New from Template" files land in python_scripts
 * already conforming.
 *
 * Response: { templates: [{ id, name, description, content }] }
 */
export const runtime = "nodejs";

interface Template {
    id: string;
    name: string;
    description: string;
    content: string;
}

const TEMPLATES: Template[] = [
    {
        id: "empty",
        name: "Empty script",
        description: "A bare-minimum Python script with a main block.",
        content: `"""
Script Name
Description
"""

if __name__ == "__main__":
    print("Hello, Praxis!")
`,
    },
    {
        id: "plotting",
        name: "Plotting script",
        description: "A matplotlib plotting template with figure capture.",
        content: `"""
Plotting Demo
"""
import matplotlib.pyplot as plt


def main():
    figure, axis = plt.subplots(figsize=(8, 4))
    axis.plot([1, 2, 3, 4], [1, 4, 9, 16], "o-", color="#10b981")
    axis.set_title("Demo Plot")
    axis.set_xlabel("x")
    axis.set_ylabel("y")
    axis.grid(alpha=0.3)
    plt.tight_layout()
    plt.show()
    print("Figure captured.")


if __name__ == "__main__":
    main()
`,
    },
    {
        id: "data-analysis",
        name: "Data analysis script",
        description: "A pandas DataFrame template with output capture.",
        content: `"""
Data Analysis Demo
"""
import pandas as pd


def main():
    frame = pd.DataFrame({
        "studentName": ["Alice", "Bob", "Charlie"],
        "score": [85, 72, 90],
    })
    print(frame)
    print(f"\\nMean score: {frame['score'].mean():.2f}")


if __name__ == "__main__":
    main()
`,
    },
    {
        id: "unit-test",
        name: "Unit test script",
        description: "A pytest-compatible test template.",
        content: `"""
Test Suite
"""
import pytest


def test_basic():
    assert 1 + 1 == 2


def test_string():
    assert "hello".upper() == "HELLO"


def test_list():
    assert len([1, 2, 3]) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
`,
    },
    {
        id: "cells",
        name: "Cell-based script",
        description: "A script with # %% cell markers for cell-by-cell execution.",
        content: `# %% [markdown]
# # Cell-Based Script
#
# Each cell can be run independently.

# %% Setup
import numpy as np

sampleData = np.random.randn(100)
print(f"Generated {len(sampleData)} samples")

# %% Analysis
meanValue = sampleData.mean()
stdValue = sampleData.std()
print(f"Mean: {meanValue:.4f}")
print(f"Std : {stdValue:.4f}")

# %% [markdown]
# ## Plot

# %% Plot
import matplotlib.pyplot as plt

plt.figure(figsize=(8, 3))
plt.hist(sampleData, bins=20, color="#10b981")
plt.title("Distribution")
plt.show()
`,
    },
    {
        id: "cli",
        name: "Command-line tool",
        description: "An argparse CLI with typed flags, defaults and a main guard.",
        content: `"""
Command-Line Tool
Parse flags with argparse — safe to run with no arguments.
"""
import argparse


def buildParser() -> argparse.ArgumentParser:
    """Build the CLI parser with typed flags and defaults."""
    parser = argparse.ArgumentParser(description="Describe what this tool does.")
    parser.add_argument("--greeting", default="Hello", help="opening word")
    parser.add_argument("--times", type=int, default=1, help="repeat count")
    parser.add_argument("--shout", action="store_true", help="UPPERCASE the output")
    parser.add_argument("names", nargs="*", default=["reader"], help="who to greet")
    return parser


def renderGreeting(greeting: str, names: list[str], times: int, shout: bool) -> str:
    """Turn the parsed flags into one output string."""
    line = ", ".join(f"{greeting}, {name}!" for name in names)
    if shout:
        line = line.upper()
    return "\\n".join([line] * times)


if __name__ == "__main__":
    args = buildParser().parse_args()
    print(renderGreeting(args.greeting, args.names, args.times, args.shout))
`,
    },
    {
        id: "dataclass",
        name: "Dataclass record",
        description: "A frozen, slotted dataclass with computed helpers.",
        content: `"""
Dataclass Record
Lean immutable records with dataclasses.
"""
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class InventoryItem:
    """A stock line with a computed total."""

    productName: str
    unitPrice: float
    quantity: int = 0

    @property
    def totalValue(self) -> float:
        return self.unitPrice * self.quantity


if __name__ == "__main__":
    screws = InventoryItem("wood screw", unitPrice=0.08, quantity=500)
    print("line  :", screws.productName, "->", screws.totalValue)
    print("hash  :", hash(screws) == hash(InventoryItem("wood screw", 0.08, 500)))
`,
    },
    {
        id: "async",
        name: "Async script",
        description: "An asyncio main() with gathered concurrent jobs.",
        content: `"""
Async Demo
Concurrent jobs with asyncio.
"""
import asyncio


async def probeSensor(sensorName: str, delaySeconds: float) -> str:
    """Simulate one sensor read that takes a moment."""
    await asyncio.sleep(delaySeconds)
    return f"{sensorName}={21.0 + delaySeconds:.1f}C"


async def main() -> None:
    """Gather every probe and print the results."""
    results = await asyncio.gather(
        probeSensor("tower-a", 0.02),
        probeSensor("tower-b", 0.01),
    )
    for line in results:
        print("reading:", line)


if __name__ == "__main__":
    asyncio.run(main())
`,
    },
    {
        id: "sqlite",
        name: "SQLite script",
        description: "An in-memory SQLite table with safe parameterized CRUD.",
        content: `"""
SQLite Demo
A tiny in-memory database with parameterized statements.
"""
import sqlite3


def main():
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE readings (sensor TEXT, celsius REAL)")
    connection.executemany(
        "INSERT INTO readings VALUES (?, ?)",
        [("tower-a", 21.4), ("tower-b", 19.8), ("buoy-3", 16.2)],
    )
    rows = connection.execute(
        "SELECT sensor, celsius FROM readings ORDER BY celsius DESC"
    ).fetchall()
    connection.close()

    for sensorName, celsius in rows:
        print(f"{sensorName:8s} {celsius:5.1f} C")


if __name__ == "__main__":
    main()
`,
    },
    {
        id: "logging",
        name: "Logging script",
        description: "A logger configured for console output at five levels.",
        content: `"""
Logging Demo
Structured log output through the standard levels.
"""
import logging
import sys

logging.basicConfig(
    stream=sys.stdout,
    level=logging.DEBUG,
    format="%(levelname)-8s %(name)s: %(message)s",
)

log = logging.getLogger("praxis.demo")


def main():
    log.debug("verbose detail for developers")
    log.info("normal progress message")
    log.warning("something looks off")
    log.error("an operation failed")
    log.critical("the run cannot continue")


if __name__ == "__main__":
    main()
`,
    },
    {
        id: "decorators",
        name: "Decorator script",
        description: "A reusable decorator built with functools.wraps.",
        content: `"""
Decorator Demo
Wrap any function with extra behavior.
"""
import time
from functools import wraps


def timedCall(func):
    """Print how long one call took, in milliseconds."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        startMark = time.perf_counter()
        result = func(*args, **kwargs)
        elapsedMs = (time.perf_counter() - startMark) * 1000
        print(f"{func.__name__}: {elapsedMs:.2f} ms")
        return result

    return wrapper


@timedCall
def buildTotal(count: int) -> int:
    """Sum a range the plain way, on purpose."""
    runningTotal = 0
    for step in range(count):
        runningTotal += step
    return runningTotal


if __name__ == "__main__":
    print("total  :", buildTotal(200_000))
`,
    },
    {
        id: "generators",
        name: "Generator script",
        description: "A lazy pipeline of chained generator stages.",
        content: `"""
Generator Demo
Chain lazy stages into one pipeline.
"""
from typing import Iterable, Iterator


def keepPositive(source: Iterable[int]) -> Iterator[int]:
    """Drop anything that is not above zero."""
    for value in source:
        if value > 0:
            yield value


def squared(source: Iterator[int]) -> Iterator[int]:
    """Square whatever flows through."""
    for value in source:
        yield value * value


if __name__ == "__main__":
    rawData = [-3, 1, -7, 4, 0, 9]
    pipeline = squared(keepPositive(rawData))
    print("squares:", list(pipeline))
`,
    },
    {
        id: "retry",
        name: "Retry & error handling",
        description: "A custom exception plus a bounded retry loop.",
        content: `"""
Retry Demo
A custom exception with a bounded retry loop.
"""
import random
import time


class ServiceUnavailable(RuntimeError):
    """Raised when the flaky service lets us down."""


def fetchReading(attempt: int) -> str:
    """Simulate a call that only succeeds after a few tries."""
    if random.random() < 0.5:
        raise ServiceUnavailable(f"attempt {attempt} failed")
    return f"reading {21.0 + attempt:.1f}C"


def retryCall(maxAttempts: int = 4) -> str:
    """Keep calling until success or the budget runs out."""
    for attempt in range(1, maxAttempts + 1):
        try:
            return fetchReading(attempt)
        except ServiceUnavailable as err:
            print("retry  :", err)
            time.sleep(0.05 * attempt)
    raise ServiceUnavailable(f"gave up after {maxAttempts} attempts")


if __name__ == "__main__":
    random.seed(7)
    print("result :", retryCall())
`,
    },
    {
        id: "typing",
        name: "Typed script",
        description: "A TypedDict record plus fully annotated helpers.",
        content: `"""
Typed Demo
Modern type hints on a small report builder.
"""
from typing import TypedDict


class Sample(TypedDict):
    sensor: str
    celsius: float


def buildReport(samples: list[Sample]) -> str:
    """Render one summary line from typed records."""
    hottest = max(samples, key=lambda sample: sample["celsius"])
    return f"{len(samples)} samples, hottest {hottest['sensor']} at {hottest['celsius']}C"


if __name__ == "__main__":
    collected: list[Sample] = [
        Sample(sensor="tower-a", celsius=21.4),
        Sample(sensor="buoy-3", celsius=16.2),
    ]
    print("report :", buildReport(collected))
`,
    },
    {
        id: "files",
        name: "File I/O script",
        description: "A pathlib read/write round trip in the temp folder.",
        content: `"""
File IO Demo
Write, read back and clean up with pathlib + json.
"""
import json
import tempfile
from pathlib import Path


def main():
    payload = {"theme": "dark", "levels": [1, 5, 9]}
    target = Path(tempfile.gettempdir()) / "praxis_roundtrip.json"

    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    loaded = json.loads(target.read_text(encoding="utf-8"))
    target.unlink(missing_ok=True)

    print("match  :", loaded == payload)
    print("theme  :", loaded["theme"])
    print("bytes  :", len(json.dumps(payload)))


if __name__ == "__main__":
    main()
`,
    },
];

export async function GET() {
    return NextResponse.json({templates: TEMPLATES});
}
