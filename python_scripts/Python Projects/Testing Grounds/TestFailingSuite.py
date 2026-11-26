# tags: testing, diagnostics
"""Failing Suite — 3 failures, 1 error, 1 pass.

On purpose: watch the failing tests render in the Diagnostics panel
and the traceback land in the Output panel with the non-zero exit code
recorded in the run history.
"""
import unittest


def median(values: list) -> float:
  ordered = sorted(values)
  n = len(ordered)
  return ordered[n // 2]  # BUG: wrong for even-length lists


def slugify(text: str) -> str:
  return text.lower().replace(" ", "-")  # BUG: punctuation survives


def nth_prime(n: int) -> int:
  primes = []
  candidate = 2
  while len(primes) < n:
    if all(candidate % p for p in primes):
      primes.append(candidate)
    candidate += 1
  return primes[n - 1]


class TestMedian(unittest.TestCase):
  def test_odd(self):
    self.assertEqual(median([3, 1, 2]), 2)

  def test_even(self):  # FAILS — the even branch is unimplemented
    self.assertEqual(median([4, 1, 3, 2]), 2.5)


class TestSlugify(unittest.TestCase):
  def test_spaces(self):
    self.assertEqual(slugify("Hello World"), "hello-world")

  def test_punctuation(self):  # FAILS
    self.assertEqual(slugify("Hello, World!"), "hello-world")


class TestPrimes(unittest.TestCase):
  def test_sixth_prime(self):
    self.assertEqual(nth_prime(6), 13)

  def test_zeroth_prime(self):  # ERROR — index out of range
    self.assertEqual(nth_prime(0), 2)


if __name__ == "__main__":
  unittest.main(verbosity=2)
