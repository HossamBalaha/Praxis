# tags: benchmark, medium-run
"""Matrix Bench — a MEDIUM-length run (~8-12 s).

Pure-Python matrix multiplication (no numpy): the viewer's run panel
gets a live progress stream, a final timing report and DataFrame-free
results, so you can watch the Output tab tick in real time.

Watch for:
  • the progress meter printing every outer block (~1 s each),
  • the run-status dot while it works,
  • the elapsed summary the Output panel records in history.
"""
import random
import time

SIZE = 240  # 240 x 240 x 240 ≈ 13.8 M multiply-adds
BLOCK = 30  # progress every 30 rows


def make_matrix(size: int, seed: float) -> list[list[float]]:
  rng = random.Random(seed)
  return [[rng.uniform(-1.0, 1.0) for _ in range(size)] for _ in range(size)]


def multiply(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
  bt = [list(col) for col in zip(*b)]  # transpose once for locality
  out: list[list[float]] = []
  for i, row in enumerate(a):
    out.append([sum(x * y for x, y in zip(row, col)) for col in bt])
    if (i + 1) % BLOCK == 0:
      pct = (i + 1) / len(a) * 100
      bar = "#" * int(pct // 5) + "-" * (20 - int(pct // 5))
      print(f"[matrix] {bar} {pct:5.1f}%  ({i + 1}/{len(a)} rows)", flush=True)
  return out


def main() -> None:
  print("[matrix] building operands...", flush=True)
  a = make_matrix(SIZE, 1.0)
  b = make_matrix(SIZE, 2.0)
  t0 = time.perf_counter()
  c = multiply(a, b)
  dt = time.perf_counter() - t0
  checksum = sum(c[k][k] for k in range(0, SIZE, 7))
  print(f"[matrix] done in {dt:.2f} s — trace checksum {checksum:,.4f}")
  print(f"[matrix] product cell [0][0] = {c[0][0]:.6f}; [{SIZE - 1}][{SIZE - 1}] = {c[-1][-1]:.6f}")


if __name__ == "__main__":
  main()
