"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { meetupNoticeMessage, meetupWhen, shareTextUrl } from "@/lib/contact-message";
import { readMeetupSpots, type MeetupSpot } from "@/lib/deal-trust";
import { mapSearchUrl, meetupPlacesFor, placeQuery, policeStationQuery } from "@/lib/safe-meetup-places";
import { loadSupabaseBrowserClient } from "@/lib/supabase/load-browser-client";
import { cn } from "@/lib/utils";

// Where "Qué revisar al probarlo" goes when the publication's type has no try-out checklist (the discovery batch's
// guides, guidesForListing): the in-person section of the safety tips.
export const TRY_OUT_CHECKLIST_HREF = "/consejos-de-seguridad#encuentro";

const OTHER = "otro";

// «Encuentro seguro» (safe-03): for a Particular's publication, a quiet entry under the contact button that opens
// public places to meet (the stores that offer themselves as «Punto seguro Laria», then well-known shopping centers and
// the nearest police station, each as a map search), "Avisar a alguien" (a WhatsApp message to a friend with the
// publication, the seller's first name, the place and the time) and what to check when trying the instrument. The copy
// never promises safety: Laria checks neither the places nor the people.
export function SafeMeetup({
  title,
  url,
  sellerFirstName,
  city,
  region,
  tryOutHref = TRY_OUT_CHECKLIST_HREF,
  className,
}: {
  title: string;
  url: string;
  sellerFirstName: string | null;
  city: string;
  region: string;
  // The type's try-out checklist (disc-02), when there is one.
  tryOutHref?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        <MapPin aria-hidden />
        Encuentro seguro
      </button>
      <span className="t-meta">Lugares para verse y avisar a alguien</span>
      {open ? (
        <MeetupSheet
          title={title}
          url={url}
          sellerFirstName={sellerFirstName}
          city={city}
          region={region}
          tryOutHref={tryOutHref}
          onDismiss={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function MeetupSheet({
  title,
  url,
  sellerFirstName,
  city,
  region,
  tryOutHref,
  onDismiss,
}: {
  title: string;
  url: string;
  sellerFirstName: string | null;
  city: string;
  region: string;
  tryOutHref: string;
  onDismiss: () => void;
}) {
  const [spots, setSpots] = useState<MeetupSpot[] | null>(null);
  const places = meetupPlacesFor(city);
  const [place, setPlace] = useState("");
  const [otherPlace, setOtherPlace] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const formId = useId();

  useEffect(() => {
    let active = true;
    void loadSupabaseBrowserClient()
      .then((supabase) => supabase
        ? (supabase as unknown as SupabaseClient).rpc("get_safe_meetup_spots", { p_city: city, p_region: region })
        : null)
      .then((result) => {
        if (active) setSpots(!result || result.error ? [] : readMeetupSpots(result.data));
      }, () => {
        if (active) setSpots([]);
      });
    return () => {
      active = false;
    };
  }, [city, region]);

  const options = [
    ...(spots ?? []).map((spot) => ({ value: `spot:${spot.slug}`, label: `${spot.name} (Punto seguro Laria)`, text: spot.name })),
    ...places.map((item) => ({ value: `place:${item.name}`, label: `${item.name}, ${item.area}`, text: `${item.name}, ${item.area}` })),
  ];
  const chosen = place === OTHER ? otherPlace : options.find((option) => option.value === place)?.text ?? "";
  const message = meetupNoticeMessage({ title, url, sellerFirstName, place: chosen, when: meetupWhen(date, time) });

  return (
    <Sheet
      title="Encuentro seguro"
      closeLabel="Cerrar"
      onDismiss={onDismiss}
      layout="responsive"
      footer={(
        <div className="flex justify-end">
          <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={onDismiss}>Cerrar</button>
        </div>
      )}
    >
      <p className="mt-3 t-body text-ink">
        Si vas a ver el equipo en persona, elige un lugar público y concurrido, de día, y avisa a alguien de confianza.
      </p>
      <p className="mt-1 t-meta">Laria no revisa estos lugares ni a las personas, y no puede garantizar cómo resulta un encuentro.</p>

      <section aria-labelledby={`${formId}-lugares`} className="mt-5">
        <h3 id={`${formId}-lugares`} className="font-semibold text-ink">Lugares para verse en {city}</h3>
        {spots === null ? <p className="mt-2 t-meta" role="status">Buscando Puntos seguros Laria…</p> : null}
        <ul className="mt-2 grid gap-2">
          {(spots ?? []).map((spot) => (
            <li key={spot.slug} className="rounded-control border border-subtle p-3">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Store aria-hidden className="h-4 w-4 shrink-0" />
                <Link href={`/tiendas/${spot.slug}`} className="link">{spot.name}</Link>
              </p>
              <p className="mt-0.5 t-meta">
                Punto seguro Laria · {[spot.address, spot.district, spot.city].filter(Boolean).join(", ")}
              </p>
              {spot.openingHours ? <p className="t-meta">{spot.openingHours}</p> : null}
              {spot.note ? <p className="mt-1 t-meta text-ink">{spot.note}</p> : null}
              <a href={mapSearchUrl([spot.name, spot.address, spot.city].join(", "))} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block t-meta font-semibold">
                Ver en el mapa<span className="sr-only">: {spot.name}</span>
              </a>
            </li>
          ))}
          {places.map((item) => (
            <li key={item.name} className="rounded-control border border-subtle p-3">
              <p className="font-semibold text-ink">{item.name}</p>
              <p className="mt-0.5 t-meta">Centro comercial · {item.area}</p>
              <a href={mapSearchUrl(placeQuery(item, city))} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block t-meta font-semibold">
                Ver en el mapa<span className="sr-only">: {item.name}</span>
              </a>
            </li>
          ))}
          <li className="rounded-control border border-subtle p-3">
            <p className="font-semibold text-ink">La comisaría más cercana</p>
            <p className="mt-0.5 t-meta">Algunas personas prefieren hacer la entrega en la puerta de una comisaría.</p>
            <a href={mapSearchUrl(policeStationQuery(city))} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block t-meta font-semibold">
              Buscar comisarías en el mapa
            </a>
          </li>
        </ul>
      </section>

      <section aria-labelledby={`${formId}-avisar`} className="mt-6">
        <h3 id={`${formId}-avisar`} className="font-semibold text-ink">Avisar a alguien</h3>
        <p className="mt-1 t-meta">Prepara un mensaje con el equipo, el nombre de quien vende, el lugar y la hora, y elige a quién enviarlo en WhatsApp.</p>
        <div className="mt-3 grid gap-3">
          <Field id={`${formId}-lugar`} label="Lugar">
            <Select value={place} onChange={(event) => setPlace(event.target.value)}>
              <option value="">Elige un lugar</option>
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              <option value={OTHER}>Otro lugar</option>
            </Select>
          </Field>
          {place === OTHER ? (
            <Field id={`${formId}-otro`} label="¿Dónde?">
              <Input value={otherPlace} maxLength={120} onChange={(event) => setOtherPlace(event.target.value)} />
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${formId}-dia`} label="Día">
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field id={`${formId}-hora`} label="Hora">
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </Field>
          </div>
          <p className="rounded-control bg-canvas p-3 t-meta text-ink" aria-live="polite">{message}</p>
          <Button href={shareTextUrl(message)} target="_blank" rel="noopener noreferrer" className="w-fit" icon={<WhatsAppGlyph />}>
            Avisar por WhatsApp
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${formId}-probar`} className="mt-6">
        <h3 id={`${formId}-probar`} className="font-semibold text-ink">Al probarlo</h3>
        <p className="mt-1 t-meta">Revisa el equipo con calma antes de pagar y confirma el pago en tu propia app.</p>
        <Link href={tryOutHref} className="link mt-1 inline-block t-ui font-semibold">Qué revisar al probarlo</Link>
      </section>
    </Sheet>
  );
}
