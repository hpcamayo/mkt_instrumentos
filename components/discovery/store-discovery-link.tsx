import Link from "next/link";

// The discovery batch's line on Mi tienda (disc-04, buy-05): where a store marks itself Fabricante or Taller and says
// whether it accepts gift exchanges.
export function StoreDiscoveryLink() {
  return (
    <p className="rounded-panel border border-subtle bg-white p-4 t-ui text-ink-2">
      <Link href="/mi-cuenta/tienda/taller" className="link font-semibold">Taller y regalos</Link>: si haces tus instrumentos, aparece en Hecho
      en Perú; si aceptas cambios de regalos, en Para regalar.
    </p>
  );
}
