/**
 * Python prelude injected at the top of every script before execution.
 *
 * Adds a wide range of instrumentation that the UI reads back through
 * the SSE stream:
 *
 * 1. matplotlib capture (figures → PNG/SVG files in the per-run temp
 * dir, served by /api/figure).
 * 2. Animation capture (matplotlib.animation → GIF/MP4 via the
 * animation's own save method, also written to the temp dir).
 * 3. DataFrame repr sniffing — when a script prints a pandas DataFrame
 * via `print(df)`, the prelude also writes the HTML repr to a
 * `<tmp>/dataframe_NNN.html` file that the UI can render as a
 * sortable table.
 * 4. Variable inspector — at interpreter shutdown, writes a JSON dump
 * of the `__main__` namespace (name, type, repr-preview) to
 * `<tmp>/variables.json`.
 * 5. Cell markers — recognises `# %%` blocks (VSCode / Jupyter cell
 * convention) and reports their line ranges so the UI can show
 * "Run cell" buttons.
 * 6. Code coverage — when the env var STATCOMP_TRACE=1 is set, installs
 * a `sys.settrace` hook that records which lines executed; writes
 * them to `<tmp>/coverage.json` at exit.
 * 7. Test recognition — when the script defines `def test_*` or
 * uses pytest, those become discoverable tests.
 *
 * the script is then executed normally with `exec(compile(...))`
 * using the script's own `__name__` set to `"__main__"` so its
 * `if __name__ == "__main__":` block runs.
 *
 * The prelude must NEVER call our wrapped `plt.savefig` from inside the
 * wrapper itself — that caused infinite recursion. All internal saves
 * go through the cached `_ORIGINAL_SAVEFIG` reference captured BEFORE
 * monkey-patching.
 */

/**
 * Build the prelude source.
 *
 * @param runTmpDir Absolute path to the per-run temp directory.
 * @param options Extra flags that turn on optional instrumentation.
 * `scriptPath` — the ABSOLUTE path of the user's.py file. When set,
 * `__file__`, `sys.argv[0]`, tracebacks and the coverage tracer all
 * report the REAL file path, so scripts that derive sibling paths
 * from `__file__` (e.g. `Path(__file__).with_suffix(".log")`) work
 * exactly like a local `python file.py` run. When unset (raw code
 * with no file) the legacy "<user script>" placeholder is used.
 */
