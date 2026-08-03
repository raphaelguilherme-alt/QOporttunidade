import type { PublicCampaignProperty } from "@/lib/public-property";

export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-16984990134";
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-433T5KG623";
export const GOOGLE_ADS_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || "";
export const CONSENT_STORAGE_KEY = "qopp-google-consent-v1";

export type ConsentChoice = "granted" | "denied";
type GtagCommand = [command: string, ...parameters: unknown[]];
type AnalyticsParameters = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer: GtagCommand[];
    gtag?: (...args: GtagCommand) => void;
  }
}

const canTrack = () => typeof window !== "undefined" && typeof window.gtag === "function";
let lastViewItem: { code: string; at: number } | null = null;

export function setGoogleConsent(choice: ConsentChoice) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CONSENT_STORAGE_KEY, choice); } catch { /* Storage may be blocked. */ }
  window.gtag?.("consent", "update", {
    analytics_storage: choice,
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
  });
}

export function trackEvent(name: string, parameters: AnalyticsParameters = {}) {
  if (!canTrack()) return;
  window.gtag?.("event", name, parameters);
}

const price = (property: PublicCampaignProperty) =>
  property.effectivePrice ?? property.fairPrice ?? property.originalPrice ?? 0;

const item = (property: PublicCampaignProperty, index?: number) => ({
  item_id: property.code,
  item_name: property.title,
  item_category: property.propertyType,
  item_category2: property.beach ?? property.neighborhood,
  price: price(property),
  ...(index === undefined ? {} : { index }),
});

export function trackViewItem(property: PublicCampaignProperty) {
  const now = Date.now();
  if (lastViewItem?.code === property.code && now - lastViewItem.at < 1000) return;
  lastViewItem = { code: property.code, at: now };
  trackEvent("view_item", {
    send_to: GA_MEASUREMENT_ID,
    currency: "BRL",
    value: price(property),
    items: [item(property)],
  });
}

export function trackSelectItem(property: PublicCampaignProperty, index: number, sourceSection: string) {
  trackEvent("select_item", {
    send_to: GA_MEASUREMENT_ID,
    currency: "BRL",
    value: price(property),
    source_section: sourceSection,
    items: [item(property, index)],
  });
}

export function trackWishlist(property: PublicCampaignProperty) {
  trackEvent("add_to_wishlist", {
    send_to: GA_MEASUREMENT_ID,
    currency: "BRL",
    value: price(property),
    items: [item(property)],
  });
}

export function trackWhatsApp(sourceSection: string, property?: PublicCampaignProperty) {
  trackEvent("contact_whatsapp", {
    send_to: GA_MEASUREMENT_ID,
    source_section: sourceSection,
    ...(property ? { item_id: property.code, beach: property.beach ?? property.neighborhood } : {}),
  });
}

export function trackGenerateLead(property: PublicCampaignProperty) {
  const value = price(property);
  trackEvent("generate_lead", {
    send_to: GA_MEASUREMENT_ID,
    currency: "BRL",
    value,
    item_id: property.code,
    lead_source: "q_oportunidade_site",
  });
  if (/^[\w-]+$/.test(GOOGLE_ADS_CONVERSION_LABEL)) {
    trackEvent("conversion", {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
      currency: "BRL",
      value,
    });
  }
}
