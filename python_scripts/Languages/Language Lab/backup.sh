#!/usr/bin/env bash
# tags: shell, getting-started
# backup.sh — runs through bash. The Auto-indent shell entry fixes the
# if/then/fi and case/esac levels; the heredoc body stays frozen.

set -eu

TARGET_DIR="${1:-.}"
EXTENSIONS=("py" "js" "ts" "m" "md")

count_for_ext() {
  find "$TARGET_DIR" -name "*.$1" -type f 2>/dev/null | wc -l
}

echo "backup report for: $TARGET_DIR"
for ext in "${EXTENSIONS[@]}"; do
  n=$(count_for_ext "$ext")
  if [ "$n" -gt 0 ]; then
    echo "  .$ext files: $n"
  else
    echo "  .$ext files: none"
  fi
done

case "${OSTYPE:-unknown}" in
  linux*)
    echo "platform: linux"
    ;;
  darwin*)
    echo "platform: macOS"
    ;;
  *)
    echo "platform: ${OSTYPE:-unknown}"
    ;;
esac

cat <<EOF
summary
-------
scanned: $TARGET_DIR
done — shell run complete.
EOF
