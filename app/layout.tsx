import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://oportunidade.qvista.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Q Oportunidade — +70 imóveis com até 40% de desconto",
  description: "+70 imóveis com até 40% de desconto nas melhores praias do Guarujá.",
  icons: {
    icon: [{ url: "/images/logo-q-oportunidade.png", type: "image/png" }],
    shortcut: "/images/logo-q-oportunidade.png",
    apple: "/images/logo-q-oportunidade.png",
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Q Oportunidade — +70 imóveis com até 40% de desconto",
    description: "+70 imóveis com até 40% de desconto nas melhores praias do Guarujá.",
    url: siteUrl,
    siteName: "Q Oportunidade",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/images/hero-guaruja-desktop.webp", width: 1920, height: 1080, alt: "Q Oportunidade — imóveis no Guarujá" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Q Oportunidade — +70 imóveis com até 40% de desconto",
    description: "+70 imóveis com até 40% de desconto nas melhores praias do Guarujá.",
    images: ["/images/hero-guaruja-desktop.webp"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#05072a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
