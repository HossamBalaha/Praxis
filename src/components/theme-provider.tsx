"use client";

import * as React from "react";
import {ThemeProvider as NextThemesProvider} from "next-themes";

/**
 * Wraps `next-themes` so we can toggle between light and dark mode.
 * Mounted on the root layout; Praxis Light (the light family) is the
 * default look — the OS preference only applies when the user picks
 * the "system" option explicitly.
 */
export function ThemeProvider({
                                  children,
                                  ...props
                              }: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
