/**
 * Other-file examples: Config and Data (csv/json/toml/ini style).
 *
 * every file whose name is a CANONICAL project-file name
 * (pyproject.toml, requirements.txt, .editorconfig, …) now carries a
 * `fixedName` so the naming-style engine can't mangle it — previously
 * a PascalCase user would have gotten "Pyproject.toml", and the
 * .editorconfig example even produced "editorconfig.editorconfig",
 * which the create-API then rejected as a hidden file.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";

const other = (
    id: string, label: string, description: string, category: string, sub: string, baseName: string,
    extension: string, body: string, fixedName?: string,
) => mkExample("other", id, label, description, category, sub, baseName, extension, () => body, fixedName);

export const OTHER_EXAMPLES: FileExample[] = [
    // ─── Config ──────────────────────────────────────────────────────
    other("other-ex-gitignore", ".gitignore (Python)", "Sensible Python ignore preset: bytecode, venvs, caches, secrets.", "Config", "Python tooling", "gitignore", ".gitignore", `# Python
__pycache__/
*.py[cod]
*.egg-info/
build/
dist/

# Virtual environments
.venv/
venv/

# Tooling caches
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/

# Editors / OS
.vscode/
.idea/
.DS_Store
Thumbs.db

# Secrets & scratch
.env
*.log
`, ".gitignore"),
    other("other-ex-requirements", "requirements.txt", "Pinned dependency manifest for data work.", "Config", "Python tooling", "requirements", ".txt", `# Data stack for the examples in this chapter
numpy>=2.0
pandas>=2.2
matplotlib>=3.9
`, "requirements.txt"),
    other("other-ex-pyproject", "pyproject.toml", "Modern packaging config for a small data project.", "Config", "Python tooling", "pyproject", ".toml", `[project]
name = "my-project"
version = "0.1.0"
description = "TODO: one-line description"
requires-python = ">=3.12"
dependencies = [
  "numpy>=2.0",
  "pandas>=2.2",
  "matplotlib>=3.9",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6", "mypy>=1.11"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
addopts = "-q"
`, "pyproject.toml"),
    other("other-ex-pytest-ini", "pytest.ini", "Test discovery and marker configuration.", "Config", "Python tooling", "pytest_config", ".ini", `[pytest]
minversion = 8.0
testpaths = tests
addopts = -ra --strict-markers --tb=short

markers =
    slow: takes more than 1s
    integration: needs a running service

log_format = %(asctime)s %(levelname)s %(name)s: %(message)s
log_level = INFO
`, "pytest.ini"),
    other("other-ex-ruff-toml", "ruff.toml", "Linter/formatter rules tuned for notebooks-first projects.", "Config", "Python tooling", "ruff", ".toml", `line-length = 100
target-version = "py312"

[lint]
select = ["E", "F", "W", "I", "B", "UP", "SIM"]
ignore = [
  "E501",  # line length handled by the formatter
  "B008",  # default factories in dataclasses are fine
]

[lint.per-file-ignores]
"__init__.py" = ["F401"]

[format]
quote-style = "double"
indent-style = "space"
`, "ruff.toml"),
    other("other-ex-editorconfig", ".editorconfig", "One file that ends the tabs-vs-spaces war across editors.", "Config", "Editor & env", "editorconfig", ".editorconfig", `# https://editorconfig.org
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.py]
indent_size = 4

[*.{md,txt}]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`, ".editorconfig"),
    other("other-ex-vscode-settings", "VS Code workspace settings", "Workspace settings tuned for Python + notebooks — save as settings.json inside .vscode/.", "Config", "Editor & env", "workspace_settings", ".json", `{
  "editor.formatOnSave": true,
  "editor.rulers": [100],
  "files.exclude": {
    "**/__pycache__": true,
    "**/.pytest_cache": true
  },
  "python.defaultInterpreterPath": ".venv/bin/python",
  "python.analysis.typeCheckingMode": "basic",
  "python.analysis.autoImportCompletions": true,
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  }
}
`, "settings.json"),

    // ─── Data ────────────────────────────────────────────────────────
    other("other-ex-csv", "Sample CSV data", "Small tidy dataset ready for the pandas examples.", "Data", "CSV datasets", "sample_data", ".csv", `id,region,product,amount
1,north,alpha,120.0
2,north,beta,80.5
3,south,alpha,210.0
4,south,beta,95.25
5,east,alpha,150.0
6,east,beta,60.0
7,west,alpha,175.5
8,west,beta,88.75
`),
    other("other-ex-csv-timeseries", "Time-series CSV", "Daily dated rows with a gap and a missing value — realistic.", "Data", "CSV datasets", "daily_temps", ".csv", `date,temp_c,humidity
2026-10-01,21.4,41
2026-10-02,22.1,44
2026-10-03,,48
2026-10-04,20.8,50
2026-10-05,19.2,55
2026-10-07,18.9,61
2026-10-08,17.5,66
2026-10-09,19.8,58
2026-10-10,21.0,49
`),
    other("other-ex-csv-survey", "Survey CSV", "Categorical + Likert responses with an explicit missing code.", "Data", "CSV datasets", "survey_responses", ".csv", `respondent_id,age,channel,satisfaction,comments
101,34,web,5,
102,,mobile,4,great ui
103,41,web,3,found it slow at first
104,27,desktop,5,
105,52,mobile,2,-999
106,38,web,4,docs were helpful
107,45,web,5,best tool ive used
108,29,mobile,3,
`),
    other("other-ex-json-data", "Sample JSON data", "Nested records file ready for json/pandas examples.", "Data", "JSON datasets", "sample_records", ".json", `{
  "generated": "2026-01-01",
  "records": [
    { "id": 1, "region": "north", "value": 12.5, "tags": ["a"] },
    { "id": 2, "region": "south", "value": 18.2, "tags": ["a", "b"] },
    { "id": 3, "region": "east", "value": 9.9, "tags": [] },
    { "id": 4, "region": "west", "value": 15.3, "tags": ["b"] }
  ]
}
`),
    other("other-ex-json-config", "JSON config file", "Layered config with a section per environment.", "Data", "JSON datasets", "config", ".json", `{
  "app": {
    "name": "praxis-demo",
    "version": 2,
    "features": ["figures", "notes", "ai"]
  },
  "limits": {
    "max_rows": 1000,
    "timeout_seconds": 30
  },
  "environments": {
    "development": { "debug": true, "workers": 1 },
    "production": { "debug": false, "workers": 4 }
  }
}
`),
    other("other-ex-tsv", "TSV matrix", "Tab-separated numeric matrix with a header row.", "Data", "Tabular", "distance_matrix", ".tsv", `sample\tx1\tx2\tx3
a\t0.00\t1.73\t4.10
b\t1.73\t0.00\t2.44
c\t4.10\t2.44\t0.00
d\t3.16\t1.41\t2.83
`),
];
