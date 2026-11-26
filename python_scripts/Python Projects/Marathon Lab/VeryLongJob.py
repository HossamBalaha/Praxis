# tags: benchmark, very-long-run
"""Very Long Job — a VERY long run (~4 minutes by default).

Streams a progress heartbeat every ~4 s (elapsed, ETA, phase) so the
Output panel, the run queue, Stop and the run-history timing can all
be exercised while the process grinds on. Pure stdlib, fully
interruptible (Stop kills it instantly), and accepts a duration
override:

    python VeryLongJob.py --seconds 30        # a quick smoke pass
    python VeryLongJob.py --seconds 240       # the default soak

NOTE: the default Run timeout (Settings → Advanced → Run) is 60 s —
raise it to 300+ for the full soak, or let it be killed to see the
timeout path in action (both are useful IDE tests).
"""
import argparse
import math
import time

PHASES = [
  "warming caches",
  "sampling sensors",
  "filtering noise",
  "aggregating windows",
  "cross-checking units",
  "compacting shards",
  "writing reports",
  "cooling down",
]


def math_sqrt_check(x: float) -> float:
  return (x * 0.5) ** 0.5


def soak(seconds: float) -> None:
  t0 = time.perf_counter()
  print(f"soak target: {seconds:.0f}s across {len(PHASES)} phases")
  print("tip: press Stop any time — the process dies instantly")
  while True:
    elapsed = time.perf_counter() - t0
    if elapsed >= seconds:
      break
    phase = PHASES[int(elapsed / seconds * len(PHASES)) % len(PHASES)]
    eta = seconds - elapsed
    done = int(elapsed / seconds * 28)
    bar = "#" * done + "-" * (28 - done)
    print(f"[{bar}] {elapsed:7.1f}s elapsed · ETA {eta:7.1f}s · {phase}")
    # A mix of sleep (interruptible) and light CPU (visible load).
    time.sleep(3.5)
    for _ in range(200_000):
      _ = math_sqrt_check(12345.678)
  print(f"done: {time.perf_counter() - t0:.1f}s total, all phases complete")


if __name__ == "__main__":
  ap = argparse.ArgumentParser(description="A very long, interruptible soak job")
  ap.add_argument("--seconds", type=float, default=240.0, help="duration (default 240)")
  args = ap.parse_args()
  soak(max(1.0, args.seconds))
