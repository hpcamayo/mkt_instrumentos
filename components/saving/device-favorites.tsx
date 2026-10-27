"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { SavedCard } from "@/components/saving/saved-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { clearDeviceSaves, DEVICE_SAVES_EVENT, getDeviceFavorites } from "@/lib/device-saves";
import { similarListingsPath, type PublicListingCard } from "@/lib/favorites";
import { loadListingCards, useViewedListings } from "@/lib/viewed-listings";

// "Vistos recientemente" (big-04): the listings this device opened, newest first, as cards with their hearts. Used on
// /favoritos and on the account's Favoritos; the home and the catalog show the same list as a row of tiles
// (components/catalog-recently-viewed.tsx).
export function RecentlyViewed({ exclude = [] }: { exclude?: string[] }) {
  const cards = useViewedListings();
  const visible = (cards ?? []).filter((card) => !exclude.includes(card.id)).slice(0, 12);
  if (!visible.length) return null;
  return (
    <section aria-labelledby="vistos-titulo" className="grid gap-3">
      <div>
        <h2 id="vistos-titulo" className="t-section text-ink">Vistos recientemente</h2>
        <p className="t-meta">En este dispositivo. Solo tú lo ves.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((card) => (
          <SavedCard key={card.id} href={`/instrumentos/${card.slug}`} title={card.title} imageUrl={card.image_url} price={card.price_pen} sold={card.availability === "sold"}>
            {card.availability === "approved" ? <FavoriteButton listingId={card.id} /> : null}
          </SavedCard>
        ))}
      </ul>
    </section>
  );
}

// /favoritos for visitors (big-04): favorites saved on this device, what they viewed, and why an account helps.
export function DeviceFavorites() {
  const { authenticated, ready, deviceFavoriteIds } = useMarketplaceAccount();
  const [cards, setCards] = useState<PublicListingCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const key = useMemo(() => deviceFavoriteIds.join(","), [deviceFavoriteIds]);

  useEffect(() => {
    const ids = getDeviceFavorites().map((item) => item.id);
    loadListingCards(ids, []).then((found) => {
      const byId = new Map(found.map((card) => [card.id, card]));
      setCards(ids.map((id) => byId.get(id)).filter((card): card is PublicListingCard => Boolean(card)));
      setFailed(false);
    }).catch(() => setFailed(true));
  }, [key]);

  useEffect(() => {
    const onChange = () => setCards((current) => current?.filter((card) => getDeviceFavorites().some((item) => item.id === card.id)) ?? current);
    window.addEventListener(DEVICE_SAVES_EVENT, onChange);
    return () => window.removeEventListener(DEVICE_SAVES_EVENT, onChange);
  }, []);

  async function clearAll() {
    if (!(await confirm({ title: "¿Borrar lo guardado en este dispositivo?", body: "Se borran tus favoritos, lo que viste aquí y lo que ocultaste en Descubrir. Tu cuenta, si tienes una, no cambia.", confirmLabel: "Borrar", tone: "danger" }))) return;
    clearDeviceSaves();
    setCards([]);
  }

  if (ready && authenticated) {
    return <p className="t-ui"><Link href="/mi-cuenta/favoritos" className="link font-semibold">Ver tus favoritos en Mi cuenta</Link></p>;
  }

  return (
    <div className="grid gap-8">
      {confirmDialog}
      {failed ? <p role="alert" className="t-ui text-danger">No se pudieron cargar tus favoritos. Intenta nuevamente.</p> : null}
      {cards === null && !failed ? <p role="status" className="t-meta">Cargando tus favoritos…</p> : null}
      {cards && !cards.length ? (
        <EmptyState
          title="Todavía no guardaste nada"
          description="Toca el corazón de cualquier instrumento para guardarlo aquí. No necesitas una cuenta."
          actions={<Link href="/listados" className={buttonClasses({ variant: "secondary" })}>Explorar el catálogo</Link>}
        />
      ) : null}
      {cards?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <SavedCard key={card.id} href={`/instrumentos/${card.slug}`} title={card.title} imageUrl={card.image_url} price={card.price_pen} sold={card.availability === "sold"}>
              <FavoriteButton listingId={card.id} />
              {card.availability === "sold" ? <Link href={similarListingsPath(card)} className="link t-ui font-semibold">Ver similares disponibles</Link> : null}
            </SavedCard>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="cuenta-titulo" className="rounded-panel border border-subtle bg-canvas p-5">
        <h2 id="cuenta-titulo" className="t-section text-ink">Lo que suma una cuenta</h2>
        <ul className="mt-2 grid gap-1 t-ui text-ink-2">
          <li>Tus favoritos en todos tus dispositivos.</li>
          <li>Un aviso por correo cuando bajan de precio.</li>
          <li>Alertas de búsqueda y compartir tu lista.</li>
        </ul>
        <p className="mt-2 t-meta">Al crearla o ingresar, guardamos en tu cuenta todo lo que guardaste aquí.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/registro/vendedor?next=%2Fmi-cuenta%2Ffavoritos" className={buttonClasses()}>Crear cuenta</Link>
          <Link href="/login?next=%2Fmi-cuenta%2Ffavoritos&motivo=favoritos" className={buttonClasses({ variant: "secondary" })}>Ingresar</Link>
        </div>
      </section>

      <RecentlyViewed exclude={cards?.map((card) => card.id) ?? []} />

      <div>
        <Button variant="quiet" onClick={() => void clearAll()}>Borrar lo guardado en este dispositivo</Button>
      </div>
    </div>
  );
}
