/**
 * completion-provider.ts — the offline completion engine.
 *
 * Two popups share this pure module:
 *
 * · The NON-PYTHON editor (file-viewer) — a lightweight autocomplete
 *   after 3+ identifier chars; candidates come from (a) words already
 *   in the document and (b) the language's keyword table.
 *
 * · The PYTHON editor (code-viewer, E19) — an LSP-grade popup built
 *   on the same fuzzy/rank matcher plus: a curated table of builtin/
 *   method signatures with one-line docs, document-symbol signatures
 *   parsed from the buffer's own def/class lines, snippet triggers
 *   carrying VS Code-style tabstops, and import auto-insert on
 *   accept (importFor / ensureImport).
 *
 * No AI, no network, no dependencies — the popups themselves (keys,
 * rendering, insertion) live in the components.
 *
 * Pure module — unit-tested in __tests__/completion-provider.test.ts.
 */

import {formatSymbol, parsePythonSymbols, type PythonSymbol} from "./python-symbols";

/* ═══ Python curated tables (E19) ════════════════════════════════
 * Small offline tables backing the Python popup: the keyword list, a
 * builtin/method table (a one-line signature + a one-line doc each),
 * and a symbol → import-statement map. The generic keyword table (KW
 * below) merges the keywords and the builtin names, so
 * keywordsForKind("python") surfaces both. */

/** Python keywords — hard keywords + self/cls + the 3.10 soft pair. */
const PYTHON_KEYWORDS: string[] = [
    "and", "as", "assert", "async", "await", "break", "case", "class",
    "cls", "continue", "def", "del", "elif", "else", "except", "False",
    "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "match", "nonlocal", "not", "None", "or", "pass", "raise",
    "return", "self", "True", "try", "while", "with", "yield",
];

/** A curated builtin entry: a call signature + a one-line doc. */
export interface BuiltinDoc {
    /** One-line call signature, e.g. "print(*values, sep=' ')". */
    signature: string;
    /** One-line doc snippet for the popup's doc pane. */
    doc: string;
}

/** The ~90 most common builtins, types, exceptions and str/list/dict/
 * set methods — one line each, offline. */
const PYTHON_BUILTINS: Record<string, BuiltinDoc> = {
    // ── core builtins ──
    print: {
        signature: "print(*values, sep=' ', end='\\n', file=sys.stdout, flush=False)",
        doc: "Print the values to a stream (default sys.stdout)."
    },
    len: {signature: "len(obj)", doc: "Return the number of items in a container."},
    range: {
        signature: "range(start, stop, step)",
        doc: "An immutable sequence of ints from start to stop (exclusive)."
    },
    open: {
        signature: "open(file, mode='r', encoding=None, newline=None)",
        doc: "Open a file and return a stream ('r', 'w', 'a', 'b', …)."
    },
    sorted: {
        signature: "sorted(iterable, *, key=None, reverse=False)",
        doc: "Return a new sorted list from the items of iterable."
    },
    reversed: {signature: "reversed(seq)", doc: "Return a reverse iterator over seq."},
    enumerate: {
        signature: "enumerate(iterable, start=0)",
        doc: "Yield (index, item) pairs; the index counts from start."
    },
    zip: {signature: "zip(*iterables, strict=False)", doc: "Yield tuples of parallel items from the iterables."},
    map: {
        signature: "map(function, iterable, *iterables)",
        doc: "Apply function to each item, lazily, across the iterables."
    },
    filter: {signature: "filter(function, iterable)", doc: "Yield the items where function(item) is truthy."},
    isinstance: {
        signature: "isinstance(obj, class_or_tuple)",
        doc: "True when obj is an instance of the class (or tuple of them)."
    },
    issubclass: {signature: "issubclass(cls, class_or_tuple)", doc: "True when cls is a direct or indirect subclass."},
    getattr: {
        signature: "getattr(obj, name, default)",
        doc: "Return obj.name; default (or AttributeError) when missing."
    },
    setattr: {signature: "setattr(obj, name, value)", doc: "Set the attribute name on obj to value."},
    hasattr: {signature: "hasattr(obj, name)", doc: "True when obj has the attribute name."},
    delattr: {signature: "delattr(obj, name)", doc: "Delete the attribute name from obj."},
    callable: {signature: "callable(obj)", doc: "True when obj can be called like a function."},
    id: {signature: "id(obj)", doc: "The identity of obj — unique among live objects."},
    hash: {signature: "hash(obj)", doc: "The hash value of obj (equal objects hash equal)."},
    repr: {signature: "repr(obj)", doc: "The canonical string representation of obj."},
    format: {
        signature: "format(value, format_spec='')",
        doc: "Format value per the spec mini-language ('.2f', '>10', …)."
    },
    input: {signature: "input(prompt=None)", doc: "Read one line from stdin, stripping the trailing newline."},
    sum: {signature: "sum(iterable, /, start=0)", doc: "Sum start and the items of iterable, left to right."},
    min: {signature: "min(iterable, *, key=None)", doc: "The smallest item (min(a, b, *args, key=…) also works)."},
    max: {signature: "max(iterable, *, key=None)", doc: "The largest item (max(a, b, *args, key=…) also works)."},
    abs: {signature: "abs(x)", doc: "The absolute value of x."},
    round: {signature: "round(number, ndigits=None)", doc: "Round to ndigits precision (ties round to even)."},
    any: {signature: "any(iterable)", doc: "True when any item of iterable is truthy."},
    all: {signature: "all(iterable)", doc: "True when every item of iterable is truthy."},
    iter: {signature: "iter(obj, sentinel=None)", doc: "An iterator over obj (or until sentinel)."},
    next: {signature: "next(iterator, default)", doc: "The next item; default (or StopIteration) at exhaustion."},
    vars: {signature: "vars(obj)", doc: "The __dict__ of obj (the local namespace with no arg)."},
    dir: {signature: "dir(obj)", doc: "A sorted list of valid attribute names of obj."},
    eval: {
        signature: "eval(expression, globals=None, locals=None)",
        doc: "Evaluate the expression string and return the result."
    },
    exec: {signature: "exec(source, globals=None, locals=None)", doc: "Execute the Python code in source dynamically."},
    compile: {
        signature: "compile(source, filename, mode)",
        doc: "Compile source into a code object ('exec', 'eval', 'single')."
    },
    globals: {signature: "globals()", doc: "The module-level namespace dict."},
    locals: {signature: "locals()", doc: "The current local namespace dict."},
    super: {signature: "super()", doc: "A proxy object delegating to the parent class."},
    property: {
        signature: "property(fget=None, fset=None, fdel=None, doc=None)",
        doc: "A descriptor exposing a managed attribute."
    },
    staticmethod: {signature: "staticmethod(function)", doc: "Wrap function so calls skip the instance argument."},
    classmethod: {signature: "classmethod(function)", doc: "Wrap function to receive the class as first argument."},
    type: {signature: "type(obj)", doc: "The type of obj; type(name, bases, dict) makes a class."},
    // ── types ──
    int: {signature: "int(x=0, base=10)", doc: "An integer from a number or a string in the given base."},
    float: {signature: "float(x=0.0)", doc: "A floating-point number from a number or string."},
    bool: {signature: "bool(x=False)", doc: "True or False — the truth value of x."},
    str: {signature: "str(obj='')", doc: "A string; str(obj) renders obj for humans."},
    bytes: {signature: "bytes(iterable_or_int, encoding=…)", doc: "An immutable sequence of bytes."},
    list: {signature: "list(iterable=())", doc: "A mutable sequence; list(iterable) copies its items."},
    tuple: {signature: "tuple(iterable=())", doc: "An immutable sequence of the items."},
    dict: {signature: "dict(mapping_or_iterable, **kwargs)", doc: "A mutable mapping of keys to values."},
    set: {signature: "set(iterable=())", doc: "An unordered collection of unique items."},
    frozenset: {signature: "frozenset(iterable=())", doc: "An immutable, hashable set."},
    // ── common exceptions ──
    Exception: {signature: "Exception(*args)", doc: "The base class for most user-facing exceptions."},
    ValueError: {signature: "ValueError(*args)", doc: "An argument had the right type but a bad value."},
    TypeError: {signature: "TypeError(*args)", doc: "An operation was applied to an object of the wrong type."},
    KeyError: {signature: "KeyError(key)", doc: "A mapping key was missing."},
    IndexError: {signature: "IndexError(*args)", doc: "A sequence subscript was out of range."},
    AttributeError: {signature: "AttributeError(*args)", doc: "An attribute reference or assignment failed."},
    RuntimeError: {signature: "RuntimeError(*args)", doc: "An error that doesn't fit a more specific category."},
    StopIteration: {signature: "StopIteration(value)", doc: "Raised by next() to signal the iterator is exhausted."},
    // ── str methods ──
    join: {signature: "separator.join(iterable)", doc: "Concatenate the strings of iterable with separator between."},
    split: {
        signature: "str.split(sep=None, maxsplit=-1)",
        doc: "A list of words split on sep (whitespace by default)."
    },
    rsplit: {signature: "str.rsplit(sep=None, maxsplit=-1)", doc: "Like split, but splitting from the right."},
    strip: {signature: "str.strip(chars=None)", doc: "A copy with leading/trailing chars (whitespace) removed."},
    replace: {
        signature: "str.replace(old, new, count=-1)",
        doc: "A copy with every (or count) occurrence of old replaced."
    },
    lower: {signature: "str.lower()", doc: "A lowercased copy."},
    upper: {signature: "str.upper()", doc: "An uppercased copy."},
    startswith: {signature: "str.startswith(prefix)", doc: "True when the string starts with prefix (tuple allowed)."},
    endswith: {signature: "str.endswith(suffix)", doc: "True when the string ends with suffix (tuple allowed)."},
    find: {signature: "str.find(sub)", doc: "The lowest index of sub, or -1 when absent."},
    encode: {signature: "str.encode(encoding='utf-8', errors='strict')", doc: "The string encoded to bytes."},
    // ── list methods ──
    append: {signature: "list.append(item)", doc: "Add item to the end of the list."},
    extend: {signature: "list.extend(iterable)", doc: "Append every item of iterable to the list."},
    insert: {signature: "list.insert(index, item)", doc: "Insert item before index."},
    pop: {signature: "list.pop(index=-1)", doc: "Remove and return the item at index (last by default)."},
    remove: {signature: "list.remove(value)", doc: "Remove the first occurrence of value."},
    sort: {signature: "list.sort(*, key=None, reverse=False)", doc: "Sort the list in place."},
    index: {signature: "list.index(value)", doc: "The index of the first occurrence of value."},
    count: {signature: "list.count(value)", doc: "The number of occurrences of value."},
    // ── dict methods ──
    get: {signature: "dict.get(key, default=None)", doc: "The value for key, or default when missing."},
    keys: {signature: "dict.keys()", doc: "A view of the dictionary's keys."},
    values: {signature: "dict.values()", doc: "A view of the dictionary's values."},
    items: {signature: "dict.items()", doc: "A view of the dictionary's (key, value) pairs."},
    update: {signature: "dict.update(other)", doc: "Merge other's keys and values into the dict."},
    // ── shared container methods ──
    clear: {signature: "list.clear()", doc: "Remove all items (also dict, set)."},
    // ── set methods ──
    add: {signature: "set.add(item)", doc: "Add item to the set (a no-op when present)."},
    discard: {signature: "set.discard(item)", doc: "Remove item when present (no KeyError)."},
};

