"""Merge sort — divide and conquer, stable, not in place."""


# tags: algorithms, sorting


def MergeSort(itemsList: list[int]) -> list[int]:
  """Return a new sorted list."""
  if len(itemsList) <= 1:
    return list(itemsList)
  middleIndex = len(itemsList) // 2
  leftHalf = MergeSort(itemsList[:middleIndex])
  rightHalf = MergeSort(itemsList[middleIndex:])
  return _Merge(leftHalf, rightHalf)


def _Merge(leftHalf: list[int], rightHalf: list[int]) -> list[int]:
  """Merge two sorted halves into one sorted list."""
  mergedList: list[int] = []
  leftIndex = 0
  rightIndex = 0
  while leftIndex < len(leftHalf) and rightIndex < len(rightHalf):
    if leftHalf[leftIndex] <= rightHalf[rightIndex]:
      mergedList.append(leftHalf[leftIndex])
      leftIndex += 1
    else:
      mergedList.append(rightHalf[rightIndex])
      rightIndex += 1
  mergedList.extend(leftHalf[leftIndex:])
  mergedList.extend(rightHalf[rightIndex:])
  return mergedList


print("sorted:", MergeSort([38, 27, 43, 3, 9, 82, 10]))
