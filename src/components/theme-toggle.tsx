"use client";

import * as React from "react";
import {Moon, Sun} from "lucide-react";
import {useTheme} from "next-themes";
import {Button} from "@/components/ui/button";

/**
 * A small button that cycles between light / dark / system themes.
 * Mounted in the header so users can flip themes at any time.
 */
export function ThemeToggle() {
    const {setTheme, resolvedTheme} = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    // Avoid hydration mismatch: render a placeholder until mounted.
    if (!mounted) {
        return (
            <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full"
                aria-label="Toggle theme"
            >
                <Sun className="size-4"/>
            </Button>
        );
    }

    const isDark = resolvedTheme === "dark";

    return (
        <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
            {isDark ? <Sun className="size-4"/> : <Moon className="size-4"/>}
        </Button>
    );
}
