import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const response = await fetch("http://localhost:3002/api/feirao/properties");
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.properties.length, 4);

const forbidden = new Set([
  "address", "address_complement", "zipcode", "latitude", "longitude",
  "plus_code", "building_name", "property_unity", "unit_floor",
  "property_block", "owners", "listing_brokers", "cover_photo_private",
  "fiscal_registration_number", "cib_code", "key_id", "db_id",
]);
const visit = (value) => {
  if (Array.isArray(value)) return value.forEach(visit);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `forbidden key leaked: ${key}`);
    visit(child);
  }
};
visit(body);

const available = body.properties.find((item) => item.code === "13057");
const sold = body.properties.find((item) => item.code === "13266");
const discounted8 = body.properties.find((item) => item.code === "12790");
const discounted11 = body.properties.find((item) => item.code === "13263");
assert.equal(available.campaignStatus, "available");
assert.equal(sold.campaignStatus, "sold");
assert.equal(available.salePrice, 680000);
assert.equal(sold.salePrice, 960000);
assert.equal(discounted8.discountPercentage, 8);
assert.equal(discounted8.fairPrice, Math.round(discounted8.originalPrice * 100 * .92) / 100);
assert.equal(discounted8.savings, discounted8.originalPrice - discounted8.fairPrice);
assert.equal(discounted11.discountPercentage, 11);
assert.equal(discounted11.fairPrice, Math.round(discounted11.originalPrice * 100 * .89) / 100);
assert.equal(discounted11.savings, discounted11.originalPrice - discounted11.fairPrice);
assert.deepEqual(body.properties.map((item) => item.code), ["13263", "12790", "13057", "13266"]);
assert.equal(body.properties.filter((item) => item.campaignStatus === "available").length, 3);
assert.equal(body.properties.filter((item) => item.campaignStatus === "sold").length, 1);
for (const property of body.properties) {
  assert.equal(property.images.some((image) => "private" in image), false);
  const serialized = JSON.stringify(property).toLowerCase();
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("plus_code"), false);
}

const secret = (await readFile(".env.local", "utf8")).replace("IMOBZI_SECRET=", "").trim();
const files = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(
  (entry) => entry.isDirectory() ? files(join(dir, entry.name)) : join(dir, entry.name),
))).flat();
for (const file of await files(".next/static")) {
  const content = await readFile(file, "utf8").catch(() => "");
  assert.equal(content.includes(secret), false, `secret leaked into ${file}`);
}

console.log("imobzi privacy tests: OK");
