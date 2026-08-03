import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let loaderRequests = 0;
await page.route("https://www.googletagmanager.com/gtag/js**", async route => {
  loaderRequests += 1;
  await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
});

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3004";
const html = await (await fetch(baseUrl)).text();
assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.getByRole("dialog", { name: "Sua privacidade importa" }).waitFor();
await page.waitForFunction(() => Array.isArray(window.dataLayer));
assert.equal(loaderRequests, 1, "gtag.js must load exactly once");

const initial = await page.evaluate(() => window.dataLayer.map(entry => Array.from(entry)));
assert.equal(initial.filter(entry => entry[0] === "consent" && entry[1] === "default").length, 1);
assert.equal(initial.filter(entry => entry[0] === "js").length, 1);
assert.equal(initial.filter(entry => entry[0] === "config" && entry[1] === "AW-16984990134").length, 1);
assert.equal(initial.filter(entry => entry[0] === "config" && entry[1] === "G-433T5KG623").length, 1);
assert.equal(initial.find(entry => entry[0] === "consent")?.[2]?.analytics_storage, "denied");

await page.getByRole("button", { name: "Recusar" }).click();
assert.equal(await page.evaluate(() => localStorage.getItem("qopp-google-consent-v1")), "denied");
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Preferências de privacidade" }).waitFor();
assert.equal(await page.getByRole("dialog", { name: "Sua privacidade importa" }).count(), 0);
await page.getByRole("button", { name: "Preferências de privacidade" }).click();
await page.getByRole("button", { name: "Aceitar medição" }).click();
assert.equal(await page.evaluate(() => localStorage.getItem("qopp-google-consent-v1")), "granted");

await page.locator(".cardTitleButton").first().click();
await page.locator('[role="dialog"][aria-label^="Detalhes do imóvel"]').waitFor();
const events = await page.evaluate(() => window.dataLayer.map(entry => Array.from(entry)));
assert.equal(events.filter(entry => entry[0] === "event" && entry[1] === "select_item").length, 1);
assert.equal(events.filter(entry => entry[0] === "event" && entry[1] === "view_item").length, 1);
assert(!JSON.stringify(events).match(/phone|telefone|whatsappNumber|leadId/i));
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "Mostrar mais imóveis" }).click();
const afterLoadMore = await page.evaluate(() => window.dataLayer.map(entry => Array.from(entry)));
assert.equal(afterLoadMore.filter(entry => entry[0] === "event" && entry[1] === "load_more_properties").length, 1);

await browser.close();
console.log("google tracking tests: OK");
