/**
 * data-file-types.ts — the CLIENT-SAFE shape of a data-file listing
 * entry, mirroring `DataFileInfo` from `@/lib/scripts`.
 *
 * Why a duplicate instead of importing the server type:
 * `src/lib/scripts.ts` imports `node:fs`, so importing it from a
 * client component would drag Node built-ins into the browser bundle
 * — the same reason `slug-codec.ts` exists as a standalone decoder.
 *
 * `slug` is the base64url encoding of the file's RELATIVE PATH inside
 * the folder (same contract as FileInfo.slug). /api/data-file and
 * /api/data-sheet accept it as the `file` query parameter so NESTED
 * data files ("Data Files/SensorReadings.csv") resolve; the legacy
 * plain-`name` parameter only reaches files sitting directly in the
 * folder root.
 */
export interface DataFileInfo {
    /** Display name (the basename), e.g. "samples.csv". */
    name: string;
    /** File size in bytes. */
    size: number;
    /** File extension (lowercase, including the dot). */
    ext: string;
    /** Modification time, ms since epoch. */
    mtime?: number;
    /** Relative sub-folder path inside the folder ("" = root). */
    dir?: string;
    /** Relative path incl. filename (POSIX separators). */
    path?: string;
    /** base64url slug of the relative path — the `file=` addressing form. */
    slug?: string;
}
