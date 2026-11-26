"""Long stress module — progressive rendering test fixture.

A deliberately long file: the "Show full code" path must render it
in chunks with a live loader instead of freezing the tab.
"""

import math
import statistics as st


def block_000(xs):
  """Compute block 000 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.00


def block_001(xs):
  """Compute block 001 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.01


def block_002(xs):
  """Compute block 002 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.02


def block_003(xs):
  """Compute block 003 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.03


def block_004(xs):
  """Compute block 004 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.04


def block_005(xs):
  """Compute block 005 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.05


def block_006(xs):
  """Compute block 006 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.06


def block_007(xs):
  """Compute block 007 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.07


def block_008(xs):
  """Compute block 008 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.08


def block_009(xs):
  """Compute block 009 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.09


def block_010(xs):
  """Compute block 010 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.10


def block_011(xs):
  """Compute block 011 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.11


def block_012(xs):
  """Compute block 012 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.12


def block_013(xs):
  """Compute block 013 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.13


def block_014(xs):
  """Compute block 014 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.14


def block_015(xs):
  """Compute block 015 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.15


def block_016(xs):
  """Compute block 016 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.16


def block_017(xs):
  """Compute block 017 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.17


def block_018(xs):
  """Compute block 018 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.18


def block_019(xs):
  """Compute block 019 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.19


def block_020(xs):
  """Compute block 020 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.20


def block_021(xs):
  """Compute block 021 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.21


def block_022(xs):
  """Compute block 022 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.22


def block_023(xs):
  """Compute block 023 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.23


def block_024(xs):
  """Compute block 024 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.24


def block_025(xs):
  """Compute block 025 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.25


def block_026(xs):
  """Compute block 026 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.26


def block_027(xs):
  """Compute block 027 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.27


def block_028(xs):
  """Compute block 028 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.28


def block_029(xs):
  """Compute block 029 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.29


def block_030(xs):
  """Compute block 030 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.30


def block_031(xs):
  """Compute block 031 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.31


def block_032(xs):
  """Compute block 032 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.32


def block_033(xs):
  """Compute block 033 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.33


def block_034(xs):
  """Compute block 034 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.34


def block_035(xs):
  """Compute block 035 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.35


def block_036(xs):
  """Compute block 036 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.36


def block_037(xs):
  """Compute block 037 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.37


def block_038(xs):
  """Compute block 038 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.38


def block_039(xs):
  """Compute block 039 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.39


def block_040(xs):
  """Compute block 040 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.40


def block_041(xs):
  """Compute block 041 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.41


def block_042(xs):
  """Compute block 042 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.42


def block_043(xs):
  """Compute block 043 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.43


def block_044(xs):
  """Compute block 044 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.44


def block_045(xs):
  """Compute block 045 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.45


def block_046(xs):
  """Compute block 046 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.46


def block_047(xs):
  """Compute block 047 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.47


def block_048(xs):
  """Compute block 048 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.48


def block_049(xs):
  """Compute block 049 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.49


def block_050(xs):
  """Compute block 050 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.50


def block_051(xs):
  """Compute block 051 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.51


def block_052(xs):
  """Compute block 052 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.52


def block_053(xs):
  """Compute block 053 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.53


def block_054(xs):
  """Compute block 054 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.54


def block_055(xs):
  """Compute block 055 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.55


def block_056(xs):
  """Compute block 056 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.56


def block_057(xs):
  """Compute block 057 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.57


def block_058(xs):
  """Compute block 058 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.58


def block_059(xs):
  """Compute block 059 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.59


def block_060(xs):
  """Compute block 060 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.60


def block_061(xs):
  """Compute block 061 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.61


def block_062(xs):
  """Compute block 062 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.62


def block_063(xs):
  """Compute block 063 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.63


def block_064(xs):
  """Compute block 064 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.64


def block_065(xs):
  """Compute block 065 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.65


def block_066(xs):
  """Compute block 066 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.66


def block_067(xs):
  """Compute block 067 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.67


def block_068(xs):
  """Compute block 068 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.68


def block_069(xs):
  """Compute block 069 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.69


