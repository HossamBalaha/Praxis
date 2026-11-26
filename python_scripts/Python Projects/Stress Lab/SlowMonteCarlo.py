# tags: benchmark, long-run
"""Slow Monte Carlo — a LONG run (~45-60 s).

Estimates pi with plain rejection sampling and prints a progress
report with ETA every 200k trials, so the IDE's live output, run
duration warning ("this run may take a while") and history timing can
all be exercised. Reduce TRIALS below for a shorter pass.
"""
import random
import time

TRIALS = 52_000_000  # ~50 s on a typical laptop core
REPORT_EVERY = 200_000


def estimate_pi(trials: int) -> tuple[float, int]:
  rng = random.Random(2026)
  inside = 0
  t0 = time.perf_counter()
  for i in range(1, trials + 1):
    x = rng.random()
    y = rng.random()
    if x * x + y * y <= 1.0:
      inside += 1
    if i % REPORT_EVERY == 0:
      done = i / trials
      elapsed = time.perf_counter() - t0
      eta = elapsed / done - elapsed if done else 0.0
      bar = "#" * int(done * 24) + "-" * (24 - int(done * 24))
      print(
        f"[mc] {bar} {done * 100:5.1f}%  pi~{4 * inside / i:.6f}"
        f"  elapsed {elapsed:6.1f}s  eta {eta:6.1f}s",
        flush=True,
      )
  return 4 * inside / trials, inside


def main() -> None:
  print(f"[mc] starting {TRIALS:,} trials — expect roughly a minute.", flush=True)
  t0 = time.perf_counter()
  pi, inside = estimate_pi(TRIALS)
  dt = time.perf_counter() - t0
  print(f"[mc] finished in {dt:,.1f} s — {inside:,} points fell inside the quarter circle")
  print(f"[mc] pi estimate  = {pi:.8f}")
  print(f"[mc] pi reference = 3.14159265")
  print(f"[mc] abs error    = {abs(pi - 3.141592653589793):.8f}")


if __name__ == "__main__":
  main()
