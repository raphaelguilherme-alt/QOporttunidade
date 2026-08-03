"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import {
  CONSENT_STORAGE_KEY,
  GA_MEASUREMENT_ID,
  GOOGLE_ADS_ID,
  type ConsentChoice,
  setGoogleConsent,
} from "@/lib/analytics";

const privacyUrl = "https://www.qvista.com.br/politica-de-privacidade";

export default function GoogleTracking() {
  const enabled = process.env.NODE_ENV === "production"
    || process.env.NEXT_PUBLIC_GOOGLE_TAG_ENABLED === "true";
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored === "granted" || stored === "denied") setChoice(stored);
    } catch { /* Storage may be blocked. */ }
  }, []);

  if (!enabled) return null;

  const choose = (next: ConsentChoice) => {
    setGoogleConsent(next);
    setChoice(next);
    setPreferencesOpen(false);
  };

  return <>
    <Script id="google-tag-consent-v2" strategy="afterInteractive">
      {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var qoppConsent=localStorage.getItem('${CONSENT_STORAGE_KEY}');if(qoppConsent==='granted'){window.gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'})}}catch(e){}
window.gtag('js',new Date());window.gtag('config','${GOOGLE_ADS_ID}');window.gtag('config','${GA_MEASUREMENT_ID}');`}
    </Script>
    <Script
      id="google-tag-loader"
      src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
      strategy="afterInteractive"
    />
    {(choice === null || preferencesOpen) && <section className="consentPanel" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
      <div><strong id="consent-title">Sua privacidade importa</strong><p id="consent-description">Usamos cookies de medição para entender o uso do site e melhorar nossas campanhas. Você pode aceitar ou recusar com a mesma facilidade.</p><a href={privacyUrl} target="_blank" rel="noopener noreferrer">Consultar política de privacidade</a></div>
      <div className="consentActions"><button type="button" onClick={() => choose("denied")}>Recusar</button><button className="btn primary" type="button" onClick={() => choose("granted")}>Aceitar medição</button></div>
    </section>}
    {choice !== null && !preferencesOpen && <button className="consentPreferences" type="button" onClick={() => setPreferencesOpen(true)}>Preferências de privacidade</button>}
  </>;
}

