"use client";

/**
 * — the React binding for the i18n scaffold.
 *
 * useChromeLanguage: reads the persisted language once, returns the
 * translator + dir. A settings change (Settings → Appearance →
 * Language) dispatches the praxis:language-changed event; every
 * consumer re-renders with the new strings. Consumers today: the
 * menu bar (menu-prefixed keys) and the AI surfaces (aiChat- and
 * askAi-prefixed keys — ai-chat-sidebar, ai-sampling-controls,
 * ask-ai-button).
 *
 * useDocumentDirection: one component (page.tsx) mounts this so the
 * <html dir> flips for RTL languages — the whole shell mirrors.
 */
import * as React from "react";
import {type ChromeStrings, isRTL, type Language, loadLanguage, saveLanguage, translator,} from "@/lib/i18n";

const LANGUAGE_CHANGED_EVENT = "praxis:language-changed";

export function useChromeLanguage(): {
    lang: Language;
    t: (key: keyof ChromeStrings) => string;
    dir: "ltr" | "rtl";
} {
    const [lang, setLang] = React.useState<Language>("en");

    React.useEffect(() => {
        setLang(loadLanguage());
        const onChanged = (e: Event) => {
            const detail = (e as CustomEvent).detail as { language?: Language } | undefined;
            if (detail?.language) setLang(detail.language);
        };
        window.addEventListener(LANGUAGE_CHANGED_EVENT, onChanged);
        return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, onChanged);
    }, []);

    return {
        lang,
        t: React.useMemo(() => translator(lang), [lang]),
        dir: isRTL(lang) ? "rtl" : "ltr",
    };
}

/** Change the language from anywhere (settings dialog). */
export function setChromeLanguage(lang: Language): void {
    saveLanguage(lang);
    window.dispatchEvent(
        new CustomEvent(LANGUAGE_CHANGED_EVENT, {detail: {language: lang}})
    );
}

/** Flips document.documentElement.dir — mount ONCE per page. */
export function useDocumentDirection(): "ltr" | "rtl" {
    const {dir} = useChromeLanguage();
    React.useEffect(() => {
        document.documentElement.dir = dir;
        document.documentElement.lang = dir === "rtl" ? "ar" : "en";
    }, [dir]);
    return dir;
}
