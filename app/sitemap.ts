import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://oportunidade.qvista.com.br/", lastModified: new Date(), changeFrequency: "daily", priority: 1 }];
}
