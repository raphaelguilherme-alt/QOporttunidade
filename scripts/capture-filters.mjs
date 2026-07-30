import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
await mkdir("review/filters", { recursive: true });

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await desktop.goto("http://localhost:3002", { waitUntil: "networkidle" });
await desktop.screenshot({ path: "review/filters/01-fechados.png", fullPage: false });
await desktop.evaluate(() => scrollTo({ top: 520, behavior: "instant" }));
await desktop.locator(".desktopFilters .filterTrigger").nth(0).click();
await desktop.waitForTimeout(350);
await desktop.screenshot({ path: "review/filters/02-bairro-aberto.png", fullPage: false });
await desktop.locator(".desktopFilters .filterPopover .option").filter({ hasText: "Pitangueiras" }).click();
await desktop.locator(".desktopFilters .filterTrigger").nth(2).click();
await desktop.waitForTimeout(250);
await desktop.screenshot({ path: "review/filters/03-preco-aberto.png", fullPage: false });
await desktop.getByRole("button", { name: /Até R\$ 500 mil/ }).click();
await desktop.locator(".desktopFilters .filterTrigger").nth(1).click();
await desktop.locator(".desktopFilters .filterPopover .option").filter({ hasText: "Apartamento" }).click();
await desktop.waitForTimeout(250);
await desktop.screenshot({ path: "review/filters/04-ativos.png", fullPage: false });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto("http://localhost:3002", { waitUntil: "networkidle" });
await mobile.getByRole("button", { name: /Filtrar imóveis/ }).click();
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: "review/filters/05-bottom-sheet.png", fullPage: false });
await browser.close();
