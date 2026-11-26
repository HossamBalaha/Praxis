"""Quick sort — in place, Lomuto partition."""


# tags: algorithms, sorting


def QuickSort(itemsList: list[int], lowIndex: int = 0, highIndex: int | None = None) -> list[int]:
  """Sort a list in place and return it."""
  if highIndex is None:
    highIndex = len(itemsList) - 1
  if lowIndex < highIndex:
    pivotIndex = _Partition(itemsList, lowIndex, highIndex)
    QuickSort(itemsList, lowIndex, pivotIndex - 1)
    QuickSort(itemsList, pivotIndex + 1, highIndex)
  return itemsList


def _Partition(itemsList: list[int], lowIndex: int, highIndex: int) -> int:
  """Lomuto partition around the last element."""
  pivotValue = itemsList[highIndex]
  boundaryIndex = lowIndex - 1
  for scanIndex in range(lowIndex, highIndex):
    if itemsList[scanIndex] <= pivotValue:
      boundaryIndex += 1
      itemsList[boundaryIndex], itemsList[scanIndex] = itemsList[scanIndex], itemsList[boundaryIndex]
  itemsList[boundaryIndex + 1], itemsList[highIndex] = itemsList[highIndex], itemsList[boundaryIndex + 1]
  return boundaryIndex + 1


sampleValues = [33, 10, 55, 71, 29, 3, 18, 92, 44, 61]
print("before:", sampleValues)
print("after: ", QuickSort(list(sampleValues)))
