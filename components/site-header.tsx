import Link from "next/link";
import { PageContainer } from "@/components/page-container";

const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/listados", label: "Listados" },
  { href: "/vender", label: "Vender" },
  { href: "/registrar-tienda", label: "Registrar tienda" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <PageContainer className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="text-lg font-bold text-ink">
          Instrumentos Perú
        </Link>
        <nav aria-label="Navegación principal">
          <ul className="flex flex-wrap gap-2 text-sm font-medium text-slate-700">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>
    </header>
  );
}
