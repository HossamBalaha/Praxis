# Data files

Synthetic sensor data in every tabular format the data-file browser
reads, plus nested config formats for the syntax-highlighted viewers.

| File                     | Format           | Highlights                                                                |
|--------------------------|------------------|---------------------------------------------------------------------------|
| `SensorReadings.csv`     | CSV              | negatives, booleans, NaN / None / empty cells — the colored-cell test set |
| `SensorReadings.tsv`     | TSV              | the same table, tab-separated                                             |
| `SensorReadings.xlsx`    | Excel (2 sheets) | colored headers + number formats                                          |
| `SensorReadings.parquet` | Parquet          | columnar binary                                                           |
| `SensorReadings.feather` | Feather          | Arrow IPC binary                                                          |
| `Inventory.db`           | SQLite           | two tables — `InventoryItems`, `Suppliers`                                |
| `DeepConfig.json`        | JSON             | 4 levels of nesting + arrays                                              |
| `Records.jsonl`          | JSON Lines       | one object per line                                                       |
| `AppConfig.yaml`         | YAML             | mappings, lists, multiline strings                                        |
| `ProjectSpec.toml`       | TOML             | tables, arrays, inline tables                                             |

Open the folder's data-files browser (the Explorer's per-folder
"Browse data files" action) to preview any of them, or run
`Getting Started/ReadSampleData.py`.
