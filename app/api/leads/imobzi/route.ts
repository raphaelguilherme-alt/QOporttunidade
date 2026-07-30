import { NextRequest, NextResponse } from "next/server";
import { PROMOTIONAL_INVENTORY } from "@/lib/promotional-inventory";
import { getCampaignProperties, imobziApiBaseUrl } from "@/lib/imobzi.server";
import { buildImobziLead, leadRequestSchema } from "@/lib/lead";
import {
  anonymousKey, clientIp, enforceRateLimit, releaseIdempotency,
  requestId, reserveIdempotency, validateSameOrigin,
} from "@/lib/security.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = (status: number, body: Record<string, unknown>, retryAfter?: number) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });

async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: ip === "unknown" ? "" : ip,
      idempotency_key: crypto.randomUUID(),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!verification.ok || !verification.headers.get("content-type")?.includes("application/json")) return false;
  const result = await verification.json() as { success?: boolean; hostname?: string; action?: string };
  const hostnames = (process.env.TURNSTILE_HOSTNAMES || "").split(",").map(value => value.trim()).filter(Boolean);
  return result.success === true
    && result.action === "property_lead"
    && (process.env.NODE_ENV !== "production" || hostnames.includes(result.hostname || ""));
}

export async function POST(request: NextRequest) {
  const id = requestId();
  const started = Date.now();
  const log = (status: number, propertyCode?: string, kind = "ok", limited = false) =>
    console.info(JSON.stringify({ requestId: id, route: "/api/leads/imobzi", status, latencyMs: Date.now() - started, propertyCode, kind, limited }));
  try {
    if (!validateSameOrigin(request)) { log(403, undefined, "origin"); return response(403, { ok: false, error: "request_rejected" }); }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      log(415, undefined, "content_type"); return response(415, { ok: false, error: "request_rejected" });
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 4096) { log(413, undefined, "body_size"); return response(413, { ok: false, error: "request_rejected" }); }

    const ip = clientIp(request);
    const ipHash = anonymousKey(`ip:${ip}`);
    const ipLimit = await enforceRateLimit(`lead:ip:${ipHash}`, 5, 15 * 60);
    if (!ipLimit.allowed) { log(429, undefined, "rate_limit", true); return response(429, { ok: false, error: "request_rejected" }, ipLimit.retryAfter); }

    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096) { log(413, undefined, "body_size"); return response(413, { ok: false, error: "request_rejected" }); }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { log(400, undefined, "json"); return response(400, { ok: false, error: "request_rejected" }); }
    const parsed = leadRequestSchema.safeParse(body);
    if (!parsed.success) { log(400, undefined, "validation"); return response(400, { ok: false, error: "request_rejected" }); }
    if (parsed.data.website) { log(202, parsed.data.propertyCode, "honeypot"); return response(202, { ok: true }); }
    if (Date.now() - parsed.data.formStartedAt < 1500 || Date.now() - parsed.data.formStartedAt > 2 * 60 * 60_000) {
      log(400, parsed.data.propertyCode, "timing"); return response(400, { ok: false, error: "request_rejected" });
    }

    const { name, phone, propertyCode, tokenAntibot } = parsed.data;
    if (!PROMOTIONAL_INVENTORY.some(property => property.code === propertyCode)) {
      log(404, propertyCode, "allowlist"); return response(404, { ok: false, error: "request_rejected" });
    }
    if (!await verifyTurnstile(tokenAntibot, ip)) {
      log(403, propertyCode, "antibot"); return response(403, { ok: false, error: "request_rejected" });
    }

    const phoneHash = anonymousKey(`phone:${phone}`);
    const phoneLimit = await enforceRateLimit(`lead:phone:${phoneHash}`, 3, 60 * 60);
    const pairHash = anonymousKey(`pair:${phone}:${propertyCode}`);
    const pairLimit = await enforceRateLimit(`lead:pair:${pairHash}`, 3, 60 * 60);
    if (!phoneLimit.allowed || !pairLimit.allowed) {
      log(429, propertyCode, "rate_limit", true);
      return response(429, { ok: false, error: "request_rejected" }, Math.max(phoneLimit.retryAfter, pairLimit.retryAfter));
    }

    const catalog = await getCampaignProperties();
    const property = catalog.properties.find(item => item.code === propertyCode);
    if (!property || property.campaignStatus !== "available") {
      log(409, propertyCode, "unavailable"); return response(409, { ok: false, error: "request_rejected" });
    }

    const dedupeKey = anonymousKey(`dedupe:${phone}:${propertyCode}`);
    if (!await reserveIdempotency(dedupeKey, 10 * 60)) {
      log(200, propertyCode, "duplicate"); return response(200, { ok: true, duplicate: true });
    }

    const secret = process.env.IMOBZI_API_KEY_LEADS
      || (process.env.NODE_ENV !== "production" ? process.env.IMOBZI_LEAD_INTEGRATION_KEY || process.env.IMOBZI_SECRET : undefined);
    if (!secret) {
      await releaseIdempotency(dedupeKey);
      log(503, propertyCode, "configuration"); return response(503, { ok: false, error: "service_unavailable" });
    }
    const upstream = await fetch(new URL("/v1/integration/lead", imobziApiBaseUrl()), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Imobzi-Secret": secret },
      body: JSON.stringify(buildImobziLead({ name, phone, propertyCode })),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.includes("application/json")) {
      await releaseIdempotency(dedupeKey);
      log(502, propertyCode, "upstream"); return response(502, { ok: false, error: "service_unavailable" });
    }
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > 64 * 1024) {
      await releaseIdempotency(dedupeKey);
      log(502, propertyCode, "upstream_size"); return response(502, { ok: false, error: "service_unavailable" });
    }
    log(200, propertyCode);
    return response(200, { ok: true });
  } catch {
    log(503, undefined, "internal");
    return response(503, { ok: false, error: "service_unavailable" });
  }
}
