#!/usr/bin/env bash
# Build script — the shell viewer test set.
set -euo pipefail

BuildProject() {
  local targetDirectory="dist"
  echo "Building into ${targetDirectory}…"
  mkdir -p "${targetDirectory}"
  find "Getting Started" "Algorithms" -name "*.py" -exec cp {} "${targetDirectory}/" \;
  echo "Copied $(ls -1 "${targetDirectory}" | wc -l) files."
}

RunChecks() {
  python3 -m py_compile "Getting Started/HelloPraxis.py"
  echo "compile check ok"
}

BuildProject
RunChecks
echo "done."
