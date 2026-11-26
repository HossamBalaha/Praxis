"use client";

import * as React from "react";
import {Check, ChevronDown, CircleAlert, Code2, Copy, ExternalLink, Sparkles, Wand2,} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {useToast} from "@/hooks/use-toast";
import {useChromeLanguage} from "@/lib/i18n-react";
import type {AiEndpoint} from "@/lib/settings";

/** The app-wide CustomEvent that routes a question into the
 *  integrated AI chat. The AiChatSidebar listens for it (opens itself
 *  via its onOpenChange prop and auto-sends `detail.text`, queueing
 *  behind an in-flight stream). Run failures use this so the error
 *  context lands in the built-in chat instead of a blank external
 *  tab. */
export const AI_PROMPT_EVENT = "praxis:ai-prompt";

/** Send `question` to the app's integrated AI chat sidebar — the
 *  default route for every "Ask AI" affordance that has no explicit
 *  `onIntegrated` handler (run failures, output-panel asks). */
export function askIntegratedAi(question: string): void {
    if (typeof window === "undefined") return;
    const text = question.trim();
    if (!text) return;
    window.dispatchEvent(
        new CustomEvent(AI_PROMPT_EVENT, {detail: {text}})
    );
}

interface AskAiButtonProps {
    /** The question to send to the AI. */
    question: string;
    /** The AI endpoints from settings. */
    endpoints: AiEndpoint[];
    /** Button label override. */
    label?: string;
    /** Button variant. */
    variant?: "ghost" | "outline" | "default";
    /** Icon to show. */
    icon?: "sparkles" | "code" | "wand" | "alert";
    /** Button size. */
    size?: "sm" | "default";
    /** Tooltip describing what this button does. */
    title?: string;
    /** When provided, the dropdown's FIRST item routes the question to
     *  the app's integrated AI (opens the AI Chat sidebar and sends it).
     *  When NOT provided, that item defaults to dispatching the
     *  `praxis:ai-prompt` CustomEvent (see askIntegratedAi) — so run
     *  failures reach the built-in chat even though their host (the
     *  output panel) passes no handler. The external endpoints stay in
     *  the same menu, and the button only renders when at least one
     *  external endpoint is enabled — exactly like before. */
    onIntegrated?: () => void;
    /** Label for the integrated-AI menu item (e.g. "Praxis AI"). */
    integratedLabel?: string;
    /** When true the button renders even with zero enabled external
     *  endpoints (the integrated item is then the whole menu). */
    showWithoutEndpoints?: boolean;
}

/** Copy `question` to the clipboard, toast about it, and open the
 * external AI's website in a new tab — the shared behavior of every
 * "Ask <external AI>" affordance (AskAiButton, the AI menu's
 * Explain / Improve submenus). Since most AI services don't support
 * URL-based pre-fill, the question is copied and the toast tells the
 * user to paste it. */
export async function askExternalAi(
    question: string,
    endpoint: { name: string; url: string },
    toast: ReturnType<typeof useToast>["toast"]
) {
    try {
        await navigator.clipboard.writeText(question);
        toast({
            title: `Question copied for ${endpoint.name}`,
            description: "Paste it into the AI's chat input.",
            variant: "success",
        });
        window.open(endpoint.url, "_blank", "noopener,noreferrer");
    } catch {
        toast({
            title: "Clipboard blocked",
            description: "Copy the question manually.",
            variant: "destructive",
        });
    }
}

/**
 * A dropdown button that routes the question to the app's integrated
 * AI chat FIRST (the praxis:ai-prompt CustomEvent → AiChatSidebar),
 * and additionally offers every enabled external AI endpoint: the
 * external flow copies the question to clipboard and opens the chosen
 * assistant's website in a new tab (most services don't support
 * URL-based pre-fill — the toast tells the user to paste it).
 *
 * Run-failure hosts (the output panel's "Ask AI about error") pass no
 * `onIntegrated`, so they get the default event route — the failure
 * context (error text + source excerpt) lands in the built-in chat
 * instead of a blank external tab. Hosts with their own handler
 * (the code viewer's Explain / Improve) keep it verbatim.
 */
