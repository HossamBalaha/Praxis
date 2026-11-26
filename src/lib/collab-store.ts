"use client";

/**
 * Live-collaboration client store — the identity + settings half of
 * the collab feature (the server half is /api/collab, the transport
 * half is CollabSession).
 *
 * Everything persists under `${STORAGE_PREFIX}.collab` in localStorage:
 *   .identity — the stable per-browser identity (id + display name +
 *               palette color) generated once and reused forever.
 *   .settings — user preferences (display-name override, cursor-color
 *               override, guest permission, auto-follow).
 *
 * Identity vs settings: the identity is the GENERATED fallback; the
 * settings fields override it when non-empty. Consumers resolve:
 *   name  = settings.displayName || identity.name
 *   color = settings.cursorColor || identity.color
 * Empty string in the settings fields means "unset — use identity".
 */

import {STORAGE_PREFIX} from "@/lib/config";

const COLLAB_ROOT = `${STORAGE_PREFIX}.collab`;
const IDENTITY_KEY = `${COLLAB_ROOT}.identity`;
const SETTINGS_KEY = `${COLLAB_ROOT}.settings`;

export interface CollabIdentity {
    /** Stable per-browser id (never changes once generated). */
    id: string;
    /** Fallback display name, e.g. "Guest-4821". */
    name: string;
    /** Fallback color from the palette below. */
    color: string;
}

export interface CollabSettings {
    /** Display-name override; "" = use the identity's generated name. */
    displayName: string;
    /** Cursor color override; "" = use the identity's generated color. */
    cursorColor: string;
    /** What guests may do in sessions this user hosts. */
    guestPermission: "read" | "edit";
    /** Jump the editor to peer cursor movement as it arrives. */
    autoFollow: boolean;
}

/** 10-color peer palette — remote cursors and avatar circles pick
 *  from this so peers are visually distinguishable at a glance. */
const PALETTE: readonly string[] = [
    "#f43f5e", // rose
    "#f97316", // orange
    "#f59e0b", // amber
    "#10b981", // emerald
    "#14b8a6", // teal
    "#0ea5e9", // sky
    "#8b5cf6", // violet
    "#d946ef", // fuchsia
    "#ec4899", // pink
    "#84cc16", // lime
];

const DEFAULT_SETTINGS: CollabSettings = {
    displayName: "",
    cursorColor: "",
    guestPermission: "edit",
    autoFollow: true,
};

/** Room ids must stay URL- and regex-safe (^[a-z0-9-]{3,40}$ on the
 *  server) — makeRoomCode guarantees that shape by construction. */
const ROOM_ID_RE = /^[a-z0-9-]{3,40}$/;

function randomId(): string {
    // crypto.randomUUID when available (all modern browsers), a
    // two-part Math.random fallback otherwise.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return Array.from({length: 2}, () =>
        Math.floor(Math.random() * 0x100000000).toString(36)
    ).join("-");
}

function generateIdentity(): CollabIdentity {
    // "Guest-4821" — four digits keep the name short and readable
    // while avoiding the clumsy collisions of tiny ranges.
    const digits = String(Math.floor(Math.random() * 9000) + 1000);
    return {
        id: randomId(),
        name: `Guest-${digits}`,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? "#10b981",
    };
}

export function loadCollabIdentity(): CollabIdentity {
    // Server-side call: no localStorage to read — return a neutral,
    // deterministic placeholder (callers hydrate on the client anyway).
    if (typeof window === "undefined") {
        return {id: "local", name: "Guest", color: PALETTE[0] ?? "#10b981"};
    }
    try {
        const raw = window.localStorage.getItem(IDENTITY_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<CollabIdentity>;
            if (
                typeof parsed.id === "string" &&
                parsed.id.length > 0 &&
                parsed.id.length <= 64 &&
                typeof parsed.name === "string" &&
                parsed.name.length > 0 &&
                parsed.name.length <= 40 &&
                typeof parsed.color === "string" &&
                parsed.color.length > 0 &&
                parsed.color.length <= 32
            ) {
                return {id: parsed.id, name: parsed.name, color: parsed.color};
            }
        }
    } catch {
        /* corrupted — fall through to a fresh identity */
    }
    const fresh = generateIdentity();
    saveCollabIdentity(fresh);
    return fresh;
}

export function saveCollabIdentity(identity: CollabIdentity): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
        /* storage full/blocked — identity regenerates next visit */
    }
}

export function loadCollabSettings(): CollabSettings {
    if (typeof window === "undefined") return {...DEFAULT_SETTINGS};
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<CollabSettings>;
            return {
                displayName:
                    typeof parsed.displayName === "string" && parsed.displayName.length <= 40
                        ? parsed.displayName
                        : "",
                cursorColor:
                    typeof parsed.cursorColor === "string" && parsed.cursorColor.length <= 32
                        ? parsed.cursorColor
                        : "",
                guestPermission: parsed.guestPermission === "read" ? "read" : "edit",
                autoFollow: typeof parsed.autoFollow === "boolean" ? parsed.autoFollow : true,
            };
        }
    } catch {
        /* corrupted — defaults below */
    }
    return {...DEFAULT_SETTINGS};
}

export function saveCollabSettings(settings: CollabSettings): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        /* storage full/blocked */
    }
}

const CODE_ADJECTIVES = [
    "swift", "calm", "bright", "bold", "quiet", "amber", "ivory", "coral",
    "noble", "lucky", "brisk", "mellow", "gentle", "crisp", "vivid", "zesty",
];
const CODE_ANIMALS = [
    "falcon", "otter", "heron", "lynx", "puma", "koala", "tapir", "ibex",
    "marten", "wren", "finch", "crane", "badger", "ferret", "gibbon", "lemur",
];

/** Readable shareable room code, e.g. "swift-falcon-42" — matches the
 *  server's ^[a-z0-9-]{3,40}$ room-id contract by construction. */
export function makeRoomCode(): string {
    const adjective = CODE_ADJECTIVES[Math.floor(Math.random() * CODE_ADJECTIVES.length)] ?? "swift";
    const animal = CODE_ANIMALS[Math.floor(Math.random() * CODE_ANIMALS.length)] ?? "falcon";
    const number = Math.floor(Math.random() * 99) + 1;
    return `${adjective}-${animal}-${number}`;
}

/** Absolute invite URL for a room code — same page, ?collab=<code>. */
export function roomUrl(code: string): string {
    const param = `collab=${encodeURIComponent(code)}`;
    if (typeof window === "undefined") return `?${param}`;
    return `${window.location.origin}${window.location.pathname}?${param}`;
}

/** Read the ?collab=<code> param off the current location, or null
 *  when absent/malformed (same regex the server validates with). */
export function collabCodeFromUrl(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const value = new URLSearchParams(window.location.search).get("collab");
        return value && ROOM_ID_RE.test(value) ? value : null;
    } catch {
        return null;
    }
}