def block_070(xs):
  """Compute block 070 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.70


def block_071(xs):
  """Compute block 071 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.71


def block_072(xs):
  """Compute block 072 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.72


def block_073(xs):
  """Compute block 073 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.73


def block_074(xs):
  """Compute block 074 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.74


def block_075(xs):
  """Compute block 075 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.75


def block_076(xs):
  """Compute block 076 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.76


def block_077(xs):
  """Compute block 077 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.77


def block_078(xs):
  """Compute block 078 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.78


def block_079(xs):
  """Compute block 079 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.79


def block_080(xs):
  """Compute block 080 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.80


def block_081(xs):
  """Compute block 081 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.81


def block_082(xs):
  """Compute block 082 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.82


def block_083(xs):
  """Compute block 083 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.83


def block_084(xs):
  """Compute block 084 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.84


def block_085(xs):
  """Compute block 085 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.85


def block_086(xs):
  """Compute block 086 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.86


def block_087(xs):
  """Compute block 087 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.87


def block_088(xs):
  """Compute block 088 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.88


def block_089(xs):
  """Compute block 089 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.89


def block_090(xs):
  """Compute block 090 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.90


def block_091(xs):
  """Compute block 091 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.91


def block_092(xs):
  """Compute block 092 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.92


def block_093(xs):
  """Compute block 093 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.93


def block_094(xs):
  """Compute block 094 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.94


def block_095(xs):
  """Compute block 095 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.95


def block_096(xs):
  """Compute block 096 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.96


def block_097(xs):
  """Compute block 097 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.97


def block_098(xs):
  """Compute block 098 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.98


def block_099(xs):
  """Compute block 099 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 1.99


def block_100(xs):
  """Compute block 100 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.00


def block_101(xs):
  """Compute block 101 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.01


def block_102(xs):
  """Compute block 102 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.02


def block_103(xs):
  """Compute block 103 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.03


def block_104(xs):
  """Compute block 104 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.04


def block_105(xs):
  """Compute block 105 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.05


def block_106(xs):
  """Compute block 106 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.06


def block_107(xs):
  """Compute block 107 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.07


def block_108(xs):
  """Compute block 108 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.08


def block_109(xs):
  """Compute block 109 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.09


def block_110(xs):
  """Compute block 110 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.10


def block_111(xs):
  """Compute block 111 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.11


def block_112(xs):
  """Compute block 112 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.12


def block_113(xs):
  """Compute block 113 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.13


def block_114(xs):
  """Compute block 114 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.14


def block_115(xs):
  """Compute block 115 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.15


def block_116(xs):
  """Compute block 116 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.16


def block_117(xs):
  """Compute block 117 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.17


def block_118(xs):
  """Compute block 118 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.18


def block_119(xs):
  """Compute block 119 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.19


def block_120(xs):
  """Compute block 120 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.20


def block_121(xs):
  """Compute block 121 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.21


def block_122(xs):
  """Compute block 122 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.22


def block_123(xs):
  """Compute block 123 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.23


def block_124(xs):
  """Compute block 124 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.24


def block_125(xs):
  """Compute block 125 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.25


def block_126(xs):
  """Compute block 126 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.26


def block_127(xs):
  """Compute block 127 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.27


def block_128(xs):
  """Compute block 128 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.28


def block_129(xs):
  """Compute block 129 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.29


def block_130(xs):
  """Compute block 130 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.30


def block_131(xs):
  """Compute block 131 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.31


def block_132(xs):
  """Compute block 132 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.32


def block_133(xs):
  """Compute block 133 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.33


def block_134(xs):
  """Compute block 134 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.34


def block_135(xs):
  """Compute block 135 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.35


def block_136(xs):
  """Compute block 136 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.36


def block_137(xs):
  """Compute block 137 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.37


def block_138(xs):
  """Compute block 138 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.38


def block_139(xs):
  """Compute block 139 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.39


def block_140(xs):
  """Compute block 140 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.40


def block_141(xs):
  """Compute block 141 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.41


def block_142(xs):
  """Compute block 142 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.42


def block_143(xs):
  """Compute block 143 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.43


def block_144(xs):
  """Compute block 144 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.44


def block_145(xs):
  """Compute block 145 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.45


