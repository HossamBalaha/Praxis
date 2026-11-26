# tags: cli, text
"""Word Count — wc-lite over argv or stdin.

Try:
    the quick brown fox jumps over the lazy dog
    --unique one two two three three three
"""
import argparse
import sys

parser = argparse.ArgumentParser(description="Count lines/words/chars of the input")
parser.add_argument("words", nargs="*", help="the text to count (or type in the stdin box)")
parser.add_argument("--unique", action="store_true", help="show the distinct-word table")
args = parser.parse_args()

text = " ".join(args.words).strip()
if not text:
  text = sys.stdin.read().strip()

words = text.split()
print(f"lines   : {text.count(chr(10)) + (1 if text else 0)}")
print(f"words   : {len(words)}")
print(f"chars   : {len(text)}")
if args.unique:
  counts: dict = {}
  for w in words:
    counts[w] = counts.get(w, 0) + 1
  for w, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
    print(f"{n:3d} x {w}")
