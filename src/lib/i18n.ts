/**
 * — i18n scaffold + Arabic (RTL) support.
 *
 * Praxis ships English as the interface language. This module adds a
 * lightweight dictionary layer with TWO goals:
 *
 * 1. Arabic chrome — the top-level menu bar, the bottom-panel tabs
 * and a handful of high-traffic labels translate to Arabic, and
 * the app shell flips to RTL (`dir="rtl"`), mirroring the layout
 * the way Arabic readers expect.
 * 2. A pattern to extend — adding a language = adding one object
 * below; adding a string = adding one key. No framework, no
 * code-splitting of locale files — the dictionary is a few KB.
 *
 * HONEST SCOPE: this is a scaffold, not a full localization. The
 * dialogs, settings, toasts and the hundreds of tooltips remain
 * English; translating all of them is mechanical work on this same
 * pattern. Arabic was chosen first for the author's audience.
 *
 * The selected language persists in localStorage
 * ("praxis.language") and is mirrored into the Settings object
 * (language: "en" | "ar") so the Settings dialog can edit it.
 *
 * ─── KEY WIRING STATUS ──────────────────────────────────────────────
 * Every dictionary key is consumed. The keys are
 * wired as follows:
 *
 * tabOutput / tabDiag / tabNotes / tabTodos / tabTests /
 * tabTerminal / tabPlots / runButton / stopButton
 * → src/app/page.tsx (bottom-panel tabs + Run/Stop buttons)
 * saveButton → src/components/menu-bar.tsx (File ▸ Save)
 * explore → src/components/folder-tree.tsx (sidebar header)
 *
 * The menu-prefixed keys are wired in menu-bar.tsx; the aiChat- and
 * askAi-prefixed keys in ai-chat-sidebar.tsx / ai-sampling-controls.tsx
 * / ask-ai-button.tsx.
 * ────────────────────────────────────────────────────────────────────
 */

export type Language = "en" | "ar";

/** The dictionary keys — the translatable chrome surface. */
export interface ChromeStrings {
    menuFile: string;
    menuEdit: string;
    menuView: string;
    menuWindow: string;
    menuTerminal: string;
    menuBookmarks: string;
    menuRun: string;
    menuAi: string;
    menuData: string;
    menuTools: string;
    menuGit: string;
    menuCollaborate: string;
    menuFocus: string;
    menuExamples: string;
    menuHelp: string;
    tabOutput: string;
    tabDiag: string;
    tabNotes: string;
    tabTodos: string;
    tabTests: string;
    tabTerminal: string;
    tabPlots: string;
    runButton: string;
    stopButton: string;
    saveButton: string;
    explore: string;
    // ─── AI chat chrome (ai-chat-sidebar + ai-sampling-controls) ─────
    /** Sidebar title. */
    aiChatTitle: string;
    /** Composer placeholder. */
    aiChatPlaceholder: string;
    /** Send button. */
    aiChatSend: string;
    /** Stop button (mid-stream). */
    aiChatStop: string;
    /** Clear-chat button. */
    aiChatClear: string;
    /** Search-toggle aria-label / placeholder. */
    aiChatSearch: string;
    /** Result chip — "{n} messages · {m} matches". */
    aiChatSearchCount: string;
    /** Empty result line — "No messages match \"{q}\"…". */
    aiChatSearchNoResults: string;
    /** Export button aria-label. */
    aiChatExport: string;
    /** Export success toast title. */
    aiChatExportDone: string;
    /** Tuning popover title (full). */
    aiChatTuning: string;
    /** Tuning trigger short label. */
    aiChatTuningLabel: string;
    /** "Provider defaults" badge. */
    aiChatTuningDefaults: string;
    aiChatTuningTemp: string;
    aiChatTuningTopP: string;
    aiChatTuningMaxTokens: string;
    /** Hint under the knobs. */
    aiChatTuningHint: string;
    aiChatTuningReset: string;
    // ─── Ask-AI dropdown (ask-ai-button) ─────────────────────────────
    /** Default button label. */
    askAiLabel: string;
    /** Integrated-AI menu item label. */
    askAiIntegrated: string;
    /** External endpoints group label. */
    askAiExternalLabel: string;
    /** "Copy question only" item. */
    askAiCopyOnly: string;
    /** Hint on the integrated item. */
    askAiOpensSidebar: string;
    /** Hint on the first external item. */
    askAiCopiesQuestion: string;
}

