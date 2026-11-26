"""Function shapes — defaults, *args, **kwargs, annotations."""


# tags: basics, functions


def Greet(nameText: str, greetingText: str = "Hello") -> str:
  """Build a greeting with a default."""
  return f"{greetingText}, {nameText}!"


def RunningTotal(startValue: float, *stepValues: float) -> float:
  """Sum a start value with any number of steps."""
  totalValue = startValue
  for stepValue in stepValues:
    totalValue += stepValue
  return totalValue


def DescribeItem(**displayOptions: object) -> str:
  """Render keyword options into a compact description."""
  partsList = [f"{optionName}={optionValue}" for optionName, optionValue in sorted(displayOptions.items())]
  return ", ".join(partsList)


print(Greet("Praxis"))
print(Greet("world", greetingText="Bonjour"))
print("running total:", RunningTotal(10.0, 1.5, 2.5, 3.5))
print("describe:", DescribeItem(colorName="emerald", widthUnits=320, isResizable=True))
