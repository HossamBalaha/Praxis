import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {deslugify, getScriptsRoot, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";
import type {RefactorParams} from "@/lib/refactor-ops";
import {REFACTOR_TRANSFORMS} from "@/lib/refactor-ops";

/**
 * POST /api/refactor
 *
 * Body: { folder, file, code?, transform, params?, interpreter? }
 *
 * Behavior-preserving AST refactors implemented with ONLY the stdlib
 * ast module + ast.unparse. Every transform either produces runnable
 * code with the same runtime behavior or refuses with an explanatory
 * error ({ ok: false, error }, HTTP 200). The response carries the
 * rewritten source (`code`), a list of human-readable `edits`, and —
 * for move_symbol — `newFiles` (the new module plus rewritten
 * sibling files), with paths relative to the workspace folder.
 *
 * The transform engine itself is a FIXED, non-user Python script;
 * the user source is never inline in argv (100 KB / 28 KB budgets)
 * — it runs from its on-disk path or a staged temp file when a
 * buffer `code` override is supplied, mirroring /api/typecheck and
 * /api/lint's live-buffer handling.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;
const MAX_CODE_BYTES = 1_000_000;
const MAX_PARAMS_BYTES = 65_536;
const MAX_OUTPUT_BYTES = 10_000_000;

const TRANSFORM_IDS = new Set(REFACTOR_TRANSFORMS.map((t) => t.id));

/** Refactor engine — FIXED, non-user Python (stdlib ast only).
 *  argv: [src_path, transform, params_json, folder_root, parent_dir,
 *         src_rel, module_name] */
const REFACTOR_PY = String.raw`
import ast, builtins, copy, json, keyword, os, sys

MAX_FILE_BYTES = 1000000
MAX_SIBLINGS = 200

BUILTINS = set(dir(builtins))
IMPURE = (ast.Call, ast.Await, ast.Yield, ast.YieldFrom, ast.NamedExpr)
COMP_NODES = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
SCOPE_NODES = (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)

FALLBACK_STDLIB = frozenset((
    "abc", "argparse", "array", "ast", "asyncio", "base64", "binascii",
    "bisect", "calendar", "cmath", "collections", "concurrent", "configparser",
    "contextlib", "copy", "csv", "ctypes", "dataclasses", "datetime", "decimal",
    "difflib", "dis", "enum", "errno", "fractions", "functools", "gc",
    "getpass", "gettext", "glob", "gzip", "hashlib", "heapq", "html", "http",
    "importlib", "inspect", "io", "itertools", "json", "logging", "math",
    "mimetypes", "multiprocessing", "numbers", "operator", "os", "pathlib",
    "pickle", "platform", "pprint", "queue", "re", "secrets", "select",
    "shlex", "shutil", "signal", "site", "socket", "sqlite3", "statistics",
    "string", "struct", "subprocess", "sys", "tarfile", "tempfile", "textwrap",
    "threading", "time", "token", "traceback", "typing", "types", "unicodedata",
    "unittest", "urllib", "uuid", "warnings", "weakref", "xml", "zipfile", "zlib",
))

def emit(obj):
    print(json.dumps(obj))

def fail(msg):
    emit({"ok": False, "error": msg})
    sys.exit(0)

def iter_args(a):
    return list(getattr(a, "posonlyargs", [])) + list(a.args) + list(a.kwonlyargs) \
        + ([a.vararg] if a.vararg else []) + ([a.kwarg] if a.kwarg else [])

def build_parents(root):
    parents = {}
    for n in ast.walk(root):
        for ch in ast.iter_child_nodes(n):
            parents[ch] = n
    return parents

def find_stmt_site(root, target):
    """(stmt_list, index) holding the statement, or None."""
    def rec(node):
        for name in ("body", "orelse", "finalbody"):
            lst = getattr(node, name, None)
            if isinstance(lst, list):
                for i, s in enumerate(lst):
                    if s is target:
                        return (lst, i)
                    r = rec(s)
                    if r is not None:
                        return r
        for h in getattr(node, "handlers", None) or []:
            r = rec(h)
            if r is not None:
                return r
        return None
    return rec(root)

def enclosing_scope(root, node):
    parents = build_parents(root)
    cur = parents.get(node)
    while cur is not None and not isinstance(cur, SCOPE_NODES):
        cur = parents.get(cur)
    return cur if cur is not None else root

def binding_sites(scope, name):
    """Binding sites of the name visible in the scope owned by this scope node.
    Returns (sites, leaks): sites = [(node, kind)] bound in this scope;
    leaks = nested scopes that rebind the name via global/nonlocal (or
    after an own-zone global declaration)."""
    sites = []
    leaks = []
    declared = set()

    def note(n, kind):
        sites.append((n, kind))

    def visit(node, zone, decl):
        if node is None:
            return
        if isinstance(node, (str, bytes, int, float, complex, bool, type(None))):
            return
        if isinstance(node, ast.Name):
            if zone == "own" and node.id == name:
                if isinstance(node.ctx, ast.Store):
                    if name in decl:
                        # after a global declaration, stores rebind the OUTER name
                        leaks.append(node)
                    else:
                        note(node, "store")
                elif isinstance(node.ctx, ast.Del):
                    note(node, "del")
            return
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            if name in node.names:
                if zone == "own" and isinstance(node, ast.Global):
                    decl.add(name)
                else:
                    leaks.append(node)
            return
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if zone == "own":
                for al in node.names:
                    if al.name == "*":
                        continue
                    if isinstance(node, ast.Import) and not al.asname:
                        bound = al.name.split(".")[0]
                    else:
                        bound = al.asname or al.name
                    if bound == name:
                        note(node, "import")
            return
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if zone == "own" and node.name == name:
                note(node, "def")
            for d in node.decorator_list:
                visit(d, zone, decl)
            visit(node.returns, zone, decl)
            a = node.args
            for arg in iter_args(a):
                if zone == "own" and arg.arg == name:
                    note(node, "param")
                visit(arg.annotation, zone, decl)
            for d in list(a.defaults) + [d for d in a.kw_defaults if d is not None]:
                visit(d, zone, decl)
            for s in node.body:
                visit(s, "nested", set())
            return
        if isinstance(node, ast.Lambda):
            a = node.args
            for arg in iter_args(a):
                if zone == "own" and arg.arg == name:
                    note(node, "param")
            for d in list(a.defaults) + [d for d in a.kw_defaults if d is not None]:
                visit(d, zone, decl)
            visit(node.body, "nested", set())
            return
        if isinstance(node, ast.ClassDef):
            if zone == "own" and node.name == name:
                note(node, "class")
            for d in node.decorator_list:
                visit(d, zone, decl)
            for b in node.bases:
                visit(b, zone, decl)
            for kw in node.keywords:
                visit(kw.value, zone, decl)
            for s in node.body:
                visit(s, "nested", set())
            return
        if isinstance(node, COMP_NODES):
            for g in node.generators:
                visit(g.target, "nested", set())  # comp-local target
                visit(g.iter, zone, decl)
                for cond in g.ifs:
                    visit(cond, zone, decl)
            if isinstance(node, ast.DictComp):
                visit(node.key, zone, decl)
                visit(node.value, zone, decl)
            else:
                visit(node.elt, zone, decl)
            return
        if isinstance(node, ast.ExceptHandler):
            if zone == "own" and node.name == name:
                note(node, "except")
            for s in node.body:
                visit(s, zone, decl)
            return
        if isinstance(node, ast.NamedExpr):
            visit(node.value, zone, decl)
            if zone == "own" and isinstance(node.target, ast.Name) and node.target.id == name:
                note(node.target, "store")
            return
        if type(node).__name__ in ("MatchAs", "MatchStar"):
            nm = getattr(node, "name", None)
            if zone == "own" and nm == name:
                note(node, "match")
            for ch in ast.iter_child_nodes(node):
                visit(ch, zone, decl)
            return
        for ch in ast.iter_child_nodes(node):
            visit(ch, zone, decl)

    # ROOT dispatch: when the censused scope is itself a function /
    # lambda / class, its own payload (params, body) IS the "own" zone —
    # the generic branches above treat such nodes as NESTED scopes.
    if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
        a = scope.args
        for arg in iter_args(a):
            if arg.arg == name:
                note(scope, "param")
            visit(arg.annotation, "own", set())
        for d in list(a.defaults) + [dd for dd in a.kw_defaults if dd is not None]:
            visit(d, "own", set())
        for d in scope.decorator_list:
            visit(d, "own", set())
        visit(scope.returns, "own", set())
        for s in scope.body:
            visit(s, "own", set())
    elif isinstance(scope, ast.Lambda):
        a = scope.args
        for arg in iter_args(a):
            if arg.arg == name:
                note(scope, "param")
        for d in list(a.defaults) + [dd for dd in a.kw_defaults if dd is not None]:
            visit(d, "own", set())
        visit(scope.body, "own", set())
    elif isinstance(scope, ast.ClassDef):
        for d in scope.decorator_list:
            visit(d, "own", set())
        for b in scope.bases:
            visit(b, "own", set())
        for kw in scope.keywords:
            visit(kw.value, "own", set())
        for s in scope.body:
            visit(s, "own", set())
    else:
        visit(scope, "own", set())
    return sites, leaks

def stmts_scope_sites(stmts, nm):
    """Binding sites of a name in a list of statements treated as one
    function-body scope (used to detect parameter rebinding)."""
    sites = []
    leaks = []
    for s in stmts:
        si, le = binding_sites(s, nm)
        sites += si
        leaks += le
    return sites, leaks

def loads_in(node):
    out = []
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
            out.append(n)
    return out

def bound_in(node):
    """Every name bound anywhere inside the node (any scope) — a
    conservative superset used for free-name analysis."""
    b = set()
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            b.add(n.id)
        elif isinstance(n, ast.arg):
            b.add(n.arg)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            b.add(n.name)
        elif isinstance(n, ast.ExceptHandler) and n.name:
            b.add(n.name)
        elif type(n).__name__ in ("MatchAs", "MatchStar") and getattr(n, "name", None):
            b.add(n.name)
    return b

def is_pure(expr):
    return not any(isinstance(n, IMPURE) for n in ast.walk(expr))

def free_of(expr):
    bound = {n.id for n in ast.walk(expr) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}
    return {n.id for n in loads_in(expr)} - bound

def target_name_ids(t):
    out = []
    if isinstance(t, ast.Name):
        out.append(t.id)
    elif isinstance(t, ast.Starred):
        out.extend(target_name_ids(t.value))
    elif isinstance(t, (ast.Tuple, ast.List)):
        for e in t.elts:
            out.extend(target_name_ids(e))
    return out

def pick_node(nodes, line):
    """The node whose span contains the line (innermost wins), else the
    node with the nearest start line."""
    containing = [n for n in nodes if (n.lineno or 0) <= line <= (n.end_lineno or n.lineno or 0)]
    if containing:
        return min(containing, key=lambda n: (n.end_lineno or n.lineno) - n.lineno)
    return min(nodes, key=lambda n: (abs((n.lineno or 0) - line), n.lineno or 0))

def node_line(n):
    return getattr(n, "lineno", None)

def posix_rel(p, base):
    try:
        return os.path.relpath(p, base).replace(os.sep, "/")
    except ValueError:
        return os.path.basename(p)

# ─────────────────────────────────────────────────────────────
# organize_imports
# ─────────────────────────────────────────────────────────────

def organize_imports(tree, params, ctx):
    style = params.get("importsStyle") or "grouped"
    flat = style in ("flat", "single", "ungrouped")
    body = tree.body
    doc = None
    i = 0
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
            and isinstance(body[0].value.value, str):
        doc = body[0]
        i = 1
    future_stmts = []
    imports = []
    rest = []
    for stmt in body[i:]:
        if isinstance(stmt, ast.ImportFrom) and stmt.module == "__future__":
            future_stmts.append(stmt)
        elif isinstance(stmt, (ast.Import, ast.ImportFrom)):
            imports.append(stmt)
        else:
            rest.append(stmt)

    # usage census over everything EXCEPT the top-level imports
    used = set()
    strings = set()
    for stmt in rest + future_stmts:
        for n in ast.walk(stmt):
            if isinstance(n, ast.Name):
                used.add(n.id)
            elif isinstance(n, ast.Constant) and isinstance(n.value, str) and len(n.value) <= 64:
                strings.add(n.value)

    def alias_bound(stmt, al):
        if isinstance(stmt, ast.Import) and not al.asname:
            return al.name.split(".")[0]
        return al.asname or al.name

    for stmt in imports:
        for al in stmt.names:
            if al.name != "*" and alias_bound(stmt, al) in strings:
                # __all__ entries count as usage (F401 exemption)
                used.add(alias_bound(stmt, al))

    kept = []
    removed_names = []
    for stmt in imports:
        alive = []
        for al in stmt.names:
            if al.name == "*":
                alive.append(al)
            elif alias_bound(stmt, al) in used:
                alive.append(al)
            else:
                removed_names.append(alias_bound(stmt, al))
        if not alive:
            continue
        if len(alive) != len(stmt.names):
            stmt.names = alive
        kept.append(stmt)
    edits = []
    if removed_names:
        edits.append("Removed unused imports (F401): " + ", ".join(sorted(set(removed_names))) + ".")

    # local module names from the folder listing
    local_mods = set()
    if ctx["module_name"]:
        local_mods.add(ctx["module_name"])
    folder_dir = ctx["folder_dir"]
    if folder_dir and os.path.isdir(folder_dir):
        try:
            for entry in os.listdir(folder_dir)[:500]:
                if entry.endswith(".py") and entry != "__init__.py":
                    local_mods.add(entry[:-3])
                elif os.path.isdir(os.path.join(folder_dir, entry)):
                    if os.path.isfile(os.path.join(folder_dir, entry, "__init__.py")):
                        local_mods.add(entry)
        except OSError:
            pass
    try:
        stdlib = set(sys.stdlib_module_names)
    except AttributeError:
        stdlib = set(FALLBACK_STDLIB)

    def base_mod(stmt):
        if isinstance(stmt, ast.ImportFrom):
            return (stmt.module or "").split(".")[0]
        return stmt.names[0].name.split(".")[0]

    def group_of(stmt):
        if isinstance(stmt, ast.ImportFrom) and stmt.level > 0:
            return "local"
        base = base_mod(stmt)
        if base in local_mods:
            return "local"
        if base in stdlib:
            return "stdlib"
        return "third"

    def sort_key(stmt):
        if isinstance(stmt, ast.Import):
            return (stmt.names[0].name.lower(), 0)
        mod = ("." * stmt.level) + (stmt.module or "")
        return (mod.lower(), 1)

    if flat:
        blocks = ["\n".join(ast.unparse(s) for s in sorted(kept, key=sort_key))]
    else:
        blocks = []
        for grp in ("stdlib", "third", "local"):
            g = [s for s in kept if group_of(s) == grp]
            if g:
                g.sort(key=sort_key)
                blocks.append("\n".join(ast.unparse(s) for s in g))
    import_text = "\n\n".join(b for b in blocks if b)

    parts = []
    if doc is not None:
        parts.append(ast.unparse(doc))
    if future_stmts:
        parts.append("\n".join(ast.unparse(s) for s in future_stmts))
    if import_text:
        parts.append(import_text)
    if rest:
        # unparse via a Module wrapper so top-level statements keep
        # the usual blank-line separation between defs/classes
        parts.append(ast.unparse(ast.Module(body=rest, type_ignores=[])))
    code = "\n\n".join(p for p in parts if p) + "\n"

    if kept:
        edits.insert(0, "Organized %d import statement%s into %s." % (
            len(kept), "s" if len(kept) != 1 else "",
            "one sorted block" if flat else "stdlib / third-party / local blocks"))
    else:
        edits.insert(0, "No import statements remain after cleanup.")
    return code, edits, []

# ─────────────────────────────────────────────────────────────
# inline_variable
# ─────────────────────────────────────────────────────────────

def inline_variable(tree, params, ctx):
    name = params.get("name")
    if not isinstance(name, str) or not name or not name.isidentifier():
        fail("inline_variable requires params.name — the variable to inline.")
    line = params.get("line")
    if not isinstance(line, (int, float)):
        line = 0
    line = int(line)

    cands = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Assign) and len(n.targets) == 1 \
                and isinstance(n.targets[0], ast.Name) and n.targets[0].id == name:
            cands.append(n)
        elif isinstance(n, ast.AnnAssign) and n.value is not None \
                and isinstance(n.target, ast.Name) and n.target.id == name:
            cands.append(n)
    if not cands:
        fail("No simple assignment %r = <expr> found in the file." % name)
    best = pick_node(cands, line)
    expr = best.value
    tgt = best.targets[0] if isinstance(best, ast.Assign) else best.target

    scope = enclosing_scope(tree, best)
    if isinstance(scope, ast.ClassDef):
        fail("Cannot inline a class-level attribute (%r)." % name)

    sites, leaks = binding_sites(scope, name)
    if leaks:
        fail("Cannot inline %r: a nested scope rebinds it via global/nonlocal." % name)
    if len(sites) != 1 or sites[0][0] is not tgt:
        others = [s for s, _k in sites if s is not tgt]
        if others:
            where = ", ".join(str(node_line(s) or "?") for s in others[:5])
            fail("Cannot inline %r: it is bound more than once (also at line %s)." % (name, where))
        fail("Cannot inline %r: unexpected bindings exist in the enclosing scope." % name)

    if not is_pure(expr):
        fail("Cannot inline %r: its value expression has side effects (a call, await or yield)." % name)
    free = free_of(expr)
    if name in free:
        fail("Cannot inline %r: its value references the variable itself." % name)

    scope_is_module = isinstance(scope, ast.Module)
    for f in sorted(free):
        if f in BUILTINS:
            continue
        fsites, fleaks = binding_sites(scope, f)
        if scope_is_module:
            if len(fsites) != 1 or fleaks:
                fail("Cannot inline %r: %r (used in its value) is bound more than once." % (name, f))
            fl = node_line(fsites[0][0]) or 0
            if fl > (best.lineno or 0):
                fail("Cannot inline %r: %r is assigned after the inlined assignment." % (name, f))
        else:
            param_names = {a.arg for a in iter_args(scope.args)}
            if f in param_names:
                continue
            if len(fsites) == 1 and not fleaks:
                fl = node_line(fsites[0][0]) or 0
                if fl <= (best.lineno or 0):
                    continue
            if not fsites and not fleaks:
                msites, mleaks = binding_sites(tree, f)
                if len(msites) == 1 and not mleaks:
                    continue
            fail("Cannot inline %r: %r (used in its value) is not a stable, earlier binding." % (name, f))

    skip_names = {name} | free
    state = {"usages": 0}

    def scope_shadowed(scope_node):
        for nm in skip_names:
            s, l = binding_sites(scope_node, nm)
            if s or l:
                return True
        return False

    def comp_shadowed(n):
        for g in n.generators:
            for t in target_name_ids(g.target):
                if t in skip_names:
                    return True
        for x in ast.walk(n):
            if isinstance(x, ast.NamedExpr) and isinstance(x.target, ast.Name) \
                    and x.target.id in skip_names:
                return True
        return False

    class Inliner(ast.NodeTransformer):
        def visit_Name(self, n):
            if n.id == name and isinstance(n.ctx, ast.Load):
                state["usages"] += 1
                return ast.copy_location(copy.deepcopy(expr), n)
            return n

        def _guarded(self, n, shadowed):
            if shadowed:
                return n
            self.generic_visit(n)
            return n

        def visit_FunctionDef(self, n):
            return self._guarded(n, scope_shadowed(n))

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_Lambda(self, n):
            return self._guarded(n, scope_shadowed(n))

        def visit_ClassDef(self, n):
            return self._guarded(n, scope_shadowed(n))

        def visit_ListComp(self, n):
            return self._guarded(n, comp_shadowed(n))

        visit_SetComp = visit_ListComp
        visit_GeneratorExp = visit_ListComp
        visit_DictComp = visit_ListComp

    if isinstance(scope, ast.Module):
        stmts = tree.body
    else:
        stmts = scope.body
    new_stmts = []
    for s in stmts:
        r = Inliner().visit(s)
        if isinstance(r, list):
            new_stmts.extend(r)
        elif r is not None:
            new_stmts.append(r)
    # the original assignment object survived the transformer untouched
    new_stmts = [s for s in new_stmts if s is not best]
    if isinstance(scope, ast.Module):
        tree.body = new_stmts
    else:
        scope.body = new_stmts

    edits = [
        "Removed the assignment to %r (line %d) and inlined its value at %d place%s." % (
            name, best.lineno or 0, state["usages"],
            "s" if state["usages"] != 1 else ""),
    ]
    if state["usages"] == 0:
        edits.append("The variable had no other readers — the assignment was dead code.")
    return ast.unparse(tree) + "\n", edits, []

# ─────────────────────────────────────────────────────────────
# inline_function
# ─────────────────────────────────────────────────────────────

def inline_function(tree, params, ctx):
    name = params.get("name")
    if not isinstance(name, str) or not name:
        fail("inline_function requires params.name — the function to inline.")
    fns = [n for n in tree.body
           if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name]
    if not fns:
        fail("Function %r not found at module level." % name)
    fn = fns[0]
    if isinstance(fn, ast.AsyncFunctionDef):
        fail("Cannot inline an async function (its calls must be awaited).")
    if fn.decorator_list:
        fail("Cannot inline a decorated function (the wrapper would be lost).")
    a = fn.args
    if a.vararg or a.kwarg or a.kwonlyargs:
        fail("Cannot inline %r: *args / **kwargs / keyword-only parameters are not supported." % name)
    params_list = list(getattr(a, "posonlyargs", [])) + list(a.args)
    param_names = {p.arg for p in params_list}

    for r in [n for n in ast.walk(fn) if isinstance(n, ast.Return)]:
        val_none = r.value is None or (isinstance(r.value, ast.Constant) and r.value.value is None)
        if not (val_none and fn.body and fn.body[-1] is r):
            fail("Cannot inline %r: it returns a value or returns early (only a trailing bare return is allowed)." % name)
    for n in ast.walk(fn):
        if isinstance(n, (ast.Yield, ast.YieldFrom, ast.Await)):
            fail("Cannot inline %r: it yields or awaits." % name)
        if isinstance(n, ast.Nonlocal):
            fail("Cannot inline %r: it uses nonlocal." % name)

    msites, mleaks = binding_sites(tree, name)
    if mleaks or len(msites) != 1 or msites[0][0] is not fn:
        fail("Cannot inline %r: the name is bound more than once at module level." % name)

    body = list(fn.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
            and isinstance(body[0].value.value, str):
        body = body[1:]
    if body and isinstance(body[-1], ast.Return):
        body = body[:-1]
    if not body:
        fail("Function %r has an empty body — nothing to inline." % name)

    for p in params_list:
        s, l = stmts_scope_sites(body, p.arg)
        if s or l:
            fail("Cannot inline %r: parameter %r is reassigned inside the body." % (name, p.arg))
    for st in body:
        for n in ast.walk(st):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                for x in ast.walk(n):
                    if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Load) and x.id in param_names:
                        fail("Cannot inline %r: a nested scope closes over parameter %r." % (name, x.id))

    fn_bound = bound_in(fn)
    free = sorted(set(n.id for n in loads_in(fn)) - fn_bound - BUILTINS - {name})
    body_locals = sorted(fn_bound - param_names - {name})

    calls = [n for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == name]
    if not calls:
        fail("No call sites of %r were found in the file." % name)

    parents = build_parents(tree)

    def enclosing_stmt(n):
        cur = n
        while cur is not None and not isinstance(cur, ast.stmt):
            cur = parents.get(cur)
        return cur

    def scope_chain(n):
        chain = []
        cur = parents.get(n)
        while cur is not None:
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                chain.append(cur)
            cur = parents.get(cur)
        return chain

    ndef = len(a.defaults)

    # Validation pass over the PRISTINE tree: every safety check runs
    # before any splicing — a previously inlined call site's body would
    # otherwise register as a fresh name collision for the next site.
    plans = []
    for call in calls:
        for sc in scope_chain(call):
            for f in free:
                s, l = binding_sites(sc, f)
                if s or l:
                    fail("Cannot inline %r: name %r (used inside the function) is shadowed at the call site on line %s." % (name, f, call.lineno))
        for sc in scope_chain(call) + [tree]:
            for bl in body_locals:
                s, l = binding_sites(sc, bl)
                if s or l:
                    fail("Cannot inline %r: local name %r of the function collides with a binding at the call site on line %s." % (name, bl, call.lineno))

        st = enclosing_stmt(call)
        site = find_stmt_site(tree, st) if st is not None else None
        if st is None or site is None:
            fail("Internal error: could not locate the statement for a call on line %s." % call.lineno)
        carrier = None
        if isinstance(st, ast.Expr) and st.value is call:
            carrier = "expr"
        elif isinstance(st, ast.Assign) and len(st.targets) == 1 and st.value is call:
            carrier = "assign"
        elif isinstance(st, ast.Return) and st.value is call:
            carrier = "return"
        else:
            fail("Cannot inline the call on line %s: its result value is used in an expression." % call.lineno)

        vals = {}
        ok = True
        reason = ""
        for i, arg in enumerate(call.args):
            if isinstance(arg, ast.Starred):
                ok = False
                reason = "it passes a starred argument"
                break
            if i >= len(params_list):
                ok = False
                reason = "it passes too many positional arguments"
                break
            pn = params_list[i].arg
            if pn in vals:
                ok = False
                reason = "argument %r is passed twice" % pn
                break
            vals[pn] = arg
        if ok:
            for kw in call.keywords:
                if kw.arg is None:
                    ok = False
                    reason = "it passes **kwargs"
                    break
                if kw.arg not in param_names:
                    ok = False
                    reason = "it passes unknown keyword %r" % kw.arg
                    break
                if kw.arg in vals:
                    ok = False
                    reason = "argument %r is passed twice" % kw.arg
                    break
                vals[kw.arg] = kw.value
        if ok:
            for idx, p in enumerate(params_list):
                if p.arg in vals:
                    continue
                di = idx - (len(params_list) - ndef)
                if 0 <= di < ndef:
                    vals[p.arg] = a.defaults[di]
                else:
                    ok = False
                    reason = "it does not pass required argument %r" % p.arg
                    break
        if not ok:
            fail("Cannot inline the call on line %s: %s." % (call.lineno, reason))
        for v in vals.values():
            if not is_pure(v):
                fail("Cannot inline the call on line %s: an argument has side effects." % call.lineno)
        plans.append((call, st, vals, carrier))

    # Rewrite pass: substitute parameters with the mapped argument
    # expressions and splice the body into each carrier statement.
    # Sites are RECOMPUTED per splice — earlier splices shift the
    # statement lists, so precomputed indices would corrupt later ones.
    rewritten = 0
    for call, st, vals, carrier in plans:
        site = find_stmt_site(tree, st)
        if site is None:
            fail("Internal error: a carrier statement moved during inlining.")
        def substitute(stmt):
            stmt = copy.deepcopy(stmt)

            class Sub(ast.NodeTransformer):
                def visit_Name(self, n):
                    if n.id in vals and isinstance(n.ctx, ast.Load):
                        return ast.copy_location(copy.deepcopy(vals[n.id]), n)
                    return n
            return Sub().visit(stmt)

        new_stmts = [substitute(st2) for st2 in body]
        if carrier == "expr":
            repl = new_stmts
        elif carrier == "assign":
            tail = copy.deepcopy(st)
            tail.value = ast.Constant(value=None)
            ast.copy_location(tail.value, call)
            repl = new_stmts + [tail]
        else:
            tail = ast.Return(value=None)
            ast.copy_location(tail, st)
            repl = new_stmts + [tail]
        lst, i = site
        lst[i:i + 1] = repl
        rewritten += 1

    tree.body = [s for s in tree.body if s is not fn]
    edits = [
        "Removed the definition of %r (line %d) and inlined its body at %d call site%s." % (
            name, fn.lineno or 0, rewritten, "s" if rewritten != 1 else ""),
    ]
    if body_locals:
        edits.append("Note: the inlined body introduces the local names (%s) at each call site." % ", ".join(body_locals))
    return ast.unparse(tree) + "\n", edits, []

# ─────────────────────────────────────────────────────────────
# move_symbol
# ─────────────────────────────────────────────────────────────

def move_symbol(tree, params, ctx):
    line = params.get("line")
    target = params.get("target")
    sym_name = params.get("name")
    if not isinstance(target, str) or not target.strip():
        fail("move_symbol requires params.target — the new module name (e.g. \"utils\").")
    target = target.strip()
    if target.endswith(".py"):
        target = target[:-3]
    if not target.isidentifier() or keyword.iskeyword(target):
        fail("Invalid target module name %r." % target)
    module_name = ctx["module_name"]
    if module_name and target == module_name:
        fail("The target module must differ from the source module (%r)." % module_name)
    if not isinstance(line, (int, float)):
        line = 0
    line = int(line)

    cands = [s for s in tree.body if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    if sym_name:
        if not (isinstance(sym_name, str) and sym_name):
            fail("Invalid params.name.")
        cands = [s for s in cands if s.name == sym_name]
        if not cands:
            fail("Symbol %r not found at module level." % sym_name)
    if not cands:
        fail("No top-level def/class found near line %d." % line)
    sel = pick_node(cands, line)

    parent_dir = ctx["parent_dir"]
    folder_root = ctx["folder_dir"]
    src_rel = ctx["src_rel"]

    if parent_dir and os.path.isdir(parent_dir):
        if os.path.isfile(os.path.join(parent_dir, target + ".py")):
            fail("A module named %s.py already exists next to the file." % target)

    lines = source.split("\n")

    def slice_stmt(stmt):
        start = (stmt.lineno or 1) - 1
        end = stmt.end_lineno if stmt.end_lineno else stmt.lineno
        for d in getattr(stmt, "decorator_list", []) or []:
            start = min(start, (d.lineno or 1) - 1)
        return "\n".join(lines[start:end]).rstrip()

    sym_bound = bound_in(sel)
    free = sorted(set(n.id for n in loads_in(sel)) - sym_bound - BUILTINS)

    import_stmts = []
    from_source_names = []
    for f in free:
        imp = None
        for st in tree.body:
            if isinstance(st, ast.Import):
                for al in st.names:
                    bound = al.asname if al.asname else al.name.split(".")[0]
                    if bound == f:
                        imp = st
                        break
            elif isinstance(st, ast.ImportFrom):
                if st.module == "__future__":
                    continue
                for al in st.names:
                    if al.name == "*":
                        continue
                    if (al.asname or al.name) == f:
                        imp = st
                        break
            if imp is not None:
                break
        if imp is not None:
            import_stmts.append(imp)
        else:
            s, l = binding_sites(tree, f)
            if s or l:
                from_source_names.append(f)

    parts = ['"""Symbols moved from %s."""' % (module_name or "the original module")]
    for im in import_stmts:
        parts.append(slice_stmt(im))
    if module_name and from_source_names:
        parts.append("from %s import %s" % (module_name, ", ".join(sorted(from_source_names))))
    parts.append(slice_stmt(sel))
    new_module_code = "\n\n".join(p for p in parts if p) + "\n"

    # ── source rewrite via line splicing (comments and formatting kept)
    start = (sel.lineno or 1) - 1
    for d in getattr(sel, "decorator_list", []) or []:
        start = min(start, (d.lineno or 1) - 1)
    end = sel.end_lineno if sel.end_lineno else sel.lineno

    remaining = [s for s in tree.body if s is not sel]
    still = False
    for st in remaining:
        for n in ast.walk(st):
            if isinstance(n, ast.Name) and n.id == sel.name:
                still = True
            elif isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value == sel.name:
                still = True  # __all__ entries etc.
    if from_source_names and still:
        # Both directions import from each other — no import ordering
        # can make that runnable (whichever module loads second sees
        # a partially initialized counterpart). Refuse with the names.
        fail("Moving %r would create a circular import: the new module needs %s from the source module, while the source still uses %r. Move those dependencies into the new module as well (or drop the remaining uses) and retry." % (
            sel.name, ", ".join(from_source_names), sel.name))

    insert_idx = 0
    if still:
        last_imp_end = 0
        for st in remaining:
            if isinstance(st, (ast.Import, ast.ImportFrom)):
                last_imp_end = max(last_imp_end, st.end_lineno or st.lineno)
        if last_imp_end:
            insert_idx = last_imp_end
        elif remaining and isinstance(remaining[0], ast.Expr) \
                and isinstance(remaining[0].value, ast.Constant) \
                and isinstance(remaining[0].value.value, str):
            insert_idx = remaining[0].end_lineno or remaining[0].lineno

    new_lines = list(lines)
    removed_count = end - start
    del new_lines[start:end]
    if still:
        if insert_idx <= start:
            insert_at = insert_idx
        elif insert_idx > end:
            insert_at = max(insert_idx - removed_count, 0)
        else:
            insert_at = start
        new_lines.insert(insert_at, "from %s import %s" % (target, sel.name))

    # ── sibling import rewrites (best effort, line-spliced to keep
    #    their comments; only from-imports and module.attr uses)
    new_files = []
    star_notes = []
    skipped = 0
    real_base = src_rel.split("/")[-1] if src_rel else os.path.basename(ctx["src_path"])
    if parent_dir and os.path.isdir(parent_dir) and module_name:
        try:
            entries = sorted(os.listdir(parent_dir))
        except OSError:
            entries = []
        for entry in entries[:MAX_SIBLINGS]:
            if not entry.endswith(".py") or entry == real_base:
                continue
            p = os.path.join(parent_dir, entry)
            try:
                with open(p, "r", encoding="utf-8") as fh:
                    sib_src = fh.read()
                if len(sib_src) > MAX_FILE_BYTES:
                    skipped += 1
                    continue
                sib_tree = ast.parse(sib_src)
            except Exception:
                skipped += 1
                continue
            line_edits = []   # (line_no, col_start, col_end, text)
            block_edits = []  # (start_line, end_line, text)
            has_star = False
            for n in ast.walk(sib_tree):
                if isinstance(n, ast.ImportFrom) and n.level == 0 and n.module == module_name:
                    if any(al.name == "*" for al in n.names):
                        has_star = True
                        continue
                    if any(al.name == sel.name for al in n.names):
                        keep = [al for al in n.names if al.name != sel.name]
                        texts = []
                        if keep:
                            ns = copy.deepcopy(n)
                            ns.names = keep
                            texts.append(ast.unparse(ns))
                        texts.append("from %s import %s" % (target, sel.name))
                        block_edits.append((n.lineno, n.end_lineno or n.lineno, "\n".join(texts)))
                elif isinstance(n, ast.Attribute) and n.attr == sel.name \
                        and isinstance(n.value, ast.Name) and n.value.id == module_name:
                    v = n.value
                    if (v.end_lineno or v.lineno) == v.lineno:
                        line_edits.append((v.lineno, v.col_offset, v.end_col_offset, target))
            if line_edits or block_edits:
                sib_lines = sib_src.split("\n")
                for (sl, el, text) in sorted(block_edits, key=lambda e: -e[0]):
                    sib_lines[sl - 1:el] = text.split("\n")
                for (ln, c1, c2, txt) in sorted(line_edits, key=lambda e: (-e[0], -e[1])):
                    if ln - 1 < len(sib_lines):
                        linetext = sib_lines[ln - 1]
                        if c2 <= len(linetext):
                            sib_lines[ln - 1] = linetext[:c1] + txt + linetext[c2:]
                content = "\n".join(sib_lines)
                try:
                    ast.parse(content)
                except SyntaxError:
                    skipped += 1
                    continue
                new_files.append({"path": posix_rel(p, folder_root), "content": content})
            if has_star:
                star_notes.append(entry)

    if src_rel:
        prefix = src_rel.rsplit("/", 1)[0] + "/" if "/" in src_rel else ""
        mod_rel = prefix + target + ".py"
    else:
        mod_rel = target + ".py"
    new_files.insert(0, {"path": mod_rel, "content": new_module_code})

    code = "\n".join(new_lines)
    try:
        ast.parse(code)
    except SyntaxError:
        fail("Internal error: moving the symbol produced invalid source.")

    edits = ["Moved %s %r to a new module %r (file %s)." % (
        "class" if isinstance(sel, ast.ClassDef) else "def", sel.name, target, mod_rel)]
    if still:
        edits.append("The source module now imports %s from %s." % (sel.name, target))
    if from_source_names:
        edits.append("The new module imports %s back from %s (watch for circular imports)." % (
            ", ".join(from_source_names), module_name or "the source module"))
    if len(new_files) > 1:
        edits.append("Rewrote imports in %d sibling file%s: %s." % (
            len(new_files) - 1, "s" if len(new_files) != 2 else "",
            ", ".join(f["path"] for f in new_files[1:])))
    if star_notes:
        edits.append("Could not rewrite star-imports in %s — update them manually." % ", ".join(star_notes))
    if skipped:
        edits.append("%d sibling file%s skipped (unreadable or too large)." % (
            skipped, "s were" if skipped != 1 else " was"))
    return code, edits, new_files

# ─────────────────────────────────────────────────────────────
# change_signature
# ─────────────────────────────────────────────────────────────

def change_signature(tree, params, ctx):
    line = params.get("line")
    name = params.get("name")
    new_args = params.get("newArgs")
    if not isinstance(new_args, list) or not new_args:
        fail("change_signature requires params.newArgs — a non-empty list of { name, default? } objects.")
    parsed_new = []
    seen = set()
    for spec in new_args:
        if not isinstance(spec, dict) or not isinstance(spec.get("name"), str) or not spec["name"]:
            fail("Each newArgs entry must be an object with a 'name' string.")
        nm = spec["name"]
        if not nm.isidentifier() or keyword.iskeyword(nm):
            fail("Invalid parameter name %r." % nm)
        if nm in seen:
            fail("Duplicate parameter name %r." % nm)
        seen.add(nm)
        dflt = spec.get("default")
        dnode = None
        if dflt is not None and str(dflt).strip() != "":
            try:
                dnode = ast.parse(str(dflt), mode="eval").body
            except SyntaxError:
                fail("Invalid default expression for parameter %r: %r" % (nm, dflt))
        parsed_new.append((nm, dnode))
    seen_default = False
    for nm, d in parsed_new:
        if d is not None:
            seen_default = True
        elif seen_default:
            fail("Parameter %r needs a default — defaults must be trailing (no gaps)." % nm)

    fns = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if isinstance(name, str) and name:
        fns = [f for f in fns if f.name == name]
        if not fns:
            fail("Function %r not found." % name)
    if isinstance(line, (int, float)):
        line = int(line)
    else:
        line = None
    if line is None:
        if len(fns) != 1:
            fail("change_signature needs params.line (or a unique params.name) to pick the function.")
        fn = fns[0]
    else:
        fn = pick_node(fns, line)

    fa = fn.args
    if fa.vararg or fa.kwarg or fa.kwonlyargs:
        fail("Cannot change the signature of %r: *args / **kwargs / keyword-only parameters are not supported." % fn.name)

    parents = build_parents(tree)
    parent = parents.get(fn)
    is_method = isinstance(parent, ast.ClassDef)
    if is_method and any(isinstance(d, ast.Name) and d.id == "staticmethod" for d in fn.decorator_list):
        is_method = False

    old_params = list(getattr(fa, "posonlyargs", [])) + list(fa.args)

    prefix_param = None
    full_args = parsed_new
    if is_method and old_params:
        first = old_params[0].arg
        if first in ("self", "cls") and (not parsed_new or parsed_new[0][0] != first):
            prefix_param = first

    if prefix_param:
        full_args = [(prefix_param, None)] + parsed_new

    # Dropping a parameter the body still uses would leave a NameError
    # (or a stray local) behind — refuse instead of emitting broken code.
    new_arg_names = {nm for nm, d in full_args}
    for p in old_params:
        if p.arg not in new_arg_names:
            if any(isinstance(x, ast.Name) and x.id == p.arg for x in ast.walk(fn)):
                fail("The new signature drops parameter %r but the body of %r still uses it — keep it (or rename it) in newArgs." % (p.arg, fn.name))

    # rewrite the def (annotations on old parameters are dropped)
    had_annotations = any(p.annotation is not None for p in old_params)
    fa.posonlyargs = []
    fa.args = [ast.arg(arg=nm, annotation=None) for nm, d in full_args]
    fa.defaults = [d for nm, d in full_args if d is not None]
    fa.kwonlyargs = []
    fa.vararg = None
    fa.kwarg = None
    ast.fix_missing_locations(fn)

    sig = ", ".join(nm if d is None else nm + "=" + ast.unparse(d) for nm, d in full_args)
    edits = ["Changed the signature of %r to %s(%s)." % (fn.name, fn.name, sig)]
    if prefix_param:
        edits.append("Re-attached the implicit %r parameter of the method." % prefix_param)
    if had_annotations:
        edits.append("Parameter annotations from the old signature were dropped.")

    sites = []
    attr_skipped = 0
    cls_name = parent.name if isinstance(parent, ast.ClassDef) else None

    def enclosing_function(node):
        cur = parents.get(node)
        while cur is not None and not isinstance(
            cur, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)
        ):
            cur = parents.get(cur)
        return cur

    def instance_vars(scope_node):
        # Names bound to cls_name(...) constructor calls in the scope —
        # the common "c = Calc(); c.op(...)" receiver pattern.
        out = set()
        if scope_node is None or not cls_name:
            return out
        for st in ast.walk(scope_node):
            if isinstance(st, ast.Assign) and len(st.targets) == 1 \
                    and isinstance(st.targets[0], ast.Name) \
                    and isinstance(st.value, ast.Call) \
                    and isinstance(st.value.func, ast.Name) \
                    and st.value.func.id == cls_name:
                out.add(st.targets[0].id)
        return out

    for n in ast.walk(tree):
        if not isinstance(n, ast.Call):
            continue
        f = n.func
        if is_method:
            if isinstance(f, ast.Attribute) and f.attr == fn.name \
                    and isinstance(f.value, ast.Name):
                recv = f.value.id
                if recv in ("self", "cls") or recv in instance_vars(enclosing_function(n)):
                    sites.append(n)
                    continue
                attr_skipped += 1
            elif isinstance(f, ast.Name) and f.id == fn.name:
                attr_skipped += 1
        else:
            if isinstance(f, ast.Name) and f.id == fn.name:
                sites.append(n)
            elif isinstance(f, ast.Attribute) and f.attr == fn.name:
                attr_skipped += 1
    if not sites:
        fail("No rewritable call sites of %r were found." % fn.name)

    pos_base = 1 if (is_method and old_params) else 0
    effective_old = old_params[pos_base:] if is_method else old_params
    old_map = {p.arg: i for i, p in enumerate(effective_old)}
    new_param_names = [nm for nm, d in parsed_new]

    rewritten = 0
    problem_notes = []
    dropped_vals = 0
    for n in sites:
        old_vals = {}
        ok = True
        reason = ""
        for i, arg in enumerate(n.args):
            if isinstance(arg, ast.Starred):
                ok = False
                reason = "starred argument"
                break
            if i >= len(effective_old):
                ok = False
                reason = "too many positional arguments for the old signature"
                break
            pn = effective_old[i].arg
            if pn in old_vals:
                ok = False
                reason = "duplicate value for %r" % pn
                break
            old_vals[pn] = arg
        if ok:
            for kw in n.keywords:
                if kw.arg is None:
                    ok = False
                    reason = "**kwargs spread"
                    break
                if kw.arg not in old_map:
                    ok = False
                    reason = "unknown keyword %r" % kw.arg
                    break
                if kw.arg in old_vals:
                    ok = False
                    reason = "duplicate value for %r" % kw.arg
                    break
                old_vals[kw.arg] = kw.value
        if not ok:
            problem_notes.append("line %s (%s)" % (n.lineno, reason))
            continue
        dropped = [k for k in old_vals if k not in new_param_names]
        if dropped:
            dropped_vals += len(dropped)

        # positional prefix, keyword suffix from the first omission on
        new_vals = [(nm, old_vals.get(nm)) for nm in new_param_names]
        k = 0
        while k < len(new_vals) and new_vals[k][1] is not None:
            k += 1
        n.args = [v for nm, v in new_vals[:k]]
        n.keywords = [ast.keyword(arg=nm, value=v) for nm, v in new_vals[k:] if v is not None]
        ast.fix_missing_locations(n)
        rewritten += 1

    edits.append("Rewrote %d call site%s." % (rewritten, "s" if rewritten != 1 else ""))
    if dropped_vals:
        edits.append("Dropped %d argument value%s whose parameter no longer exists." % (
            dropped_vals, "s" if dropped_vals != 1 else ""))
    if problem_notes:
        edits.append("Left %d call site%s unchanged (unmappable): %s." % (
            len(problem_notes), "s" if len(problem_notes) != 1 else "", "; ".join(problem_notes)))
    if attr_skipped:
        edits.append("%d attribute-style call site%s (obj.%s(...)) left unchanged — the object type cannot be resolved statically." % (
            attr_skipped, "s" if attr_skipped != 1 else "", fn.name))
    return ast.unparse(tree) + "\n", edits, []

# ─────────────────────────────────────────────────────────────
# loop <-> comprehension
# ─────────────────────────────────────────────────────────────

def loop_to_comprehension(tree, params, ctx):
    line = params.get("line")
    if not isinstance(line, (int, float)):
        fail("loop_to_comprehension requires params.line — the loop's line.")
    line = int(line)
    fors = [n for n in ast.walk(tree) if isinstance(n, (ast.For, ast.AsyncFor))]
    if not fors:
        fail("No for-loop found in the file.")
    sel = pick_node(fors, line)
    if isinstance(sel, ast.AsyncFor):
        fail("Cannot convert an async for-loop into a comprehension.")
    if getattr(sel, "orelse", None):
        fail("The loop has an else branch — it cannot become a comprehension.")
    site = find_stmt_site(tree, sel)
    if site is None or site[1] == 0:
        fail("The for-loop is the first statement in its block — there is no preceding 'acc = []' to replace.")
    lst, i = site
    prev = lst[i - 1]
    if not (isinstance(prev, ast.Assign) and len(prev.targets) == 1
            and isinstance(prev.targets[0], ast.Name)
            and isinstance(prev.value, ast.List) and not prev.value.elts):
        fail("The statement right before the loop must be '<name> = []'.")
    acc = prev.targets[0].id
    scope = enclosing_scope(tree, sel)
    if isinstance(scope, ast.ClassDef):
        fail("Cannot convert a loop at class level.")
    s_sites, s_leaks = binding_sites(scope, acc)
    if s_leaks or len(s_sites) != 1 or s_sites[0][0] is not prev.targets[0]:
        fail("Cannot convert: %r is rebound somewhere else in the scope." % acc)

    appends = []
    conds = []

    def collect(stmts):
        for st in stmts:
            if isinstance(st, ast.If):
                if st.orelse:
                    fail("The loop body has an else/elif branch — not convertible.")
                conds.append(st.test)
                collect(st.body)
            elif isinstance(st, ast.Expr) and isinstance(st.value, ast.Call) \
                    and isinstance(st.value.func, ast.Attribute) and st.value.func.attr == "append" \
                    and isinstance(st.value.func.value, ast.Name) and st.value.func.value.id == acc \
                    and len(st.value.args) == 1 and not st.value.keywords:
                appends.append(st.value.args[0])
            else:
                fail("The loop body must only append to %r (found %s at line %s)." % (
                    acc, type(st).__name__, getattr(st, "lineno", "?")))

    collect(sel.body)
    if len(appends) != 1:
        fail("The loop body must append exactly once (found %d)." % len(appends))
    elt = appends[0]
    for root_ in [elt] + conds + [sel.iter]:
        for n in ast.walk(root_):
            if isinstance(n, ast.Name) and n.id == acc and isinstance(n.ctx, ast.Load):
                fail("The element/condition/iterable references %r itself." % acc)
            if isinstance(n, ast.NamedExpr):
                fail("Walrus operators inside the loop are not convertible.")

    comp = ast.ListComp(
        elt=elt,
        generators=[ast.comprehension(target=sel.target, iter=sel.iter, ifs=conds, is_async=0)],
    )
    new_assign = ast.Assign(
        targets=[ast.Name(id=acc, ctx=ast.Store())],
        value=comp,
    )
    ast.copy_location(new_assign, prev)
    ast.fix_missing_locations(new_assign)
    lst[i - 1] = new_assign
    del lst[i]
    edits = ["Converted the for-loop at line %d into a list comprehension assigned to %r." % (sel.lineno, acc)]
    return ast.unparse(tree) + "\n", edits, []

def comprehension_to_loop(tree, params, ctx):
    line = params.get("line")
    if not isinstance(line, (int, float)):
        fail("comprehension_to_loop requires params.line.")
    line = int(line)
    cands = [n for n in ast.walk(tree) if isinstance(n, ast.Assign) and len(n.targets) == 1
             and isinstance(n.targets[0], ast.Name) and isinstance(n.value, ast.ListComp)]
    if not cands:
        fail("No 'name = [...]' list comprehension assignment found.")
    sel = pick_node(cands, line)
    comp = sel.value
    acc = sel.targets[0].id
    for g in comp.generators:
        if getattr(g, "is_async", 0):
            fail("Async comprehensions are not supported.")

    body = [ast.Expr(value=ast.Call(
        func=ast.Attribute(value=ast.Name(id=acc, ctx=ast.Load()), attr="append", ctx=ast.Load()),
        args=[comp.elt],
        keywords=[],
    ))]
    for g in reversed(comp.generators):
        inner = body
        for c in reversed(g.ifs):
            inner = [ast.If(test=c, body=inner, orelse=[])]
        body = [ast.For(target=g.target, iter=g.iter, body=inner, orelse=[])]
    ast.fix_missing_locations(body[0])
    init = ast.Assign(targets=[ast.Name(id=acc, ctx=ast.Store())], value=ast.List(elts=[]))
    ast.fix_missing_locations(init)

    site = find_stmt_site(tree, sel)
    if site is None:
        fail("Internal error: the comprehension statement was not found in a body.")
    lst, i = site
    lst[i:i + 1] = [init, body[0]]

    target_ids = set()
    for g in comp.generators:
        for n in ast.walk(g.target):
            if isinstance(n, ast.Name):
                target_ids.add(n.id)
    later = False
    for st in lst[i + 2:]:
        for n in ast.walk(st):
            if isinstance(n, ast.Name) and n.id in target_ids:
                later = True
    edits = ["Expanded the list comprehension at line %d into a for-loop appending to %r." % (sel.lineno, acc)]
    if later:
        edits.append("Note: the loop variable stays bound after the loop (it was scoped to the comprehension before).")
    return ast.unparse(tree) + "\n", edits, []

# ─────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────

TRANSFORMS = {
    "organize_imports": organize_imports,
    "inline_variable": inline_variable,
    "inline_function": inline_function,
    "move_symbol": move_symbol,
    "change_signature": change_signature,
    "loop_to_comprehension": loop_to_comprehension,
    "comprehension_to_loop": comprehension_to_loop,
    "convert_loop": loop_to_comprehension,
}

src_path = sys.argv[1]
transform = sys.argv[2]
params_raw = sys.argv[3] if len(sys.argv) > 3 else "{}"
folder_root = sys.argv[4] if len(sys.argv) > 4 else ""
parent_dir = sys.argv[5] if len(sys.argv) > 5 else ""
src_rel = sys.argv[6] if len(sys.argv) > 6 else ""
module_name = sys.argv[7] if len(sys.argv) > 7 else ""

if transform not in TRANSFORMS:
    fail("Unknown transform %r." % transform)
if not hasattr(ast, "unparse"):
    fail("Refactoring requires Python 3.9+ (ast.unparse is missing).")

try:
    params = json.loads(params_raw) if params_raw else {}
except Exception:
    fail("Invalid params JSON.")
if not isinstance(params, dict):
    fail("params must be an object.")

try:
    with open(src_path, "r", encoding="utf-8") as f:
        source = f.read()
except Exception as e:
    fail("Could not read source: %s" % e)
try:
    tree = ast.parse(source)
except SyntaxError as e:
    fail("SyntaxError: %s (line %s)" % (e.msg, e.lineno))

ctx = {
    "folder_dir": folder_root,
    "parent_dir": parent_dir,
    "src_rel": src_rel,
    "module_name": module_name,
    "src_path": src_path,
}

code, edits, new_files = TRANSFORMS[transform](tree, params, ctx)
try:
    compile(code, "<praxis>", "exec")
except Exception as e:
    fail("Internal error: the transform produced code that does not compile (%s)." % e)
out = {"ok": True, "code": code, "edits": [{"description": d} for d in edits]}
if new_files:
    out["newFiles"] = new_files
emit(out)
`;

interface RefactorBody {
    folder?: string;
    file?: string;
    code?: string;
    transform?: string;
    params?: RefactorParams;
    interpreter?: string;
}

interface RefactorJson {
    ok: boolean;
    code?: string;
    edits?: Array<{ description: string }>;
    newFiles?: Array<{ path: string; content: string }>;
    error?: string;
}

export async function POST(request: Request) {
    let body: RefactorBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, code, transform} = body;
    if (!folder || !file || !transform) {
        return NextResponse.json(
            {error: "Body must include 'folder', 'file' and 'transform'."},
            {status: 400}
        );
    }
    if (!TRANSFORM_IDS.has(transform)) {
        return NextResponse.json(
            {ok: false, error: `Unknown transform ${JSON.stringify(transform)}.`},
            {status: 200}
        );
    }
    if (code !== undefined && code.length > MAX_CODE_BYTES) {
        return NextResponse.json(
            {error: "code exceeds 1 MB."},
            {status: 400}
        );
    }
    const params = body.params ?? {};
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
        return NextResponse.json(
            {error: "params must be an object."},
            {status: 400}
        );
    }
    const paramsJson = JSON.stringify(params);
    if (paramsJson.length > MAX_PARAMS_BYTES) {
        return NextResponse.json(
            {error: "params exceeds the size limit (64 KB)."},
            {status: 400}
        );
    }

    // Resolve: prefer the on-disk file; with a code override a virtual
    // in-root path is accepted (same guards as /api/file).
    const resolved = await resolveScriptPath(folder, file);
    let realPath: string;
    let folderName: string;
    let fileName: string;
    if (resolved) {
        try {
            const stat = await fs.stat(resolved.absPath);
            if (stat.size > MAX_CODE_BYTES) {
                return NextResponse.json(
                    {ok: false, error: "File is over 1 MB — too large to refactor."},
                    {status: 200}
                );
            }
        } catch {
            return NextResponse.json({error: "File not found."}, {status: 404});
        }
        realPath = resolved.absPath;
        folderName = resolved.folderName;
        fileName = resolved.fileName;
    } else {
        if (code === undefined) {
            return NextResponse.json({error: "File not found."}, {status: 404});
        }
        folderName = deslugify(folder);
        fileName = deslugify(file);
        if (
            !folderName ||
            !fileName ||
            folderName.includes("..") ||
            folderName.includes("/") ||
            folderName.includes("\\") ||
            fileName.includes("..") ||
            fileName.includes("\\") ||
            fileName.startsWith("/")
        ) {
            return NextResponse.json(
                {error: "Invalid folder or file slug."},
                {status: 400}
            );
        }
        if (!fileName.toLowerCase().endsWith(".py")) {
            return NextResponse.json(
                {error: "Not a Python file."},
                {status: 400}
            );
        }
        realPath = path.join(getScriptsRoot(), folderName, fileName);
        const rel = path.relative(getScriptsRoot(), realPath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json(
                {error: "Path traversal blocked."},
                {status: 400}
            );
        }
    }

    const folderRoot = path.join(getScriptsRoot(), folderName);
    const parentDir = path.dirname(realPath);
    const srcRel = path.relative(folderRoot, realPath).split(path.sep).join("/");
    const moduleName = path.basename(fileName, ".py");

    // The parent dir is only used for the move_symbol sibling scan —
    // pass it only when it actually exists on disk.
    let parentDirArg = "";
    try {
        const st = await fs.stat(parentDir);
        if (st.isDirectory()) parentDirArg = parentDir;
    } catch {
        /* virtual buffer or missing dir — sibling scan is skipped */
    }

    const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);

    // The fixed engine script + (optional) buffer source are staged in a
    // temp dir: the engine is too large for Windows' CreateProcess argv
    // budget and the buffer must never ride inline in argv.
    let cleanupDir: string | null = null;
    let result: Awaited<ReturnType<typeof runPyOnce>>;
    try {
        cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), "praxis-refactor-"));
        const scriptPath = path.join(cleanupDir, "refactor_engine.py");
        await fs.writeFile(scriptPath, REFACTOR_PY, "utf-8");
        const srcPath = code !== undefined
            ? path.join(cleanupDir, "source.py")
            : realPath;
        if (code !== undefined) {
            await fs.writeFile(srcPath, code, "utf-8");
        }
        result = await runPyOnce(
            interpreter,
            [
                scriptPath,
                srcPath,
                transform,
                paramsJson,
                folderRoot,
                parentDirArg,
                srcRel,
                moduleName,
            ],
            {timeoutMs: TIMEOUT_MS}
        );
    } catch {
        return NextResponse.json(
            {error: "Failed to stage the refactor engine."},
            {status: 500}
        );
    } finally {
        if (cleanupDir) {
            await fs.rm(cleanupDir, {recursive: true, force: true});
        }
    }

    if (!result.ok) {
        return NextResponse.json(
            {error: `Failed to launch Python: ${result.stderr}`},
            {status: 500}
        );
    }
    if (result.timedOut) {
        return NextResponse.json(
            {error: "Refactoring timed out (60 s)."},
            {status: 504}
        );
    }
    if (result.stdout.length > MAX_OUTPUT_BYTES) {
        return NextResponse.json(
            {error: "Refactor output exceeded the size cap."},
            {status: 500}
        );
    }
    const json = lastJsonLine<RefactorJson>(result.stdout);
    if (!json) {
        return NextResponse.json(
            {error: result.stderr || "No refactor result returned."},
            {status: 500}
        );
    }
    return NextResponse.json(json);
}
