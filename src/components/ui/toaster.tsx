"use client";

import * as React from "react";
import {CheckCircle2, CircleAlert, Info, TriangleAlert,} from "lucide-react";
import {useToast} from "@/hooks/use-toast";
import {loadSettings} from "@/lib/settings";
import {Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport,} from "@/components/ui/toast";

/** Variant → leading icon + its color. The card itself is already
 *  tinted by the variant (toast.tsx); the icon makes the kind of
 *  event recognizable at a glance even in peripheral vision. */
const VARIANT_ICON: Record<
    string,
    { icon: React.ElementType; className: string }
> = {
    success: {icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400"},
    warning: {icon: TriangleAlert, className: "text-amber-600 dark:text-amber-400"},
    destructive: {icon: CircleAlert, className: "text-red-600 dark:text-red-400"},
    default: {icon: Info, className: "text-muted-foreground"},
};

export function Toaster() {
    const {toasts} = useToast();
    // the provider hard-coded 5000 ms, ignoring the
    // user's toastDuration setting (0 = sticky / manual dismiss).
    // loadSettings is a cached lookup (saveSettings refreshes the
    // cache), so reading it per render keeps changes live at no cost.
    const configured = loadSettings().toastDuration
    // 0 (sticky) is passed as Infinity — Radix treats a falsy duration
    // as "no auto-close" via a different code path (and its timer logic
    // is `duration || providerDuration`), so an explicit Infinity keeps
    // the sticky intent unambiguous at every layer.
    const duration =
        configured === 0
            ? Infinity
            : typeof configured === "number" && configured > 0
                ? configured
                : 5000

    return (
        <ToastProvider swipeDirection="right" duration={duration}>
            {toasts.map(function ({id, title, description, action, ...props}) {
                const variant = (props.variant as string | undefined) ?? "default";
                const {icon: Icon, className: iconClass} =
                VARIANT_ICON[variant] ?? VARIANT_ICON.default;
                return (
                    <Toast key={id} {...props}>
                        <div className="grid gap-1 grid-cols-[auto_1fr] items-start gap-x-2.5">
                            <Icon className={`size-4 shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true"/>
                            <div className="grid gap-1 min-w-0">
                                {title && <ToastTitle>{title}</ToastTitle>}
                                {description && (
                                    <ToastDescription>{description}</ToastDescription>
                                )}
                            </div>
                        </div>
                        {action}
                        <ToastClose/>
                    </Toast>
                )
            })}
            {/* The viewport uses aria-live="assertive" so destructive
(error) toasts are announced immediately by screen readers
instead of waiting for the user to pause. Normal toasts are
also announced, but assertive is the safer default for an IDE
where error notifications (run failures, save errors) are
time-sensitive. */}
            <ToastViewport aria-live="assertive"/>
        </ToastProvider>
    )
}
