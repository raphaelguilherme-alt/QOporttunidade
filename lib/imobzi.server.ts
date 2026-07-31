import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import type { PublicCampaignProperty } from "@/lib/public-property";
import {
  PROMOTIONAL_INVENTORY,
  type PromotionalInventoryItem,
} from "@/lib/promotional-inventory";

const photoSchema = z.object({
  url: z.string().url(),
  position: z.coerce.number().optional(),
  private: z.boolean().optional(),
});

const IMOBZI_HOST = "api.imobzi.app";
const APPROVED_IMAGE_HOSTS = new Set(["lh3.googleusercontent.com"]);
let consecutiveTemporaryFailures = 0;
let circuitOpenUntil = 0;

export function imobziApiBaseUrl() {
  const configured = process.env.IMOBZI_API_BASE_URL || "https://api.imobzi.app/v1";
  const url = new URL(configured);
  const allowedHost = process.env.IMOBZI_ALLOWED_HOST || IMOBZI_HOST;
  if (url.protocol !== "https:" || url.hostname !== allowedHost || url.port || url.username || url.password)
    throw new Error("imobzi_configuration");
  return new URL("https://api.imobzi.app");
}

const approvedImageUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && APPROVED_IMAGE_HOSTS.has(url.hostname)
      && !url.username && !url.password && !url.search;
  } catch { return false; }
};

const originalGoogleImageUrl = (value: string) => {
  const url = new URL(value);
  url.pathname = `${url.pathname.replace(/=s\d+$/i, "")}=s0`;
  return url.toString();
};

const rawPropertySchema = z.object({
  code: z.union([z.string(), z.number()]).transform(String),
  property_type: z.string().nullish(),
  neighborhood: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  bedroom: z.coerce.number().nullish(),
  suite: z.coerce.number().nullish(),
  bathroom: z.coerce.number().nullish(),
  garage: z.coerce.number().nullish(),
  useful_area: z.coerce.number().nullish(),
  area: z.coerce.number().nullish(),
  sale_value: z.coerce.number().nullish(),
  site_publish: z.boolean().nullish(),
  site_publish_price: z.boolean().nullish(),
  site_publish_sale_price: z.boolean().nullish(),
  cover_photo: z.object({ url: z.string() }).nullish(),
  photos: z.union([
    z.array(photoSchema),
    z.object({ photos: z.array(photoSchema).optional() }),
  ]).nullish(),
  features: z.unknown().optional(),
  status: z.string().nullish(),
  active: z.boolean().nullish(),
  property_situation: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const allowedFeatureNames = [
  "Vista para o mar", "Piscina", "Varanda", "Churrasqueira",
  "Portaria", "Lazer", "Mobiliado", "Tour 360°",
];

const APPROVED_BEACH_BY_NEIGHBORHOOD: Record<string, string> = {
  pitangueiras: "Pitangueiras",
  enseada: "Enseada",
  asturias: "Astúrias",
  "praia das asturias": "Astúrias",
  tombo: "Tombo",
  "praia do tombo": "Tombo",
};

const campaignBeach = (neighborhood: string) =>
  APPROVED_BEACH_BY_NEIGHBORHOOD[
    neighborhood.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
  ] ?? null;

const flattenStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenStrings);
  return [];
};

const jpegDimensions = (bytes: Uint8Array) => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  const sizeMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (sizeMarkers.has(marker)) return {
      width: view.getUint16(offset + 7),
      height: view.getUint16(offset + 5),
    };
    if (length < 2) break;
    offset += length + 2;
  }
  return null;
};

