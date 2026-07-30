import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3002";
const browser = await chromium.launch({ headless: true });

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".card").filter({ hasText: "13057" }).click();
  await page.locator(".galleryMain.loaded").waitFor();
  await page.waitForTimeout(400);

  const snapshot = async () => page.evaluate(() => {
    const rect = selector => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box && { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const gallery = rect(".modalGallery");
    const toolbar = rect(".galleryToolbar");
    const previous = rect(".gallery-control--navigation.prev");
    const next = rect(".gallery-control--navigation.next");
    const rail = rect(".galleryThumbs");
    return {
      gallery, toolbar, previous, next, rail,
      scrollX: window.scrollX,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth,
      railScrollLeft: document.querySelector(".galleryThumbs")?.scrollLeft || 0,
      zoom: document.querySelector(".galleryZoomLevel")?.textContent,
      debug: (() => { const e = document.querySelector(".galleryToolbar"), g = document.querySelector(".modalGallery"), m = document.querySelector(".propertyModal"); return e && { galleryScrollLeft:g.scrollLeft,galleryScrollTop:g.scrollTop, transform: getComputedStyle(e).transform, galleryTransform:getComputedStyle(g).transform, modalTransform:getComputedStyle(m).transform, modalAnimation:getComputedStyle(m).animationName, modalRect:m.getBoundingClientRect().toJSON(), left: getComputedStyle(e).left, position: getComputedStyle(e).position, offsetParent: e.offsetParent?.className, offsetLeft: e.offsetLeft }; })(),
    };
  });
  const baseline = await snapshot();
  const validate = async label => {
    const state = await snapshot();
    for (const key of ["x", "y", "width", "height"])
      assert(Math.abs(state.gallery[key] - baseline.gallery[key]) < 1, `${viewport.width} ${label}: gallery ${key} drifted`);
    assert.equal(state.scrollX, 0, `${viewport.width} ${label}: window scrolled`);
    assert(state.overflow <= 0, `${viewport.width} ${label}: page overflow ${state.overflow}px`);
    for (const name of ["toolbar", "previous", "next", "rail"]) {
      const box = state[name];
      assert(box.x >= state.gallery.x - 0.5 && box.right <= state.gallery.right + 0.5, `${viewport.width} ${label}: ${name} clipped horizontally: ${JSON.stringify({box,gallery:state.gallery,debug:state.debug})}`);
      assert(box.y >= state.gallery.y - 0.5 && box.bottom <= state.gallery.bottom + 0.5, `${viewport.width} ${label}: ${name} clipped vertically`);
    }
    assert.equal(state.zoom, "100%", `${viewport.width} ${label}: zoom not reset`);
  };

  for (let index = 2; index <= 31; index++) {
    await page.getByRole("button", { name: "Próxima foto" }).click();
    await page.locator(".galleryCount").filter({ hasText: `${index} / 31` }).waitFor();
    await page.locator(".galleryMain.loaded").waitFor();
    await validate(`forward ${index}`);
  }
  assert((await snapshot()).railScrollLeft > 0, `${viewport.width}: thumbnail rail did not scroll internally`);
  for (let index = 30; index >= 1; index--) {
    await page.getByRole("button", { name: "Foto anterior" }).click();
    await page.locator(".galleryCount").filter({ hasText: `${index} / 31` }).waitFor();
    await page.locator(".galleryMain.loaded").waitFor();
    await validate(`back ${index}`);
  }

  await page.getByRole("button", { name: "Ver foto 31", exact: true }).click();
  await page.locator(".galleryCount").filter({ hasText: "31 / 31" }).waitFor();
  await validate("distant thumbnail 31");
  await page.getByRole("button", { name: "Ver foto 1", exact: true }).click();
  await page.locator(".galleryCount").filter({ hasText: "1 / 31" }).waitFor();
  await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await page.getByRole("button", { name: "Próxima foto" }).click();
  await page.locator(".galleryCount").filter({ hasText: "2 / 31" }).waitFor();
  await validate("after zoom");

  await Promise.all([
    page.getByRole("button", { name: "Próxima foto" }).click(),
    page.getByRole("button", { name: "Foto anterior" }).click(),
  ]).catch(() => {});
  await page.waitForTimeout(350);
  await validate("rapid alternate");

  await page.getByRole("button", { name: "Tela cheia" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole("button", { name: "Sair da tela cheia" }).count(), 1, `${viewport.width}: duplicate fullscreen exit`);
  await page.getByRole("button", { name: "Próxima foto" }).click();
  await page.locator(".galleryMain.loaded").waitFor();
  const fullscreen = await snapshot();
  assert.equal(fullscreen.gallery.x, 0);
  assert.equal(fullscreen.gallery.width, viewport.width);
  assert.equal(fullscreen.scrollX, 0);
  assert(fullscreen.overflow <= 0);
  await page.getByRole("button", { name: "Sair da tela cheia" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole("button", { name: "Sair da tela cheia" }).count(), 0);
  await validate("after fullscreen");
  assert.deepEqual(errors, []);
  await page.close();
}

await browser.close();
console.log("gallery stability tests (31 photos): OK");
