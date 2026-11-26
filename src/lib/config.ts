/**
 * Project configuration — single source of truth for the app name and
 * other brandable bits.
 *
 * All values can be overridden via `NEXT_PUBLIC_*` env vars so the same
 * build works for any Python project, not just the original stats book.
 *
 * Put this in `.env.local`:
 *   NEXT_PUBLIC_APP_NAME="My Project Scripts"
 *   NEXT_PUBLIC_APP_TAGLINE="Browse · View · Run"
 *   NEXT_PUBLIC_SCRIPTS_DIR="python_scripts"
 */

function env(name: string, fallback: string): string {
    // Read from process.env on the server, and from the inlined NEXT_PUBLIC_
    // value on the client. We do a runtime check to keep TS happy.
    const v =
        (typeof process !== "undefined" && process.env?.[name]) || fallback;
    return v;
}

/** App display name (used in header, document title, README). */
export const APP_NAME = env("NEXT_PUBLIC_APP_NAME", "Praxis");

/** One-line tagline shown under the header. */
export const APP_TAGLINE = env(
    "NEXT_PUBLIC_APP_TAGLINE",
    "Theory into practice"
);

/** Directory holding folder folders. Defaults to `python_scripts`. */
export const SCRIPTS_DIR_NAME = env(
    "NEXT_PUBLIC_SCRIPTS_DIR",
    "python_scripts"
);

/**
 * Storage key prefixes — all localStorage keys used by the app are
 * prefixed with this so users can have multiple instances on the same
 * domain (one per project) without collisions.
 *
 * Defaults to a slug of APP_NAME.
 */
const KEY_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");
export const STORAGE_PREFIX = env(
    "NEXT_PUBLIC_STORAGE_PREFIX",
    KEY_SLUG
);