const inspectPublicImage = unstable_cache(async (url: string) => {
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(9000),
      redirect: "error",
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
      return { width: null, height: null };
    return jpegDimensions(new Uint8Array(await response.arrayBuffer()))
      || { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}, ["imobzi-public-image-dimensions-v1"], { revalidate: 86400 });

export async function sanitizeImobziProperty(
  raw: unknown,
  config: PromotionalInventoryItem,
): Promise<PublicCampaignProperty> {
  const property = rawPropertySchema.parse(raw);
  const type = property.property_type?.trim() || "Imóvel";
  const neighborhood = property.neighborhood?.trim() || "Guarujá";
  const city = property.city?.trim() || "Guarujá";
  const state = property.state?.trim() || "SP";
  const bedroomText = property.bedroom ? ` com ${property.bedroom} dormitórios` : "";
  const nestedPhotos = Array.isArray(property.photos)
    ? property.photos
    : property.photos?.photos || [];
  const publicPhotos = nestedPhotos
    .filter((photo) => photo.private !== true && approvedImageUrl(photo.url))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const uniquePublicPhotos = publicPhotos.filter((photo, index, photos) =>
    photos.findIndex((candidate) => candidate.url === photo.url) === index);
  const photoMetadata = await Promise.all(uniquePublicPhotos.map(async (photo, index) => ({
    ...photo,
    thumbnailUrl: photo.url,
    url: originalGoogleImageUrl(photo.url),
    ...(index < 3 ? await inspectPublicImage(originalGoogleImageUrl(photo.url)) : { width: null, height: null }),
  })));
  const cover = property.cover_photo?.url && approvedImageUrl(property.cover_photo.url)
    ? { url: originalGoogleImageUrl(property.cover_photo.url), thumbnailUrl: property.cover_photo.url, position: 0, ...await inspectPublicImage(originalGoogleImageUrl(property.cover_photo.url)) }
    : null;
  const bestPublicPhotoWidth = Math.max(0, ...photoMetadata.map((photo) => photo.width || 0));
  const useCoverFallback = Boolean(cover && !photoMetadata.some((photo) => photo.url === cover.url)
    && (photoMetadata.length === 0 || bestPublicPhotoWidth < 1200));
  const orderedPhotos = [
    ...(useCoverFallback && cover ? [cover] : []),
    ...photoMetadata,
    ...(!useCoverFallback && cover && !photoMetadata.some((photo) => photo.url === cover.url) ? [cover] : []),
  ];
  const normalizedStatus = `${property.status || ""} ${property.property_situation || ""}`.toLocaleLowerCase("pt-BR");
  const isSoldByImobzi = property.active === false ||
    /\b(sold|vendid[oa]|inativ[oa])\b/.test(normalizedStatus);
  const campaignStatus = isSoldByImobzi ? "sold" : "available";
  const originalPriceInCents = property.sale_value && property.sale_value > 0
    ? Math.round(property.sale_value * 100)
    : null;
  const fairPriceInCents = config.promotionalPriceCents;
  const effectivePriceInCents = config.cashPriceCents ?? fairPriceInCents;
  const validDiscount = originalPriceInCents !== null && originalPriceInCents > effectivePriceInCents;
  const savingsInCents = validDiscount ? originalPriceInCents - effectivePriceInCents : null;
  const discountPercentage = validDiscount && originalPriceInCents
    ? Math.round((savingsInCents! / originalPriceInCents) * 100)
    : 0;
  if (originalPriceInCents === null)
    console.warn(`[Q Oportunidade] Preço original ausente no Imobzi: ${property.code}.`);
  else if (!validDiscount)
    console.warn(`[Q Oportunidade] Preço original não supera a condição promocional: ${property.code}.`);

  return {
    code: property.code,
    campaignStatus,
    title: `${type}${bedroomText} em ${neighborhood}`,
    locationLabel: `${neighborhood}, ${city} - ${state}`,
    neighborhood,
    beach: campaignBeach(neighborhood),
    city,
    state,
    propertyType: type,
    salePrice: originalPriceInCents === null ? null : originalPriceInCents / 100,
    originalPrice: originalPriceInCents === null ? null : originalPriceInCents / 100,
    fairPrice: fairPriceInCents / 100,
    effectivePrice: effectivePriceInCents / 100,
    downPayment: config.downPaymentCents ? config.downPaymentCents / 100 : null,
    cashPrice: config.cashPriceCents ? config.cashPriceCents / 100 : null,
    savings: savingsInCents === null ? null : savingsInCents / 100,
    discountPercentage,
    bedrooms: property.bedroom ?? null,
    suites: property.suite ?? null,
    bathrooms: property.bathroom ?? null,
    parkingSpaces: property.garage ?? null,
    usableArea: property.useful_area || property.area || null,
    images: orderedPhotos.map((photo, index) => ({
      originalUrl: photo.url,
      displayUrl: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      width: photo.width,
      height: photo.height,
      position: photo.position ?? index,
      alt: `${type} em ${neighborhood} — foto ${index + 1}`,
    })),
    features: [...new Set(flattenStrings(property.features))]
      .filter((feature) => allowedFeatureNames.some((allowed) =>
        feature.toLocaleLowerCase("pt-BR").includes(allowed.toLocaleLowerCase("pt-BR")),
      ))
      .slice(0, 12),
    updatedAt: property.updated_at ?? null,
  };
}

class ImobziError extends Error {
  constructor(public readonly kind: string, public readonly status?: number) {
    super(`Imobzi request failed: ${kind}`);
  }
}

export async function getImobziPropertyByCode(code: string): Promise<unknown> {
  if (!PROMOTIONAL_INVENTORY.some(property => property.code === code))
    throw new ImobziError("not_found", 404);
  if (circuitOpenUntil > Date.now()) throw new ImobziError("circuit_open", 503);
  const secret = process.env.IMOBZI_API_KEY_READ
    || (process.env.NODE_ENV !== "production" ? process.env.IMOBZI_SECRET : undefined);
  if (!secret) throw new ImobziError("configuration");
  const url = new URL(`/v1/property/code/${encodeURIComponent(code)}`, imobziApiBaseUrl());
  url.searchParams.set("dependencies_on_edit", "true");
  const configuredTimeout = Number(process.env.IMOBZI_API_TIMEOUT_MS || 8000);
  const timeout = Math.min(10_000, Math.max(5000, Number.isFinite(configuredTimeout) ? configuredTimeout : 8000));
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "X-Imobzi-Secret": secret },
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
        redirect: "error",
      });
      if (response.ok) {
        if (!response.headers.get("content-type")?.includes("application/json"))
          throw new ImobziError("content_type", 502);
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (declaredLength > 3 * 1024 * 1024) throw new ImobziError("response_size", 502);
        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > 3 * 1024 * 1024)
          throw new ImobziError("response_size", 502);
        consecutiveTemporaryFailures = 0;
        return JSON.parse(text);
      }
      const temporary = response.status === 429 || response.status >= 500;
      if (!temporary || attempt === 1) {
        const kind = response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 404 ? "not_found"
          : response.status === 429 ? "rate_limit"
          : response.status >= 500 ? "upstream" : "request";
        if (temporary && ++consecutiveTemporaryFailures >= 12) circuitOpenUntil = Date.now() + 30_000;
        throw new ImobziError(kind, response.status);
      }
      await new Promise(resolve => setTimeout(resolve, 150 + Math.floor(Math.random() * 200)));
    } catch (error) {
      lastError = error;
      if (error instanceof ImobziError || attempt === 1) throw error;
      if (++consecutiveTemporaryFailures >= 12) circuitOpenUntil = Date.now() + 30_000;
      await new Promise(resolve => setTimeout(resolve, 150 + Math.floor(Math.random() * 200)));
    }
  }
  throw lastError;
}

