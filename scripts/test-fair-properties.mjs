import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3002";
const response = await fetch(`${baseUrl}/api/feirao/properties`);
const { properties, failures } = await response.json();
assert.deepEqual(failures, []);
assert.deepEqual(properties.map(property => property.code), ["13263", "12790", "13057", "13266"]);

const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".card").count(), 4);
  for (const property of properties) {
    const card = page.locator(".card").filter({ hasText: property.code });
    await card.scrollIntoViewIfNeeded();
    if (property.discountPercentage)
      await card.getByText(`${property.discountPercentage}% de desconto`).waitFor();
    await card.click();
    const modal = viewport.width <= 767 ? page.locator(".mobileProperty") : page.locator(".propertyModal");
    await modal.waitFor();
    if (viewport.width > 767) await page.locator(".galleryMain.loaded").waitFor();
    const metrics = await modal.evaluate(element => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      ctaVisible: Boolean(element.querySelector(".modalInfo > .btn, .mobilePropertyCta > *")?.getBoundingClientRect().bottom <= innerHeight),
    }));
    if (viewport.width > 767) assert(metrics.scrollHeight <= metrics.clientHeight, `${property.code}: modal scrolls`);
    assert(metrics.ctaVisible, `${property.code}: modal CTA clipped`);
    if (property.campaignStatus === "sold") {
      assert.equal(await modal.getByText("Imóvel vendido", { exact: true }).count(), 1);
      assert.equal(await modal.getByText("Falar sobre este imóvel").count(), 0);
    } else if (property.discountPercentage) {
      await modal.getByText(`Você economiza`, { exact: false }).waitFor();
      assert((await modal.textContent()).includes(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(property.fairPrice)));
    }
    await page.getByRole("button", { name: "Fechar detalhes do imóvel" }).click();
  }
  assert.deepEqual(errors, []);
  await page.close();
}
await browser.close();
console.log("fair properties tests: OK");