/** A module + the import statement that binds a symbol. */
export interface ImportInfo {
    /** The module the symbol comes from ("matplotlib.pyplot"). */
    module: string;
    /** The statement to insert ("import matplotlib.pyplot as plt"). */
    statement: string;
}

/** Curated symbol → import map — the names the example gallery and
 * common scripts reach for (stdlib + numpy/pandas/matplotlib/
 * requests + the scipy/sklearn surfaces the examples use). */
const PYTHON_IMPORTS: Record<string, ImportInfo> = {
    // ── third-party aliases ──
    np: {module: "numpy", statement: "import numpy as np"},
    numpy: {module: "numpy", statement: "import numpy"},
    pd: {module: "pandas", statement: "import pandas as pd"},
    pandas: {module: "pandas", statement: "import pandas"},
    plt: {module: "matplotlib.pyplot", statement: "import matplotlib.pyplot as plt"},
    requests: {module: "requests", statement: "import requests"},
    // ── stdlib ──
    math: {module: "math", statement: "import math"},
    json: {module: "json", statement: "import json"},
    os: {module: "os", statement: "import os"},
    sys: {module: "sys", statement: "import sys"},
    re: {module: "re", statement: "import re"},
    random: {module: "random", statement: "import random"},
    time: {module: "time", statement: "import time"},
    datetime: {module: "datetime", statement: "from datetime import datetime"},
    date: {module: "datetime", statement: "from datetime import date"},
    timedelta: {module: "datetime", statement: "from datetime import timedelta"},
    timezone: {module: "datetime", statement: "from datetime import timezone"},
    collections: {module: "collections", statement: "import collections"},
    Counter: {module: "collections", statement: "from collections import Counter"},
    deque: {module: "collections", statement: "from collections import deque"},
    defaultdict: {module: "collections", statement: "from collections import defaultdict"},
    namedtuple: {module: "collections", statement: "from collections import namedtuple"},
    Path: {module: "pathlib", statement: "from pathlib import Path"},
    pathlib: {module: "pathlib", statement: "import pathlib"},
    itertools: {module: "itertools", statement: "import itertools"},
    permutations: {module: "itertools", statement: "from itertools import permutations"},
    groupby: {module: "itertools", statement: "from itertools import groupby"},
    functools: {module: "functools", statement: "import functools"},
    reduce: {module: "functools", statement: "from functools import reduce"},
    lru_cache: {module: "functools", statement: "from functools import lru_cache"},
    partial: {module: "functools", statement: "from functools import partial"},
    statistics: {module: "statistics", statement: "import statistics"},
    st: {module: "statistics", statement: "import statistics as st"},
    NormalDist: {module: "statistics", statement: "from statistics import NormalDist"},
    logging: {module: "logging", statement: "import logging"},
    argparse: {module: "argparse", statement: "import argparse"},
    sqlite3: {module: "sqlite3", statement: "import sqlite3"},
    csv: {module: "csv", statement: "import csv"},
    hashlib: {module: "hashlib", statement: "import hashlib"},
    hmac: {module: "hmac", statement: "import hmac"},
    secrets: {module: "secrets", statement: "import secrets"},
    zlib: {module: "zlib", statement: "import zlib"},
    io: {module: "io", statement: "import io"},
    StringIO: {module: "io", statement: "from io import StringIO"},
    heapq: {module: "heapq", statement: "import heapq"},
    traceback: {module: "traceback", statement: "import traceback"},
    warnings: {module: "warnings", statement: "import warnings"},
    unittest: {module: "unittest", statement: "import unittest"},
    doctest: {module: "doctest", statement: "import doctest"},
    asyncio: {module: "asyncio", statement: "import asyncio"},
    threading: {module: "threading", statement: "import threading"},
    textwrap: {module: "textwrap", statement: "import textwrap"},
    unicodedata: {module: "unicodedata", statement: "import unicodedata"},
    calendar: {module: "calendar", statement: "import calendar"},
    tempfile: {module: "tempfile", statement: "import tempfile"},
    glob: {module: "glob", statement: "import glob"},
    shutil: {module: "shutil", statement: "import shutil"},
    pickle: {module: "pickle", statement: "import pickle"},
    copy: {module: "copy", statement: "import copy"},
    pprint: {module: "pprint", statement: "import pprint"},
    base64: {module: "base64", statement: "import base64"},
    uuid: {module: "uuid", statement: "import uuid"},
    bisect: {module: "bisect", statement: "import bisect"},
    struct: {module: "struct", statement: "import struct"},
    socket: {module: "socket", statement: "import socket"},
    // ── typing / dataclasses ──
    dataclass: {module: "dataclasses", statement: "from dataclasses import dataclass"},
    field: {module: "dataclasses", statement: "from dataclasses import field"},
    Callable: {module: "typing", statement: "from typing import Callable"},
    Optional: {module: "typing", statement: "from typing import Optional"},
    List: {module: "typing", statement: "from typing import List"},
    Dict: {module: "typing", statement: "from typing import Dict"},
    Tuple: {module: "typing", statement: "from typing import Tuple"},
    Any: {module: "typing", statement: "from typing import Any"},
    TypeVar: {module: "typing", statement: "from typing import TypeVar"},
    Protocol: {module: "typing", statement: "from typing import Protocol"},
    // ── scipy / sklearn surfaces used by the examples ──
    scipy: {module: "scipy", statement: "import scipy"},
    ndimage: {module: "scipy", statement: "from scipy import ndimage"},
    stats: {module: "scipy", statement: "from scipy import stats"},
    norm: {module: "scipy.stats", statement: "from scipy.stats import norm"},
    expit: {module: "scipy.special", statement: "from scipy.special import expit"},
    minimize: {module: "scipy.optimize", statement: "from scipy.optimize import minimize"},
    LogisticRegression: {
        module: "sklearn.linear_model",
        statement: "from sklearn.linear_model import LogisticRegression"
    },
    train_test_split: {
        module: "sklearn.model_selection",
        statement: "from sklearn.model_selection import train_test_split"
    },
    cross_val_score: {
        module: "sklearn.model_selection",
        statement: "from sklearn.model_selection import cross_val_score"
    },
    StratifiedKFold: {
        module: "sklearn.model_selection",
        statement: "from sklearn.model_selection import StratifiedKFold"
    },
    RandomForestClassifier: {
        module: "sklearn.ensemble",
        statement: "from sklearn.ensemble import RandomForestClassifier"
    },
    StandardScaler: {module: "sklearn.preprocessing", statement: "from sklearn.preprocessing import StandardScaler"},
    Pipeline: {module: "sklearn.pipeline", statement: "from sklearn.pipeline import Pipeline"},
    make_pipeline: {module: "sklearn.pipeline", statement: "from sklearn.pipeline import make_pipeline"},
    KNeighborsClassifier: {
        module: "sklearn.neighbors",
        statement: "from sklearn.neighbors import KNeighborsClassifier"
    },
    DecisionTreeClassifier: {module: "sklearn.tree", statement: "from sklearn.tree import DecisionTreeClassifier"},
    IsotonicRegression: {module: "sklearn.isotonic", statement: "from sklearn.isotonic import IsotonicRegression"},
    // ── misc ──
    HTMLParser: {module: "html.parser", statement: "from html.parser import HTMLParser"},
    urlopen: {module: "urllib.request", statement: "from urllib.request import urlopen"},
};

