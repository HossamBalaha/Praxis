"""A quick tour of camelCase variables across the builtin types."""
# tags: basics, variables

wholeNumber = 42
floatingPoint = 3.14159
booleanFlag = True
textSample = "camelCase variables"
listSample = [1, 2, 3, 5, 8]
mapSample = {"firstName": "Ada", "lastName": "Lovelace"}
tupleSample = (1920, 1080)
nothingHere = None
byteSample = b"\x00\x01\x02"

print("types:", type(wholeNumber).__name__, type(floatingPoint).__name__, type(booleanFlag).__name__)
print("list total:", sum(listSample))
print("map:", mapSample["firstName"], mapSample["lastName"])
print("tuple:", tupleSample[0], "x", tupleSample[1])
print("bytes:", byteSample.hex())
print("nothing:", nothingHere)