def block_146(xs):
  """Compute block 146 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.46


def block_147(xs):
  """Compute block 147 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.47


def block_148(xs):
  """Compute block 148 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.48


def block_149(xs):
  """Compute block 149 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.49


def block_150(xs):
  """Compute block 150 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.50


def block_151(xs):
  """Compute block 151 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.51


def block_152(xs):
  """Compute block 152 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.52


def block_153(xs):
  """Compute block 153 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.53


def block_154(xs):
  """Compute block 154 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.54


def block_155(xs):
  """Compute block 155 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.55


def block_156(xs):
  """Compute block 156 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.56


def block_157(xs):
  """Compute block 157 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.57


def block_158(xs):
  """Compute block 158 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.58


def block_159(xs):
  """Compute block 159 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.59


def block_160(xs):
  """Compute block 160 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.60


def block_161(xs):
  """Compute block 161 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.61


def block_162(xs):
  """Compute block 162 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.62


def block_163(xs):
  """Compute block 163 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.63


def block_164(xs):
  """Compute block 164 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.64


def block_165(xs):
  """Compute block 165 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.65


def block_166(xs):
  """Compute block 166 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.66


def block_167(xs):
  """Compute block 167 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.67


def block_168(xs):
  """Compute block 168 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.68


def block_169(xs):
  """Compute block 169 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.69


def block_170(xs):
  """Compute block 170 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.70


def block_171(xs):
  """Compute block 171 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.71


def block_172(xs):
  """Compute block 172 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.72


def block_173(xs):
  """Compute block 173 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.73


def block_174(xs):
  """Compute block 174 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.74


def block_175(xs):
  """Compute block 175 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.75


def block_176(xs):
  """Compute block 176 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.76


def block_177(xs):
  """Compute block 177 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.77


def block_178(xs):
  """Compute block 178 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.78


def block_179(xs):
  """Compute block 179 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.79


def block_180(xs):
  """Compute block 180 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.80


def block_181(xs):
  """Compute block 181 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.81


def block_182(xs):
  """Compute block 182 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.82


def block_183(xs):
  """Compute block 183 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.83


def block_184(xs):
  """Compute block 184 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.84


def block_185(xs):
  """Compute block 185 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.85


def block_186(xs):
  """Compute block 186 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.86


def block_187(xs):
  """Compute block 187 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.87


def block_188(xs):
  """Compute block 188 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.88


def block_189(xs):
  """Compute block 189 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.89


def block_190(xs):
  """Compute block 190 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.90


def block_191(xs):
  """Compute block 191 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.91


def block_192(xs):
  """Compute block 192 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.92


def block_193(xs):
  """Compute block 193 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.93


def block_194(xs):
  """Compute block 194 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.94


def block_195(xs):
  """Compute block 195 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.95


def block_196(xs):
  """Compute block 196 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.96


def block_197(xs):
  """Compute block 197 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.97


def block_198(xs):
  """Compute block 198 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.98


def block_199(xs):
  """Compute block 199 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 2.99


def block_200(xs):
  """Compute block 200 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.00


def block_201(xs):
  """Compute block 201 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.01


def block_202(xs):
  """Compute block 202 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.02


def block_203(xs):
  """Compute block 203 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.03


def block_204(xs):
  """Compute block 204 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.04


def block_205(xs):
  """Compute block 205 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.05


def block_206(xs):
  """Compute block 206 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.06


def block_207(xs):
  """Compute block 207 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.07


def block_208(xs):
  """Compute block 208 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.08


def block_209(xs):
  """Compute block 209 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.09


def block_210(xs):
  """Compute block 210 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.10


def block_211(xs):
  """Compute block 211 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.11


def block_212(xs):
  """Compute block 212 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.12


def block_213(xs):
  """Compute block 213 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.13


def block_214(xs):
  """Compute block 214 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.14


def block_215(xs):
  """Compute block 215 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.15


def block_216(xs):
  """Compute block 216 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.16


def block_217(xs):
  """Compute block 217 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.17


def block_218(xs):
  """Compute block 218 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.18


def block_219(xs):
  """Compute block 219 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.19


