"use client";

/**
 * context-menu-groups.tsx — the ONE data-driven right-click menu
 * renderer.
 *
 * The four menu call sites (FolderTree tree rows, FolderTree flat
 * rows, CodeViewer, FileViewer) used to hand-write their own JSX
 * copies of the same menu, which drifted apart (missing groups for
 * whole languages, gates that disagreed, separators in different
 * places). Now every call site hands in a `groups` map — one entry
 * per canonical MenuGroupId from lib/context-menu-spec.ts — and THIS
 * component decides, from `menuGroupsForKind(kind, surface)`, which
 * groups survive for the file's kind and in what order, plus where
 * the canonical separators sit. The call sites cannot drift anymore:
 * the only thing they own is the ACTION each item performs.
 *
 * Rules enforced here (the Python menu stays the master template):
 *  - a group renders only when allowed for the file's kind, in
 *    canonical order — never re-ordered per language;
 *  - a renderer that returns null / undefined / false / [] is treated
 *    as "not offered" and skipped (its separator never fires);
 *  - separators render from lib/context-menu-spec.ts's
 *    SEPARATOR_BEFORE map, and only between two VISIBLE groups —
 *    no doubled dividers when a neighbor is gated off;
 *  - the header (fileName — included in EDIT menus too, matching the
 *    Python VIEW mode layout) renders through <MenuHeader>.
 */

import * as React from "react";
import {ContextMenuLabel, ContextMenuSeparator} from "@/components/ui/context-menu";
import {type MenuGroupId, menuGroupsForKind, type MenuSurface, SEPARATOR_BEFORE,} from "@/lib/context-menu-spec";

/** What a call site provides per group id: a function returning that
 *  group's JSX (or nothing, meaning "this site has no such group"). */
export type MenuGroupRenderers = Partial<
    Record<MenuGroupId, () => React.ReactNode>
>;

/** The standardized menu header — the file's name (or the
 * multi-selection count) + the canonical top separator. Every
 * surface shows it now, EDIT menus included (the drift fix: the
 * Python VIEW mode header layout is the master). */
export function MenuHeader({
                               name,
                               title,
                           }: {
    name: string;
    title?: string;
}) {
    return (
        <>
            <ContextMenuLabel
                className="text-[10px] text-muted-foreground truncate"
                title={title ?? name}
            >
                {name}
            </ContextMenuLabel>
            <ContextMenuSeparator/>
        </>
    );
}

/** Renders ONLY the groups allowed for (kind, surface), in the
 *  canonical order, with the canonical separators. The single
 *  data-driven renderer every right-click menu routes through. */
export function MenuGroups({
                               kind,
                               surface,
                               groups,
                           }: {
    kind: string | null | undefined;
    surface: MenuSurface;
    groups: MenuGroupRenderers;
}): React.ReactNode {
    // The allowed groups for this kind, in canonical order — the spec
    // is the only gate (call-site conditions were the drift source).
    const allowed = menuGroupsForKind(kind, surface);
    const separators = SEPARATOR_BEFORE[surface];

    const nodes: React.ReactNode[] = [];
    for (const g of allowed) {
        const render = groups[g];
        if (!render) continue;
        const node = render();
        if (node === null || node === undefined || node === false) continue;
        // Canonical separator BEFORE this group — only when a previous
        // group already rendered (no leading divider, no doubled ones).
        if (separators.includes(g) && nodes.length > 0) {
            nodes.push(<ContextMenuSeparator key={`sep-${g}`}/>);
        }
        nodes.push(<React.Fragment key={g}>{node}</React.Fragment>);
    }
    return <>{nodes}</>;
}
