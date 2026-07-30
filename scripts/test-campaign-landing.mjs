import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3002";
const api = await (await fetch(`${baseUrl}/api/feirao/properties`)).json();
const featured = api.properties.find(property => property.code === "13263");
assert(featured && featured.campaignStatus === "available");
const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 1366, height: 768 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const hero = page.locator(".campaignHero");
  await hero.getByText("CÓD. 13263").waitFor();
  const text = await hero.textContent();
  assert.equal((await hero.locator(".heroPrice strong").textContent()).replace(/\D/g, ""), "578500");
  assert(text.replace(/\D/g, "").includes("71500"));
  assert(text.toLocaleLowerCase("pt-BR").includes("11% de desconto"));
  const geometry = await page.evaluate(() => ({
    scrollX,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    price: document.querySelector(".heroPrice strong")?.getBoundingClientRect().toJSON(),
    cta: document.querySelector(innerWidth <= 900 ? ".mobileFeaturedCta" : ".campaignActions .btn")?.getBoundingClientRect().toJSON(),
  }));
  assert.equal(geometry.scrollX, 0);
  assert(geometry.overflow <= 0);
  assert(geometry.price.bottom <= viewport.height);
  assert(geometry.cta.bottom <= viewport.height);
  await page.getByRole("button", { name: "Abrir galeria do imóvel 13263" }).click();
  await page.locator('[role="dialog"][aria-label*="13263"]').waitFor();
  if (viewport.width <= 767) {
    await page.locator(".mobileGalleryStage > img.loaded").waitFor();
    await page.getByRole("button", { name: "Fechar galeria" }).click();
  } else {
    await page.locator(".galleryMain.loaded").waitFor();
    await page.getByRole("button", { name: "Fechar detalhes do imóvel" }).click();
  }
  await page.close();
}
await browser.close();
console.log("campaign landing tests: OK");
