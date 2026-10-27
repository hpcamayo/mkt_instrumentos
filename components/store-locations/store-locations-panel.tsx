import Link from "next/link";

// Mi tienda (store-locations batch): Sedes (run-02) and Comprobantes (run-03), both part of Inventario.
export function StoreLocationsPanel({ locations, receiptsConnected }: { locations: number; receiptsConnected: boolean }) {
  return (
    <section aria-labelledby="tienda-sedes" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <h2 id="tienda-sedes" className="t-ui font-semibold text-ink">Locales y comprobantes</h2>
      <ul className="grid gap-2 t-ui text-ink-2">
        <li>
          <Link href="/mi-cuenta/tienda/sedes" className="link font-semibold">Sedes</Link>
          {locations >= 2 ? `: llevas el stock de ${locations} sedes.` : ": si tienes más de un local, lleva el stock de cada uno."}
        </li>
        <li>
          <Link href="/mi-cuenta/tienda/comprobantes" className="link font-semibold">Comprobantes</Link>
          {receiptsConnected ? ": emites boletas y facturas desde el Mostrador." : ": conecta tu cuenta de Nubefact y emite la boleta en el Mostrador."}
        </li>
      </ul>
    </section>
  );
}
