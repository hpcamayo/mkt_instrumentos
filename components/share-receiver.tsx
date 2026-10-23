"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { PageContainer } from "@/components/page-container";
import { Button } from "@/components/ui/button";
import { getLoginPath } from "@/lib/auth/redirects";
import { SHARED_PHOTOS_PARAM, peekSharedPhotos } from "@/lib/share-target";

// big-12 (docs/ux-effortless/speed.md): counts the photos the service worker kept on the phone, then opens the
// listing form for the account (the store's form for a store owner, as /vender does) with ?compartido=1, where the
// form takes them. Signed out, it asks to sign in first; the photos wait on the phone for a day.
export function ShareReceiver() {
  const account = useMarketplaceAccount();
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void peekSharedPhotos().then((photos) => {
      if (active) setCount(photos.length);
    });
    return () => {
      active = false;
    };
  }, []);

  const ready = count !== null && account.settled;
  const destination = `${account.storeOwner ? "/mi-cuenta/tienda/publicar" : "/mi-cuenta/publicar"}?${SHARED_PHOTOS_PARAM}=1`;
  const opening = ready && count > 0 && account.authenticated;
  useEffect(() => {
    if (opening) router.replace(destination);
  }, [opening, destination, router]);

  const photos = count === 1 ? "1 foto" : `${count ?? 0} fotos`;
  return (
    <PageContainer as="section" className="py-12 md:py-20">
      <div className="mx-auto max-w-[560px] text-center">
        {!ready || opening ? (
          <>
            <h1 className="t-page text-ink">{count ? `Recibimos ${photos}` : "Recibiendo tus fotos…"}</h1>
            <p role="status" className="text-lead mt-3 t-body text-ink-2">{opening ? "Abriendo tu publicación…" : ""}</p>
          </>
        ) : count === 0 ? (
          <>
            <h1 className="t-page text-ink">No recibimos fotos</h1>
            <p className="text-lead mt-3 t-body text-ink-2">Vuelve a compartirlas desde tu galería, o elígelas al publicar.</p>
            <div className="mt-6 flex justify-center">
              <Button href="/vender">Publicar un instrumento</Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="t-page text-ink">Recibimos {photos}</h1>
            <p className="text-lead mt-3 t-body text-ink-2">Ingresa a tu cuenta para publicarlas. Se quedan en este teléfono hasta mañana.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button href={getLoginPath("/compartir")}>Ingresar</Button>
              <Link href="/registro/vendedor" className="link inline-flex min-h-11 items-center t-ui font-semibold">Crear una cuenta</Link>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
