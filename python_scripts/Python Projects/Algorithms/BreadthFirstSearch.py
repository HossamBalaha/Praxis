"""Breadth-first search over an adjacency graph — shortest hops."""
# tags: algorithms, graphs

from collections import deque


def BreadthFirstSearch(graphMap: dict[str, list[str]], startNode: str, goalNode: str) -> list[str] | None:
  """Return the shortest node path from start to goal, or None."""
  visitedSet = {startNode}
  pendingQueue: deque[list[str]] = deque([[startNode]])
  while pendingQueue:
    currentPath = pendingQueue.popleft()
    currentNode = currentPath[-1]
    if currentNode == goalNode:
      return currentPath
    for nextNode in graphMap.get(currentNode, []):
      if nextNode not in visitedSet:
        visitedSet.add(nextNode)
        pendingQueue.append(currentPath + [nextNode])
  return None


cityGraph = {
  "Depot"  : ["Alpha", "Beta"],
  "Alpha"  : ["Gamma"],
  "Beta"   : ["Gamma", "Delta"],
  "Gamma"  : ["Epsilon"],
  "Delta"  : ["Epsilon"],
  "Epsilon": [],
}
print("route:", " -> ".join(BreadthFirstSearch(cityGraph, "Depot", "Epsilon") or []))
