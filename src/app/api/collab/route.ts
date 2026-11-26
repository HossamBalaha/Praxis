import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";

/**
 * /api/collab — the live-collaboration relay.
 *
 *   GET  /api/collab?room=<id>&uid=<id>&name=<n>&color=<c>
 *        → text/event-stream. Registers the caller as a room client
 *          (EventSource cannot POST, so identity rides the query).
 *          Frames pushed to the stream:
 *            data: {"kind":"hello","user":{…},"peers":[{id,name,color}…]}
 *              — first frame: the connecting user + current roster.
 *            data: {"kind":"join","user":{…}}     (POST-driven)
 *            data: {"kind":"leave","user":{…}}    (POST leave / stream close)
 *            data: {"kind":"presence","payload":{…}}  (cursor/selection/follow)
 *            data: {"kind":"op","payload":{…}}        (buffer/terminal)
 *            : ping  — heartbeat comment every 15 s.
 *          On stream close the client is removed and a leave is
 *          announced once the user's LAST connection drops (multi-tab
 *          friendly). Rooms are ephemeral: a fresh process simply
 *          starts empty — nobody owes anybody a leave.
 *
 *   POST /api/collab  { room, action: "join"|"leave"|"presence"|"op",
 *                       user: { id, name, color }, payload? }
 *        → validates, stamps the user into the payload, and relays
 *          to every OTHER client in the room. { ok: true } on success
 *          (unknown rooms relay to nobody — still ok, rooms are
 *          ephemeral). Payload shapes:
 *            presence: { kind:"cursor", file, line, col, selection? }
 *                      | { kind:"selection", file, startLine, endLine }
 *                      | { kind:"follow", target }
 *            op:       { kind:"buffer", file, content ≤ 512 KB }
 *                      | { kind:"terminal", text ≤ 64 KB }
 *
 * Room state lives on globalThis (survives dev-mode module reloads —
 * same pattern as console-sessions/term-sessions) and is capped:
 * MAX_ROOMS rooms, MAX_CLIENTS_PER_ROOM connections per room, with
 * least-recently-active pruning for both. Heartbeats + a
 * missed-heartbeat TTL keep the registry from accumulating zombies.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Wire shapes ───────────────────────────────────────────────── */

interface CollabUser {
    id: string;
    name: string;
    color: string;
}

interface CollabClient {
    connId: string;
    user: CollabUser;
    /** Enqueue an SSE `data:` frame (JSON string). */
    send: (data: string) => void;
    /** Terminate the response stream. */
    close: () => void;
    /** Remove from the room + clear the heartbeat (idempotent). */
    dispose: () => void;
    joinedAt: number;
    lastSeenAt: number;
}

interface CollabRoom {
    id: string;
    /** connId → client (one user may hold several connections/tabs). */
    clients: Map<string, CollabClient>;
    createdAt: number;
    lastActiveAt: number;
}

interface CollabRegistry {
    rooms: Map<string, CollabRoom>;
}

interface CollabPostBody {
    room?: unknown;
    action?: unknown;
    user?: { id?: unknown; name?: unknown; color?: unknown };
    payload?: unknown;
}

/** Discriminated payloads that leave this route (user stamped in). */
type ValidPresence =
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

type ValidOp =
    | { kind: "buffer"; user: CollabUser; file: string; content: string }
    | { kind: "terminal"; user: CollabUser; text: string };

/* ── Registry (globalThis pattern) ─────────────────────────────── */

const GLOBAL_KEY = "__praxis_collab_registry__";
const MAX_ROOMS = 20;
const MAX_CLIENTS_PER_ROOM = 12;
const HEARTBEAT_MS = 15_000;
/** 3 missed heartbeats and a connection is considered gone. */
const CLIENT_TTL_MS = 45_000;
/** Empty rooms are forgotten after this long. */
const ROOM_IDLE_TTL_MS = 10 * 60_000;
const MAX_BUFFER_CHARS = 512 * 1024;
const MAX_TERMINAL_CHARS = 64 * 1024;
const MAX_FILE_CHARS = 256;
const ROOM_ID_RE = /^[a-z0-9-]{3,40}$/;

