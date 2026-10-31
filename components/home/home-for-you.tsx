"use client";

import { GalleryVerticalEnd } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  EMPTY_TASTE,
  INTEREST_KEY,
  PERSONALIZE_KEY,
  TASTE_KEY,
  DEVICE_EVENT,
  forYouReasons,
  rankForYou,
  readStore,
  tasteIsEmpty,
  writeStore,
  type Taste,
} from "@/lib/catalog-device";
import { DESCUBRIR_PATH } from "@/lib/descubrir";
import { getViewed, previousVisit as readPreviousVisit } from "@/lib/device-saves";
import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { categoryOptions, getCategoryLabel } from "@/lib/listings";
import type { HomeListing } from "@/lib/home";
import { CATALOG_PATH } from "@/lib/shell";
import { HOME_FEED_GRID, HOME_FEED_SIZES } from "@/lib/ui/listing-grid";
import { cn } from "@/lib/utils";

// BIG 01 (Effortless Laria): the home's first instruments. "Para ti" ranks the newest listings by what this device
// opened (types, brands, price band, city) and the optional "¿Qué tocas?" answer; never two of one seller in a row.
// "¿Por qué veo esto?" says why, "Empezar de cero" forgets the signals, and "Sin personalizar" shows plain newest
// first. Everything it reads stays on the device (lib/catalog-device.ts). The server renders the plain newest-first
// order, so the page works and is crawlable without JavaScript; the ranking applies once the device is read.

const SIZE = 12;
const PHONE_SIZE = 6;
const NEW_SIZE = 6;

// "¿Qué tocas?": the instruments a first-time visitor can pick, as categories.
const INTEREST_CHOICES = [
  { value: "guitars", label: "Guitarra" },
  { value: "basses", label: "Bajo" },
  { value: "percussion", label: "Batería y percusión" },
  { value: "keyboards", label: "Teclado o piano" },
  { value: "winds", label: "Vientos" },
  { value: "strings", label: "Cuerdas" },
  { value: "audio", label: "Audio y grabación" },
  { value: "andean", label: "Instrumentos andinos" },
] as const;

type Interest = { categories: string[]; answered: boolean };
const NO_INTEREST: Interest = { categories: [], answered: false };

type Device = { taste: Taste; interest: Interest; plain: boolean; previousVisit: number | null; recent: number };

function readDevice(): Device {
  const interest = readStore<Interest>(INTEREST_KEY, NO_INTEREST);
  return {
    taste: readStore<Taste>(TASTE_KEY, EMPTY_TASTE),
    interest: Array.isArray(interest?.categories) ? interest : NO_INTEREST,
    plain: readStore<boolean>(PERSONALIZE_KEY, false) === true,
    // "Nuevo desde tu última visita": the previous visit Favoritos and Alertas use too (lib/device-saves.ts). A visit
    // starts after 30 minutes away, so within one the starting point stays put.
    previousVisit: readPreviousVisit()?.getTime() ?? null,
    // Listings this device opened ("Vistos recientemente", lib/device-saves.ts).
    recent: getViewed().length,
  };
}

function useDevice() {
  const [device, setDevice] = useState<Device | null>(null);
  useEffect(() => {
    const read = () => setDevice(readDevice());
    read();
    window.addEventListener(DEVICE_EVENT, read);
    return () => window.removeEventListener(DEVICE_EVENT, read);
  }, []);
  return device;
}

const reasonLabels = {
  category: getCategoryLabel,
  type: (value: string) => getInstrumentFilterGroup(value)?.label ?? value,
};