const EN: ChromeStrings = {
    menuFile: "File",
    menuEdit: "Edit",
    menuView: "View",
    menuWindow: "Window",
    menuTerminal: "Terminal",
    menuBookmarks: "Bookmarks",
    menuRun: "Run & Go",
    menuAi: "AI",
    menuData: "Data",
    menuTools: "Tools",
    menuGit: "Git",
    menuCollaborate: "Collaborate",
    menuFocus: "Focus",
    menuExamples: "Examples",
    menuHelp: "Help",
    tabOutput: "Output",
    tabDiag: "Diag",
    tabNotes: "Notes",
    tabTodos: "TODOs",
    tabTests: "Tests",
    tabTerminal: "Terminal",
    tabPlots: "Plots",
    runButton: "Run",
    stopButton: "Stop",
    saveButton: "Save",
    explore: "Explorer",
    aiChatTitle: "AI Assistant",
    aiChatPlaceholder: "Ask about your code…  (Enter to send, Shift+Enter for newline)",
    aiChatSend: "Send",
    aiChatStop: "Stop",
    aiChatClear: "Clear chat",
    aiChatSearch: "Search messages",
    aiChatSearchCount: "{n} messages · {m} matches",
    aiChatSearchNoResults: "No messages match \u201C{q}\u201D — try a shorter query.",
    aiChatExport: "Export conversation as Markdown",
    aiChatExportDone: "Conversation exported",
    aiChatTuning: "Sampling controls (temperature, top_p, max tokens)",
    aiChatTuningLabel: "Tuning",
    aiChatTuningDefaults: "Provider defaults",
    aiChatTuningTemp: "Temperature",
    aiChatTuningTopP: "Top P",
    aiChatTuningMaxTokens: "Max tokens",
    aiChatTuningHint: "Custom knobs ride every request to the model.",
    aiChatTuningReset: "Reset",
    askAiLabel: "Ask AI",
    askAiIntegrated: "Praxis AI (built-in)",
    askAiExternalLabel: "External AI endpoints",
    askAiCopyOnly: "Copy question only",
    askAiOpensSidebar: "opens in sidebar",
    askAiCopiesQuestion: "copies question",
};

/** Arabic chrome (الفصحى — Modern Standard Arabic). */
const AR: ChromeStrings = {
    menuFile: "ملف",
    menuEdit: "تحرير",
    menuView: "عرض",
    menuWindow: "نافذة",
    menuTerminal: "طرفية",
    menuBookmarks: "علامات",
    menuRun: "تشغيل",
    menuAi: "الذكاء",
    menuData: "بيانات",
    menuTools: "أدوات",
    menuGit: "جِت",
    menuCollaborate: "تعاون",
    menuFocus: "تركيز",
    menuExamples: "أمثلة",
    menuHelp: "مساعدة",
    tabOutput: "الخرج",
    tabDiag: "تشخيص",
    tabNotes: "ملاحظات",
    tabTodos: "مهام",
    tabTests: "اختبارات",
    tabTerminal: "طرفية",
    tabPlots: "رسوم",
    runButton: "تشغيل",
    stopButton: "إيقاف",
    saveButton: "حفظ",
    explore: "المستكشف",
    aiChatTitle: "المساعد الذكي",
    aiChatPlaceholder: "اسأل عن الكود… (Enter للإرسال، Shift+Enter لسطر جديد)",
    aiChatSend: "إرسال",
    aiChatStop: "إيقاف",
    aiChatClear: "مسح المحادثة",
    aiChatSearch: "البحث في الرسائل",
    aiChatSearchCount: "{n} رسالة · {m} مطابقة",
    aiChatSearchNoResults: "لا رسائل تطابق «{q}» — جرّب استعلامًا أقصر.",
    aiChatExport: "تصدير المحادثة كملف Markdown",
    aiChatExportDone: "تم تصدير المحادثة",
    aiChatTuning: "إعدادات التوليد (الحرارية، top_p، الحد الأقصى للرموز)",
    aiChatTuningLabel: "التوليد",
    aiChatTuningDefaults: "افتراضيات المزوّد",
    aiChatTuningTemp: "الحرارية (temperature)",
    aiChatTuningTopP: "نطاق الاحتمالات (top_p)",
    aiChatTuningMaxTokens: "الحد الأقصى للرموز",
    aiChatTuningHint: "تُرسل القيم المخصّصة مع كل طلب إلى النموذج.",
    aiChatTuningReset: "إعادة الضبط",
    askAiLabel: "اسأل الذكاء",
    askAiIntegrated: "ذكاء براكسيس (مدمج)",
    askAiExternalLabel: "نقاط نهاية ذكاء خارجية",
    askAiCopyOnly: "نسخ السؤال فقط",
    askAiOpensSidebar: "يفتح في الشريط الجانبي",
    askAiCopiesQuestion: "ينسخ السؤال",
};

export const LANGUAGES: Record<Language, { label: string; strings: ChromeStrings }> = {
    en: {label: "English", strings: EN},
    ar: {label: "العربية (Arabic)", strings: AR},
};

export function isSupportedLanguage(v: unknown): v is Language {
    return v === "en" || v === "ar";
}

/** Right-to-left languages need the app shell mirrored. */
export function isRTL(lang: Language): boolean {
    return lang === "ar";
}

const STORAGE_KEY = "praxis.language";

/** Read the persisted language (client only; "en" default + fallback). */
export function loadLanguage(): Language {
    if (typeof window === "undefined") return "en";
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return isSupportedLanguage(v) ? v : "en";
    } catch {
        return "en";
    }
}

export function saveLanguage(lang: Language): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        /* storage — non-fatal */
    }
}

/** The translator — call with the language you already have in state:
 *    const { t } = useChromeLanguage;
 *    <span>{t("menuFile")}</span>
 * English is the fallback for missing keys in future dictionaries.
 */
export function translator(lang: Language): (key: keyof ChromeStrings) => string {
    const dict = LANGUAGES[lang]?.strings ?? EN;
    return (key) => dict[key] ?? EN[key];
}
