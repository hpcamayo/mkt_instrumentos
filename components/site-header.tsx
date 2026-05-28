import Image from "next/image";
import Link from "next/link";
import logoClear from "@/app/logo-clear.svg";
import { PageContainer } from "@/components/page-container";

const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/listados", label: "Listados" },
  { href: "/vender", label: "Vender" },
  { href: "/registrar-tienda", label: "Registrar tienda" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-laria-black text-white">
      <PageContainer className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href="/"
          className="inline-flex w-fit items-center"
          aria-label="Laria inicio"
        >
          <Image
            src={logoClear}
            alt="Laria"
            width={112}
            height={78}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>
        <nav aria-label="Navegación principal">
          <ul className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/72">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    item.href === "/vender"
                      ? "laria-button-primary min-h-10 px-4 py-2 text-xs uppercase tracking-wide"
                      : "inline-flex min-h-10 items-center rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white"
                  }
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
