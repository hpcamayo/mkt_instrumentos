import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import { GlobalCategories } from "@/components/global-categories";
import { MarketplaceAccountProvider } from "@/components/marketplace-account-provider";
import {
  NOINDEX_ROBOTS,
  OPEN_GRAPH_BASE,
  SITE_DESCRIPTION,
  SITE_NAME,
  getSiteUrl,
  isIndexableDeployment,
} from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: "Laria | Compra y vende instrumentos musicales en Perú",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: isIndexableDeployment() ? { index: true, follow: true } : NOINDEX_ROBOTS,
  openGraph: {
    ...OPEN_GRAPH_BASE,
    title: "Laria | Instrumentos musicales en Perú",
    description:
      "Compra y vende guitarras, bajos, baterías, pedales, amplificadores y equipos de audio en Perú. Contacto directo por WhatsApp.",
  },
  twitter: {
    card: "summary",
    title: "Laria | Instrumentos musicales en Perú",
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
        <MarketplaceAccountProvider><div className="flex min-h-screen flex-col">
          <SiteHeader />
          <GlobalCategories />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div></MarketplaceAccountProvider>
      </body>
    </html>
  );
}
