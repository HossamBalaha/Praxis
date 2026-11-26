# tags: testing, getting-started
"""Math Utils — a PASSING unittest suite (7 tests).

Runs green end-to-end: exercises the Diagnostics/Tests surfaces with a
clean baseline before the failing suite has its turn.
"""
import unittest


def clamp(value: float, low: float, high: float) -> float:
  return max(low, min(high, value))


def moving_average(values: list, window: int) -> list:
  if window <= 0:
    raise ValueError("window must be positive")
  out = []
  for i in range(len(values) - window + 1):
    out.append(sum(values[i: i + window]) / window)
  return out


def celsius_to_fahrenheit(c: float) -> float:
  return c * 9 / 5 + 32


class TestClamp(unittest.TestCase):
  def test_below_range(self):
    self.assertEqual(clamp(-10, 0, 100), 0)

  def test_above_range(self):
    self.assertEqual(clamp(250, 0, 100), 100)

  def test_inside_range(self):
    self.assertEqual(clamp(42, 0, 100), 42)


class TestMovingAverage(unittest.TestCase):
  def test_window_two(self):
    self.assertEqual(moving_average([1, 2, 3], 2), [1.5, 2.5])

  def test_rejects_bad_window(self):
    with self.assertRaises(ValueError):
      moving_average([1, 2], 0)


class TestConversions(unittest.TestCase):
  def test_freezing(self):
    self.assertAlmostEqual(celsius_to_fahrenheit(0), 32)

  def test_boiling(self):
    self.assertAlmostEqual(celsius_to_fahrenheit(100), 212)


if __name__ == "__main__":
  unittest.main(verbosity=2)