/** Keywords per FileKind (the same kind ids file-viewer routes on). */
const KW: Record<string, string[]> = {
    // Python (E19): the curated keywords + every builtin/method name in
    // the table above, so keywordsForKind("python") surfaces both.
    python: [...PYTHON_KEYWORDS, ...Object.keys(PYTHON_BUILTINS)],
    javascript: [
        "async", "await", "break", "case", "catch", "class", "const", "continue",
        "default", "delete", "do", "else", "export", "extends", "finally", "for",
        "function", "if", "import", "in", "instanceof", "let", "new", "null",
        "of", "return", "super", "switch", "this", "throw", "try", "typeof",
        "undefined", "var", "void", "while", "yield", "true", "false",
        "console", "document", "window", "Math", "JSON", "Promise", "Array",
        "Object", "String", "Number", "Boolean", "Map", "Set", "Symbol",
    ],
    typescript: [
        "abstract", "any", "as", "asserts", "async", "await", "boolean", "break",
        "case", "catch", "class", "const", "continue", "declare", "default",
        "delete", "do", "else", "enum", "export", "extends", "finally", "for",
        "from", "function", "if", "implements", "import", "in", "infer",
        "instanceof", "interface", "is", "keyof", "let", "namespace", "never",
        "new", "null", "number", "object", "of", "package", "private",
        "protected", "public", "readonly", "return", "satisfies", "string",
        "super", "switch", "symbol", "this", "throw", "try", "type", "typeof",
        "undefined", "union", "unknown", "var", "void", "while", "yield",
        "console", "document", "window", "Math", "JSON", "Promise", "Array",
        "Object", "String", "Number", "Boolean", "Map", "Set", "Date",
    ],
    css: [
        "align-items", "background", "border", "bottom", "box-sizing", "color",
        "cursor", "display", "flex", "flex-direction", "flex-wrap", "float",
        "font", "font-family", "font-size", "font-weight", "gap", "grid",
        "grid-template-columns", "height", "justify-content", "left", "line-height",
        "margin", "margin-bottom", "margin-left", "margin-right", "margin-top",
        "max-width", "min-width", "opacity", "overflow", "padding", "position",
        "right", "text-align", "text-decoration", "top", "transform", "transition",
        "width", "z-index", "important", "important", "auto", "inherit", "none",
        "absolute", "relative", "fixed", "sticky", "static", "flex", "grid",
        "block", "inline-block", "center", "pointer", "root", "var", "calc",
        "em", "rem", "px", "vh", "vw", "hover", "focus", "active", "first-child",
        "last-child", "not", "nth-child", "before", "after",
    ],
    html: [
        "div", "span", "class", "href", "src", "alt", "title", "id", "style",
        "script", "link", "meta", "head", "body", "header", "footer", "section",
        "article", "nav", "button", "input", "form", "label", "table", "thead",
        "tbody", "tr", "td", "th", "ul", "ol", "li", "img", "video", "audio",
        "iframe", "canvas", "svg", "template", "slot", "data-", "aria-",
        "role", "charset", "viewport", "stylesheet", "module", "defer", "async",
    ],
    sql: [
        "select", "from", "where", "group", "order", "by", "having", "insert",
        "into", "values", "update", "set", "delete", "create", "table", "alter",
        "drop", "index", "view", "join", "inner", "left", "right", "outer",
        "full", "cross", "on", "as", "and", "or", "not", "in", "is", "null",
        "like", "between", "exists", "case", "when", "then", "else", "end",
        "distinct", "limit", "offset", "union", "all", "primary", "key",
        "foreign", "references", "unique", "default", "check", "constraint",
        "begin", "commit", "rollback", "transaction", "explain", "analyze",
        "vacuum", "with", "recursive", "asc", "desc", "count", "sum", "avg",
        "min", "max", "cast", "coalesce", "nullif", "exists",
    ],
    shell: [
        "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while",
        "until", "case", "esac", "function", "return", "break", "continue",
        "local", "export", "readonly", "declare", "unset", "shift", "eval",
        "exec", "trap", "exit", "source", "alias", "set", "echo", "printf",
        "read", "cd", "pwd", "ls", "grep", "sed", "awk", "cat", "cut", "sort",
        "uniq", "head", "tail", "find", "xargs", "test", "chmod", "chown",
        "mkdir", "rm", "cp", "mv", "ln", "touch", "which", "env",
    ],
    r: [
        "if", "else", "for", "while", "repeat", "function", "in", "next",
        "break", "return", "TRUE", "FALSE", "NULL", "NA", "Inf", "NaN", "library",
        "require", "data.frame", "list", "matrix", "vector", "c", "seq", "rep",
        "length", "names", "colnames", "rownames", "head", "tail", "summary",
        "print", "plot", "ggplot", "aes", "geom_line", "geom_point", "dplyr",
        "filter", "select", "mutate", "group_by", "summarise", "arrange", "merge",
        "read.csv", "write.csv", "apply", "sapply", "lapply", "tapply",
    ],
    matlab: [
        "function", "end", "if", "else", "elseif", "switch", "case", "otherwise",
        "for", "while", "break", "continue", "return", "try", "catch", "global",
        "persistent", "clear", "clc", "close", "disp", "fprintf", "zeros", "ones",
        "eye", "rand", "randn", "linspace", "logspace", "length", "size", "numel",
        "reshape", "squeeze", "plot", "subplot", "figure", "hold", "grid", "xlabel",
        "ylabel", "title", "legend", "cell", "struct", "fieldnames", "num2str",
        "str2num", "sprintf", "input", "exist", "isnan", "isinf",
    ],
    java: [
        "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
        "class", "const", "continue", "default", "do", "double", "else", "enum",
        "extends", "final", "finally", "float", "for", "goto", "if", "implements",
        "import", "instanceof", "int", "interface", "long", "native", "new",
        "package", "private", "protected", "public", "return", "short", "static",
        "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
        "transient", "try", "void", "volatile", "while", "true", "false", "null",
        "String", "Integer", "Boolean", "Double", "Float", "Long", "Object",
        "System", "out", "println", "print", "ArrayList", "HashMap", "List",
        "Map", "Set", "Optional", "Stream", "record", "var", "yield",
    ],
    c: [
        "auto", "break", "case", "char", "const", "continue", "default", "do",
        "double", "else", "enum", "extern", "float", "for", "goto", "if", "int",
        "long", "register", "return", "short", "signed", "sizeof", "static",
        "struct", "switch", "typedef", "union", "unsigned", "void", "volatile",
        "while", "NULL", "true", "false", "include", "define", "ifdef", "ifndef",
        "endif", "printf", "scanf", "malloc", "calloc", "realloc", "free",
        "memcpy", "memset", "strlen", "strcmp", "strcpy", "fopen", "fclose",
        "fprintf", "fscanf", "exit", "size_t", "FILE", "stdout", "stderr",
    ],
    cpp: [
        "alignas", "alignof", "auto", "bool", "break", "case", "catch", "char",
        "class", "const", "constexpr", "continue", "decltype", "default",
        "delete", "do", "double", "else", "enum", "explicit", "export",
        "extern", "float", "for", "friend", "goto", "if", "inline", "int",
        "long", "mutable", "namespace", "new", "noexcept", "nullptr",
        "operator", "private", "protected", "public", "register", "return",
        "short", "signed", "sizeof", "static", "struct", "switch", "template",
        "this", "throw", "true", "false", "try", "typedef", "typename", "union",
        "unsigned", "using", "virtual", "void", "volatile", "while", "include",
        "std", "vector", "string", "map", "set", "pair", "unique_ptr",
        "shared_ptr", "make_unique", "make_shared", "cout", "cin", "endl",
    ],
    ruby: [
        "begin", "end", "def", "class", "module", "if", "elsif", "else", "unless",
        "while", "until", "for", "in", "do", "then", "case", "when", "rescue",
        "ensure", "yield", "return", "break", "next", "redo", "retry", "self",
        "super", "nil", "true", "false", "and", "or", "not", "alias", "attr",
        "attr_accessor", "attr_reader", "attr_writer", "require", "require_relative",
        "puts", "print", "p", "lambda", "proc", "raise", "throw", "catch",
        "each", "map", "select", "reject", "reduce", "inject", "include",
        "extend", "new", "to_s", "to_i", "to_f", "length", "size", "empty",
    ],
    php: [
        "abstract", "and", "array", "as", "break", "callable", "case", "catch",
        "class", "clone", "const", "continue", "declare", "default", "do", "echo",
        "else", "elseif", "empty", "enddeclare", "endforeach", "endif", "extends",
        "final", "finally", "fn", "for", "foreach", "function", "global", "goto",
        "if", "implements", "include", "instanceof", "insteadof", "interface",
        "isset", "list", "namespace", "new", "null", "print", "private",
        "protected", "public", "require", "return", "static", "switch", "throw",
        "trait", "try", "unset", "use", "var", "while", "yield", "true",
        "false", "int", "float", "string", "bool", "void", "mixed",
    ],
    go: [
        "break", "case", "chan", "const", "continue", "default", "defer", "else",
        "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
        "map", "package", "range", "return", "select", "struct", "switch",
        "type", "var", "nil", "true", "false", "iota", "append", "cap", "close",
        "complex", "copy", "delete", "imag", "len", "make", "new", "panic",
        "print", "println", "real", "recover", "error", "string", "int",
        "int64", "float64", "bool", "byte", "rune", "fmt", "Println", "Printf",
        "Sprintf", "err", "ok",
    ],
    lua: [
        "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
        "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
        "then", "true", "until", "while", "print", "require", "pcall",
        "ipairs", "pairs", "tonumber", "tostring", "type", "table", "string",
        "math", "os", "io", "self", "concat", "insert", "remove", "sort",
    ],
    perl: [
        "my", "our", "local", "use", "no", "package", "sub", "if", "elsif",
        "else", "unless", "while", "until", "for", "foreach", "do", "last",
        "next", "redo", "return", "given", "when", "default", "try", "catch",
        "finally", "def", "print", "printf", "say", "push", "pop", "shift",
        "unshift", "keys", "values", "each", "map", "grep", "sort", "reverse",
        "join", "split", "chomp", "chop", "defined", "exists", "delete", "die",
        "warn", "open", "close", "print", "STDIN", "STDOUT", "STDERR",
    ],
    rust: [
        "as", "async", "await", "break", "const", "continue", "crate", "dyn",
        "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in",
        "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
        "self", "Self", "static", "struct", "super", "trait", "true", "type",
        "unsafe", "use", "where", "while", "Some", "None", "Ok", "Err", "Option",
        "Result", "Vec", "String", "HashMap", "println", "print", "format",
        "unwrap", "expect", "derive", "box", "vec",
    ],
    julia: [
        "function", "end", "if", "elseif", "else", "for", "while", "begin",
        "do", "try", "catch", "finally", "return", "break", "continue",
        "struct", "mutable", "abstract", "type", "primitive", "in", "isa",
        "let", "local", "global", "const", "using", "import", "export",
        "module", "baremodule", "quote", "true", "false", "nothing", "missing",
        "println", "print", "push", "pop", "length", "size", "getindex",
        "setindex", "append", "vcat", "hcat", "zeros", "ones", "rand", "map",
        "filter", "reduce", "foldl", "foldr", "sum", "prod", "minimum",
        "maximum", "sort", "sortperm", "unique", "findall", "findfirst",
    ],
    kotlin: [
        "as", "break", "class", "continue", "do", "else", "false", "for", "fun",
        "if", "in", "interface", "is", "null", "object", "package", "return",
        "super", "this", "throw", "true", "try", "typealias", "val", "var",
        "when", "while", "by", "get", "set", "import", "init", "constructor",
        "companion", "suspend", "data", "sealed", "enum", "annotation", "lateinit",
        "override", "open", "abstract", "internal", "private", "protected",
        "public", "inline", "reified", "crossinline", "noinline",
    ],
    swift: [
        "associatedtype", "class", "deinit", "enum", "extension", "fileprivate",
        "func", "import", "init", "inout", "internal", "let", "open", "operator",
        "private", "protocol", "public", "rethrows", "static", "struct",
        "subscript", "typealias", "var", "break", "case", "continue",
        "default", "defer", "do", "else", "fallthrough", "for", "guard", "if",
        "in", "repeat", "return", "where", "while", "as", "any", "catch",
        "is", "nil", "super", "self", "Self", "throw", "throws", "try", "await",
        "true", "false", "some", "print", "String", "Int", "Double", "Bool",
        "Array", "Dictionary", "Set", "Optional",
    ],
    powershell: [
        "begin", "break", "catch", "class", "continue", "data", "define", "do",
        "dynamicparam", "else", "elseif", "end", "enum", "exit", "filter",
        "finally", "for", "foreach", "from", "function", "if", "in", "param",
        "process", "return", "switch", "throw", "trap", "try", "until", "using",
        "var", "while", "Write-Host", "Write-Output", "Write-Error",
        "Get-ChildItem", "Get-Content", "Set-Content", "Get-Item", "Set-Item",
        "New-Item", "Remove-Item", "Test-Path", "Join-Path", "ForEach-Object",
        "Where-Object", "Select-Object", "Sort-Object", "Measure-Object",
    ],
    batch: [
        "echo", "off", "on", "rem", "set", "setlocal", "endlocal", "if",
        "else", "for", "goto", "call", "exit", "pause", "cls", "del", "copy",
        "move", "ren", "md", "rd", "dir", "type", "find", "findstr", "sort",
        "shift", "start", "title", "color", "prompt", "pushd", "popd", "not",
        "exist", "defined", "errorlevel", "nul", "con", "prn", "goto", "chcp",
    ],
    zig: [
        "addrspace", "align", "allowzero", "and", "anyframe", "anytype", "asm",
        "async", "await", "break", "callconv", "catch", "comptime", "const",
        "continue", "defer", "disalign", "else", "enum", "errdefer", "error",
        "export", "extern", "fn", "for", "if", "inline", "noalias", "nosuspend",
        "noinline", "opaque", "or", "orelse", "pack", "packed", "pub", "resume",
        "return", "linksection", "struct", "suspend", "switch", "test", "threadlocal",
        "try", "union", "unreachable", "usingnamespace", "var", "volatile",
        "while", "null", "undefined", "true", "false", "u8", "u16", "u32",
        "u64", "i8", "i16", "i32", "i64", "f32", "f64", "usize", "isize",
        "bool", "void", "noreturn", "type", "anyerror", "std", "debug", "print",
    ],
    dart: [
        "abstract", "as", "assert", "async", "await", "break", "case", "catch",
        "class", "const", "continue", "covariant", "default", "deferred", "do",
        "dynamic", "else", "enum", "export", "extends", "extension", "external",
        "factory", "false", "final", "finally", "for", "get", "hide", "if",
        "implements", "import", "in", "interface", "is", "late", "library",
        "mixin", "new", "null", "on", "operator", "part", "required", "rethrow",
        "return", "set", "show", "static", "super", "switch", "sync", "this",
        "throw", "true", "try", "typedef", "var", "void", "while", "with",
        "yield", "print", "int", "double", "String", "bool", "List", "Map",
        "Set", "Iterable", "Future", "Stream",
    ],
    groovy: [
        "as", "assert", "break", "case", "catch", "class", "const", "continue",
        "def", "default", "do", "else", "enum", "extends", "final", "finally",
        "for", "goto", "if", "implements", "import", "in", "instanceof",
        "interface", "new", "package", "return", "static", "super", "switch",
        "synchronized", "this", "throw", "throws", "trait", "transient",
        "try", "void", "volatile", "while", "true", "false", "null", "it",
        "println", "print", "each", "collect", "find", "findAll", "inject",
        "eachWithIndex", "times", "step", "upto", "downto", "size", "length",
    ],
    scala: [
        "abstract", "case", "catch", "class", "def", "do", "else", "extends",
        "false", "final", "finally", "for", "forSome", "if", "implicit",
        "import", "lazy", "match", "new", "null", "object", "override",
        "package", "private", "protected", "return", "sealed", "super", "this",
        "throw", "trait", "true", "try", "type", "val", "var", "while", "with",
        "yield", "Unit", "Int", "Long", "Double", "Float", "Short", "Byte",
        "Char", "Boolean", "String", "Some", "None", "Option", "Either",
        "List", "Seq", "Map", "Set", "println", "print", "foreach", "map",
        "flatMap", "filter", "foldLeft", "foldRight", "zipWithIndex",
    ],
    elixir: [
        "def", "defmodule", "defmacro", "defstruct", "defprotocol",
        "defimpl", "defdelegate", "defguard", "defoverridable", "defexception",
        "defcallback", "defstruct", "do", "end", "else", "elseif", "if",
        "unless", "case", "cond", "with", "for", "when", "and", "or", "not",
        "in", "true", "false", "nil", "fn", "import", "require", "use",
        "alias", "quote", "unquote", "receive", "send", "spawn", "self",
        "super", "raise", "throw", "rescue", "catch", "after", "try",
        "unquote_splicing", "IO", "puts", "inspect", "length", "size",
        "enum", "map", "filter", "reduce", "each", "into", "String",
    ],
    haskell: [
        "case", "class", "data", "default", "deriving", "do", "else", "foreign",
        "if", "import", "in", "infix", "infixl", "infixr", "instance", "let",
        "module", "newtype", "of", "then", "type", "where", "mdo", "rec",
        "forall", "hiding", "qualified", "pattern", "family", "stock",
        "anyclass", "via", "static", "undefined", "error", "otherwise",
        "True", "False", "Just", "Nothing", "Maybe", "Either", "Left", "Right",
        "IO", "putStrLn", "putStr", "print", "show", "read", "map", "filter",
        "foldr", "foldl", "zip", "unzip", "length", "concat", "head", "tail",
        "init", "last", "elem", "notElem", "null", "reverse", "take", "drop",
    ],
    erlang: [
        "module", "export", "import", "compile", "behaviour", "record",
        "define", "include", "include_lib", "ifdef", "ifndef", "else", "endif",
        "case", "of", "end", "if", "when", "fun", "receive", "after", "try",
        "catch", "throw", "exit", "error", "begin", "query", "spec", "type",
        "callback", "optional_callbacks", "opaque", "maybe", "else", "and",
        "andalso", "or", "orelse", "xor", "not", "div", "rem", "bnot", "band",
        "bor", "bxor", "bsl", "bsr", "true", "false", "ok", "undefined",
        "spawn", "self", "send", "receive", "io", "format", "lists", "maps",
        "proplists", "application", "gen_server", "supervisor",
    ],
    clojure: [
        "def", "defn", "defn-", "defmacro", "defonce", "defmulti", "defmethod",
        "defstruct", "defprotocol", "defrecord", "deftype", "definterface",
        "declare", "let", "letfn", "loop", "recur", "if", "if-let", "if-not",
        "if-some", "when", "when-let", "when-not", "when-some", "when-first",
        "cond", "condp", "case", "do", "doseq", "dotimes", "doseq", "doto",
        "and", "or", "not", "true", "false", "nil", "fn", "map", "filter",
        "reduce", "remove", "take", "drop", "concat", "into", "assoc",
        "dissoc", "get", "get-in", "assoc-in", "update", "update-in", "print",
        "println", "prn", "str", "name", "keyword", "symbol", "require",
        "import", "use", "ns", "refer-clojure", "throw", "try", "catch",
        "finally", "finally", "atom", "deref", "reset", "swap",
    ],
    ocaml: [
        "and", "as", "assert", "begin", "class", "constraint", "do", "done",
        "downto", "else", "end", "exception", "external", "false", "for",
        "fun", "function", "functor", "if", "in", "include", "inherit",
        "initializer", "let", "match", "method", "module", "mutable", "new",
        "object", "of", "open", "or", "private", "rec", "sig", "struct",
        "then", "to", "true", "try", "type", "val", "virtual", "when",
        "while", "with", "ref", "Printf", "printf", "print_string",
        "print_endline", "print_int", "print_float", "read_line", "Some",
        "None", "Ok", "Error", "List", "Array", "String", "Hashtbl", "Map",
    ],
    fsharp: [
        "abstract", "and", "as", "assert", "base", "begin", "class", "default",
        "delegate", "do", "done", "downcast", "downto", "elif", "else", "end",
        "exception", "extern", "false", "finally", "fixed", "for", "fun",
        "function", "global", "if", "in", "inherit", "inline", "interface",
        "internal", "let", "let!", "match", "member", "module", "mutable",
        "namespace", "new", "not", "null", "of", "open", "or", "override",
        "private", "public", "rec", "return!", "return", "select", "static",
        "struct", "then", "to", "true", "try", "type", "upcast", "use", "use!",
        "val", "void", "when", "while", "with", "yield", "yield!", "Some",
        "None", "Ok", "Error", "printfn", "printf", "sprintf", "List", "Array",
        "Map", "Set", "Seq", "String", "ignore", "failwith",
    ],
    graphql: [
        "query", "mutation", "subscription", "fragment", "on", "type", "input",
        "enum", "interface", "union", "scalar", "schema", "directive", "extend",
        "implements", "true", "false", "null", "as", "repeatable", "Int",
        "Float", "String", "Boolean", "ID", "__schema", "__type", "__typename",
        "__directive", "__deprecated", "__specifiedBy", "include", "skip",
    ],
    json: [
        "true", "false", "null", "string", "number", "boolean", "object",
        "array", "integer", "float", "required", "properties", "items",
        "definitions", "$schema", "$ref", "$id", "$comment", "const", "enum",
        "default", "title", "description", "format", "pattern", "minimum",
        "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
        "minLength", "maxLength", "minItems", "maxItems", "uniqueItems",
        "minProperties", "maxProperties", "additionalProperties", "allOf",
        "anyOf", "oneOf", "not", "if", "then", "else", "contains",
    ],
    yaml: [
        "true", "false", "null", "yes", "no", "on", "off", "null", "~",
        "version", "services", "volumes", "networks", "jobs", "steps", "uses",
        "with", "needs", "image", "build", "ports", "environment", "depends_on",
        "command", "entrypoint", "restart", "deploy", "replicas", "resources",
        "strategy", "matrix", "runs-on", "checkout", "cache", "upload-artifact",
        "download-artifact", "setup-node", "setup-python", "apiVersion", "kind",
        "metadata", "spec", "containers", "replicas", "selector", "labels",
        "annotations", "configMap", "secret", "ingress", "tls", "secrets",
    ],
    toml: [
        "true", "false", "inf", "nan", "dependencies", "dev-dependencies",
        "package", "name", "version", "authors", "edition", "license",
        "repository", "description", "keywords", "categories", "features",
        "build", "profile", "release", "debug", "toolchains", "target",
        "source", "binaries", "bin", "lib", "doc", "example", "test",
        "bench", "workspace", "members", "exclude", "replace", "patch",
        "default", "features", "optional", "path", "git", "branch", "tag",
        "rev", "inline_tables", "array_of_tables", "date", "time", "offset",
    ],
    markdown: [
        "http", "https", "mailto", "ftp", "title", "alt", "src", "href", "width",
        "height", "style", "class", "id", "target", "rel", "noopener",
        "noreferrer", "code", "lang", "language", "highlight", "lineno",
        "table", "thead", "tbody", "list", "checkbox", "checked", "disabled",
        "badge", "shield", "npm", "github", "gitlab", "pypi", "crates",
        "docker", "hub", "actions", "workflow", "runs-on", "needs", "uses",
    ],
    text: [],
    log: [],
};

