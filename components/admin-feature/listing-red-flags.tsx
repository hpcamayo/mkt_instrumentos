"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/notice";

type Flag = {
  id: string;
  detail: { photo?: number; matched_photo?: number; distance?: number };
  matched: { title: string; slug: string; status: string; seller: string | null };
};
type Match = { id: string; source: string; code: string | null; detail: { serial?: string; photo?: number } };

// Feature ideas, accounts batch (safe-05, safe-02): the reasons a listing in the moderation queue deserves a closer look.
// Nothing here decides anything: Admin approves, rejects or hides with the usual buttons. Copy says "coincide con un
// reporte", never that an item is stolen.
export function ListingRedFlags({ listingId }: { listingId: string }) {
  const [state, setState] = useState<{ flags: Flag[]; matches: Match[] } | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    fetch("/api/admin/listing-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload?.ok) setState({ flags: payload.flags ?? [], matches: payload.matches ?? [] });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [listingId]);

  if (!state || (!state.flags.length && !state.matches.length)) return null;

  return (
    <div className="grid gap-2" aria-label="Alertas para revisar">
      {state.flags.map((flag) => (
        <Notice key={flag.id} tone="warning" role="note" title="Foto parecida a la de otro vendedor">
          <p>
            La foto {flag.detail.photo ?? "?"} se parece a la foto {flag.detail.matched_photo ?? "?"} de{" "}
            <Link href={`/instrumentos/${flag.matched.slug}`} target="_blank">«{flag.matched.title}»</Link>
            {flag.matched.seller ? `, de ${flag.matched.seller}` : ""}. Puede ser una copia o una foto de catálogo: compáralas
            antes de decidir. <Link href="/admin/fotos-repetidas">Ver todas</Link>
          </p>
        </Notice>
      ))}
      {state.matches.map((match) => (
        <Notice key={match.id} tone="warning" role="note" title={`Coincide con un reporte${match.code ? ` (${match.code})` : ""}`}>
          <p>
            {match.source === "photo" ? `Una foto (la ${match.detail.photo ?? "?"}) se parece a una foto del reporte.` : "El número de serie privado coincide con el del reporte."}{" "}
            Revísalo en <Link href="/admin/equipos-reportados">Equipos reportados</Link> antes de aprobar.
          </p>
        </Notice>
      ))}
    </div>
  );
}
