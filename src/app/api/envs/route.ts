import {NextResponse} from "next/server";
import {discoverEnvs} from "@/lib/python-interpreter";

/**
 * GET /api/envs
 *
 * Returns a list of all Python interpreters discovered on the system,
 * with their source (venv / conda / pyenv / uv / system), version,
 * and whether the scientific stack (matplotlib + numpy + scipy) is
 * importable.
 *
 * Response: { envs: [{ path, label, source, version, hasScientificStack }] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const envs = await discoverEnvs();
        return NextResponse.json({envs});
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to discover envs: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