/** The keyword table for a kind (empty list for plain text/log). */
export function keywordsForKind(kind: string): string[] {
    return KW[kind] ?? [];
}

/** Words (identifier-ish runs) in the document, unique, longest-first.
 * Capped so a huge file stays cheap; the current word is excluded by
 * the caller (it passes the prefix). */
export function collectDocumentWords(text: string, cap = 2000): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const re = /[A-Za-z_][A-Za-z0-9_$-]{2,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && out.length < cap) {
        const w = m[0];
        if (!seen.has(w)) {
            seen.add(w);
            out.push(w);
        }
    }
    return out;
}

/* ═══ The candidate model + the fuzzy/rank matcher (E19) ══════════
 * Every candidate carries a LABEL (the word shown/inserted) and a
 * SOURCE (the popup chip). The Python path additionally fills the
 * optional fields: `detail` (a one-line signature), `documentation`
 * (a doc snippet), `insertText`/`hasTabstops` (snippet bodies with
 * VS Code-style tabstops — the same $0/$1/${n:default} syntax
 * code-viewer's Tab expansion parses), `importModule` (an
 * auto-import hint), and — when the host asks — `score` +
 * `matchSpans` (the matched character ranges, for highlighting). */

/** Where a candidate came from — rendered as a small chip. */
export type CompletionSource =
    | "keyword" // the language's keyword table
    | "document" // a word already in the buffer
    | "builtin" // the curated Python builtin/method table
    | "local" // a name defined in this document (def/assignment/import)
    | "module" // a curated importable module symbol
    | "snippet"; // a host snippet trigger

