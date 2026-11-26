"""Dijkstra shortest path — weighted graph, priority queue."""
# tags: algorithms, graphs, heapq

import heapq


def ShortestPaths(edgeMap: dict[str, list[tuple[str, int]]], sourceNode: str) -> dict[str, int]:
  """Distances from sourceNode to every reachable node."""
  distanceMap: dict[str, int] = {sourceNode: 0}
  frontierQueue: list[tuple[int, str]] = [(0, sourceNode)]
  while frontierQueue:
    currentCost, currentNode = heapq.heappop(frontierQueue)
    if currentCost > distanceMap.get(currentNode, float("inf")):
      continue
    for nextNode, edgeCost in edgeMap.get(currentNode, []):
      newCost = currentCost + edgeCost
      if newCost < distanceMap.get(nextNode, float("inf")):
        distanceMap[nextNode] = newCost
        heapq.heappush(frontierQueue, (newCost, nextNode))
  return distanceMap


weightedGraph = {
  "A": [("B", 5), ("C", 1)],
  "B": [("D", 3)],
  "C": [("B", 1), ("D", 7)],
  "D": [],
}
for nodeName, nodeCost in sorted(ShortestPaths(weightedGraph, "A").items()):
  print(f"A -> {nodeName}: {nodeCost}")
