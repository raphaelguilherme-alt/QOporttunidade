import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

export const requestId = () => randomUUID();

export function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export function anonymousKey(value: string) {
  const key = process.env.LEAD_HASH_KEY;
  if (process.env.NODE_ENV === "production" && (!key || key.length < 32))
    throw new Error("security_configuration");
  return createHmac("sha256", key || "development-only-key")
    .update(value)
    .digest("hex");
}

type SupabaseResult = { configured: false } | { configured: true; value: unknown };

async function supabaseRpc(functionName: string, parameters: Record<string, string | number>) : Promise<SupabaseResult> {
  const configuredUrl = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!configuredUrl || !secret) {
    if (process.env.NODE_ENV === "production") throw new Error("rate_limit_configuration");
    return { configured: false };
  }
  const baseUrl = new URL(configuredUrl);
  if (
    baseUrl.protocol !== "https:"
    || baseUrl.username
    || baseUrl.password
    || baseUrl.port
    || !baseUrl.hostname.endsWith(".supabase.co")
  )
    throw new Error("rate_limit_configuration");
  const endpoint = new URL(`/rest/v1/rpc/${functionName}`, baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parameters),
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("rate_limit_unavailable");
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("rate_limit_unavailable");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024) throw new Error("rate_limit_unavailable");
  const text = await response.text();
  if (text.length > 32 * 1024) throw new Error("rate_limit_unavailable");
  try {
    return { configured: true, value: JSON.parse(text) as unknown };
  } catch {
    throw new Error("rate_limit_unavailable");
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const namespaced = `qopp:rl:${key}`;
  const remote = await supabaseRpc("qopp_rate_limit", {
    p_key: namespaced,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (remote.configured) {
    const row = Array.isArray(remote.value) ? remote.value[0] : remote.value;
    if (!row || typeof row !== "object") throw new Error("rate_limit_unavailable");
    const result = row as { allowed?: unknown; retry_after?: unknown };
    if (typeof result.allowed !== "boolean" || !Number.isInteger(Number(result.retry_after)))
      throw new Error("rate_limit_unavailable");
    return { allowed: result.allowed, retryAfter: Math.max(1, Number(result.retry_after)) };
  }
  const now = Date.now();
  const current = memoryCounters.get(namespaced);
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + windowSeconds * 1000 }
    : { count: current.count + 1, expiresAt: current.expiresAt };
  memoryCounters.set(namespaced, next);
  return { allowed: next.count <= limit, retryAfter: Math.max(1, Math.ceil((next.expiresAt - now) / 1000)) };
}

export async function reserveIdempotency(key: string, seconds: number) {
  const namespaced = `qopp:dedupe:${key}`;
  const remote = await supabaseRpc("qopp_reserve_idempotency", {
    p_key: namespaced,
    p_ttl_seconds: seconds,
  });
  if (remote.configured) {
    if (typeof remote.value !== "boolean") throw new Error("rate_limit_unavailable");
    return remote.value;
  }
  const now = Date.now();
  const existing = memoryCounters.get(namespaced);
  if (existing && existing.expiresAt > now) return false;
  memoryCounters.set(namespaced, { count: 1, expiresAt: now + seconds * 1000 });
  return true;
}

export async function releaseIdempotency(key: string) {
  const namespaced = `qopp:dedupe:${key}`;
  const remote = await supabaseRpc("qopp_release_idempotency", { p_key: namespaced });
  if (!remote.configured) memoryCounters.delete(namespaced);
}

export function validateSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host")?.toLowerCase();
  const configured = (process.env.APP_ALLOWED_ORIGINS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  const allowed = process.env.NODE_ENV === "production"
    ? configured
    : [...configured, "http://localhost:3004", "http://127.0.0.1:3004"];
  if (!origin || !host || !allowed.includes(origin)) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

export function safeBearer(received: string | null, expected: string | undefined) {
  if (!received?.startsWith("Bearer ") || !expected) return false;
  const actual = Buffer.from(received.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
