/**
 * Python — Files & I/O examples. Category: "Files & I/O".
 * Each example writes then reads its own files next to the script.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {FileExample} from "@/lib/examples";
import {fn, mkExample, vr} from "./_helpers";

const CAT = "Files & I/O";
const py = (
    id: string, label: string, description: string, sub: string, baseName: string,
    build: (s: NamingStyleSettings) => string,
) => mkExample("python", id, label, description, CAT, sub, baseName, ".py", build);

export const PY_FILES_EXAMPLES: FileExample[] = [
    // ─── Text files ──────────────────────────────────────────────────
    py("py-ex-text-write-read", "Text write & read", "write/read text, encoding参数, and newline handling.", "Text files", "text_write_read",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Write a text file, then read it back three ways."""
${v("path")} = "${fn(s)("notes")}.txt"
${v("lines")} = ["first line", "second line", "third line"]

with open(${v("path")}, "w", encoding="utf-8") as ${v("handle")}:
    ${v("handle")}.write("\\n".join(${v("lines")}) + "\\n")

with open(${v("path")}, encoding="utf-8") as ${v("handle")}:
    ${v("whole")} = ${v("handle")}.read()
    print(f"read()      : {${v("whole")}!r}")

with open(${v("path")}, encoding="utf-8") as ${v("handle")}:
    print(f"readlines() : {${v("handle")}.readlines()}")

with open(${v("path")}, encoding="utf-8") as ${v("handle")}:
    for ${v("number")}, ${v("line")} in enumerate(${v("handle")}, start=1):
        print(f"line {${v("number")}}: {${v("line")}.rstrip()}")
`;
        }),
    py("py-ex-append-log", "Append-mode log", "A tiny logger: timestamps + append + file size watch.", "Text files", "append_log",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Append-style logging with timestamps."""
from datetime import datetime
from pathlib import Path

${v("path")} = Path("${f("events")}.log")


def ${f("log_event")}(message: str) -> None:
    ${v("stamp")} = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(${v("path")}, "a", encoding="utf-8") as ${v("handle")}:
        ${v("handle")}.write(f"[{${v("stamp")}}] {message}\\n")


for ${v("message")} in ["service started", "job #1 done", "job #2 done", "shutdown"]:
    ${f("log_event")}(${v("message")})

print(${v("path")}.read_text(encoding="utf-8"))
print(f"log file: {${v("path")}.name}  {${v("path")}.stat().st_size} bytes  {len(${v("path")}.read_text().splitlines())} lines")
`;
        }),
    py("py-ex-line-streaming", "Streaming large files", "Line-by-line iteration + generators — constant memory.", "Text files", "line_streaming",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Process a file without ever loading it fully."""
from pathlib import Path

${v("path")} = Path("${f("measurements")}.txt")
with open(${v("path")}, "w", encoding="utf-8") as ${v("handle")}:
    for ${v("i")} in range(1000):
        ${v("handle")}.write(f"{${v("i")}}, {${v("i")} * 1.5:.2f}\\n")


def ${f("streaming_stats")}(path: Path) -> tuple[int, float, float]:
    ${v("count")} = 0
    ${v("total")} = 0.0
    ${v("smallest")} = None
    with open(path, encoding="utf-8") as ${v("handle")}:
        for ${v("line")} in ${v("handle")}:
            ${v("value")} = float(${v("line")}.split(",")[1])
            ${v("count")} += 1
            ${v("total")} += ${v("value")}
            ${v("smallest")} = ${v("value")} if ${v("smallest")} is None else min(${v("smallest")}, ${v("value")})
    return ${v("count")}, ${v("total")} / ${v("count")}, ${v("smallest")}


${v("count")}, ${v("mean")}, ${v("smallest")} = ${f("streaming_stats")}(${v("path")})
print(f"rows   : {${v("count")}}")
print(f"mean   : {${v("mean")}:.3f}")
print(f"minimum: {${v("smallest")}}")
print(f"file   : {${v("path")}.stat().st_size:,} bytes — processed line by line")
`;
        }),
    py("py-ex-word-count", "Word count (wc)", "The unix wc in Python: lines, words, chars, most common word.", "Text files", "word_count",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""wc-style file statistics."""
from collections import Counter
from pathlib import Path

${v("path")} = Path("${fn(s)("document")}.txt")
${v("text")} = (
    "the quick brown fox jumps over the lazy dog\\n"
    "the dog barks and the fox runs away\\n"
    "a quick escape over the fence\\n"
)
${v("path")}.write_text(${v("text")}, encoding="utf-8")

with open(${v("path")}, encoding="utf-8") as ${v("handle")}:
    ${v("content")} = ${v("handle")}.read()

${v("line_count")} = ${v("content")}.count("\\n")
${v("words")} = ${v("content")}.split()
${v("counts")} = Counter(${v("words")})

print(f"lines     : {${v("line_count")}}")
print(f"words     : {len(${v("words")})}")
print(f"chars     : {len(${v("content")})}")
print(f"top words : {${v("counts")}.most_common(3)}")
print(f"unique    : {len(${v("counts")})}")
`;
        }),
    py("py-ex-path-walker", "Path walker report", "Walks this chapter's folder with pathlib and prints a file report.", "Text files", "path_walker",
        (s) => `# -*- coding: utf-8 -*-
"""List the files next to this script with pathlib."""
from pathlib import Path

# Under the Praxis run wrapper __file__ is a placeholder; fall back
# to the script's working directory (its chapter folder) then.
${applyNamingStyle(s.variables, "here")} = Path(__file__).resolve().parent
if not ${applyNamingStyle(s.variables, "here")}.is_dir():
    ${applyNamingStyle(s.variables, "here")} = Path.cwd()

${applyNamingStyle(s.variables, "files")} = sorted(${applyNamingStyle(s.variables, "here")}.iterdir(), key=lambda ${applyNamingStyle(s.variables, "p")}: ${applyNamingStyle(s.variables, "p")}.name.lower())

print(f"folder: {${applyNamingStyle(s.variables, "here")}.name} ({len(${applyNamingStyle(s.variables, "files")})} entries)")
for ${applyNamingStyle(s.variables, "p")} in ${applyNamingStyle(s.variables, "files")}:
    ${applyNamingStyle(s.variables, "kind")} = "dir " if ${applyNamingStyle(s.variables, "p")}.is_dir() else "file"
    ${applyNamingStyle(s.variables, "size")} = ${applyNamingStyle(s.variables, "p")}.stat().st_size if ${applyNamingStyle(s.variables, "p")}.is_file() else 0
    print(f"  [{${applyNamingStyle(s.variables, "kind")}}] {${applyNamingStyle(s.variables, "p")}.name:<32} {${applyNamingStyle(s.variables, "size")}:>8,} bytes")

${applyNamingStyle(s.variables, "py_files")} = list(${applyNamingStyle(s.variables, "here")}.glob("*.py"))
print(f"python files: {len(${applyNamingStyle(s.variables, "py_files")})}")
`),

    // ─── Structured data ─────────────────────────────────────────────
    py("py-ex-json-config", "JSON config read/write", "Round-trip a config file with json + pathlib-style open.", "Structured data", "json_config",
        (s) => `# -*- coding: utf-8 -*-
"""Write then read back a JSON configuration file."""
import json

${applyNamingStyle(s.variables, "config")} = {
    "${applyNamingStyle(s.dictKeys, "app_name")}": "praxis demo",
    "${applyNamingStyle(s.dictKeys, "version")}": 1,
    "${applyNamingStyle(s.dictKeys, "features")}": ["figures", "notes", "ai"],
    "${applyNamingStyle(s.dictKeys, "limits")}": {"${applyNamingStyle(s.dictKeys, "max_rows")}": 1000, "${applyNamingStyle(s.dictKeys, "timeout_seconds")}": 30},
}

with open("${applyNamingStyle(s.functions, "demo_config")}.json", "w", encoding="utf-8") as ${applyNamingStyle(s.variables, "handle")}:
    json.dump(${applyNamingStyle(s.variables, "config")}, ${applyNamingStyle(s.variables, "handle")}, indent=2)

with open("${applyNamingStyle(s.functions, "demo_config")}.json", "r", encoding="utf-8") as ${applyNamingStyle(s.variables, "handle")}:
    ${applyNamingStyle(s.variables, "loaded")} = json.load(${applyNamingStyle(s.variables, "handle")})

print(json.dumps(${applyNamingStyle(s.variables, "loaded")}, indent=2))
print("round-trip ok:", ${applyNamingStyle(s.variables, "loaded")} == ${applyNamingStyle(s.variables, "config")})
`),
    py("py-ex-csv-stdlib", "CSV read & write (stdlib)", "Writes then reads a CSV with the csv module + DictReader.", "Structured data", "csv_roundtrip",
        (s) => `# -*- coding: utf-8 -*-
"""Write and re-read a CSV with the standard csv module."""
import csv

${applyNamingStyle(s.variables, "path")} = "${applyNamingStyle(s.functions, "measurements")}.csv"
${applyNamingStyle(s.variables, "rows")} = [
    {"sensor": "temp", "celsius": 21.4},
    {"sensor": "temp", "celsius": 22.1},
    {"sensor": "humidity", "celsius": 18.9},
]

with open(${applyNamingStyle(s.variables, "path")}, "w", newline="", encoding="utf-8") as ${applyNamingStyle(s.variables, "handle")}:
    ${applyNamingStyle(s.variables, "writer")} = csv.DictWriter(${applyNamingStyle(s.variables, "handle")}, fieldnames=${applyNamingStyle(s.variables, "rows")}[0].keys())
    ${applyNamingStyle(s.variables, "writer")}.writeheader()
    ${applyNamingStyle(s.variables, "writer")}.writerows(${applyNamingStyle(s.variables, "rows")})

print(f"wrote {${applyNamingStyle(s.variables, "path")}}")

with open(${applyNamingStyle(s.variables, "path")}, encoding="utf-8") as ${applyNamingStyle(s.variables, "handle")}:
    for ${applyNamingStyle(s.variables, "row")} in csv.DictReader(${applyNamingStyle(s.variables, "handle")}):
        print(f"{${applyNamingStyle(s.variables, "row")}['sensor']:<10} {${applyNamingStyle(s.variables, "row")}['celsius']} C")
`),
    py("py-ex-jsonl", "JSONL processing", "The streaming data format: one JSON object per line.", "Structured data", "jsonl_records",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""JSON Lines: append, stream, filter, aggregate."""
import json
from pathlib import Path

${v("path")} = Path("${fn(s)("events")}.jsonl")
${v("events")} = [
    {"user": "alice", "action": "login", "minutes": 0.0},
    {"user": "alice", "action": "edit", "minutes": 12.5},
    {"user": "bob", "action": "login", "minutes": 0.0},
    {"user": "bob", "action": "edit", "minutes": 4.2},
    {"user": "alice", "action": "logout", "minutes": 0.5},
]

with open(${v("path")}, "w", encoding="utf-8") as ${v("handle")}:
    for ${v("event")} in ${v("events")}:
        ${v("handle")}.write(json.dumps(${v("event")}) + "\\n")

${v("minutes_by_user")} = {}
${v("count")} = 0
with open(${v("path")}, encoding="utf-8") as ${v("handle")}:
    for ${v("line")} in ${v("handle")}:
        ${v("event")} = json.loads(${v("line")})
        ${v("count")} += 1
        ${v("user")} = ${v("event")}["user"]
        ${v("minutes_by_user")}[${v("user")}] = ${v("minutes_by_user")}.get(${v("user")}, 0.0) + ${v("event")}["minutes"]

print(f"streamed {${v("count")}} events from {${v("path")}.name}")
print(f"minutes by user: {${v("minutes_by_user")}}")
`;
        }),
    py("py-ex-configparser", "INI with configparser", "Sections, options, defaults, and getfloat/getint typing.", "Structured data", "configparser_ini",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""INI files: the config format that outlived everything."""
import configparser
from pathlib import Path

${v("path")} = Path("${fn(s)("settings")}.ini")
${v("content")} = """[server]
host = localhost
port = 8000
debug = true

[limits]
max_rows = 1000
timeout = 30.5
"""
${v("path")}.write_text(${v("content")}, encoding="utf-8")

${v("config")} = configparser.ConfigParser()
${v("config")}.read(${v("path")}, encoding="utf-8")

print(f"sections: {${v("config")}.sections()}")
print(f"host    : {${v("config")}.get('server', 'host')}")
print(f"port    : {${v("config")}.getint('server', 'port')}")
print(f"debug   : {${v("config")}.getboolean('server', 'debug')}")
print(f"timeout : {${v("config")}.getfloat('limits', 'timeout')}")
print(f"fallback: {${v("config")}.get('server', 'missing', fallback='default-value')}")
`;
        }),
    py("py-ex-csv-to-json", "CSV → JSON converter", "Read tabular CSV, nest it into records, pretty-print JSON.", "Structured data", "csv_to_json",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Convert CSV rows into a nested JSON document."""
import csv
import json
from pathlib import Path

${v("csv_path")} = Path("${fn(s)("students")}.csv")
${v("csv_path")}.write_text(
    "name,math,science\\nalice,92,88\\nbob,78,95\\ncarol,85,91\\n",
    encoding="utf-8",
)

${v("students")} = []
with open(${v("csv_path")}, encoding="utf-8") as ${v("handle")}:
    for ${v("row")} in csv.DictReader(${v("handle")}):
        ${v("students")}.append({
            "name": ${v("row")}["name"],
            "scores": {
                "math": int(${v("row")}["math"]),
                "science": int(${v("row")}["science"]),
            },
            "total": int(${v("row")}["math"]) + int(${v("row")}["science"]),
        })

${v("students")}.sort(key=lambda ${v("student")}: ${v("student")}["total"], reverse=True)
${v("json_path")} = Path("${fn(s)("students")}.json")
${v("json_path")}.write_text(json.dumps({"class": "2026", "students": ${v("students")}}, indent=2), encoding="utf-8")

print(${v("json_path")}.read_text(encoding="utf-8"))
print(f"converted {${v("csv_path")}.name} -> {${v("json_path")}.name}")
`;
        }),

    // ─── Binary & archives ───────────────────────────────────────────
    py("py-ex-pickle", "Pickle round-trip", "Serialize objects to disk and back — with the safety caveat.", "Binary & archives", "pickle_roundtrip",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""pickle: native Python object serialization."""
import pickle
from pathlib import Path

${v("path")} = Path("${fn(s)("state")}.pkl")
${v("state")} = {
    "model": {"weights": [0.1, -0.4, 0.9], "bias": 0.05},
    "history": [0.9, 0.7, 0.4, 0.2],
    "trained": True,
}

with open(${v("path")}, "wb") as ${v("handle")}:
    pickle.dump(${v("state")}, ${v("handle")}, protocol=pickle.HIGHEST_PROTOCOL)

with open(${v("path")}, "rb") as ${v("handle")}:
    ${v("loaded")} = pickle.load(${v("handle")})

print(f"round-trip equal : {${v("loaded")} == ${v("state")}}")
print(f"file size        : {${v("path")}.stat().st_size} bytes")
print(f"weights          : {${v("loaded")}['model']['weights']}")
print("note: only unpickle files YOU wrote — pickle can execute code.")
`;
        }),
    py("py-ex-base64", "Base64 encode/decode", "Binary ↔ text for URLs, data URIs, and emails.", "Binary & archives", "base64_codec",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Base64: bytes in, URL-safe text out."""
import base64

${v("message")} = "praxis: files & I/O examples".encode("utf-8")
${v("encoded")} = base64.b64encode(${v("message")}).decode("ascii")
${v("decoded")} = base64.b64decode(${v("encoded")}).decode("utf-8")

print(f"original : {${v("message")}.decode()}")
print(f"b64      : {${v("encoded")}}")
print(f"decoded  : {${v("decoded")}}")
print(f"equal    : {${v("decoded")} == ${v("message")}.decode()}")

${v("url_encoded")} = base64.urlsafe_b64encode(${v("message")}).decode("ascii")
print(f"url-safe : {${v("url_encoded")}}")

${v("image_like")} = bytes(range(64))
print(f"64 bytes -> {len(base64.b64encode(${v("image_like")}))} b64 chars (4/3 ratio)")
`;
        }),
    py("py-ex-zipfile", "Zip archives", "Create, list, extract, and read members without extracting.", "Binary & archives", "zip_archive",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""zipfile: build and inspect an archive."""
import zipfile
from pathlib import Path

${v("archive")} = Path("${fn(s)("bundle")}.zip")
${v("files")} = {
    "${fn(s)("readme")}.txt": "generated by the zipfile example\\n",
    "data/values.txt": "1\\n2\\n3\\n5\\n8\\n13\\n",
}

with zipfile.ZipFile(${v("archive")}, "w", compression=zipfile.ZIP_DEFLATED) as ${v("bundle")}:
    for ${v("name")}, ${v("content")} in ${v("files")}.items():
        ${v("info")} = zipfile.ZipInfo(${v("name")}, date_time=(2026, 11, 7, 12, 0, 0))
        ${v("bundle")}.writestr(${v("info")}, ${v("content")})

with zipfile.ZipFile(${v("archive")}) as ${v("bundle")}:
    print(f"members: {${v("bundle")}.namelist()}")
    for ${v("info")} in ${v("bundle")}.infolist():
        print(f"  {${v("info")}.filename:<18} {${v("info")}.file_size} -> {${v("info")}.compress_size} bytes")
    print(f"\\nread without extracting: {${v("bundle")}.read('data/values.txt').decode().split()}")
    ${v("bundle")}.extractall("data")

print(f"\\narchive: {${v("archive")}.stat().st_size} bytes on disk")
print(f"extracted: {sorted(p.name for p in Path('data').rglob('*') if p.is_file())}")
`;
        }),
    py("py-ex-struct", "struct pack/unpack", "Binary records with exact byte layouts — the C-struct bridge.", "Binary & archives", "struct_pack",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""struct: fixed-layout binary records."""
import struct
from pathlib import Path

${v("format")} = "<I2sfd"  # little-endian: uint32, 2 bytes, float32, double
${v("records")} = [
    (1, b"ca", 21.4, 1013.25),
    (2, b"uk", 14.2, 1009.8),
    (3, b"jp", 22.9, 1014.1),
]

${v("path")} = Path("${fn(s)("readings")}.bin")
with open(${v("path")}, "wb") as ${v("handle")}:
    for ${v("record")} in ${v("records")}:
        ${v("handle")}.write(struct.pack(${v("format")}, *${v("record")}))

${v("record_size")} = struct.calcsize(${v("format")})
print(f"record size: {${v("record_size")}} bytes x {len(${v("records")})} records = {${v("path")}.stat().st_size} bytes")

with open(${v("path")}, "rb") as ${v("handle")}:
    ${v("raw")} = ${v("handle")}.read()
for ${v("i")} in range(len(${v("records")})):
    ${v("chunk")} = ${v("raw")}[${v("i")} * ${v("record_size")}:(${v("i")} + 1) * ${v("record_size")}]
    ${v("id")}, ${v("code")}, ${v("temp")}, ${v("pressure")} = struct.unpack(${v("format")}, ${v("chunk")})
    print(f"id={${v("id")}} country={${v("code")}.decode()} temp={${v("temp")}:.1f}C pressure={${v("pressure")}:.1f}hPa")
`;
        }),
    py("py-ex-shutil", "shutil copy & tree", "Copy files, copy trees, and disk usage reports.", "Binary & archives", "shutil_copy",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""shutil: high-level file operations."""
import shutil
from pathlib import Path

${v("source")} = Path("${fn(s)("original")}.txt")
${v("source")}.write_text("content worth backing up\\n" * 10, encoding="utf-8")

${v("copy")} = Path("${fn(s)("copy")}.txt")
shutil.copy2(${v("source")}, ${v("copy")})  # copy2 keeps metadata

${v("backup_dir")} = Path("${fn(s)("backup")}")
shutil.copytree(Path("."), ${v("backup_dir")}, ignore=shutil.ignore_patterns("*.zip"), dirs_exist_ok=True)

print(f"copied      : {${v("copy")}.name} ({${v("copy")}.stat().st_size} bytes)")
print(f"backup tree : {len(list(${v("backup_dir")}.iterdir()))} entries")

${v("usage")} = shutil.disk_usage(Path.cwd())
print(f"disk total  : {${v("usage")}.total / 2**30:.1f} GiB")
print(f"disk free   : {${v("usage")}.free / 2**30:.1f} GiB")

shutil.rmtree(${v("backup_dir")})
print(f"cleanup     : removed {${v("backup_dir")}.name}")
`;
        }),

    // ─── Paths & metadata ────────────────────────────────────────────
    py("py-ex-file-stats", "File statistics report", "size, mtime, permissions — a forensic view of a folder.", "Paths & metadata", "file_stats_report",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Metadata for every file in this chapter folder."""
from datetime import datetime
from pathlib import Path

${v("here")} = Path.cwd()
${v("entries")} = sorted(
    (p for p in ${v("here")}.iterdir() if p.is_file()),
    key=lambda p: p.stat().st_size,
    reverse=True,
)

print(f"{'file':<28} {'size':>10}  {'modified':<16} perms")
for ${v("entry")} in ${v("entries")}:
    ${v("stat")} = ${v("entry")}.stat()
    ${v("modified")} = datetime.fromtimestamp(${v("stat")}.st_mtime).strftime("%Y-%m-%d %H:%M")
    ${v("perms")} = oct(${v("stat")}.st_mode & 0o777)
    print(f"{${v("entry")}.name[:27]:<28} {${v("stat")}.st_size:>10,}  {${v("modified")}:<16} {${v("perms")}}")

${v("total")} = sum(p.stat().st_size for p in ${v("entries")})
print(f"\\n{len(${v("entries")})} files, {${v("total")}} bytes total")
`;
        }),
    py("py-ex-glob-patterns", "glob patterns", "**, *, ? and [ranges] — find files by shape.", "Paths & metadata", "glob_patterns",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Pattern matching over file names."""
from pathlib import Path

${v("root")} = Path("${fn(s)("globdemo")}")
(${v("root")} / "reports" / "2026").mkdir(parents=True, exist_ok=True)
(${v("root")} / "reports" / "2025").mkdir(parents=True, exist_ok=True)
for ${v("name")} in ["a.txt", "b.txt", "c.log", "notes.md"]:
    (${v("root")} / ${v("name")}).write_text("x", encoding="utf-8")
for ${v("year")} in ["2025", "2026"]:
    for ${v("month")} in range(1, 4):
        (${v("root")} / "reports" / ${v("year")} / f"report-{${v("month")}:02d}.txt").write_text("y", encoding="utf-8")

print(f"*.txt here        : {sorted(p.name for p in ${v("root")}.glob('*.txt'))}")
print(f"*.md + *.log      : {sorted(p.name for p in ${v("root")}.glob('*.[ml]*'))}")
print(f"**/*.txt recursive: {len(list(${v("root")}.rglob('*.txt')))} files")
print(f"report-0?.txt     : {len(list((${v("root")} / 'reports' / '2026').glob('report-0?.txt')))} files")
print(f"202* dirs         : {sorted(p.name for p in (${v("root")} / 'reports').glob('202*') if p.is_dir())}")

