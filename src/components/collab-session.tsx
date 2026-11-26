"use client";

/**
 * CollabSession — the client half of the live-collaboration feature.
 *
 * While `open`, it owns ONE EventSource on `/api/collab?room=…` and a
 * POST relay to the same route; identity comes from
 * `@/lib/collab-store`. It renders a draggable floating session bar
 * (status chip + peer count + card trigger + end) and the "session
 * card" dialog (roster, room code, invite link, permission, follow
 * note, end session).
 *
 * ── Window events this component LISTENS for (dispatch from the
 *    editor/terminal — they carry the local user's activity) ──────
 *   "praxis:collab-cursor"   detail { file, line, col,
 *                                    selection?: { startLine, endLine } }
 *       → presence POST, throttled 120 ms (last state in the window wins).
 *   "praxis:collab-buffer"   detail { file, content }
 *       → op POST, throttled 400 ms (full-buffer broadcast).
 *   "praxis:collab-terminal" detail { text }
 *       → op POST, coalesced 250 ms (burst lines join into one op).
 *   "praxis:collab-follow"   detail { target: string | null }
 *       → presence POST (follow / stop following a peer).
 *
 * ── Window events this component DISPATCHES (the HOST consumes
 *    these; read-only guests must NOT apply peer buffers — that
 *    policy lives with the host, this component only relays) ─────
 *   "praxis:collab-peer-buffer"   detail { user, file, content }
 *   "praxis:collab-peer-terminal" detail { user, text }
 *
 * Peer cursor data flows out through the `onPeerCursor` prop, which
 * fires with the full peers array on every roster/presence change so
 * the host can render remote cursors and the avatar stack.
 */

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {useStableEvent} from "@/lib/use-stable-event";
import {STORAGE_PREFIX} from "@/lib/config";
import {loadCollabIdentity, loadCollabSettings, roomUrl} from "@/lib/collab-store";
import {Check, Copy, Eye, Link2, Locate, LogOut, PencilLine, Users, X,} from "lucide-react";

/* ── Public shapes ─────────────────────────────────────────────── */

export interface CollabPeerCursor {
    id: string;
    name: string;
    color: string;
    file: string;
    line: number;
    col: number;
    selection?: { startLine: number; endLine: number };
}

export interface CollabSessionProps {
    open: boolean;
    room: string;
    onClose: () => void;
    /** What guests may do in sessions this host runs. */
    guestPermission: "read" | "edit";
    /** Roster + cursor snapshot, called whenever the peers change. */
    onPeerCursor?: (peers: CollabPeerCursor[]) => void;
}

/* ── Wire shapes (mirror of /api/collab) ───────────────────────── */

interface CollabUser {
    id: string;
    name: string;
    color: string;
}

interface PeerState extends CollabUser {
    file?: string;
    line?: number;
    col?: number;
    selection?: { startLine: number; endLine: number };
    /** Peer this user is following, when a follow presence arrived. */
    follow?: string | null;
}

type PresencePayload =
    | {
    kind: "cursor";
    user: CollabUser;
    file: string;
    line: number;
    col: number;
    selection?: { startLine: number; endLine: number };
}
    | {
    kind: "selection";
    user: CollabUser;
    file: string;
    startLine: number;
    endLine: number;
}
    | { kind: "follow"; user: CollabUser; target: string | null };

type OpPayload =
    | { kind: "buffer"; user: CollabUser; file: string; content: string }
    | { kind: "terminal"; user: CollabUser; text: string };

type SseEvent =
    | { kind: "hello"; user: CollabUser; peers: CollabUser[] }
    | { kind: "join"; user: CollabUser }
    | { kind: "leave"; user: CollabUser }
    | { kind: "presence"; payload: PresencePayload }
    | { kind: "op"; payload: OpPayload };

interface SelfIdentity {
    id: string;
    name: string;
    color: string;
}

type ConnStatus = "connecting" | "connected" | "reconnecting" | "offline";

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2_000;
const CURSOR_THROTTLE_MS = 120;
const BUFFER_THROTTLE_MS = 400;
const TERMINAL_COALESCE_MS = 250;

