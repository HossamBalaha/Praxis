"use client";
import {useEffect} from "react";

/**
 * Service-worker lifecycle.
 *
 * Production: register /sw.js (offline app shell + static asset cache).
 *
 * Development: actively UNREGISTER any service worker and purge its
 * caches. Registration is production-only, but a worker installed by an
 * earlier production run on the same origin (e.g. `npm run build &&
 * npm start`, later returning to `npm run dev` on the same port) stays
 * active across dev sessions — and its cache-first handling of
 * /_next/static assets would keep serving the OLD build's chunks, so
 * UI fixes silently never appear. Clearing it here makes every dev
 * session see the real, current code.
 */
export function PWARegister() {
    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }
        if (process.env.NODE_ENV === "production") {
            navigator.serviceWorker.register("/sw.js").catch(() => {
            });
            return;
        }
        // Development — remove any leftover worker + its caches.
        (async () => {
            try {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
                if (typeof caches !== "undefined") {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                }
            } catch {
                /* best-effort — a missing API or a locked-down context is fine */
            }
        })();
    }, []);
    return null;
}