import shutil
shutil.rmtree(${v("root")})
print("(demo tree removed)")
`;
        }),
    py("py-ex-temp-files", "Temporary files", "tempfile: NamedTemporaryFile, mkdtemp, and auto-cleanup.", "Paths & metadata", "temp_files",
        (s) => {
            const v = vr(s);
            return `# -*- coding: utf-8 -*-
"""Scratch space that cleans up after itself."""
import tempfile
from pathlib import Path

${v("scratch")} = Path(tempfile.mkdtemp(prefix="praxis-"))
print(f"scratch dir   : {${v("scratch")}}")

with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", dir=${v("scratch")}, delete=False) as ${v("handle")}:
    ${v("handle")}.write("intermediate data\\n")
    ${v("temp_path")} = Path(${v("handle")}.name)
print(f"temp file     : {${v("temp_path")}.name} ({${v("temp_path")}.stat().st_size} bytes)")
print(f"content       : {${v("temp_path")}.read_text().strip()!r}")

${v("temp_path")}.unlink()
print(f"deleted       : not {${v("temp_path")}.exists()}")

import shutil
shutil.rmtree(${v("scratch")})
print(f"scratch gone  : not {${v("scratch")}.exists()}")

with tempfile.TemporaryDirectory() as ${v("auto_dir")}:
    ${v("marker")} = Path(${v("auto_dir")}) / "inside.txt"
    ${v("marker")}.write_text("auto-cleaned", encoding="utf-8")
    print(f"context manager: exists inside = {${v("marker")}.exists()}")
