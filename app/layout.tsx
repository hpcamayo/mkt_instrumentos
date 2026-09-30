import type { Metadata } from "next";
import localFont from "next/font/local";
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
  SITE_OG_DESCRIPTION,
  SITE_OG_TITLE,
  getSiteUrl,
  isIndexableDeployment,
} from "@/lib/site";

// Archivo variable (wght 100–900, wdth 62–125), self-hosted: one ≈87 KB file, Latin subset (Spanish complete),
// metric-matched Arial fallback so the swap does not shift the layout. License: app/fonts/OFL.txt.
const archivo = localFont({
  src: "./fonts/archivo-latin-wdth-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: "Laria | Compra y vende instrumentos musicales en Perú",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: isIndexableDeployment() ? { index: true, follow: true } : NOINDEX_ROBOTS,
  // No og:url here: every page sets its own through lib/seo.ts so none inherits the homepage URL.
  openGraph: {
    ...OPEN_GRAPH_BASE,
    title: SITE_OG_TITLE,
    description: SITE_OG_DESCRIPTION,
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
    <html lang="es" className={archivo.variable}>
      <body className="font-sans">
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        <MarketplaceAccountProvider><div className="flex min-h-screen flex-col">
          <SiteHeader />
          <GlobalCategories />
          <main id="contenido" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
          <SiteFooter />
        </div></MarketplaceAccountProvider>
      </body>
    </html>
  );
}
