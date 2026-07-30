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

async function redisCommand(command: Array<string | number>) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") throw new Error("rate_limit_configuration");
    return null;
  }
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("rate_limit_configuration");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("rate_limit_unavailable");
  const body = await response.json() as { result?: unknown };
  return body.result;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const namespaced = `qopp:rl:${key}`;
  const remote = await redisCommand(["INCR", namespaced]);
  if (remote !== null) {
    const count = Number(remote);
    if (count === 1) await redisCommand(["EXPIRE", namespaced, windowSeconds]);
    return { allowed: count <= limit, retryAfter: windowSeconds };
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
  const remote = await redisCommand(["SET", namespaced, "1", "EX", seconds, "NX"]);
  if (remote !== null) return remote === "OK";
  const now = Date.now();
  const existing = memoryCounters.get(namespaced);
  if (existing && existing.expiresAt > now) return false;
  memoryCounters.set(namespaced, { count: 1, expiresAt: now + seconds * 1000 });
  return true;
}

export async function releaseIdempotency(key: string) {
  const namespaced = `qopp:dedupe:${key}`;
  const remote = await redisCommand(["DEL", namespaced]);
  if (remote === null) memoryCounters.delete(namespaced);
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
