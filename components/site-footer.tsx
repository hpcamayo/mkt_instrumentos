import { PageContainer } from "@/components/page-container";

const footerLinks = [
  { href: "/", label: "Inicio" },
  { href: "/listados", label: "Listados" },
  { href: "/vender", label: "Vender" },
  { href: "/registrar-tienda", label: "Registrar tienda" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-laria-black text-white">
      <PageContainer className="grid gap-8 py-10 text-sm sm:grid-cols-[1.2fr_0.8fr_1fr] lg:py-12">
        <div className="space-y-3">
          <p className="text-3xl font-black uppercase tracking-tight text-laria-yellow">
            Laria
          </p>
          <p className="max-w-sm leading-6 text-white/64">
            Marketplace peruano para descubrir instrumentos musicales y
            contactar vendedores directo por WhatsApp.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
            Navega
          </p>
          <ul className="mt-4 grid gap-2 text-white/68">
            {footerLinks.map((item) => (
              <li key={item.href}>
                <a className="transition hover:text-laria-blue" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
            MVP
          </p>
          <p className="mt-4 max-w-sm leading-6 text-white/64">
            Contacto directo por WhatsApp. Sin pagos, checkout, envíos ni chat
            interno.
          </p>
        </div>

        <div className="border-t border-white/10 pt-5 text-xs text-white/44 sm:col-span-3">
          © 2026 Laria. Para músicos, tiendas y compradores en Perú.
        </div>
      </PageContainer>
    </footer>
  );
}
