/**
 * The template picker's data source — src/data/templates-manifest.json.
 *
 * The manifest is GENERATED from src/lib/code-templates.ts (the TS
 * arrays PYTHON/MARKDOWN/IGNORE/TEXT/JSON/YAML/TOML/CSV_BLOCKS — the
 * editor's Insert-block libraries stay the runtime source for those
 * flows and are untouched), so every id / name / description / category
 * / template text in the picker mirrors the TS source exactly. 61
 * templates across 8 file kinds at generation time.
 *
 * This loader adds the picker-only vocabulary around the manifest:
 * file-kind metadata (labels + recommended extensions for the
 * file-name input), lookups by id, and the blocksForFile-equivalent
 * dispatch so the picker can be pre-filtered to the file the user is
 * standing in.
 */
import manifestJson from "@/data/templates-manifest.json";

/** One picker template — mirrors CodeBlockTemplate + the fileKind tag. */
export interface TemplateManifestEntry {
    /** Same id as the CodeBlockTemplate it mirrors. */
    id: string;
    /** Menu label (CodeBlockTemplate.label). */
    name: string;
    /** Tooltip / card description. */
    description: string;
    /** Rough grouping (CodeBlockTemplate.category). */
    category: string;
    /** Which Insert library it belongs to: python | markdown | gitignore |
     *  text | json | yaml | toml | csv. */
    fileKind: string;
    /** The template text (with {v:base}/{f:base}/... naming tokens and the
     *  optional $0 caret marker, exactly as in the TS source). */
    template: string;
}

interface ManifestShape {
    $comment: string;
    generatedFrom: string;
    entries: TemplateManifestEntry[];
}

const shape = manifestJson as ManifestShape;

/** The full picker list (stable order = the TS arrays' order). */
export const TEMPLATES_MANIFEST: TemplateManifestEntry[] = shape.entries;

/** Look one template up by id (null for unknown ids). */
export function templateById(id: string): TemplateManifestEntry | null {
    return TEMPLATES_MANIFEST.find((t) => t.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/*  File-kind metadata                                                 */

/* ------------------------------------------------------------------ */

export interface TemplateFileKindMeta {
    /** The manifest's fileKind key. */
    kind: string;
    /** Chip label. */
    label: string;
    /** Recommended extension for a NEW file of this kind (used to
     *  auto-complete the picker's file-name input when the user omits
     *  one). gitignore templates target the .gitignore FILENAME, not an
     *  extension. */
    defaultExtension: string;
    /** The concrete file name gitignore templates create. */
    fixedFileName?: string;
}

/** Display order + labels + recommended extensions per file kind. */
export const TEMPLATE_FILE_KINDS: TemplateFileKindMeta[] = [
    {kind: "python", label: "Python", defaultExtension: ".py"},
    {kind: "markdown", label: "Markdown", defaultExtension: ".md"},
    {kind: "gitignore", label: "Ignore files", defaultExtension: "", fixedFileName: ".gitignore"},
    {kind: "text", label: "Text", defaultExtension: ".txt"},
    {kind: "json", label: "JSON", defaultExtension: ".json"},
    {kind: "yaml", label: "YAML", defaultExtension: ".yaml"},
    {kind: "toml", label: "TOML", defaultExtension: ".toml"},
    {kind: "csv", label: "CSV", defaultExtension: ".csv"},
];

const KIND_META = new Map(TEMPLATE_FILE_KINDS.map((m) => [m.kind, m]));

export function fileKindMeta(kind: string): TemplateFileKindMeta {
    return (
        KIND_META.get(kind) ?? {
            kind,
            label: kind,
            defaultExtension: "",
        }
    );
}

/** Recommended extension for a template's file kind ("" when none). */
export function defaultExtensionFor(template: TemplateManifestEntry): string {
    return fileKindMeta(template.fileKind).defaultExtension;
}

/**
 * Manifest dispatch mirroring code-templates.ts blocksForFile — given a
 * FILE NAME, which templates apply (the ones the editor's Insert button
 * would offer in that file). "" / unknown extensions → every kind.
 */
export function templatesForFile(fileName: string | undefined): TemplateManifestEntry[] {
    const name = (fileName ?? "").toLowerCase();
    if (!name) return TEMPLATES_MANIFEST;
    const IGNORE_FILES = new Set([
        ".gitignore",
        ".gitattributes",
        ".dockerignore",
        ".eslintignore",
        ".npmignore",
    ]);
    if (IGNORE_FILES.has(name)) return byKind("gitignore");
    if (name.endsWith(".py") || name.endsWith(".pyw")) return byKind("python");
    if (name.endsWith(".md") || name.endsWith(".markdown")) return byKind("markdown");
    if (name.endsWith(".json")) return byKind("json");
    if (name.endsWith(".yaml") || name.endsWith(".yml")) return byKind("yaml");
    if (name.endsWith(".toml")) return byKind("toml");
    if (name.endsWith(".csv")) return byKind("csv");
    if (name.endsWith(".txt") || name.endsWith(".log")) return byKind("text");
    return TEMPLATES_MANIFEST;
}

function byKind(kind: string): TemplateManifestEntry[] {
    return TEMPLATES_MANIFEST.filter((t) => t.fileKind === kind);
}

/**
 * Render one manifest template's naming tokens against the app's
 * naming-style settings — re-exported from code-templates so a
 * PRAXIS_CREATE_FROM_TEMPLATE listener can turn the picked template into
 * final file CONTENT with the user's own naming style (the manifest
 * ships the raw tokens, exactly like the TS source).
 *
 * This is a LAZY re-export of renderTemplate (same module) — imported
 * indirectly so this lib stays the picker's single integration point.
 */
export {renderTemplate} from "@/lib/code-templates";
