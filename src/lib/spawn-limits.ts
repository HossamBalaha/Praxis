/**
 * platform-aware limits for spawning with inline `-c` payloads.
 *
 * "Failed to launch
 * C:\Users\...\anaconda3\envs\tf\python.exe: ENAMETOOLONG: name too long,
 * uv_spawn".
 *
 * Root cause: Praxis runs Python scripts through `python -c <wrapped>`
 * (prelude + user source). Linux caps a single argv element at 128 KiB
 * (MAX_ARG_STRLEN) — the old guard switched to a temp file at 100 KB,
 * which was tuned to that limit ONLY. Windows has a much smaller ceiling:
 * CreateProcess caps the ENTIRE command line (program + all arguments,
 * NUL-terminated) at 32 767 UTF-16 code units. A script whose wrapped
 * payload is anywhere past ~30 KB therefore fails to spawn with libuv's
 * uv_spawn → ENAMETOOLONG on Windows, even though it runs fine on Linux.
 *
 * Every route that spawns with a large inline payload (run, run-all,
 * format/black) now asks this module how much may safely go through
 * argv, and falls back to a TEMP FILE (or stdin) beyond that:
 * - win32: 28 000 bytes (32 767-char CreateProcess cap minus the
 * interpreter path, quoting/escaping overhead, headroom for extra
 * argv like script args)
 * - other: 100 000 bytes (Linux MAX_ARG_STRLEN guard, unchanged)
 *
 * Only the BYTE LENGTH of the payload is measured; the caller keeps
 * responsibility for the rest of the command line.
 */

/** Maximum byte length of a script source that may be passed via `-c`. */
export const MAX_INLINE_SCRIPT_BYTES: number =
    process.platform === "win32" ? 28_000 : 100_000;

/** True when a source of `byteLength` bytes may go through argv on this
 *  platform (shared guard for run / run-all / format). */
export function inlineScriptSafe(byteLength: number): boolean {
    return byteLength <= MAX_INLINE_SCRIPT_BYTES;
}
