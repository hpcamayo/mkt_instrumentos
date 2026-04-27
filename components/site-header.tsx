import Link from "next/link";

const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/listados", label: "Listados" },
  { href: "/vender", label: "Vender" },
  { href: "/registrar-tienda", label: "Registrar tienda" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
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
      </div>
    </header>
  );
}