def block_220(xs):
  """Compute block 220 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.20


def block_221(xs):
  """Compute block 221 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.21


def block_222(xs):
  """Compute block 222 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.22


def block_223(xs):
  """Compute block 223 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.23


def block_224(xs):
  """Compute block 224 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.24


def block_225(xs):
  """Compute block 225 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.25


def block_226(xs):
  """Compute block 226 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.26


def block_227(xs):
  """Compute block 227 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.27


def block_228(xs):
  """Compute block 228 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.28


def block_229(xs):
  """Compute block 229 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.29


def block_230(xs):
  """Compute block 230 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.30


def block_231(xs):
  """Compute block 231 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.31


def block_232(xs):
  """Compute block 232 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.32


def block_233(xs):
  """Compute block 233 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.33


def block_234(xs):
  """Compute block 234 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.34


def block_235(xs):
  """Compute block 235 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.35


def block_236(xs):
  """Compute block 236 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.36


def block_237(xs):
  """Compute block 237 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.37


def block_238(xs):
  """Compute block 238 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.38


def block_239(xs):
  """Compute block 239 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.39


def block_240(xs):
  """Compute block 240 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.40


def block_241(xs):
  """Compute block 241 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.41


def block_242(xs):
  """Compute block 242 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.42


def block_243(xs):
  """Compute block 243 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.43


def block_244(xs):
  """Compute block 244 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.44


def block_245(xs):
  """Compute block 245 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.45


def block_246(xs):
  """Compute block 246 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.46


def block_247(xs):
  """Compute block 247 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.47


def block_248(xs):
  """Compute block 248 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.48


def block_249(xs):
  """Compute block 249 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.49


def block_250(xs):
  """Compute block 250 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.50


def block_251(xs):
  """Compute block 251 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.51


def block_252(xs):
  """Compute block 252 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.52


def block_253(xs):
  """Compute block 253 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.53


def block_254(xs):
  """Compute block 254 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.54


def block_255(xs):
  """Compute block 255 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.55


def block_256(xs):
  """Compute block 256 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.56


def block_257(xs):
  """Compute block 257 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.57


def block_258(xs):
  """Compute block 258 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.58


def block_259(xs):
  """Compute block 259 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.59


def block_260(xs):
  """Compute block 260 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.60


def block_261(xs):
  """Compute block 261 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.61


def block_262(xs):
  """Compute block 262 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.62


def block_263(xs):
  """Compute block 263 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.63


def block_264(xs):
  """Compute block 264 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.64


def block_265(xs):
  """Compute block 265 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.65


def block_266(xs):
  """Compute block 266 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.66


def block_267(xs):
  """Compute block 267 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.67


def block_268(xs):
  """Compute block 268 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.68


def block_269(xs):
  """Compute block 269 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.69


def block_270(xs):
  """Compute block 270 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.70


def block_271(xs):
  """Compute block 271 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.71


def block_272(xs):
  """Compute block 272 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.72


def block_273(xs):
  """Compute block 273 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.73


def block_274(xs):
  """Compute block 274 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.74


def block_275(xs):
  """Compute block 275 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.75


def block_276(xs):
  """Compute block 276 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.76


def block_277(xs):
  """Compute block 277 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.77


def block_278(xs):
  """Compute block 278 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.78


def block_279(xs):
  """Compute block 279 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.79


def block_280(xs):
  """Compute block 280 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.80


def block_281(xs):
  """Compute block 281 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.81


def block_282(xs):
  """Compute block 282 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.82


def block_283(xs):
  """Compute block 283 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.83


def block_284(xs):
  """Compute block 284 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.84


def block_285(xs):
  """Compute block 285 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.85


def block_286(xs):
  """Compute block 286 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.86


def block_287(xs):
  """Compute block 287 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.87


def block_288(xs):
  """Compute block 288 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.88


def block_289(xs):
  """Compute block 289 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.89


def block_290(xs):
  """Compute block 290 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.90


def block_291(xs):
  """Compute block 291 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.91


def block_292(xs):
  """Compute block 292 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.92


def block_293(xs):
  """Compute block 293 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.93


