import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://instrumentos-peru.vercel.app"),
  title: {
    default: "Instrumentos Perú | Compra y vende instrumentos musicales",
    template: "%s | Instrumentos Perú",
  },
  description:
    "Marketplace peruano para descubrir instrumentos usados y productos de tiendas musicales. Contacta directo por WhatsApp, sin pagos dentro de la plataforma.",
  openGraph: {
    title: "Instrumentos Perú",
    description:
      "Compra y vende guitarras, bajos, baterías, pedales, amplificadores y equipos de audio en Perú.",
    url: "/",
    siteName: "Instrumentos Perú",
    locale: "es_PE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Instrumentos Perú",
    description:
      "Marketplace peruano para instrumentos musicales con contacto directo por WhatsApp.",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
