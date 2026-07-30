import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3002";
const api = await fetch(`${baseUrl}/api/feirao/properties`);
assert.equal(api.status, 200);
const body = await api.json();
const property = body.properties.find((item) => item.code === "13057");
assert(property, "property 13057 must be public");
assert.equal(property.images.length, 31);
assert(property.images[0].width >= 1600, "first gallery image must use the official large cover");
assert(property.images.every((photo) => !("private" in photo)));

const browser = await chromium.launch({ headless: true });
for (const test of [
  { width: 1366, height: 768, dpr: 1 },
  { width: 1366, height: 768, dpr: 2 },
  { width: 1920, height: 1080, dpr: 1 },
  { width: 1920, height: 1080, dpr: 2 },
  { width: 390, height: 844, dpr: 2 },
]) {
  const page = await browser.newPage({
    viewport: { width: test.width, height: test.height },
    deviceScaleFactor: test.dpr,
  });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const card = page.locator(".card").filter({ hasText: "13057" });
  await card.click();
  const mobile = test.width <= 767;
  if (mobile) {
    await page.locator(".mobileProperty").waitFor();
    await page.getByRole("button", { name: "Ver todas as fotos do imóvel 13057" }).click();
    await page.locator(".mobileGalleryStage > img.loaded").waitFor();
  } else await page.locator(".galleryMain.loaded").waitFor();

  for (let index = 0; index < property.images.length; index++) {
    const mainImage = page.locator(mobile ? ".mobileGalleryStage > img" : ".galleryMain");
    const rendered = await mainImage.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const source = property.images[index];
    const enoughPixels = (source.width || 0) >= rendered.width * test.dpr;
    if (!enoughPixels) {
      const officiallyBest = source.width === Math.max(...property.images.map((photo) => photo.width || 0));
      const containedFallback = mobile || await page.locator(".modalGallery.lowSource .galleryMain.contained").count() === 1;
      assert(officiallyBest || containedFallback,
        `photo ${index + 1}: ${source.width}px source enlarged to ${rendered.width}px at DPR ${test.dpr}`);
    }
    if (index < property.images.length - 1) {
      await page.keyboard.press("ArrowRight");
      if (mobile) {
        await page.locator(`[aria-label="Foto ${index + 2} de ${property.images.length}"]`).waitFor();
        await page.locator(".mobileGalleryStage > img.loaded").waitFor();
      } else {
        await page.locator(".galleryCount").filter({ hasText: `${index + 2} / ${property.images.length}` }).waitFor();
        await page.locator(".galleryMain.loaded").waitFor();
      }
    }
  }
  assert.deepEqual(runtimeErrors, []);
  await page.close();
}
await browser.close();
console.log("gallery quality tests: OK");