function getRegistry(): CollabRegistry {
    const g = globalThis as unknown as { [k: string]: unknown };
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {rooms: new Map()} as CollabRegistry;
    }
    return g[GLOBAL_KEY] as CollabRegistry;
}

function getRoom(roomId: string): CollabRoom | undefined {
    return getRegistry().rooms.get(roomId);
}

function touchRoom(room: CollabRoom): void {
    room.lastActiveAt = Date.now();
}

function broadcast(room: CollabRoom, data: string, excludeUserId?: string): void {
    for (const client of room.clients.values()) {
        // Exclude by user id: the sender never hears their own relay
        // (other tabs of the same user are silent too — they already have
        // the local state).
        if (excludeUserId !== undefined && client.user.id === excludeUserId) continue;
        try {
            client.send(data);
        } catch {
            /* dead stream — TTL/cap pruning collects it */
        }
    }
}

function removeConnection(room: CollabRoom, connId: string): void {
    const client = room.clients.get(connId);
    if (!client) return;
    room.clients.delete(connId);
    try {
        client.close();
    } catch {
        /* stream already closed */
    }
    // Announce the leave only when the user's LAST connection drops —
    // a second tab closing must not make a present user vanish.
    const stillConnected = [...room.clients.values()].some(
        (c) => c.user.id === client.user.id
    );
    if (!stillConnected) {
        broadcast(room, JSON.stringify({kind: "leave", user: client.user}));
    }
}

/** Drop every connection of a user; the last removal announces one
 *  leave event. Closing their streams makes their EventSources die
 *  instead of dangling on heartbeats. */
function dropUser(room: CollabRoom, user: CollabUser): void {
    const conns = [...room.clients.values()].filter((c) => c.user.id === user.id);
    for (const c of conns) c.dispose();
}

function evictRoom(room: CollabRoom): void {
    getRegistry().rooms.delete(room.id);
    // Disposing broadcasts leaves to whoever is left in the room while
    // it drains — the evicted peers' reconnects re-create the room.
    for (const c of [...room.clients.values()]) c.dispose();
}

function getOrCreateRoom(roomId: string): CollabRoom {
    const reg = getRegistry();
    const existing = reg.rooms.get(roomId);
    if (existing) return existing;
    while (reg.rooms.size >= MAX_ROOMS) {
        let oldest: CollabRoom | null = null;
        for (const r of reg.rooms.values()) {
            if (oldest === null || r.lastActiveAt < oldest.lastActiveAt) oldest = r;
        }
        if (!oldest) break;
        evictRoom(oldest);
    }
    const room: CollabRoom = {
        id: roomId,
        clients: new Map(),
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
    };
    reg.rooms.set(roomId, room);
    return room;
}

function enforceClientCap(room: CollabRoom): void {
    while (room.clients.size > MAX_CLIENTS_PER_ROOM) {
        // Oldest connection goes first; the just-registered newcomer is
        // always the newest, so its own admission never evicts itself.
        let oldest: CollabClient | null = null;
        for (const c of room.clients.values()) {
            if (oldest === null || c.joinedAt < oldest.joinedAt) oldest = c;
        }
        if (!oldest) break;
        oldest.dispose();
    }
}

/** TTL sweep: forget idle empty rooms and silently-dead connections. */
function pruneRegistry(): void {
    const reg = getRegistry();
    const now = Date.now();
    for (const [id, room] of reg.rooms) {
        if (room.clients.size === 0 && now - room.lastActiveAt > ROOM_IDLE_TTL_MS) {
            reg.rooms.delete(id);
            continue;
        }
        for (const [connId, client] of room.clients) {
            if (now - client.lastSeenAt > CLIENT_TTL_MS) {
                removeConnection(room, connId);
            }
        }
    }
}

