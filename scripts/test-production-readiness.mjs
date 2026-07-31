import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3004";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const noJs = await browser.newPage({ viewport: { width: 1366, height: 768 }, javaScriptEnabled: false });
const response = await noJs.goto(baseUrl, { waitUntil: "domcontentloaded" });
assert.equal(response?.status(), 200);
assert.equal(await noJs.locator("article.card").count(), 6, "the first six properties must be in the initial HTML");
assert.match(await noJs.locator(".campaignHero").innerText(), /74 imóveis/);
assert.match(await noJs.locator("link[rel=canonical]").getAttribute("href"), /^https:\/\/oportunidade\.qvista\.com\.br\/?$/);
assert.equal(await noJs.locator('script[type="application/ld+json"]').count(), 1);
await noJs.close();

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".cardTitleButton").first().waitFor();
  assert.equal(await page.locator("article.card").count(), 6);
  await page.getByRole("button", { name: /Mostrar mais 12 oportunidades/i }).click();
  assert.equal(await page.locator("article.card").count(), 18);

  const title = page.locator(".cardTitleButton").first();
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await title.evaluate(element => element.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(40);
    const before = await page.evaluate(() => scrollY);
    await title.dispatchEvent("click");
    await page.locator('[role="dialog"]').waitFor();
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').waitFor({ state: "detached" });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => scrollY);
    assert(Math.abs(after - before) <= 32, `${viewport.width}px iteration ${iteration + 1}: scroll shifted by ${after - before}px after modal close (${before} -> ${after})`);
  }

  const contact = page.locator(".contactCta").first();
  await contact.click();
  const leadDialog = page.locator('[role="dialog"]');
  await leadDialog.waitFor();
  assert.equal(await leadDialog.locator('label[for="lead-name"]').count(), 1);
  assert.equal(await leadDialog.locator('label[for="lead-phone"]').count(), 1);
  await page.keyboard.press("Tab");
  if (viewport.width <= 767) await leadDialog.getByRole("button", { name: /Fechar formulário/i }).click();
  else await page.keyboard.press("Escape");
  await leadDialog.waitFor({ state: "detached" });
  assert.deepEqual(runtimeErrors, []);
  await page.close();
}

await browser.close();
console.log("production readiness tests: OK");
