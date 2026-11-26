"""Fibonacci with memoization — top-down dynamic programming."""


# tags: algorithms, dynamic-programming


def FibonacciNumber(indexValue: int, cacheMap: dict[int, int] | None = None) -> int:
  """Compute fib(indexValue) with an explicit memo dict."""
  if cacheMap is None:
    cacheMap = {}
  if indexValue in cacheMap:
    return cacheMap[indexValue]
  if indexValue < 2:
    return indexValue
  resultValue = FibonacciNumber(indexValue - 1, cacheMap) + FibonacciNumber(indexValue - 2, cacheMap)
  cacheMap[indexValue] = resultValue
  return resultValue


print("sequence:", [FibonacciNumber(n) for n in range(15)])
print("fib(90) =", FibonacciNumber(90))