/* ── Validation helpers ────────────────────────────────────────── */

function isLineNum(v: unknown): v is number {
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000;
}

function validateUser(raw: CollabPostBody["user"]): CollabUser | null {
    if (!raw || typeof raw !== "object") return null;
    const {id, name, color} = raw;
    if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
    if (typeof name !== "string" || name.length === 0 || name.length > 40) return null;
    if (typeof color !== "string" || color.length === 0 || color.length > 32) return null;
    return {id, name, color};
}

function validatePresence(
    kind: string,
    payload: Record<string, unknown>,
    user: CollabUser
): ValidPresence | null {
    if (kind === "cursor") {
        const {file, line, col, selection} = payload;
        if (typeof file !== "string" || file.length === 0 || file.length > MAX_FILE_CHARS) {
            return null;
        }
        if (!isLineNum(line) || !isLineNum(col)) return null;
        const base = {kind: "cursor" as const, user, file, line, col};
        if (selection === undefined || selection === null) return base;
        if (typeof selection !== "object") return null;
        const sel = selection as Record<string, unknown>;
        if (!isLineNum(sel.startLine) || !isLineNum(sel.endLine)) return null;
        return {
            ...base,
            selection: {startLine: sel.startLine, endLine: sel.endLine},
        };
    }
    if (kind === "selection") {
        const {file, startLine, endLine} = payload;
        if (typeof file !== "string" || file.length === 0 || file.length > MAX_FILE_CHARS) {
            return null;
        }
        if (!isLineNum(startLine) || !isLineNum(endLine)) return null;
        return {kind: "selection", user, file, startLine, endLine};
    }
    if (kind === "follow") {
        const target = payload.target;
        if (target === undefined || target === null) {
            return {kind: "follow", user, target: null};
        }
        if (typeof target !== "string" || target.length === 0 || target.length > 64) {
            return null;
        }
        return {kind: "follow", user, target};
    }
    return null;
}

function validateOp(
    kind: string,
    payload: Record<string, unknown>,
    user: CollabUser
): ValidOp | null {
    if (kind === "buffer") {
        const {file, content} = payload;
        if (typeof file !== "string" || file.length === 0 || file.length > MAX_FILE_CHARS) {
            return null;
        }
        if (typeof content !== "string" || content.length > MAX_BUFFER_CHARS) {
            return null;
        }
        return {kind: "buffer", user, file, content};
    }
    if (kind === "terminal") {
        const text = payload.text;
        if (typeof text !== "string" || text.length === 0 || text.length > MAX_TERMINAL_CHARS) {
            return null;
        }
        return {kind: "terminal", user, text};
    }
    return null;
}

/* ── GET: the SSE room stream ──────────────────────────────────── */