def block_294(xs):
  """Compute block 294 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.94


def block_295(xs):
  """Compute block 295 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.95


def block_296(xs):
  """Compute block 296 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.96


def block_297(xs):
  """Compute block 297 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.97


def block_298(xs):
  """Compute block 298 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.98


def block_299(xs):
  """Compute block 299 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 3.99


def block_300(xs):
  """Compute block 300 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.00


def block_301(xs):
  """Compute block 301 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.01


def block_302(xs):
  """Compute block 302 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.02


def block_303(xs):
  """Compute block 303 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.03


def block_304(xs):
  """Compute block 304 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.04


def block_305(xs):
  """Compute block 305 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.05


def block_306(xs):
  """Compute block 306 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.06


def block_307(xs):
  """Compute block 307 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.07


def block_308(xs):
  """Compute block 308 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.08


def block_309(xs):
  """Compute block 309 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.09


def block_310(xs):
  """Compute block 310 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.10


def block_311(xs):
  """Compute block 311 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.11


def block_312(xs):
  """Compute block 312 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.12


def block_313(xs):
  """Compute block 313 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.13


def block_314(xs):
  """Compute block 314 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.14


def block_315(xs):
  """Compute block 315 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.15


def block_316(xs):
  """Compute block 316 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.16


def block_317(xs):
  """Compute block 317 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.17


def block_318(xs):
  """Compute block 318 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.18


def block_319(xs):
  """Compute block 319 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.19


def block_320(xs):
  """Compute block 320 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.20


def block_321(xs):
  """Compute block 321 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.21


def block_322(xs):
  """Compute block 322 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.22


def block_323(xs):
  """Compute block 323 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.23


def block_324(xs):
  """Compute block 324 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.24


def block_325(xs):
  """Compute block 325 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.25


def block_326(xs):
  """Compute block 326 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.26


def block_327(xs):
  """Compute block 327 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.27


def block_328(xs):
  """Compute block 328 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.28


def block_329(xs):
  """Compute block 329 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.29


def block_330(xs):
  """Compute block 330 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.30


def block_331(xs):
  """Compute block 331 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.31


def block_332(xs):
  """Compute block 332 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.32


def block_333(xs):
  """Compute block 333 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.33


def block_334(xs):
  """Compute block 334 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.34


def block_335(xs):
  """Compute block 335 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.35


def block_336(xs):
  """Compute block 336 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.36


def block_337(xs):
  """Compute block 337 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.37


def block_338(xs):
  """Compute block 338 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.38


def block_339(xs):
  """Compute block 339 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.39


def block_340(xs):
  """Compute block 340 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.40


def block_341(xs):
  """Compute block 341 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.41


def block_342(xs):
  """Compute block 342 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.42


def block_343(xs):
  """Compute block 343 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.43


def block_344(xs):
  """Compute block 344 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.44


def block_345(xs):
  """Compute block 345 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.45


def block_346(xs):
  """Compute block 346 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.46


def block_347(xs):
  """Compute block 347 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.47


def block_348(xs):
  """Compute block 348 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.48


def block_349(xs):
  """Compute block 349 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.49


def block_350(xs):
  """Compute block 350 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.50


def block_351(xs):
  """Compute block 351 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.51


def block_352(xs):
  """Compute block 352 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.52


def block_353(xs):
  """Compute block 353 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.53


def block_354(xs):
  """Compute block 354 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.54


def block_355(xs):
  """Compute block 355 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.55


def block_356(xs):
  """Compute block 356 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.56


def block_357(xs):
  """Compute block 357 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.57


def block_358(xs):
  """Compute block 358 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.58


def block_359(xs):
  """Compute block 359 statistics."""
  if not xs:
    return 0.0
  m = st.mean(xs)
  sd = st.stdev(xs) if len(xs) > 1 else 0.0
  z = [(x - m) / sd if sd else 0.0 for x in xs]
  peak = max(z, key=abs) if z else 0.0
  return math.hypot(m, peak) * 4.59


def with_diagnostics():
  total = sum_all_blocks(blocks)  # undefined name -> zigzag
  return total + undefined_helper()


BLOCKS = 360
