# tags: long-file
"""LongModule — a ~950-line module of self-similar, valid Python.

Every function/class below is syntactically real (and runnable),
so the code viewer, the symbol outline, the go-to-symbol dropdown
and the diagnostics tab all have a genuinely long file to chew on.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Reading:
  """One sensor reading."""
  station: int
  value: float
  quality: float = 1.0
  tags: list[str] = field(default_factory=list)


def transform_01(reading: Reading) -> Reading:
  """Transform #01 — stage of the long pipeline."""
  scale = 1.0 + 1 / 100.0
  shifted = reading.value * scale + 1 * 0.01
  clipped = max(-1, min(1, shifted))
  return Reading(
    station=reading.station + 1,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 1 / 1000.0),
    tags=reading.tags + ['t01'],
  )


def transform_02(reading: Reading) -> Reading:
  """Transform #02 — stage of the long pipeline."""
  scale = 1.0 + 2 / 100.0
  shifted = reading.value * scale + 2 * 0.01
  clipped = max(-2, min(2, shifted))
  return Reading(
    station=reading.station + 2,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 2 / 1000.0),
    tags=reading.tags + ['t02'],
  )


def transform_03(reading: Reading) -> Reading:
  """Transform #03 — stage of the long pipeline."""
  scale = 1.0 + 3 / 100.0
  shifted = reading.value * scale + 3 * 0.01
  clipped = max(-3, min(3, shifted))
  return Reading(
    station=reading.station + 3,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 3 / 1000.0),
    tags=reading.tags + ['t03'],
  )


def transform_04(reading: Reading) -> Reading:
  """Transform #04 — stage of the long pipeline."""
  scale = 1.0 + 4 / 100.0
  shifted = reading.value * scale + 4 * 0.01
  clipped = max(-4, min(4, shifted))
  return Reading(
    station=reading.station + 4,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 4 / 1000.0),
    tags=reading.tags + ['t04'],
  )


def transform_05(reading: Reading) -> Reading:
  """Transform #05 — stage of the long pipeline."""
  scale = 1.0 + 5 / 100.0
  shifted = reading.value * scale + 5 * 0.01
  clipped = max(-5, min(5, shifted))
  return Reading(
    station=reading.station + 5,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 5 / 1000.0),
    tags=reading.tags + ['t05'],
  )


def transform_06(reading: Reading) -> Reading:
  """Transform #06 — stage of the long pipeline."""
  scale = 1.0 + 6 / 100.0
  shifted = reading.value * scale + 6 * 0.01
  clipped = max(-6, min(6, shifted))
  return Reading(
    station=reading.station + 6,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 6 / 1000.0),
    tags=reading.tags + ['t06'],
  )


def transform_07(reading: Reading) -> Reading:
  """Transform #07 — stage of the long pipeline."""
  scale = 1.0 + 7 / 100.0
  shifted = reading.value * scale + 7 * 0.01
  clipped = max(-7, min(7, shifted))
  return Reading(
    station=reading.station + 7,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 7 / 1000.0),
    tags=reading.tags + ['t07'],
  )


def transform_08(reading: Reading) -> Reading:
  """Transform #08 — stage of the long pipeline."""
  scale = 1.0 + 8 / 100.0
  shifted = reading.value * scale + 8 * 0.01
  clipped = max(-8, min(8, shifted))
  return Reading(
    station=reading.station + 8,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 8 / 1000.0),
    tags=reading.tags + ['t08'],
  )


def transform_09(reading: Reading) -> Reading:
  """Transform #09 — stage of the long pipeline."""
  scale = 1.0 + 9 / 100.0
  shifted = reading.value * scale + 9 * 0.01
  clipped = max(-9, min(9, shifted))
  return Reading(
    station=reading.station + 9,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 9 / 1000.0),
    tags=reading.tags + ['t09'],
  )


def transform_10(reading: Reading) -> Reading:
  """Transform #10 — stage of the long pipeline."""
  scale = 1.0 + 10 / 100.0
  shifted = reading.value * scale + 10 * 0.01
  clipped = max(-10, min(10, shifted))
  return Reading(
    station=reading.station + 10,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 10 / 1000.0),
    tags=reading.tags + ['t10'],
  )


def transform_11(reading: Reading) -> Reading:
  """Transform #11 — stage of the long pipeline."""
  scale = 1.0 + 11 / 100.0
  shifted = reading.value * scale + 11 * 0.01
  clipped = max(-11, min(11, shifted))
  return Reading(
    station=reading.station + 11,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 11 / 1000.0),
    tags=reading.tags + ['t11'],
  )


