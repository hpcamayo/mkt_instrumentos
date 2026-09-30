import Image from "next/image";
import Link from "next/link";
import logoClear from "@/app/logo-clear.svg";
import { PageContainer } from "@/components/page-container";
import { legalPages } from "@/lib/legal-pages";

const footerLinks = [
  { href: "/", label: "Inicio" },
  { href: "/listados", label: "Listados" },
  { href: "/vender", label: "Vender" },
  { href: "/registrar-tienda", label: "Para tiendas" },
];

export function SiteFooter() {
  return (
    <footer className="surface-frame border-t border-white/10 bg-frame text-white">
      <PageContainer className="grid gap-8 py-10 t-ui sm:grid-cols-2 lg:grid-cols-[1.2fr_0.7fr_0.8fr_1fr] lg:py-12">
        <div className="space-y-3">
          <Image src={logoClear} alt="Laria" width={112} height={78} className="h-9 w-auto" />
          <p className="max-w-sm text-muted-dark">
            Marketplace peruano para descubrir instrumentos musicales y
            contactar vendedores directo por WhatsApp.
          </p>
        </div>

        <FooterLinks title="Navega" links={footerLinks} />
        <FooterLinks title="Ayuda y legal" links={legalPages} />

        <div>
          <p className="t-micro text-muted-dark">
            Cómo funciona
          </p>
          <p className="mt-4 max-w-sm text-muted-dark">
            Coordinas directo con cada vendedor. Laria no procesa pagos, no
            retiene dinero, no gestiona envíos ni garantiza productos o
            transacciones.
          </p>
        </div>

        <div className="border-t border-white/10 pt-5 t-meta text-muted-dark sm:col-span-2 lg:col-span-4">
          © 2026 Laria. Para músicos, tiendas y compradores en Perú.
        </div>
      </PageContainer>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <p className="t-micro text-muted-dark">
        {title}
      </p>
      <ul className="mt-4 grid gap-2 text-surface">
        {links.map((item) => (
          <li key={item.href}>
            <Link className="inline-flex min-h-8 items-center underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
