"use client"

// Inspired by react-hot-toast library
import * as React from "react"

import type {ToastActionElement, ToastProps,} from "@/components/ui/toast"

// Allow up to 3 simultaneous toasts so a rapid succession of
// errors (e.g. "Failed to load code" + "Network error") isn't
// silently dropped. The previous limit of 1 replaced the first
// toast before the user could read it.
const TOAST_LIMIT = 3
// Dismissed toasts only need to stay mounted long enough for the
// exit animation to finish (~400ms). The previous value of ~16
// minutes caused hidden DOM nodes to accumulate over a long session.
const TOAST_REMOVE_DELAY = 1000

type ToasterToast = ToastProps & {
    id: string
    title?: React.ReactNode
    description?: React.ReactNode
    action?: ToastActionElement
}

const actionTypes = {
    ADD_TOAST: "ADD_TOAST",
    UPDATE_TOAST: "UPDATE_TOAST",
    DISMISS_TOAST: "DISMISS_TOAST",
    REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
    count = (count + 1) % Number.MAX_SAFE_INTEGER
    return count.toString()
}

type ActionType = typeof actionTypes

type Action =
    | {
    type: ActionType["ADD_TOAST"]
    toast: ToasterToast
}
    | {
    type: ActionType["UPDATE_TOAST"]
    toast: Partial<ToasterToast>
}
    | {
    type: ActionType["DISMISS_TOAST"]
    toastId?: ToasterToast["id"]
}
    | {
    type: ActionType["REMOVE_TOAST"]
    toastId?: ToasterToast["id"]
}

interface State {
    toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
    if (toastTimeouts.has(toastId)) {
        return
    }

    const timeout = setTimeout(() => {
        toastTimeouts.delete(toastId)
        dispatch({
            type: "REMOVE_TOAST",
            toastId: toastId,
        })
    }, TOAST_REMOVE_DELAY)

    toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case "ADD_TOAST":
            return {
                ...state,
                toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
            }

        case "UPDATE_TOAST":
            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === action.toast.id ? {...t, ...action.toast} : t
                ),
            }

        case "DISMISS_TOAST": {
            const {toastId} = action

            // ! Side effects ! - This could be extracted into a dismissToast action,
            // but I'll keep it here for simplicity
            if (toastId) {
                addToRemoveQueue(toastId)
            } else {
                state.toasts.forEach((toast) => {
                    addToRemoveQueue(toast.id)
                })
            }

            return {
                ...state,
                toasts: state.toasts.map((t) =>
                    t.id === toastId || toastId === undefined
                        ? {
                            ...t,
                            open: false,
                        }
                        : t
                ),
            }
        }
        case "REMOVE_TOAST":
            if (action.toastId === undefined) {
                return {
                    ...state,
                    toasts: [],
                }
            }
            return {
                ...state,
                toasts: state.toasts.filter((t) => t.id !== action.toastId),
            }
    }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = {toasts: []}

function dispatch(action: Action) {
    memoryState = reducer(memoryState, action)
    listeners.forEach((listener) => {
        listener(memoryState)
    })
}

type Toast = Omit<ToasterToast, "id">

/* ------------------------------------------------------------------ */
/* Auto variant inference */
/* ------------------------------------------------------------------ */
/* Call sites that don't pass an explicit `variant` still get a colored
 * toast: the variant is inferred from the TITLE text (title only, not
 * the description — descriptions often mention "0 errors" on success).
 * An explicit variant always wins, so themed call sites are unchanged.
 * Titles in this app are short, app-controlled English action names,
 * which makes keyword matching reliable. */
const DESTRUCTIVE_HINT =
    /\b(failed|fails|failure|error|errors|invalid|denied|not found|too large|malformed|cannot|can't|unable|forbidden|rejected|refused|missing|not a zip)\b/i
const WARNING_HINT =
    /\b(warning|warn|timeout|timed out|truncated|killed|stopped|stalled|nothing to|no-op|skipped|skipping|pending|deprecated|unsaved)\b/i
const SUCCESS_HINT =
    /\b(saved|create[d]?|copied|cut|moved|renamed|duplicated|duplicate[d]?|deleted|loaded|imported|exported|refreshed|complete[d]?|passed|applied|installed|generated|switched|uploaded|cleared|opened|pasted|formatted)\b/i

type InferredVariant = "default" | "success" | "warning" | "destructive"

function inferToastVariant(
    title: React.ReactNode | undefined
): InferredVariant {
    if (typeof title !== "string") return "default"
    // Order matters: a failure word anywhere ("Save failed", "Copy
    // failed") is destructive even if a success word also appears; then
    // warnings; plain success words last.
    if (DESTRUCTIVE_HINT.test(title)) return "destructive"
    if (WARNING_HINT.test(title)) return "warning"
    if (SUCCESS_HINT.test(title)) return "success"
    return "default"
}

function toast({...props}: Toast) {
    const id = genId()

    const update = (props: ToasterToast) =>
        dispatch({
            type: "UPDATE_TOAST",
            toast: {...props, id},
        })
    const dismiss = () => dispatch({type: "DISMISS_TOAST", toastId: id})

    dispatch({
        type: "ADD_TOAST",
        toast: {
            ...props,
            // Auto-color when the call site didn't pick a variant (explicit
            // variants — including "default" — are preserved).
            ...(props.variant
                ? {}
                : {variant: inferToastVariant(props.title)}),
            id,
            open: true,
            onOpenChange: (open) => {
                if (!open) dismiss()
            },
        },
    })

    return {
        id: id,
        dismiss,
        update,
    }
}

function useToast() {
    const [state, setState] = React.useState<State>(memoryState)

    React.useEffect(() => {
        listeners.push(setState)
        return () => {
            const index = listeners.indexOf(setState)
            if (index > -1) {
                listeners.splice(index, 1)
            }
        }
    }, [])

    return {
        ...state,
        toast,
        dismiss: (toastId?: string) => dispatch({type: "DISMISS_TOAST", toastId}),
    }
}

export {useToast, toast}
