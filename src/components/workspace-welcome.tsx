"use client";

import * as React from "react";
import {BookOpen, FolderTree, Github, Link2} from "lucide-react";
import {Button} from "@/components/ui/button";

interface WorkspaceWelcomeProps {
    /** CTA — reveal the Explorer sidebar (⌘B equivalent). */
    onShowExplorer?: () => void;
}

/** Guidance shown in the middle of the editor area when
 * every editor tab is closed ("Close all" / closing the last tab)
 * — a text in the middle instead of a solid blank filler.
 * Only REAL shortcuts are listed (see src/lib/shortcuts.ts). */
const HINTS: { keys: string; label: string }[] = [
    {keys: "⌘B", label: "Toggle the Explorer"},
    {keys: "⌘K", label: "Search scripts"},
    {keys: "⌘T", label: "Go to symbol in project"},
    {keys: "⌘⇧P", label: "Command palette"},
    {keys: "⌘⇧T", label: "Reopen the closed tab"},
    {keys: "⌘`", label: "Toggle the terminal"},
];

export function WorkspaceWelcome({onShowExplorer}: WorkspaceWelcomeProps) {
    return (
        <div
            data-tutorial="code-viewer"
            aria-label="No file open"
            className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6"
        >
            <div className="max-w-md w-full flex flex-col items-center text-center select-none">
                <div
                    className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                    <BookOpen className="size-7 text-emerald-500"/>
                </div>
                <h2 className="text-base font-semibold tracking-tight">No file open</h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    All editors are closed. Pick a file from the Explorer to continue —
                    or use one of these:
                </p>
                {onShowExplorer && (
                    <Button
                        size="sm"
                        className="mt-4 gap-1.5"
                        onClick={onShowExplorer}
                    >
                        <FolderTree className="size-3.5"/>
                        Show the Explorer
                    </Button>
                )}

                {/* ── Project entry points: shallow GitHub import + shareable
            snapshot links (the File menu twins, wired through the same
            window events the host listens for). */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-from-url"))}
                        className="group rounded-lg border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors cursor-pointer"
                        title="Import a GitHub repository, a subfolder or a gist into the workspace (shallow import)"
                    >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Github className="size-3.5 text-muted-foreground group-hover:text-foreground"/>
              Open from GitHub URL
            </span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
              repo · subfolder · gist — reload from source anytime
            </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("praxis:publish-snapshot"))}
                        className="group rounded-lg border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors cursor-pointer"
                        title="Encode the active workspace into a shareable URL hash that boots Praxis preloaded"
                    >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="size-3.5 text-muted-foreground group-hover:text-foreground"/>
              Publish Snapshot Link
            </span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
              share this workspace as one URL
            </span>
                    </button>
                </div>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 w-full text-left">
                    {HINTS.map((h) => (
                        <div key={h.keys} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <kbd
                                className="inline-flex items-center h-5 min-w-7 px-1.5 justify-center rounded border bg-muted font-mono text-[10px] text-foreground/70 shrink-0">
                                {h.keys}
                            </kbd>
                            <span className="truncate">{h.label}</span>
                        </div>
                    ))}
                </div>
                <p className="mt-6 text-[11px] text-muted-foreground/70">
                    Tabs and caret positions are restored after a reload — Session
                    restore keeps your place.
                </p>
            </div>
        </div>
    );
}
