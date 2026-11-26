/**
 * Shared catalog + types for the AST refactoring endpoints
 * (POST /api/refactor and friends). This module is intentionally
 * CLIENT-SAFE: it carries only the transform registry and the
 * request/response shapes so the UI can render the refactor menu
 * and type its fetch calls without importing server-only code.
 */

/** One entry per supported refactor transform. `needsSymbol` etc.
 *  tell the UI which extra input fields to show for the transform. */
export interface RefactorTransformMeta {
    id: string;
    label: string;
    hint: string;
    /** Transform needs a symbol/variable name (params.name). */
    needsSymbol?: boolean;
    /** Transform needs a target module name (params.target). */
    needsTarget?: boolean;
    /** Transform needs a new argument list (params.newArgs). */
    needsArgs?: boolean;
}

/** The exact set POST /api/refactor accepts as `transform`. */
export const REFACTOR_TRANSFORMS: RefactorTransformMeta[] = [
    {
        id: "organize_imports",
        label: "Organize imports",
        hint: "Sort and group imports (stdlib / third-party / local) and remove unused ones (F401).",
    },
    {
        id: "inline_variable",
        label: "Inline variable",
        hint: "Replace a single-assignment variable with its value everywhere and drop the assignment.",
        needsSymbol: true,
    },
    {
        id: "inline_function",
        label: "Inline function",
        hint: "Replace every call of a simple, return-less function with its body and remove the def.",
        needsSymbol: true,
    },
    {
        id: "move_symbol",
        label: "Move symbol to module",
        hint: "Move the def/class at a line into a new module next to the file and rewrite sibling imports.",
        needsSymbol: true,
        needsTarget: true,
    },
    {
        id: "change_signature",
        label: "Change signature",
        hint: "Rewrite the def's parameter list and update every call site (positional + keyword args).",
        needsArgs: true,
    },
    {
        id: "loop_to_comprehension",
        label: "Loop to comprehension",
        hint: "Turn `acc = []; for x in it: acc.append(e)` into `acc = [e for x in it]` when safe.",
    },
    {
        id: "comprehension_to_loop",
        label: "Comprehension to loop",
        hint: "Turn a `name = [ ... ]` list comprehension into an empty list plus a for-loop with append.",
    },
    {
        id: "convert_loop",
        label: "Convert loop",
        hint: "Alias of loop_to_comprehension.",
    },
];

/** Extra parameters the transforms accept. All fields optional;
 *  the route validates the ones the chosen transform actually needs. */
export interface RefactorParams {
    /** Variable/function/symbol name (inline_variable, inline_function, move_symbol). */
    name?: string;
    /** 1-based line the transform targets (nearest match wins). */
    line?: number;
    /** New module name for move_symbol (e.g. "utils"). */
    target?: string;
    /** New parameter list for change_signature. */
    newArgs?: Array<{ name: string; default?: string | null }>;
    /** "grouped" (default: stdlib/third-party/local blocks) or "flat". */
    importsStyle?: string;
}

/** POST /api/refactor request body. */
export interface RefactorRequest {
    /** Folder slug (base64url of the folder name). */
    folder: string;
    /** File slug (base64url of the file name, possibly nested path). */
    file: string;
    /** Optional buffer override — refactor the unsaved editor content. */
    code?: string;
    /** One of REFACTOR_TRANSFORMS[].id. */
    transform: string;
    /** Transform-specific parameters. */
    params?: RefactorParams;
    /** Interpreter override path (validated by findInterpreter). */
    interpreter?: string;
}

/** A file the transform wants created (or rewritten) next to the
 *  source file; paths are relative to the workspace folder. */
export interface RefactorNewFile {
    path: string;
    content: string;
}

/** Human-readable summary of what the transform changed. */
export interface RefactorEdit {
    description: string;
}

/** Successful POST /api/refactor response (ok: true). */
export interface RefactorSuccess {
    ok: true;
    /** The rewritten source of the requested file. */
    code: string;
    edits: RefactorEdit[];
    newFiles?: RefactorNewFile[];
}

/** Failed POST /api/refactor response (ok: false, HTTP 200). */
export interface RefactorFailure {
    ok: false;
    /** Why the transform was refused (safety rules or bad input). */
    error: string;
}

/** POST /api/refactor response — success or explanatory failure. */
export type RefactorResponse = RefactorSuccess | RefactorFailure;
