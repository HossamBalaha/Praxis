/**
 * the Python source of the console KERNEL process.
 *
 * The persistent console ("Console mode") is a long-lived `python -u`
 * process running this script. It speaks a JSON-lines protocol over
 * stdin/stdout:
 *
 * stdin (one JSON object per line): {"id": N, "code": "...", "mode": "exec" | "eval"}
 * stdout (one JSON object per line): {"id": N, "event": "stdout"|"stderr", "text": "..."}
 * {"id": N, "event": "figure", "name": "figure_001.png"}
 * {"id": N, "event": "end", "ok": bool, "error": str|null,
 * "figures": [...], "variables": [{name, type, value}]}
 * {"event": "exit"} (stdin closed / process exiting)
 *
 * Newer, NON-code modes (the Variables panel / task introspection) —
 * they never evaluate user-supplied code:
 *   {"id": N, "mode": "inspect", "expr"?: "a.b[0]", "deep"?: 1}
 *     → {"id": N, "kind": "inspect", "vars": [...]}            (no expr)
 *     → {"id": N, "kind": "inspect", "var": {...}, "children"?}  (expr)
 *     → {"id": N, "kind": "inspect", "error": "..."}           (failure)
 *   {"id": N, "mode": "tasks"}
 *     → {"id": N, "kind": "tasks", "tasks": [...], "note": str}
 *   {"id": N, "mode": "griddata", "expr": "df", "rows": 2000, "cols": 100}
 *     → {"id": N, "kind": "griddata", "shape": "dataframe",
 *        "columns": [...], "rows": [[...]], "totalRows": N, "totalCols": M}
 *     → {"id": N, "kind": "griddata", "error": "..."}   (failure)
 *     The console's "open in grid" bridge: serializes one namespace
 *     object as strict-JSON grid records (DataFrame → to_dict("records"),
 *     Series → [index, value], ndarray → matrix / column, dict →
 *     column-oriented or one-row, list/tuple/set → of dicts / sequences
 *     / one value column) under the row/col caps the route clamps. Same
 *     trust model as inspect — _safe_resolve never executes user code.
 * The exec/eval protocol lines above stay byte-for-byte identical.
 *
 * Every submission executes in the SAME global namespace (`__console__`),
 * so state persists across submissions — build a DataFrame once, keep
 * working with it — exactly like a Jupyter kernel, minus the ZMQ.
 *
 * Design notes:
 * - `eval` mode first tries eval (REPL expression semantics: the
 * result's repr is printed); on SyntaxError it falls back to exec
 * so statements typed at the prompt also work.
 * - Jupyter-style magics: LINE magics (%time, %timeit-lite, %who,
 * %whos, %reset, %history, %help) and CELL magics (%%time, %%timeit
 * best-of-3 with re-execution, %%capture into `_capture`); an
 * unknown %%token is a friendly error and the cell does NOT run.
 * - stdout/stderr of the code are redirected into buffers per
 * submission; the kernel's own protocol lines go to the REAL stdout
 * (flushed immediately), so the two never interleave.
 * - matplotlib: imported eagerly with the Agg backend (same as the
 * run prelude); savefig/show are patched to capture figures into
 * PRAXIS_CONSOLE_FIG_DIR. After every submission all REMAINING open
 * figures are also captured + closed — Jupyter's displayhook
 * semantics: `plt.plot(...)` alone shows the figure.
 * - input raises a friendly error: the kernel's stdin belongs to
 * the protocol, it cannot host interactive prompts.
 * - A stuck submission cannot be interrupted from Python, so the
 * route enforces the timeout by KILLING the whole session (the
 * client then auto-restarts on the next submission, with a notice).
 *
 * The source is embedded as a string (not a loose.py file) so it
 * survives every deployment mode — dev server, `next start`, and the
 * standalone Docker image — without file-tracing concerns.
 */

