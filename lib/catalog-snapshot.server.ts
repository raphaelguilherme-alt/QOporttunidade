import "server-only";
import { unstable_cache } from "next/cache";
import fallbackJson from "./catalog-fallback.json";
import type { PublicCampaignProperty } from "./public-property";

export type CatalogSnapshot = {
  version: number;
  updatedAt: string;
  properties: PublicCampaignProperty[];
  failures?: Array<{ code: string; error: string }>;
};

const fallback = fallbackJson as CatalogSnapshot;
const approvedImageHost = "lh3.googleusercontent.com";

function originalImageUrl(value: string) {
  const url = new URL(value);
  url.pathname = `${url.pathname.replace(/=s\d+$/i, "")}=s0`;
  return url.toString();
}

function validProperty(value: unknown): value is PublicCampaignProperty {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicCampaignProperty>;
  return typeof item.code === "string"
    && /^\d{1,20}$/.test(item.code)
    && (item.campaignStatus === "available" || item.campaignStatus === "sold")
    && typeof item.title === "string"
    && typeof item.neighborhood === "string"
    && Array.isArray(item.images)
    && item.images.every(image => {
      try {
        const url = new URL(image.displayUrl);
        return url.protocol === "https:" && url.hostname === approvedImageHost
          && !url.username && !url.password && !url.search;
      } catch { return false; }
    });
}

function validateSnapshot(value: unknown): CatalogSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<CatalogSnapshot>;
  if (snapshot.version !== 1 || typeof snapshot.updatedAt !== "string"
    || !Array.isArray(snapshot.properties) || snapshot.properties.length < 1
    || !snapshot.properties.every(validProperty)) return null;
  return {
    ...(snapshot as CatalogSnapshot),
    properties: snapshot.properties.map(property => ({
      ...property,
      images: property.images.map(image => {
        const displayUrl = originalImageUrl(image.displayUrl);
        const changed = displayUrl !== image.displayUrl;
        return {
          ...image,
          originalUrl: displayUrl,
          displayUrl,
          width: changed ? null : image.width,
          height: changed ? null : image.height,
        };
      }),
    })),
  };
}

function supabaseEndpoint(path: string) {
  const configured = process.env.SUPABASE_URL;
  if (!configured) throw new Error("snapshot_configuration");
  const base = new URL(configured);
  if (base.protocol !== "https:" || base.username || base.password || base.port
    || !base.hostname.endsWith(".supabase.co")) throw new Error("snapshot_configuration");
  return new URL(path, base);
}

async function snapshotRpc(name: string, body: Record<string, unknown>) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("snapshot_configuration");
  const response = await fetch(supabaseEndpoint(`/rest/v1/rpc/${name}`), {
    method: "POST",
    headers: { apikey: secret, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
    throw new Error("snapshot_unavailable");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 4 * 1024 * 1024) throw new Error("snapshot_response_size");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) throw new Error("snapshot_response_size");
  return JSON.parse(text) as unknown;
}

const readPersistentSnapshot = unstable_cache(async () => {
  try {
    const result = await snapshotRpc("qopp_get_catalog_snapshot", {});
    return validateSnapshot(Array.isArray(result) ? result[0] : result) || fallback;
  } catch (error) {
    console.warn(JSON.stringify({
      event: "catalog_snapshot_fallback",
      kind: error instanceof Error ? error.message : "unexpected",
    }));
    return fallback;
  }
}, ["qopp-public-catalog-snapshot-v1"], {
  revalidate: 900,
  tags: ["qopp-public-catalog-snapshot"],
});

export const getCatalogSnapshot = () => readPersistentSnapshot();

export async function publishCatalogSnapshot(snapshot: CatalogSnapshot) {
  const valid = validateSnapshot(snapshot);
  if (!valid) throw new Error("snapshot_validation");
  const result = await snapshotRpc("qopp_publish_catalog_snapshot", { p_snapshot: valid });
  if (result !== true) throw new Error("snapshot_publish_failed");
}

export function toCatalogSummaries(properties: PublicCampaignProperty[]) {
  return properties.map(property => ({
    ...property,
    images: property.images.length ? [property.images[0]] : [],
  }));
}
