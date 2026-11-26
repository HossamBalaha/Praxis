"""Comprehensions: list, dict, set and a lazy generator."""
# tags: basics, comprehensions

sourceNumbers = list(range(1, 21))
squareValues = [n * n for n in sourceNumbers]
evenSquares = [n * n for n in sourceNumbers if n % 2 == 0]
lengthLookup = {wordText: len(wordText) for wordText in ["alpha", "beta", "gamma", "delta"]}
uniqueLetters = {letterChar for wordText in ["python", "praxis"] for letterChar in wordText}

print("squares:", squareValues[:8], "...")
print("even squares:", evenSquares)
print("lengths:", lengthLookup)
print("unique letters:", sorted(uniqueLetters))

lazyStream = (n * 3 for n in sourceNumbers)
print("lazy first five:", [next(lazyStream) for _ in range(5)])