export function HomeForYou({ pool, total }: { pool: HomeListing[]; total: number | null }) {
  const device = useDevice();
  const personal = Boolean(device && !device.plain && !tasteIsEmpty(device.taste, device.interest.categories));
  const ranked = useMemo(() => (personal && device ? rankForYou(pool, device.taste, device.interest.categories) : pool), [personal, device, pool]);
  const fresh = useMemo(() => {
    const since = device?.previousVisit;
    if (!since) return [];
    return pool.filter((listing) => listing.published_at && Date.parse(listing.published_at) > since).slice(0, NEW_SIZE);
  }, [device?.previousVisit, pool]);
  const freshIds = new Set(fresh.map((listing) => listing.id));
  const shown = ranked.filter((listing) => !freshIds.has(listing.id)).slice(0, SIZE);
  const askInterest = device !== null && !device.plain && !device.interest.answered && tasteIsEmpty(device.taste) && device.recent === 0;

  if (pool.length === 0) return null;
  return (
    <>
      {askInterest ? <InterestRow /> : null}
      {fresh.length > 0 ? (
        <section aria-labelledby="nuevo-titulo">
          <div className="mb-3 md:mb-4">
            <h2 id="nuevo-titulo" className="t-section text-ink">Nuevo desde tu última visita</h2>
            <p className="mt-0.5 t-meta">{fresh.length === 1 ? "1 publicación nueva" : `${fresh.length} publicaciones nuevas`}.</p>
          </div>
          <ul className={HOME_FEED_GRID}>
            {fresh.map((listing, index) => (
              <li key={listing.id} className={cn("min-w-0", index >= 4 && "max-md:hidden")}>
                <ListingCard listing={listing} source="home" headingLevel={3} sizes={HOME_FEED_SIZES} eager={index < 2} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="para-ti-titulo">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 md:mb-4">
          <div>
            <h2 id="para-ti-titulo" className="t-section text-ink">{personal ? "Para ti" : device?.plain ? "Recién publicados" : "Lo más nuevo"}</h2>
            <p className="mt-0.5 t-meta">
              {personal ? "Según lo que miraste en este dispositivo." : device?.plain ? "Sin personalizar: lo más reciente primero." : "Lo más reciente primero. Se ordena según lo que mires."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {device ? <ForYouControls device={device} personal={personal} /> : null}
            {/* Descubrir (big-02): the newest listings one per screen. A plain link, the same for everyone, so the
                cached home stays one page for all. */}
            <Link href={DESCUBRIR_PATH} prefetch={false} className={buttonClasses({ variant: "secondary" })}>
              <GalleryVerticalEnd aria-hidden="true" />
              Descubrir lo nuevo
            </Link>
          </div>
        </div>
        <ul className={HOME_FEED_GRID}>
          {shown.map((listing, index) => (
            <li key={listing.id} className={cn("min-w-0", index >= PHONE_SIZE && "max-md:hidden")}>
              <ListingCard listing={listing} source="home" headingLevel={3} sizes={HOME_FEED_SIZES} eager={index < 4} />
            </li>
          ))}
        </ul>
        <Link href={CATALOG_PATH} className={buttonClasses({ variant: "secondary", block: true, className: "mt-6 md:mx-auto md:w-auto" })}>
          {total === null ? "Ver todo el catálogo" : total === 1 ? "Ver la publicación" : `Ver las ${new Intl.NumberFormat("es-PE").format(total)} publicaciones`}
        </Link>
      </section>
    </>
  );
}

// "¿Por qué veo esto?", "Empezar de cero" and "Sin personalizar" / "Personalizar".
function ForYouControls({ device, personal }: { device: Device; personal: boolean }) {
  const reasons = forYouReasons(device.taste, device.interest.categories, reasonLabels);
  return (
    <div className="flex flex-wrap items-center gap-x-4">
      {personal ? (
        <details className="group relative">
          <summary className="link inline-flex min-h-11 cursor-pointer list-none items-center t-ui font-semibold md:min-h-6">¿Por qué veo esto?</summary>
          <div className="mt-1 max-w-[36ch] rounded-panel border border-line-deco bg-surface p-3 t-ui text-ink-2 md:absolute md:right-0 md:z-20 md:w-80 md:shadow-level-2">
            <ul className="list-disc pl-5">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="mt-2 t-meta">Lo ordenamos con lo que abriste aquí. No sale de este dispositivo y nadie más lo ve. Nunca dos seguidas del mismo vendedor.</p>
            <button
              type="button"
              className="link mt-2 inline-flex min-h-11 items-center t-ui font-semibold md:min-h-6"
              onClick={() => {
                writeStore(TASTE_KEY, null);
                writeStore(INTEREST_KEY, null);
              }}
            >
              Empezar de cero
            </button>
          </div>
        </details>
      ) : null}
      {personal || device.plain ? (
        <button type="button" aria-pressed={device.plain} onClick={() => writeStore(PERSONALIZE_KEY, device.plain ? null : true)} className="link inline-flex min-h-11 items-center t-ui font-semibold md:min-h-6">
          {device.plain ? "Personalizar" : "Sin personalizar"}
        </button>
      ) : null}
    </div>
  );
}

// "¿Qué tocas?": one optional row on a first visit. Each choice orders "Para ti" at once; "Saltar" hides the row.
function InterestRow() {
  const [chosen, setChosen] = useState<string[]>([]);
  const save = (categories: string[], answered: boolean) => writeStore(INTEREST_KEY, { categories, answered } satisfies Interest);
  return (
    <section aria-labelledby="que-tocas-titulo" className="rounded-panel bg-canvas p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="que-tocas-titulo" className="t-card-title text-ink">¿Qué tocas?</h2>
          <p className="mt-0.5 t-meta">Opcional. Elige uno o más y te mostramos eso primero. Se guarda solo en este dispositivo.</p>
        </div>
        <button type="button" onClick={() => save([], true)} className="link inline-flex min-h-11 shrink-0 items-center t-ui font-semibold md:min-h-6">
          Saltar
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {INTEREST_CHOICES.filter((choice) => categoryOptions.some((option) => option.value === choice.value)).map((choice) => {
          const selected = chosen.includes(choice.value);
          return (
            <li key={choice.value}>
              <Chip selected={selected} className="h-11" onClick={() => setChosen(selected ? chosen.filter((value) => value !== choice.value) : [...chosen, choice.value])}>
                {choice.label}
              </Chip>
            </li>
          );
        })}
      </ul>
      {chosen.length > 0 ? (
        <button type="button" onClick={() => save(chosen, true)} className={buttonClasses({ variant: "primary", className: "mt-3" })}>
          Listo
        </button>
      ) : null}
    </section>
  );
}
