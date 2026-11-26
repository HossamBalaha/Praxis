# tags: cli, getting-started
"""Temperature — a two-way converter CLI.

Try:
    --celsius 36.6
    --fahrenheit 98.6
    --table 0 100 20
"""
import argparse

parser = argparse.ArgumentParser(description="Convert temperatures both ways")
parser.add_argument("--celsius", type=float, help="convert C -> F")
parser.add_argument("--fahrenheit", type=float, help="convert F -> C")
parser.add_argument("--table", nargs="*", type=float, metavar="C", help="print a C->F table")
args = parser.parse_args()

if args.celsius is not None:
  print(f"{args.celsius:.2f} C = {args.celsius * 9 / 5 + 32:.2f} F")
if args.fahrenheit is not None:
  print(f"{args.fahrenheit:.2f} F = {(args.fahrenheit - 32) * 5 / 9:.2f} C")
if args.table:
  print(f"{'C':>8} {'F':>8}")
  for c in args.table:
    print(f"{c:8.1f} {c * 9 / 5 + 32:8.1f}")
if args.celsius is None and args.fahrenheit is None and not args.table:
  parser.print_help()
