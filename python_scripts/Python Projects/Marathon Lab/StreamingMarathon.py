# tags: benchmark, long-run, streaming
"""Streaming Marathon — 2 minutes of CONTINUOUS output.

One printed line every 200 ms (~600 lines total): exercises live SSE
streaming, output folding of identical lines, the 2 MB output cap
tracker and the scroll-follow behaviour of the Output panel while a
long run just keeps talking.

    python StreamingMarathon.py --seconds 120
    python StreamingMarathon.py --seconds 20   # quick pass
"""
import argparse
import time

TEMPLATES = [
  "tick {n:04d} · buffer {pct:5.1f}% · queue depth {q}",
  "tick {n:04d} · heartbeat OK · drift {pct:5.2f}ms",
  "tick {n:04d} · sensor bus nominal · {pct:5.1f}% elapsed",
]


def stream(seconds: float) -> None:
  t0 = time.perf_counter()
  n = 0
  elapsed = 0.0
  while True:
    elapsed = time.perf_counter() - t0
    if elapsed >= seconds:
      break
    n += 1
    pct = elapsed / seconds * 100
    tmpl = TEMPLATES[(n // 7) % len(TEMPLATES)]
    print(tmpl.format(n=n, pct=pct, q=(n * 13) % 97))
    time.sleep(0.2)
  print(f"streamed {n} lines in {elapsed:.0f}s")


if __name__ == "__main__":
  ap = argparse.ArgumentParser(description="Continuous output for 2 minutes")
  ap.add_argument("--seconds", type=float, default=120.0)
  args = ap.parse_args()
  stream(max(1.0, args.seconds))
