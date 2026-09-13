import Link from "next/link";
export function SiteHeaderAccountNav({ authenticated, storeOwner }: { authenticated: boolean; storeOwner: boolean }) {
  if (authenticated) {
    return (
      <li>
        <Link
          href="/mi-cuenta"
          className="inline-flex min-h-10 items-center rounded-md border border-white/25 px-3 py-2 text-white transition hover:border-laria-yellow hover:text-laria-yellow"
        >
          {storeOwner ? "Mi tienda" : "Mi cuenta"}
        </Link>
      </li>
    );
  }

  return (
    <>
      <li>
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center rounded-md border border-white/25 px-3 py-2 text-white transition hover:border-laria-yellow hover:text-laria-yellow"
        >
          Ingresar
        </Link>
      </li>
      <li>
        <Link
          href="/registro/vendedor"
          className="inline-flex min-h-10 items-center rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white"
        >
          Crear cuenta
        </Link>
      </li>
    </>
  );
}
