"use client";

import * as React from "react";
import {
    Ban,
    Braces,
    CircleAlert,
    FileCode2,
    FilePlus,
    FileText,
    FileType2,
    Loader2,
    Search,
    Sparkles,
    Table as TableIcon,
    X,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import {
    defaultExtensionFor,
    TEMPLATE_FILE_KINDS,
    type TemplateManifestEntry,
    TEMPLATES_MANIFEST,
} from "@/lib/templates-manifest";

/**
 * TemplatePickerDialog — the scaffolding-gallery replacement for the
 * old "New From Template" window.prompt flow (choose-an-index prompt +
 * name prompt): a searchable, filterable gallery of every template in
 * the manifest (src/data/templates-manifest.json — generated from
 * src/lib/code-templates.ts so ids/descriptions stay in sync with the
 * Insert-block libraries), with a preview of the first ~15 lines, a
 * file-name input with LIVE validation (illegal filename characters,
 * Windows reserved device names, hidden-file rules, uniqueness in the
 * target folder when the host knows its files), and a Create button.
 *
 * Create emits the choice TWO ways, always both:
 *   1. the onCreate callback prop ({ templateId, fileName });
 *   2. a window CustomEvent "PRAXIS_CREATE_FROM_TEMPLATE" with the same
 *      { templateId, fileName } detail — so page.tsx can own creation
 *      (fetch templateById(templateId).template, renderTemplate(...) it
 *      with the naming-style settings, then POST /api/file-create) with
 *      zero prop drilling.
 *
 * The dialog never writes files itself — creation belongs to the host
 * (the prompt flow it replaces also left creation to the page).
 */

/* ------------------------------------------------------------------ */
/*  Props                                                               */

/* ------------------------------------------------------------------ */

export interface TemplatePickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Receives the chosen template + validated file name on Create. */
    onCreate?: (detail: { templateId: string; fileName: string }) => void;
    /** The target folder's existing file NAMES (uniqueness check). Omit
     *  when the folder is unknown — the check then only validates shape. */
    folderFiles?: string[];
    /** Target folder display name (header copy only). */
    folderName?: string;
    /** Restrict the gallery to these file kinds (defaults to all 8). */
    fileKinds?: string[];
    /** Pre-filter to the file the user stands in (templatesForFile). */
    forFileName?: string;
    /** Busy flag — Create shows a spinner and stays disabled while the
     *  host writes the file. The dialog does NOT close itself in that
     *  window; the host closes it via onOpenChange(false). */
    creating?: boolean;
}

/* ------------------------------------------------------------------ */
/*  File-name validation (shared, exported for the host's own flows)    */
/* ------------------------------------------------------------------ */

