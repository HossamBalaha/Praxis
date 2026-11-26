"""Heap sort via the stdlib heapq — simple and fast enough."""
# tags: algorithms, sorting, heapq

import heapq


def HeapSort(itemsList: list[int]) -> list[int]:
  """Return a new sorted list using a min-heap."""
  workingCopy = list(itemsList)
  heapq.heapify(workingCopy)
  return [heapq.heappop(workingCopy) for _ in range(len(workingCopy))]


print("sorted:", HeapSort([12, 11, 13, 5, 6, 7]))
