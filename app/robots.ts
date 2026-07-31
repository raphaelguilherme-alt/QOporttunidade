import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/internal/" },
    sitemap: "https://oportunidade.qvista.com.br/sitemap.xml",
  };
}