export function buildPrelude(
    runTmpDir: string,
    options: {
        traceCoverage?: boolean;
        inspectVariables?: boolean;
        captureDataframes?: boolean;
        scriptPath?: string;
    } = {}
): string {
    const jsonDir = JSON.stringify(runTmpDir);
    const jsonScriptPath = JSON.stringify(options.scriptPath ?? "<user script>");
    const traceCoverage = options.traceCoverage ? "True" : "False";
    const inspectVariables = options.inspectVariables ? "True" : "False";
    const captureDataframes = options.captureDataframes ? "True" : "False";
    return `# === prelude (auto-generated, do not edit) ===
import os, sys, atexit, json, traceback
_RUN_TMP_DIR = ${jsonDir}
os.makedirs(_RUN_TMP_DIR, exist_ok=True)

# Counters + state for everything the prelude captures.
_FIG_COUNTER = [0]
_FIGURES = []                # list of filenames captured
_DATAFRAMES = []             # list of {html_file, name, shape}
_ANIMATIONS = []             # list of {video_file, name, format}
_TRACE_COVERAGE = ${traceCoverage}
_INSPECT_VARIABLES = ${inspectVariables}
_CAPTURE_DATAFRAMES = ${captureDataframes}
_COVERED_LINES = {}          # {filename: set(linenos)}
_USER_NS_REF = {}            # set by wrapScript footer; read by _dump_metadata
_TEST_FUNCTIONS = []        # list of test function names

# ------------------------------------------------------------------
# Matplotlib figure capture
# ------------------------------------------------------------------
try:
    import matplotlib
    matplotlib.use("Agg")  # headless backend
    import matplotlib.pyplot as _plt

    # CRITICAL: capture the original savefig BEFORE patching, and never
    # call _plt.savefig(...) from inside the wrapper — that would
    # recurse infinitely. All internal saves go through _ORIGINAL_SAVEFIG.
    _ORIGINAL_SAVEFIG = _plt.savefig
    _ORIGINAL_SHOW = _plt.show

    # Track which figure numbers have already been captured so we don't
    # produce duplicates. A figure is "captured" once we've written it
    # to disk. If the user calls savefig() then show(), the same figure
    # number would be captured twice without this set.
    _CAPTURED_FIGS = set()

    def _capture_current_figs(label=None):
        """Save every open figure to disk, skipping already-captured ones."""
        for num in list(_plt.get_fignums()):
            if num in _CAPTURED_FIGS:
                continue
            _FIG_COUNTER[0] += 1
            n = _FIG_COUNTER[0]
            target = os.path.join(_RUN_TMP_DIR, f"figure_{n:03d}.png")
            try:
                # Use the ORIGINAL savefig so we don't recurse.
                _ORIGINAL_SAVEFIG(
                    target, format="png", bbox_inches="tight", dpi=120,
                    facecolor=_plt.figure(num).get_facecolor(),
                )
                _FIGURES.append(os.path.basename(target))
                _CAPTURED_FIGS.add(num)
 # interactive figure. When mpld3 is
                # installed, ALSO write a zoom/pan HTML companion next
                # to the PNG. The run route advertises it as
                # interactiveUrl; the Figures panel then offers a
                # "Interactive" toggle. Failures are silent — static
                # PNG capture must never depend on mpld3 being there.
                try:
                    import mpld3 as _mpld3
                    _html_target = os.path.join(_RUN_TMP_DIR, f"figure_{n:03d}.html")
                    _html = _mpld3.fig_to_html(_plt.figure(num), template_type="simple")
                    with open(_html_target, "w", encoding="utf-8") as _fh:
                        _fh.write(_html)
                except ImportError:
                    pass
                except Exception:
                    pass
            except Exception as _e:
                sys.stderr.write(f"[prelude] could not save figure {n}: {_e}\\n")

    def _patched_savefig(fname=None, *args, **kwargs):
        """Wraps plt.savefig. Captures a copy, then forwards to the user."""
        # Always capture a copy in our temp dir first.
        _capture_current_figs(label=getattr(fname, "__str__", lambda: None)() if fname else None)
        # Then forward to the original so the user gets their file too.
        try:
            _ORIGINAL_SAVEFIG(fname, *args, **kwargs)
        except Exception:
            # Don't let a bad user-supplied path crash the run.
            pass

    def _patched_show(*args, **kwargs):
        """plt.show() in headless mode flushes each open figure to disk."""
        _capture_current_figs(label="show")
        _plt.close("all")
        # After close("all"), the figure numbers are freed. Clear the
        # captured set so that if the user creates new figures with the
        # same numbers (matplotlib reuses fignum 1 after close("all")),
        # they get captured.
        _CAPTURED_FIGS.clear()

    _plt.savefig = _patched_savefig
    _plt.show = _patched_show

    # Animation capture — matplotlib.animation.Animation.save().
    try:
        from matplotlib.animation import Animation as _Animation
        _ORIGINAL_ANIM_SAVE = _Animation.save

        def _patched_anim_save(self, filename, *args, **kwargs):
            """Capture animation save calls."""
            try:
                _ORIGINAL_ANIM_SAVE(self, filename, *args, **kwargs)
                # If the user's filename is in our tmp dir already, skip
                # the copy. Otherwise also copy into our tmp dir.
                if not os.path.abspath(filename).startswith(_RUN_TMP_DIR):
                    _FIG_COUNTER[0] += 1
                    n = _FIG_COUNTER[0]
                    ext = os.path.splitext(filename)[1] or ".gif"
                    target = os.path.join(_RUN_TMP_DIR, f"figure_{n:03d}{ext}")
                    import shutil
                    shutil.copyfile(filename, target)
                    _FIGURES.append(os.path.basename(target))
                    _ANIMATIONS.append({"file": os.path.basename(target), "name": str(filename)})
            except Exception as _e:
                sys.stderr.write(f"[prelude] animation capture failed: {_e}\\n")
        _Animation.save = _patched_anim_save
    except ImportError:
        pass

    def _atexit_figs():
        try:
            _capture_current_figs(label="atexit")
        except Exception:
            pass
    atexit.register(_atexit_figs)
except ImportError:
    # matplotlib not installed — that's fine.
    _plt = None

# ------------------------------------------------------------------
# DataFrame HTML capture
# ------------------------------------------------------------------
if _CAPTURE_DATAFRAMES:
    try:
        import pandas as _pd
        _ORIGINAL_PRINT = print
        _DF_COUNTER = [0]

        def _patched_print(*args, **kwargs):
            # Sniff for DataFrame/Series args and capture an HTML repr.
            for a in args:
                try:
                    if isinstance(a, (_pd.DataFrame, _pd.Series)):
                        _DF_COUNTER[0] += 1
                        n = _DF_COUNTER[0]
                        html_path = os.path.join(_RUN_TMP_DIR, f"dataframe_{n:03d}.html")
                        with open(html_path, "w", encoding="utf-8") as f:
                            f.write(a.to_html(classes="df-preview", border=0, max_rows=50))
                        _DATAFRAMES.append({
                            "html_file": os.path.basename(html_path),
                            "name": getattr(a, "__name__", "df"),
                            "shape": list(a.shape) if hasattr(a, "shape") else [],
                            "dtype": "DataFrame" if isinstance(a, _pd.DataFrame) else "Series",
                        })
                except Exception:
                    pass
            _ORIGINAL_PRINT(*args, **kwargs)
        import builtins
        builtins.print = _patched_print
    except ImportError:
        pass

# ------------------------------------------------------------------
# Test function discovery
# ------------------------------------------------------------------
def _record_test(name):
    if name.startswith("test_") and name not in _TEST_FUNCTIONS:
        _TEST_FUNCTIONS.append(name)

# ------------------------------------------------------------------
# Coverage tracing
# ------------------------------------------------------------------
if _TRACE_COVERAGE:
    import sys as _sys
    _USER_FILE = ${jsonScriptPath}
    def _trace_fn(frame, event, arg):
        try:
            if event == "line":
                fn = frame.f_code.co_filename
                if fn == _USER_FILE or fn.endswith(".py"):
                    if fn not in _COVERED_LINES:
                        _COVERED_LINES[fn] = set()
                    _COVERED_LINES[fn].add(frame.f_lineno)
        except Exception:
            pass
        return _trace_fn
    _sys.settrace(_trace_fn)

# ------------------------------------------------------------------
# atexit dump of metadata
# ------------------------------------------------------------------
def _dump_metadata():
    # Variables (top-level __main__ namespace). We read from the
    # _USER_NS_REF that the wrapScript footer sets after exec() — this
    # captures every name the user defined at module scope.
    variables = []
    if _INSPECT_VARIABLES:
        ns = _USER_NS_REF
        for name in ns:
            if name.startswith("_") or name in ("__name__", "__file__", "__builtins__"):
                continue
            try:
                val = ns[name]
                if callable(val) and not hasattr(val, "__module__"):
                    continue
                if isinstance(val, type):
                    continue
                # Capture a truncated repr.
                try:
                    r = repr(val)
                    if len(r) > 200:
                        r = r[:200] + "…"
                except Exception:
                    r = "<unreprable>"
                variables.append({
                    "name": name,
                    "type": type(val).__name__,
                    "repr": r,
                })
            except Exception:
                pass
    try:
        with open(os.path.join(_RUN_TMP_DIR, "variables.json"), "w") as f:
            json.dump(variables, f)
    except Exception:
        pass

    # Coverage.
    if _COVERED_LINES:
        try:
            with open(os.path.join(_RUN_TMP_DIR, "coverage.json"), "w") as f:
                json.dump(
                    {k: sorted(v) for k, v in _COVERED_LINES.items()},
                    f,
                )
        except Exception:
            pass

    # DataFrames index.
    if _DATAFRAMES:
        try:
            with open(os.path.join(_RUN_TMP_DIR, "dataframes.json"), "w") as f:
                json.dump(_DATAFRAMES, f)
        except Exception:
            pass

    # Tests index.
    if _TEST_FUNCTIONS:
        try:
            with open(os.path.join(_RUN_TMP_DIR, "tests.json"), "w") as f:
                json.dump(_TEST_FUNCTIONS, f)
        except Exception:
            pass

atexit.register(_dump_metadata)

# === end prelude ===
`;
}