/** A matched character range [start, end) inside `label`. */
export interface CompletionMatchSpan {
    start: number;
    end: number;
}

/** Extra matcher behavior the host can request. */
export interface CompletionMatchOptions {
    /** Attach `score` (match quality, higher = better) to each item. */
    withScore?: boolean;
    /** Attach `matchSpans` (the matched label characters) to each item. */
    withSpans?: boolean;
    /** Allow subsequence ("fuzzy") matches — default true. */
    fuzzy?: boolean;
}

/** A ranked completion candidate. */
export interface CompletionCandidate {
    /** The word to insert (also the popup's label). */
    label: string;
    /** Where it came from — the popup shows a small chip. */
    source: CompletionSource;
    /** One-line signature, e.g. "print(*values, sep=' ')" — or the def
     *  line for document symbols (LSP "detail"). */
    detail?: string;
    /** Doc snippet — the builtin doc's first line or the def's
     *  docstring (LSP "documentation"). */
    documentation?: string;
    /** The text to INSERT when it differs from `label` (snippet
     *  bodies). Hosts replace the typed prefix with this verbatim. */
    insertText?: string;
    /** True when `insertText` contains VS Code-style tabstops
     *  ($0, $1, ${n:default}) the host can expand and cycle. */
    hasTabstops?: boolean;
    /** The module to auto-import when this item is accepted (the
     *  `importFor`/`ensureImport` symbol) — e.g. "numpy" for "np". */
    importModule?: string;
    /** Match quality, higher = better (attached on request). */
    score?: number;
    /** Matched character spans in `label` (attached on request). */
    matchSpans?: CompletionMatchSpan[];
}

