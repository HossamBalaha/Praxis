"use client";

import * as React from "react";
import {useTheme} from "next-themes";
import {CircleAlert} from "lucide-react";
import {cn} from "@/lib/utils";

/**
 * render a ```mermaid fenced block as a DIAGRAM.
 *
 * The engine loads as a LAZY client chunk (`await import("mermaid")`)
 * — it never lands in the SSR bundle or the initial page load; only
 * pages that actually contain a mermaid block pay for it. Theme is
 * picked from next-themes' resolvedTheme (dark → mermaid "dark").
 *
 * Honest degrade, per block: a parse error renders the parser message
 * + the original code — the REST of the markdown keeps rendering.
 * securityLevel "strict" keeps the SVG sanitized (no links/tags
 * injected by diagram text).
 */

/** Unique incrementing id for each mermaid.render call — mermaid
 *  inserts a scratch element with this id into the document, so a
 *  reused id breaks the NEXT render ("duplicate id" error). */
let renderSeq = 0;

interface MermaidDiagramProps {
    code: string;
    className?: string;
}

export function MermaidDiagram({code, className}: MermaidDiagramProps) {
    const {resolvedTheme} = useTheme();
    const [svg, setSvg] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        setSvg(null);
        setError(null);
        void (async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "strict",
                    theme: resolvedTheme === "dark" ? "dark" : "default",
                });
                const id = `praxis-mermaid-${Date.now().toString(36)}-${(renderSeq += 1)}`;
                const result = await mermaid.render(id, code);
                if (!cancelled) setSvg(result.svg);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [code, resolvedTheme]);

    if (error) {
        return (
            <figure
                className="my-4 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-xs"
                data-testid="mermaid-error"
            >
                <figcaption className="mb-1.5 flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                    <CircleAlert className="size-3.5 shrink-0"/>
                    Mermaid diagram could not render
                </figcaption>
                <p className="mb-2 break-words font-mono text-[10px] text-muted-foreground">{error}</p>
                <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
          {code}
        </pre>
            </figure>
        );
    }
    if (!svg) {
        return (
            <div
                className="my-4 grid place-items-center rounded-lg border bg-muted/10 p-6 text-[11px] text-muted-foreground"
                data-testid="mermaid-loading"
            >
                Rendering diagram…
            </div>
        );
    }
    return (
        <div
            className={cn(
                "my-4 overflow-x-auto rounded-lg border bg-muted/20 p-2 text-center",
                // Keep oversized diagrams scrollable instead of pushing the
                // preview column wide.
                "[&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto",
                className
            )}
            data-testid="mermaid-diagram"
            // Mermaid's own SVG output, rendered under securityLevel
            // "strict" (scripts/links stripped by the engine itself).
            dangerouslySetInnerHTML={{__html: svg}}
        />
    );
}
