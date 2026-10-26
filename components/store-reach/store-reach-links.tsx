import Link from "next/link";

// Feature ideas, store-reach batch (docs/feature-ideas/store-reach.md): the batch's pages, listed on Mi tienda. "Lo
// que buscan" is also in the account menu.
const LINKS = [
  { href: "/mi-cuenta/tienda/mercado-libre", label: "Importar desde Mercado Libre", text: "trae tus publicaciones de allá a tu inventario y revísalas antes de aplicarlas." },
  { href: "/mi-cuenta/tienda/catalogo-redes", label: "Catálogo para redes", text: "muestra tus publicaciones en Instagram y Facebook con un enlace a Laria." },
  { href: "/mi-cuenta/tienda/distribuidor", label: "Distribuidor oficial", text: "envía la autorización de una marca para mostrarla en tus publicaciones nuevas." },
  { href: "/mi-cuenta/tienda/campanas", label: "Campañas Laria", text: "inscribe publicaciones con un descuento real en las campañas de Laria." },
  { href: "/mi-cuenta/tienda/demanda", label: "Lo que buscan en Laria", text: "cuántas personas buscaron cada marca o tipo de instrumento el mes pasado." },
] as const;

export function StoreReachLinks() {
  return (
    <section aria-labelledby="tienda-alcance" className="rounded-panel border border-subtle bg-white p-4">
      <h2 id="tienda-alcance" className="t-ui font-semibold text-ink">Más alcance para tu tienda</h2>
      <ul className="mt-2 grid gap-2 t-ui text-ink-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="link font-semibold">{link.label}</Link>: {link.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
