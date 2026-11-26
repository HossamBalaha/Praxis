"use client";

import * as React from "react";
import {AlertTriangle, RotateCw} from "lucide-react";
import {Button} from "@/components/ui/button";

/**
 * Global React error boundary — catches render-time errors from any
 * descendant component and shows a themed "Something went wrong"
 * fallback instead of unmounting the whole app to a blank screen.
 *
 * The fallback offers a Reload button (full page reload) and a
 * "Try again" button that resets the boundary's error state so the
 * user can attempt to recover without losing the page's URL/state.
 *
 * Only catches errors thrown during rendering, in lifecycle methods,
 * and in constructors of components in the tree below. It does NOT
 * catch errors in event handlers, async code, or SSR — those need
 * their own try/catch.
 */
interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {error: null};
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {error};
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Log to the console so the error is visible in dev tools even
        // though the UI no longer shows the raw stack.
        console.error("Uncaught error (caught by ErrorBoundary):", error, info);
    }

    reset = () => {
        this.setState({error: null});
    };

    reload = () => {
        if (typeof window !== "undefined") window.location.reload();
    };

    render() {
        if (this.state.error) {
            return (
                <div className="h-screen flex items-center justify-center p-6 bg-background text-foreground">
                    <div
                        className="max-w-md w-full rounded-xl border bg-card p-6 flex flex-col items-center text-center gap-3">
                        <div
                            className="size-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                            <AlertTriangle className="size-6"/>
                        </div>
                        <h1 className="text-lg font-semibold">Something went wrong</h1>
                        <p className="text-sm text-muted-foreground">
                            An unexpected error occurred while rendering this page. Your
                            data is safe — try reloading. If the problem persists, check
                            the browser console for details.
                        </p>
                        {this.state.error.message && (
                            <pre
                                className="text-[11px] text-muted-foreground bg-muted/50 rounded-md p-2 w-full overflow-x-auto font-mono whitespace-pre-wrap break-words max-h-24">
                {this.state.error.message}
              </pre>
                        )}
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={this.reset} className="gap-1.5">
                                <RotateCw className="size-3.5"/>
                                Try again
                            </Button>
                            <Button variant="default" size="sm" onClick={this.reload}>
                                Reload page
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * PanelErrorBoundary — the PER-PANEL twin of the app-wide boundary.
 *
 * There used to be exactly one app-wide boundary, so a render crash in
 * the plots panel or a toolbox dialog blanked the ENTIRE IDE. Each
 * major region (the editor tabs, each bottom panel, the sidebars, the
 * AI sheet) is now wrapped in one of these: a crash shows a compact
 * "This panel hit an error" card INSIDE that region only — the rest
 * of the IDE keeps working, and "Reload this panel" resets just the
 * boundary (no page reload, no lost editor buffers).
 */
interface PanelErrorBoundaryProps {
    children: React.ReactNode;
    /** Short region name shown on the crash card ("Editor", "Plots"…). */
    label: string;
}

interface PanelErrorBoundaryState {
    error: Error | null;
    /** Bumped by the retry button — remounts the panel children via a
     *  fresh key so a poisoned subtree is fully discarded. */
    attempt: number;
}

export class PanelErrorBoundary extends React.Component<
    PanelErrorBoundaryProps,
    PanelErrorBoundaryState
> {
    constructor(props: PanelErrorBoundaryProps) {
        super(props);
        this.state = {error: null, attempt: 0};
    }

    static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
        return {error, attempt: 0};
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(
            `Panel error (caught by PanelErrorBoundary: ${this.props.label}):`,
            error,
            info
        );
    }

    retry = () => {
        this.setState((s) => ({error: null, attempt: s.attempt + 1}));
    };

    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full min-h-[120px] w-full items-center justify-center p-4">
                    <div
                        className="max-w-sm w-full rounded-lg border bg-card p-4 flex flex-col items-center text-center gap-2">
                        <div
                            className="size-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                            <AlertTriangle className="size-4"/>
                        </div>
                        <div className="text-sm font-semibold">
                            The {this.props.label.toLowerCase()} hit an error
                        </div>
                        <p className="text-xs text-muted-foreground">
                            The rest of the IDE is unaffected. Reload this panel to try
                            again; the browser console has the details.
                        </p>
                        {this.state.error.message && (
                            <pre
                                className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2 w-full overflow-x-auto font-mono whitespace-pre-wrap break-words max-h-16">
                {this.state.error.message}
              </pre>
                        )}
                        <Button variant="outline" size="sm" onClick={this.retry} className="gap-1.5">
                            <RotateCw className="size-3.5"/>
                            Reload this panel
                        </Button>
                    </div>
                </div>
            );
        }
        return (
            <React.Fragment key={this.state.attempt}>
                {this.props.children}
            </React.Fragment>
        );
    }
}
