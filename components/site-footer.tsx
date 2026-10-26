import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PageContainer } from "@/components/page-container";
import { categoryLandingPath } from "@/lib/category-pages";
import { COMPLAINTS_BOOK_LABEL, COMPLAINTS_BOOK_PATH } from "@/lib/complaints-book";
import { legalPages } from "@/lib/legal-pages";
import { CATALOG_PATH, VERIFIED_STORES_PATH } from "@/lib/shell";
import { cn } from "@/lib/utils";

type FooterLink = { href: string; label: string };

// Footers link only to pages that exist (docs/ux-redesign/ux-2-shell.md).
const legal = (href: string) => legalPages.find((page) => page.href === href)!;
const servicesLink: FooterLink = { href: "/servicios", label: "Servicios para músicos" };
const exploreLinks: FooterLink[] = [
  { href: CATALOG_PATH, label: "Instrumentos" },
  { href: categoryLandingPath("guitars"), label: "Guitarras" },
  { href: categoryLandingPath("percussion"), label: "Percusión" },
  { href: categoryLandingPath("pedals"), label: "Pedales" },
  { href: VERIFIED_STORES_PATH, label: "Tiendas verificadas" },
  // discovery batch (docs/feature-ideas/discovery.md)
  { href: "/hecho-en-peru", label: "Hecho en Perú" },
  { href: "/regalos", label: "Para regalar" },
  { href: "/guias", label: "Guías de compra" },
  // feature-ideas services (bet-02): its own section, apart from the instruments.
  servicesLink,
];
// /registrar-tienda sends a signed-out visitor to /registro/tienda and tells a signed-in Particular that a
// store needs its own account.
const sellLinks: FooterLink[] = [
  { href: "/vender", label: "Publicar un instrumento" },
  { href: "/registrar-tienda", label: "Registrar mi tienda" },
  // feature-ideas services (bet-02)
  { href: "/mi-cuenta/servicios/nuevo", label: "Ofrecer un servicio" },
];
// EASE trust-05: the Libro de Reclamaciones is linked from every footer (a text link; Indecopi practice also shows the
// book's icon, pending legal review).
const complaintsBook: FooterLink = { href: COMPLAINTS_BOOK_PATH, label: COMPLAINTS_BOOK_LABEL };
// Feature ideas, accounts batch (safe-10): the help center.
const helpCenter: FooterLink = { href: "/ayuda", label: "Centro de ayuda" };
const helpLinks: FooterLink[] = [helpCenter, ...["/consejos-de-seguridad", "/articulos-prohibidos", "/terminos", "/privacidad"].map(legal), complaintsBook];
const phoneLinks: FooterLink[] = [
  exploreLinks[0], sellLinks[1], legal("/terminos"), helpCenter,
  legal("/consejos-de-seguridad"), legal("/articulos-prohibidos"), legal("/privacidad"), complaintsBook,
  // feature-ideas services (bet-02): the eighth cell of the 2 × 4 grid.
  servicesLink,
];
const slimLinks: FooterLink[] = [{ ...helpCenter, label: "Ayuda" }, ...["/consejos-de-seguridad", "/terminos", "/privacidad"].map(legal), complaintsBook];

const PROMISE = "No cobramos comisiones ni procesamos pagos.";
// The footer's small print: 12 px on phones so the promise line fits one line at 390 px, 13 px from 640 px.
const FOOTER_SMALL = "text-[12px] leading-4 sm:text-[13px] sm:leading-[18px]";

// Full footer on the home (N5): brand and promise, Explora, Vende, Ayuda y legal. Phones show the logo, the links
// in two columns and the promise line.
export function SiteFooter({ variant = "slim" }: { variant?: "full" | "slim" }) {
  if (variant === "slim") return <SlimFooter />;
  return (
    <footer className="surface-frame bg-frame text-surface">
      <PageContainer className="pb-6 pt-8 md:pt-12">
        <div className="grid gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" aria-label="Laria inicio" className="inline-flex w-fit">
              <BrandLogo size="footer" />
            </Link>
            <p className="mt-4 hidden max-w-xs t-ui text-muted-dark md:block">
              El mercado de instrumentos y audio profesional del Perú. Laria no cobra comisiones, no procesa pagos, no
              retiene dinero, no gestiona envíos ni garantiza el equipo ni las transacciones.
            </p>
          </div>
          <FooterColumn title="Explora" links={exploreLinks} />
          <FooterColumn title="Vende" links={sellLinks} />
          <FooterColumn title="Ayuda y legal" links={helpLinks} />
          <nav aria-label="Pie de página" className="md:hidden">
            <ul className="grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-4">
              {phoneLinks.map((item) => <li key={item.href}><FooterLinkItem {...item} /></li>)}
            </ul>
          </nav>
        </div>
        <div className={cn("mt-8 flex flex-col gap-1 border-t border-white/10 pt-5 text-muted-dark md:mt-12 md:flex-row md:justify-between", FOOTER_SMALL)}>
          <p>© 2026 Laria<span className="md:hidden"> · {PROMISE}</span></p>
          <p className="hidden md:block">Hecho en Perú</p>
        </div>
      </PageContainer>
    </footer>
  );
}

// Slim footer on every other public and account page: one row, two lines on phones.
function SlimFooter() {
  return (
    <footer className="surface-frame bg-frame text-surface">
      <PageContainer className={cn("flex flex-col gap-2 py-5 md:flex-row md:items-center md:justify-between md:gap-6", FOOTER_SMALL)}>
        <p className="text-muted-dark">© 2026 Laria · {PROMISE}</p>
        <nav aria-label="Ayuda y legal" className="text-surface">
          <ul className="flex flex-wrap items-center gap-x-1.5">
            {slimLinks.map((item, index) => (
              <li key={item.href} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true" className="text-muted-dark">·</span> : null}
                <Link href={item.href} className="inline-flex min-h-6 items-center underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title} className="hidden md:block">
      <p className="t-micro text-muted-dark">{title}</p>
      <ul className="mt-3 grid gap-1">
        {links.map((item) => <li key={item.href}><FooterLinkItem {...item} /></li>)}
      </ul>
    </nav>
  );
}

function FooterLinkItem({ href, label }: FooterLink) {
  return (
    <Link className="inline-flex min-h-8 items-center t-ui underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2" href={href}>
      {label}
    </Link>
  );
}
