# tags: interactive, fun
"""Burger Builder — a tiny REPL over the stdin box.

Commands (one per input): bun, patty, cheese, lettuce, tomato, sauce,
done. Anything else is politely declined. `done` prints the receipt.
"""
menu = {
  "bun"    : 1.20,
  "patty"  : 3.50,
  "cheese" : 0.80,
  "lettuce": 0.30,
  "tomato" : 0.40,
  "sauce"  : 0.25,
}
stack: list = []
total = 0.0
print("build your burger — commands: " + ", ".join(menu) + ", done")
while True:
  cmd = input("burger> ").strip().lower()
  if cmd == "done":
    break
  if cmd in menu:
    stack.append(cmd)
    total += menu[cmd]
    print(f"added {cmd} (+{menu[cmd]:.2f}) — {len(stack)} layer(s)")
  elif cmd:
    print(f"no such layer: {cmd}")
print("\nreceipt:")
for layer in stack:
  print(f"  {layer:8s} {menu[layer]:5.2f}")
print(f"  {'TOTAL':8s} {total:5.2f}")
