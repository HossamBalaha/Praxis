# Nested folders

Tests the explorer's folder/sub-folder interaction:

- `LevelOne/` → `LevelTwo/` → `LevelThree/` → `LevelFour/` — the
  deepest walk the listing performs (4 levels).
- `Empty Subfolder/` — created empty; must still render as a row.
- `Folder With Spaces/` — folder and file names containing spaces.

| Path          | File                                        |
|---------------|---------------------------------------------|
| root          | `RootLevelScript.py`                        |
| `LevelOne/`   | `LevelOneScript.py`                         |
| `LevelTwo/`   | `LevelTwoScript.py`, `LevelTwoNotes.md`     |
| `LevelThree/` | `LevelThreeScript.py`, `LevelThreeData.csv` |
| `LevelFour/`  | `DeepestScript.py`                          |
