# tags: live-output, medium-run
"""Stream Printer — live output over ~20 s.

Emits a timestamped line every quarter second (levels INFO / WARN /
ERROR mixed in) so the Output panel's streaming behaviour, autoscroll
and the run-history timestamps can be checked while the run is still
going. Ends with a deliberate traceback AFTER printing a clean
summary — you can see how partial output + an error tail render.
"""
import sys
import time

LINES = 80
PERIOD = 0.25


def main() -> None:
  t0 = time.time()
  for i in range(1, LINES + 1):
    elapsed = i * PERIOD
    level = "INFO"
    if i % 17 == 0:
      level = "WARN"
    if i % 41 == 0:
      level = "ERROR"
    print(
      f"[{elapsed:6.2f}s] {level:5s} tick {i:03d}/{LINES} "
      f"heap~{4 + (i % 9)}MB cpu={10 + (i % 30)}%",
      flush=True,
    )
    time.sleep(PERIOD)
  print(f"streamed {LINES} events in {time.time() - t0:.1f} s", flush=True)
  # Deliberate late error — tests the error tail + exit code path.
  raise RuntimeError("planned end-of-stream failure (this one is on purpose)")


if __name__ == "__main__":
  try:
    main()
  except RuntimeError as exc:
    print(f"caught expected failure: {exc}", file=sys.stderr, flush=True)
    raise SystemExit(1)
