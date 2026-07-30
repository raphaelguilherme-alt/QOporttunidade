import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3002";
const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 412, height: 915 }, { width: 430, height: 932 },
  { width: 844, height: 390 },
];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < viewport.height });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".card").filter({ hasText: "13057" }).click();
  await page.locator(".mobileProperty").waitFor();
  await page.getByRole("button", { name: "Ver todas as fotos do imóvel 13057" }).click();
  const gallery = page.locator(".mobileGallery");
  await gallery.waitFor();
  await gallery.locator(".mobileGalleryStage > img.loaded").waitFor();
  const layout = await page.evaluate(() => {
    const gallery = document.querySelector(".mobileGallery");
    const rect = gallery.getBoundingClientRect();
    return {
      parent: gallery.parentElement === document.body,
      rect: rect.toJSON(),
      scrollX,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      close: gallery.querySelectorAll('[aria-label="Fechar galeria"]').length,
      desktopToolbar: gallery.querySelectorAll(".galleryToolbar").length,
      bodyPosition: getComputedStyle(document.body).position,
    };
  });
  assert(layout.parent);
  assert.equal(layout.rect.x, 0);
  assert.equal(layout.rect.y, 0);
  assert.equal(layout.rect.width, viewport.width);
  assert.equal(Math.round(layout.rect.height), viewport.height);
  assert.equal(layout.scrollX, 0);
  assert(layout.overflow <= 0);
  assert.equal(layout.close, 1);
  assert.equal(layout.desktopToolbar, 0);
  assert.equal(layout.bodyPosition, "fixed");

  if (viewport.width === 390) {
    for (let index = 2; index <= 31; index++) {
      await page.getByRole("button", { name: "Próxima foto" }).click();
      await gallery.locator(`[aria-label="Foto ${index} de 31"]`).waitFor();
      await gallery.locator(".mobileGalleryStage > img.loaded").waitFor();
    }
    for (let index = 30; index >= 1; index--) {
      await page.getByRole("button", { name: "Foto anterior" }).click();
      await gallery.locator(`[aria-label="Foto ${index} de 31"]`).waitFor();
      await gallery.locator(".mobileGalleryStage > img.loaded").waitFor();
    }
    await gallery.getByRole("button", { name: "Ver foto 31", exact: true }).click();
    await gallery.locator('[aria-label="Foto 31 de 31"]').waitFor();
    await gallery.locator(".mobileGalleryStage").dblclick();
    await page.getByRole("button", { name: "Restaurar zoom" }).waitFor();
    await page.getByRole("button", { name: "Foto anterior" }).click();
    await gallery.locator('[aria-label="Foto 30 de 31"]').waitFor();
    assert.equal(await page.getByRole("button", { name: "Restaurar zoom" }).count(), 0);
    const beforeSwipe = await gallery.locator(".mobileGalleryTopbar span").textContent();
    await gallery.locator(".mobileGalleryStage").evaluate(stage => {
      const touch = (x, y) => new Touch({ identifier: 1, target: stage, clientX: x, clientY: y });
      stage.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch(300, 300)] }));
      stage.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, changedTouches: [touch(100, 305)] }));
    });
    assert.notEqual(await gallery.locator(".mobileGalleryTopbar span").textContent(), beforeSwipe);
    await page.setViewportSize({ width: 844, height: 390 });
    const rotated = await gallery.boundingBox();
    assert.equal(Math.round(rotated.width), 844);
    assert.equal(Math.round(rotated.height), 390);
  }
  await page.goBack();
  await gallery.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  await context.close();
}
await browser.close();
console.log("mobile gallery tests: OK");