/* ─── the matcher core ───────────────────────────────────────────
 * Tiers (lower = better):  0 exact-case prefix → 1 case-insensitive
 * prefix → 2 word-boundary prefix (a snake_case / kebab-case /
 * camelCase segment starts with the query) → 3 substring → 4
 * subsequence ("prnt" ⊂ "print", "dbcn" ⊂ "db_connect"). Within a
 * tier the POOL order (preference) decides, then — on the Python
 * path — the shorter label; the generic path keeps pool insertion
 * order (its existing tests pin that ordering). */

const TIER_EXACT_PREFIX = 0;
const TIER_CI_PREFIX = 1;
const TIER_WORD_BOUNDARY = 2;
const TIER_SUBSTRING = 3;
const TIER_SUBSEQUENCE = 4;

interface LabelMatch {
    tier: number;
    spans: CompletionMatchSpan[];
}

/** Segment-start positions in a label ("db_connect" → [0, 3]). */
function wordBoundaries(label: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < label.length; i++) {
        if (i === 0) {
            out.push(0);
            continue;
        }
        const prev = label[i - 1];
        const ch = label[i];
        if (
            prev === "_" ||
            prev === "-" ||
            prev === " " ||
            prev === "." ||
            (ch >= "A" && ch <= "Z" && /[a-z0-9]/.test(prev)) // camelCase hump
        ) {
            out.push(i);
        }
    }
    return out;
}

/** Greedy leftmost subsequence: the label indices matching each query
 * char (case-insensitive), or null when the query doesn't match. */
function subsequenceIndices(query: string, label: string): number[] | null {
    const idx: number[] = [];
    let from = 0;
    for (let i = 0; i < query.length; i++) {
        const at = label.indexOf(query[i], from);
        if (at === -1) return null;
        idx.push(at);
        from = at + 1;
    }
    return idx;
}

/** Coalesce consecutive matched indices into [start, end) spans. */
function coalesceSpans(indices: number[]): CompletionMatchSpan[] {
    const spans: CompletionMatchSpan[] = [];
    let start = indices[0];
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === prev + 1) {
            prev = indices[i];
            continue;
        }
        spans.push({start, end: prev + 1});
        start = indices[i];
        prev = indices[i];
    }
    spans.push({start, end: prev + 1});
    return spans;
}

/** The best tier at which `label` matches `prefix` (+ the spans). */
function matchLabel(prefix: string, label: string, fuzzy: boolean): LabelMatch | null {
    if (!prefix || label.length < prefix.length) return null;
    if (label.startsWith(prefix)) {
        return {tier: TIER_EXACT_PREFIX, spans: [{start: 0, end: prefix.length}]};
    }
    const lower = prefix.toLowerCase();
    const labelLower = label.toLowerCase();
    if (labelLower.startsWith(lower)) {
        return {tier: TIER_CI_PREFIX, spans: [{start: 0, end: prefix.length}]};
    }
    for (const p of wordBoundaries(label)) {
        if (labelLower.slice(p, p + lower.length) === lower) {
            return {tier: TIER_WORD_BOUNDARY, spans: [{start: p, end: p + lower.length}]};
        }
    }
    const at = labelLower.indexOf(lower);
    if (at >= 0) {
        return {tier: TIER_SUBSTRING, spans: [{start: at, end: at + lower.length}]};
    }
    // Fuzzy subsequence — only for 3+ char queries (1–2 char
    // subsequences would flood the list with noise).
    if (fuzzy && prefix.length >= 3) {
        const idx = subsequenceIndices(lower, labelLower);
        if (idx) return {tier: TIER_SUBSEQUENCE, spans: coalesceSpans(idx)};
    }
    return null;
}

/** The numeric match quality: tier ≫ pool preference ≫ label brevity
 * ≫ (fuzzy tier only) span compactness. Bigger is better; the exact
 * number is opaque, only its ORDERING is meaningful. */
function matchScore(
    prefix: string,
    tier: number,
    pref: number,
    spans: CompletionMatchSpan[],
    label: string
): number {
    const tierScore = (TIER_SUBSEQUENCE + 1 - tier) * 1_000_000;
    const preference = (9 - Math.min(pref, 8)) * 10_000;
    const brevity = Math.max(0, 500 - label.length);
    let compact = 0;
    if (tier === TIER_SUBSEQUENCE && spans.length > 0) {
        const first = spans[0].start;
        const last = spans[spans.length - 1].end;
        compact = Math.round((prefix.length / Math.max(1, last - first)) * 500);
    }
    return tierScore + preference + brevity + compact;
}

interface RankOptions {
    limit: number;
    /** Python path: same tier + pool → shorter label first. Generic
     *  path: keep pool insertion order (pinned by existing tests). */
    shorterFirst: boolean;
    withScore: boolean;
    withSpans: boolean;
    fuzzy: boolean;
}

/** Match every pool item against `prefix`, dedupe by label (earlier
 * pools win — pools are passed in preference order), rank by tier →
 * pool → (length) → insertion order, and cap at `limit`. */
