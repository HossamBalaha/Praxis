import type {Metadata} from "next";
import {GeistSans} from "geist/font/sans";
import localFont from "next/font/local";
import "./globals.css";
import {Toaster} from "@/components/ui/toaster";
import {ThemeProvider} from "@/components/theme-provider";
import {PWARegister} from "@/components/pwa-register";
import {ErrorBoundary} from "@/components/error-boundary";
import {MotionConfig} from "framer-motion";
import {APP_NAME, APP_TAGLINE, STORAGE_PREFIX} from "@/lib/config";
import {BrowserSupportGate} from "@/components/browser-support-gate";

// DEV/Geist used to come from `next/font/google`, which
// makes every cold dev start (and CI build) reach out to
// fonts.googleapis.com — and stall, or fail, whenever that is slow or
// unreachable. The `geist` npm package ships the SAME typeface as
// local files through next/font/local and defines the exact same
// `--font-geist-sans` CSS variable, so globals.css keeps working
// unchanged. Praxis is a localhost-first, offline-friendly tool, so
// the sans face is now self-hosted exactly like JetBrains Mono below.

// two monospace families (Geist Mono + JetBrains
// Mono) shipped ~91 KB of web fonts for one too many faces. JetBrains
// Mono is the dedicated code font every editor stack prefers, so it
// stays; Geist Mono is dropped and --font-mono now resolves to
// JetBrains Mono. Two families total: Geist + JetBrains Mono.
//
// the font is now SELF-HOSTED from the official variable
// release instead of Google Fonts. Reason: Google's per-subset slicing
// of JetBrains Mono STRIPS the contextual programming ligatures —
// the latin subset retains only 3 fraction ligatures, so `!=` could
// never render as `≠`, `<=` as `≤`, `>=` as `≥` or `->` as `→` even
// though that is JetBrains Mono's signature behavior in every editor
// that ships it.
// The full variable font keeps every `calt` rule, and the ligature
// glyphs are drawn to occupy EXACTLY the advance width of their
// component sequence, so all pixel math (squiggles, fold chevrons,
// whitespace overlay, char-width probing) stays correct. A settings
// toggle (Settings → Editor → Font ligatures) can turn them off.
const jetbrainsMono = localFont({
    src: [
        {path: "../fonts/JetBrainsMono-Variable.woff2", weight: "100 800", style: "normal"},
        {path: "../fonts/JetBrainsMono-Italic-Variable.woff2", weight: "100 800", style: "italic"},
    ],
    variable: "--font-jb-mono",
    display: "swap",
});

// NOTE (a11y / Atkinson Hyperlegible): the accessibility face for chat
// text is deliberately NOT wired through next/font/local — no Atkinson
// woff2 exists in src/fonts/ or /usr/share/fonts on this offline build
// host, and shipping a fake file would be worse than shipping none.
// Instead globals.css defines the --font-hyperlegible STACK
// (Atkinson Hyperlegible, Geist, system-ui) and applies it to the
// AI chat bubbles/markdown: users who installed the font locally
// (free, Braille Institute) get it automatically, everyone else gets
// the clean Geist fallback. If a licensed woff2 is ever added to
// src/fonts/, add a localFont({ src: …, variable: "--font-hyperlegible" })
// here and drop the stack override in globals.css.

