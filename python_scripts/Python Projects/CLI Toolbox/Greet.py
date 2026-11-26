# tags: cli, getting-started
"""Greet — an argparse CLI for the Run-with-args box.

Try (Run ▸ "Run with arguments…"):
    --name Praxis --count 3
    --name "fellow traveler" --count 1 --uppercase
"""
import argparse

parser = argparse.ArgumentParser(description="Greet someone, warmly, N times")
parser.add_argument("--name", default="world", help="who to greet")
parser.add_argument("--count", type=int, default=1, help="how many greetings")
parser.add_argument("--uppercase", action="store_true", help="SHOUT the greeting")
args = parser.parse_args()

greeting = f"Hello, {args.name}!"
if args.uppercase:
  greeting = greeting.upper()
for i in range(max(1, args.count)):
  print(f"[{i + 1}] {greeting}")
