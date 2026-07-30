import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://localhost:3002", { waitUntil: "networkidle" });

const trigger = (index) => page.locator(".desktopFilters .filterTrigger").nth(index);
const value = (index) => trigger(index).locator(".filterValue").textContent();
const waitValue = (index, expected) =>
  page.waitForFunction(
    ({ index, expected }) =>
      document.querySelectorAll(".desktopFilters .filterValue")[index]?.textContent === expected,
    { index, expected },
  );
const option = (text) =>
  page.locator(".desktopFilters .filterPopover .option").filter({ hasText: text });

await trigger(0).click();
await option("Enseada").click();
await waitValue(0, "Enseada");
assert.equal(await value(0), "Enseada");
assert.equal(await page.locator(".filterChips").getByText("Enseada").count(), 1);
assert.match(page.url(), /bairro=enseada/);

await option("Astúrias").click();
await waitValue(0, "Enseada +1");
assert.equal(await page.locator(".filterChips").getByText("Enseada").count(), 1);
assert.equal(await page.locator(".filterChips").getByText("Astúrias").count(), 1);
assert.match(page.url(), /bairro=enseada%2Casturias/);
await trigger(0).click();
await page.locator(".filterChips button").filter({ hasText: "Enseada" }).click();
await waitValue(0, "Astúrias");
assert.match(page.url(), /bairro=asturias/);

await trigger(1).click();
await option("Apartamento").click();
await waitValue(1, "Apartamento");
assert.equal(await value(1), "Apartamento");
assert.match(page.url(), /tipo=apartamento/);
await option("Casa").click();
await waitValue(1, "Apartamento +1");
assert.match(page.url(), /tipo=apartamento%2Ccasa/);
await trigger(1).click();
await page.locator(".filterChips button").filter({ hasText: "Casa" }).click();
await waitValue(1, "Apartamento");

await trigger(3).click();
await page.locator(".desktopFilters .segments button").filter({ hasText: "3+" }).click();
await waitValue(3, "3+ dormitórios");
assert.equal(await value(3), "3+ dormitórios");
assert.match(page.url(), /dormitorios=3/);

await trigger(2).click();
await page.getByRole("button", { name: "R$ 500 mil–1 mi" }).click();
await page.getByRole("button", { name: "Aplicar faixa" }).click();
await waitValue(2, "R$ 500 mil–R$ 1 mi");
assert.equal(await value(2), "R$ 500 mil–R$ 1 mi");
assert.match(page.url(), /precoMin=500000/);
assert.match(page.url(), /precoMax=1000000/);

await page.reload({ waitUntil: "networkidle" });
await waitValue(0, "Astúrias");
assert.equal(await value(0), "Astúrias");
assert.equal(await value(1), "Apartamento");
assert.equal(await value(2), "R$ 500 mil–R$ 1 mi");
assert.equal(await value(3), "3+ dormitórios");

await page.locator(".filterChips button").filter({ hasText: "Astúrias" }).click();
await waitValue(0, "Todos os bairros");
assert.equal(await value(0), "Todos os bairros");
assert.doesNotMatch(page.url(), /bairro=/);
assert.equal(await value(1), "Apartamento");

await page.getByRole("button", { name: "Limpar filtros" }).click();
await waitValue(1, "Todos os tipos");
assert.equal(await value(0), "Todos os bairros");
assert.equal(await value(1), "Todos os tipos");
assert.equal(await value(2), "Qualquer valor");
assert.equal(await value(3), "Qualquer");
assert.equal(new URL(page.url()).search, "");

await browser.close();
console.log("filter state tests: OK");
