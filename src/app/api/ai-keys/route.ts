import {NextRequest, NextResponse} from "next/server";
import {deleteKey, listKeys, maskKey, resolveKey, storeKey,} from "@/lib/server-keyring";

/**
 * POST /api/ai-keys  — manage server-side AI provider keys.
 *
 * Body / actions:
 *   { action: "list" }
 *     → { ok, keys: [{ endpoint, masked }] }
 *   { action: "store", baseUrl, apiKey }
 *     → { ok, endpoint, masked }        key saved to ~/.praxis/ai-keys.json
 *   { action: "delete", baseUrl }
 *     → { ok, deleted: boolean }
 *   { action: "probe", baseUrl }        → { ok, stored: boolean, masked? }
 *     (used by Settings to show whether a server key exists)
 *
 * The raw key is ONLY accepted on "store" and never returned by any
 * action — listings are masked (first 3 + last 4 chars). Auth + rate
 * limiting are applied by src/proxy.ts like every other API route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    let body: {
        action?: string;
        baseUrl?: string;
        apiKey?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const action = body.action ?? "list";

    if (action === "list") {
        return NextResponse.json({ok: true, keys: listKeys()});
    }

    if (action === "store") {
        const baseUrl = (body.baseUrl ?? "").trim();
        const apiKey = (body.apiKey ?? "").trim();
        if (!baseUrl || !apiKey) {
            return NextResponse.json(
                {error: "baseUrl and apiKey are required."},
                {status: 400}
            );
        }
        try {
            new URL(baseUrl);
        } catch {
            return NextResponse.json({error: "baseUrl must be a valid URL."}, {status: 400});
        }
        const ok = storeKey(baseUrl, apiKey);
        if (!ok) {
            return NextResponse.json({error: "Could not persist the key."}, {status: 500});
        }
        return NextResponse.json({ok: true, endpoint: baseUrl, masked: maskKey(apiKey)});
    }

    if (action === "delete") {
        const baseUrl = (body.baseUrl ?? "").trim();
        if (!baseUrl) {
            return NextResponse.json({error: "baseUrl is required."}, {status: 400});
        }
        return NextResponse.json({ok: true, deleted: deleteKey(baseUrl)});
    }

    if (action === "probe") {
        const baseUrl = (body.baseUrl ?? "").trim();
        if (!baseUrl) {
            return NextResponse.json({error: "baseUrl is required."}, {status: 400});
        }
        const key = resolveKey(baseUrl);
        return NextResponse.json({
            ok: true,
            stored: Boolean(key),
            ...(key ? {masked: maskKey(key)} : {}),
        });
    }

    return NextResponse.json(
        {error: `Unknown action "${action}".`},
        {status: 400}
    );
}
