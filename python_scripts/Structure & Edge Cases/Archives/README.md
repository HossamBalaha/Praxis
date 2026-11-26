# Archives

Real compressed fixtures for the archive viewer — click one in the
explorer to open it. Every archive below contains REAL payload files (two PNG images from the Media Gallery, a text note
and a markdown
readme) so extraction can be verified end to end.

| File                                                                                     | Format                         | Handler                                         |
|------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| `Bundle.zip`                                                                             | ZIP (deflate, nested dirs)     | built-in pure-JS reader — list + extract        |
| `Bundle.tar`                                                                             | plain tarball                  | system `tar` — list + extract                   |
| `Bundle.tar.gz` / `Bundle.tgz`                                                           | gzip tarball                   | system `tar` — list + extract                   |
| `Bundle.tar.bz2` / `Bundle.tbz2`                                                         | bzip2 tarball                  | system `tar` — list + extract                   |
| `Bundle.tar.xz` / `Bundle.txz`                                                           | xz tarball                     | system `tar` — list + extract                   |
| `Notes.md.gz`                                                                            | single-file gzip               | zlib — decompress to the sibling file           |
| `Notes.md.xz`                                                                            | single-file xz                 | system `xz` — decompress to the sibling file    |
| `Notes.md.bz2`                                                                           | single-file bzip2              | system `bzip2` — decompress to the sibling file |
| `BackupArchive.7z`                                                                       | 7-Zip (dirs + text + images)   | 7-Zip — list + extract (see below)              |
| `DocsPack.rar`                                                                           | RAR3 (nested dirs + text)      | unrar / unrar-free — list + extract (see below) |
| `SolidPack.rar`                                                                          | RAR3 solid archive             | unrar / unrar-free — list + extract (see below) |
| `Timestamps.rar`                                                                         | RAR3 (mtime metadata)          | unrar / unrar-free — list + extract (see below) |
| `PhotoPack.7z`                                                                           | 7-Zip (two PNGs)               | 7-Zip — list + extract (see below)              |
| `SampleBundle.zip`                                                                       | small ZIP (text notes)         | built-in pure-JS reader                         |
| `SourceBundle.tar.gz`                                                                    | tarball wrapping a binary blob | system `tar`                                    |
| `sample.zip` / `sample.tar.gz` / `sample2.txt.gz` / `sample3.txt.xz` / `sample4.txt.bz2` | minimal single-file samples    | as above                                        |

**7-Zip support**: Praxis ships a vendored `bin/7za` binary, so `.7z`
listing and extraction work out of the box even on machines with no
7-Zip installed; system `7z` / `7za` / `7zr` binaries are fallbacks,
and `bsdtar` is a last-resort fallback driven with its own tar-style
flags (`-tf` / `-xf`).

**RAR support**: `.rar` lists and extracts through the system `unrar`
OR `unrar-free` (both binary names are probed, and each flavor's
output format gets its own parser), or through a 7-Zip build that
carries the RAR codec (`p7zip-rar` — detected from the `7z i`
formats table). The three `.rar` fixtures above are real RAR3
archives with nested directories, solid-mode packing, and timestamp
metadata.

Every archive extracts the same two ways: **Extract here** and **Extract to a new subfolder**.