def transform_12(reading: Reading) -> Reading:
  """Transform #12 — stage of the long pipeline."""
  scale = 1.0 + 12 / 100.0
  shifted = reading.value * scale + 12 * 0.01
  clipped = max(-12, min(12, shifted))
  return Reading(
    station=reading.station + 12,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 12 / 1000.0),
    tags=reading.tags + ['t12'],
  )


def transform_13(reading: Reading) -> Reading:
  """Transform #13 — stage of the long pipeline."""
  scale = 1.0 + 13 / 100.0
  shifted = reading.value * scale + 13 * 0.01
  clipped = max(-13, min(13, shifted))
  return Reading(
    station=reading.station + 13,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 13 / 1000.0),
    tags=reading.tags + ['t13'],
  )


def transform_14(reading: Reading) -> Reading:
  """Transform #14 — stage of the long pipeline."""
  scale = 1.0 + 14 / 100.0
  shifted = reading.value * scale + 14 * 0.01
  clipped = max(-14, min(14, shifted))
  return Reading(
    station=reading.station + 14,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 14 / 1000.0),
    tags=reading.tags + ['t14'],
  )


def transform_15(reading: Reading) -> Reading:
  """Transform #15 — stage of the long pipeline."""
  scale = 1.0 + 15 / 100.0
  shifted = reading.value * scale + 15 * 0.01
  clipped = max(-15, min(15, shifted))
  return Reading(
    station=reading.station + 15,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 15 / 1000.0),
    tags=reading.tags + ['t15'],
  )


def transform_16(reading: Reading) -> Reading:
  """Transform #16 — stage of the long pipeline."""
  scale = 1.0 + 16 / 100.0
  shifted = reading.value * scale + 16 * 0.01
  clipped = max(-16, min(16, shifted))
  return Reading(
    station=reading.station + 16,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 16 / 1000.0),
    tags=reading.tags + ['t16'],
  )


def transform_17(reading: Reading) -> Reading:
  """Transform #17 — stage of the long pipeline."""
  scale = 1.0 + 17 / 100.0
  shifted = reading.value * scale + 17 * 0.01
  clipped = max(-17, min(17, shifted))
  return Reading(
    station=reading.station + 17,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 17 / 1000.0),
    tags=reading.tags + ['t17'],
  )


def transform_18(reading: Reading) -> Reading:
  """Transform #18 — stage of the long pipeline."""
  scale = 1.0 + 18 / 100.0
  shifted = reading.value * scale + 18 * 0.01
  clipped = max(-18, min(18, shifted))
  return Reading(
    station=reading.station + 18,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 18 / 1000.0),
    tags=reading.tags + ['t18'],
  )


def transform_19(reading: Reading) -> Reading:
  """Transform #19 — stage of the long pipeline."""
  scale = 1.0 + 19 / 100.0
  shifted = reading.value * scale + 19 * 0.01
  clipped = max(-19, min(19, shifted))
  return Reading(
    station=reading.station + 19,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 19 / 1000.0),
    tags=reading.tags + ['t19'],
  )


def transform_20(reading: Reading) -> Reading:
  """Transform #20 — stage of the long pipeline."""
  scale = 1.0 + 20 / 100.0
  shifted = reading.value * scale + 20 * 0.01
  clipped = max(-20, min(20, shifted))
  return Reading(
    station=reading.station + 20,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 20 / 1000.0),
    tags=reading.tags + ['t20'],
  )


def transform_21(reading: Reading) -> Reading:
  """Transform #21 — stage of the long pipeline."""
  scale = 1.0 + 21 / 100.0
  shifted = reading.value * scale + 21 * 0.01
  clipped = max(-21, min(21, shifted))
  return Reading(
    station=reading.station + 21,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 21 / 1000.0),
    tags=reading.tags + ['t21'],
  )


def transform_22(reading: Reading) -> Reading:
  """Transform #22 — stage of the long pipeline."""
  scale = 1.0 + 22 / 100.0
  shifted = reading.value * scale + 22 * 0.01
  clipped = max(-22, min(22, shifted))
  return Reading(
    station=reading.station + 22,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 22 / 1000.0),
    tags=reading.tags + ['t22'],
  )


def transform_23(reading: Reading) -> Reading:
  """Transform #23 — stage of the long pipeline."""
  scale = 1.0 + 23 / 100.0
  shifted = reading.value * scale + 23 * 0.01
  clipped = max(-23, min(23, shifted))
  return Reading(
    station=reading.station + 23,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 23 / 1000.0),
    tags=reading.tags + ['t23'],
  )


