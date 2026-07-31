import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { syncCampaignProperties } from "@/lib/imobzi.server";
import { publishCatalogSnapshot } from "@/lib/catalog-snapshot.server";
import { PROMOTIONAL_INVENTORY } from "@/lib/promotional-inventory";
import { safeBearer } from "@/lib/security.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  if (!safeBearer(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const catalog = await syncCampaignProperties();
    const knownUnavailableCodes = new Set(["11498", "12960"]);
    const unexpectedFailures = catalog.failures.filter(item => !knownUnavailableCodes.has(item.code));
    const minimumSafeCount = PROMOTIONAL_INVENTORY.length - knownUnavailableCodes.size;
    if (unexpectedFailures.length || catalog.properties.length < minimumSafeCount)
      throw new Error("snapshot_incomplete");
    await publishCatalogSnapshot({
      version: 1,
      updatedAt: catalog.updatedAt,
      properties: catalog.properties,
      failures: catalog.failures,
    });
    revalidateTag("qopp-public-catalog-snapshot", "max");
    revalidatePath("/", "page");
    const duration = Math.round(performance.now() - startedAt);
    console.info(JSON.stringify({
      event: "catalog_sync_completed",
      durationMs: duration,
      synchronized: catalog.properties.length,
      failed: catalog.failures.length,
      failedCodes: catalog.failures.map(item => item.code),
    }));
    return NextResponse.json(
      { ok: true, synchronized: catalog.properties.length, failed: catalog.failures.length },
      { headers: { "Cache-Control": "no-store", "Server-Timing": `sync;dur=${duration}` } },
    );
  } catch (error) {
    const duration = Math.round(performance.now() - startedAt);
    console.error(JSON.stringify({
      event: "catalog_sync_failed",
      durationMs: duration,
      kind: error instanceof Error ? error.message : "unexpected",
    }));
    return NextResponse.json(
      { ok: false, error: "synchronization_failed" },
      { status: 503, headers: { "Cache-Control": "no-store", "Server-Timing": `sync;dur=${duration}` } },
    );
  }
}