/** Persisted drag position for the floating session bar. */
const POS_KEY = `${STORAGE_PREFIX}.collab.session-pos`;

function clampNum(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
}

/** Leading+trailing throttle: the first call in a window fires at
 *  once, suppressed calls replace the pending trailing call — the
 *  LAST state in the window is always delivered. */
interface Throttler {
    push(fn: () => void): void;

    dispose(flush: boolean): void;
}

function createThrottler(ms: number): Throttler {
    let last = 0;
    let timer: number | undefined;
    let pending: (() => void) | null = null;
    const fire = () => {
        last = Date.now();
        const run = pending;
        pending = null;
        if (run) run();
    };
    return {
        push(fn: () => void) {
            pending = fn;
            const remaining = last + ms - Date.now();
            if (remaining <= 0) {
                fire();
            } else if (timer === undefined) {
                timer = window.setTimeout(() => {
                    timer = undefined;
                    fire();
                }, remaining);
            }
        },
        dispose(flush: boolean) {
            if (timer !== undefined) {
                window.clearTimeout(timer);
                timer = undefined;
            }
            if (flush) {
                const run = pending;
                pending = null;
                if (run) run();
            } else {
                pending = null;
            }
        },
    };
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "G";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isFiniteInt(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/* ── The component ─────────────────────────────────────────────── */

export function CollabSession({
                                  open,
                                  room,
                                  onClose,
                                  guestPermission,
                                  onPeerCursor,
                              }: CollabSessionProps) {
    const [self, setSelf] = React.useState<SelfIdentity | null>(null);
    const [autoFollow, setAutoFollow] = React.useState(true);
    const [peers, setPeers] = React.useState<PeerState[]>([]);
    const [status, setStatus] = React.useState<ConnStatus>("connecting");
    const [cardOpen, setCardOpen] = React.useState(false);
    const [copied, setCopied] = React.useState<"code" | "link" | null>(null);
    const copyTimer = React.useRef<number | undefined>(undefined);

    // Identity + settings hydrate once on mount (client-only — the
    // store reads localStorage). Display name/color settings override
    // the generated identity when non-empty.
    React.useEffect(() => {
        const identity = loadCollabIdentity();
        const settings = loadCollabSettings();
        setSelf({
            id: identity.id,
            name: settings.displayName || identity.name,
            color: settings.cursorColor || identity.color,
        });
        setAutoFollow(settings.autoFollow);
    }, []);

    const notifyPeers = useStableEvent((list: CollabPeerCursor[]) => {
        onPeerCursor?.(list);
    });

    // Fan the peers list out to the host whenever it changes.
    React.useEffect(() => {
        notifyPeers(
            peers.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
                file: p.file ?? "",
                line: p.line ?? 0,
                col: p.col ?? 0,
                ...(p.selection ? {selection: {...p.selection}} : {}),
            }))
        );
    }, [peers, notifyPeers]);

    /* ── Transport: one EventSource + POST relay while open ───────── */

    React.useEffect(() => {
        if (!open || !self) return;
        const user = self;
        let es: EventSource | null = null;
        let attempts = 0;
        let retryTimer: number | undefined;
        let intentionalClose = false;
        let disposed = false;

        const post = (action: string, payload?: unknown) => {
            void fetch("/api/collab", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({room, action, user, payload}),
            }).catch(() => {
                /* relay is best-effort — the reconnect ladder re-syncs state */
            });
        };

        const handleEvent = (raw: string) => {
            let ev: SseEvent;
            try {
                ev = JSON.parse(raw) as SseEvent;
            } catch {
                return; // malformed frame — ignore
            }
            if (typeof ev?.kind !== "string") return;
            switch (ev.kind) {
                case "hello":
                    // Fresh roster snapshot (also on every reconnect).
                    setPeers(
                        (ev.peers ?? [])
                            .filter((p) => p.id !== user.id)
                            .map((p) => ({id: p.id, name: p.name, color: p.color}))
                    );
                    break;
                case "join":
                    if (ev.user.id !== user.id) {
                        setPeers((prev) =>
                            prev.some((p) => p.id === ev.user.id)
                                ? prev
                                : [
                                    ...prev,
                                    {id: ev.user.id, name: ev.user.name, color: ev.user.color},
                                ]
                        );
                    }
                    break;
                case "leave":
                    setPeers((prev) => prev.filter((p) => p.id !== ev.user.id));
                    break;
                case "presence": {
                    const payload = ev.payload;
                    if (!payload || payload.user.id === user.id) break;
                    setPeers((prev) => {
                        const idx = prev.findIndex((p) => p.id === payload.user.id);
                        const base: PeerState =
                            idx >= 0
                                ? prev[idx]
                                : {id: payload.user.id, name: payload.user.name, color: payload.user.color};
                        const next: PeerState = {
                            ...base,
                            name: payload.user.name,
                            color: payload.user.color,
                        };
                        if (payload.kind === "cursor") {
                            next.file = payload.file;
                            next.line = payload.line;
                            next.col = payload.col;
                            // A selection travels with the cursor payload; absent
                            // means "unchanged", not "cleared" (hosts send a
                            // selection-less cursor for caret-only moves).
                            if (payload.selection) next.selection = {...payload.selection};
                        } else if (payload.kind === "selection") {
                            next.file = payload.file;
                            next.selection = {
                                startLine: payload.startLine,
                                endLine: payload.endLine,
                            };
                        } else {
                            next.follow = payload.target;
                        }
                        const copy = prev.slice();
                        if (idx >= 0) copy[idx] = next;
                        else copy.push(next);
                        return copy;
                    });
                    break;
                }
                case "op": {
                    const payload = ev.payload;
                    if (!payload || payload.user.id === user.id) break;
                    // Pure relay — the host (which knows the permission model)
                    // decides whether to apply peer buffers/terminal output.
                    if (payload.kind === "buffer") {
                        window.dispatchEvent(
                            new CustomEvent("praxis:collab-peer-buffer", {
                                detail: {
                                    user: payload.user,
                                    file: payload.file,
                                    content: payload.content,
                                },
                            })
                        );
                    } else {
                        window.dispatchEvent(
                            new CustomEvent("praxis:collab-peer-terminal", {
                                detail: {user: payload.user, text: payload.text},
                            })
                        );
                    }
                    break;
                }
            }
        };

        const connect = () => {
            if (disposed) return;
            setStatus(attempts === 0 ? "connecting" : "reconnecting");
            const url =
                `/api/collab?room=${encodeURIComponent(room)}` +
                `&uid=${encodeURIComponent(user.id)}` +
                `&name=${encodeURIComponent(user.name)}` +
                `&color=${encodeURIComponent(user.color)}`;
            es = new EventSource(url);
            es.onopen = () => {
                if (disposed) {
                    es?.close();
                    return;
                }
                attempts = 0;
                setStatus("connected");
                post("join");
            };
            es.onmessage = (msg) => handleEvent(msg.data);
            es.onerror = () => {
                // Take the EventSource off the browser's own auto-reconnect and
                // drive retries ourselves: 2 s apart, at most five in a row.
                if (intentionalClose || disposed) return;
                es?.close();
                es = null;
                if (attempts >= MAX_RETRY_ATTEMPTS) {
                    setStatus("offline");
                    return;
                }
                attempts += 1;
                setStatus("reconnecting");
                retryTimer = window.setTimeout(connect, RETRY_DELAY_MS);
            };
        };

        setPeers([]);
        setStatus("connecting");
        connect();

        return () => {
            disposed = true;
            intentionalClose = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
            post("leave");
            es?.close();
            setPeers([]);
            setStatus("connecting");
        };
    }, [open, room, self]);

    /* ── Outbound window-event relays (throttled) ─────────────────── */

    React.useEffect(() => {
        if (!open || !self) return;
        const user = self;

        const post = (action: string, payload?: unknown) => {
            void fetch("/api/collab", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({room, action, user, payload}),
            }).catch(() => {
                /* best-effort */
            });
        };

        const cursorThrottle = createThrottler(CURSOR_THROTTLE_MS);
        const bufferThrottle = createThrottler(BUFFER_THROTTLE_MS);
        const terminalThrottle = createThrottler(TERMINAL_COALESCE_MS);
        let terminalTail = "";

        const onCursor = (e: Event) => {
            const detail = (e as CustomEvent<{
                file?: string;
                line?: number;
                col?: number;
                selection?: { startLine?: number; endLine?: number };
            } | undefined>).detail;
            if (!detail || typeof detail.file !== "string") return;
            const line = isFiniteInt(detail.line) ? detail.line : 0;
            const col = isFiniteInt(detail.col) ? detail.col : 0;
            const sel =
                detail.selection &&
                isFiniteInt(detail.selection.startLine) &&
                isFiniteInt(detail.selection.endLine)
                    ? {
                        startLine: detail.selection.startLine,
                        endLine: detail.selection.endLine,
                    }
                    : undefined;
            cursorThrottle.push(() =>
                post("presence", {
                    kind: "cursor",
                    file: detail.file,
                    line,
                    col,
                    ...(sel ? {selection: sel} : {}),
                })
            );
        };

        const onBuffer = (e: Event) => {
            const detail = (e as CustomEvent<{ file?: string; content?: string } | undefined>).detail;
            if (!detail || typeof detail.file !== "string" || typeof detail.content !== "string") {
                return;
            }
            bufferThrottle.push(() =>
                post("op", {kind: "buffer", file: detail.file, content: detail.content})
            );
        };

        const onTerminal = (e: Event) => {
            const detail = (e as CustomEvent<{ text?: string } | undefined>).detail;
            if (!detail || typeof detail.text !== "string" || detail.text === "") return;
            // Bursts of terminal output join into one op at the flush.
            terminalTail += detail.text;
            terminalThrottle.push(() => {
                const text = terminalTail;
                terminalTail = "";
                if (text) post("op", {kind: "terminal", text});
            });
        };

        const onFollow = (e: Event) => {
            const detail = (e as CustomEvent<{ target?: string | null } | undefined>).detail;
            if (!detail) return;
            const target = detail.target ?? null;
            if (target !== null && typeof target !== "string") return;
            post("presence", {kind: "follow", target});
        };

        window.addEventListener("praxis:collab-cursor", onCursor);
        window.addEventListener("praxis:collab-buffer", onBuffer);
        window.addEventListener("praxis:collab-terminal", onTerminal);
        window.addEventListener("praxis:collab-follow", onFollow);
        return () => {
            window.removeEventListener("praxis:collab-cursor", onCursor);
            window.removeEventListener("praxis:collab-buffer", onBuffer);
            window.removeEventListener("praxis:collab-terminal", onTerminal);
            window.removeEventListener("praxis:collab-follow", onFollow);
            // Drop (not flush) the pending trailing posts: anything flushed
            // here would race the "leave" POST and could re-add this user to
            // the peers' rosters after the leave landed — a stuck avatar.
            // Losing the last in-flight cursor/buffer of a closing session
            // is harmless; a ghost peer is not.
            cursorThrottle.dispose(false);
            bufferThrottle.dispose(false);
            terminalThrottle.dispose(false);
        };
    }, [open, room, self]);

    /* ── Session-card plumbing ───────────────────────────────────── */

    React.useEffect(() => {
        if (!open) setCardOpen(false);
    }, [open]);

    const inviteUrl = React.useMemo(
        () => (typeof window === "undefined" ? "" : roomUrl(room)),
        [room]
    );

    const copyText = useStableEvent(async (text: string, tag: "code" | "link") => {
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch {
            // Fallback for non-secure contexts: hidden textarea + execCommand.
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand("copy");
                ta.remove();
            } catch {
                ok = false;
            }
        }
        if (!ok) return;
        setCopied(tag);
        if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
    });
    React.useEffect(() => {
        return () => {
            if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
        };
    }, []);

    const endSession = React.useCallback(() => {
        setCardOpen(false);
        onClose();
    }, [onClose]);

    /* ── Floating bar drag (focus-timer pattern) ──────────────────── */

    const barRef = React.useRef<HTMLDivElement | null>(null);
    const dragRef = React.useRef<{
        pointerId: number;
        offsetX: number;
        offsetY: number;
    } | null>(null);
    // Position lives in state for rendering; the ref pair drives moves.
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

    // Restore the last position on mount, clamped to today's viewport.
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(POS_KEY);
            if (raw) {
                const p = JSON.parse(raw) as { x?: number; y?: number };
                if (typeof p.x === "number" && typeof p.y === "number") {
                    setPos({
                        x: clampNum(p.x, 8, Math.max(8, window.innerWidth - 140)),
                        y: clampNum(p.y, 8, Math.max(8, window.innerHeight - 60)),
                    });
                }
            }
        } catch {
            /* corrupted — keep the anchored default position */
        }
    }, []);

    const persistPos = React.useCallback((x: number, y: number) => {
        try {
            window.localStorage.setItem(POS_KEY, JSON.stringify({x, y}));
        } catch {
            /* storage */
        }
    }, []);

    // Keep the bar inside the viewport when the window shrinks.
    React.useEffect(() => {
        const onResize = () => {
            setPos((prev) => {
                if (!prev) return prev;
                const el = barRef.current;
                const width = el?.offsetWidth ?? 280;
                const height = el?.offsetHeight ?? 44;
                const next = {
                    x: clampNum(prev.x, 8, Math.max(8, window.innerWidth - width - 8)),
                    y: clampNum(prev.y, 8, Math.max(8, window.innerHeight - height - 8)),
                };
                if (next.x !== prev.x || next.y !== prev.y) persistPos(next.x, next.y);
                return next;
            });
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [persistPos]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Only the bar surface drags — buttons stay clickable.
        if ((e.target as HTMLElement).closest('button, input, a, [role="switch"]')) return;
        const el = barRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const base = pos ?? {x: rect.left, y: rect.top};
        dragRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
        setPos(base);
        el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const el = barRef.current;
        if (!el) return;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        setPos({
            x: clampNum(
                e.clientX - drag.offsetX,
                8,
                Math.max(8, window.innerWidth - width - 8)
            ),
            y: clampNum(
                e.clientY - drag.offsetY,
                8,
                Math.max(8, window.innerHeight - height - 8)
            ),
        });
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        try {
            barRef.current?.releasePointerCapture(e.pointerId);
        } catch {
            /* already released */
        }
        setPos((prev) => {
            if (prev) persistPos(prev.x, prev.y);
            return prev;
        });
    };

    /* ── Derived render values ───────────────────────────────────── */

    if (!open) return null;

    const statusMeta: Record<ConnStatus, { label: string; chip: string; dot: string }> = {
        connected: {
            label: "Connected",
            chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            dot: "bg-emerald-500",
        },
        connecting: {
            label: "Connecting",
            chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            dot: "bg-amber-500 animate-pulse",
        },
        reconnecting: {
            label: "Reconnecting",
            chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            dot: "bg-amber-500 animate-pulse",
        },
        offline: {
            label: "Offline",
            chip: "bg-destructive/10 text-destructive",
            dot: "bg-destructive",
        },
    };
    const statusInfo = statusMeta[status];

    const roster: Array<{
        id: string;
        name: string;
        color: string;
        isYou: boolean;
        follow: string | null;
        file?: string;
        line?: number;
    }> = self
        ? [
            {id: self.id, name: self.name, color: self.color, isYou: true, follow: null},
            ...peers.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isYou: false,
                follow: p.follow ?? null,
                file: p.file,
                line: p.line,
            })),
        ]
        : [];

    return (
        <>
            {/* Floating session bar — draggable, position persisted. */}
            <div
                ref={barRef}
                role="toolbar"
                aria-label="Collaboration session controls"
                style={pos ? {left: pos.x, top: pos.y} : undefined}
                className={cn(
                    "fixed z-40 flex select-none touch-none items-center gap-2 rounded-full border border-border/70 bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur",
                    !pos && "right-4 top-4"
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                statusInfo.chip
            )}
            aria-live="polite"
        >
          <span className={cn("size-1.5 rounded-full", statusInfo.dot)} aria-hidden="true"/>
            {statusInfo.label}
        </span>
                <span className="text-xs text-muted-foreground tabular-nums">
          {peers.length === 1 ? "1 peer" : `${peers.length} peers`}
        </span>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setCardOpen(true)}
                    aria-label="Open the session card"
                >
                    <Users className="size-3.5"/>
                    Session
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={endSession}
                    aria-label="End collaboration session"
                >
                    <X className="size-3.5"/>
                </Button>
            </div>

            {/* Session card dialog */}
            <Dialog open={cardOpen} onOpenChange={setCardOpen}>
                <DialogContent className="gap-4 p-4 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Live session</DialogTitle>
                        <DialogDescription>
                            Share the room code or invite link — peers join the room and
                            follow along.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Connected users */}
                    <section className="flex flex-col gap-2" aria-label="Connected users">
                        <h3 className="text-xs font-medium">
                            Connected ({roster.length})
                        </h3>
                        <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent">
                            {roster.map((u) => (
                                <li
                                    key={u.id}
                                    className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
                                >
                  <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{backgroundColor: u.color}}
                      aria-hidden="true"
                  >
                    {initialsOf(u.name)}
                  </span>
                                    <span className="min-w-0 truncate text-xs font-medium">{u.name}</span>
                                    {u.isYou && (
                                        <Badge variant="secondary" className="text-[10px]">
                                            you
                                        </Badge>
                                    )}
                                    {!u.isYou && u.follow === self?.id && (
                                        <span className="text-[10px] text-muted-foreground">following you</span>
                                    )}
                                    {!u.isYou && u.file && (
                                        <span
                                            className="ml-auto max-w-32 truncate font-mono text-[10px] text-muted-foreground"
                                            title={u.file}
                                        >
                      {u.file}:{u.line ?? 0}
                    </span>
                                    )}
                                </li>
                            ))}
                            {status === "connecting" && roster.length <= 1 && (
                                <li className="flex items-center gap-2 px-1 py-1" aria-label="Waiting for peers">
                                    <Skeleton className="size-6 rounded-full"/>
                                    <Skeleton className="h-4 w-32"/>
                                </li>
                            )}
                        </ul>
                    </section>

                    {/* Room code */}
                    <section className="flex flex-col gap-1.5" aria-label="Room code">
                        <h3 className="text-xs font-medium">Room code</h3>
                        <div className="flex items-center gap-2">
                            <code
                                className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-xs">
                                {room}
                            </code>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => void copyText(room, "code")}
                                aria-label="Copy room code"
                            >
                                {copied === "code" ? (
                                    <Check className="size-3.5 text-emerald-500"/>
                                ) : (
                                    <Copy className="size-3.5"/>
                                )}
                                {copied === "code" ? "Copied" : "Copy"}
                            </Button>
                        </div>
                    </section>

                    {/* Invite link */}
                    <section className="flex flex-col gap-1.5" aria-label="Invite link">
                        <h3 className="text-xs font-medium">Invite link</h3>
                        <div className="flex items-center gap-2">
              <span
                  className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-xs"
                  title={inviteUrl}
              >
                {inviteUrl}
              </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => void copyText(inviteUrl, "link")}
                                aria-label="Copy invite link"
                            >
                                {copied === "link" ? (
                                    <Check className="size-3.5 text-emerald-500"/>
                                ) : (
                                    <Link2 className="size-3.5"/>
                                )}
                                {copied === "link" ? "Copied" : "Copy"}
                            </Button>
                        </div>
                    </section>

                    {/* Guest permission + follow-mode note */}
                    <section
                        className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3"
                        aria-label="Session settings"
                    >
                        <div className="flex items-center gap-2 text-xs">
                            {guestPermission === "edit" ? (
                                <PencilLine className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"/>
                            ) : (
                                <Eye className="size-3.5 shrink-0 text-muted-foreground"/>
                            )}
                            <span>
                {guestPermission === "edit"
                    ? "Guests can edit files and run their changes"
                    : "Guests are read-only — they watch, you edit"}
              </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Locate className="size-3.5 shrink-0"/>
                            <span>
                {autoFollow
                    ? "Auto-follow on — the editor jumps to peer cursor movement"
                    : "Auto-follow off — peer cursors render without jumping"}
              </span>
                        </div>
                    </section>

                    <DialogFooter>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={endSession}
                            aria-label="End the collaboration session"
                        >
                            <LogOut className="size-3.5"/> End session
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