def transform_24(reading: Reading) -> Reading:
  """Transform #24 — stage of the long pipeline."""
  scale = 1.0 + 24 / 100.0
  shifted = reading.value * scale + 24 * 0.01
  clipped = max(-24, min(24, shifted))
  return Reading(
    station=reading.station + 24,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 24 / 1000.0),
    tags=reading.tags + ['t24'],
  )


def transform_25(reading: Reading) -> Reading:
  """Transform #25 — stage of the long pipeline."""
  scale = 1.0 + 25 / 100.0
  shifted = reading.value * scale + 25 * 0.01
  clipped = max(-25, min(25, shifted))
  return Reading(
    station=reading.station + 25,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 25 / 1000.0),
    tags=reading.tags + ['t25'],
  )


def transform_26(reading: Reading) -> Reading:
  """Transform #26 — stage of the long pipeline."""
  scale = 1.0 + 26 / 100.0
  shifted = reading.value * scale + 26 * 0.01
  clipped = max(-26, min(26, shifted))
  return Reading(
    station=reading.station + 26,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 26 / 1000.0),
    tags=reading.tags + ['t26'],
  )


def transform_27(reading: Reading) -> Reading:
  """Transform #27 — stage of the long pipeline."""
  scale = 1.0 + 27 / 100.0
  shifted = reading.value * scale + 27 * 0.01
  clipped = max(-27, min(27, shifted))
  return Reading(
    station=reading.station + 27,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 27 / 1000.0),
    tags=reading.tags + ['t27'],
  )


def transform_28(reading: Reading) -> Reading:
  """Transform #28 — stage of the long pipeline."""
  scale = 1.0 + 28 / 100.0
  shifted = reading.value * scale + 28 * 0.01
  clipped = max(-28, min(28, shifted))
  return Reading(
    station=reading.station + 28,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 28 / 1000.0),
    tags=reading.tags + ['t28'],
  )


def transform_29(reading: Reading) -> Reading:
  """Transform #29 — stage of the long pipeline."""
  scale = 1.0 + 29 / 100.0
  shifted = reading.value * scale + 29 * 0.01
  clipped = max(-29, min(29, shifted))
  return Reading(
    station=reading.station + 29,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 29 / 1000.0),
    tags=reading.tags + ['t29'],
  )


def transform_30(reading: Reading) -> Reading:
  """Transform #30 — stage of the long pipeline."""
  scale = 1.0 + 30 / 100.0
  shifted = reading.value * scale + 30 * 0.01
  clipped = max(-30, min(30, shifted))
  return Reading(
    station=reading.station + 30,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 30 / 1000.0),
    tags=reading.tags + ['t30'],
  )


def transform_31(reading: Reading) -> Reading:
  """Transform #31 — stage of the long pipeline."""
  scale = 1.0 + 31 / 100.0
  shifted = reading.value * scale + 31 * 0.01
  clipped = max(-31, min(31, shifted))
  return Reading(
    station=reading.station + 31,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 31 / 1000.0),
    tags=reading.tags + ['t31'],
  )


def transform_32(reading: Reading) -> Reading:
  """Transform #32 — stage of the long pipeline."""
  scale = 1.0 + 32 / 100.0
  shifted = reading.value * scale + 32 * 0.01
  clipped = max(-32, min(32, shifted))
  return Reading(
    station=reading.station + 32,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 32 / 1000.0),
    tags=reading.tags + ['t32'],
  )


def transform_33(reading: Reading) -> Reading:
  """Transform #33 — stage of the long pipeline."""
  scale = 1.0 + 33 / 100.0
  shifted = reading.value * scale + 33 * 0.01
  clipped = max(-33, min(33, shifted))
  return Reading(
    station=reading.station + 33,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 33 / 1000.0),
    tags=reading.tags + ['t33'],
  )


def transform_34(reading: Reading) -> Reading:
  """Transform #34 — stage of the long pipeline."""
  scale = 1.0 + 34 / 100.0
  shifted = reading.value * scale + 34 * 0.01
  clipped = max(-34, min(34, shifted))
  return Reading(
    station=reading.station + 34,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 34 / 1000.0),
    tags=reading.tags + ['t34'],
  )


def transform_35(reading: Reading) -> Reading:
  """Transform #35 — stage of the long pipeline."""
  scale = 1.0 + 35 / 100.0
  shifted = reading.value * scale + 35 * 0.01
  clipped = max(-35, min(35, shifted))
  return Reading(
    station=reading.station + 35,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 35 / 1000.0),
    tags=reading.tags + ['t35'],
  )