/** Characters Windows forbids in file names (plus control chars). */
const ILLEGAL_CHARS_RE = /[<>:"/\\|?*\u0000-\u001f]/;
/** Windows reserved device names — banned with ANY extension. */
const WINDOWS_RESERVED = new Set([
    "CON", "PRN", "AUX", "NUL",
    ...Array.from({length: 9}, (_, i) => `COM${i + 1}`),
    ...Array.from({length: 9}, (_, i) => `LPT${i + 1}`),
]);
/** Dotfiles the /api/file-create route accepts (the gitignore-family
 *  templates target these; anything else hidden is rejected there). */
const DOTFILE_ALLOWLIST = new Set([
    ".gitignore",
    ".gitattributes",
    ".dockerignore",
    ".eslintignore",
    ".npmignore",
]);
/** Max sensible length — the routes cap at ~200, be kinder than that. */
const NAME_MAX = 120;

export interface TemplateFileNameCheck {
    /** False when the blocking `error` is present. */
    ok: boolean;
    /** The name as it will be created (missing extension appended). */
    finalName: string;
    /** Blocking problem, ready to render. */
    error?: string;
    /** Non-blocking note (e.g. the appended extension). */
    hint?: string;
}

/**
 * Live validation for the new file name — Windows-safe by design (the
 * app runs on F:\Praxis too): illegal characters, reserved device
 * names, hidden-file rules, trailing dots/spaces, length, and
 * case-insensitive uniqueness against the target folder when known.
 * A missing extension is NOT an error — the recommended one is appended
 * into `finalName` and surfaced as a hint.
 */
export function validateTemplateFileName(
    raw: string,
    opts: {
        /** Extension the template's file kind recommends ("" = none). */
        recommendedExt?: string;
        /** True for gitignore-family templates (dotfiles only). */
        dotfileOnly?: boolean;
        /** Existing file names in the target folder (case-insensitive). */
        existing?: string[];
    }
): TemplateFileNameCheck {
    const name = raw.trim();
    if (!name) {
        return {ok: false, finalName: "", error: "Enter a file name."};
    }
    const illegal = ILLEGAL_CHARS_RE.exec(name);
    if (illegal) {
        return {
            ok: false,
            finalName: name,
            error: `File names can't contain ${JSON.stringify(illegal[0])} (Windows forbids < > : " / \\ | ? *).`,
        };
    }
    if (name.length > NAME_MAX) {
        return {
            ok: false,
            finalName: name,
            error: `Keep the name under ${NAME_MAX} characters.`,
        };
    }
    if (name.endsWith(".") || name.endsWith(" ")) {
        return {
            ok: false,
            finalName: name,
            error: "File names can't end with a dot or a space.",
        };
    }
    if (name.startsWith(".")) {
        if (!DOTFILE_ALLOWLIST.has(name.toLowerCase())) {
            return {
                ok: false,
                finalName: name,
                error: "Hidden dotfiles can only be the standard ignore files (.gitignore, .gitattributes, .dockerignore…).",
            };
        }
    } else if (opts.dotfileOnly) {
        return {
            ok: false,
            finalName: name,
            error: "Ignore-file templates create the standard dotfiles — pick a name like .gitignore.",
        };
    }
    const stem = name.split(".")[0] ?? "";
    if (WINDOWS_RESERVED.has(stem.toUpperCase())) {
        return {
            ok: false,
            finalName: name,
            error: `"${stem}" is a reserved Windows device name — pick another.`,
        };
    }
    // Uniqueness — case-insensitive (Windows filesystems don't see case).
    if (opts.existing && opts.existing.some((f) => f.toLowerCase() === name.toLowerCase())) {
        return {
            ok: false,
            finalName: name,
            error: `"${name}" already exists in this folder.`,
        };
    }
    // Missing extension: append the recommended one (never an error).
    const hasExt = /\.[A-Za-z0-9]+$/.test(name) || name.startsWith(".");
    if (!hasExt && opts.recommendedExt) {
        const finalName = name + opts.recommendedExt;
        return {
            ok: true,
            finalName,
            hint: `Will be created as ${finalName}.`,
        };
    }
    return {ok: true, finalName: name};
}

/** Suggested starting name for a template's file kind (input prefill). */
function suggestedName(kind: string): string {
    switch (kind) {
        case "python":
            return "NewScript.py";
        case "markdown":
            return "NewNote.md";
        case "text":
            return "Notes.txt";
        case "json":
            return "config.json";
        case "yaml":
            return "config.yaml";
        case "toml":
            return "config.toml";
        case "csv":
            return "data.csv";
        case "gitignore":
            return ".gitignore";
        default:
            return "NewFile";
    }
}

/* ------------------------------------------------------------------ */
/*  Icons                                                               */

/* ------------------------------------------------------------------ */

function KindIcon({kind, className}: { kind: string; className?: string }) {
    const cls = cn("shrink-0", className);
    switch (kind) {
        case "python":
            return <FileCode2 className={cn(cls, "text-emerald-500")} aria-hidden/>;
        case "markdown":
            return <FileText className={cn(cls, "text-sky-500")} aria-hidden/>;
        case "gitignore":
            return <Ban className={cn(cls, "text-red-500")} aria-hidden/>;
        case "json":
            return <Braces className={cn(cls, "text-amber-500")} aria-hidden/>;
        case "csv":
            return <TableIcon className={cn(cls, "text-cyan-500")} aria-hidden/>;
        case "text":
        case "yaml":
        case "toml":
            return <FileType2 className={cn(cls, "text-muted-foreground")} aria-hidden/>;
        default:
            return <Sparkles className={cn(cls, "text-violet-500")} aria-hidden/>;
    }
}

/* ------------------------------------------------------------------ */
/*  The dialog                                                          */

/* ------------------------------------------------------------------ */

export function TemplatePickerDialog({
                                         open,
                                         onOpenChange,
                                         onCreate,
                                         folderFiles,
                                         folderName,
                                         fileKinds,
                                         forFileName,
                                         creating = false,
                                     }: TemplatePickerDialogProps) {
    const [query, setQuery] = React.useState("");
    const [kind, setKind] = React.useState<string>("all");
    const [category, setCategory] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [name, setName] = React.useState("");
    /** True until the user TYPES a name — switching templates then
     *  re-prefills the suggested name for the new kind. */
    const [namePristine, setNamePristine] = React.useState(true);

    // The kind pool: an explicit fileKinds prop, else the file the user
    // stands in (templatesForFile-equivalent), else everything.
    const pool = React.useMemo(() => {
        const kinds =
            fileKinds && fileKinds.length > 0
                ? new Set(fileKinds)
                : forFileName
                    ? new Set(TEMPLATES_MANIFEST.filter((t) => tMatchesFileName(t, forFileName)).map((t) => t.fileKind))
                    : null;
        return kinds ? TEMPLATES_MANIFEST.filter((t) => kinds.has(t.fileKind)) : TEMPLATES_MANIFEST;
    }, [fileKinds, forFileName]);

    const kindChips = React.useMemo(() => {
        const present = new Set(pool.map((t) => t.fileKind));
        return TEMPLATE_FILE_KINDS.filter((m) => present.has(m.kind));
    }, [pool]);

    const visible = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return pool.filter((t) => {
            if (kind !== "all" && t.fileKind !== kind) return false;
            if (category && t.category !== category) return false;
            if (!q) return true;
            return (
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                t.id.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q)
            );
        });
    }, [pool, kind, category, query]);

    const categories = React.useMemo(() => {
        const seen: string[] = [];
        for (const t of pool) {
            if ((kind === "all" || t.fileKind === kind) && !seen.includes(t.category)) {
                seen.push(t.category);
            }
        }
        return seen;
    }, [pool, kind]);

    const selected = React.useMemo(
        () => visible.find((t) => t.id === selectedId) ?? null,
        [visible, selectedId]
    );

    // Fresh state every open — the prompt flow this replaces always
    // started from a blank slate too.
    React.useEffect(() => {
        if (!open) return;
        setQuery("");
        setKind("all");
        setCategory(null);
        setNamePristine(true);
        const first = pool.length > 0 ? pool[0] : null;
        setSelectedId(first ? first.id : null);
        setName(first ? suggestedName(first.fileKind) : "");
        // `pool` is stable per fileKinds/forFileName identity — resetting
        // on every open would also be fine, but this keeps one re-open per
        // file context cheap.
    }, [open, pool]);

    // Selecting a template re-prefills the suggested name while the
    // input is pristine (the user hasn't typed anything of their own).
    const selectTemplate = (t: TemplateManifestEntry) => {
        setSelectedId(t.id);
        if (namePristine) setName(suggestedName(t.fileKind));
    };

    const nameCheck = React.useMemo(
        () =>
            selected
                ? validateTemplateFileName(name, {
                    recommendedExt: defaultExtensionFor(selected),
                    dotfileOnly: selected.fileKind === "gitignore",
                    existing: folderFiles,
                })
                : null,
        [selected, name, folderFiles]
    );

    const previewLines = React.useMemo(() => {
        if (!selected) return [] as string[];
        return selected.template.split("\n").slice(0, PREVIEW_LINES);
    }, [selected]);

    const create = () => {
        if (!selected || !nameCheck?.ok || creating) return;
        const detail = {templateId: selected.id, fileName: nameCheck.finalName};
        // Both channels, always: the callback for the prop-wired host, and
        // the PRAXIS_CREATE_FROM_TEMPLATE CustomEvent for the event-wired
        // one (page.tsx listens with addEventListener and owns creation).
        onCreate?.(detail);
        window.dispatchEvent(new CustomEvent("PRAXIS_CREATE_FROM_TEMPLATE", {detail}));
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col gap-3">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <FilePlus className="size-5 text-emerald-500" aria-hidden/>
                        New From Template
                    </DialogTitle>
                    <DialogDescription>
                        Pick a starter template and name the file
                        {folderName ? (
                            <>
                                {" "}— created in <span className="font-medium">{folderName}</span>
                            </>
                        ) : null}
                        . Naming tokens ({"{v:…} {f:…} {c:…} {d:…}"}) render with your
                        naming-style settings when the file is created.
                    </DialogDescription>
                </DialogHeader>

                {/* Search + kind chips */}
                <div className="shrink-0 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                                aria-hidden/>
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${pool.length} templates — name, description, category…`}
                            className="pl-8 h-8 text-sm"
                            aria-label="Search templates"
                        />
                        {query && (
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setQuery("")}
                                aria-label="Clear the template search"
                            >
                                <X className="size-3.5" aria-hidden/>
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Chip label="All kinds" active={kind === "all"} onClick={() => {
                            setKind("all");
                            setCategory(null);
                        }}/>
                        {kindChips.map((m) => (
                            <Chip
                                key={m.kind}
                                label={m.label}
                                active={kind === m.kind}
                                onClick={() => {
                                    setKind(m.kind);
                                    setCategory(null);
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Gallery + detail columns */}
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                    {/* LEFT: category chips + template cards */}
                    <div className="flex min-h-0 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 select-none">
                Category
              </span>
                            {categories.map((c) => (
                                <Chip
                                    key={c}
                                    label={c}
                                    small
                                    active={category === c}
                                    onClick={() => setCategory((cur) => (cur === c ? null : c))}
                                />
                            ))}
                        </div>
                        <div
                            className="min-h-0 flex-1 overflow-y-auto rounded-md border p-1.5 max-h-[46vh] [scrollbar-width:thin]">
                            {visible.length === 0 ? (
                                <p className="flex items-center justify-center py-8 px-6 text-center text-xs text-muted-foreground">
                                    No templates match the search — clear it or pick another kind.
                                </p>
                            ) : (
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                    {visible.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            className={cn(
                                                "flex items-start gap-2 rounded-md border p-2 text-left transition-colors",
                                                "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring outline-none",
                                                selectedId === t.id
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border bg-background"
                                            )}
                                            onClick={() => selectTemplate(t)}
                                            aria-pressed={selectedId === t.id}
                                            title={t.description}
                                        >
                                            <KindIcon kind={t.fileKind} className="size-4 mt-0.5"/>
                                            <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {t.description}
                        </span>
                      </span>
                                            <Badge variant="outline" className="shrink-0 text-[9px] font-normal">
                                                {t.category}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: preview + name + actions */}
                    <div className="flex min-h-0 flex-col gap-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            <KindIcon kind={selected?.fileKind ?? "other"} className="size-3.5"/>
                            <span className="font-medium text-foreground truncate">
                {selected ? selected.name : "No template selected"}
              </span>
                            <span className="truncate" title={selected?.description}>
                {selected?.description}
              </span>
                        </div>
                        <div
                            className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 max-h-[34vh] [scrollbar-width:thin]">
                            {selected ? (
                                <pre className="p-2 font-mono text-[11px] leading-relaxed whitespace-pre"
                                     aria-label={`Preview of the ${selected.name} template`}>
                  {previewLines.join("\n")}
                                    {selected.template.split("\n").length > PREVIEW_LINES && (
                                        <span className="block pt-1 text-muted-foreground/70">
                      + {selected.template.split("\n").length - PREVIEW_LINES} more line(s)…
                    </span>
                                    )}
                </pre>
                            ) : (
                                <p className="flex items-center justify-center py-8 px-6 text-center text-xs text-muted-foreground">Select
                                    a template to preview it.</p>
                            )}
                        </div>

                        <div className="shrink-0 space-y-1.5">
                            <label className="text-xs font-medium" htmlFor="template-file-name">
                                File name
                            </label>
                            <Input
                                id="template-file-name"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setNamePristine(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && nameCheck?.ok && !creating) {
                                        e.preventDefault();
                                        create();
                                    }
                                }}
                                placeholder={selected ? suggestedName(selected.fileKind) : "NewScript.py"}
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                                className={cn(
                                    "h-8 font-mono text-sm",
                                    nameCheck && !nameCheck.ok && "border-destructive focus-visible:ring-destructive"
                                )}
                                aria-invalid={nameCheck ? !nameCheck.ok : undefined}
                                aria-label="New file name"
                            />
                            {nameCheck?.error && (
                                <p className="flex items-start gap-1 text-[11px] text-destructive" role="alert">
                                    <CircleAlert className="size-3.5 shrink-0 mt-px" aria-hidden/>
                                    {nameCheck.error}
                                </p>
                            )}
                            {nameCheck?.ok && nameCheck.hint && !nameCheck.error && (
                                <p className="text-[11px] text-muted-foreground">{nameCheck.hint}</p>
                            )}
                            {folderFiles && (
                                <p className="text-[11px] text-muted-foreground/70">
                                    Checked against {folderFiles.length} file(s) already in the folder
                                    {folderFiles.length > 0 ? " (case-insensitive)" : ""}.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="shrink-0 gap-2 sm:justify-between">
                    <p className="text-[11px] text-muted-foreground/70 hidden sm:block">
                        {visible.length} template(s) shown · {TEMPLATES_MANIFEST.length} in the library
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={!selected || !nameCheck?.ok || creating}
                            onClick={create}
                            title="Create the file from the selected template"
                        >
                            {creating ? <Loader2 className="size-3.5 animate-spin" aria-hidden/> :
                                <FilePlus className="size-3.5" aria-hidden/>}
                            Create {nameCheck?.ok && nameCheck.finalName ? nameCheck.finalName : ""}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Preview cap — "~15 lines" keeps the right column scannable. */
const PREVIEW_LINES = 15;

/** Does a manifest entry apply to a given open FILE NAME? Mirrors the
 *  blocksForFile dispatch in code-templates.ts (the Insert button's
 *  rule) so the picker pre-filters exactly what that file would offer. */
function tMatchesFileName(t: TemplateManifestEntry, fileName: string): boolean {
    const name = fileName.toLowerCase();
    if (!name) return true;
    const IGNORE_FILES = new Set([
        ".gitignore",
        ".gitattributes",
        ".dockerignore",
        ".eslintignore",
        ".npmignore",
    ]);
    if (IGNORE_FILES.has(name)) return t.fileKind === "gitignore";
    if (name.endsWith(".py") || name.endsWith(".pyw")) return t.fileKind === "python";
    if (name.endsWith(".md") || name.endsWith(".markdown")) return t.fileKind === "markdown";
    if (name.endsWith(".json")) return t.fileKind === "json";
    if (name.endsWith(".yaml") || name.endsWith(".yml")) return t.fileKind === "yaml";
    if (name.endsWith(".toml")) return t.fileKind === "toml";
    if (name.endsWith(".csv")) return t.fileKind === "csv";
    if (name.endsWith(".txt") || name.endsWith(".log")) return t.fileKind === "text";
    return true;
}

/** Small filter chip (kind + category rows share it). */
function Chip({
                  label,
                  active,
                  small,
                  onClick,
              }: {
    label: string;
    active: boolean;
    small?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={cn(
                "rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                small ? "px-2 py-0 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
                active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            aria-pressed={active}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Standalone host (optional page-level mount)                         */

/* ------------------------------------------------------------------ */

/**
 * TemplatePickerDialogHost — a self-mounting host for event-only wiring.
 *
 * The RECOMMENDED wiring is explicit: page.tsx holds its own open state
 * and renders <TemplatePickerDialog open={…} onOpenChange={…}
 * onCreate={…} folderFiles={…} />. This host is the zero-wiring path:
 * mount it once anywhere and dispatch `PRAXIS_OPEN_TEMPLATE_PICKER`
 * (detail: { folderFiles?, folderName?, forFileName? }) to open the
 * gallery. Create then emits the standard PRAXIS_CREATE_FROM_TEMPLATE
 * CustomEvent — the same contract the explicit mount's onCreate
 * covers with a callback (callbacks can't travel through an event, so
 * event-opened pickers rely on the page-level listener).
 */
export function TemplatePickerDialogHost() {
    const [open, setOpen] = React.useState(false);
    const [ctx, setCtx] = React.useState<{
        folderFiles?: string[];
        folderName?: string;
        forFileName?: string;
    }>({});

    React.useEffect(() => {
        const onOpen = (e: Event) => {
            const d = (e as CustomEvent).detail as
                | { folderFiles?: unknown; folderName?: unknown; forFileName?: unknown }
                | undefined;
            e.preventDefault();
            setCtx({
                folderFiles: Array.isArray(d?.folderFiles) ? (d!.folderFiles as string[]) : undefined,
                folderName: typeof d?.folderName === "string" ? d!.folderName : undefined,
                forFileName: typeof d?.forFileName === "string" ? d!.forFileName : undefined,
            });
            setOpen(true);
        };
        window.addEventListener("PRAXIS_OPEN_TEMPLATE_PICKER", onOpen);
        return () => window.removeEventListener("PRAXIS_OPEN_TEMPLATE_PICKER", onOpen);
    }, []);

    return (
        <TemplatePickerDialog
            open={open}
            onOpenChange={setOpen}
            folderFiles={ctx.folderFiles}
            folderName={ctx.folderName}
            forFileName={ctx.forFileName}
        />
    );
}
