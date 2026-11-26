"""Binary search over a sorted list — classic two-pointer loop."""


# tags: algorithms, searching


def BinarySearch(sortedValues: list[int], targetValue: int) -> int:
  """Return the index of targetValue, or -1 when absent."""
  lowIndex = 0
  highIndex = len(sortedValues) - 1
  while lowIndex <= highIndex:
    middleIndex = (lowIndex + highIndex) // 2
    middleValue = sortedValues[middleIndex]
    if middleValue == targetValue:
      return middleIndex
    if middleValue < targetValue:
      lowIndex = middleIndex + 1
    else:
      highIndex = middleIndex - 1
  return -1


sortedPool = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
for probeValue in [23, 2, 91, 40]:
  foundIndex = BinarySearch(sortedPool, probeValue)
  print(f"search {probeValue:>3} ->", foundIndex if foundIndex >= 0 else "not found")
