/**
 * — "Project files": the standard scaffolding files you
 * find in virtually every modern Python/data repository, but which the
 * library didn't cover yet. User request: "add more example of the
 * commonly used files used nowadays in many projects; the current ones
 * are good but i believe there are many default other one in py and
 * others; investigate."
 *
 * What a modern repo actually carries (beyond the Config examples that
 * already existed: .gitignore / requirements / pyproject / pytest.ini /
 * ruff.toml / .editorconfig / settings.json):
 *   - packaging:  setup.py, setup.cfg, MANIFEST.in, requirements-dev.txt,
 *                 environment.yml, Pipfile
 *   - build:      Makefile, Justfile
 *   - containers: Dockerfile, docker-compose.yml
 *   - CI/CD:      GitHub Actions workflow, .pre-commit-config.yaml,
 *                 tox.ini, .flake8, mypy.ini, .readthedocs.yaml
 *   - community:  LICENSE, CITATION.cff
 *   - environment: .env.example
 *
 * Every entry uses `fixedName` — these file names are canonical and
 * must NOT pass through the naming-style engine (a "Makefile" is a
 * Makefile, not a "MakeFile"). These are static bodies: no style tokens,
 * and NO reindent is applied to them (Makefiles require literal tabs,
 * YAML indentation is semantic) — only the PYTHON project files in
 * python-project.ts get indentation conversion.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const CAT = "Project files";

const pf = (
    id: string, label: string, description: string, sub: string, baseName: string,
    extension: string, body: string, fixedName: string,
) => mkExample("other", id, label, description, CAT, sub, baseName, extension, () => body, fixedName);

export const OTHER_PROJECT_EXAMPLES: FileExample[] = [
    // ─── Packaging & dependencies ─────────────────────────────────────
    pf("other-ex-setup-py", "setup.py", "Classic setuptools shim — still found in thousands of repos alongside pyproject.toml.", "Packaging & deps", "setup", ".py", `"""Classic setuptools setup — a thin shim is the modern recommendation
when pyproject.toml already carries the metadata."""
from setuptools import setup

setup(
    name="my-project",
    version="0.1.0",
    description="One-line description of the project",
    author="Your Name",
    license="MIT",
    python_requires=">=3.11",
    packages=["my_project"],
    install_requires=[
        "numpy>=2.0",
        "pandas>=2.2",
    ],
)
`, "setup.py"),
    pf("other-ex-setup-cfg", "setup.cfg", "INI-style packaging metadata — the middle generation between setup.py and pyproject.toml.", "Packaging & deps", "setup_cfg", ".cfg", `[metadata]
name = my-project
version = 0.1.0
description = One-line description of the project
long_description = file: README.md
long_description_content_type = text/markdown
license = MIT

[options]
packages = find:
python_requires = >=3.11
install_requires =
    numpy>=2.0
    pandas>=2.2

[options.extras_require]
dev =
    pytest>=8
    ruff>=0.6

[options.packages.find]
exclude =
    tests*
    docs*
`, "setup.cfg"),
    pf("other-ex-manifest-in", "MANIFEST.in", "Extra non-code files to ship in the sdist (data, docs, license).", "Packaging & deps", "manifest", ".in", `# Extra files included in the source distribution
include LICENSE
include README.md
recursive-include docs *.md *.png
recursive-include my_project/data *.csv
global-exclude *.py[cod] __pycache__ .DS_Store
`, "MANIFEST.in"),
    pf("other-ex-requirements-dev", "requirements-dev.txt", "Developer-only dependencies, chaining the runtime manifest.", "Packaging & deps", "requirements_dev", ".txt", `# Runtime dependencies
-r requirements.txt

# Development & quality gates
pytest>=8.0
pytest-cov>=5.0
ruff>=0.6
mypy>=1.11
pre-commit>=3.8
build>=1.2
`, "requirements-dev.txt"),
    pf("other-ex-environment-yml", "environment.yml", "Reproducible conda environment for a data project.", "Packaging & deps", "environment", ".yml", `name: stats-book
channels:
  - conda-forge
dependencies:
  - python=3.12
  - pip
  - pip:
      - numpy>=2.0
      - pandas>=2.2
      - matplotlib>=3.9
      - jupyterlab>=4
      - -r requirements.txt
`, "environment.yml"),
    pf("other-ex-pipfile", "Pipfile", "pipenv manifest: packages vs dev-packages with hashes.", "Packaging & deps", "pipfile", "", `[[source]]
url = "https://pypi.org/simple"
verify_ssl = true
name = "pypi"

[packages]
numpy = ">=2.0"
pandas = ">=2.2"
matplotlib = ">=3.9"

[dev-packages]
pytest = ">=8.0"
ruff = ">=0.6"

[requires]
python_version = "3.12"

[scripts]
tests = "pytest -q"
lint = "ruff check ."
`, "Pipfile"),

    // ─── Build & tasks ────────────────────────────────────────────────
    pf("other-ex-makefile", "Makefile", "install / lint / test / run / clean targets — the universal task runner.", "Build & tasks", "makefile", "", `PYTHON ?= python3
PIP ?= $(PYTHON) -m pip

.PHONY: install lint format test coverage run clean

install:
        $(PIP) install -e ".[dev]"

lint:
        $(PYTHON) -m ruff check .
        $(PYTHON) -m mypy my_project

format:
        $(PYTHON) -m ruff check --fix .
        $(PYTHON) -m ruff format .

test:
        $(PYTHON) -m pytest -q

coverage:
        $(PYTHON) -m pytest --cov=my_project --cov-report=term-missing

run:
        $(PYTHON) -m my_project

clean:
        rm -rf build dist *.egg-info .pytest_cache .mypy_cache .ruff_cache
        find . -name "__pycache__" -type d -exec rm -rf {} +
`, "Makefile"),
    pf("other-ex-justfile", "Justfile", "justfile recipes — a friendlier Make for modern repos.", "Build & tasks", "justfile", "", `# https://github.com/casey/just
set shell := ["bash", "-cu"]

default: lint test

# Install the package + dev tools
install:
    pip install -e ".[dev]"

# Fast feedback loop
lint:
    ruff check .
    ruff format --check .

# Run the test suite
test:
    pytest -q

# Open an interactive shell with the env loaded
shell:
    @echo "Demo recipe — customize me"
`, "Justfile"),

    // ─── Containers ───────────────────────────────────────────────────
    pf("other-ex-dockerfile", "Dockerfile", "python:3.12-slim, non-root user, cached deps layer, thin CMD.", "Containers", "dockerfile", "", `FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first — this layer only rebuilds when the manifests change.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code (changes most often — kept last).
COPY . .

# Never run as root.
RUN useradd --create-home appuser
USER appuser

CMD ["python", "-m", "my_project"]
`, "Dockerfile"),
    pf("other-ex-docker-compose", "docker-compose.yml", "One service + volume + env file — the compose file 90% of projects need.", "Containers", "docker_compose", ".yml", `services:
  app:
    build: .
    env_file:
      - .env
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
`, "docker-compose.yml"),

    // ─── CI / CD ──────────────────────────────────────────────────────
    pf("other-ex-gh-actions", "GitHub Actions workflow", "Matrix CI: lint + test on every push/PR (save as .github/workflows/ci.yml).", "CI / CD", "github_actions_ci", ".yml", `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        python-version: ["3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
          cache: pip
      - name: Install
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]"
      - name: Lint
        run: |
          ruff check .
          ruff format --check .
      - name: Test
        run: pytest -q --cov=my_project --cov-report=term
`, "ci.yml"),
    pf("other-ex-pre-commit", ".pre-commit-config.yaml", "Git-hook bundle: ruff lint + format + hygiene checks on every commit.", "CI / CD", "pre_commit_config", ".yaml", `# https://pre-commit.com — run: pre-commit install
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-json
      - id: check-merge-conflict
      - id: check-added-large-files
`, ".pre-commit-config.yaml"),
    pf("other-ex-tox-ini", "tox.ini", "One command to test against every interpreter: tox.", "CI / CD", "tox", ".ini", `[tox]
envlist = py311, py312, py313, lint
isolated_build = true

[testenv]
deps =
    pytest>=8
    pytest-cov>=5
commands =
    pytest --cov=my_project {posargs}

[testenv:lint]
skip_install = true
deps =
    ruff>=0.6
    mypy>=1.11
commands =
    ruff check .
    ruff format --check .
    mypy my_project
`, "tox.ini"),
    pf("other-ex-flake8", ".flake8", "flake8 configuration for repos that haven't moved fully to ruff.", "CI / CD", "flake8_config", ".flake8", `[flake8]
max-line-length = 100
extend-ignore =
    # line too long (formatter owns line length)
    E501,
    # whitespace before ':' (black/ruff-style slices)
    E203,
    # line break before binary operator (black/ruff-style)
    W503
exclude =
    .git,
    __pycache__,
    .venv,
    build,
    dist
per-file-ignores =
    __init__.py:F401
`, ".flake8"),
    pf("other-ex-mypy-ini", "mypy.ini", "Gradual typing: strict where it counts, lenient where it hurts.", "CI / CD", "mypy", ".ini", `[mypy]
python_version = 3.12
warn_unused_ignores = true
warn_redundant_casts = true
no_implicit_optional = true
check_untyped_defs = true

[mypy-my_project.*]
disallow_untyped_defs = true

# Third-party libs without stubs
[mypy-pandas.*]
ignore_missing_imports = true

[mypy-matplotlib.*]
ignore_missing_imports = true
`, "mypy.ini"),
    pf("other-ex-readthedocs", ".readthedocs.yaml", "Build the docs on Read the Docs with v2 config + sphinx.", "CI / CD", "readthedocs", ".yaml", `version: 2

build:
  os: ubuntu-24.04
  tools:
    python: "3.12"

sphinx:
  configuration: docs/conf.py

python:
  install:
    - method: pip
      path: .
    - requirements: docs/requirements.txt
`, ".readthedocs.yaml"),

    // ─── Docs & community ─────────────────────────────────────────────
    pf("other-ex-license", "LICENSE (MIT)", "The MIT license text — the default choice of most open data/code projects.", "Docs & community", "license", "", `MIT License

Copyright (c) 2026 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`, "LICENSE"),
    pf("other-ex-citation", "CITATION.cff", "Machine-readable citation metadata — GitHub renders a 'Cite this repository' button from it.", "Docs & community", "citation", ".cff", `cff-version: 1.2.0
message: >-
  If you use this project in your work, please cite it using the
  metadata below.
title: My Statistics Project
authors:
  - family-names: Doe
    given-names: Jane
    orcid: "https://orcid.org/0000-0000-0000-0000"
version: 0.1.0
date-released: "2026-11-07"
license: MIT
repository-code: "https://github.com/janedoe/my-project"
keywords:
  - statistics
  - python
  - teaching
type: software
`, "CITATION.cff"),

    // ─── Environment ──────────────────────────────────────────────────
    pf("other-ex-env-example", ".env.example", "Documented template of every environment variable the app reads — copy to .env and fill in.", "Environment", "env_example", ".example", `# Copy to .env and fill in the values. NEVER commit the real .env.

# Data locations
DATA_DIR=./data
OUTPUT_DIR=./outputs

# Optional external services
API_BASE_URL=https://api.example.com
API_KEY=replace-me

# Behavior knobs
LOG_LEVEL=INFO
MAX_WORKERS=4
CACHE_TTL_SECONDS=3600
`, ".env.example"),
];
