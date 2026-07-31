import HomeClient from "./page-client";
import { getCatalogSnapshot, toCatalogSummaries } from "@/lib/catalog-snapshot.server";

export const revalidate = 900;

export default async function Home() {
  const snapshot = await getCatalogSnapshot();
  const initialItems = toCatalogSummaries(snapshot.properties);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://oportunidade.qvista.com.br/#organization",
        name: "QVista Inteligência Imobiliária",
        url: "https://www.qvista.com.br/",
        logo: "https://oportunidade.qvista.com.br/images/logo-dark.png",
      },
      {
        "@type": "WebSite",
        "@id": "https://oportunidade.qvista.com.br/#website",
        url: "https://oportunidade.qvista.com.br/",
        name: "Q Oportunidade",
        publisher: { "@id": "https://oportunidade.qvista.com.br/#organization" },
        inLanguage: "pt-BR",
      },
      {
        "@type": "ItemList",
        name: "Imóveis da campanha Q Oportunidade",
        numberOfItems: initialItems.length,
        itemListElement: initialItems.map((property, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `https://oportunidade.qvista.com.br/#imovel-${encodeURIComponent(property.code)}`,
          name: `${property.propertyType} em ${property.neighborhood}`,
        })),
      },
    ],
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <HomeClient initialItems={initialItems} />
  </>;
}
