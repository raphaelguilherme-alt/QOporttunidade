import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
await mkdir("review/imobzi", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
page.on("request", (request) => requests.push(request.url()));
await page.goto("http://localhost:3002", { waitUntil: "networkidle" });
await page.locator("#ofertas").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
assert.equal(await page.locator(".card").count(), 2);
assert.equal(await page.locator(".card.sold").count(), 1);
assert.equal(await page.locator(".soldBarrier").count(), 1);
assert.equal(await page.locator(".catalogStats").getByText("2 imóveis selecionados").count(), 1);
assert.equal(requests.some((url) => url.includes("api.imobzi.app")), false);
assert.equal(requests.some((url) => url.includes("/api/feirao/properties")), true);
await page.screenshot({ path: "review/imobzi/catalogo-desktop.png", fullPage: false });
await page.locator(".card").first().getByRole("button", { name: "Ver detalhes" }).click();
await page.screenshot({ path: "review/imobzi/modal-13057.png", fullPage: false });
await page.getByRole("button", { name: "Fechar detalhes" }).click();
await page.locator(".card").first().locator("h3").click();
assert.equal(await page.locator(".propertyModal").count(), 1);
await page.getByRole("button", { name: "Fechar detalhes" }).click();
await page.locator(".card.sold").getByRole("button", { name: "Ver referência" }).click();
await page.screenshot({ path: "review/imobzi/modal-13266-vendido.png", fullPage: false });
assert.equal(await page.locator(".propertyModal .soldBarrier").count(), 1);
assert.equal(await page.locator(".propertyModal").getByText("Comparar").count(), 0);
await browser.close();
console.log("imobzi browser tests: OK");