/**
 * Wrap the script source with the prelude so the figures get
 * captured and the script still runs as `__main__`.
 *
 * `scriptPath` (absolute path of the.py file on disk) makes the run
 * behave like `python <path>`: `__file__` is the real path (so
 * `Path(__file__).parent / "data.csv"` and friends resolve against the
 * file's folder), tracebacks point at the real file + line numbers,
 * and `sys.argv[0]` is the script instead of "-c".
 */
export function wrapScript(
    source: string,
    runTmpDir: string,
    options: {
        traceCoverage?: boolean;
        inspectVariables?: boolean;
        captureDataframes?: boolean;
        scriptPath?: string;
    } = {}
): string {
    const prelude = buildPrelude(runTmpDir, options);
    const jsonScriptPath = JSON.stringify(options.scriptPath ?? "<user script>");
    // We exec the source with the same __name__ semantics a normal
    // python invocation would have, so `if __name__ == "__main__":` blocks
    // fire correctly. After exec we also walk the user namespace for
    // test functions so the prelude knows about them.
    //
    // _user_ns is stored as a module-level global so the atexit
    // _dump_metadata function can read its contents for the variable
    // inspector.
    return `${prelude}
# The user's REAL script path — everything below (tracebacks, __file__,
# sys.argv[0]) reports it exactly like a local 'python file.py' run.
__file__ = ${jsonScriptPath}
try:
    if sys.argv and sys.argv[0] in ("-c", "__wrapped_script__.py"):
        sys.argv[0] = __file__
except Exception:
    pass
_user_ns = {"__name__": "__main__", "__file__": __file__}
exec(compile(${JSON.stringify(source)}, __file__, "exec"), _user_ns)
# Discover test_* functions defined by the user.
for _n in list(_user_ns.keys()):
    if _n.startswith("test_") and callable(_user_ns[_n]):
        _record_test(_n)
# Expose user-level names at module scope so the variable inspector
# (which reads _user_ns in _dump_metadata) sees them. We also copy
# them to globals() so any code running after this line sees them.
for _n, _v in _user_ns.items():
    if not _n.startswith("__"):
        globals()[_n] = _v
# Make _user_ns visible to the atexit handler.
_USER_NS_REF = _user_ns
`;
}
