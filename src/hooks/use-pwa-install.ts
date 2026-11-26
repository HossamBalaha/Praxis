"use client";
import {useCallback, useEffect, useState} from "react";

/** Minimal shape of the browser's deferred install prompt (the standard
 *  event is not part of TypeScript's lib.dom, so the members used here are
 *  declared explicitly — Chrome/Edge/Chromium-family only; Safari and
 *  Firefox never fire beforeinstallprompt, leaving canInstall false). */
interface BeforeInstallPromptEvent extends Event {
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;

    prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function readStandalone(): boolean {
    if (typeof window === "undefined") return false;
    const standaloneQuery =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    return standaloneQuery || iosStandalone;
}

/** Captures the browser's PWA install offer so the app can surface an
 *  "Install as app…" action where the user already is (Help menu) instead
 *  of hoping they notice the tiny install icon in the address bar.
 *
 *  - `canInstall`  true once beforeinstallprompt fired and the offer is
 *                  still pending (false in Safari/Firefox, after install,
 *                  or when already running installed).
 *  - `installed`   true while running as an installed app.
 *  - `promptInstall()` shows the browser's own install dialog; resolves to
 *                  true when the user accepted, false otherwise. */
export function usePwaInstall(): {
    canInstall: boolean;
    installed: boolean;
    promptInstall: () => Promise<boolean>;
} {
    const [canInstall, setCanInstall] = useState(false);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setInstalled(readStandalone());
        if (readStandalone()) {
            setCanInstall(false);
            return;
        }
        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            deferredPrompt = e as BeforeInstallPromptEvent;
            setCanInstall(true);
        };
        const onAppInstalled = () => {
            deferredPrompt = null;
            setCanInstall(false);
            setInstalled(true);
        };
        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("appinstalled", onAppInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onAppInstalled);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        const offer = deferredPrompt;
        if (!offer) return false;
        deferredPrompt = null;
        setCanInstall(false);
        try {
            await offer.prompt();
            const choice = await offer.userChoice;
            return choice.outcome === "accepted";
        } catch {
            return false;
        }
    }, []);

    return {canInstall, installed, promptInstall};
}
