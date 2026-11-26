# tags: benchmark, very-long-run, ceiling
"""Ceiling Soak — the 10-MINUTE server ceiling.

The run API hard-caps any run at 600 s (TIMEOUT_LIMIT_MS) no matter
what the client asks — this script targets exactly that ceiling so the
IDE's timeout guard, the Stop button and the run-queue bookkeeping can
all be tested at the extreme. Progress prints every 10 s.

    python CeilingSoak.py --seconds 600      # default: the full ceiling
    python CeilingSoak.py --seconds 90       # a shorter pass
"""
import argparse
import time

CHECK_EVERY = 10.0


def soak(seconds: float) -> None:
  t0 = time.perf_counter()
  print(f"target duration: {seconds:.0f}s (server ceiling: 600s)")
  n = 0
  while True:
    elapsed = time.perf_counter() - t0
    if elapsed >= seconds:
      break
    n += 1
    print(f"checkpoint {n:03d} · {elapsed:6.0f}s elapsed · {elapsed / seconds * 100:5.1f}% done")
    time.sleep(CHECK_EVERY)
  print(f"ceiling soak finished after {time.perf_counter() - t0:.0f}s / {n} checkpoints")


if __name__ == "__main__":
  ap = argparse.ArgumentParser(description="Soak at the 10-minute server ceiling")
  ap.add_argument("--seconds", type=float, default=600.0)
  args = ap.parse_args()
  soak(max(1.0, args.seconds))