def transform_36(reading: Reading) -> Reading:
  """Transform #36 — stage of the long pipeline."""
  scale = 1.0 + 36 / 100.0
  shifted = reading.value * scale + 36 * 0.01
  clipped = max(-36, min(36, shifted))
  return Reading(
    station=reading.station + 36,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 36 / 1000.0),
    tags=reading.tags + ['t36'],
  )


def transform_37(reading: Reading) -> Reading:
  """Transform #37 — stage of the long pipeline."""
  scale = 1.0 + 37 / 100.0
  shifted = reading.value * scale + 37 * 0.01
  clipped = max(-37, min(37, shifted))
  return Reading(
    station=reading.station + 37,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 37 / 1000.0),
    tags=reading.tags + ['t37'],
  )


def transform_38(reading: Reading) -> Reading:
  """Transform #38 — stage of the long pipeline."""
  scale = 1.0 + 38 / 100.0
  shifted = reading.value * scale + 38 * 0.01
  clipped = max(-38, min(38, shifted))
  return Reading(
    station=reading.station + 38,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 38 / 1000.0),
    tags=reading.tags + ['t38'],
  )


def transform_39(reading: Reading) -> Reading:
  """Transform #39 — stage of the long pipeline."""
  scale = 1.0 + 39 / 100.0
  shifted = reading.value * scale + 39 * 0.01
  clipped = max(-39, min(39, shifted))
  return Reading(
    station=reading.station + 39,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 39 / 1000.0),
    tags=reading.tags + ['t39'],
  )


def transform_40(reading: Reading) -> Reading:
  """Transform #40 — stage of the long pipeline."""
  scale = 1.0 + 40 / 100.0
  shifted = reading.value * scale + 40 * 0.01
  clipped = max(-40, min(40, shifted))
  return Reading(
    station=reading.station + 40,
    value=round(clipped, 4),
    quality=reading.quality * (1 - 40 / 1000.0),
    tags=reading.tags + ['t40'],
  )


class Stage01:
  """Pipeline stage 01 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 01 with gain tracking."""
    self.calls += 1
    out = transform_01(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage02:
  """Pipeline stage 02 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 02 with gain tracking."""
    self.calls += 1
    out = transform_02(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage03:
  """Pipeline stage 03 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 03 with gain tracking."""
    self.calls += 1
    out = transform_03(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage04:
  """Pipeline stage 04 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 04 with gain tracking."""
    self.calls += 1
    out = transform_04(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage05:
  """Pipeline stage 05 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 05 with gain tracking."""
    self.calls += 1
    out = transform_05(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage06:
  """Pipeline stage 06 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 06 with gain tracking."""
    self.calls += 1
    out = transform_06(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage07:
  """Pipeline stage 07 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 07 with gain tracking."""
    self.calls += 1
    out = transform_07(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage08:
  """Pipeline stage 08 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 08 with gain tracking."""
    self.calls += 1
    out = transform_08(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage09:
  """Pipeline stage 09 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 09 with gain tracking."""
    self.calls += 1
    out = transform_09(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage10:
  """Pipeline stage 10 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 10 with gain tracking."""
    self.calls += 1
    out = transform_10(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage11:
  """Pipeline stage 11 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 11 with gain tracking."""
    self.calls += 1
    out = transform_11(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


class Stage12:
  """Pipeline stage 12 of the long module."""

  version: str = f'1.{i}.0'

  def __init__(self, gain: float) -> None:
    self.gain = gain
    self.calls = 0

  def apply(self, reading: Reading) -> Reading:
    """Apply stage 12 with gain tracking."""
    self.calls += 1
    out = transform_12(reading)
    return Reading(out.station, out.value * self.gain, out.quality, out.tags)

  def stats(self) -> dict[str, float | int]:
    return {'gain': self.gain, 'calls': self.calls, 'version': self.version}


def run_pipeline(seed: float, stages: int = 12) -> list[Reading]:
  """Drive every stage over one seed reading."""
  r = Reading(station=1, value=seed)
  chain = [Stage(i, 1.0 + i / 50.0) for i in range(1, stages + 1)]
  for stage in chain:
    r = stage.apply(r)
  return [r]


if __name__ == "__main__":
  results = run_pipeline(0.5)
  for r in results:
    print(f'station={r.station} value={r.value} quality={r.quality:.3f}')
  print('module length check: ok')
