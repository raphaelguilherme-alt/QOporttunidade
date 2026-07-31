import { writeFile } from "node:fs/promises";

const source = process.argv[2] || "https://oportunidade.qvista.com.br/api/feirao/properties";
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
const body = await response.json();
if (!Array.isArray(body.properties) || body.properties.length < 1)
  throw new Error("Catalog response has no properties");
const originalImageUrl = (value) => {
  const url = new URL(value);
  if (url.hostname !== "lh3.googleusercontent.com") throw new Error("Unexpected catalog image host");
  url.pathname = `${url.pathname.replace(/=s\d+$/i, "")}=s0`;
  return url.toString();
};
const properties = body.properties.map((property) => ({
  ...property,
  images: property.images.map((image) => {
    const originalUrl = originalImageUrl(image.originalUrl);
    const changed = originalUrl !== image.originalUrl;
    return {
      ...image,
      originalUrl,
      displayUrl: originalUrl,
      width: changed ? null : image.width,
      height: changed ? null : image.height,
    };
  }),
}));
const snapshot = {
  version: 1,
  updatedAt: body.updatedAt || new Date().toISOString(),
  properties,
};
await writeFile(
  new URL("../lib/catalog-fallback.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
console.log(`Saved ${snapshot.properties.length} sanitized properties.`);
