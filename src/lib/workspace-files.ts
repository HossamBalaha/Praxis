/**
 * three small per-project stores that
 * live in localStorage (they are per-BROWSER conveniences, like the
 * favorites — the durable project copies are the .praxis/ files):
 *
 *  - runEntryPoint: the "pinned" script the navbar Run button targets
 *    ("Pin as run entry point"). null = the currently open file.
 *  - lockedFiles: files locked read-only — the FileViewer hides Edit
 *    and shows a lock chip instead.
 *  - aiContextFile: the file "added to AI context"; the AI chat
 *    sidebar shows it as an attached context chip.
 */

const KEY_ENTRY = "praxis.run-entry-point";
const KEY_LOCKED = "praxis.locked-files";
const KEY_AI_CONTEXT = "praxis.ai-context-file";

export interface FileRef {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
}

function readKey<T>(key: string): T | null {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeKey(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* quota — ignore */
    }
}

function fileRefKey(ref: FileRef): string {
    return `${ref.folderSlug}/${ref.fileSlug}`;
}

// ─── Run entry point ────────────────────────────────────────────────

export function getRunEntryPoint(): FileRef | null {
    return readKey<FileRef>(KEY_ENTRY);
}

export function setRunEntryPoint(ref: FileRef | null): void {
    writeKey(KEY_ENTRY, ref);
    window.dispatchEvent(new CustomEvent("praxis:entry-point-changed"));
}

export function isRunEntryPoint(folderSlug: string, fileSlug: string): boolean {
    const ref = getRunEntryPoint();
    return !!ref && ref.folderSlug === folderSlug && ref.fileSlug === fileSlug;
}

// ─── Read-only locks ────────────────────────────────────────────────

export function getLockedFiles(): Record<string, string> {
    // map fileRefKey → fileName
    return readKey<Record<string, string>>(KEY_LOCKED) ?? {};
}

export function isFileLocked(folderSlug: string, fileSlug: string): boolean {
    return Object.prototype.hasOwnProperty.call(getLockedFiles(), fileRefKey({folderSlug, fileSlug, fileName: ""}));
}

export function setFileLocked(ref: FileRef, locked: boolean): void {
    const map = getLockedFiles();
    const key = fileRefKey(ref);
    if (locked) map[key] = ref.fileName;
    else delete map[key];
    writeKey(KEY_LOCKED, map);
    window.dispatchEvent(new CustomEvent("praxis:locked-files-changed"));
}

// ─── AI context attachment ──────────────────────────────────────────

export function getAiContextFile(): FileRef | null {
    return readKey<FileRef>(KEY_AI_CONTEXT);
}

export function setAiContextFile(ref: FileRef | null): void {
    writeKey(KEY_AI_CONTEXT, ref);
    window.dispatchEvent(new CustomEvent("praxis:ai-context-changed"));
}
