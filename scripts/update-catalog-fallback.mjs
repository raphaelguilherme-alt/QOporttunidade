import { writeFile } from "node:fs/promises";

const source = process.argv[2] || "https://oportunidade.qvista.com.br/api/feirao/properties";
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
const body = await response.json();
if (!Array.isArray(body.properties) || body.properties.length < 1)
  throw new Error("Catalog response has no properties");
const snapshot = {
  version: 1,
  updatedAt: body.updatedAt || new Date().toISOString(),
  properties: body.properties,
};
await writeFile(
  new URL("../lib/catalog-fallback.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
console.log(`Saved ${snapshot.properties.length} sanitized properties.`);
