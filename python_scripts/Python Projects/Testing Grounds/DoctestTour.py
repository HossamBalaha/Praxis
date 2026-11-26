# tags: testing, getting-started
"""Doctest Tour — examples that are also tests.

Every docstring example below is executed and compared — documentation
that cannot silently rot.
"""


def to_title_case(text: str) -> str:
  """Capitalize each word.

  >>> to_title_case("praxis ide")
  'Praxis Ide'
  >>> to_title_case("  spaced   out ")
  'Spaced Out'
  """
  return " ".join(word.capitalize() for word in text.split())


def parse_ranges(text: str) -> list:
  """Expand a compact range string into a list of ints.

  >>> parse_ranges("1-3,7")
  [1, 2, 3, 7]
  >>> parse_ranges("")
  []
  """
  out: list = []
  for part in (p.strip() for p in text.split(",") if p.strip()):
    if "-" in part:
      a, b = part.split("-", 1)
      out.extend(range(int(a), int(b) + 1))
    else:
      out.append(int(part))
  return out


def checksum(text: str) -> int:
  """A toy checksum (sum of byte values, mod 97).

  >>> checksum("praxis")
  82
  """
  return sum(ord(ch) for ch in text) % 97


if __name__ == "__main__":
  import doctest

  failures, tests = doctest.testmod(verbose=True)
  print(f"\ndoctest: {tests - failures}/{tests} examples passed")
  raise SystemExit(1 if failures else 0)