export const metadata: Metadata = {
    metadataBase: new URL("https://github.com/HossamBalaha/Praxis"),
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: `${APP_NAME} is an interactive Python IDE and code browser: explore folders of Python scripts, view source code with syntax highlighting, and run any script in place to see stdout, figures (matplotlib), and data tables (pandas). A fast, offline-friendly Jupyter alternative for browsing, editing, and running a curated library of Python examples.`,
    keywords: [
        "Python",
        "Python IDE",
        "code browser",
        "code library",
        "script browser",
        "script runner",
        "interactive",
        "matplotlib",
        "pandas",
        "Jupyter alternative",
        "online Python editor",
        APP_NAME.toLowerCase(),
    ],
    authors: [{name: "Hossam Magdy Balaha"}],
    openGraph: {
        title: `${APP_NAME} — ${APP_TAGLINE}`,
        description: `${APP_NAME} is an interactive Python IDE and code browser: explore folders of Python scripts, view source code with syntax highlighting, and run any script in place to see stdout, figures (matplotlib), and data tables (pandas). A fast, offline-friendly Jupyter alternative for browsing, editing, and running a curated library of Python examples.`,
        type: "website",
        siteName: APP_NAME,
    },
    twitter: {
        card: "summary_large_image",
        title: `${APP_NAME} — ${APP_TAGLINE}`,
        description: `${APP_NAME} is an interactive Python IDE and code browser: explore folders of Python scripts, view source code with syntax highlighting, and run any script in place to see stdout, figures (matplotlib), and data tables (pandas). A fast, offline-friendly Jupyter alternative for browsing, editing, and running a curated library of Python examples.`,
    },
    manifest: "/site.webmanifest",
    icons: {
        // SVG favicon (modern browsers — crisp at any size).
        icon: [
            {url: "/logo.svg", type: "image/svg+xml"},
            {url: "/favicon.ico", sizes: "any"},
            {url: "/favicon-32x32.png", type: "image/png", sizes: "32x32"},
            {url: "/favicon-16x16.png", type: "image/png", sizes: "16x16"},
            {url: "/favicon-96x96.png", type: "image/png", sizes: "96x96"},
        ],
        // iOS home-screen icon (PNG — iOS doesn't support SVG here).
        apple: [
            {url: "/apple-touch-icon.png", sizes: "180x180"},
        ],
        // Android Chrome PWA icons.
        other: [
            {url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png"},
            {url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png"},
        ],
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
        <head>
            {/* Favicon links — explicit <link> tags in addition to the
            Next.js metadata.icons block above, so legacy browsers
            that don't understand the metadata format still find the
            icons. Order matters: ICO first (legacy), then SVG
            (modern), then PNGs (specific sizes). */}
            <link rel="icon" href="/favicon.ico" sizes="any"/>
            <link rel="icon" href="/logo.svg" type="image/svg+xml"/>
            <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32"/>
            <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16"/>
            <link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
            <link rel="mask-icon" href="/logo.svg" color="#059669"/>
            <meta name="msapplication-TileColor" content="#059669"/>
            <meta name="msapplication-config" content="/browserconfig.xml"/>
            <meta name="theme-color" content="#059669"/>
            {/* LEGACY-BROWSER GATE — runs BEFORE hydration, written in
            deliberately ES5-only syntax so even pre-2017 engines can
            parse it. If the browser is legacy or too old (missing the
            modern web-platform pieces the IDE is built on), we stamp
            <html data-browser-unsupported="1">, inject a static
            full-screen notice and a CSS kill-switch (globals.css) hides
            the app shell. The React half (BrowserSupportGate below)
            re-checks after mount for marginal-but-hydrating browsers. */}
            <script dangerouslySetInnerHTML={{
                __html: `
          (function () {
            function showLegacyNotice() {
              try {
                var d = document.documentElement;
                d.setAttribute('data-browser-unsupported', '1');
                var n = document.createElement('div');
                n.id = 'praxis-legacy-notice';
                n.setAttribute('role', 'alert');
                n.innerHTML =
                  '<div class="lg-card">' +
                  '<div class="lg-icon">\u26a0</div>' +
                  '<h1>Your browser is not supported</h1>' +
                  '<p>Your browser is legacy or too old to run the IDE. Please install the latest version of <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">Chrome</a>, <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer">Edge</a>, <a href="https://www.mozilla.org/firefox/" target="_blank" rel="noreferrer">Firefox</a> or <a href="https://www.apple.com/safari/" target="_blank" rel="noreferrer">Safari</a> and reload this page.</p>' +
                  '<p class="lg-small">Supported: Chrome / Edge 90+, Firefox 90+, Safari 14.1+, Opera 76+.</p>' +
                  '</div>';
                (document.body || d).insertBefore(n, (document.body || d).firstChild);
              } catch (e) { /* degrade silently */ }
            }
            function unsupported() {
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () { showLegacyNotice(); });
              } else {
                showLegacyNotice();
              }
            }
            try {
              var ok = true;
              ok = ok && typeof window.fetch === 'function';
              ok = ok && typeof window.AbortController === 'function';
              ok = ok && typeof window.ResizeObserver === 'function';
              ok = ok && typeof window.BroadcastChannel === 'function';
              ok = ok && typeof window.structuredClone === 'function';
              ok = ok && typeof window.Request === 'function';
              ok = ok && typeof window.Promise === 'function' && typeof window.Promise.allSettled === 'function';
              ok = ok && typeof Array.prototype.at === 'function';
              ok = ok && typeof String.prototype.replaceAll === 'function';
              ok = ok && typeof window.CSS === 'object' && typeof window.CSS.supports === 'function' && window.CSS.supports('display', 'grid');
              var ua = navigator && navigator.userAgent ? navigator.userAgent : '';
              var legacy = /MSIE\\s|Trident\\/|Edge\\/\\d{2}\\./.test(ua)
                || (/(?:Chrome|CriOS)\\/(\\d+)/.test(ua) && Number(RegExp.$1) < 90)
                || (/Version\\/(\\d+)[.\\d]* Safari/.test(ua) && Number(RegExp.$1) < 14)
                || (/Firefox\\/(\\d+)/.test(ua) && Number(RegExp.$1) < 90)
                || (/OPR\\/(\\d+)/.test(ua) && Number(RegExp.$1) < 76)
                || /Opera\\/[2-9]\\.|Presto\\//.test(ua);
              if (!ok || legacy) { unsupported(); }
            } catch (e) { /* assume modern — React gate re-checks */ }
          })();
        `
            }}/>
            {/* Apply the high-contrast accessibility theme before
            hydration so there is no flash of the regular theme on
            reload. The <html> element's data-high-contrast attribute
            is kept in sync with settings.highContrastMode from
            page.tsx once React mounts. */}
            <script dangerouslySetInnerHTML={{
                __html: `
          try {
            var s = JSON.parse(localStorage.getItem('${STORAGE_PREFIX}.settings') || '{}');
            if (s.highContrastMode) document.documentElement.setAttribute('data-high-contrast', 'true');
            // Apply the four accessibility-effect settings
            // before first paint so users see their preferred modes immediately.
            if (s.reduceMotion) document.documentElement.setAttribute('data-reduce-motion', 'true');
            if (s.screenReaderMode) document.documentElement.setAttribute('data-screen-reader', 'true');
            if (s.largeTextMode) document.documentElement.setAttribute('data-large-text', 'true');
            if (s.enhancedFocusIndicators) document.documentElement.setAttribute('data-enhanced-focus', 'true');
            // Extended accessibility modes — applied
            // pre-hydration to avoid a flash of the default styles.
            if (s.dyslexiaFriendlyMode) document.documentElement.setAttribute('data-dyslexia-friendly', 'true');
            if (s.colorBlindMode) document.documentElement.setAttribute('data-color-blind', 'true');
            if (s.alwaysShowShortcutHints) document.documentElement.setAttribute('data-always-show-shortcuts', 'true');
            if (s.stickyCursorIndicator) document.documentElement.setAttribute('data-sticky-cursor', 'true');
            if (s.wrapTabNavigation) document.documentElement.setAttribute('data-wrap-tab', 'true');
            if (s.highlightCurrentLine) document.documentElement.setAttribute('data-highlight-current-line', 'true');
            if (s.showWhitespace) document.documentElement.setAttribute('data-show-whitespace', 'true');
            // RTL (i18n): set <html dir> + lang BEFORE hydration too —
            // useDocumentDirection used to flip them only after React
            // mounted, so Arabic users got an LTR flash and a wrong
            // lang="en" on every reload. The key matches i18n.ts's
            // STORAGE_KEY ("praxis.language"); "ar" is the only RTL
            // language today. (suppressHydrationWarning on <html> keeps
            // the server/client attribute mismatch non-fatal.)
            if (localStorage.getItem('praxis.language') === 'ar') {
              document.documentElement.setAttribute('dir', 'rtl');
              document.documentElement.setAttribute('lang', 'ar');
            }
          } catch(e) {}
        `
            }}/>
        </head>
        <body
            className={`${GeistSans.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
        >
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
        >
            {/* MotionConfig reducedMotion="user" makes Framer Motion
respect the OS-level prefers-reduced-motion
setting (and the in-app reduceMotion setting, which sets
data-reduce-motion on <html>). Without this, Framer's
JS-driven animations (drawer slide-ins, panel
expand/collapse, theme-picker height) ignore the CSS
reduce-motion rule. */}
            <MotionConfig reducedMotion="user">
                <ErrorBoundary>
                    <BrowserSupportGate>{children}</BrowserSupportGate>
                </ErrorBoundary>
                <Toaster/>
                <PWARegister/>
            </MotionConfig>
        </ThemeProvider>
        </body>
        </html>
    );
}
