"""Read the sample datasets from ../Data Files (pandas optional)."""
# tags: data, pandas

from pathlib import Path

dataFolder = Path(__file__).resolve().parent.parent / "Data Files"

try:
  import pandas as pd
except ImportError:
  pd = None
  print("pandas is not installed — this script only prints the file list.")
  print("pip install pandas openpyxl pyarrow  to enable full reading.")

if pd is not None:
  for fileName, loaderName in [
    ("SensorReadings.csv", "read_csv"),
    ("SensorReadings.tsv", "read_csv"),
    ("SensorReadings.xlsx", "read_excel"),
    ("SensorReadings.parquet", "read_parquet"),
    ("SensorReadings.feather", "read_feather"),
  ]:
    filePath = dataFolder / fileName
    if not filePath.exists():
      print("missing:", fileName)
      continue
    loader = getattr(pd, loaderName)
    loadOptions = {"sep": "\t"} if fileName.endswith(".tsv") else {}
    frameData = loader(filePath, **loadOptions)
    print(f"{fileName}: {frameData.shape[0]} rows x {frameData.shape[1]} cols")
    numericColumn = "temperatureC" if "temperatureC" in frameData else frameData.columns[2]
    print("   ", numericColumn, "mean =", round(float(frameData[numericColumn].mean()), 2))

if dataFolder.exists():
  for existingFile in sorted(dataFolder.iterdir()):
    if existingFile.is_file():
      print(f"  {existingFile.name:<24} {existingFile.stat().st_size:>8} bytes")
