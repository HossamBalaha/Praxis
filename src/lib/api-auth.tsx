"use client";

/**
 * Client half of the API token guard (see src/proxy.ts).
 *
 * When the server is started with PRAXIS_ACCESS_TOKEN set, every /api
 * call must carry `Authorization: Bearer <token>`. Instead of touching
 * ~150 fetch call sites, we patch window.fetch once: same-origin /api
 * requests get the header attached automatically when a token is
 * stored, and a 401 with `tokenRequired` opens the prompt dialog
 * (ApiTokenPrompt, rendered once from page.tsx).
 *
 * The token lives in localStorage under "praxis.api-token" — on the
 * CLIENT only, like every other client setting. The server never
 * stores it; it just compares.
 */
import * as React from "react";

const TOKEN_KEY = "praxis.api-token";

export function getApiToken(): string {
    try {
        return window.localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
        return "";
    }
}

export function setApiToken(token: string): void {
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

/** Event fired when the API answers 401 tokenRequired. */
export const API_TOKEN_REQUIRED_EVENT = "praxis:api-token-required";

let installed = false;

/** Patch window.fetch once (idempotent). Import-side-effect free —
 *  page.tsx calls this in a useEffect. */
export function installApiAuth(): void {
    if (installed || typeof window === "undefined") return;
    installed = true;

    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
        const isApiCall =
            url.startsWith("/api/") ||
            (url.startsWith(window.location.origin) &&
                new URL(url, window.location.origin).pathname.startsWith("/api/"));

        const attachHeader = isApiCall && getApiToken();
        const finalInit: RequestInit = attachHeader
            ? {
                ...(init ?? {}),
                headers: {
                    ...((init?.headers as Record<string, string>) ?? {}),
                    Authorization: `Bearer ${getApiToken()}`,
                },
            }
            : (init ?? {});

        const res = await original(input, finalInit);

        if (
            res.status === 401 &&
            isApiCall &&
            // Only react to the guard's structured 401, not unrelated 401s
            // (e.g. an upstream AI provider failing through a proxy route).
            res.headers.get("content-type")?.includes("application/json")
        ) {
            try {
                const clone = res.clone();
                const body = await clone.json();
                if (body?.tokenRequired) {
                    window.dispatchEvent(new CustomEvent(API_TOKEN_REQUIRED_EVENT));
                }
            } catch {
                /* not JSON — ignore */
            }
        }
        return res;
    };
}

/** Dialog shown when the API demands a token. Lets the user paste it
 * once; stored and every subsequent fetch carries it. */
export function ApiTokenPrompt() {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        installApiAuth();
        const onRequired = () => {
            setOpen(true);
            // Prefill whatever is stored (maybe the user is fixing a stale
            // token after a server-side rotation).
            setValue(getApiToken());
            requestAnimationFrame(() => inputRef.current?.focus());
        };
        window.addEventListener(API_TOKEN_REQUIRED_EVENT, onRequired);
        return () => window.removeEventListener(API_TOKEN_REQUIRED_EVENT, onRequired);
    }, []);

    if (!open) return null;

    const save = () => {
        setApiToken(value.trim());
        setOpen(false);
        // The failed requests are gone; reload cleanly retries the page's
        // initial API calls with the new header.
        window.location.reload();
    };

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="API access token required"
        >
            <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
                <h2 className="text-base font-semibold">Access token required</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    This Praxis server is protected by an access token. Paste the
                    token that the server was started with
                    (<code className="rounded bg-muted px-1">PRAXIS_ACCESS_TOKEN</code>)
                    — it is stored in this browser only.
                </p>
                <input
                    ref={inputRef}
                    type="password"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") setOpen(false);
                    }}
                    placeholder="Paste the access token…"
                    className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={() => setOpen(false)}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={!value.trim()}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                        Save &amp; reload
                    </button>
                </div>
            </div>
        </div>
    );
}