export async function GET(request: Request) {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("room") ?? "";
    if (!ROOM_ID_RE.test(roomId)) {
        return NextResponse.json({error: "Invalid room id."}, {status: 400});
    }
    // EventSource cannot send a body — identity rides the query string.
    const uid = url.searchParams.get("uid") ?? "";
    const name = url.searchParams.get("name") ?? "";
    const color = url.searchParams.get("color") ?? "";
    if (!uid || uid.length > 64 || !name || name.length > 40 || color.length > 32) {
        return NextResponse.json(
            {error: "Invalid or missing user identity (uid/name/color)."},
            {status: 400}
        );
    }
    const user: CollabUser = {
        id: uid,
        name,
        color: color || "#10b981",
    };

    pruneRegistry();
    const room = getOrCreateRoom(roomId);
    touchRoom(room);

    const encoder = new TextEncoder();
    const connId = randomUUID();
    let cleanup: () => void = () => {
    };

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            const send = (data: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    closed = true;
                }
            };
            const comment = (text: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`: ${text}\n\n`));
                } catch {
                    closed = true;
                }
            };
            const closeStream = () => {
                if (closed) return;
                closed = true;
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            };

            const client: CollabClient = {
                connId,
                user,
                send,
                close: closeStream,
                dispose: () => {
                },
                joinedAt: Date.now(),
                lastSeenAt: Date.now(),
            };
            let disposed = false;
            const dispose = () => {
                if (disposed) return;
                disposed = true;
                clearInterval(heartbeat);
                removeConnection(room, connId);
            };
            client.dispose = dispose;

            room.clients.set(connId, client);
            enforceClientCap(room);

            // Heartbeat: a `:` comment ping every 15 s keeps proxies from
            // idling the stream and marks the connection as alive for the
            // TTL pruner.
            const heartbeat = setInterval(() => {
                comment("ping");
                client.lastSeenAt = Date.now();
                touchRoom(room);
            }, HEARTBEAT_MS);

            // hello — roster snapshot for the newcomer (unique users,
            // excluding the connecting one). Joins are POST-driven: the
            // component announces itself right after the stream opens.
            const seen = new Set<string>([user.id]);
            const peers: CollabUser[] = [];
            for (const c of room.clients.values()) {
                if (seen.has(c.user.id)) continue;
                seen.add(c.user.id);
                peers.push({id: c.user.id, name: c.user.name, color: c.user.color});
            }
            send(JSON.stringify({kind: "hello", user, peers}));

            cleanup = dispose;
        },
        cancel() {
            // Client went away — remove + announce the leave.
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}

/* ── POST: the relay control channel ───────────────────────────── */

export async function POST(request: Request) {
    let body: CollabPostBody;
    try {
        body = (await request.json()) as CollabPostBody;
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const roomId = typeof body.room === "string" ? body.room : "";
    if (!ROOM_ID_RE.test(roomId)) {
        return NextResponse.json({error: "Invalid room id."}, {status: 400});
    }
    const action = body.action;
    if (
        action !== "join" &&
        action !== "leave" &&
        action !== "presence" &&
        action !== "op"
    ) {
        return NextResponse.json({error: "Unknown action."}, {status: 400});
    }
    const user = validateUser(body.user);
    if (!user) {
        return NextResponse.json({error: "Invalid user identity."}, {status: 400});
    }

    pruneRegistry();
    const room = getRoom(roomId);
    if (!room) {
        // Nobody holds a stream for this room — rooms are ephemeral, so
        // the relay simply has no audience.
        return NextResponse.json({ok: true});
    }
    touchRoom(room);
    for (const c of room.clients.values()) {
        if (c.user.id === user.id) c.lastSeenAt = Date.now();
    }

    if (action === "join") {
        broadcast(room, JSON.stringify({kind: "join", user}), user.id);
        return NextResponse.json({ok: true});
    }
    if (action === "leave") {
        // Disposes this user's connections; the last one announces the
        // leave (streams close instead of dangling on heartbeats).
        dropUser(room, user);
        return NextResponse.json({ok: true});
    }

    // presence / op — validate the payload, stamp the authenticated
    // user into it, and relay to everyone else in the room.
    const rawPayload = body.payload;
    if (!rawPayload || typeof rawPayload !== "object") {
        return NextResponse.json({error: "Missing payload."}, {status: 400});
    }
    const payload = rawPayload as Record<string, unknown>;
    const kind = typeof payload.kind === "string" ? payload.kind : "";

    if (action === "presence") {
        const stamped = validatePresence(kind, payload, user);
        if (!stamped) {
            return NextResponse.json({error: "Invalid presence payload."}, {status: 400});
        }
        broadcast(room, JSON.stringify({kind: "presence", payload: stamped}), user.id);
        return NextResponse.json({ok: true});
    }

    const stamped = validateOp(kind, payload, user);
    if (!stamped) {
        return NextResponse.json({error: "Invalid op payload."}, {status: 400});
    }
    broadcast(room, JSON.stringify({kind: "op", payload: stamped}), user.id);
    return NextResponse.json({ok: true});
}