export function AskAiButton({
                                question,
                                endpoints,
                                label,
                                variant = "ghost",
                                icon = "sparkles",
                                size = "sm",
                                title,
                                onIntegrated,
                                integratedLabel,
                                showWithoutEndpoints = false,
                            }: AskAiButtonProps) {
    const {toast} = useToast();
    const {t} = useChromeLanguage();
    const [copied, setCopied] = React.useState(false);
    const enabledEndpoints = endpoints.filter((e) => e.enabled);

    // Default integrated route — the praxis:ai-prompt CustomEvent the
    // AiChatSidebar listens for. Hosts that pass an explicit onIntegrated
    // (code viewer "Explain"/"Improve") keep their prop-injected handler;
    // hosts that pass nothing (the output panel's run-failure ask) get
    // the event route, so failure text reaches the integrated chat.
    const handleIntegrated = onIntegrated ?? (() => askIntegratedAi(question));

    if (enabledEndpoints.length === 0 && !showWithoutEndpoints) {
        // No external endpoints AND no permission to render without them —
        // nothing to show. (The integrated item alone still renders when
        // showWithoutEndpoints is set.)
        return null;
    }

    const handleSelect = (endpoint: AiEndpoint) => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        void askExternalAi(question, endpoint, toast);
    };

    const Icon = icon === "code"
        ? Code2
        : icon === "wand"
            ? Wand2
            : icon === "alert"
                ? CircleAlert
                : Sparkles;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={variant}
                    size={size}
                    className="gap-1.5 text-xs"
                    title={title ?? `Ask an AI: routes the question to the integrated Praxis chat, or copies it to clipboard and opens the chosen external assistant in a new tab`}
                >
                    {copied ? (
                        <Check className="size-3.5 text-emerald-500"/>
                    ) : (
                        <Icon className="size-3.5 text-purple-500"/>
                    )}
                    {label ?? t("askAiLabel")}
                    <ChevronDown className="size-3"/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={handleIntegrated}
                    className="gap-2 cursor-pointer"
                >
                    <Sparkles className="size-3.5 text-purple-500"/>
                    {integratedLabel ?? t("askAiIntegrated")}
                    <span className="ms-auto text-[10px] text-muted-foreground">
            {t("askAiOpensSidebar")}
          </span>
                </DropdownMenuItem>
                {enabledEndpoints.length > 0 && (
                    <>
                        <DropdownMenuSeparator/>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t("askAiExternalLabel")}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => handleSelect(enabledEndpoints[0])}
                            className="gap-2 cursor-pointer"
                        >
                            <ExternalLink className="size-3.5"/>
                            Ask {enabledEndpoints[0].name}
                            <span className="ms-auto text-[10px] text-muted-foreground">
                {t("askAiCopiesQuestion")}
              </span>
                        </DropdownMenuItem>
                        {enabledEndpoints.length > 1 && (
                            <>
                                <DropdownMenuSeparator/>
                                {enabledEndpoints.slice(1).map((ep) => (
                                    <DropdownMenuItem
                                        key={ep.name}
                                        onClick={() => handleSelect(ep)}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <ExternalLink className="size-3.5"/>
                                        Ask {ep.name}
                                    </DropdownMenuItem>
                                ))}
                            </>
                        )}
                    </>
                )}
                <DropdownMenuSeparator/>
                <DropdownMenuItem
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(question);
                            toast({title: "Question copied to clipboard", variant: "success"});
                        } catch {
                            toast({
                                title: "Copy failed",
                                variant: "destructive",
                            });
                        }
                    }}
                    className="gap-2 cursor-pointer"
                >
                    <Copy className="size-3.5"/>
                    {t("askAiCopyOnly")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