function rankCandidates(
    prefix: string,
    pools: CompletionCandidate[][],
    opts: RankOptions
): CompletionCandidate[] {
    const seen = new Set<string>();
    const rows: Array<{
        cand: CompletionCandidate;
        tier: number;
        pref: number;
        order: number;
        spans: CompletionMatchSpan[];
    }> = [];
    let order = 0;
    for (let pref = 0; pref < pools.length; pref++) {
        for (const cand of pools[pref]) {
            if (seen.has(cand.label)) continue;
            // Never echo the typed word back — EXCEPT module candidates,
            // where accepting an exactly-typed label still inserts the
            // import (the auto-import flow).
            if (cand.label === prefix && !cand.importModule) continue;
            const m = matchLabel(prefix, cand.label, opts.fuzzy);
            if (!m) continue;
            seen.add(cand.label);
            rows.push({cand, tier: m.tier, pref, order: order++, spans: m.spans});
        }
    }
    rows.sort(
        (a, b) =>
            a.tier - b.tier ||
            a.pref - b.pref ||
            (opts.shorterFirst ? a.cand.label.length - b.cand.label.length : 0) ||
            a.order - b.order
    );
    const out: CompletionCandidate[] = [];
    for (const row of rows.slice(0, opts.limit)) {
        if (!opts.withScore && !opts.withSpans) {
            out.push(row.cand);
            continue;
        }
        const item: CompletionCandidate = {...row.cand};
        if (opts.withScore) {
            item.score = matchScore(prefix, row.tier, row.pref, row.spans, row.cand.label);
        }
        if (opts.withSpans) item.matchSpans = row.spans;
        out.push(item);
    }
    return out;
}

/** Rank candidates for `prefix` from the document words + keywords.
 *
 * Order: exact-case prefix, then case-insensitive prefix, then a
 * word-boundary prefix (a snake_case/kebab segment), then substring,
 * then — unless disabled via opts — a fuzzy subsequence ("prnt" →
 * "print", "dbcn" → "db_connect"). Ties keep insertion order
 * (document words before keywords — the own vocabulary outranks the
 * language's). Pass opts to attach `score` / `matchSpans` to each
 * item, or to disable fuzzy matches. */
export function matchCompletions(
    prefix: string,
    documentWords: string[],
    keywords: string[],
    limit = 8,
    opts: CompletionMatchOptions = {}
): CompletionCandidate[] {
    if (prefix.length < 3) return [];
    const pools: CompletionCandidate[][] = [
        documentWords.map((w) => ({label: w, source: "document" as const})),
        keywords.map((w) => ({label: w, source: "keyword" as const})),
    ];
    return rankCandidates(prefix, pools, {
        limit,
        shorterFirst: false, // pool insertion order is the documented tiebreak
        withScore: !!opts.withScore,
        withSpans: !!opts.withSpans,
        fuzzy: opts.fuzzy !== false,
    });
}

/* ═══ The Python provider (E19) ═══════════════════════════════════
 * The LSP-grade pipeline for the Python editor: keywords, document
 * locals (with their def-line signatures + docstring first lines),
 * the curated builtin table, curated importable modules (already-
 * imported ones are filtered out when the source is given), document
 * words, and the host's snippet triggers — all matched with the
 * fuzzy/rank core above. Pure + synchronous. */

/** A host snippet to surface (code-viewer's snippetMap entries). */
export interface CompletionSnippet {
    /** The trigger word (what the user types). */
    label: string;
    /** The body to insert — may carry VS Code-style tabstops. */
    insertText: string;
    detail?: string;
    documentation?: string;
}

/** Options for pythonCompletions. */
export interface PythonCompletionOptions extends CompletionMatchOptions {
    /** The document source — feeds locals, document words, and the
     *  already-imported filter. Omit for table-only matches. */
    source?: string;
    /** Pre-parsed def/class symbols (code-viewer already memoizes
     *  parsePythonSymbols) — skips the internal re-parse. */
    symbols?: PythonSymbol[];
    /** The host's snippet library (trigger → body with tabstops). */
    snippets?: CompletionSnippet[];
    /** Max items returned (default 12). */
    limit?: number;
}

// Precomputed pools (module-init cost: three small maps).
const PYTHON_KEYWORD_ITEMS: CompletionCandidate[] = PYTHON_KEYWORDS.map((w) => ({
    label: w,
    source: "keyword" as const,
}));
const PYTHON_BUILTIN_ITEMS: CompletionCandidate[] = Object.entries(PYTHON_BUILTINS).map(
    ([label, b]) => ({label, source: "builtin" as const, detail: b.signature, documentation: b.doc})
);
const PYTHON_MODULE_ITEMS: CompletionCandidate[] = Object.entries(PYTHON_IMPORTS).map(
    ([label, imp]) => ({
        label,
        source: "module" as const,
        detail: imp.statement,
        documentation: `Auto-import on accept: ${imp.statement}`,
        importModule: imp.module,
    })
);

/** Skip the O(symbols×lines) endLine pass in python-symbols past this
 * size unless the host passes pre-parsed symbols (code-viewer does). */
const MAX_SYMBOL_PARSE_CHARS = 400_000;

/** The first non-empty line of a snippet body — a stand-in signature
 * when the host doesn't provide a detail. */
function firstSnippetLine(body: string): string | undefined {
    for (const l of body.split("\n")) {
        const t = l.trim();
        if (t) return t;
    }
    return undefined;
}

/** True when `text` contains VS Code-style tabstops — $0, $1,
 * ${n:default} — the exact syntax code-viewer's Tab expansion parses
 * (see its BUILTIN_TAB_SNIPPETS handler). */
export function snippetHasTabstops(text: string): boolean {
    return /\$(\d+)(?::([^$\n]*))?|\$\{(\d+):([^}]*)\}/.test(text);
}

/** The index of the assignment "=" in `line` (plain, augmented, or
 * after an annotation), or -1. Comparisons (==, !=, <=, >=) and the
 * walrus := don't count. */
function assignmentEqIndex(line: string): number {
    for (let i = 0; i < line.length; i++) {
        if (line[i] !== "=") continue;
        const prev = line[i - 1] ?? "";
        const next = line[i + 1] ?? "";
        if (next === "=" || prev === "=") {
            i++; // consume the second char of ==
            continue;
        }
        if (prev === "!" || prev === "<" || prev === ">" || prev === ":") continue;
        return i;
    }
    return -1;
}

/** The names an import statement binds ("import a.b as c" → ["c"],
 * "from m import x, y as z" → ["x", "z"]), or null for non-imports.
 * A plain regex pass — parenthesized multi-line from-imports are
 * read partially (the names on their first line), which is enough
 * for the already-imported check. */
