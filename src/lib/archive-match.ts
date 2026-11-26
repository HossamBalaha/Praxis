/**
 * Pure archive-name matching — extracted from archive-tools.tsx so
 * clients can test a file name WITHOUT importing the whole (heavy,
 * now code-split) ArchiveTools component. archive-tools re-exports
 * this for API compatibility.
 */

const ARCHIVE_RE = /\.(zip|tar|tgz|gz|bz2|xz|7z|rar|tar\.gz|tar\.bz2|tar\.xz|tbz2|txz)$/i;

export function isArchiveFileName(fileName: string): boolean {
    return ARCHIVE_RE.test(fileName);
}
