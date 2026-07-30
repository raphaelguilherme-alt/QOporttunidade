import { NextRequest, NextResponse } from "next/server";
import { getCampaignProperties } from "@/lib/imobzi.server";
import { anonymousKey, clientIp, enforceRateLimit } from "@/lib/security.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ipHash = anonymousKey(`catalog:${clientIp(request)}`);
    const limit = await enforceRateLimit(`catalog:${ipHash}`, 30, 60);
    if (!limit.allowed) return NextResponse.json(
      { error: "request_rejected" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfter) } },
    );
    const catalog = await getCampaignProperties();
    return NextResponse.json({ properties: catalog.properties, updatedAt: catalog.updatedAt }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { properties: [], updatedAt: null, error: "service_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
