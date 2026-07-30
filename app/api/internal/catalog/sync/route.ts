import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCampaignProperties } from "@/lib/imobzi.server";
import { safeBearer } from "@/lib/security.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!safeBearer(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  revalidateTag("imobzi-campaign-properties", "max");
  const catalog = await getCampaignProperties();
  return NextResponse.json(
    { ok: true, synchronized: catalog.properties.length, failed: catalog.failures.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
