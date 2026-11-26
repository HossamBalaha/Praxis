"use client";

import * as React from "react";

/**
 * Browser support gate — the React half of the legacy-browser notice.
 *
 * A pre-hydration inline script in layout.tsx runs first: in browsers so
 * old that React 19 cannot even parse/hydrate, that script stamps
 * <html data-browser-unsupported="1">, injects the static legacy notice
 * and a CSS kill-switch hides the app shell. This component is the
 * second line of defense for "modern-ish but marginal" browsers that DO
 * hydrate: it re-runs the same capability probe after mount and renders
 * a styled full-screen notice instead of the app (the app itself stays
 * mounted nowhere — children are simply not rendered).
 *
 * Supported baseline (all mainstream engines, years-old versions):
 *   Chrome / Edge 90+, Firefox 90+, Safari 14.1+, Opera 76+
 * Everything newer works; everything significantly older shows the
 * "browser not supported — install the latest version" notice.
 */

function probeCapabilities(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    const w = globalThis as unknown as Record<string, unknown>;
    if (!w.fetch) missing.push("fetch");
    if (!w.AbortController) missing.push("AbortController");
    if (!w.ResizeObserver) missing.push("ResizeObserver");
    if (!w.BroadcastChannel) missing.push("BroadcastChannel");
    if (!w.structuredClone) missing.push("structuredClone");
    if (!w.Request) missing.push("Request");
    const P = w.Promise as unknown as { allSettled?: unknown } | undefined;
    if (!P || typeof P.allSettled !== "function") missing.push("Promise.allSettled");
    const Arr = w.Array as unknown as { prototype: { at?: unknown } } | undefined;
    if (!Arr || typeof Arr.prototype.at !== "function") missing.push("Array.at");
    const Str = w.String as unknown as { prototype: { replaceAll?: unknown } } | undefined;
    if (!Str || typeof Str.prototype.replaceAll !== "function") missing.push("String.replaceAll");
    const CSSApi = w.CSS as unknown as { supports?: (a: string, b?: string) => boolean } | undefined;
    if (!CSSApi || typeof CSSApi.supports !== "function") missing.push("CSS.supports");
    else {
        try {
            if (!CSSApi.supports("display", "grid")) missing.push("CSS grid");
        } catch {
            missing.push("CSS.supports");
        }
    }
    return {ok: missing.length === 0, missing};
}

/** Very-old known engines the capability probe may not catch
 *  (feature-detected APIs exist but the JS parser itself is too old,
 *  or UA strings of pre-Chromium Edge / old mobile WebViews). */
function isKnownLegacyUA(ua: string): boolean {
    if (!ua) return false;
    // IE 6–11 and pre-Chromium Edge (EdgeHTML / Spartan).
    if (/MSIE\s|Trident\/|Edge\/\d{2}\./.test(ua)) return true;
    // Chrome < 90 on desktop (Android WebView Chromium < 90 included).
    const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(ua);
    if (chrome && Number(chrome[1]) < 90) return true;
    // Safari < 14 (Version/x Safari/y prefixes older than macOS Big Sur).
    const safari = /Version\/(\d+)[.\d]* Safari/.exec(ua);
    if (safari && Number(safari[1]) < 14) return true;
    // Firefox < 90.
    const ff = /Firefox\/(\d+)/.exec(ua);
    if (ff && Number(ff[1]) < 90) return true;
    // Opera Presto / old Chromium (<76).
    const opr = /OPR\/(\d+)/.exec(ua);
    if (opr && Number(opr[1]) < 76) return true;
    if (/Opera\/[2-9]\.|Presto\//.test(ua)) return true;
    return false;
}

const BROWSERS: Array<{ name: string; url: string }> = [
    {name: "Google Chrome", url: "https://www.google.com/chrome/"},
    {name: "Microsoft Edge", url: "https://www.microsoft.com/edge"},
    {name: "Mozilla Firefox", url: "https://www.mozilla.org/firefox/"},
    {name: "Apple Safari", url: "https://www.apple.com/safari/"},
    {name: "Opera", url: "https://www.opera.com/"},
];

export function BrowserSupportGate({children}: { children: React.ReactNode }) {
    const [verdict, setVerdict] = React.useState<{ supported: boolean; missing: string[]; ua: boolean } | null>(null);

    React.useEffect(() => {
        const probe = probeCapabilities();
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        setVerdict({supported: probe.ok && !isKnownLegacyUA(ua), missing: probe.missing, ua: isKnownLegacyUA(ua)});
    }, []);

    // Before the probe settles (first paint frames) render children —
    // the pre-hydration gate already handled the truly legacy browsers,
    // so this flash is always the modern app.
    if (verdict === null || verdict.supported) return <>{children}</>;

    const missing = verdict.missing;
    return (
        <div
            role="alert"
            dir="ltr"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-background p-6"
        >
            <div className="w-full max-w-lg rounded-lg border bg-card p-8 text-card-foreground shadow-lg">
                <div className="flex items-center gap-3">
          <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-destructive/30 bg-destructive/10 text-xl text-destructive">
            ⚠
          </span>
                    <div>
                        <h1 className="text-lg font-semibold leading-tight">Your browser is not supported</h1>
                        <p className="text-xs text-muted-foreground">Praxis needs a modern browser engine to run its
                            IDE, editor and Python runtime.</p>
                    </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed">
                    The browser you are using is legacy or too old, so it is missing pieces of the modern web platform
                    {missing.length > 0 && !verdict.ua ? (
                        <> (missing: <code
                            className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{missing.slice(0, 4).join(", ")}</code>)</>
                    ) : <>.</>}.
                    Please install the latest version of one of these browsers and reload this page:
                </p>
                <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {BROWSERS.map((b) => (
                        <li key={b.name}>
                            <a
                                href={b.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-muted"
                            >
                                <span>{b.name}</span>
                                <span className="text-xs text-muted-foreground">Install latest ↗</span>
                            </a>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                    Supported baseline: Chrome / Edge 90 or newer, Firefox 90 or newer, Safari 14.1 or newer, Opera 76
                    or newer —
                    any up-to-date browser released in the last few years works.
                </p>
            </div>
        </div>
    );
}

export default BrowserSupportGate;
