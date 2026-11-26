"""Two sum — the hash-map single pass version."""


# tags: algorithms, hashing


def FindPairSum(numberList: list[int], targetSum: int) -> tuple[int, int] | None:
  """Return the pair of indices whose values add to targetSum."""
  seenMap: dict[int, int] = {}
  for currentIndex, currentValue in enumerate(numberList):
    complementValue = targetSum - currentValue
    if complementValue in seenMap:
      return (seenMap[complementValue], currentIndex)
    seenMap[currentValue] = currentIndex
  return None


testCases = [
  ([2, 7, 11, 15], 9),
  ([3, 2, 4], 6),
  ([3, 3], 6),
  ([1, 2, 3], 100),
]
for numberList, targetSum in testCases:
  pairResult = FindPairSum(numberList, targetSum)
  print(f"target {targetSum:>3} ->", pairResult)