// NOTE: backslashes in the Python source are doubled for the TS
// template literal; `${` never occurs in Python.
export const CONSOLE_KERNEL_PY = `# Praxis console kernel — persistent namespace, JSON-lines protocol.
import sys
import ast
import json
import io
import os
import math
import time as _time
import traceback
import contextlib

# ── Jupyter-style magics (see src/lib/console-magics.ts for the
# client-side parser; keep the %help listing in sync with
# CONSOLE_MAGIC_HELP there) ─────────────────────────────────────────
# Every submission is appended here so %history can list the session.
_HISTORY = []
_HISTORY_CAP = 200

_MAGIC_TOKENS = {
    "%time": "time",
    "%timeit": "timeit",
    "%timeit-lite": "timeit",
    "%who": "who",
    "%whos": "whos",
    "%reset": "reset",
    "%history": "history",
    "%help": "help",
    "%magic": "help",
    "%tasks": "tasks",
}

# Cell magics (4) — the submission's FIRST token starts with %% and the
# whole rest of the submission is the cell body. Unlike unknown LINE
# magics (which fall through to exec and SyntaxError), an unknown
# %%token is a FRIENDLY error and the cell does NOT run.
_CELL_MAGIC_TOKENS = {
    "%%time": "cell-time",
    "%%timeit": "cell-timeit",
    "%%capture": "cell-capture",
}

_MAGIC_HELP = """Console magics (Jupyter-style):
  %time <code>         run the code once and report the wall time
  %timeit-lite <code>  single-shot timing (no repeat loop)
  %who                 list the names defined in the namespace
  %whos                list names with their types and values
  %tasks               asyncio task tree in the kernel (Async tab twin)
  %reset               clear the whole namespace (state is lost)
  %history             list this session's submissions
  %help                this list
Cell magics (must be the first token of the submission):
  %%time               time the whole cell (wall time)
  %%timeit             best of 3 runs — the cell re-runs 3 times,
                      so side effects repeat
  %%capture            capture the cell's stdout/stderr into _capture"""

def _magic_of(code):
    """(kind, rest) for a leading magic line; (None, code) for ordinary
    code — including UNKNOWN %commands, which fall through to exec and
    surface as a normal SyntaxError exactly like before (the client
    usually intercepts those first with a friendlier hint)."""
    stripped = code.lstrip()
    if not stripped.startswith("%"):
        return None, code
    token = stripped.split(None, 1)[0].lower()
    kind = _MAGIC_TOKENS.get(token)
    if kind is None:
        return None, code
    rest = stripped[len(token):].strip()
    return kind, rest

def _format_who(detailed):
    """Namespace listing for %who / %whos (mirrors the snapshot rules
    of _variables_snapshot: private names and the input() override are
    skipped)."""
    lines = []
    for name in sorted(_NS):
        if name.startswith("_"):
            continue
        value = _NS[name]
        if value is _console_input:
            continue
        kind = type(value).__name__
        if detailed:
            try:
                rep = repr(value)
            except Exception:
                rep = "<repr failed>"
            if len(rep) > 60:
                rep = rep[:57] + "..."
            lines.append("%-24s %-10s %s" % (name, kind, rep))
        else:
            lines.append(name)
    if not lines:
        return "(the namespace is empty)\\n"
    return "\\n".join(lines) + "\\n"

_FIG_DIR = os.environ.get("PRAXIS_CONSOLE_FIG_DIR", "")
_figures_captured = []
_fig_counter = [0]

# ── Matplotlib capture (mirrors src/lib/python-prelude.ts) ──────────
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt
    _ORIGINAL_SAVEFIG = _plt.savefig
    _ORIGINAL_SHOW = _plt.show
    _CAPTURED_FIGS = set()

    def _capture_open_figs():
        """Save every open figure to _FIG_DIR, skip already-captured ones."""
        for num in list(_plt.get_fignums()):
            if num in _CAPTURED_FIGS:
                continue
            _fig_counter[0] += 1
            n = _fig_counter[0]
            target = os.path.join(_FIG_DIR, "figure_%03d.png" % n)
            try:
                _ORIGINAL_SAVEFIG(
                    target, format="png", bbox_inches="tight", dpi=120,
                    facecolor=_plt.figure(num).get_facecolor(),
                )
                _figures_captured.append(os.path.basename(target))
                _CAPTURED_FIGS.add(num)
 # interactive companion (mpld3, optional).
                try:
                    import mpld3 as _mpld3
                    _html = _mpld3.fig_to_html(_plt.figure(num), template_type="simple")
                    with open(os.path.join(_FIG_DIR, "figure_%03d.html" % n),
                              "w", encoding="utf-8") as _fh:
                        _fh.write(_html)
                except Exception:
                    pass
            except Exception as _e:
                sys.stderr.write("[console] could not save figure %d: %s\\n" % (n, _e))

    def _patched_savefig(fname=None, *args, **kwargs):
        _capture_open_figs()
        try:
            _ORIGINAL_SAVEFIG(fname, *args, **kwargs)
        except Exception:
            pass

    def _patched_show(*args, **kwargs):
        _capture_open_figs()
        _plt.close("all")
        _CAPTURED_FIGS.clear()

    _plt.savefig = _patched_savefig
    _plt.show = _patched_show
except ImportError:
    _plt = None
    def _capture_open_figs():
        pass

# ── The persistent namespace ────────────────────────────────────────
_NS = {"__name__": "__console__", "__builtins__": __builtins__, "__doc__": None}

def _console_input(prompt=""):
    raise RuntimeError(
        "input() is not available in the console — the kernel's stdin "
        "carries the execution protocol. Set variables directly instead."
    )

_NS["input"] = _console_input


def _emit(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.stdout.flush()


def _variables_snapshot():
    """Public, non-module namespace entries with short reprs."""
    out = []
    for name in sorted(_NS):
        if name.startswith("_"):
            continue
        try:
            value = _NS[name]
        except Exception:
            continue
        # Don't list the input() override itself.
        if value is _console_input:
            continue
        kind = type(value).__name__
        if kind in ("module", "function", "builtin_function_or_method", "type"):
            out.append({"name": name, "type": kind, "value": ""})
            continue
        try:
            rep = repr(value)
        except Exception as _e:
            rep = "<repr failed: %s>" % _e
        if len(rep) > 120:
            rep = rep[:117] + "..."
        out.append({"name": name, "type": kind, "value": rep})
        if len(out) >= 60:
            break
    return out


# ── INSPECT mode helpers (the Variables panel) ──────────────────────
# Pure introspection: nothing user-supplied is evaluated as CODE —
# the only expression path is the guarded AST walker _safe_node below.

_INSPECT_KIND_MAP = {
    "int": "int", "float": "float", "str": "str", "bool": "bool",
    "list": "list", "tuple": "tuple", "dict": "dict", "set": "set",
    "frozenset": "set", "function": "function",
    "builtin_function_or_method": "function",
    "type": "class", "module": "module",
    "ndarray": "ndarray", "DataFrame": "dataframe", "Series": "series",
}

def _type_str(value):
    """Qualified type name: plain for builtins, module.Class otherwise."""
    cls = type(value)
    mod = getattr(cls, "__module__", "")
    if mod and mod not in ("builtins", "__builtin__"):
        return mod + "." + cls.__name__
    return cls.__name__

def _inspect_kind(value):
    """Coarse UI bucket for the variable list (with pandas/numpy ducks)."""
    tn = type(value).__name__
    kind = _INSPECT_KIND_MAP.get(tn)
    if kind is not None:
        return kind
    # Duck-typed fallbacks so subclasses/registered wrappers still map.
    if hasattr(value, "columns") and hasattr(value, "iloc"):
        return "dataframe"
    if hasattr(value, "iloc") and hasattr(value, "dtype"):
        return "series"
    if hasattr(value, "shape") and hasattr(value, "dtype"):
        # numpy SCALARS also carry shape()/dtype — they are ()-shaped,
        # so only a real (>=0-d) array with a non-empty shape qualifies.
        try:
            if value.shape != ():
                return "ndarray"
        except Exception:
            return "ndarray"
    return "other"

def _json_num(x):
    """float(x) as a STRICT-JSON number: NaN/inf become None (JSON null)."""
    try:
        f = float(x)
    except Exception:
        return None
    if not math.isfinite(f):
        return None
    return f

def _inspect_sample(value, kind):
    """First 8 numeric values when the variable is plottable, else None."""
    try:
        if kind == "ndarray":
            if value.dtype.kind not in "iuf":
                return None
            return [_json_num(x) for x in value.reshape(-1)[:8]]
        if kind == "series":
            if value.dtype.kind not in "iuf":
                return None
            return [_json_num(x) for x in value.iloc[:8]]
        if kind in ("list", "tuple"):
            if not value or not all(
                isinstance(x, (int, float)) and not isinstance(x, bool)
                for x in value[:64]
            ):
                return None
            return [_json_num(x) for x in value[:8]]
    except Exception:
        return None
    return None

def _inspect_var(name, value):
    """One UI variable entry: { name, kind, type, shape?, preview, len?,
    keys?, canPlot, sample? }. Only strict-JSON scalar values inside."""
    kind = _inspect_kind(value)
    try:
        preview = repr(value)
    except Exception as e:
        preview = "<repr failed: %s>" % e
    if len(preview) > 120:
        preview = preview[:117] + "..."
    out = {"name": name, "kind": kind, "type": _type_str(value),
           "preview": preview}
    try:
        if kind in ("list", "tuple", "dict", "set", "str", "ndarray",
                    "dataframe", "series", "other"):
            out["len"] = len(value)
    except Exception:
        pass
    try:
        if kind == "ndarray":
            out["shape"] = str(value.shape)
        elif kind == "dataframe":
            out["shape"] = "%d rows x %d cols" % (len(value), len(value.columns))
        elif kind == "series":
            out["shape"] = str((len(value),))
    except Exception:
        pass
    keys = None
    try:
        # dict / DataFrame expose .keys(); plain objects list their
        # instance attributes (vars) with dir() as the fallback.
        if hasattr(value, "keys"):
            keys = [str(k) for k in list(value.keys())[:30]]
        elif kind == "other":
            if hasattr(value, "shape") and hasattr(value, "dtype"):
                # numpy scalars: the full attribute soup is noise.
                keys = None
            else:
                try:
                    vnames = [n for n in list(vars(value))
                              if not n.startswith("_")]
                except Exception:
                    vnames = []
                if vnames:
                    keys = vnames[:30]
                else:
                    keys = [a for a in dir(value) if not a.startswith("_")][:30]
    except Exception:
        keys = None
    if keys:
        out["keys"] = keys
    sample = _inspect_sample(value, kind)
    out["canPlot"] = sample is not None
    if sample is not None:
        out["sample"] = sample
    return out

def _inspect_children(value, limit=20):
    """Up to "limit" members of a container/object, as inspect-var dicts
    (one level deep — children never nest their own children)."""
    out = []
    try:
        kind = _inspect_kind(value)
        if kind == "dict":
            for k in list(value)[:limit]:
                out.append(_inspect_var(str(k), value[k]))
        elif kind in ("list", "tuple"):
            for i, el in enumerate(list(value)[:limit]):
                out.append(_inspect_var("[%d]" % i, el))
        elif kind == "set":
            for el in list(value)[:limit]:
                out.append(_inspect_var(repr(el)[:30], el))
        elif kind == "ndarray":
            for i, el in enumerate(list(value.reshape(-1))[:limit]):
                out.append(_inspect_var("[%d]" % i, el))
        elif kind == "dataframe":
            for i in range(min(limit, len(value))):
                out.append(_inspect_var("row %d" % i, value.iloc[i]))
        elif kind == "series":
            for i, el in enumerate(list(value.iloc[:limit])):
                out.append(_inspect_var("[%d]" % i, el))
        elif kind in ("module", "class", "function"):
            pass  # never enumerate module/class members — too noisy
        else:
            for a in dir(value):
                if len(out) >= limit:
                    break
                if a.startswith("_"):
                    continue
                try:
                    out.append(_inspect_var(a, getattr(value, a)))
                except Exception:
                    pass
    except Exception:
        pass
    return out

# ── guarded expression resolution ("a.b[0]" style paths) ───────────
# Allow exactly: names from the namespace, attribute access, subscripts
# with int/str/slice, and the four whitelisted no-side-effect calls.

_SAFE_CALLS = {"len": len, "int": int, "float": float,
               "str": str, "repr": repr}

def _safe_node(node, ns):
    if isinstance(node, ast.Name):
        if node.id in ns:
            return ns[node.id]
        raise ValueError("name '%s' is not defined in the console" % node.id)
    if isinstance(node, ast.Attribute):
        return getattr(_safe_node(node.value, ns), node.attr)
    if isinstance(node, ast.Subscript):
        base = _safe_node(node.value, ns)
        sl = node.slice
        if isinstance(sl, ast.Slice):
            lower = _safe_node(sl.lower, ns) if sl.lower is not None else None
            upper = _safe_node(sl.upper, ns) if sl.upper is not None else None
            step = _safe_node(sl.step, ns) if sl.step is not None else None
            return base[lower:upper:step]
        if isinstance(sl, (ast.Tuple, ast.List)):
            return base[tuple(_safe_node(e, ns) for e in sl.elts)]
        return base[_safe_node(sl, ns)]
    if isinstance(node, ast.Constant):
        # Bare constants only appear as subscript keys/slice bounds here.
        if isinstance(node.value, (int, float, str)) or node.value is None:
            return node.value
        raise ValueError("constant of type %s is not allowed"
                         % type(node.value).__name__)
    if isinstance(node, ast.Call):
        func = node.func
        if (isinstance(func, ast.Name) and func.id in _SAFE_CALLS
                and len(node.args) == 1 and not node.keywords):
            return _SAFE_CALLS[func.id](_safe_node(node.args[0], ns))
        raise ValueError("calls are limited to len/int/float/str/repr")
    raise ValueError("unsupported syntax in expression: %s"
                     % type(node).__name__)

def _safe_resolve(expr, ns):
    """Parse + walk the expression under the guarded rules above."""
    return _safe_node(ast.parse(expr, mode="eval").body, ns)


# ── TASKS mode helpers ─────────────────────────────────────────────
# A synchronous kernel cannot host a running asyncio loop while it also
# reads stdin, so this is the honest best-effort version of
# asyncio.all_tasks(): probe for a running loop (there is none while we
# can even answer), then scan the namespace for Task objects, bare
# coroutines, loops and containers holding them.

def _coro_entry(coro):
    entry = {"id": id(coro), "name": "<coroutine>",
             "state": "coroutine (never awaited)"}
    try:
        entry["name"] = coro.cr_code.co_name
    except Exception:
        pass
    return _fill_coro_frames(entry, coro)

def _fill_coro_frames(entry, coro):
    try:
        frame = getattr(coro, "cr_frame", None)
        if frame is None:
            return entry
        awaited = getattr(coro, "cr_await", None)
        if awaited is not None:
            rep = repr(awaited)
            if len(rep) > 80:
                rep = rep[:77] + "..."
            entry["awaiting"] = rep
        stack = []
        while frame is not None and len(stack) < 10:
            stack.append("%s:%d (%s)" % (frame.f_code.co_filename,
                                         frame.f_lineno,
                                         frame.f_code.co_name))
            frame = frame.f_back
        entry["stack"] = stack
    except Exception:
        pass
    return entry

def _task_entry(t):
    entry = {"id": id(t), "name": "<unnamed task>", "state": "pending"}
    try:
        entry["name"] = t.get_name()
    except Exception:
        pass
    try:
        if t.done():
            entry["state"] = "cancelled" if t.cancelled() else "done"
    except Exception:
        pass
    try:
        entry = _fill_coro_frames(entry, t.get_coro())
    except Exception:
        pass
    return entry

def _collect_tasks():
    import asyncio
    tasks = []
    seen = set()

    def _add(entry, obj):
        key = id(obj)
        if key in seen:
            return
        seen.add(key)
        tasks.append(entry)

    note = "no running loop in the kernel (submissions are synchronous)"
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        note = "loop is running in the kernel"
        try:
            for t in asyncio.all_tasks(loop):
                _add(_task_entry(t), t)
        except Exception as e:
            note = "all_tasks failed: %s" % e

    def _scan(seq):
        try:
            for el in list(seq)[:200]:
                if isinstance(el, asyncio.Task):
                    _add(_task_entry(el), el)
                elif asyncio.iscoroutine(el):
                    _add(_coro_entry(el), el)
        except Exception:
            pass

    for name in sorted(_NS):
        if name.startswith("_"):
            continue
        try:
            value = _NS[name]
        except Exception:
            continue
        if isinstance(value, asyncio.Task):
            _add(_task_entry(value), value)
        elif asyncio.iscoroutine(value):
            _add(_coro_entry(value), value)
        elif isinstance(value, asyncio.AbstractEventLoop):
            try:
                for t in asyncio.all_tasks(value):
                    _add(_task_entry(t), t)
            except Exception:
                pass
        elif isinstance(value, (list, tuple, set)):
            _scan(value)
        elif isinstance(value, dict):
            _scan(value.values())
    if not tasks:
        note = note + " — no pending tasks found"
    return tasks, note


# ── GRIDDATA mode helpers (the console → grid viewer bridge) ───────
# POST /api/console/variable resolves ONE guarded expression against
# the namespace and needs the object as strict-JSON grid records. Like
# INSPECT mode this NEVER executes user code — _safe_resolve only walks
# names/attributes/subscripts; everything below only READS the object.

_GRID_CELL_TEXT_CAP = 300


def _grid_cell(x):
    """One cell → a strict-JSON scalar.

    None → null; NaN/±inf → null (strict JSON has no NaN); bool/int/
    float pass through; datetime/Timestamp → isoformat; numpy/pandas
    scalars → their .item(); everything else stringifies. Every text
    path is length-capped so one giant cell cannot blow the payload."""
    if x is None:
        return None
    if isinstance(x, (bool, int)):
        return x
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, str):
        return x if len(x) <= _GRID_CELL_TEXT_CAP else x[: _GRID_CELL_TEXT_CAP - 3] + "..."
    if isinstance(x, bytes):
        try:
            s = x.decode("utf-8", "replace")
        except Exception:
            s = repr(x)
        return s[: _GRID_CELL_TEXT_CAP]
    iso = getattr(x, "isoformat", None)
    if callable(iso):
        try:
            return x.isoformat()[: _GRID_CELL_TEXT_CAP]
        except Exception:
            pass
    item = getattr(x, "item", None)
    if callable(item):
        try:
            inner = x.item()
            # numpy scalars unwrap to plain Python scalars; the identity
            # guard stops a pathological .item() returning its owner.
            if inner is not x and not isinstance(inner, (dict, list, tuple, set)):
                return _grid_cell(inner)
        except Exception:
            pass
    try:
        f = float(x)
        return f if math.isfinite(f) else None
    except Exception:
        return str(x)[: _GRID_CELL_TEXT_CAP]


def _grid_len(value):
    """len(value) when the object knows it (the FULL row count), else None."""
    try:
        return len(value)
    except Exception:
        return None


def _grid_payload(value, row_cap, col_cap):
    """Serialize one table-like object as {shape, columns, rows, totalRows,
    totalCols} — ValueError for anything else (the route turns that into
    the friendly "not a table" error).

    Shapes, in _inspect_kind order:
      dataframe → to_dict("records") of iloc[:row_cap, :col_cap]
      series    → [index, value] rows with the index/Series names
      ndarray   → 2-D matrix (col_N labels) or a single value column
      dict      → of lists (column-oriented) or a one-row key/value table
      list/tuple/set → of dicts (union of keys), of sequences, or one
                  value column
    totalRows/totalCols report the FULL shape so the viewer can say
    "showing the first N of M rows" when the caps truncated."""
    kind = _inspect_kind(value)
    if kind == "dataframe":
        all_cols = [str(c) for c in list(value.columns)]
        use_cols = all_cols[:col_cap]
        head = value.iloc[:row_cap, :col_cap]
        records = head.to_dict("records")
        # NOTE: duplicate column labels collapse in to_dict records —
        # an accepted edge case, same as the repr itself.
        rows = [[_grid_cell(rec.get(c)) for c in use_cols] for rec in records]
        return {"shape": "dataframe", "columns": use_cols, "rows": rows,
                "totalRows": _grid_len(value), "totalCols": len(all_cols)}
    if kind == "series":
        idx_label = "index"
        try:
            if value.index.name is not None:
                idx_label = str(value.index.name)
        except Exception:
            pass
        val_label = "value"
        try:
            if value.name is not None:
                val_label = str(value.name)
        except Exception:
            pass
        idx = list(value.index[:row_cap])
        vals = list(value.iloc[:row_cap])
        rows = [[_grid_cell(i), _grid_cell(v)] for i, v in zip(idx, vals)]
        return {"shape": "series", "columns": [idx_label, val_label],
                "rows": rows, "totalRows": _grid_len(value), "totalCols": 2}
    if kind == "ndarray":
        shape = None
        try:
            shape = tuple(value.shape)
        except Exception:
            pass
        if shape is not None and len(shape) == 2:
            n = min(shape[0], row_cap)
            m = min(shape[1], col_cap)
            use_cols = ["col_%d" % (j + 1) for j in range(m)]
            rows = [[_grid_cell(value[i, j]) for j in range(m)]
                    for i in range(n)]
            return {"shape": "matrix", "columns": use_cols, "rows": rows,
                    "totalRows": shape[0], "totalCols": shape[1]}
        flat = None
        try:
            flat = list(value.reshape(-1)[:row_cap])
        except Exception:
            flat = list(value)[:row_cap]
        rows = [[_grid_cell(v)] for v in flat]
        return {"shape": "array", "columns": ["value"], "rows": rows,
                "totalRows": _grid_len(value), "totalCols": 1}
    if kind == "dict":
        keys = list(value.keys())[:col_cap]
        labels = [str(k) for k in keys]
        vals = [value[k] for k in keys]
        if vals and all(isinstance(v, (list, tuple)) for v in vals):
            # column-oriented {"a": [...], "b": [...]} — rows are the
            # zip; shorter lists pad with null like a ragged frame.
            width = 0
            for v in vals:
                if len(v) > width:
                    width = len(v)
            n = min(width, row_cap)
            rows = []
            for i in range(n):
                rows.append([_grid_cell(v[i]) if i < len(v) else None
                             for v in vals])
            return {"shape": "dict-of-lists", "columns": labels, "rows": rows,
                    "totalRows": width, "totalCols": len(value)}
        rows = [[_grid_cell(v) for v in vals]]
        return {"shape": "dict", "columns": labels, "rows": rows,
                "totalRows": 1, "totalCols": len(value)}
    if kind in ("list", "tuple", "set"):
        items = list(value)
        if items and all(isinstance(el, dict) for el in items[:64]):
            # union of keys in first-seen order; keep the ORIGINAL key
            # objects alongside their str labels so non-str keys
            # (ints, tuples) still resolve via .get().
            key_order = []
            seen_labels = []
            for el in items:
                for k in el.keys():
                    label = str(k)
                    if label not in seen_labels:
                        seen_labels.append(label)
                        key_order.append(k)
            use_keys = key_order[:col_cap]
            rows = [[_grid_cell(el.get(k)) for k in use_keys]
                    for el in items[:row_cap]]
            return {"shape": "list-of-dicts",
                    "columns": [str(k) for k in use_keys],
                    "rows": rows, "totalRows": len(items),
                    "totalCols": len(seen_labels)}
        if items and all(isinstance(el, (list, tuple)) for el in items[:64]):
            width = 0
            for el in items[:64]:
                if len(el) > width:
                    width = len(el)
            m = min(width, col_cap)
            labels = ["col_%d" % (j + 1) for j in range(m)]
            rows = [[_grid_cell(x) for x in list(el)[:m]]
                    for el in items[:row_cap]]
            return {"shape": "list-of-lists", "columns": labels, "rows": rows,
                    "totalRows": len(items), "totalCols": width}
        rows = [[_grid_cell(el)] for el in items[:row_cap]]
        return {"shape": "list", "columns": ["value"], "rows": rows,
                "totalRows": len(items), "totalCols": 1}
    raise ValueError("%s is not table-like (DataFrame / Series / ndarray / "
                     "dict / list) — print it, or fetch a supported "
                     "attribute instead" % _type_str(value))


# ── Main loop ───────────────────────────────────────────────────────
# the loop is a 'while' + readline so
# a SIGINT that arrives while the kernel is IDLE (between submissions,
# blocked on the read) is swallowed and retried instead of killing the
# process. A SIGINT that arrives while user code is executing raises
# KeyboardInterrupt INSIDE the exec() try-block, which the kernel
# reports as a normal error result — the session survives either way.
while True:
    try:
        _raw = sys.stdin.readline()
    except KeyboardInterrupt:
        # Interrupt while idle: nothing to cancel — keep waiting.
        continue
    except Exception:
        break
    if not _raw:
        break
    _line = _raw.strip()
    if not _line:
        continue
    try:
        _req = json.loads(_line)
    except Exception:
        continue
    _rid = _req.get("id", 0)
    _code = _req.get("code", "")
    _mode = _req.get("mode", "eval")

    # ── inspect / tasks: NON-code modes. They carry no code field,
    # so they must be dispatched BEFORE the empty-code early-return
    # below (which would otherwise swallow them). Each emits exactly
    # one JSON reply line and never touches exec/eval.
    if _mode == "inspect":
        _i_expr = _req.get("expr")
        _i_deep = _req.get("deep", 0)
        try:
            if isinstance(_i_expr, str) and _i_expr.strip():
                _i_name = _i_expr.strip()
                _i_value = _safe_resolve(_i_expr, _NS)
                _i_var = _inspect_var(_i_name, _i_value)
                if isinstance(_i_deep, int) and _i_deep > 0:
                    _i_var["children"] = _inspect_children(_i_value, 20)
                _emit({"id": _rid, "kind": "inspect", "var": _i_var})
            else:
                _i_vars = []
                for _n in sorted(_NS):
                    if _n.startswith("_"):
                        continue
                    try:
                        _v = _NS[_n]
                    except Exception:
                        continue
                    if _v is _console_input:
                        continue
                    _i_vars.append(_inspect_var(_n, _v))
                    if len(_i_vars) >= 120:
                        break
                _emit({"id": _rid, "kind": "inspect", "vars": _i_vars})
        except Exception as _e:
            _emit({"id": _rid, "kind": "inspect",
                   "error": "%s: %s" % (type(_e).__name__, _e)})
        continue

    if _mode == "tasks":
        try:
            _t_tasks, _t_note = _collect_tasks()
            _emit({"id": _rid, "kind": "tasks", "tasks": _t_tasks,
                   "note": _t_note})
        except Exception as _e:
            _emit({"id": _rid, "kind": "tasks", "tasks": [],
                   "error": "%s: %s" % (type(_e).__name__, _e)})
        continue

    # ── griddata: serialize one namespace object as grid records for
    # the console's "open in grid" affordance (see the helpers above).
    # Same trust model as inspect — _safe_resolve never executes user
    # code; caps arrive from the route already clamped.
    if _mode == "griddata":
        _g_expr = _req.get("expr")
        try:
            if not isinstance(_g_expr, str) or not _g_expr.strip():
                _emit({"id": _rid, "kind": "griddata",
                       "error": "griddata mode requires a non-empty 'expr'."})
            else:
                _g_rows = _req.get("rows", 2000)
                _g_cols = _req.get("cols", 100)
                if not isinstance(_g_rows, int) or _g_rows < 1:
                    _g_rows = 2000
                if not isinstance(_g_cols, int) or _g_cols < 1:
                    _g_cols = 100
                _g_value = _safe_resolve(_g_expr.strip(), _NS)
                _g_payload = _grid_payload(_g_value, _g_rows, _g_cols)
                _emit({"id": _rid, "kind": "griddata", **_g_payload})
        except Exception as _e:
            _emit({"id": _rid, "kind": "griddata",
                   "error": "%s: %s" % (type(_e).__name__, _e)})
        continue

    if not isinstance(_code, str) or not _code.strip():
        _emit({"id": _rid, "event": "end", "ok": True, "error": None,
               "figures": [], "variables": _variables_snapshot()})
        continue

    # Every submission (magics included) lands in the session history.
    _HISTORY.append(_code)
    if len(_HISTORY) > _HISTORY_CAP:
        del _HISTORY[:-_HISTORY_CAP]

    # Magic dispatch: %time / %timeit-lite wrap the code with
    # perf_counter timing; %who / %whos list the namespace; %reset
    # clears it IN PLACE (the session survives — no restart needed);
    # %history lists _HISTORY; %help prints _MAGIC_HELP. Everything
    # else (and any unknown %command) runs as ordinary code.
    _magic, _magic_rest = _magic_of(_code)
    _timed = _magic in ("time", "timeit")
    _exec_code = _magic_rest if _magic is not None else _code

    # ── Cell magic dispatch (4): the first token starts with %%. The
    # body is everything after the token (leading newline stripped), so
    # '%%time' + a newline + 'x = 1' and '%%time x = 1' both work. An
    # UNKNOWN cell magic is a friendly error listing the supported
    # ones — the cell must NOT execute.
    _cell_magic = None
    _cell_body = ""
    _stripped_cell = _code.lstrip()
    if _stripped_cell.startswith("%%"):
        _ctoken = _stripped_cell.split(None, 1)[0].lower()
        _cell_magic = _CELL_MAGIC_TOKENS.get(_ctoken)
        if _cell_magic is None:
            _emit({"id": _rid, "event": "stderr",
                   "text": "Unknown cell magic %s — supported: "
                           "%%%%time, %%%%timeit, %%%%capture\\n" % _ctoken})
            _emit({"id": _rid, "event": "end", "ok": False,
                   "error": "Unknown cell magic %s" % _ctoken,
                   "figures": [], "variables": _variables_snapshot()})
            continue
        _cell_body = _stripped_cell[len(_ctoken):].strip()
        if not _cell_body:
            _emit({"id": _rid, "event": "stderr",
                   "text": "Usage: %s — the cell body follows the magic "
                           "line.\\n" % _ctoken})
            _emit({"id": _rid, "event": "end", "ok": False,
                   "error": "Empty cell for %s" % _ctoken,
                   "figures": [], "variables": _variables_snapshot()})
            continue
        _exec_code = _cell_body

    _before = len(_figures_captured)
    _out = io.StringIO()
    _err = io.StringIO()
    _ok = True
    _error = None
    _t0 = _time.perf_counter() if _timed else 0.0
    # Cell-magic results (filled by the branches below, reported after
    # the try-block like the line-magic timing):
    #   cell-time    -> _cell_dt (seconds, one run)
    #   cell-timeit  -> _cell_times (3 runs, best/mean reported)
    #   cell-capture -> _captured (the swallowed stdout+stderr text)
    _cell_dt = None
    _cell_times = None
    _captured = None
    try:
        with contextlib.redirect_stdout(_out), contextlib.redirect_stderr(_err):
            if _cell_magic == "cell-time":
                _ct0 = _time.perf_counter()
                exec(compile(_cell_body, "<console>", "exec"), _NS)
                _cell_dt = _time.perf_counter() - _ct0
            elif _cell_magic == "cell-timeit":
                # NOTE: the body is re-executed 3 times, so any side
                # effects (prints, file writes, counters...) happen 3
                # times — the result note says so explicitly.
                _cell_times = []
                for _crun in range(3):
                    _ct0 = _time.perf_counter()
                    exec(compile(_cell_body, "<console>", "exec"), _NS)
                    _cell_times.append(_time.perf_counter() - _ct0)
            elif _cell_magic == "cell-capture":
                exec(compile(_cell_body, "<console>", "exec"), _NS)
                _captured = _out.getvalue() + _err.getvalue()
                _NS["_capture"] = _captured
            elif _magic == "help":
                _out.write(_MAGIC_HELP + "\\n")
            elif _magic == "history":
                if _HISTORY:
                    _out.write("\\n".join("%d: %s" % (i + 1, c)
                                          for i, c in enumerate(_HISTORY)) + "\\n")
                else:
                    _out.write("(no submissions yet)\\n")
            elif _magic == "reset":
                _kept = len(_NS)
                _NS.clear()
                _NS.update({"__name__": "__console__",
                            "__builtins__": __builtins__, "__doc__": None})
                _NS["input"] = _console_input
                _out.write("Namespace reset — %d names cleared.\\n" % _kept)
            elif _magic in ("who", "whos"):
                _out.write(_format_who(_magic == "whos"))
            elif _magic == "tasks":
                # The Async tab twin: prints the same task tree the
                # /api/console {action:"tasks"} bridge returns, so the
                # magic and the panel always agree.
                _t_tasks, _t_note = _collect_tasks()
                for _t in _t_tasks:
                    _line = "  [%s] %s" % (_t["state"], _t["name"])
                    if _t.get("awaiting"):
                        _line += "  awaiting %s" % _t["awaiting"]
                    _out.write(_line + "\\n")
                    for _f in _t.get("stack") or []:
                        _out.write("      %s\\n" % _f)
                _out.write("%d task(s) — %s\\n" % (len(_t_tasks), _t_note))
            elif _timed and not _exec_code.strip():
                _err.write("Usage: %s <code>\\n"
                           % ("%time" if _magic == "time" else "%timeit-lite"))
            else:
                if _mode == "eval":
                    try:
                        _result = eval(_exec_code, _NS)
                        if _result is not None:
 # Jupyter-style Out[N] prefix (3c): _rid is the
                            # session's monotonic submission counter, the
                            # same number the client prints as In[N].
                            print("Out[%d]: %s" % (_rid, repr(_result)))
                    except SyntaxError:
                        exec(compile(_exec_code, "<console>", "exec"), _NS)
                else:
                    exec(compile(_exec_code, "<console>", "exec"), _NS)
    except BaseException as _e:
        _ok = False
        _error = "".join(traceback.format_exception_only(type(_e), _e)).strip() or str(_e)
        _err.write(traceback.format_exc(limit=6))
    if _timed:
        _dt = (_time.perf_counter() - _t0) * 1000.0
        if _magic == "timeit":
            _out.write("Single-shot: %.3f ms per run\\n" % _dt)
        else:
            _out.write("Wall time: %.3f ms\\n" % _dt)
    # ── Cell-magic result notes (4) ─────────────────────────────────
    if _cell_magic == "cell-time" and _cell_dt is not None:
        _out.write("Wall time: %.2fs\\n" % _cell_dt)
    if _cell_magic == "cell-timeit" and _cell_times:
        _best = min(_cell_times) * 1000.0
        _mean = sum(_cell_times) / float(len(_cell_times)) * 1000.0
        _out.write("Best of 3: %.3f ms per run (mean %.3f ms) — the cell "
                   "ran 3 times, so side effects repeat.\\n"
                   % (_best, _mean))
    if _cell_magic == "cell-capture" and _captured is not None:
        # Swallow the captured text (only on success — an erroring cell
        # reports normally) and leave the one-line note instead.
        _out.truncate(0)
        _out.seek(0)
        _err.truncate(0)
        _err.seek(0)
        _out.write("[%%%%capture] %d chars of stdout/stderr stored in "
                   "_capture\\n" % len(_captured))

    # Jupyter displayhook semantics: any still-open figures after the
    # submission are captured (and closed) so plain plt.plot() shows.
    try:
        _capture_open_figs()
        if _plt is not None:
            _plt.close("all")
            _CAPTURED_FIGS.clear()
    except Exception:
        pass
    _new_figs = _figures_captured[_before:]

    _emit({"id": _rid, "event": "stdout", "text": _out.getvalue()})
    _emit({"id": _rid, "event": "stderr", "text": _err.getvalue()})
    for _f in _new_figs:
        _emit({"id": _rid, "event": "figure", "name": _f})
    _emit({"id": _rid, "event": "end", "ok": _ok, "error": _error,
           "figures": _new_figs, "variables": _variables_snapshot()})

_emit({"event": "exit"})
`;