print(f"context manager: exists after  = {${v("marker")}.exists()}")
`;
        }),
    py("py-ex-atomic-write", "Atomic write", "Write to a temp file then rename — readers never see a torn file.", "Paths & metadata", "atomic_write",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""The safe-save pattern: temp file + os.replace (atomic on POSIX)."""
import os
from pathlib import Path

${v("target")} = Path("${f("database")}.json")
${v("target")}.write_text('{"version": 1}', encoding="utf-8")


def ${f("atomic_save")}(path: Path, content: str) -> None:
    ${v("tmp")} = path.with_suffix(path.suffix + ".tmp")
    with open(${v("tmp")}, "w", encoding="utf-8") as ${v("handle")}:
        ${v("handle")}.write(content)
        ${v("handle")}.flush()
        import os as _os
        _os.fsync(${v("handle")}.fileno())
    os.replace(${v("tmp")}, path)


${f("atomic_save")}(${v("target")}, '{"version": 2, "saved": "atomically"}')
print(f"new content : {${v("target")}.read_text()}")
print(f"tmp leftover: {(${v("target")}.with_suffix('.json.tmp')).exists()}")
print("os.replace is atomic — concurrent readers see v1 or v2, never a mix.")
`;
        }),

    py("py-ex-file-manifest", "File manifest with hashes", "SHA-256 fingerprint every file in a folder — change detection.", "Paths & metadata", "file_manifest",
        (s) => {
            const f = fn(s), v = vr(s);
            return `# -*- coding: utf-8 -*-
"""A manifest of files with sizes and hashes."""
import hashlib
from pathlib import Path


def ${f("fingerprint")}(path: Path, chunk: int = 65_536) -> str:
    ${v("digest")} = hashlib.sha256()
    with open(path, "rb") as ${v("handle")}:
        while ${v("block")} := ${v("handle")}.read(${v("chunk")}):
            ${v("digest")}.update(${v("block")})
    return ${v("digest")}.hexdigest()[:16]


${v("here")} = Path.cwd()
${v("targets")} = sorted(p for p in ${v("here")}.iterdir() if p.is_file())[:12]

print(f"{'file':<28} {'size':>9}  sha256[:16]")
for ${v("path")} in ${v("targets")}:
    ${v("size")} = ${v("path")}.stat().st_size
    ${v("hash")} = ${f("fingerprint")}(${v("path")})
    print(f"{${v("path")}.name[:27]:<28} {${v("size")}:>9,}  {${v("hash")}}")

${v("manifest_path")} = ${v("here")} / "${f("manifest")}.txt"
${v("manifest_path")}.write_text(
    "\\n".join(f"{p.name} {p.stat().st_size} {${f("fingerprint")}(p)}" for p in ${v("targets")}),
    encoding="utf-8",
)
print(f"\\nmanifest written: {${v("manifest_path")}.name} ({len(${v("targets")})} entries)")
`;
        }),
];
