import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Q Oportunidade — QVista",
  description: "Imóveis selecionados no Guarujá com condições especiais e atendimento QVista.",
  openGraph: { title: "Q Oportunidade — QVista", description: "Uma oportunidade real pode abrir uma nova porta.", type: "website" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#05072a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