function parseImportLine(line: string): string[] | null {
    const partRe = /^\s*([A-Za-z_][\w.]*)\s*(?:as\s+([A-Za-z_]\w*))?\s*$/;
    let m = /^import\s+([^#]+?)\s*(?:#.*)?$/.exec(line);
    if (m) {
        const names: string[] = [];
        for (const part of m[1].split(",")) {
            const b = partRe.exec(part);
            if (b) names.push(b[2] ?? b[1].split(".")[0]);
        }
        return names;
    }
    m = /^from\s+[A-Za-z_][\w.]*\s+import\s+([^#]+?)\s*(?:#.*)?$/.exec(line);
    if (m) {
        const names: string[] = [];
        for (const part of m[1].replace(/^[({\s]+|[)}\s]+$/g, "").split(",")) {
            const b = partRe.exec(part);
            if (b && !b[1].includes(".")) names.push(b[2] ?? b[1]);
        }
        return names;
    }
    return null;
}

/** Whether any import statement in `source` binds `symbol` — so
 * ensureImport can skip and the popup can stop offering the module. */
export function isImported(source: string, symbol: string): boolean {
    if (!symbol) return false;
    for (const raw of source.split("\n")) {
        const names = parseImportLine(raw.trim());
        if (names && names.includes(symbol)) return true;
    }
    return false;
}

/** Local names defined in the document: def/class symbols (with the
 * def line as detail and the docstring's first line as the doc
 * snippet), assignment and loop/with/except targets, and the names
 * bound by import statements (detail = the import line). A light
 * regex pass — no AST, no scope analysis: names are file-wide. */
export function collectPythonLocals(
    source: string,
    symbols?: PythonSymbol[]
): CompletionCandidate[] {
    const out: CompletionCandidate[] = [];
    const seen = new Set<string>();
    const push = (c: CompletionCandidate) => {
        if (!seen.has(c.label)) {
            seen.add(c.label);
            out.push(c);
        }
    };
    // 1) def/class symbols — the signature from python-symbols' parse
    //    (def line + first docstring line), reused as-is.
    const syms =
        symbols ?? (source.length <= MAX_SYMBOL_PARSE_CHARS ? parsePythonSymbols(source) : []);
    for (const s of syms) {
        if (s.type !== "function" && s.type !== "method" && s.type !== "class") continue;
        push({label: s.name, source: "local", detail: formatSymbol(s), documentation: s.docstring});
    }
    // 2) the light pass — imports, assignments, comprehension-free targets.
    for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const imported = parseImportLine(line);
        if (imported) {
            for (const name of imported) push({label: name, source: "local", detail: line});
            continue;
        }
        if (/^(?:async\s+)?def\s|^class\s/.test(line)) continue; // handled above
        const forMatch = /^(?:async\s+)?for\s+(.+?)\s+in\s/.exec(line);
        if (forMatch) {
            for (const id of forMatch[1].match(/[A-Za-z_]\w*/g) ?? []) {
                push({label: id, source: "local"});
            }
            continue;
        }
        if (/^(?:with|except)\b/.test(line)) {
            for (const am of line.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) {
                push({label: am[1], source: "local"});
            }
            continue;
        }
        const eq = assignmentEqIndex(line);
        if (eq > 0) {
            let lhs = line.slice(0, eq);
            if (lhs.includes(":")) lhs = lhs.split(":")[0]; // annotation: x: int = 1
            let target = lhs.trim();
            if (target.startsWith("(") && target.endsWith(")")) {
                target = target.slice(1, -1); // tuple unpacking: (a, b) = …
            }
            if (/^[\w\s,]+$/.test(target)) {
                for (const id of target.match(/[A-Za-z_]\w*/g) ?? []) {
                    push({label: id, source: "local"});
                }
            }
        }
    }
    return out;
}

/** Ranked Python completions for `prefix` (1+ chars — the host owns
 * the trigger gate). Pools in preference order: snippets, keywords,
 * locals, builtins, importable modules (already-imported ones are
 * filtered out when `source` is given), then document words. */
export function pythonCompletions(
    prefix: string,
    opts: PythonCompletionOptions = {}
): CompletionCandidate[] {
    if (prefix.length < 1) return [];
    const limit = Math.max(1, opts.limit ?? 12);
    const source = opts.source ?? "";
    const pools: CompletionCandidate[][] = [];
    if (opts.snippets?.length) {
        pools.push(
            opts.snippets.map((s) => ({
                label: s.label,
                source: "snippet" as const,
                insertText: s.insertText,
                hasTabstops: snippetHasTabstops(s.insertText),
                detail: s.detail,
                documentation: s.documentation ?? firstSnippetLine(s.insertText),
            }))
        );
    }
    pools.push(PYTHON_KEYWORD_ITEMS);
    if (source) pools.push(collectPythonLocals(source, opts.symbols));
    pools.push(PYTHON_BUILTIN_ITEMS);
    if (source) {
        const imported = new Set<string>();
        for (const raw of source.split("\n")) {
            const names = parseImportLine(raw.trim());
            if (names) for (const n of names) imported.add(n);
        }
        pools.push(PYTHON_MODULE_ITEMS.filter((c) => !imported.has(c.label)));
    } else {
        pools.push(PYTHON_MODULE_ITEMS);
    }
    if (source) {
        pools.push(
            collectDocumentWords(source).map((w) => ({label: w, source: "document" as const}))
        );
    }
    return rankCandidates(prefix, pools, {
        limit,
        shorterFirst: true,
        withScore: !!opts.withScore,
        withSpans: !!opts.withSpans,
        fuzzy: opts.fuzzy !== false,
    });
}

/** The curated import for a symbol: which module provides it and the
 * statement that binds it ("np" → numpy / "import numpy as np").
 * Null for symbols without a curated entry. */
export function importFor(symbol: string): ImportInfo | null {
    return Object.prototype.hasOwnProperty.call(PYTHON_IMPORTS, symbol)
        ? PYTHON_IMPORTS[symbol]
        : null;
}

/* ─── import auto-insert (E19) ───────────────────────────────────
 * ensureImport patches a source with importFor(symbol).statement —
 * inserted after the existing import block, or at the top below any
 * shebang / encoding comment / module docstring — returning null
 * when nothing is curated or the symbol is already imported. */

function isBlankOrCommentLine(line: string): boolean {
    const t = line.trim();
    return t === "" || t.startsWith("#");
}

/** The line index a module docstring ends on (its opener's index for
 * one-liners and unterminated strings). */
function docstringEndLine(lines: string[], start: number): number {
    const q = lines[start].trim().slice(0, 3); // """ or '''
    const rest = lines[start].trim().slice(3);
    if (rest.includes(q)) return start; // one-liner: """Doc."""
    for (let j = start + 1; j < lines.length; j++) {
        if (lines[j].includes(q)) return j;
    }
    return start; // unterminated — treat as a single line
}

/** Patch `source` with the curated import for `symbol`. Null when
 * the symbol has no curated import or is already imported. */
export function ensureImport(source: string, symbol: string): string | null {
    const imp = importFor(symbol);
    if (!imp || isImported(source, symbol)) return null;
    const lines = source.split("\n");
    // 1) the preamble: shebang, encoding/license comments, docstring.
    let i = 0;
    if (lines[0]?.startsWith("#!")) i = 1;
    while (i < lines.length && isBlankOrCommentLine(lines[i])) i++;
    if (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith('"""') || t.startsWith("'''")) i = docstringEndLine(lines, i) + 1;
    }
    // 2) the import block: track the last import line — blanks and
    //    comments inside the block don't end it, any other code does.
    let lastImport = -1;
    for (let j = i; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t.startsWith("import ") || t.startsWith("from ")) {
            lastImport = j;
            continue;
        }
        if (t === "" || t.startsWith("#")) continue;
        break;
    }
    let insertAt: number;
    if (lastImport >= 0) {
        insertAt = lastImport + 1; // after the existing import block
    } else {
        insertAt = i; // top, below the shebang/encoding/docstring
        // Comment/blank-only source: land before the trailing "" split
        // artifact so the file keeps its final newline.
        if (insertAt >= lines.length && lines.length > 0 && lines[lines.length - 1] === "") {
            insertAt = lines.length - 1;
        }
    }
    const out = lines.slice();
    out.splice(insertAt, 0, imp.statement);
    return out.join("\n");
}

/** The curated signature + doc for a Python builtin/method name, or
 * null ("print", "len", "join", … — the PYTHON_BUILTINS table). */
export function pythonBuiltinDoc(name: string): BuiltinDoc | null {
    return Object.prototype.hasOwnProperty.call(PYTHON_BUILTINS, name)
        ? PYTHON_BUILTINS[name]
        : null;
}

/** The identifier prefix ending at `caret` ("" when none). Hyphens
 * count so CSS keyword names (align-…) complete too. `minLen` is the
 * shortest run worth returning — the default 3 is the generic popup's
 * gate; hosts wanting single-char prefixes (the Python popup) pass 1. */
export function identifierPrefixBefore(text: string, caret: number, minLen = 3): string {
    const n = Math.max(1, Math.floor(minLen));
    const m = new RegExp(`([A-Za-z_][A-Za-z0-9_-]{${n - 1},})$`).exec(text.slice(0, caret));
    return m ? m[1] : "";
}

/** The PYTHON identifier prefix ending at `caret` — no hyphens (they
 * are minus operators in Python), any length ≥ 1. This is the prefix
 * pythonCompletions expects; the host owns the trigger gate. */
export function pythonIdentifierPrefixBefore(text: string, caret: number): string {
    const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(text.slice(0, caret));
    return m ? m[1] : "";
}

/* ─── popup-side pure helpers (the file-viewer popup's own logic) ──
 * The popup lives inside file-viewer's edit-mode textarea, but the
 * TRIGGER decision and the INSERTION slicing are pure — they live
 * here so __tests__/completion-popup.test.ts covers them without
 * React (the matcher itself is covered by
 * completion-provider.test.ts). */

/** Whether the popup should OPEN for the prefix the caret just
 * produced — requires an editable surface, no IME composition in
 * flight (the caller's composingRef), and at least 1 identifier
 * char. (identifierPrefixBefore only ever returns runs of 3+ chars,
 * so "≥ 1" in practice means "≥ 3" — matchCompletions enforces the
 * same gate.) */
export function shouldOfferCompletion(
    prefix: string,
    opts: { composing: boolean; editMode: boolean }
): boolean {
    if (!opts.editMode) return false;
    if (opts.composing) return false;
    return prefix.length >= 1;
}

/** The text to INSERT at the caret when a candidate is picked — the
 * label minus the already-typed prefix (matched case-insensitively,
 * so accepting "Console" after "cON" inserts just "sole"). A
 * candidate that does not START with the prefix (the matcher's
 * contains-tier) has no suffix relationship: the whole label is
 * returned and appending it after the fragment is the documented
 * behavior. A prefix longer than the label never slices negative. */
export function completionSuffix(label: string, prefix: string): string {
    if (prefix.length === 0) return label;
    if (
        label.length >= prefix.length &&
        label.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
    ) {
        return label.slice(prefix.length);
    }
    return label;
}
