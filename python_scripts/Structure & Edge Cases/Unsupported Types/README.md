# Unsupported file types

Every file here has an extension the viewer has **no renderer for** —
opening one must show the friendly "Unsupported file type" card
instead of an error or a blank pane.

| File                | Why it is here                            |
|---------------------|-------------------------------------------|
| `BinaryBlob.bin`    | generic binary blob                       |
| `Installer.exe`     | Windows executable (PE header bytes)      |
| `SystemLibrary.dll` | Windows library (PE header bytes)         |
| `DataChunk.dat`     | proprietary data chunk                    |
| `LegacyData.foobar` | invented extension                        |
| `SecurityKey.pem`   | key material (text, but unsupported kind) |

Compressed files (`.zip`, `.tar.gz`, `.7z`, …) are NOT "unsupported" —
they live in the sibling **Archives** folder and open the archive
viewer (entry list + extract).

This folder also intentionally contains **no .py files** — the
explorer should still list it (an "empty of Python" badge state).
