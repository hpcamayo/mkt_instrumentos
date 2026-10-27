"use client";

import { useRouter } from "next/navigation";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { VerifiedMark } from "@/components/ui/verified-mark";

// sell-03: what linking means, said before the owner taps. The commission stays between them and the store.
export function ConsignmentAccept({ token, invite }: {
  token: string;
  invite: { listing: { title: string; price_pen: number | null }; store: { name: string; city: string | null; is_verified: boolean } };
}) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();

  async function accept() {
    const id = await run<string>("accept_consignment_invite", { p_token: token }, "No pudimos vincular la consignación. Inténtalo de nuevo.");
    if (id) {
      router.push("/mi-cuenta/equipo");
      router.refresh();
    }
  }

  return (
    <div className="grid max-w-[68ch] gap-4 rounded-panel border border-subtle bg-surface p-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="flex flex-wrap items-center gap-2 t-ui font-semibold text-ink">
        {invite.store.name}
        {invite.store.is_verified ? <VerifiedMark /> : null}
        {invite.store.city ? <span className="font-normal text-ink-2">{invite.store.city}</span> : null}
      </p>
      <h2 className="t-section text-ink">{invite.listing.title}</h2>
      <Price value={invite.listing.price_pen} size="card" />
      <ul className="grid list-disc gap-1 pl-5 t-body text-ink">
        <li>La publicación dirá «En consignación en {invite.store.name}».</li>
        <li>Verás en Mi equipo sus visitas, contactos y cuántas personas la guardaron.</li>
        <li>La tienda atiende a los compradores y te avisamos cuando la marque vendida.</li>
        <li>La comisión y el pago los acuerdas directamente con la tienda: Laria no cobra ni recibe dinero.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={accept} loading={busy === "accept_consignment_invite"} loadingLabel="Vinculando">Vincular a mi cuenta</Button>
        <Button href="/mi-cuenta/equipo" variant="quiet">Ahora no</Button>
      </div>
    </div>
  );
}
