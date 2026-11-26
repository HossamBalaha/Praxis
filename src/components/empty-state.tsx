/**
 * empty-state — the generic "nothing here" card.
 *
 * Extracted from page.tsx in the Phase 2 monolith work so both the
 * main editor surface (src/app/page.tsx) and the split-pane view
 * (src/components/split-file-pane.tsx) share ONE implementation.
 */
import * as React from "react";

/** A centered icon + title + description card for empty surfaces. */
export function EmptyState({
                               icon,
                               title,
                               description,
                           }: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-xl border bg-card/40 px-6 py-12 flex flex-col items-center text-center">
            <div
                className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                {icon}
            </div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {description}
            </p>
        </div>
    );
}