const loadCampaignProperties = async () => {
  const entries = [...PROMOTIONAL_INVENTORY];
  const settled: PromiseSettledResult<PublicCampaignProperty>[] = new Array(entries.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      const config = entries[index];
      const requestStartedAt = performance.now();
      try {
        settled[index] = {
          status: "fulfilled",
          value: await sanitizeImobziProperty(
            await getImobziPropertyByCode(config.code),
            config,
          ),
        };
        console.info(JSON.stringify({
          event: "imobzi_property_sync",
          code: config.code,
          durationMs: Math.round(performance.now() - requestStartedAt),
          status: "success",
        }));
      } catch (reason) {
        settled[index] = { status: "rejected", reason };
        console.warn(JSON.stringify({
          event: "imobzi_property_sync",
          code: config.code,
          durationMs: Math.round(performance.now() - requestStartedAt),
          status: "failed",
          kind: reason instanceof ImobziError ? reason.kind : "validation",
        }));
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const properties: PublicCampaignProperty[] = [];
  const failures: Array<{ code: string; error: string }> = [];
  settled.forEach((result, index) => {
    const code = entries[index].code;
    if (result.status === "fulfilled") properties.push(result.value);
    else failures.push({
      code,
      error: result.reason instanceof ImobziError ? result.reason.kind : "validation",
    });
  });
  properties.sort((a, b) => {
    if (a.campaignStatus !== b.campaignStatus)
      return a.campaignStatus === "available" ? -1 : 1;
    return (b.discountPercentage - a.discountPercentage)
      || ((b.savings ?? 0) - (a.savings ?? 0));
  });
  if (failures.length)
    console.warn(`[Q Oportunidade] ${failures.length} código(s) não carregado(s): ${failures.map(({ code }) => code).join(", ")}`);
  return {
    properties,
    failures,
    updatedAt: new Date().toISOString(),
    report: {
      receivedLines: 77,
      expectedUniqueCodes: 76,
      foundInImobzi: properties.length,
      renderedProperties: properties.length,
      notFoundCodes: failures.map(({ code }) => code),
      withoutImageCodes: properties.filter(property => property.images.length === 0).map(property => property.code),
      withoutOriginalPriceCodes: properties.filter(property => property.originalPrice === null).map(property => property.code),
      duplicatesRemoved: ["4434"],
    },
  };
};

export const syncCampaignProperties = loadCampaignProperties;

export const getCampaignProperties = unstable_cache(
  loadCampaignProperties,
  ["imobzi-q-oportunidade-76-v4-catalog"],
  { revalidate: 300, tags: ["imobzi-campaign-properties"] },
);
