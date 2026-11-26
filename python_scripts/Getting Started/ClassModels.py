"""Classes stay PascalCase: a dataclass, a plain class and an Enum."""
# tags: basics, oop

from dataclasses import dataclass
from enum import Enum, auto


class SensorKind(Enum):
  """The kinds of sensor this model supports."""
  TEMPERATURE = auto()
  HUMIDITY = auto()
  PRESSURE = auto()


@dataclass
class SensorReading:
  """One record from a sensor."""
  sensorId: int
  kindValue: SensorKind
  measuredValue: float
  isValid: bool = True

  def FormatLine(self) -> str:
    """Render the reading as one output line."""
    flagText = "ok" if self.isValid else "bad"
    return f"#{self.sensorId:>2} {self.kindValue.name:<11} {self.measuredValue:>7.2f} {flagText}"


class ReadingBatch:
  """A small mutable collection over SensorReading rows."""

  def __init__(self, readingsList: list[SensorReading]) -> None:
    self.readingsList = readingsList

  def ValidOnly(self) -> list[SensorReading]:
    """Filter down to valid readings."""
    return [readingItem for readingItem in self.readingsList if readingItem.isValid]

  def AverageValue(self) -> float:
    """Average of the measured values (valid rows only)."""
    validList = self.ValidOnly()
    if not validList:
      return 0.0
    return sum(item.measuredValue for item in validList) / len(validList)


sampleBatch = ReadingBatch([
  SensorReading(1, SensorKind.TEMPERATURE, 21.5),
  SensorReading(2, SensorKind.HUMIDITY, 58.2),
  SensorReading(3, SensorKind.PRESSURE, 1013.25, isValid=False),
  SensorReading(4, SensorKind.TEMPERATURE, -4.75),
])

for readingItem in sampleBatch.readingsList:
  print(readingItem.FormatLine())
print("valid average:", round(sampleBatch.AverageValue(), 3))
